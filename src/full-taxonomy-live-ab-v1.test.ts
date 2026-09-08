import { describe, expect, it } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  BENCHMARK_BUCKETS,
  BENCHMARK_MODELS,
  FULL_TAXONOMY_LIVE_AB_V1_CASES,
  MODEL_3B,
  MODEL_8B,
  benchmarkFingerprintMaterials,
  buildFullTaxonomyAiRequest,
  compareFullTaxonomyEvaluations,
  evaluateFullTaxonomyCase,
  modelForFullTaxonomyBenchmark,
  modelIsolationEvidence,
  stableJson,
  validateFullTaxonomyBenchmarkFixture,
  validateFullTaxonomyBenchmarkOutput,
} from "./full-taxonomy-live-ab-v1";

function providerOk(result: unknown) {
  return {
    httpStatus: 200,
    providerResponseConfirmed: true,
    providerResult: result,
  } as const;
}

function expectedOutput(item: (typeof FULL_TAXONOMY_LIVE_AB_V1_CASES)[number]) {
  return {
    recordWorthiness: item.recordWorthiness,
    facts: item.facts.map((fact) => ({
      taxonomyId: fact.taxonomyId,
      family: fact.family,
      type: fact.type,
      subtype: fact.subtype,
      fields: { ...fact.expectedFields },
      missingFields: [...fact.missingFields],
    })),
    missingFields: [...item.missingFields],
    clarificationExpected: item.clarificationExpected,
    correctionExpected: item.correctionExpected,
    uncertaintyExpected: item.uncertaintyExpected,
  };
}

