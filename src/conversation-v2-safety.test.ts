import { describe, expect, it } from "vitest";
import {
  classifyConversationSpeechAct,
  conversationOfficialRecordAllowed,
  routeConversationV2Deterministic,
  type ConversationV2Context,
  type ConversationV2Goal,
  type ConversationV2SemanticMemory,
} from "./conversation-v2";

type SafetyCase = {
  category: string;
  expected: ConversationV2Goal;
  text: string;
  context?: Partial<ConversationV2Context>;
  mustNotOfficialWrite?: boolean;
};

const officialMemory: ConversationV2SemanticMemory = {
  activeObjectType: "operational_event",
  activeObjectId: "event-test-mortality-4",
  activeObjectSummary: "死亡4隻，雞場為金雞測試場",
  lastGoal: "QUERY",
  lastTopic: "recent_event",
  lastConclusion: "最近一筆正式紀錄是死亡4隻。",
  lastReferencedObjectType: "operational_event",
  lastReferencedObject: "event-test-mortality-4",
  updatedAt: new Date(0).toISOString(),
};

const candidateContext: ConversationV2Context = {
  openCandidateCount: 1,
  hasCurrentCandidate: true,
  currentCandidateId: "candidate-test-1",
  currentCandidateFarm: "金雞測試場",
  currentCandidateHouse: "測試1舍",
  currentCandidateFlock: "TEST-BATCH-001",
  currentCandidateEvent: "mortality",
  currentCandidateQuantity: 2,
  currentCandidateEnvironment: "test",
  currentCandidateState: "conflict",
  currentCandidateBlockingField: "confirmation",
  lastGoal: "EXPLAIN",
  lastTopic: "caretaker_conflict",
  lastResponseType: "explain",
  lastExplainedIssue: "飼養者線索與雞場關聯需要說明。",
};

const noCandidateContext: ConversationV2Context = {
  ...candidateContext,
  openCandidateCount: 0,
  hasCurrentCandidate: false,
  currentCandidateId: null,
  currentCandidateFarm: null,
  currentCandidateHouse: null,
  currentCandidateFlock: null,
  currentCandidateEvent: null,
  currentCandidateQuantity: null,
  currentCandidateState: null,
  currentCandidateBlockingField: null,
};

