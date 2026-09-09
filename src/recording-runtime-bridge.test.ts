import { describe, expect, it } from "vitest";
import { FarmResolver } from "./farm-resolver";
import {
  buildCanonicalRecordingDraft,
  canonicalCommandForLegacyOperational,
  canonicalRouteForText,
  persistenceRouteForCanonicalRecord,
  recordingAdapterMatrix,
  readLegacyAbnormalEvent,
  readLegacyOperationalAction,
  readLegacyOperationalEvent,
  validateRecordingLineage,
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
  it("bridges direct, Quick, Pending, and Ambient-confirm-compatible operational writes without relabelling consumption", () => {
    const command = canonicalCommandForLegacyOperational({
      id: "operational-line-1",
      intent: "mortality",
      quantity: 5,
      unit: "隻",
      farmId: "farm-test",
      houseId: "house-test",
      flockId: "flock-test",
      occurredAt: createdAt,
      createdAt,
      sourceChannel: "line",
      sourceMessageId: "line-message-1",
      rawText: "金雞測試場 測試一舍 死亡5",
      clientOperationId: "line-event-1",
      actorId: "line-user-1",
      confirmedBy: "line-operational",
    });
    expect(command).toMatchObject({
      kind: "record_command",
      taxonomyId: "O9",
      destination: "operational_events",
      sourceChannel: "line",
      clientOperationId: "line-event-1",
    });
    expect(command?.record).toMatchObject({ sourceMessageId: "line-message-1", quantity: 5 });
    expect(canonicalCommandForLegacyOperational({
      id: "legacy-feed-1",
      intent: "feed",
      quantity: 10,
      unit: "kg",
      farmId: "farm-test",
      occurredAt: createdAt,
      createdAt,
      sourceChannel: "line",
      rawText: "飼料10kg",
      clientOperationId: "line-feed-1",
    })).toBeNull();
  });

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

  it("publishes a complete 25-category adapter matrix without adding a second authority", () => {
    const matrix = recordingAdapterMatrix();
    expect(matrix).toHaveLength(25);
    expect(new Set(matrix.map((row) => row.taxonomyId)).size).toBe(25);
    expect(matrix.every((row) => row.requiredFields.length === row.commandFields.length && row.requiredFields.length === row.storageFields.length)).toBe(true);
    expect(matrix.find((row) => row.taxonomyId === "O3")).toMatchObject({ destination: "operational_events", readBridge: "readLegacyOperationalEvent", requiredFields: ["quantity", "sex"], storageFields: ["quantity", "sex"] });
    expect(matrix.find((row) => row.taxonomyId === "O1")).toMatchObject({ destination: "recording_events", readBridge: "canonical_recording_events" });
    expect(matrix.find((row) => row.taxonomyId === "O6")).toMatchObject({ destination: "operational_actions", readBridge: "readLegacyOperationalAction" });
    expect(matrix.find((row) => row.taxonomyId === "A16")).toMatchObject({ destination: "abnormal_events", readBridge: "readLegacyAbnormalEvent", requiredFields: ["extent"] });
    expect(matrix.every((row) => row.correctionBridge === "validateRecordingLineage")).toBe(true);
  });

  it("reads every A1-A16 abnormal taxonomy through the same strict bridge", () => {
    const rows = RECORDING_TAXONOMY.filter((definition) => definition.family === "operational_observation").map((definition) => ({
      id: "abnormal-" + definition.id,
      organization_id: "org-test",
      farm_id: "farm-test",
      occurred_at: createdAt,
      created_at: createdAt,
      occurred_date: "2026-09-08",
      reported_at: createdAt,
      raw_text: "synthetic " + definition.id,
      source: "web" as const,
      source_event_id: "source-abnormal-" + definition.id,
      taxonomy_id: definition.id,
      family: definition.family,
      canonical_type: definition.canonicalType,
      subtype: definition.canonicalSubtypes[0],
      extent: "small",
      linked_mortality_event_id: definition.id === "A1" ? "mortality-event-1" : null,
      detail: definition.id === "A12" && definition.canonicalSubtypes[0] === "other" ? "synthetic equipment detail" : null,
      evidence: null,
    }));
    const records = rows.map((row) => readLegacyAbnormalEvent(row));
    expect(records.map((record) => record.taxonomyId)).toEqual(RECORDING_TAXONOMY.filter((definition) => definition.family === "operational_observation").map((definition) => definition.id));
    expect(records.every((record) => record.family === "operational_observation")).toBe(true);
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

  it("reads a legacy shipment without sex as an explicit unspecified canonical shipment", () => {
    const row = readLegacyOperationalEvent({
      id: "legacy-shipment-without-sex",
      organization_id: "org-test",
      farm_id: "farm-test",
      line_group_id: "group-test",
      intent: "shipment",
      quantity: 10,
      unit: "隻",
      event_date: "2026-09-07",
      house_id: "house-test",
      flock_id: "flock-test",
      raw_message: "出雞10",
      source_event_id: "legacy-shipment-source-1",
      created_at: createdAt,
      total_weight: 18,
      average_weight: 1.8,
      weight_unit: "kg",
    });
    expect(row).toMatchObject({ taxonomyId: "O3", subtype: "shipment", sex: "unspecified", quantity: 10, totalWeight: 18, averageWeight: 1.8, weightUnit: "kg" });
  });

  it("covers every canonical operational action adapter and fails closed without canonical provenance", () => {
    const common = {
      organization_id: "org-test",
      farm_id: "farm-test",
      source_channel: "web" as const,
      raw_text: "synthetic action",
      client_operation_id: "client-action",
      created_at: createdAt,
      occurred_at: createdAt,
    };
    const rows = [
      { ...common, id: "action-o2", taxonomy_id: "O2" as const, subtype: "vaccination", content: "疫苗" },
      { ...common, id: "action-o5", taxonomy_id: "O5" as const, subtype: "feed_order", vendor: "飼料廠", weight: 100, weight_unit: "kg", client_operation_id: "client-action-o5" },
      { ...common, id: "action-o6", taxonomy_id: "O6" as const, subtype: "lab_test", content: "檢驗", submitted_at: createdAt, workflow_status: "waiting_result", client_operation_id: "client-action-o6" },
      { ...common, id: "action-o7", taxonomy_id: "O7" as const, subtype: "disinfection", workflow_status: "pending", client_operation_id: "client-action-o7" },
      { ...common, id: "action-o8", taxonomy_id: "O8" as const, subtype: "maintenance", maintenance_content: "水線", client_operation_id: "client-action-o8" },
    ];
    const records = rows.map((row) => readLegacyOperationalAction(row));
    expect(records.map((row) => row.taxonomyId)).toEqual(["O2", "O5", "O6", "O7", "O8"]);
    expect(records[1]).toMatchObject({ vendor: "飼料廠", weight: 100, weightUnit: "kg" });
    expect(records[2]).toMatchObject({ content: "檢驗", workflowStatus: "waiting_result" });
    expect(records[4]).toMatchObject({ maintenanceContent: "水線" });
    expect(() => readLegacyOperationalAction({ ...common, id: "action-missing-taxonomy", taxonomy_id: null, client_operation_id: "client-missing-taxonomy" })).toThrow("LEGACY_OPERATIONAL_ACTION_NOT_CANONICAL");
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

  it("rejects self, cross-organization, cross-family, and future lineage references", () => {
    const oldEvent = { id: "old-event", organizationId: "org-test", family: "operational_event", createdAt: "2026-09-07T01:00:00.000Z" };
    const input = { id: "new-event", organizationId: "org-test", family: "operational_event", createdAt: createdAt };
    expect(() => validateRecordingLineage({ ...input, correctionOfId: "new-event" }, [oldEvent])).toThrow("RECORDING_LINEAGE_SELF_REFERENCE");
    expect(() => validateRecordingLineage({ ...input, reversalOfId: "other-org" }, [{ ...oldEvent, id: "other-org", organizationId: "org-other" }])).toThrow("RECORDING_LINEAGE_ORGANIZATION_MISMATCH");
    expect(() => validateRecordingLineage({ ...input, replacementOfId: "abnormal" }, [{ ...oldEvent, id: "abnormal", family: "operational_observation" }])).toThrow("RECORDING_LINEAGE_FAMILY_MISMATCH");
    expect(() => validateRecordingLineage({ ...input, correctionOfId: "future-event" }, [{ ...oldEvent, id: "future-event", createdAt: "2026-09-09T01:00:00.000Z" }])).toThrow("RECORDING_LINEAGE_ORDER_INVALID");
    expect(() => validateRecordingLineage({ ...input, correctionOfId: "missing" }, [])).toThrow("RECORDING_LINEAGE_REFERENCE_NOT_FOUND");
  });
});
