import { describe, expect, it } from "vitest";
import { routeConversationV2Deterministic, type ConversationV2Context, type ConversationV2Goal } from "./conversation-v2";

type Case = { goal: ConversationV2Goal; text: string; context?: Partial<ConversationV2Context> };

const candidateContext: ConversationV2Context = {
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
};

const noCandidateContext: ConversationV2Context = {
  ...candidateContext,
  openCandidateCount: 0,
  hasCurrentCandidate: false,
  currentCandidateId: null,
  currentCandidateFarm: null,
  currentCandidateState: null,
  currentCandidateBlockingField: null,
};

const cases: Case[] = [
  // EXPLAIN
  ...[
    "什麼衝突", "為什麼有矛盾", "這筆哪裡怪", "現在的問題是什麼",
    "為啥不能記", "這筆有哪裡不對", "這個原因是什麼", "衝突在哪裡",
  ].map((text) => ({ goal: "EXPLAIN" as const, text })),
  // SHOW_STATE
  ...[
    "目前知道哪些資料", "你現在知道哪些", "這筆目前狀態", "還缺什麼",
    "下一步是什麼", "目前資料怎麼樣", "這筆目前進度", "現在知道什麼",
  ].map((text) => ({ goal: "SHOW_STATE" as const, text })),
  // ADVISE
  ...[
    "如果不想記這筆可以怎麼辦", "可以取消這筆嗎", "不想保存這筆該怎麼做",
    "要是不留這筆呢", "想知道取消要怎麼做", "取消是不是可以", "這筆先不保留可以嗎",
  ].map((text) => ({ goal: "ADVISE" as const, text })),
  // QUERY
  ...[
    "目前有幾筆待確認", "待確認有幾筆", "目前有哪些候選", "林志騰對應哪些雞場",
    "有哪些場跟林志騰有關", "金雞測試場有沒有飼養者", "這個場目前有誰照顧", "目前這個群組有幾筆待確認",
  ].map((text) => ({ goal: "QUERY" as const, text, context: noCandidateContext })),
  // REPAIR
  ...[
    "改成金雞測試場", "死亡不是2，是3", "數量改成4", "清除舍別",
    "選錯雞場", "不要管林志騰", "只改雞場其他保留", "先把舍別改成測試1舍",
  ].map((text) => ({ goal: "REPAIR" as const, text })),
  // CANCEL
  ...[
    "取消這筆", "算了", "那就不要記了", "這筆不要了", "放棄這筆", "不存這筆", "不要保留這筆",
  ].map((text) => ({ goal: "CANCEL" as const, text })),
  // RECORD
  ...[
    "死亡3", "二林場死亡5", "咳嗽2", "淘汰1", "風扇異常2",
  ].map((text) => ({ goal: "RECORD" as const, text })),
  // CLARIFY
  ...[
    "幫我處理一下", "我不知道怎麼辦", "幫忙看一下", "這件事先處理",
  ].map((text) => ({ goal: "CLARIFY" as const, text })),
  // HELP
  ...[
    "可以怎麼用", "怎麼使用", "有哪些功能", "需要幫助", "請教我怎麼操作",
  ].map((text) => ({ goal: "HELP" as const, text })),
  // COMPARE
  ...[
    "這兩筆有什麼差異", "這個跟那個一樣嗎", "兩個候選是否相同",
  ].map((text) => ({ goal: "COMPARE" as const, text })),
  // ANALYZE
  ...[
    "分析這筆", "評估這個候選", "幫我判斷這筆",
  ].map((text) => ({ goal: "ANALYZE" as const, text })),
];

