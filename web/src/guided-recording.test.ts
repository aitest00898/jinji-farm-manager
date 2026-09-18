import { describe, expect, it } from "vitest";
import { buildGuidedRecord, guidedFields, scopeRequirements } from "./guided-recording";

describe("formal guided recording contract", () => {
  it("requires O4 house and flock scope", () => {
    expect(scopeRequirements("O4")).toEqual({ houseRequired: true, flockRequired: true, wholeFarmAllowed: false });
  });

  it("requires explicit whole-farm confirmation when house is omitted", () => {
    expect(() => buildGuidedRecord({
      area: "operational", taxonomyId: "O9", subtype: "mortality", date: "2026-09-19",
      scope: { farmId: "farm-1" }, values: { quantity: 2 },
    }, { id: "r1", clientOperationId: "op1" })).toThrow("GUIDED_WHOLE_FARM_CONFIRM_REQUIRED");
  });

  it("builds an O9 canonical record with bounded scope and identity", () => {
    const record = buildGuidedRecord({
      area: "operational", taxonomyId: "O9", subtype: "mortality", date: "2026-09-19",
      scope: { farmId: "farm-1", houseId: "house-1" }, values: { quantity: 2 },
    }, { id: "r1", clientOperationId: "op1", createdAt: "2026-09-19T01:00:00Z" });
    expect(record).toMatchObject({
      id: "r1", taxonomyId: "O9", family: "operational_event", type: "event", subtype: "mortality",
      farmId: "farm-1", houseId: "house-1", quantity: 2, sourceChannel: "web", clientOperationId: "op1",
    });
  });

  it("derives O1 total and O6 reminder while keeping conditional O6 fields bounded", () => {
    const o1 = buildGuidedRecord({
      area: "operational", taxonomyId: "O1", subtype: "chick_in", date: "2026-09-19",
      scope: { farmId: "f", houseId: "h", flockId: "k" },
      values: { maleCount: 400, femaleCount: 600, condition: "good" },
    }, { id: "o1", clientOperationId: "o1-op", createdAt: "2026-09-19T01:00:00Z" });
    expect(o1.totalCount).toBe(1000);

    expect(guidedFields("O6", { workflowStatus: "waiting_result" })).not.toContain("result");
    const o6 = buildGuidedRecord({
      area: "operational", taxonomyId: "O6", subtype: "lab_test", date: "2026-09-19",
      scope: { farmId: "f", houseId: "h" },
      values: { content: "血液", workflowStatus: "waiting_result" },
    }, { id: "o6", clientOperationId: "o6-op", createdAt: "2026-09-19T01:00:00Z" });
    expect(o6.reminderDueAt).toBe("2026-09-22T01:30:00.000Z");
  });
});
