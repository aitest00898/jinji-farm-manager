import { describe, expect, it } from "vitest";
import { MODEL_3B, MODEL_8B } from "./full-taxonomy-live-ab-v1";
import {
  SEMANTIC_AB_CASES,
  SEMANTIC_AB_CALLS_PER_MODEL,
  buildSemanticABAiRequest,
  compareSemanticABEvaluations,
  evaluateSemanticABCase,
  validateSemanticABFixture,
  validateSemanticABOutput,
} from "./full-taxonomy-semantic-ab-v1";

describe("fair semantic taxonomy A/B contract", () => {
  it("freezes twelve cases with two cases in every bucket", () => {
    const fixture = validateSemanticABFixture();
    expect(fixture.valid).toBe(true);
    expect(SEMANTIC_AB_CASES).toHaveLength(SEMANTIC_AB_CALLS_PER_MODEL);
    expect(Object.values(fixture.counts)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it("uses the same minimal prompt-only request for either model", () => {
    const request = buildSemanticABAiRequest(SEMANTIC_AB_CASES[0]);
    expect(request.max_tokens).toBe(400);
    expect(request.temperature).toBe(0);
    expect(request.messages[0].content).toContain("recordWorthiness");
    expect(request.messages[0].content).toContain("不得輸出 id");
    expect(request.messages[0].content).not.toContain("response_format");
  });

  it("accepts minimal semantics while reporting non-contract extra keys", () => {
    const valid = validateSemanticABOutput(JSON.stringify({
      recordWorthiness: "record",
      facts: [{ taxonomyId: "O9", subtype: "mortality" }],
      missingFields: [],
    }));
    expect(valid.coreShapeValid).toBe(true);
    expect(valid.minimalContractPass).toBe(true);

    const extra = validateSemanticABOutput(JSON.stringify({
      recordWorthiness: "record",
      facts: [{ taxonomyId: "O9", subtype: "mortality", farmId: "must-not-be-used" }],
      missingFields: [],
    }));
    expect(extra.coreShapeValid).toBe(true);
    expect(extra.minimalContractPass).toBe(false);
    expect(extra.forbiddenKeyCount).toBe(1);
  });

  it("fails closed for invalid semantic types and preserves safety scoring", () => {
    expect(validateSemanticABOutput(JSON.stringify({
      recordWorthiness: "record",
      facts: [{ taxonomyId: "O9", subtype: 5 }],
      missingFields: [],
    })).coreShapeValid).toBe(false);
    expect(validateSemanticABOutput("not json").jsonParsed).toBe(false);

    const negative = SEMANTIC_AB_CASES.find((item) => item.caseId === "N01-question");
    expect(negative).toBeDefined();
    const evaluation = evaluateSemanticABCase(negative!, MODEL_3B, {
      httpStatus: 200,
      providerResponseConfirmed: true,
      providerResult: JSON.stringify({ recordWorthiness: "ignore", facts: [], missingFields: [] }),
    });
    expect(evaluation.semanticPass).toBe(true);
    expect(evaluation.safetyPass).toBe(true);
  });

  it("compares the same authored case IDs without using model-specific rules", () => {
    const make = (model: typeof MODEL_3B | typeof MODEL_8B) => SEMANTIC_AB_CASES.map((item) => evaluateSemanticABCase(item, model, {
      httpStatus: 200,
      providerResponseConfirmed: true,
      providerResult: JSON.stringify({
        recordWorthiness: item.recordWorthiness,
        facts: item.facts,
        missingFields: item.missingFields,
      }),
    }));
    const comparisons = compareSemanticABEvaluations(make(MODEL_3B), make(MODEL_8B));
    expect(comparisons).toHaveLength(SEMANTIC_AB_CALLS_PER_MODEL);
    expect(comparisons.every((item) => item.delta === "EQUAL_PASS")).toBe(true);
  });
});