const multiTurnCases: Array<{ turns: Array<{ text: string; context: Partial<ConversationV2Context> }>; goals: ConversationV2Goal[] }> = [
  { turns: [{ text: "飼養者線索不同在哪", context: {} }, { text: "什麼衝突", context: { lastGoal: "EXPLAIN", lastTopic: "caretaker_conflict" } }, { text: "那不要管那個", context: { lastGoal: "EXPLAIN", lastTopic: "caretaker_conflict" } }], goals: ["EXPLAIN", "EXPLAIN", "REPAIR"] },
  { turns: [{ text: "這筆哪裡有問題", context: {} }, { text: "如果不想記可以怎麼辦", context: { lastGoal: "EXPLAIN", lastTopic: "candidate_conflict" } }, { text: "那就不要記了", context: { lastGoal: "ADVISE", lastTopic: "candidate_cancel" } }], goals: ["EXPLAIN", "ADVISE", "CANCEL"] },
  { turns: [{ text: "你目前知道什麼", context: {} }, { text: "場地我要換掉", context: { lastGoal: "SHOW_STATE", lastTopic: "candidate_state" } }, { text: "其他不要動", context: { lastGoal: "REPAIR", lastTopic: "candidate_farm" } }, { text: "改測試場", context: { lastGoal: "REPAIR", lastTopic: "candidate_farm" } }], goals: ["SHOW_STATE", "REPAIR", "REPAIR", "REPAIR"] },
  { turns: [{ text: "為什麼剛才說有問題", context: {} }, { text: "現在呢", context: { lastGoal: "EXPLAIN", lastTopic: "candidate_conflict" } }], goals: ["EXPLAIN", "EXPLAIN"] },
  { turns: [{ text: "目前有幾筆待確認", context: { ...noCandidateContext } }, { text: "這筆有什麼問題", context: { ...candidateContext } }], goals: ["QUERY", "EXPLAIN"] },
  { turns: [{ text: "林志騰對應哪些雞場", context: { ...noCandidateContext } }, { text: "金雞測試場有沒有飼養者", context: { ...noCandidateContext } }], goals: ["QUERY", "QUERY"] },
  { turns: [{ text: "死亡不是2，是3", context: {} }, { text: "為什麼不能記", context: { lastGoal: "REPAIR", lastTopic: "candidate_quantity" } }], goals: ["REPAIR", "EXPLAIN"] },
  { turns: [{ text: "可以取消嗎", context: {} }, { text: "算了", context: { lastGoal: "ADVISE", lastTopic: "candidate_cancel" } }], goals: ["ADVISE", "CANCEL"] },
  { turns: [{ text: "這筆目前進度", context: {} }, { text: "還缺什麼", context: { lastGoal: "SHOW_STATE", lastTopic: "candidate_state" } }], goals: ["SHOW_STATE", "SHOW_STATE"] },
  { turns: [{ text: "這兩筆有什麼差異", context: {} }, { text: "那個衝突呢", context: { lastGoal: "COMPARE", lastTopic: "candidate_conflict" } }], goals: ["COMPARE", "EXPLAIN"] },
  { turns: [{ text: "先幫我看看", context: {} }, { text: "現在知道哪些", context: { lastGoal: "CLARIFY", lastTopic: "candidate_state" } }], goals: ["CLARIFY", "SHOW_STATE"] },
  { turns: [{ text: "分析這筆", context: {} }, { text: "為啥", context: { lastGoal: "ANALYZE", lastTopic: "candidate_state" } }], goals: ["ANALYZE", "EXPLAIN"] },
  { turns: [{ text: "不要管林志騰", context: {} }, { text: "現在還缺什麼", context: { lastGoal: "REPAIR", lastTopic: "caretaker_conflict" } }], goals: ["REPAIR", "SHOW_STATE"] },
  { turns: [{ text: "取消這筆", context: {} }, { text: "目前有哪些候選", context: { ...noCandidateContext } }], goals: ["CANCEL", "QUERY"] },
  { turns: [{ text: "請教我怎麼操作", context: {} }, { text: "我只想改雞場", context: { lastGoal: "HELP", lastTopic: "candidate_state" } }], goals: ["HELP", "REPAIR"] },
];

function makeContext(overrides: Partial<ConversationV2Context> = {}): ConversationV2Context {
  return { ...candidateContext, ...overrides };
}

describe("Conversation V2 natural-language evaluation harness", () => {
  it("measures at least 60 varied utterances with >=95% deterministic goal accuracy", () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
    const confusion = new Map<string, number>();
    let correct = 0;
    for (const item of cases) {
      const actual = routeConversationV2Deterministic(item.text, makeContext(item.context)).goal;
      confusion.set(`${item.goal}->${actual}`, (confusion.get(`${item.goal}->${actual}`) ?? 0) + 1);
      if (actual !== item.goal) console.log(JSON.stringify({ mismatch: true, expected: item.goal, actual, text: item.text }));
      if (actual === item.goal) correct += 1;
    }
    const accuracy = correct / cases.length;
    console.log(JSON.stringify({
      metric: "CONVERSATION_V2_NL_BENCHMARK",
      cases: cases.length,
      correct,
      accuracy,
      confusion_matrix: Object.fromEntries(confusion),
    }));
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("measures at least 15 multi-turn conversations with >=90% goal accuracy", () => {
    expect(multiTurnCases.length).toBeGreaterThanOrEqual(15);
    let total = 0;
    let correct = 0;
    const confusion = new Map<string, number>();
    for (const conversation of multiTurnCases) {
      conversation.turns.forEach((turn, index) => {
        const actual = routeConversationV2Deterministic(turn.text, makeContext(turn.context)).goal;
        const expected = conversation.goals[index];
        total += 1;
        confusion.set(`${expected}->${actual}`, (confusion.get(`${expected}->${actual}`) ?? 0) + 1);
        if (actual !== expected) console.log(JSON.stringify({ mismatch: true, expected, actual, text: turn.text }));
        if (actual === expected) correct += 1;
      });
    }
    const accuracy = correct / total;
    console.log(JSON.stringify({
      metric: "CONVERSATION_V2_MULTITURN_BENCHMARK",
      conversations: multiTurnCases.length,
      turns: total,
      correct,
      accuracy,
      confusion_matrix: Object.fromEntries(confusion),
    }));
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
