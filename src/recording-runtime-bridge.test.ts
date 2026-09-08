import { describe, expect, it } from "vitest";
import { FarmResolver } from "./farm-resolver";
import {
  buildCanonicalRecordingDraft,
  canonicalRouteForText,
  persistenceRouteForCanonicalRecord,
  readLegacyAbnormalEvent,
  readLegacyOperationalEvent,
  type RecordingIdentity,
  type ResolvedRecordingScope,
} from "./recording-runtime-bridge";
import {
  RECORDING_TAXONOMY,
  parseCanonicalRecordingText,
  type RecordingDraft,
} from "./recording-taxonomy";

const createdAt = "2026-09-08T01:00:00.000Z";
const directScope: ResolvedRecordingScope = {
  kind: "direct",
  farmId: "farm-test",
  houseId: "house-test",
  flockId: "flock-test",
};

function identity(rawText: string, suffix = "1"): RecordingIdentity {
  return {
    id: "record-" + suffix,
    sourceChannel: "web",
    rawText,
    occurredAt: createdAt,
    createdAt,
    clientOperationId: "client-" + suffix,
  };
}

function representativeRecord(id: string): RecordingDraft {
  const definition = RECORDING_TAXONOMY.find((item) => item.id === id);
  if (!definition) throw new Error("missing definition");
  const subtype = id === "A12" ? "other" : definition.canonicalSubtypes[0];
  const record: RecordingDraft = {
    id: "representative-" + id,
    taxonomyId: id,
    family: definition.family,
    type: definition.canonicalType,
    subtype,
    occurredAt: createdAt,
    createdAt,
    farmId: "farm-test",
    sourceChannel: "web",
    rawText: "synthetic " + id,
    clientOperationId: "client-representative-" + id,
  };
  if (id === "O1") Object.assign(record, {
    houseId: "house-test", flockId: "flock-test", maleCount: 600, femaleCount: 400,
    totalCount: 1000, condition: "good",
  });
  if (id === "O2") record.content = "synthetic action";
  if (id === "O3") Object.assign(record, { quantity: 100, sex: "male" });
  if (id === "O4") Object.assign(record, { houseId: "house-test", flockId: "flock-test", averageWeight: 1.8, sex: "mixed" });
  if (id === "O5") Object.assign(record, { vendor: "synthetic vendor", weight: 100, weightUnit: "kg" });
  if (id === "O6") Object.assign(record, { submittedAt: createdAt, content: "synthetic lab", workflowStatus: "waiting_result" });
  if (id === "O7") record.workflowStatus = "pending";
  if (id === "O8") record.maintenanceContent = "synthetic maintenance";
  if (id === "O9") record.quantity = 5;
  if (definition.family === "operational_observation") Object.assign(record, { extent: "small" });
  if (id === "A1") record.linkedMortalityEventId = "mortality-event-1";
  if (id === "A12") record.detail = "synthetic equipment detail";
  if (id === "A16") record.evidence = "synthetic evidence";
  return record;
}

