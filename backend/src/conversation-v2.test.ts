import { describe, expect, it } from "vitest";
import {
  chooseSafeConversationV2Plan,
  CONVERSATION_V2_TOOL_ALLOWLIST,
  classifyConversationSpeechAct,
  parseConversationV2Plan,
  routeConversationV2Deterministic,
  type ConversationV2Context,
} from "./conversation-v2";

function context(overrides: Partial<ConversationV2Context> = {}): ConversationV2Context {
  return {
    openCandidateCount: 1,
    hasCurrentCandidate: true,
    currentCandidateId: "candidate-test-1",
    currentCandidateFarm: "金雞測試場",
    currentCandidateEnvironment: "test",
    currentCandidateState: "conflict",
    currentCandidateBlockingField: "confirmation",
    lastGoal: null,
    lastTopic: null,
    lastResponseType: null,
    lastExplainedIssue: null,
    ...overrides,
  };
}

describe("Conversation Orchestrator V2 goal routing", () => {
  it("treats an open Candidate as context rather than a modal repair lock", () => {
    expect(routeConversationV2Deterministic("什麼衝突", context()).goal).toBe("EXPLAIN");
    expect(routeConversationV2Deterministic("目前知道哪些資料", context()).goal).toBe("SHOW_STATE");
    expect(routeConversationV2Deterministic("如果不想記這筆可以怎麼辦", context()).goal).toBe("ADVISE");
  });

  it("keeps follow-up questions on the previous topic", () => {
    const first = context({ lastTopic: "caretaker_conflict", lastGoal: "EXPLAIN" });
    expect(routeConversationV2Deterministic("什麼衝突", first).topic).toBe("caretaker_conflict");
    expect(routeConversationV2Deterministic("現在呢", first)).toMatchObject({ goal: "EXPLAIN", topic: "caretaker_conflict" });
    expect(routeConversationV2Deterministic("那不要管那個", first)).toMatchObject({
      goal: "REPAIR",
      proposedAction: { type: "dismiss_clue", field: "caretaker" },
    });
  });

  it("keeps distinct read and advice goals after an inbox query", () => {
    const afterInboxQuery = context({ lastGoal: "QUERY", lastTopic: "open_candidates" });
    expect(routeConversationV2Deterministic("你目前知道這筆什麼", afterInboxQuery)).toMatchObject({
      goal: "SHOW_STATE",
      topic: "candidate_state",
    });
    expect(routeConversationV2Deterministic("哪裡怪怪的", afterInboxQuery)).toMatchObject({
      goal: "EXPLAIN",
      topic: "candidate_conflict",
    });
    expect(routeConversationV2Deterministic("那這會影響死亡紀錄嗎", afterInboxQuery)).toMatchObject({
      goal: "EXPLAIN",
      topic: "candidate_consequence",
    });
    expect(routeConversationV2Deterministic("如果我不想處理它，有哪些選擇", afterInboxQuery)).toMatchObject({
      goal: "ADVISE",
      topic: "candidate_cancel",
    });
    expect(routeConversationV2Deterministic("那取消的話會怎樣", afterInboxQuery)).toMatchObject({
      goal: "EXPLAIN",
      topic: "candidate_consequence",
    });
  });

  it("separates advice from an explicit cancellation action", () => {
    expect(routeConversationV2Deterministic("可以取消這筆嗎", context()).goal).toBe("ADVISE");
    expect(routeConversationV2Deterministic("那就不要記了", context())).toMatchObject({
      goal: "CANCEL",
      proposedAction: { type: "cancel_candidate" },
    });
  });

  it("routes read queries without requiring a Candidate", () => {
    const noCandidate = context({ openCandidateCount: 0, hasCurrentCandidate: false, currentCandidateId: null });
    expect(routeConversationV2Deterministic("目前有幾筆待確認", noCandidate)).toMatchObject({ goal: "QUERY", target: "open_candidates" });
    expect(routeConversationV2Deterministic("林志騰目前對應哪些雞場", noCandidate)).toMatchObject({ goal: "QUERY", target: "caretaker_farms" });
    expect(routeConversationV2Deterministic("金雞測試場有沒有飼養者", noCandidate)).toMatchObject({ goal: "QUERY", target: "farm_caretakers" });
  });

  it("creates validated Candidate repair plans for concrete edits", () => {
    expect(routeConversationV2Deterministic("改成金雞測試場", context())).toMatchObject({
      goal: "REPAIR",
      proposedAction: { type: "set_field", field: "farm", value: "金雞測試場" },
    });
    expect(routeConversationV2Deterministic("死亡不是2，是3", context())).toMatchObject({
      goal: "REPAIR",
      proposedAction: { type: "set_field", field: "quantity", value: "3" },
    });
    expect(routeConversationV2Deterministic("這筆不對", context())).toMatchObject({ goal: "REPAIR", needsClarification: true });
  });

  it("recognizes compare, analyze, help, and safe clarification goals", () => {
    expect(routeConversationV2Deterministic("這兩筆有什麼差異", context()).goal).toBe("COMPARE");
    expect(routeConversationV2Deterministic("請分析這筆", context()).goal).toBe("ANALYZE");
    expect(routeConversationV2Deterministic("可以怎麼用", context()).goal).toBe("HELP");
    expect(routeConversationV2Deterministic("幫我處理一下", context()).goal).toBe("CLARIFY");
  });

  it.each([
    "你現在能幫我做什麼？",
    "可以幫忙查哪些資料？",
    "你會分析哪些事情？",
    "請說明你可以協助我查詢或分析什麼，不要修改資料。",
  ])("routes capability questions to V2 HELP rather than QUERY unknown: %s", (text) => {
    const noCandidate = context({ openCandidateCount: 0, hasCurrentCandidate: false, currentCandidateId: null });
    expect(classifyConversationSpeechAct(text, noCandidate).recommendedGoal).toBe("HELP");
    expect(routeConversationV2Deterministic(text, noCandidate).goal).toBe("HELP");
  });
});

