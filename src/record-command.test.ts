import { describe, expect, it } from "vitest";
import { createRecordCommand } from "./record-command";
import { RECORDING_TAXONOMY, type RecordingDraft } from "./recording-taxonomy";

const createdAt = "2026-09-08T01:00:00.000Z";

function canonical(taxonomyId: string, overrides: Partial<RecordingDraft> = {}): RecordingDraft {
  const definition = RECORDING_TAXONOMY.find((item) => item.id === taxonomyId);
  if (!definition) throw new Error("TEST_TAXONOMY_NOT_FOUND");
  const record: RecordingDraft = {
    id: `record-${taxonomyId}`,
    taxonomyId,
    family: definition.family,
    type: definition.canonicalType,
    subtype: taxonomyId === "A12" ? "other" : definition.canonicalSubtypes[0],
    occurredAt: createdAt,
    createdAt,
    farmId: "farm-test",
    sourceChannel: "web",
    rawText: `synthetic ${taxonomyId}`,
    clientOperationId: `client-${taxonomyId}`,
    ...overrides,
  };
  if (taxonomyId === "O1") Object.assign(record, { houseId: "house-test", flockId: "flock-test", maleCount: 600, femaleCount: 400, totalCount: 1000, condition: "good" });
  if (taxonomyId === "O2") record.content = "vaccination";
  if (taxonomyId === "O3") Object.assign(record, { quantity: 100, sex: "male" });
  if (taxonomyId === "O4") Object.assign(record, { houseId: "house-test", flockId: "flock-test", averageWeight: 1.8, sex: "mixed" });
  if (taxonomyId === "O5") Object.assign(record, { vendor: "vendor-test", weight: 10, weightUnit: "kg" });
  if (taxonomyId === "O6") Object.assign(record, { submittedAt: createdAt, content: "lab test", workflowStatus: "waiting_result" });
  if (taxonomyId === "O7") record.workflowStatus = "pending";
  if (taxonomyId === "O8") record.maintenanceContent = "fan maintenance";
  if (taxonomyId === "O9") record.quantity = 5;
  if (definition.family === "operational_observation") Object.assign(record, { extent: "small" });
  if (taxonomyId === "A1") record.linkedMortalityEventId = "mortality-event";
  if (taxonomyId === "A12") record.detail = "other equipment detail";
  if (taxonomyId === "A16") record.evidence = "synthetic evidence";
  return record;
}

describe("RecordCommand", () => {
  it("normalizes every canonical taxonomy row to one authoritative destination", () => {
    const destinations = new Map<string, string>();
    for (const definition of RECORDING_TAXONOMY) {
      const command = createRecordCommand(canonical(definition.id));
      destinations.set(definition.id, command.destination);
      expect(command.kind).toBe("record_command");
      expect(command.authoritativeDestination).toBe(command.destination);
      expect(command.parallelAuthoritativeDestinations).toEqual([]);
    }
    expect(destinations.get("O1")).toBe("recording_events");
    expect(destinations.get("O4")).toBe("recording_events");
    expect(destinations.get("O2")).toBe("operational_actions");
    expect(destinations.get("O8")).toBe("operational_actions");
    expect(destinations.get("O3")).toBe("operational_events");
    expect(destinations.get("O9")).toBe("operational_events");
    expect(destinations.get("A1")).toBe("abnormal_events");
    expect(destinations.get("A16")).toBe("abnormal_events");
  });

  it("accepts Web, Quick Record-compatible, LINE and Ambient/Pending-shaped canonical records", () => {
    const web = createRecordCommand(canonical("O9", { sourceChannel: "web" }));
    const quick = createRecordCommand(canonical("O9", { sourceChannel: "web", rawText: "死亡5" }));
    const line = createRecordCommand(canonical("O9", { sourceChannel: "line", sourceMessageId: "line-message-1" }));
    const ambient = createRecordCommand(canonical("O2", { sourceChannel: "ambient", sourceCandidateId: "candidate-1", confirmedBy: "admin-1" }));
    const pending = createRecordCommand(canonical("A2", { sourceChannel: "line", sourceCandidateId: "pending-1", confirmedBy: "admin-1" }));
    expect([web, quick, line, ambient, pending].map((item) => item.kind)).toEqual([
      "record_command", "record_command", "record_command", "record_command", "record_command",
    ]);
    expect(ambient.destination).toBe("operational_actions");
    expect(pending.destination).toBe("abnormal_events");
  });

  it("preserves strict taxonomy validation and never creates a parallel authority", () => {
    expect(() => createRecordCommand({ ...canonical("O9"), quantity: 0 })).toThrow("RECORDING_NUMBER_INVALID:quantity");
    expect(() => createRecordCommand({ ...canonical("A2"), quantity: 1 })).toThrow("OBSERVATION_QUANTITY_FORBIDDEN:quantity");
  });
});