describe("recording runtime bridge", () => {
  it("routes a resolved mortality record to the existing sole authority", () => {
    const result = canonicalRouteForText(
      "金雞測試場 測試一舍 批次A 死亡5",
      directScope,
      identity("金雞測試場 測試一舍 批次A 死亡5"),
    );
    expect(result.parsed.recordWorthiness).toBe("record");
    expect(result.draft).toMatchObject({ taxonomyId: "O9", subtype: "mortality", farmId: "farm-test", houseId: "house-test", flockId: "flock-test", quantity: 5 });
    expect(result.route).toMatchObject({
      taxonomyId: "O9",
      destination: "operational_events",
      legacyIntent: "mortality",
      authoritative: true,
      stockEffect: -1,
      requiresHumanConfirmation: true,
    });
    expect(result.route.parallelAuthoritativeDestinations).toEqual([]);
  });

  it("keeps occurredAt semantics separate from createdAt", () => {
    const rawText = "昨天 金雞測試場 測試一舍 批次A 死亡5";
    const result = canonicalRouteForText(rawText, directScope, identity(rawText, "yesterday"));
    expect(result.draft.occurredAt).toBe("2026-09-07T00:00:00+08:00");
    expect(result.draft.createdAt).toBe(createdAt);
  });

  it("requires explicit whole-farm confirmation and rejects silent scope enrichment", () => {
    const farmOnly = parseCanonicalRecordingText("金雞測試場 死亡5", new Date(createdAt));
    expect(() => buildCanonicalRecordingDraft(farmOnly, { kind: "direct", farmId: "farm-test" }, identity("金雞測試場 死亡5", "farm-only"))).toThrow("RECORDING_WHOLE_FARM_CONFIRMATION_REQUIRED");
    const confirmed = buildCanonicalRecordingDraft(
      farmOnly,
      { kind: "direct", farmId: "farm-test", wholeFarmConfirmed: true },
      identity("金雞測試場 死亡5", "farm-confirmed"),
    );
    expect(confirmed.houseId).toBeUndefined();
    expect(confirmed.flockId).toBeUndefined();
    const withHouse = parseCanonicalRecordingText("金雞測試場 測試一舍 死亡5", new Date(createdAt));
    expect(() => buildCanonicalRecordingDraft(withHouse, { kind: "direct", farmId: "farm-test" }, identity("金雞測試場 測試一舍 死亡5", "missing-house"))).toThrow("RECORDING_HOUSE_UNRESOLVED");
    const withFlock = parseCanonicalRecordingText("金雞測試場 測試一舍 批次A 死亡5", new Date(createdAt));
    expect(() => buildCanonicalRecordingDraft(withFlock, { ...directScope, flockId: undefined }, identity("金雞測試場 測試一舍 批次A 死亡5", "missing-flock"))).toThrow("RECORDING_FLOCK_UNRESOLVED");
    expect(() => buildCanonicalRecordingDraft(farmOnly, { ...directScope }, identity("金雞測試場 死亡5", "silent-house"))).toThrow("RECORDING_HOUSE_SCOPE_NOT_EXPLICIT");
  });

  it("does not turn ambiguous or unknown farm resolution into a write-ready scope", () => {
    const resolver = new FarmResolver([
      { id: "farm-1", name: "金雞測試場", active: 1 },
      { id: "farm-2", name: "金雞測試場", active: 1 },
    ]);
    expect(resolver.resolve("金雞測試場").kind).toBe("candidates");
    const parsed = parseCanonicalRecordingText("金雞測試場 測試一舍 死亡5", new Date(createdAt));
    expect(() => buildCanonicalRecordingDraft(parsed, { kind: "candidates", farmId: "farm-1", houseId: "house-test", flockId: "flock-test" }, identity(parsed.fields.rawText as string || "unknown", "ambiguous"))).toThrow("RECORDING_SCOPE_UNRESOLVED");
  });

  it("routes every O1-O9 and A1-A16 exactly once", () => {
    for (const definition of RECORDING_TAXONOMY) {
      const route = persistenceRouteForCanonicalRecord(representativeRecord(definition.id));
      expect(route.authoritative).toBe(true);
      expect(route.parallelAuthoritativeDestinations).toEqual([]);
      expect(route.taxonomyId).toBe(definition.id);
      expect(route.destination).toBe(
        definition.id === "O1" || definition.id === "O4"
          ? "recording_events"
          : ["O2", "O5", "O6", "O7", "O8"].includes(definition.id)
            ? "operational_actions"
            : ["O3", "O9"].includes(definition.id)
              ? "operational_events"
              : "abnormal_events",
      );
    }
  });

  it("reads historical operational mortality rows without rewriting them", () => {
    const row = readLegacyOperationalEvent({
      id: "legacy-mortality-1",
      organization_id: "org-test",
      farm_id: "farm-test",
      line_group_id: "group-test",
      intent: "mortality",
      quantity: 5,
      unit: "隻",
      event_date: "2026-09-07",
      house_id: "house-test",
      flock_id: "flock-test",
      raw_message: "金雞測試場 測試一舍 死亡5",
      source_event_id: "line-event-1",
      created_at: createdAt,
      reversed_at: "2026-09-08T02:00:00.000Z",
    });
    expect(row).toMatchObject({ taxonomyId: "O9", subtype: "mortality", occurredAt: "2026-09-07T00:00:00+08:00", lifecycleStatus: "reversed", quantity: 5 });
  });

  it("reads only explicitly canonical abnormal rows and fails closed otherwise", () => {
    const row = readLegacyAbnormalEvent({
      id: "legacy-abnormal-1",
      organization_id: "org-test",
      farm_id: "farm-test",
      house_id: "house-test",
      flock_id: "flock-test",
      occurred_date: "2026-09-07",
      reported_at: createdAt,
      raw_text: "金雞測試場 測試一舍 咳嗽",
      source: "line",
      source_event_id: "legacy-abnormal-event-1",
      created_at: createdAt,
      taxonomy_id: "A2",
      family: "operational_observation",
      canonical_type: "observation",
      subtype: "cough",
      extent: "small",
      status: "active",
    });
    expect(row).toMatchObject({ taxonomyId: "A2", subtype: "cough", occurredAt: "2026-09-07T00:00:00+08:00", lifecycleStatus: "active" });
    expect(() => readLegacyAbnormalEvent({
      id: "legacy-abnormal-unknown",
      organization_id: "org-test",
      farm_id: "farm-test",
      occurred_date: "2026-09-07",
      reported_at: createdAt,
      raw_text: "自由文字異常",
      source: "line",
      source_event_id: "legacy-abnormal-event-unknown",
      created_at: createdAt,
    })).toThrow("LEGACY_ABNORMAL_EVENT_NOT_CANONICAL");
  });
});