describe("Conversation V2 plan safety", () => {
  it("rejects unknown tools and read plans that carry mutations", () => {
    expect(parseConversationV2Plan(JSON.stringify({
      goal: "EXPLAIN",
      target: "candidate",
      topic: "candidate_conflict",
      requestedTools: ["raw_sql"],
      proposedAction: null,
      needsClarification: false,
      confidence: 0.9,
    }))).toBeNull();
    expect(parseConversationV2Plan(JSON.stringify({
      goal: "SHOW_STATE",
      target: "candidate",
      topic: "candidate_state",
      requestedTools: ["get_candidate_details"],
      proposedAction: { type: "set_field", field: "farm", value: "金雞測試場" },
      needsClarification: false,
      confidence: 0.9,
    }))).toBeNull();
  });

  it("allows only candidate-level actions and no official tools", () => {
    expect(CONVERSATION_V2_TOOL_ALLOWLIST.official).toEqual([]);
    const plan = parseConversationV2Plan(JSON.stringify({
      goal: "REPAIR",
      target: "candidate",
      topic: "candidate_farm",
      requestedTools: ["set_candidate_field"],
      proposedAction: { type: "set_field", field: "farm", value: "金雞測試場" },
      needsClarification: false,
      confidence: 0.95,
    }));
    expect(plan).not.toBeNull();
    expect(plan?.proposedAction?.type).toBe("set_field");
  });

  it("protects deterministic read and advice decisions from model hijacking", () => {
    const deterministic = routeConversationV2Deterministic("如果不想記這筆可以怎麼辦", context());
    const modelRepair = routeConversationV2Deterministic("改成金雞測試場", context());
    expect(chooseSafeConversationV2Plan(deterministic, modelRepair).goal).toBe("ADVISE");

    const deterministicExplain = routeConversationV2Deterministic("什麼衝突", context());
    expect(chooseSafeConversationV2Plan(deterministicExplain, modelRepair).goal).toBe("EXPLAIN");
    const deterministicState = routeConversationV2Deterministic("你目前知道這筆什麼", context({ lastTopic: "open_candidates" }));
    expect(chooseSafeConversationV2Plan(deterministicState, deterministicExplain).goal).toBe("SHOW_STATE");
    const deterministicQuery = routeConversationV2Deterministic("目前有幾筆待確認", context({ lastTopic: "open_candidates" }));
    expect(chooseSafeConversationV2Plan(deterministicQuery, deterministicExplain).goal).toBe("QUERY");
  });
});
