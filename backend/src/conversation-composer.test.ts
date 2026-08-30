import { describe, expect, it } from "vitest";
import { composeGroundedCandidateResponse } from "./conversation-composer";
import type { AmbientCandidate } from "./ambient";

const candidate: AmbientCandidate = {
  farmText: "金雞測試場",
  houseText: "測試1舍",
  flockText: "TEST-BATCH-001",
  caretakerText: null,
  caretakerClues: ["林志騰"],
  eventType: "mortality",
  quantity: 2,
  quantityConfidence: "high",
  items: [{ type: "mortality", quantity: 2, raw: "死亡2", confidence: "high" }],
  conflict: true,
  conflictText: "飼養者線索有不同說法",
  evidence: [{
    evidenceType: "caretaker_clue",
    field: "caretaker",
    normalizedValue: "林志騰",
    sourceRef: "message-1",
    confidence: "medium",
    extractionSource: "deterministic",
  }],
  conflictEvidence: [{
    type: "caretaker_farm_mismatch",
    evidenceRefs: ["message-1"],
    facts: { caretakerClues: ["林志騰"], selectedFarm: "金雞測試場" },
    dbFacts: { activeCaretakerAssignment: false, assignedFarms: [] },
    businessRule: { caretakerRequiredForMortality: false },
    blocking: false,
    overrideAllowed: true,
    resolutionStatus: "explicit_user_choice_wins",
  }],
};

describe("grounded natural response composer", () => {
  it("explains evidence, rule, and consequence instead of repeating a label", () => {
    const text = composeGroundedCandidateResponse({ goal: "EXPLAIN", topic: "caretaker_conflict", candidate });
    expect(text).toContain("林志騰");
    expect(text).toContain("金雞測試場");
    expect(text).toContain("不是死亡正式紀錄的必要欄位");
    expect(text).toContain("不會阻止死亡紀錄");
    expect(text).not.toContain("Candidate");
  });

  it("keeps show-state and advice distinct and non-mutating", () => {
    const state = composeGroundedCandidateResponse({ goal: "SHOW_STATE", topic: "candidate_state", candidate });
    const advice = composeGroundedCandidateResponse({ goal: "ADVISE", topic: "candidate_cancel", candidate });
    expect(state).toContain("目前這筆我知道");
    expect(advice).toContain("取消");
    expect(advice).toContain("目前沒有替你取消");
    expect(state).not.toBe(advice);
  });

  it("does not re-ask a farm already resolved by an explicit choice", () => {
    const text = composeGroundedCandidateResponse({
      goal: "SHOW_STATE",
      topic: "candidate_state",
      candidate: {
        ...candidate,
        resolution: {
          status: "unresolved",
          resolvedFarmId: "farm-test",
          resolvedHouseId: "house-test",
          resolvedFlockId: null,
        },
        uncertainties: ["flock_not_resolved"],
      },
    });
    expect(text).toContain("目前還需要：批次");
    expect(text).not.toContain("目前還需要：雞場");
  });

  it("admits legacy evidence gaps instead of inventing caretaker names", () => {
    const legacy = { ...candidate, caretakerText: null, caretakerClues: undefined, evidence: undefined, conflictEvidence: undefined };
    const text = composeGroundedCandidateResponse({ goal: "EXPLAIN", topic: "candidate_conflict", candidate: legacy });
    expect(text).toContain("沒有足夠的原始證據");
    expect(text).not.toContain("林志騰");
  });
});
