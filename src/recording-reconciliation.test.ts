import { describe, expect, it } from "vitest";
import { createRecordCommand } from "./record-command";
import { reconcileRecordCommand } from "./recording-reconciliation";
import { type RecordingDraft } from "./recording-taxonomy";

const base: RecordingDraft = {
  id: "web-record-1",
  taxonomyId: "O9",
  family: "operational_event",
  type: "event",
  subtype: "mortality",
  occurredAt: "2026-09-08T01:00:00.000Z",
  createdAt: "2026-09-08T01:01:00.000Z",
  farmId: "farm-test",
  houseId: "house-test",
  flockId: "flock-test",
  sourceChannel: "web",
  rawText: "死亡5",
  clientOperationId: "web-op-1",
  quantity: 5,
};

function record(patch: Partial<RecordingDraft> = {}): RecordingDraft {
  recordSequence += 1;
  return { ...base, id: `record-${recordSequence}`, clientOperationId: `client-${recordSequence}`, ...patch };
}

let recordSequence = 0;

function reconcile(incoming: RecordingDraft, existing: RecordingDraft[]) {
  return reconcileRecordCommand(createRecordCommand(incoming), existing.map(createRecordCommand));
}

describe("recording reconciliation", () => {
  it("treats exact idempotency/source repeats as already recorded", () => {
    expect(reconcile(base, [base]).state).toBe("ALREADY_RECORDED");
    expect(reconcile(record({ sourceMessageId: "line-event-1" }), [record({ sourceMessageId: "line-event-1" })]).state).toBe("ALREADY_RECORDED");
  });

  it("does not dedupe semantic matches from different clients", () => {
    const web = record({ id: "web-record", clientOperationId: "web-client", sourceChannel: "web" });
    const line = record({ id: "line-record", clientOperationId: "line-client", sourceChannel: "line", rawText: "雞場死亡 5 隻" });
    expect(reconcile(line, [web])).toMatchObject({ state: "POSSIBLY_RECORDED", semanticMatch: true });
  });

  it("keeps later, different-context and different-house records independent", () => {
    const existing = record({ id: "existing" });
    expect(reconcile(record({ occurredAt: "2026-09-09T01:00:00.000Z" }), [existing]).state).toBe("NEW_INDEPENDENT_EVENT");
    expect(reconcile(record({ houseId: "house-other", flockId: "flock-other" }), [existing]).state).toBe("NEW_INDEPENDENT_EVENT");
    expect(reconcile(record({ houseId: undefined, flockId: undefined }), [record({ id: "farm-only" , houseId: undefined, flockId: undefined })]).state).toBe("POSSIBLY_RECORDED");
  });

  it("recognizes explicit correction without destructive update", () => {
    const existing = record({ id: "existing" });
    const correction = record({ id: "correction", correctionOfId: "existing", quantity: 4 });
    expect(reconcile(correction, [existing])).toMatchObject({ state: "CORRECTION_OF_EXISTING", matchedCommandIds: ["existing"] });
  });

  it("recognizes Ambient candidate matching as possible, not an automatic suppression", () => {
    const existing = record({ id: "web-record", sourceChannel: "web" });
    const ambient = record({ id: "ambient-record", sourceChannel: "ambient", sourceCandidateId: "ambient-candidate-1" });
    expect(reconcile(ambient, [existing]).state).toBe("POSSIBLY_RECORDED");
  });
});