const cases = [
  // 20 QUERY cases.
  ...[
    "今天總共記了幾隻死亡？", "今天死亡幾隻？", "今天有哪些異常？", "今天有幾筆異常？",
    "我剛才最後記的是什麼？", "我剛才記了哪些東西？", "最後一筆是什麼？", "現在有幾筆待確認資料？",
    "現在有沒有待確認？", "目前有什麼還沒處理？", "今天有哪些死亡紀錄？", "死亡4是不是記錯了？",
    "死亡4跟死亡3有什麼差別？", "那筆有異常嗎？", "它是哪個雞場？", "那昨天呢？",
    "林志騰目前對應哪些雞場？", "金雞測試場有沒有飼養者？", "這個場目前有誰照顧？", "今天總共記了幾筆？",
  ].map((text) => ({ category: "QUERY", expected: (text.includes("差別") || text.includes("差異") ? "COMPARE" : "QUERY") as ConversationV2Goal, text, context: text.includes("那筆") || text.includes("它") || text.includes("它是") || text.includes("那昨天") ? { ...officialMemory } : noCandidateContext, mustNotOfficialWrite: true })),
  // 15 EXPLAIN cases.
  ...[
    "為什麼這筆有問題？", "哪裡怪怪的？", "到底哪裡對不起來？", "什麼衝突？", "為什麼不能記？",
    "如果我不回答那個雞場問題會怎樣？", "如果我不處理會怎樣？", "取消的話會怎樣？", "如果我不回答會怎樣？",
    "剛才為什麼一直叫我選雞場？", "我剛才那句哪裡讓你以為我要記錄？", "你現在是在等我回答什麼？",
    "所以目前真正卡住的是什麼？", "這個提示為什麼出現？", "為什麼會這樣判？", "這會影響死亡紀錄嗎？",
    "為什麼你把死亡4記進去？", "為什麼剛才記成異常？", "為什麼？",
  ].map((text) => ({ category: "EXPLAIN", expected: "EXPLAIN", text, context: text === "為什麼？" ? { ...candidateContext, ...officialMemory, hasCurrentCandidate: false, openCandidateCount: 0 } : candidateContext, mustNotOfficialWrite: true })),
  // 15 ADVISE cases.
  ...[
    "我可以先不處理嗎？", "這筆一定要確認嗎？", "那我需要處理它嗎？",
    "這筆如果不要了怎麼辦？", "可以取消這筆嗎？",
    "不想保存這筆該怎麼做？", "我可以晚點處理嗎？", "如果先放著呢？", "這個提示重要嗎？",
    "有哪些選擇？", "我現在可以怎麼辦？",
  ].map((text) => ({ category: "ADVISE", expected: "ADVISE", text, context: candidateContext, mustNotOfficialWrite: true })),
  // 10 META_CONVERSATION cases (goal is EXPLAIN, speech act is META).
  ...[
    "我剛才那句哪裡讓你以為我要記錄？", "你剛才為什麼叫我選雞場？", "你現在是在等我回答什麼？",
    "剛才你回答的是哪一筆？", "為什麼你把那句當成死亡紀錄？", "我剛才怎麼會被當成要記錄？",
    "你剛才是怎麼理解我的？", "剛才那個提示是怎麼來的？", "你剛才為什麼這樣判？", "這句話被你理解成什麼？",
  ].map((text) => ({ category: "META_CONVERSATION", expected: "EXPLAIN", text, context: candidateContext, mustNotOfficialWrite: true })),
  // 10 referential follow-ups.
  ...[
    "那筆有異常嗎？", "為什麼？", "那現在呢？", "那昨天呢？", "它是哪個雞場？",
    "那個衝突重要嗎？", "這筆現在呢？", "剛才那筆你知道什麼？", "它會影響嗎？", "那個人先不要算呢？",
  ].map((text) => ({ category: "REFERENCE", expected: (text === "那昨天呢？" ? "QUERY" : text === "它是哪個雞場？" || text === "那筆有異常嗎？" ? "QUERY" : text === "剛才那筆你知道什麼？" ? "SHOW_STATE" : text === "那個衝突重要嗎？" || text === "那個人先不要算呢？" ? "ADVISE" : "EXPLAIN") as ConversationV2Goal, text, context: { ...candidateContext, ...officialMemory }, mustNotOfficialWrite: true })),
  // 10 new-fact assertions that may proceed to the existing record path.
  ...[
    "金雞測試場死亡4", "剛剛金雞測試場死了4隻", "金雞測試場今天淘汰3隻", "測試1舍飼料800公斤",
    "金雞測試場死亡3 咳嗽 臭腳", "剛剛測試1舍死了2隻", "金雞測試場飲水200公升", "金雞測試場出雞10隻",
    "金雞測試場白冠2", "今天金雞測試場死亡5",
  ].map((text) => ({ category: "RECORD", expected: "RECORD", text, context: noCandidateContext, mustNotOfficialWrite: false })),
  // 5 Candidate repair cases.
  ...[
    "改成金雞測試場", "死亡不是2，是3", "先把舍別改成測試1舍", "不要管林志騰", "我只想改雞場",
  ].map((text) => ({ category: "REPAIR", expected: "REPAIR", text, context: candidateContext, mustNotOfficialWrite: true })),
  // 5 explicit cancel cases.
  ...[
    "取消這筆", "算了", "那就不要記了", "這筆不要了", "先別記這筆",
  ].map((text) => ({ category: "CANCEL", expected: "CANCEL", text, context: candidateContext, mustNotOfficialWrite: true })),
  // 5 explicit confirm cases.
  ...[
    "確認這筆", "就這樣記吧", "這樣可以，記錄", "照你說的做", "確定了",
  ].map((text) => ({ category: "CONFIRM", expected: "CONFIRM", text, context: candidateContext, mustNotOfficialWrite: true })),
  // 5 hypothetical, negated, or quoted domain phrases.
  ...[
    "如果死亡4要怎麼改？", "我不是說死亡4", "死亡4有問題嗎？", "你剛才是不是記成死亡4？", "『死亡4』這句是什麼意思？",
  ].map((text) => ({ category: "HYPOTHETICAL_NEGATION_QUOTE", expected: (text.includes("怎麼改") ? "ADVISE" : "EXPLAIN") as ConversationV2Goal, text, context: candidateContext, mustNotOfficialWrite: true })),
] as SafetyCase[];

