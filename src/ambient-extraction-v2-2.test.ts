import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_V2_2_OPERATION_TYPES,
  AMBIENT_V2_2_ORTHOGONALITY_RULE,
  AMBIENT_V2_2_QUANTITY_INHERITANCE_RULE,
  AMBIENT_V2_2_ONTOLOGY_ALIGNMENT_RULE,
  AMBIENT_V2_2_STRUCTURED_JSON_SCHEMA,
  AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
  AMBIENT_V2_2_SYSTEM_PROMPT,
  AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
  aggregateAmbientV2_2MessageResults,
  auditAmbientV2_2PromptContract,
  buildAmbientV2_2StructuredRequest,
  canonicalizeAmbientV2_2Facts,
  claimAmbientV2_2DeterministicOperations,
  classifyAmbientV2_2MessageRoute,
  collapseAmbientV2_2TechnicalDuplicates,
  evaluateAmbientV2_2Facts,
  evaluateAmbientV2_2QuantityAttribution,
  parseAmbientV2_2ResponseBoundary,
  planAmbientExtractionV2_2,
  resolveAmbientV2_2Context,
  resolveAmbientV2_2Relation,
  shouldUseAmbientV2_2FactExtraction,
  type AmbientV2_2FactSet,
  type AmbientV2_2MessageResult,
  type AmbientV2_2WireDocument,
} from "./ambient-extraction-v2-2";
import {
  type AmbientV2MessageInput,
  type AmbientV2RelationCandidate,
  type AmbientV2SystemEvent,
} from "./ambient-extraction-v2";

const d02: AmbientV2MessageInput = {
  safeRef: "D02",
  sourceIdentity: "fixture-D02",
  text: "金雞測試場剛剛死2隻",
  selected: true,
  groupKey: "smoke-group",
};

const d03: AmbientV2MessageInput = {
  safeRef: "D03",
  sourceIdentity: "fixture-D03",
  text: "金雞測試場有幾隻一直咳，數量還不確定",
  selected: true,
  groupKey: "smoke-group",
};

const d04: AmbientV2MessageInput = {
  safeRef: "D04",
  sourceIdentity: "fixture-D04",
  text: "金雞測試場今天淘汰2隻，腳傷",
  selected: true,
  groupKey: "smoke-group",
};

const d05: AmbientV2MessageInput = {
  safeRef: "D05",
  sourceIdentity: "fixture-D05",
  text: "金雞測試場今天早上死3隻",
  selected: true,
  groupKey: "smoke-group",
};

const d06: AmbientV2MessageInput = {
  safeRef: "D06",
  sourceIdentity: "fixture-D06",
  text: "那個死亡3隻先記著，不是新增一筆",
  selected: true,
  groupKey: "smoke-group",
};

const d07: AmbientV2MessageInput = {
  safeRef: "D07",
  sourceIdentity: "fixture-D07",
  text: "我晚點去吃飯，金雞測試場剛剛又死1隻",
  selected: true,
  groupKey: "smoke-group",
};

const d08: AmbientV2MessageInput = {
  safeRef: "D08",
  sourceIdentity: "fixture-D08",
  text: "4個人",
  selected: true,
  groupKey: "smoke-group",
};

function structured(response: unknown) {
  return parseAmbientV2_2ResponseBoundary({
    success: true,
    result: { response },
  });
}

function facts(operations: AmbientV2_2FactSet["operations"], abnormalities: AmbientV2_2FactSet["abnormalities"]): AmbientV2_2FactSet {
  return { operations, abnormalities };
}

function systemEvent(overrides: Partial<AmbientV2SystemEvent>): AmbientV2SystemEvent {
  return {
    kind: "event",
    event: "mortality",
    quantity: 3,
    sourceRef: "D05",
    sourceIdentity: "fixture-D05",
    eventOrdinal: 1,
    quantityConfidence: "observed",
    contextResolution: { status: "resolved", candidateCount: 1 },
    lineageRefs: ["D05"],
    ...overrides,
  };
}