describe("FULL_TAXONOMY_LIVE_AB_V1 reproducible benchmark", () => {
  it("has exactly 30 frozen cases with the required distribution and coverage", () => {
    const validation = validateFullTaxonomyBenchmarkFixture();
    expect(validation.valid).toBe(true);
    expect(FULL_TAXONOMY_LIVE_AB_V1_CASES).toHaveLength(30);
    expect(new Set(FULL_TAXONOMY_LIVE_AB_V1_CASES.map((item) => item.caseId)).size).toBe(30);
    expect(validation.counts).toEqual({
      operational_event: 6,
      operational_action: 6,
      operational_observation: 6,
      missing_information: 4,
      multi_fact_correction_contextual: 4,
      negative_control: 4,
    });
    expect(validation.coveredFamilies).toEqual([
      "operational_action",
      "operational_event",
      "operational_observation",
    ]);
    expect(validation.coveredTaxonomyIds).toEqual(expect.arrayContaining(["O1", "O2", "O3", "O5", "O6", "O9", "A2", "A5", "A6", "A8", "A10", "A12"]));
    expect(BENCHMARK_BUCKETS).toHaveLength(6);
    expect(FULL_TAXONOMY_LIVE_AB_V1_CASES.every((item) => Object.isFrozen(item))).toBe(true);
    expect(FULL_TAXONOMY_LIVE_AB_V1_CASES.every((item) => Object.isFrozen(item.facts))).toBe(true);
  });

  it("freezes the request contract and keeps preprocessing deterministic", () => {
    const request = buildFullTaxonomyAiRequest(FULL_TAXONOMY_LIVE_AB_V1_CASES[0]!);
    expect(request.max_tokens).toBe(800);
    expect(request.temperature).toBe(0);
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]!.role).toBe("system");
    expect(request.messages[1]!.content).toContain("進雛");
    expect(request.messages[0]!.content).toContain("OUTPUT_SCHEMA=");
    expect(request.messages[0]!.content).toContain("TAXONOMY_CATALOG=");
    expect(request.messages[0]!.content).not.toContain("response_format");
  });

  it("has stable fingerprint materials and model override isolation", () => {
    expect(benchmarkFingerprintMaterials()).toEqual(benchmarkFingerprintMaterials());
    expect(stableJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(BENCHMARK_MODELS).toEqual([MODEL_3B, MODEL_8B]);
    expect(modelForFullTaxonomyBenchmark(MODEL_3B)).toBe(MODEL_3B);
    expect(modelForFullTaxonomyBenchmark(MODEL_8B)).toBe(MODEL_8B);
    expect(() => modelForFullTaxonomyBenchmark("@cf/not-allowed")).toThrow("BENCHMARK_MODEL_NOT_ALLOWED");
    expect(modelIsolationEvidence(PRODUCTION_AI_MODEL)).toEqual({
      productionModel: PRODUCTION_AI_MODEL,
      benchmarkModels: [MODEL_3B, MODEL_8B],
      isolationPass: true,
    });
  });

  it("accepts direct, fenced, and wrapper-prose JSON without changing the schema", () => {
    const output = expectedOutput(FULL_TAXONOMY_LIVE_AB_V1_CASES[0]!);
    const direct = validateFullTaxonomyBenchmarkOutput(JSON.stringify(output));
    const fenced = validateFullTaxonomyBenchmarkOutput({ response: `\n\`\`\`json\n${JSON.stringify(output)}\n\`\`\`\n` });
    const wrapper = validateFullTaxonomyBenchmarkOutput({ response: `分類完成：\n${JSON.stringify(output)}\n以上。` });
    expect(direct.valid).toBe(true);
    expect(fenced.valid).toBe(true);
    expect(wrapper.valid).toBe(true);
  });

  it("fails closed for missing keys, wrong types, formal IDs, and unsupported fields", () => {
    const output = expectedOutput(FULL_TAXONOMY_LIVE_AB_V1_CASES[0]!);
    const missingKey = { ...output } as Record<string, unknown>;
    delete missingKey.uncertaintyExpected;
    expect(validateFullTaxonomyBenchmarkOutput(JSON.stringify(missingKey)).errorCode).toBe("SCHEMA_TOP_LEVEL_KEYS_INVALID");

    const wrongType = { ...output, facts: "not-an-array" };
    expect(validateFullTaxonomyBenchmarkOutput(JSON.stringify(wrongType)).errorCode).toBe("SCHEMA_FACTS_INVALID");

    const formalId = expectedOutput(FULL_TAXONOMY_LIVE_AB_V1_CASES[0]!);
    (formalId.facts[0]!.fields as Record<string, unknown>).farmId = "production-id";
    expect(validateFullTaxonomyBenchmarkOutput(JSON.stringify(formalId)).errorCode).toBe("UNSAFE_FORMAL_OR_DERIVED_FIELD");

    const unsupported = expectedOutput(FULL_TAXONOMY_LIVE_AB_V1_CASES[0]!);
    (unsupported.facts[0]!.fields as Record<string, unknown>).madeUp = "guess";
    expect(validateFullTaxonomyBenchmarkOutput(JSON.stringify(unsupported)).errorCode).toBe("SCHEMA_FIELD_UNSUPPORTED");
  });

  it("keeps positive, clarification, multi-fact, and safety expectations strict", () => {
    for (const item of FULL_TAXONOMY_LIVE_AB_V1_CASES) {
      const validation = validateFullTaxonomyBenchmarkOutput(expectedOutput(item));
      expect(validation.valid, item.caseId).toBe(true);
    }

    const positive = FULL_TAXONOMY_LIVE_AB_V1_CASES.find((item) => item.caseId === "E04-mortality")!;
    const positiveEvaluation = evaluateFullTaxonomyCase(positive, MODEL_3B, providerOk(expectedOutput(positive)));
    expect(positiveEvaluation.exact).toBe(true);
    expect(positiveEvaluation.fieldCorrectCount).toBe(4);

    const multi = FULL_TAXONOMY_LIVE_AB_V1_CASES.find((item) => item.caseId === "C01-mortality-and-cough")!;
    const multiEvaluation = evaluateFullTaxonomyCase(multi, MODEL_3B, providerOk(expectedOutput(multi)));
    expect(multiEvaluation.multiFactSplitCorrect).toBe(true);
    expect(multiEvaluation.factFusionErrors).toBe(0);

    const question = FULL_TAXONOMY_LIVE_AB_V1_CASES.find((item) => item.caseId === "N01-question")!;
    const unsafeQuestion = { ...expectedOutput(question), recordWorthiness: "record", facts: [expectedOutput(positive).facts[0]] };
    const questionEvaluation = evaluateFullTaxonomyCase(question, MODEL_3B, providerOk(unsafeQuestion));
    expect(questionEvaluation.questionAsFactError).toBe(1);
    expect(questionEvaluation.exact).toBe(false);
  });

  it("reports deterministic case deltas without exposing inputs or completions", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V1_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const pass3B = evaluateFullTaxonomyCase(item, MODEL_3B, providerOk(expectedOutput(item)));
    const fail8B = evaluateFullTaxonomyCase(item, MODEL_8B, providerOk({ ...expectedOutput(item), recordWorthiness: "candidate" }));
    const otherCases = FULL_TAXONOMY_LIVE_AB_V1_CASES
      .filter((candidate) => candidate.caseId !== item.caseId)
      .map((candidate) => {
        const pass = evaluateFullTaxonomyCase(candidate, MODEL_3B, providerOk(expectedOutput(candidate)));
        return [pass, { ...pass, model: MODEL_8B }] as const;
      });
    const comparison = compareFullTaxonomyEvaluations(
      [pass3B, ...otherCases.map(([left]) => left)],
      [fail8B, ...otherCases.map(([, right]) => right)],
    );
    expect(comparison.find((entry) => entry.caseId === item.caseId)?.delta).toBe("3B_BETTER");
    expect(JSON.stringify(comparison)).not.toContain("金雞");
  });
});
