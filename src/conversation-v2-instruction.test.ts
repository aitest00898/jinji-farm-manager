import { describe, expect, it } from "vitest";
import {
  classifyConversationSpeechAct,
  finalConversationAnswerModeForRenderer,
  inferConversationAnswerContract,
  isBroadOperationalReadRequest,
  isConversationMemoryRelevant,
  routeConversationV2Deterministic,
  type ConversationV2Context,
} from "./conversation-v2";

const context: ConversationV2Context = {
  openCandidateCount: 1,
  hasCurrentCandidate: true,
  currentCandidateId: "instruction-test-candidate",
  currentCandidateFarm: "金雞測試場",
  currentCandidateEnvironment: "test",
  currentCandidateState: "conflict",
  currentCandidateBlockingField: "confirmation",
  lastGoal: "HELP",
  lastTopic: "capability",
  lastResponseType: "help",
  lastExplainedIssue: "能力說明",
  semanticMemory: {
    lastGoal: "HELP",
    lastTopic: "capability",
    lastAssistantResponseSummary: "能力說明",
    updatedAt: new Date().toISOString(),
  },
};

describe("Conversation V2 answer contract", () => {
  it.each([
    ["renderPendingAdvice", "class_options_no_subject", "default", "options"],
    ["conversationV2AdviceReply", "options", "default", "options"],
    ["renderCandidateClassConsequence", "class_consequence", "default", "consequence"],
    ["renderTodayAttentionSummary", "today_attention", "default", "summary"],
    ["renderConversationV2Capability", "capability_examples", "default", "examples"],
    ["renderConversationV2Capability", "capability_limits", "default", "capability_limits"],
    ["renderConversationV2Capability", "capability_generic", "default", "capability"],
    ["unknown_renderer", "unknown", "comparison", "comparison"],
  ] as const)("keeps durable answer mode aligned with the final renderer: %s", (renderer, rendererVariant, fallbackMode, expected) => {
    expect(finalConversationAnswerModeForRenderer({ renderer, rendererVariant, fallbackMode })).toBe(expected);
  });

  const exampleCases = [
    ["給我 1 個可以直接問的例子", 1],
    ["給我 2 個可以直接問的例子", 2],
    ["給我三個可以直接問的例子", 3],
    ["請舉 4 個實際問題", 4],
    ["列五個我能直接拿來問的問題", 5],
    ["講兩個可以直接問你的例子", 2],
    ["請給我三個例子就好", 3],
    ["可以舉 1 個實際問題嗎", 1],
    ["請整理 2 個提問範例", 2],
    ["我想看四個可用的問法", 4],
    ["給我 3 個日常可以問的問題", 3],
    ["請列 5 個查詢例子", 5],
  ] as const;

  it.each(exampleCases)("extracts an example count from a broad request: %s", (text, count) => {
    const contract = inferConversationAnswerContract(text);
    expect(contract.mode).toBe("examples");
    expect(contract.exampleCount).toBe(count);
    expect(contract.wantsExamples).toBe(true);
  });

  const capabilityLimitCases = [
    ["說 1 件你能做的，還有 1 件你不會直接做的", 1, 1],
    ["列 2 個可以幫忙的，和 2 個不會直接代做的", 2, 2],
    ["講三件能協助我的事，再講兩件不會直接替我做的事", 3, 2],
    ["我想知道 4 件可以處理的，以及 1 件不能直接處理的", 4, 1],
    ["請列五項能幫忙的、三項不會直接代做的", 5, 3],
    ["可以做兩件什麼？不能直接做兩件什麼？", 2, 2],
    ["告訴我 3 件你能協助的，另說 4 件你的限制", 3, 4],
    ["兩個能做的加兩個不直接做的", 2, 2],
  ] as const;

  it.each(capabilityLimitCases)("extracts separate capability and limit counts: %s", (text, capabilityCount, limitationCount) => {
    const contract = inferConversationAnswerContract(text);
    expect(contract.mode).toBe("capability_limits");
    expect(contract.capabilityCount).toBe(capabilityCount);
    expect(contract.limitationCount).toBe(limitationCount);
    expect(contract.wantsCapabilities).toBe(true);
    expect(contract.wantsLimitations).toBe(true);
  });

  const formattingCases = [
    ["簡單說你可以做什麼", "short", "capability"],
    ["請完整說明你能幫什麼", "detailed", "capability"],
    ["只查資料，不要修改任何紀錄", "normal", "default"],
    ["給我三個例子，不要落落長", "short", "examples"],
    ["後果請簡要說明", "short", "consequence"],
    ["有哪些處理選項？", "normal", "options"],
    ["為什麼會這樣？", "normal", "default"],
    ["請摘要今天的狀況", "short", "summary"],
    ["比較這兩種結果", "normal", "comparison"],
    ["今天整體狀況如何", "normal", "summary"],
    ["那我該怎麼辦", "normal", "options"],
    ["所以會造成什麼影響", "normal", "consequence"],
  ] as const;

  it.each(formattingCases)("captures answer mode and style: %s", (text, brevity, mode) => {
    const contract = inferConversationAnswerContract(text);
    expect(contract.mode).toBe(mode);
    expect(contract.brevity).toBe(brevity);
  });
});

