import { describe, expect, it } from "vitest";
import {
  routeConversationV2Deterministic,
  type ConversationV2Context,
} from "./conversation-v2";

function makeContext(overrides: Partial<ConversationV2Context> = {}): ConversationV2Context {
  return {
    openCandidateCount: 0,
    hasCurrentCandidate: false,
    currentCandidateId: null,
    lastGoal: null,
    lastTopic: null,
    lastResponseType: null,
    lastExplainedIssue: null,
    ...overrides,
  };
}

const classLevelQuestions = [
  "待確認的項目如果一直放著，通常會怎樣？",
  "待確認資料會自己變成正式紀錄嗎？",
  "一般來說，待確認紀錄不處理會有什麼影響？",
  "待確認資料通常保留多久？",
  "死亡紀錄更正通常怎麼運作？",
  "異常紀錄如果沒確認會怎樣？",
  "更正紀錄一般會留下什麼？",
  "批次資料通常怎麼確認？",
  "一般異常紀錄會怎麼保存？",
  "待確認項目通常怎麼處理？",
  "待確認資料一直不理，後面通常會發生什麼？",
  "如果一類待確認資訊沒有處理，會有什麼結果？",
  "待確認的東西長期不決定會怎樣？",
  "通常待確認紀錄會不會自動算進正式統計？",
  "死亡資料修改後一般會留下哪些紀錄？",
  "異常資料一直沒確認，制度上會怎麼辦？",
  "一般的待確認資料之後有哪些處理方式？",
  "這類紀錄通常需要誰來確認？",
  "待確認資訊未處理時，正式數字會跟著變嗎？",
  "從規則來看，待確認資料會自動變成正式資料嗎？",
  "待確認紀錄如果放一陣子，通常會有什麼影響？",
  "一般更正流程完成後會留下什麼？",
  "異常紀錄未確認時通常維持什麼狀態？",
  "批次資料一般要怎麼確認才會生效？",
] as const;

const instanceQuestions = [
  "這筆待確認一直不處理會怎樣？",
  "剛才那筆會有什麼影響？",
  "這一筆為什麼卡住？",
  "第 3 筆是什麼問題？",
  "剛剛那筆死亡紀錄會怎樣？",
  "這個異常怎麼回事？",
  "那個批次目前怎麼樣？",
  "前面那筆更正後如何？",
  "它一直不處理會發生什麼？",
  "上一筆待確認資料的後果是什麼？",
] as const;

describe("Conversation V2 reference scope", () => {
  it.each(classLevelQuestions)("recognizes a class-level rule question: %s", (text) => {
    const result = routeConversationV2Deterministic(text, makeContext());
    expect(result.referenceScope).toBe("class");
    expect(result.referentRequired).toBe(false);
    expect(result.referentResolved).toBe(false);
    expect(result.genericRuleUsed).toBe(true);
  });

  it.each(instanceQuestions)("recognizes an instance-level question: %s", (text) => {
    const result = routeConversationV2Deterministic(text, makeContext());
    expect(result.referenceScope).toBe("instance");
    expect(result.referentRequired).toBe(true);
    expect(result.referentResolved).toBe(false);
    expect(result.needsClarification).toBe(true);
  });

  it("resolves an instance only when a real Candidate is present", () => {
    const result = routeConversationV2Deterministic(
      "這筆待確認一直不處理會怎樣？",
      makeContext({
        openCandidateCount: 1,
        hasCurrentCandidate: true,
        currentCandidateId: "candidate-1",
      }),
    );
    expect(result.referenceScope).toBe("instance");
    expect(result.referentRequired).toBe(true);
    expect(result.referentResolved).toBe(true);
    expect(result.referentSource).toBe("active_candidate");
  });

  it.each([
    "待確認資料可以怎麼處理？",
    "如果有一筆待確認資料，我有哪些處理方式？",
    "一般待確認項目要怎麼辦？",
  ])("keeps generic advice at class scope: %s", (text) => {
    const result = routeConversationV2Deterministic(text, makeContext());
    expect(result.goal).toBe("ADVISE");
    expect(result.referenceScope).toBe("class");
    expect(result.referentRequired).toBe(false);
    expect(result.needsClarification).toBe(false);
  });

  it("keeps class scope across consequence to advice follow-up", () => {
    const first = routeConversationV2Deterministic(
      "待確認資料一般不處理會怎樣？",
      makeContext(),
    );
    const second = routeConversationV2Deterministic(
      "那有哪些處理方式？",
      makeContext({
        lastGoal: first.goal,
        lastTopic: first.topic,
        semanticMemory: {
          lastGoal: first.goal,
          lastTopic: first.topic,
          activeObjectType: "query_result",
          activeObjectId: null,
        },
      }),
    );
    expect(first).toMatchObject({ goal: "EXPLAIN", topic: "candidate_consequence", referenceScope: "class" });
    expect(second).toMatchObject({ goal: "ADVISE", referenceScope: "class" });
  });

  it("does not turn a later instance reference into a guessed Candidate", () => {
    const result = routeConversationV2Deterministic(
      "這筆呢？",
      makeContext({
        lastGoal: "EXPLAIN",
        lastTopic: "candidate_consequence",
        semanticMemory: {
          lastGoal: "EXPLAIN",
          lastTopic: "candidate_consequence",
          activeObjectType: "query_result",
          activeObjectId: null,
        },
      }),
    );
    expect(result.referenceScope).toBe("instance");
    expect(result.referentRequired).toBe(true);
    expect(result.referentResolved).toBe(false);
    expect(result.needsClarification).toBe(true);
  });
});
