import { describe, expect, it } from "vitest";
import { evaluateHybridCorpus, aiResidualContracts, planHybridRecording } from "./hybrid-recording";
import { TAXONOMY_GOLDEN_CASES, TAXONOMY_GOLDEN_EDGE_CASES } from "./recording-taxonomy-golden";

const NOW = new Date("2026-09-08T04:00:00.000Z");

describe("deterministic-first hybrid recording foundation", () => {
  it("keeps a complete deterministic record separate from the future AI residual contract", () => {
    const plan = planHybridRecording("金雞測試場 測試一舍 批次A 死亡5", NOW);
    expect(plan.decision).toBe("DETERMINISTIC_CONFIRMED");
    expect(plan.facts).toHaveLength(1);
    expect(plan.facts[0]).toMatchObject({
      candidateTaxonomyIds: ["O9"],
      candidateSubtypes: ["mortality"],
      knownFields: { farmText: "金雞測試場", houseText: "測試一舍", flockText: "A", quantity: 5 },
      missingFields: [],
      residualText: "",
      officialWriteAllowed: false,
    });
    expect(aiResidualContracts(plan)).toEqual([]);
  });

  it("narrows a partial known record without authorizing a write", () => {
    const plan = planHybridRecording("金雞測試場 測試一舍 死亡", NOW);
    expect(plan.decision).toBe("AI_RESIDUAL");
    expect(plan.candidateTaxonomyIds).toEqual(["O9"]);
    expect(plan.candidateSubtypes).toEqual(["mortality"]);
    expect(plan.knownFields).toMatchObject({ farmText: "金雞測試場", houseText: "測試一舍" });
    expect(plan.missingFields).toEqual(["quantity"]);
    expect(aiResidualContracts(plan)).toMatchObject([{ candidateTaxonomyIds: ["O9"], allowedMissingFields: ["quantity"], officialWriteAllowed: false }]);
  });

  it("keeps multi-fact quantity and observation fields independent", () => {
    const plan = planHybridRecording("金雞測試場 測試一舍 淘汰2隻，而且臭腳", NOW);
    expect(plan.facts).toHaveLength(2);
    expect(plan.facts.map((fact) => fact.candidateTaxonomyIds)).toEqual([["O9"], ["A8"]]);
    expect(plan.facts[0]).toMatchObject({ decision: "DETERMINISTIC_CONFIRMED", knownFields: { quantity: 2 } });
    expect(plan.facts[0].knownFields.extent).toBeUndefined();
    expect(plan.facts[1]).toMatchObject({ decision: "UNRESOLVED", clarificationQuestion: "請選擇小範圍、中範圍或大範圍。", knownFields: { farmText: "金雞測試場", houseText: "測試一舍" }, missingFields: ["extent"] });
    expect(plan.facts[1].knownFields.quantity).toBeUndefined();
    expect(plan.officialWriteAllowed).toBe(false);
  });

  it("keeps question, future, and negation inputs unresolved", () => {
    for (const text of ["請問目前存欄？", "哪場死亡最多", "咳嗽？", "明天金雞測試場死亡5", "不是死亡5", "不是咳嗽"]) {
      const plan = planHybridRecording(text, NOW);
      expect(plan.decision, text).toBe("UNRESOLVED");
      expect(plan.facts[0]?.officialWriteAllowed, text).toBe(false);
      expect(plan.facts[0]?.candidateTaxonomyIds, text).toEqual([]);
    }
  });

  it("routes the five known residual cases to deterministic clarification", () => {
    const cases = [
      ["金雞測試場 測試一舍 批次A 送驗 新城雞瘟 完成", "請補充檢驗結果與完成時間。"],
      ["金雞測試場 測試一舍 批次A 臭腳", "請選擇小範圍、中範圍或大範圍。"],
      ["金雞測試場 測試一舍 批次A 緊迫 大範圍", "請選擇緊迫類型：熱緊迫或抓雞緊迫。"],
      ["金雞測試場 測試一舍 批次A 設備異常 大範圍", "請選擇設備異常類型：飼料、水、電力、風扇、冷卻、加熱或其他。"],
      ["金雞測試場 測試一舍 批次A 設備異常 其他 大範圍", "請補充其他設備異常內容。"],
    ] as const;
    for (const [text, question] of cases) {
      const plan = planHybridRecording(text, NOW);
      expect(plan.decision, text).toBe("UNRESOLVED");
      expect(plan.clarificationQuestion, text).toBe(question);
      expect(aiResidualContracts(plan), text).toEqual([]);
      expect(plan.officialWriteAllowed, text).toBe(false);
    }
  });

  it("closes the exact authored corpus and exposes only bounded residuals", () => {
    const texts = [...TAXONOMY_GOLDEN_CASES, ...TAXONOMY_GOLDEN_EDGE_CASES].map((item) => item.text);
    const metrics = evaluateHybridCorpus(texts, NOW);
    expect(metrics).toEqual({
      totalCases: 75,
      deterministicConfirmedCases: 51,
      aiResidualCases: 6,
      unresolvedCases: 18,
      deterministicCoverageRate: 51 / 75,
      estimatedAiAvoidanceRate: 69 / 75,
      knownFieldPreservation: "PRESERVED",
      fieldCrossContamination: "NONE_DETECTED",
      unsafeWriteAuthorization: "NONE",
    });
  });
});