describe("Conversation V2 broad read and semantic boundaries", () => {
  const broadReadCases = [
    "今天有沒有什麼值得優先注意的？",
    "依今天已經有的資料，現在最需要注意什麼？",
    "最近有什麼值得我留意？",
    "哪一場現在風險比較高？",
    "今天死亡跟異常有沒有需要注意的地方？",
    "今天整體營運狀況如何？",
    "有沒有什麼我應該先處理？",
    "目前資料裡有沒有明顯問題？",
    "現在最需要優先看的事情是什麼？",
    "今天的資料有沒有哪裡不太正常？",
  ];

  it.each(broadReadCases)("creates a bounded today-attention read plan: %s", (text) => {
    expect(isBroadOperationalReadRequest(text)).toBe(true);
    const speech = classifyConversationSpeechAct(text, context);
    expect(speech.recommendedGoal).toBe("ANALYZE");
    expect(speech.topic).toBe("today_attention");
    const plan = routeConversationV2Deterministic(text, context);
    expect(plan).toMatchObject({ goal: "ANALYZE", topic: "today_attention" });
    expect(plan.requestedTools).toContain("get_today_mortality");
    expect(plan.requestedTools).toContain("get_today_abnormal");
  });

  const consequenceCases = [
    "這些待確認資料一直放著會有什麼後果？",
    "如果不處理，之後會造成什麼影響？",
    "這個狀況會影響正式紀錄嗎？",
    "先說明不處理的結果，不要替我操作。",
    "一直不確認會怎樣？",
    "這個提示對後續有什麼影響？",
  ];

  it.each(consequenceCases)("keeps consequence questions in EXPLAIN: %s", (text) => {
    const speech = classifyConversationSpeechAct(text, context);
    const plan = routeConversationV2Deterministic(text, context);
    expect(speech.recommendedGoal).toBe("EXPLAIN");
    expect(speech.topic).toBe("candidate_consequence");
    expect(plan.goal).toBe("EXPLAIN");
    expect(plan.topic).toBe("candidate_consequence");
    expect(inferConversationAnswerContract(text).mode).toBe("consequence");
  });

  const adviceCases = [
    "那我可以怎麼處理？",
    "現在有哪些選擇？",
    "你建議我下一步怎麼做？",
    "我可以先放著，還是要處理？",
    "這筆資料我該選哪個方式？",
    "那要不要先保留？",
  ];

  it.each(adviceCases)("keeps options questions in ADVISE: %s", (text) => {
    const speech = classifyConversationSpeechAct(text, context);
    const plan = routeConversationV2Deterministic(text, context);
    expect(speech.recommendedGoal).toBe("ADVISE");
    expect(plan.goal).toBe("ADVISE");
    expect(inferConversationAnswerContract(text).mode).toBe("options");
  });

  it("uses memory for referents but not for an independent request", () => {
    expect(isConversationMemoryRelevant("那第三個是什麼意思？", context)).toBe(true);
    expect(isConversationMemoryRelevant("為什麼？", context)).toBe(true);
    expect(isConversationMemoryRelevant("給我三個例子。", context)).toBe(false);
    expect(isConversationMemoryRelevant("今天有沒有需要注意的？", context)).toBe(false);
    expect(routeConversationV2Deterministic("今天有沒有需要注意的？", context).topic).toBe("today_attention");
    expect(routeConversationV2Deterministic("給我三個例子。", context).topic).toBe("capability");
  });

  it("does not use a benchmark sentence table to recognize the categories", () => {
    const paraphrases = [
      "按照今天現有紀錄，先告訴我哪件事比較值得留神",
      "請舉四個我可以拿來問的實際問法",
      "如果一直擺著不決定，後面會有什麼結果",
      "那我接下來有哪些處理路線",
    ];
    expect(routeConversationV2Deterministic(paraphrases[0], context).topic).toBe("today_attention");
    expect(inferConversationAnswerContract(paraphrases[1]).exampleCount).toBe(4);
    expect(routeConversationV2Deterministic(paraphrases[2], context).goal).toBe("EXPLAIN");
    expect(routeConversationV2Deterministic(paraphrases[3], context).goal).toBe("ADVISE");
  });
});
