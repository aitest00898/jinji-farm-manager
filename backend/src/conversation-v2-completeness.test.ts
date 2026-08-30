import { describe, expect, it } from "vitest";
import {
  classifyConversationSpeechAct,
  routeConversationV2Deterministic,
  type ConversationV2Context,
  type ConversationV2Goal,
} from "./conversation-v2";

const readOnlyGoals = new Set<ConversationV2Goal>([
  "EXPLAIN",
  "QUERY",
  "SHOW_STATE",
  "ADVISE",
  "CLARIFY",
  "HELP",
  "COMPARE",
  "ANALYZE",
]);

const candidateContext: ConversationV2Context = {
  openCandidateCount: 1,
  hasCurrentCandidate: true,
  currentCandidateId: "completeness-candidate",
  currentCandidateFarm: "金雞測試場",
  currentCandidateHouse: "測試1舍",
  currentCandidateFlock: "TEST-BATCH-001",
  currentCandidateEvent: "mortality",
  currentCandidateQuantity: 2,
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
  currentCandidateHouse: null,
  currentCandidateFlock: null,
  currentCandidateEvent: null,
  currentCandidateQuantity: null,
  currentCandidateState: null,
  currentCandidateBlockingField: null,
};

/**
 * These are category-level paraphrases, not production routing fixtures. The
 * purpose is to ensure an eligible read-like request always has a plan that
 * can be rendered or clarified; it must never silently become an official
 * write or rely on one observed benchmark sentence.
 */
const categoryVariants: Array<{ category: string; context: ConversationV2Context; texts: string[] }> = [
  { category: "capability", context: noCandidateContext, texts: ["你能幫我做哪些事？", "可以查哪些資料？", "你會分析哪些事情？"] },
  { category: "today_status", context: noCandidateContext, texts: ["今天整體狀況如何？", "今天有什麼需要注意？", "今天營運大概怎樣？"] },
  { category: "today_mortality", context: noCandidateContext, texts: ["今天死亡幾隻？", "今日總共死了多少？", "今天記了多少死亡？"] },
  { category: "today_abnormal", context: noCandidateContext, texts: ["今天有哪些異常？", "今天有沒有異常狀況？", "今日哪裡不太正常？"] },
  { category: "recent_event", context: noCandidateContext, texts: ["最近發生了什麼？", "剛才那筆是什麼？", "最後一筆紀錄呢？"] },
  { category: "farm_scope", context: noCandidateContext, texts: ["有哪些雞場？", "目前有幾個場？", "雞場清單可以看嗎？"] },
  { category: "caretaker_relation", context: noCandidateContext, texts: ["林志騰對應哪些雞場？", "哪些場是林志騰負責？", "金雞測試場有誰照顧？"] },
  { category: "pending_data", context: noCandidateContext, texts: ["現在有幾筆待確認？", "還有哪些資料等確認？", "待確認的內容可以看嗎？"] },
  { category: "candidate_state", context: candidateContext, texts: ["你目前知道這筆什麼？", "這筆現在的狀況呢？", "目前還缺哪些資料？"] },
  { category: "candidate_conflict", context: candidateContext, texts: ["這筆哪裡不一致？", "到底是哪裡怪？", "這個衝突是什麼？"] },
  { category: "consequence", context: candidateContext, texts: ["這會影響正式紀錄嗎？", "這個問題會造成什麼後果？", "這個提示重要嗎？"] },
  { category: "blocker", context: candidateContext, texts: ["現在真正卡在哪裡？", "還差哪個必要條件？", "什麼因素讓它還不能完成？"] },
  { category: "advice", context: candidateContext, texts: ["我可以先不處理嗎？", "現在有哪些選擇？", "你建議我接下來怎麼做？"] },
  { category: "cancel_consequence", context: candidateContext, texts: ["如果取消會怎樣？", "先不留這筆會有什麼影響？", "取消這件事的結果是什麼？"] },
  { category: "comparison", context: candidateContext, texts: ["這兩筆有什麼差別？", "兩個結果一樣嗎？", "前後資料可以比較嗎？"] },
  { category: "analysis", context: candidateContext, texts: ["幫我分析這筆資料？", "這個狀況可以評估嗎？", "請判斷目前風險？"] },
  { category: "relative_date", context: noCandidateContext, texts: ["昨天有什麼異常？", "前天死亡多少？", "上週哪天比較嚴重？"] },
  { category: "scope_resolution", context: noCandidateContext, texts: ["全部雞場今天死亡幾隻？", "各個場加起來是多少？", "我想看所有雞場的狀況。"] },
  { category: "evidence_limit", context: candidateContext, texts: ["目前資料夠回答嗎？", "你手上的證據完整嗎？", "這個判斷有沒有資料支持？"] },
  { category: "assistant_explanation", context: candidateContext, texts: ["你剛才是怎麼判的？", "你為什麼這樣理解？", "剛才那個回答是根據什麼？"] },
];

describe("Conversation V2 response completeness classification", () => {
  it("covers 20 intent categories with three paraphrases each", () => {
    expect(categoryVariants).toHaveLength(20);
    for (const item of categoryVariants) {
      expect(item.texts).toHaveLength(3);
      for (const text of item.texts) {
        const plan = routeConversationV2Deterministic(text, item.context);
        const speech = classifyConversationSpeechAct(text, item.context);
        expect(readOnlyGoals.has(plan.goal), `${item.category}: ${text} -> ${plan.goal}`).toBe(true);
        expect(speech.safeToRecord, `${item.category}: ${text} was record-safe`).toBe(false);
      }
    }
  });

  it("keeps ten short follow-up conversations inside a read-only V2 plan", () => {
    const conversations = [
      ["這筆哪裡怪？", "為什麼？", "那現在呢？"],
      ["今天有什麼異常？", "那昨天呢？", "哪一天比較嚴重？"],
      ["你能做什麼？", "那可以看死亡嗎？", "也能分析原因嗎？"],
      ["目前知道什麼？", "還缺什麼？", "這重要嗎？"],
      ["如果先不處理呢？", "那取消會怎樣？", "我只是想知道後果。"],
      ["最近發生什麼？", "剛才那筆在哪個場？", "為什麼？"],
      ["今天全部場狀況如何？", "哪個場最需要注意？", "原因呢？"],
      ["這兩筆差別在哪？", "那個衝突呢？", "會影響紀錄嗎？"],
      ["有沒有待確認資料？", "那筆是哪裡不一致？", "可以怎麼處理？"],
      ["資料夠完整嗎？", "你是根據什麼判斷？", "如果不確定呢？"],
    ];
    for (const turns of conversations) {
      let current = { ...candidateContext };
      for (const text of turns) {
        const plan = routeConversationV2Deterministic(text, current);
        const speech = classifyConversationSpeechAct(text, current);
        expect(readOnlyGoals.has(plan.goal), `${text} -> ${plan.goal}`).toBe(true);
        expect(speech.safeToRecord).toBe(false);
        current = {
          ...current,
          lastGoal: plan.goal,
          lastTopic: plan.topic,
          lastResponseType: plan.goal.toLowerCase(),
        };
      }
    }
  });
});
