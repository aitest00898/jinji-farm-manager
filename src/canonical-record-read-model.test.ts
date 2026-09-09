import { describe, expect, it } from "vitest";
import { projectCanonicalRecordViews } from "./canonical-record-read-model";
import { RECORDING_TAXONOMY, taxonomyDefinitionFor } from "./recording-taxonomy";

type TestRow = Record<string, unknown> & {
  id: string;
  organization_id: string;
  farm_id: string;
  environment: "test";
};

function base(id: string, index: number): TestRow {
  return {
    id,
    organization_id: "org-read-model",
    farm_id: "farm-read-model",
    environment: "test",
    farmName: "讀模型測試場",
    house_id: "house-read-model",
    houseName: "讀模型測試舍",
    flock_id: "flock-read-model",
    flockCode: "READ-001",
    created_at: `2026-09-09T01:${String(index).padStart(2, "0")}:00.000Z`,
    occurred_at: "2026-09-09T09:30:00+08:00",
    source_channel: "web",
    raw_text: `[read-model] ${id}`,
  };
}

function rowFor(taxonomyId: string, index: number): TestRow {
  const definition = taxonomyDefinitionFor(taxonomyId as never);
  const record = base(`read-${taxonomyId}`, index);
  record.taxonomy_id = taxonomyId;
  record.family = definition.family;
  record.canonical_type = definition.canonicalType;
  record.subtype = definition.canonicalSubtypes[0];
  record.client_operation_id = `read-client-${taxonomyId}`;
  if (taxonomyId === "O1") Object.assign(record, { male_count: 6, female_count: 4, total_count: 10, condition: "good" });
  if (taxonomyId === "O4") Object.assign(record, { average_weight: 1.8, sex: "mixed", chick_in_date: "2026-08-01", age_days: 39, weight_unit: "kg" });
  if (["O2", "O5", "O6", "O7", "O8"].includes(taxonomyId)) {
    if (taxonomyId === "O2") Object.assign(record, { content: "read medication" });
    if (taxonomyId === "O5") Object.assign(record, { vendor: "read vendor", weight: 10, weight_unit: "kg" });
    if (taxonomyId === "O6") Object.assign(record, { submitted_at: "2026-09-09T09:30:00+08:00", content: "read lab", workflow_status: "waiting_result" });
    if (taxonomyId === "O7") Object.assign(record, { workflow_status: "pending" });
    if (taxonomyId === "O8") Object.assign(record, { maintenance_content: "read maintenance" });
    record.source_message_id = `source-${taxonomyId}`;
    record.lifecycle_status = "active";
  }
  if (["O3", "O9"].includes(taxonomyId)) {
    record.intent = taxonomyId === "O3" ? "shipment" : "mortality";
    record.quantity = 2;
    record.unit = "隻";
    record.event_date = "2026-09-09";
    record.raw_message = `[read-model] ${taxonomyId}`;
    record.source_event_id = `read-client-${taxonomyId}`;
    record.sex = taxonomyId === "O3" ? "mixed" : null;
    if (taxonomyId === "O3") Object.assign(record, { total_weight: 4, average_weight: 2, weight_unit: "kg" });
  }
  if (taxonomyId.startsWith("A")) {
    record.source = "web";
    record.source_event_id = `read-client-${taxonomyId}`;
    record.occurred_date = "2026-09-09";
    record.reported_at = "2026-09-09T09:30:00+08:00";
    record.status = "active";
    record.extent = "small";
    if (taxonomyId === "A1") record.linked_mortality_event_id = "read-O9";
    if (taxonomyId === "A12") {
      record.subtype = "other";
      record.detail = "read equipment detail";
    }
  }
  return record;
}

function rowsForAllTaxonomy() {
  const result = {
    recordingEvents: [] as TestRow[],
    operationalActions: [] as TestRow[],
    operationalEvents: [] as TestRow[],
    abnormalEvents: [] as TestRow[],
  };
  RECORDING_TAXONOMY.forEach((definition, index) => {
    const row = rowFor(definition.id, index + 1);
    if (definition.id === "O1" || definition.id === "O4") result.recordingEvents.push(row);
    else if (["O2", "O5", "O6", "O7", "O8"].includes(definition.id)) result.operationalActions.push(row);
    else if (definition.id === "O3" || definition.id === "O9") result.operationalEvents.push(row);
    else result.abnormalEvents.push(row);
  });
  return result;
}

describe("canonical record read model", () => {
  it("projects all 25 taxonomy categories through their authoritative destinations", () => {
    const records = projectCanonicalRecordViews(rowsForAllTaxonomy());
    expect(records).toHaveLength(25);
    expect(new Set(records.map((record) => record.taxonomyId)).size).toBe(25);
    expect(records.every((record) => record.readStatus === "valid" && record.record && record.correctionSafe)).toBe(true);
    expect(records.filter((record) => record.destination === "recording_events")).toHaveLength(2);
    expect(records.filter((record) => record.destination === "operational_actions")).toHaveLength(5);
    expect(records.filter((record) => record.destination === "operational_events")).toHaveLength(2);
    expect(records.filter((record) => record.destination === "abnormal_events")).toHaveLength(16);
  });

  it("projects source-backed derived fields and never invents an unsafe correction seed", () => {
    const rows = rowsForAllTaxonomy();
    const o4 = rows.recordingEvents.find((row) => row.taxonomy_id === "O4")!;
    expect(projectCanonicalRecordViews({ recordingEvents: [o4] })[0].derivedFields).toMatchObject({ ageDays: 39 });
    const incomplete = { ...o4, average_weight: null };
    const unsafe = projectCanonicalRecordViews({ recordingEvents: [incomplete] })[0];
    expect(unsafe.readStatus).toBe("unsafe");
    expect(unsafe.correctionSafe).toBe(false);
    expect(unsafe.correctionSeed).toBeNull();
  });

  it("derives parent effective status from append-only children without changing either row", () => {
    const original = rowFor("O3", 1);
    const correction = {
      ...rowFor("O3", 2),
      id: "read-O3-correction",
      created_at: "2026-09-09T02:00:00.000Z",
      source_event_id: "read-client-O3-correction",
      correction_of_event_id: "read-O3",
      quantity: 3,
      total_weight: 6,
      average_weight: 2,
    };
    const records = projectCanonicalRecordViews({ operationalEvents: [original, correction] });
    const parent = records.find((record) => record.id === "read-O3")!;
    const child = records.find((record) => record.id === "read-O3-correction")!;
    expect(parent.effectiveStatus).toBe("corrected");
    expect(parent.isEffective).toBe(false);
    expect(parent.lineage.correctedById).toBe("read-O3-correction");
    expect(child.effectiveStatus).toBe("replacement");
    expect(child.isEffective).toBe(true);
    expect(child.record?.quantity).toBe(3);
    expect(parent.record?.quantity).toBe(2);
  });
});