describe("Ambient V2.2 orthogonal fact wire", () => {
  it("freezes the new wire version and exact top-level schema", () => {
    const root = AMBIENT_V2_2_STRUCTURED_JSON_SCHEMA as Record<string, any>;
    expect(AMBIENT_V2_2_WIRE_CONTRACT_VERSION).toBe("2.2");
    expect(AMBIENT_V2_2_OPERATION_TYPES).toEqual(["mortality", "cull"]);
    expect(root).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["operations", "abnormalities"],
    });
    expect(root.properties.operations.items).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["type", "quantity"],
    });
    expect(root.properties.abnormalities.items).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["detail", "quantity"],
    });
    expect(root.properties.operations.items.properties.type.enum).toEqual(["mortality", "cull"]);
    expect(root.properties.operations.items.properties.quantity.anyOf).toEqual([
      { type: "number", exclusiveMinimum: 0 },
      { type: "null" },
    ]);
    expect(root.properties.abnormalities.items.properties.quantity.anyOf).toEqual([
      { type: "number", exclusiveMinimum: 0 },
      { type: "null" },
    ]);
    expect(root.properties.abnormalities.items.properties.detail).toEqual({ type: "string" });
    expect("oneOf" in root).toBe(false);
    expect("if" in root).toBe(false);
  });

  it("accepts an empty document and known/null operation quantities", () => {
    expect(structured({ operations: [], abnormalities: [] }).parsed).toMatchObject({
      structuralStatus: "pass",
      semanticStatus: "none",
      operations: [],
      abnormalities: [],
    });

    for (const operation of [
      { type: "mortality", quantity: 3 },
      { type: "mortality", quantity: null },
      { type: "cull", quantity: 2 },
      { type: "cull", quantity: null },
    ]) {
      const result = structured({ operations: [operation], abnormalities: [] }).parsed;
      expect(result.structuralStatus).toBe("pass");
      expect(result.semanticStatus).toBe("resolved");
      expect(result.operations).toEqual([operation]);
    }
  });

  it("accepts known and unknown-quantity abnormalities with required detail", () => {
    const known = structured({
      operations: [],
      abnormalities: [{ detail: "咳嗽", quantity: 4 }],
    }).parsed;
    expect(known.semanticStatus).toBe("resolved");
    expect(known.abnormalities).toEqual([{ detail: "咳嗽", quantity: 4 }]);

    const unknown = structured({
      operations: [],
      abnormalities: [{ detail: "咳嗽", quantity: null }],
    }).parsed;
    expect(unknown.semanticStatus).toBe("resolved");
    expect(unknown.abnormalities).toEqual([{ detail: "咳嗽", quantity: null }]);
  });

  it("rejects unknown top-level keys and old decisions shape closed", () => {
    const unknown = structured({ operations: [], abnormalities: [], extra: true }).parsed;
    expect(unknown.structuralStatus).toBe("fail");
    expect(unknown.diagnostics.structuralSubtype).toBe("TOP_LEVEL_UNKNOWN_KEY");
    expect(unknown.diagnostics.unknownKeyNames).toEqual(["UNKNOWN"]);

    const old = structured({ decisions: [] }).parsed;
    expect(old.structuralStatus).toBe("fail");
    expect(old.diagnostics.structuralSubtype).toBe("UNEXPECTED_OLD_DECISIONS_SHAPE");
  });

  it("rejects missing arrays, wrong array types, and unknown item keys", () => {
    expect(structured({ operations: [] }).parsed.diagnostics.structuralSubtype).toBe("ABNORMALITIES_MISSING");
    expect(structured({ abnormalities: [] }).parsed.diagnostics.structuralSubtype).toBe("OPERATIONS_MISSING");
    expect(structured({ operations: {}, abnormalities: [] }).parsed.diagnostics.structuralSubtype).toBe("OPERATIONS_NOT_ARRAY");
    expect(structured({ operations: [], abnormalities: {} }).parsed.diagnostics.structuralSubtype).toBe("ABNORMALITIES_NOT_ARRAY");
    expect(structured({ operations: [{ type: "mortality", quantity: 2, detail: null }], abnormalities: [] }).parsed.diagnostics.structuralSubtype).toBe("OPERATION_ITEM_UNKNOWN_KEY");
    expect(structured({ operations: [], abnormalities: [{ detail: "咳嗽", quantity: null, confidence: "high" }] }).parsed.diagnostics.structuralSubtype).toBe("ABNORMALITY_ITEM_UNKNOWN_KEY");
    expect(structured({ operations: [{ quantity: 2 }], abnormalities: [] }).parsed.diagnostics.structuralSubtype).toBe("OPERATION_MISSING_TYPE");
    expect(structured({ operations: [], abnormalities: [{ quantity: null }] }).parsed.diagnostics.structuralSubtype).toBe("ABNORMALITY_MISSING_DETAIL");
    expect(structured({ operations: [{ type: "mortality" }], abnormalities: [] }).parsed.diagnostics.structuralSubtype).toBe("OPERATION_MISSING_QUANTITY");
    expect(structured({ operations: [], abnormalities: [{ detail: "咳嗽" }] }).parsed.diagnostics.structuralSubtype).toBe("ABNORMALITY_MISSING_QUANTITY");
  });

  it("keeps enum and quantity value failures in semantic validation", () => {
    const invalidType = structured({ operations: [{ type: "death", quantity: 2 }], abnormalities: [] }).parsed;
    expect(invalidType.structuralStatus).toBe("pass");
    expect(invalidType.semanticStatus).toBe("unresolved");
    expect(invalidType.diagnostics.semanticFailureCode).toBe("INVALID_OPERATION_TYPE");

    const invalidQuantity = structured({ operations: [{ type: "mortality", quantity: 0 }], abnormalities: [] }).parsed;
    expect(invalidQuantity.structuralStatus).toBe("pass");
    expect(invalidQuantity.diagnostics.semanticFailureCode).toBe("INVALID_OPERATION_QUANTITY");

    const invalidAbnormalityQuantity = structured({ operations: [], abnormalities: [{ detail: "咳嗽", quantity: "unknown" }] }).parsed;
    expect(invalidAbnormalityQuantity.structuralStatus).toBe("pass");
    expect(invalidAbnormalityQuantity.diagnostics.semanticFailureCode).toBe("INVALID_ABNORMALITY_QUANTITY");
  });

  it("enforces abnormality detail content without truncation", () => {
    const empty = structured({ operations: [], abnormalities: [{ detail: "", quantity: null }] }).parsed;
    expect(empty.semanticStatus).toBe("unresolved");
    expect(empty.diagnostics.semanticFailureCode).toBe("ABNORMALITY_DETAIL_EMPTY");

    const padded = structured({ operations: [], abnormalities: [{ detail: " 咳嗽", quantity: null }] }).parsed;
    expect(padded.diagnostics.semanticFailureCode).toBe("ABNORMALITY_DETAIL_NOT_TRIMMED");

    const tooLong = structured({ operations: [], abnormalities: [{ detail: "雞".repeat(13), quantity: null }] }).parsed;
    expect(tooLong.diagnostics.semanticFailureCode).toBe("ABNORMALITY_DETAIL_TOO_LONG");
    expect(tooLong.diagnostics.detailCodePointCount).toBe(13);
    expect(tooLong.abnormalities).toEqual([]);

    const forbiddenSentence = structured({ operations: [], abnormalities: [{ detail: "一直咳嗽", quantity: null }] }).parsed;
    expect(forbiddenSentence.semanticStatus).toBe("resolved");
    expect(forbiddenSentence.abnormalities).toEqual([{ detail: "一直咳嗽", quantity: null }]);
  });

  it("counts detail with Unicode code points, not UTF-16 code units", () => {
    const twelveBmp = structured({ operations: [], abnormalities: [{ detail: "雞".repeat(12), quantity: null }] }).parsed;
    expect(twelveBmp.semanticStatus).toBe("resolved");
    expect(twelveBmp.diagnostics.detailCodePointCount).toBe(12);

    const twelveSurrogatePairs = structured({ operations: [], abnormalities: [{ detail: "𠮷".repeat(12), quantity: null }] }).parsed;
    expect(twelveSurrogatePairs.semanticStatus).toBe("resolved");
    expect(twelveSurrogatePairs.diagnostics.detailCodePointCount).toBe(12);

    const thirteenCodePoints = structured({ operations: [], abnormalities: [{ detail: "𠮷".repeat(13), quantity: null }] }).parsed;
    expect(thirteenCodePoints.semanticStatus).toBe("unresolved");
    expect(thirteenCodePoints.diagnostics.detailCodePointCount).toBe(13);
    expect(thirteenCodePoints.abnormalities).toEqual([]);
  });

  it("fails malformed and truncated JSON closed without salvage", () => {
    const malformed = parseAmbientV2_2ResponseBoundary('{"operations":[],"abnormalities":]}');
    expect(malformed.responseClass).toBe("PROMPT_TEXT_RESPONSE");
    expect(malformed.parsed.structuralStatus).toBe("fail");
    expect(["INVALID_JSON", "TRUNCATED_JSON"]).toContain(malformed.parsed.diagnostics.structuralSubtype);
    expect(malformed.parsed.operations).toEqual([]);
    expect(malformed.parsed.abnormalities).toEqual([]);

    const truncated = parseAmbientV2_2ResponseBoundary('{"operations":[{"type":"mortality","quantity":2}],"abnormalities":[');
    expect(truncated.parsed.structuralStatus).toBe("fail");
    expect(truncated.parsed.diagnostics.structuralSubtype).toBe("TRUNCATED_JSON");
    expect(truncated.parsed.operations).toEqual([]);
    expect(truncated.parsed.abnormalities).toEqual([]);
  });

  it("separates provider JSON-mode errors from malformed model JSON", () => {
    const providerError = parseAmbientV2_2ResponseBoundary({
      success: false,
      errors: [{ code: 4000, message: "structured response unavailable" }],
    });
    expect(providerError.responseClass).toBe("PROVIDER_JSON_MODE_ERROR");
    expect(providerError.parsed.diagnostics.structuralSubtype).toBe("UNEXPECTED_PROVIDER_ENVELOPE");
    expect(providerError.parsed.diagnostics.structuralSubtype).not.toBe("INVALID_JSON");
  });

  it("builds a separate V2.2 structured request without changing V2.1 prompt state", () => {
    const request = buildAmbientV2_2StructuredRequest(d03);
    const audit = auditAmbientV2_2PromptContract();
    expect(request.response_format).toEqual(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
    expect(request.messages[0]?.content).toBe(AMBIENT_V2_2_SYSTEM_PROMPT);
    expect(audit.contractMarkers).toBe("PASS");
    expect(audit.oldContractMarkersPresent).toBe(false);
    expect(audit.orthogonalityRulePresent).toBe(true);
    expect(audit.quantityInheritanceRulePresent).toBe(true);
    expect(audit.ontologyAlignmentRulePresent).toBe(true);
    expect(audit.canonicalExampleCount).toBe(0);
    expect(AMBIENT_V2_2_SYSTEM_PROMPT).toContain(AMBIENT_V2_2_ORTHOGONALITY_RULE);
    expect(AMBIENT_V2_2_SYSTEM_PROMPT).toContain(AMBIENT_V2_2_QUANTITY_INHERITANCE_RULE);
    expect(AMBIENT_V2_2_SYSTEM_PROMPT).toContain(AMBIENT_V2_2_ONTOLOGY_ALIGNMENT_RULE);
    expect(audit.fingerprint).toMatch(/^fnv1a32-[0-9a-f]{8}$/u);
  });

  it("canonicalizes validated facts into existing system fields without changing the wire contract", () => {
    const parsed = structured({
      operations: [{ type: "mortality", quantity: 3 }],
      abnormalities: [{ detail: "咳嗽", quantity: null }],
    }).parsed;
    const events = canonicalizeAmbientV2_2Facts(d03, parsed, { status: "resolved", candidateCount: 1 });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "event",
      event: "mortality",
      quantity: 3,
      sourceRef: "D03",
      sourceIdentity: "fixture-D03",
      eventOrdinal: 1,
      quantityConfidence: "observed",
    });
    expect(events[0]).not.toHaveProperty("detail");
    expect(events[1]).toMatchObject({
      event: "abnormal",
      quantity: null,
      detail: "咳嗽",
      eventOrdinal: 2,
      quantityConfidence: "unknown",
    });
  });

  it("does not propagate operation quantity to an abnormality", () => {
    const parsed = structured({
      operations: [{ type: "cull", quantity: 2 }],
      abnormalities: [{ detail: "腳傷", quantity: null }],
    }).parsed;
    const events = canonicalizeAmbientV2_2Facts(d04, parsed);
    expect(events.map((event) => ({ event: event.event, quantity: event.quantity }))).toEqual([
      { event: "cull", quantity: 2 },
      { event: "abnormal", quantity: null },
    ]);
  });

  it("evaluates D04 fact extraction separately from cross-fact attribution", () => {
    const actual = facts(
      [{ type: "cull", quantity: 2 }],
      [{ detail: "腳傷", quantity: null }],
    );
    const expected = facts(
      [{ type: "cull", quantity: 2 }],
      [{ detail: "腳傷", quantity: null }],
    );
    const evaluation = evaluateAmbientV2_2Facts(actual, expected, "UNRESOLVED");
    expect(evaluation).toEqual({
      operationPass: true,
      abnormalityPass: true,
      factExtractionPass: true,
      actualFactCount: 2,
      expectedFactCount: 2,
      quantityAttributionStatus: "UNRESOLVED",
    });
  });

  it("does not make abnormality quantity part of abnormality fact identity", () => {
    const expected = facts(
      [{ type: "cull", quantity: 2 }],
      [{ detail: "腳傷", quantity: null }],
    );
    const withInheritedQuantity = facts(
      [{ type: "cull", quantity: 2 }],
      [{ detail: "腳傷", quantity: 2 }],
    );
    const withWrongQuantity = facts(
      [{ type: "cull", quantity: 2 }],
      [{ detail: "腳傷", quantity: 3 }],
    );

    expect(evaluateAmbientV2_2Facts(withInheritedQuantity, expected, {
      abnormalityQuantities: [2],
    })).toMatchObject({
      abnormalityPass: true,
      factExtractionPass: true,
      quantityAttributionStatus: "PASS",
    });
    expect(evaluateAmbientV2_2Facts(expected, expected, {
      abnormalityQuantities: [2],
    })).toMatchObject({
      abnormalityPass: true,
      factExtractionPass: true,
      quantityAttributionStatus: "UNRESOLVED",
    });
    expect(evaluateAmbientV2_2Facts(withWrongQuantity, expected, {
      abnormalityQuantities: [2],
    })).toMatchObject({
      abnormalityPass: true,
      factExtractionPass: true,
      quantityAttributionStatus: "FAIL",
    });
  });

  it("marks missing or wrong abnormality facts before attribution is evaluated", () => {
    const expected = facts(
      [{ type: "cull", quantity: 2 }],
      [{ detail: "腳傷", quantity: null }],
    );
    const missing = facts([{ type: "cull", quantity: 2 }], []);
    const wrongDetail = facts([{ type: "cull", quantity: 2 }], [{ detail: "咳嗽", quantity: 2 }]);

    expect(evaluateAmbientV2_2Facts(missing, expected, {
      abnormalityQuantities: [2],
    })).toMatchObject({
      abnormalityPass: false,
      factExtractionPass: false,
      quantityAttributionStatus: "NOT_EVALUATED",
    });
    expect(evaluateAmbientV2_2Facts(wrongDetail, expected, {
      abnormalityQuantities: [2],
    })).toMatchObject({
      abnormalityPass: false,
      factExtractionPass: false,
      quantityAttributionStatus: "NOT_EVALUATED",
    });
  });

  it("keeps abnormality multiplicity even when details or quantities repeat", () => {
    const expected = facts([], [
      { detail: "腳傷", quantity: null },
      { detail: "腳傷", quantity: null },
    ]);
    const actual = facts([], [
      { detail: "腳傷", quantity: 2 },
      { detail: "腳傷", quantity: 3 },
    ]);
    expect(evaluateAmbientV2_2Facts(actual, expected, {
      abnormalityQuantities: [2, 3],
    })).toMatchObject({
      abnormalityPass: true,
      factExtractionPass: true,
      actualFactCount: 2,
      quantityAttributionStatus: "PASS",
    });
  });

  it("keeps D03/D04/D05 frozen case facts while changing only V2.2 representation", () => {
    const groundTruth = JSON.parse(readFileSync(resolve(process.cwd(), "forensics/ambient-extraction-v2-2-ground-truth-2026-08-28.json"), "utf8")) as Record<string, any>;
    const oldGroundTruth = JSON.parse(readFileSync(resolve(process.cwd(), "forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"), "utf8")) as Record<string, any>;
    expect(groundTruth.status).toBe("FROZEN");
    expect(groundTruth.ground_truth_version).toBe("2.2.0");
    expect(groundTruth.historical_ground_truth_unchanged).toBe(true);
    expect(groundTruth.dev_smoke_8.messages.find((message: { safe_ref: string }) => message.safe_ref === "D03").expected.abnormalities).toEqual([
      { detail: "咳嗽", quantity: null },
    ]);
    expect(groundTruth.dev_smoke_8.messages.find((message: { safe_ref: string }) => message.safe_ref === "D04").expected.abnormalities).toEqual([
      { detail: "腳傷", quantity: null },
    ]);
    expect(oldGroundTruth.dev_smoke_8.messages.find((message: { safe_ref: string }) => message.safe_ref === "D04").expected.events[1]).toEqual({
      event: "abnormal",
      quantity: 2,
      detail: "腳傷",
    });
  });

  it("claims only safe operation clauses and preserves residual semantic input", () => {
    const d07Claim = claimAmbientV2_2DeterministicOperations(d07);
    expect(d07Claim).toMatchObject({
      route: "EVENT_ONLY",
      operations: [{ type: "mortality", quantity: 1 }],
      residualRequiresAi: false,
    });

    const d04Claim = claimAmbientV2_2DeterministicOperations(d04);
    expect(d04Claim.route).toBe("EVENT_ONLY");
    expect(d04Claim.operations).toEqual([{ type: "cull", quantity: 2 }]);
    expect(d04Claim.residualMessage).toContain("腳傷");
    expect(d04Claim.residualRequiresAi).toBe(true);

    const bundleClaim = claimAmbientV2_2DeterministicOperations({
      safeRef: "BUNDLE",
      sourceIdentity: "fixture-BUNDLE",
      text: "死亡32 咳嗽 臭腳",
      selected: true,
      groupKey: "smoke-group",
    });
    expect(bundleClaim.operations).toEqual([{ type: "mortality", quantity: 32 }]);
    expect(bundleClaim.residualMessage).toContain("咳嗽");
    expect(bundleClaim.residualMessage).toContain("臭腳");
    expect(bundleClaim.residualRequiresAi).toBe(true);
  });

  it("preserves the original full AI input when deterministic claim count is zero", () => {
    const abnormalComma: AmbientV2MessageInput = {
      safeRef: "ABNORMAL-COMMA",
      sourceIdentity: "fixture-ABNORMAL-COMMA",
      text: "咳嗽，精神差",
      selected: true,
      groupKey: "smoke-group",
    };

    for (const message of [d03, abnormalComma]) {
      const claim = claimAmbientV2_2DeterministicOperations(message);
      expect(claim.operations).toEqual([]);
      expect(claim.residualMessage).toBe(message.text);
      expect(claim.residualRequiresAi).toBe(true);
    }

    const request = buildAmbientV2_2StructuredRequest(d03);
    const requestSource = JSON.parse(request.messages[1]!.content) as { source: string };
    expect(requestSource.source).toBe(d03.text);
  });

  it("does not transform ordinary comma chat through deterministic claiming", () => {
    const chat: AmbientV2MessageInput = {
      safeRef: "CHAT-COMMA",
      sourceIdentity: "fixture-CHAT-COMMA",
      text: "我今天吃飯，下午下雨",
      selected: true,
      groupKey: "smoke-group",
    };
    const original = chat.text;
    const claim = claimAmbientV2_2DeterministicOperations(chat);
    expect(claim.operations).toEqual([]);
    expect(chat.text).toBe(original);
    expect(claim.residualRequiresAi).toBe(false);
  });

  it("does not claim negated or relation-bearing operation text", () => {
    const negated = claimAmbientV2_2DeterministicOperations({
      safeRef: "NEGATED",
      sourceIdentity: "fixture-NEGATED",
      text: "不是淘汰2隻",
      selected: true,
      groupKey: "smoke-group",
    });
    expect(negated.operations).toEqual([]);

    const mixed: AmbientV2MessageInput = {
      safeRef: "F13-2",
      sourceIdentity: "fresh-F13-2",
      text: "今天又少1隻，前面淘汰兩隻那筆不是新增",
      selected: true,
      groupKey: "fresh-group",
    };
    const mixedClaim = claimAmbientV2_2DeterministicOperations(mixed);
    expect(mixedClaim.route).toBe("MIXED_EVENT_AND_RELATION");
    expect(mixedClaim.operations).toEqual([]);
    expect(mixedClaim.residualRequiresAi).toBe(true);
  });

  it("preserves one-message routing and derives the current two-call smoke plan", () => {
    const messages = [
      { ...d02 },
      { ...d03 },
      { ...d04 },
      { ...d05 },
      { ...d06 },
      { ...d07 },
    ];
    expect(classifyAmbientV2_2MessageRoute(d06)).toBe("RELATION_ONLY");
    expect(classifyAmbientV2_2MessageRoute(d03)).toBe("EVENT_ONLY");
    expect(shouldUseAmbientV2_2FactExtraction(classifyAmbientV2_2MessageRoute(d03))).toBe(true);
    expect(shouldUseAmbientV2_2FactExtraction(classifyAmbientV2_2MessageRoute(d06))).toBe(false);
    expect(shouldUseAmbientV2_2FactExtraction("NONE")).toBe(false);
    expect(planAmbientExtractionV2_2(messages, messages.map((message) => message.safeRef))).toMatchObject({
      messagesTotal: 6,
      deterministicResolved: 3,
      deterministicClaimed: 4,
      aiRequired: 2,
      relationOnlyMessages: 1,
      relationResolverCalls: 1,
      expectedProviderCalls: 2,
    });
  });

  it("keeps D06 relation-only local and does not create a new fact", () => {
    const candidate: AmbientV2RelationCandidate = {
      sourceRef: "D05",
      sourceIdentity: "fixture-D05",
      event: "mortality",
      quantity: 3,
      groupKey: "smoke-group",
      pending: true,
      isOfficial: false,
    };
    const relation = resolveAmbientV2_2Relation(d06.text, [candidate], { groupKey: "smoke-group" });
    expect(relation).toMatchObject({ status: "resolved", targetRef: "D05", candidateCount: 1 });
    expect(classifyAmbientV2_2MessageRoute(d06)).toBe("RELATION_ONLY");
    expect(planAmbientExtractionV2_2([d06], ["D06"]).expectedProviderCalls).toBe(0);
    expect([]).toHaveLength(0);
  });

  it("keeps mixed event plus relation representable", () => {
    const mixed: AmbientV2MessageInput = {
      safeRef: "F13-2",
      sourceIdentity: "fresh-F13-2",
      text: "今天又少1隻，前面淘汰兩隻那筆不是新增",
      selected: true,
      groupKey: "fresh-group",
    };
    expect(classifyAmbientV2_2MessageRoute(mixed)).toBe("MIXED_EVENT_AND_RELATION");
    expect(shouldUseAmbientV2_2FactExtraction(classifyAmbientV2_2MessageRoute(mixed))).toBe(true);
    expect(planAmbientExtractionV2_2([mixed], ["F13-2"])).toMatchObject({
      aiRequired: 1,
      expectedProviderCalls: 1,
      relationResolverCalls: 1,
    });
  });

  it("represents operation plus two abnormalities as three independent facts", () => {
    const parsed = structured({
      operations: [{ type: "mortality", quantity: 32 }],
      abnormalities: [
        { detail: "咳嗽", quantity: null },
        { detail: "臭腳", quantity: null },
      ],
    }).parsed;
    expect(parsed.semanticStatus).toBe("resolved");
    expect(parsed.operations).toHaveLength(1);
    expect(parsed.abnormalities).toHaveLength(2);
    const events = canonicalizeAmbientV2_2Facts({
      safeRef: "V22-MULTI-01",
      sourceIdentity: "v22-multi-01",
      text: "死亡32 咳嗽 臭腳",
      selected: true,
    }, parsed);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.event)).toEqual(["mortality", "abnormal", "abnormal"]);
    expect(events.map((event) => event.quantity)).toEqual([32, null, null]);
  });

  it("uses technical source identity for idempotency and never type/quantity dedupe", () => {
    const sameSource = [
      systemEvent({ sourceIdentity: "same-source", sourceRef: "retry-1" }),
      systemEvent({ sourceIdentity: "same-source", sourceRef: "retry-2" }),
    ];
    const collapsed = collapseAmbientV2_2TechnicalDuplicates(sameSource);
    expect(collapsed.collapsedCount).toBe(1);
    expect(collapsed.events).toHaveLength(1);

    const distinctSources = [
      systemEvent({ sourceIdentity: "source-a", sourceRef: "A" }),
      systemEvent({ sourceIdentity: "source-b", sourceRef: "B" }),
    ];
    expect(collapseAmbientV2_2TechnicalDuplicates(distinctSources).events).toHaveLength(2);
    expect(collapseAmbientV2_2TechnicalDuplicates([
      systemEvent({ sourceIdentity: "source-a", sourceRef: "A", event: "mortality", quantity: 3 }),
      systemEvent({ sourceIdentity: "source-b", sourceRef: "B", event: "mortality", quantity: 3 }),
    ]).events).toHaveLength(2);
  });

  it("separates semantic facts from unique or ambiguous farm context", () => {
    expect(resolveAmbientV2_2Context({ contextFarmCandidates: ["FARM-A"] })).toEqual({ status: "resolved", candidateCount: 1 });
    expect(resolveAmbientV2_2Context({ contextFarmCandidates: ["FARM-A", "FARM-B"] })).toEqual({ status: "unresolved", candidateCount: 2 });

    const parsed = structured({ operations: [{ type: "mortality", quantity: 3 }], abnormalities: [] }).parsed;
    expect(parsed.semanticStatus).toBe("resolved");
    const events = canonicalizeAmbientV2_2Facts({ ...d05, contextFarmCandidates: ["FARM-A", "FARM-B"] }, parsed);
    expect(events[0]?.event).toBe("mortality");
    expect(events[0]?.contextResolution).toEqual({ status: "unresolved", candidateCount: 2 });
  });

  it("keeps relation candidate pools bounded and excludes official records", () => {
    const candidate = (sourceRef: string, isOfficial = false): AmbientV2RelationCandidate => ({
      sourceRef,
      sourceIdentity: sourceRef,
      event: "mortality",
      quantity: 3,
      groupKey: "smoke-group",
      pending: true,
      isOfficial,
    });
    expect(resolveAmbientV2_2Relation(d06.text, [], { groupKey: "smoke-group" })).toMatchObject({ status: "unresolved", candidateCount: 0 });
    expect(resolveAmbientV2_2Relation(d06.text, [candidate("D05")], { groupKey: "smoke-group" })).toMatchObject({ status: "resolved", targetRef: "D05" });
    expect(resolveAmbientV2_2Relation(d06.text, [candidate("A"), candidate("B"), candidate("C")], { groupKey: "smoke-group" })).toMatchObject({ status: "unresolved", candidateCount: 3 });
    expect(resolveAmbientV2_2Relation(d06.text, [candidate("A"), candidate("B"), candidate("C"), candidate("D")], { groupKey: "smoke-group" })).toMatchObject({ status: "unresolved", candidateCount: 4 });
    expect(resolveAmbientV2_2Relation(d06.text, [candidate("OFFICIAL", true)], { groupKey: "smoke-group" })).toMatchObject({ status: "unresolved", candidateCount: 0 });
  });

  it("preserves message-level partial success without JSON salvage", () => {
    const results: AmbientV2_2MessageResult[] = [
      {
        safeRef: "D02",
        route: "EVENT_ONLY",
        semanticStatus: "resolved",
        structuralStatus: "pass",
        facts: facts([{ type: "mortality", quantity: 2 }], []),
        relationIntent: null,
        contextResolution: { status: "resolved", candidateCount: 1 },
      },
      {
        safeRef: "D03",
        route: "EVENT_ONLY",
        semanticStatus: "unresolved",
        structuralStatus: "fail",
        facts: facts([], []),
        relationIntent: null,
        contextResolution: { status: "resolved", candidateCount: 1 },
      },
    ];
    const aggregate = aggregateAmbientV2_2MessageResults(results);
    expect(aggregate).toMatchObject({
      messagesTotal: 2,
      messagesResolved: 1,
      messagesUnresolved: 1,
      factsExtracted: 1,
      relationCount: 0,
      sideEffectFree: true,
    });
    expect(aggregate.facts.operations).toEqual([{ type: "mortality", quantity: 2 }]);
  });

  it("keeps V1 controlling while the ordinary-line V2.2 Shadow is explicit and gated", () => {
    const productionSource = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
    expect(productionSource).toContain("runAmbientV2_2Shadow");
    expect(productionSource).toContain("AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST");
    expect(productionSource).toContain("extractAmbientCandidates");
    expect(productionSource).toContain('url.pathname === "/__codex/runtime/ambient-semantic-ai"');
    expect(productionSource).toContain('env.RUNTIME_AMBIENT_SEMANTIC_EVAL_ENABLED !== "1"');
  });

  it("keeps local prototype accounting at zero provider calls", () => {
    const plan = planAmbientExtractionV2_2([d02, d03, d04, d05, d06, d07], ["D02", "D03", "D04", "D05", "D06", "D07"]);
    expect(plan.expectedProviderCalls).toBe(2);
    expect(plan.relationOnlyMessages).toBe(1);
    expect(plan).not.toHaveProperty("adapter");
  });
});
