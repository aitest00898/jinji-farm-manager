import { describe, expect, it } from "vitest";
import { MODEL_3B } from "./full-taxonomy-live-ab-v1";
import {
  FULL_TAXONOMY_LIVE_AB_V2_CASES,
  FULL_TAXONOMY_LIVE_AB_V2_DIAGNOSTIC_WRITE_AUTHORITY,
  FULL_TAXONOMY_LIVE_AB_V2_STRUCTURED_RESPONSE_FORMAT,
  buildFullTaxonomyV2AiRequest,
  evaluateFullTaxonomyV2Case,
  parseFullTaxonomyV2DiagnosticOutput,
  runFullTaxonomyV2LocalGate,
  validateFullTaxonomyV2Fixture,
} from "./full-taxonomy-live-ab-v2";

function providerOk(result: unknown) {
  return {
    httpStatus: 200,
    providerResponseConfirmed: true,
    providerResult: result,
  } as const;
}

function expectedOutput(item: (typeof FULL_TAXONOMY_LIVE_AB_V2_CASES)[number]) {
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

describe("FULL_TAXONOMY_LIVE_AB_V2 structured-output repair gate", () => {
  it("reuses the immutable 30-case V1 fixture without changing Ground Truth", () => {
    const validation = validateFullTaxonomyV2Fixture();
    expect(validation.valid).toBe(true);
    expect(validation.caseSetUnchanged).toBe(true);
    expect(FULL_TAXONOMY_LIVE_AB_V2_CASES).toHaveLength(30);
    expect(FULL_TAXONOMY_LIVE_AB_V2_CASES.every((item, index) => item === FULL_TAXONOMY_LIVE_AB_V2_CASES[index])).toBe(true);
  });

  it("adds only the existing structured-output request field", () => {
    const request = buildFullTaxonomyV2AiRequest(FULL_TAXONOMY_LIVE_AB_V2_CASES[0]!);
    expect(request.max_tokens).toBe(800);
    expect(request.temperature).toBe(0);
    expect(request.stream).toBe(false);
    expect(request.response_format).toEqual(FULL_TAXONOMY_LIVE_AB_V2_STRUCTURED_RESPONSE_FORMAT);
    expect(request.messages).toEqual(expect.any(Array));
    expect(request.messages[0]?.content).toContain("OUTPUT_SCHEMA=");
  });

  it("keeps strict validation fail-closed and grants diagnostic evaluation no write authority", () => {
    const gate = runFullTaxonomyV2LocalGate();
    expect(gate.strictEvaluatorFailClosed).toBe("PASS");
    expect(gate.diagnosticEvaluatorNoWriteAuthority).toBe("PASS");
    expect(gate.semanticSignalNotErasedByUnrelatedSchemaError).toBe("PASS");
    expect(FULL_TAXONOMY_LIVE_AB_V2_DIAGNOSTIC_WRITE_AUTHORITY).toBe("NONE");
  });

  it("accepts a direct valid structured JSON object", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(expectedOutput(item)));
    expect(evaluation.jsonParsed).toBe(true);
    expect(evaluation.schemaValidationPass).toBe(true);
    expect(evaluation.strictExact).toBe(true);
    expect(evaluation.semanticExact).toBe(true);
    expect(evaluation.taxonomyCorrectCount).toBe(1);
    expect(evaluation.fieldCorrectCount).toBe(4);
  });

  it("accepts fenced JSON and wrapper prose through the existing bounded parser", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = JSON.stringify(expectedOutput(item));
    const fenced = parseFullTaxonomyV2DiagnosticOutput({ response: `\n\`\`\`json\n${output}\n\`\`\`\n` });
    const wrapper = parseFullTaxonomyV2DiagnosticOutput({ response: `分類完成：\n${output}\n以上。` });
    expect(fenced.jsonParsed).toBe(true);
    expect(fenced.facts).toHaveLength(1);
    expect(wrapper.jsonParsed).toBe(true);
    expect(wrapper.facts[0]?.taxonomyId).toBe("O9");
  });

  it("preserves valid taxonomy and fields when an unrelated root key causes strict failure", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = { ...expectedOutput(item), diagnosticOnly: true } as Record<string, unknown>;
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(false);
    expect(evaluation.strictValidationErrorCode).toBe("SCHEMA_TOP_LEVEL_KEYS_INVALID");
    expect(evaluation.actualFactCount).toBe(1);
    expect(evaluation.taxonomyCorrectCount).toBe(1);
    expect(evaluation.fieldCorrectCount).toBe(4);
  });

  it("keeps semantic comparison measurable when one optional field has the wrong type", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "O01-cough")!;
    const output = expectedOutput(item);
    (output.facts[0]!.fields as Record<string, unknown>).detail = 123;
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(false);
    expect(evaluation.diagnosticStructuralFailures).toContain("FIELD_VALUE_INVALID");
    expect(evaluation.taxonomyCorrectCount).toBe(1);
    expect(evaluation.fieldCorrectCount).toBe(3);
  });

  it("counts unsupported or formal fields as unsafe without erasing safe fields", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = expectedOutput(item);
    (output.facts[0]!.fields as Record<string, unknown>).farmId = "formal-id";
    (output.facts[0]!.fields as Record<string, unknown>).inventedCause = "猜測";
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(false);
    expect(evaluation.unsafeFieldInvention).toBe(2);
    expect(evaluation.taxonomyCorrectCount).toBe(1);
    expect(evaluation.fieldCorrectCount).toBe(4);
  });

  it("fails closed for a missing root field while retaining no fabricated fact", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = expectedOutput(item) as Record<string, unknown>;
    delete output.facts;
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(false);
    expect(evaluation.actualFactCount).toBe(0);
    expect(evaluation.diagnosticStructuralFailures).toContain("ROOT_FACTS_INVALID");
  });

  it("fails closed for wrong subtype but retains the valid taxonomy identity signal", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = expectedOutput(item);
    output.facts[0]!.subtype = "not-a-canonical-subtype";
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(false);
    expect(evaluation.diagnosticStructuralFailures).toContain("FACT_SUBTYPE_INVALID");
    expect(evaluation.taxonomyCorrectCount).toBe(1);
    expect(evaluation.subtypeCorrectCount).toBe(0);
  });

  it("fails closed for malformed JSON and for a non-object JSON document", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const malformed = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk('{"recordWorthiness":"record"'));
    const array = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk("[]"));
    expect(malformed.jsonParsed).toBe(false);
    expect(malformed.schemaValidationPass).toBe(false);
    expect(array.jsonParsed).toBe(true);
    expect(array.schemaValidationPass).toBe(false);
    expect(array.actualFactCount).toBe(0);
  });

  it("reports wrong taxonomy semantics separately when the structural schema is valid", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = expectedOutput(item);
    output.facts[0] = {
      taxonomyId: "A2",
      family: "operational_observation",
      type: "observation",
      subtype: "cough",
      fields: { farmText: "金雞測試場", houseText: "測試一舍", extent: "small" },
      missingFields: [],
    };
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(true);
    expect(evaluation.semanticExact).toBe(false);
    expect(evaluation.taxonomyCorrectCount).toBe(0);
    expect(evaluation.fieldCorrectCount).toBe(0);
  });

  it("reports partial multi-fact fusion without converting it into a schema failure", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "C01-mortality-and-cough")!;
    const output = expectedOutput(item);
    output.facts = [output.facts[0]!];
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(true);
    expect(evaluation.multiFactSplitCorrect).toBe(false);
    expect(evaluation.factFusionErrors).toBe(1);
  });

  it("records safety failure when a question is turned into a fact", () => {
    const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "N01-question")!;
    const positive = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
    const output = { ...expectedOutput(item), recordWorthiness: "record" as const, facts: expectedOutput(positive).facts };
    const evaluation = evaluateFullTaxonomyV2Case(item, MODEL_3B, providerOk(output));
    expect(evaluation.schemaValidationPass).toBe(true);
    expect(evaluation.questionAsFactError).toBe(1);
    expect(evaluation.semanticExact).toBe(false);
  });
});