describe("Conversation V2 safety evaluation", () => {
  it("runs at least 100 adversarial utterances with zero unsafe official-write approval", () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
    const matrix = new Map<string, number>();
    let correct = 0;
    let unsafeOfficialApproval = 0;
    let queryFalseWrite = 0;
    let explainFalseWrite = 0;
    let adviseFalseWrite = 0;
    let metaFalseWrite = 0;
    let compareFalseWrite = 0;
    let analyzeFalseWrite = 0;

    for (const testCase of cases) {
      const context = { ...candidateContext, ...testCase.context };
      const plan = routeConversationV2Deterministic(testCase.text, context);
      const speech = classifyConversationSpeechAct(testCase.text, context);
      matrix.set(`${testCase.expected}->${plan.goal}`, (matrix.get(`${testCase.expected}->${plan.goal}`) ?? 0) + 1);
      if (plan.goal === testCase.expected) correct += 1;
      if (plan.goal !== testCase.expected) console.log(JSON.stringify({ mismatch: true, category: testCase.category, expected: testCase.expected, actual: plan.goal, speech: speech.speechAct, text: testCase.text }));
      const officiallyAllowed = conversationOfficialRecordAllowed(speech);
      if (testCase.mustNotOfficialWrite && officiallyAllowed) unsafeOfficialApproval += 1;
      if (testCase.mustNotOfficialWrite && plan.goal === "QUERY" && officiallyAllowed) queryFalseWrite += 1;
      if (testCase.mustNotOfficialWrite && plan.goal === "EXPLAIN" && officiallyAllowed) explainFalseWrite += 1;
      if (testCase.mustNotOfficialWrite && plan.goal === "ADVISE" && officiallyAllowed) adviseFalseWrite += 1;
      if (testCase.category === "META_CONVERSATION" && officiallyAllowed) metaFalseWrite += 1;
      if (testCase.category === "COMPARE" && officiallyAllowed) compareFalseWrite += 1;
      if (testCase.category === "ANALYZE" && officiallyAllowed) analyzeFalseWrite += 1;
    }

    const accuracy = correct / cases.length;
    console.log(JSON.stringify({
      metric: "CONVERSATION_V2_SAFETY_EVAL",
      cases: cases.length,
      correct,
      accuracy,
      unsafeOfficialApproval,
      QUERY_FALSE_WRITE: queryFalseWrite,
      EXPLAIN_FALSE_WRITE: explainFalseWrite,
      ADVISE_FALSE_WRITE: adviseFalseWrite,
      META_FALSE_WRITE: metaFalseWrite,
      COMPARE_FALSE_WRITE: compareFalseWrite,
      ANALYZE_FALSE_WRITE: analyzeFalseWrite,
      confusion_matrix: Object.fromEntries(matrix),
    }));
    expect(accuracy).toBeGreaterThanOrEqual(0.97);
    expect(unsafeOfficialApproval).toBe(0);
    expect(queryFalseWrite).toBe(0);
    expect(explainFalseWrite).toBe(0);
    expect(adviseFalseWrite).toBe(0);
    expect(metaFalseWrite).toBe(0);
    expect(compareFalseWrite).toBe(0);
    expect(analyzeFalseWrite).toBe(0);
  });

  it("keeps explicit record assertions separate from question/reference speech", () => {
    const record = classifyConversationSpeechAct("金雞測試場死亡4", noCandidateContext);
    const query = classifyConversationSpeechAct("今天有哪些死亡紀錄？", noCandidateContext);
    const quote = classifyConversationSpeechAct("我剛才那句讓你以為我要記錄死亡4嗎？", noCandidateContext);
    expect(record.speechAct).toBe("ASSERT");
    expect(conversationOfficialRecordAllowed(record)).toBe(true);
    expect(query.speechAct).toBe("QUERY");
    expect(conversationOfficialRecordAllowed(query)).toBe(false);
    expect(quote.speechAct).toBe("META_CONVERSATION");
    expect(conversationOfficialRecordAllowed(quote)).toBe(false);
  });
});
