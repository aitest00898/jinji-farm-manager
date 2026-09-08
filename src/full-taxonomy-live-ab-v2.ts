import { aiResponseText, extractJsonValue } from "./ai-json.ts";
import type { AmbientV2ResponseFormat } from "./ambient-extraction-v2.ts";
import {
  RECORDING_SEXES,
  RECORDING_TAXONOMY,
  type RecordingFamily,
  type TaxonomyId,
  taxonomyDefinitionFor,
} from "./recording-taxonomy.ts";
import {
  FULL_TAXONOMY_LIVE_AB_V1_CASES,
  LIVE_AB_OUTPUT_ALLOWED_KEYS,
  LIVE_AB_OUTPUT_SCHEMA,
  MODEL_3B,
  MODEL_8B,
  buildFullTaxonomyAiRequest,
  evaluateFullTaxonomyCase,
  stableJson,
  validateFullTaxonomyBenchmarkFixture,
  validateFullTaxonomyBenchmarkOutput,
  type BenchmarkExpectedFact,
  type BenchmarkModel,
  type BenchmarkTransportResult,
  type FullTaxonomyBenchmarkCase,
  type FullTaxonomyCaseEvaluation,
} from "./full-taxonomy-live-ab-v1.ts";

/**
 * V2 is a new benchmark contract. V1 cases and Ground Truth are reused by
 * reference, never edited, so the only benchmark variable is provider-
 * enforced structured output.
 */
export const BENCHMARK_VERSION_V2 = "FULL_TAXONOMY_LIVE_AB_V2" as const;
export const FULL_TAXONOMY_LIVE_AB_V2_CASES: readonly FullTaxonomyBenchmarkCase[] = Object.freeze([
  ...FULL_TAXONOMY_LIVE_AB_V1_CASES,
]);

/** The V2 provider schema is exactly the immutable V1 semantic schema. */
export const FULL_TAXONOMY_LIVE_AB_V2_JSON_SCHEMA = LIVE_AB_OUTPUT_SCHEMA;
export const FULL_TAXONOMY_LIVE_AB_V2_STRUCTURED_RESPONSE_FORMAT: AmbientV2ResponseFormat = {
  type: "json_schema",
  json_schema: FULL_TAXONOMY_LIVE_AB_V2_JSON_SCHEMA,
};

export const FULL_TAXONOMY_LIVE_AB_V2_PROMPT_SPEC = Object.freeze({
  responseFormat: "provider_enforced_json_schema",
  promptUnchangedFrom: "FULL_TAXONOMY_LIVE_AB_V1",
  schemaUnchangedFrom: "FULL_TAXONOMY_LIVE_AB_V1",
  noFormalIds: true,
  noDatabaseAccess: true,
  noDiagnosis: true,
  noInventedValues: true,
});

export const FULL_TAXONOMY_LIVE_AB_V2_HARNESS_SPEC = Object.freeze({
  version: "single-agent-direct-rest-v2-structured-output",
  maxConcurrentAiCalls: 1,
  retries: 0,
  caseGrouping: "one case per request",
  caseOrder: "FULL_TAXONOMY_LIVE_AB_V2_CASES array order",
  responseFormat: "json_schema",
  structuredOutput: true,
  maxTokens: 800,
  temperature: 0,
  requestShape: "messages + max_tokens + temperature + response_format + stream:false; model is endpoint path only",
  productionBindings: false,
});

export type FullTaxonomyV2AiRequest = ReturnType<typeof buildFullTaxonomyAiRequest> & {
  response_format: AmbientV2ResponseFormat;
  stream: false;
};

/**
 * Preserve the V1 messages, token budget, and temperature. V2 adds only the
 * already-proven structured-output wire field and non-streaming mode.
 */
export function buildFullTaxonomyV2AiRequest(item: FullTaxonomyBenchmarkCase): FullTaxonomyV2AiRequest {
  return {
    ...buildFullTaxonomyAiRequest(item),
    response_format: FULL_TAXONOMY_LIVE_AB_V2_STRUCTURED_RESPONSE_FORMAT,
    stream: false,
  };
}

export function validateFullTaxonomyV2Fixture(): {
  valid: boolean;
  errors: string[];
  caseSetUnchanged: boolean;
} {
  const validation = validateFullTaxonomyBenchmarkFixture(FULL_TAXONOMY_LIVE_AB_V2_CASES);
  const caseSetUnchanged = FULL_TAXONOMY_LIVE_AB_V2_CASES.length === FULL_TAXONOMY_LIVE_AB_V1_CASES.length
    && FULL_TAXONOMY_LIVE_AB_V2_CASES.every((item, index) => item === FULL_TAXONOMY_LIVE_AB_V1_CASES[index]);
  return {
    valid: validation.valid && caseSetUnchanged,
    errors: [...validation.errors, ...(caseSetUnchanged ? [] : ["case_set_changed_from_v1"])],
    caseSetUnchanged,
  };
}

export function fullTaxonomyV2FingerprintMaterials(): Record<string, string> {
  return {
    caseSet: stableJson({ benchmarkVersion: BENCHMARK_VERSION_V2, cases: FULL_TAXONOMY_LIVE_AB_V2_CASES }),
    prompt: stableJson({ promptSpec: FULL_TAXONOMY_LIVE_AB_V2_PROMPT_SPEC, schema: FULL_TAXONOMY_LIVE_AB_V2_JSON_SCHEMA }),
    schema: stableJson(FULL_TAXONOMY_LIVE_AB_V2_JSON_SCHEMA),
    evaluator: stableJson({
      strict: "validateFullTaxonomyBenchmarkOutput from FULL_TAXONOMY_LIVE_AB_V1",
      diagnostic: "bounded semantic projection; no write authority",
    }),
    harness: stableJson(FULL_TAXONOMY_LIVE_AB_V2_HARNESS_SPEC),
  };
}

const MODEL_SCOPE_FIELDS = ["farmText", "houseText", "flockText", "linkedMortalityEventText"] as const;
const MODEL_CONTEXT_FIELD_ALIASES: Readonly<Record<string, string>> = {
  houseId: "houseText",
  flockId: "flockText",
  linkedMortalityEventId: "linkedMortalityEventText",
};
const MODEL_FORMAL_FIELDS = new Set([
  "id",
  "recordId",
  "farmId",
  "houseId",
  "flockId",
  "sourceMessageId",
  "sourceCandidateId",
  "actorId",
  "confirmedBy",
  "clientOperationId",
  "createdAt",
  "occurredAt",
  "correctionOfId",
  "reversalOfId",
  "replacementOfId",
  "rawText",
]);
const NUMBER_FIELDS = new Set([
  "maleCount",
  "femaleCount",
  "quantity",
  "weight",
  "totalWeight",
  "averageWeight",
  "measuredTemperature",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelFieldName(field: string): string {
  return MODEL_CONTEXT_FIELD_ALIASES[field] ?? field;
}

function validTaxonomyId(value: unknown): value is TaxonomyId {
  return typeof value === "string" && RECORDING_TAXONOMY.some((definition) => definition.id === value);
}

function fieldAllowedForFact(taxonomyId: TaxonomyId | null, field: string): boolean {
  if (MODEL_SCOPE_FIELDS.includes(field as (typeof MODEL_SCOPE_FIELDS)[number])) return true;
  if (!taxonomyId) return false;
  const definition = taxonomyDefinitionFor(taxonomyId);
  return [...definition.requiredFields, ...definition.optionalFields].map(modelFieldName).includes(field);
}

function fieldHasValidShape(field: string, value: unknown): value is string | number {
  if (NUMBER_FIELDS.has(field)) return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string"
    && value.length > 0
    && value.length <= 240
    && !/[\u0000-\u001F\u007F]/u.test(value);
}

function fieldHasValidValue(field: string, value: string | number): boolean {
  if (field === "sex") return typeof value === "string" && RECORDING_SEXES.includes(value as (typeof RECORDING_SEXES)[number]);
  if (field === "condition") return typeof value === "string" && ["good", "fair", "poor"].includes(value);
  if (field === "extent") return typeof value === "string" && ["small", "medium", "large"].includes(value);
  if (field === "weightUnit") return typeof value === "string" && ["kg", "bag"].includes(value);
  if (field === "workflowStatus") return typeof value === "string" && ["pending", "waiting_result", "completed"].includes(value);
  if (["quantity", "maleCount", "femaleCount"].includes(field)) return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (["weight", "totalWeight", "averageWeight"].includes(field)) return typeof value === "number" && Number.isFinite(value) && value > 0;
  return true;
}

function addFailure(failures: Set<string>, code: string): void {
  failures.add(code);
}

type DiagnosticActualFact = {
  taxonomyId: TaxonomyId | null;
  family: RecordingFamily | null;
  type: "event" | "action" | "observation" | null;
  subtype: string | null;
  fields: Record<string, string | number>;
  missingFields: string[];
};

interface DiagnosticParsedOutput {
  jsonParsed: boolean;
  root: Record<string, unknown> | null;
  recordWorthiness: "record" | "candidate" | "ignore" | null;
  facts: DiagnosticActualFact[];
  missingFields: string[];
  clarificationExpected: boolean | null;
  correctionExpected: boolean | null;
  uncertaintyExpected: boolean | null;
  structuralFailures: string[];
  unsafeFieldInvention: number;
}

function parseDiagnosticDocument(result: unknown): { parsed: unknown; jsonParsed: boolean; failure: string | null } {
  const text = aiResponseText(result);
  if (text.trim()) {
    const parsed = extractJsonValue(text);
    return parsed === null
      ? { parsed: null, jsonParsed: false, failure: "JSON_INVALID" }
      : { parsed, jsonParsed: true, failure: null };
  }
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, "recordWorthiness")) {
    return { parsed: result, jsonParsed: true, failure: null };
  }
  return { parsed: null, jsonParsed: false, failure: "JSON_EMPTY" };
}

/**
 * Bounded semantic projection. It intentionally does not return a value that
 * any Production write path can consume. It preserves valid facts/fields
 * when a separate root or sibling field is malformed, while the strict V1
 * validator remains the contract authority.
 */
export function parseFullTaxonomyV2DiagnosticOutput(result: unknown): DiagnosticParsedOutput {
  const document = parseDiagnosticDocument(result);
  if (!document.jsonParsed || !isRecord(document.parsed)) {
    return {
      jsonParsed: document.jsonParsed,
      root: null,
      recordWorthiness: null,
      facts: [],
      missingFields: [],
      clarificationExpected: null,
      correctionExpected: null,
      uncertaintyExpected: null,
      structuralFailures: [document.failure ?? "ROOT_OBJECT_INVALID"],
      unsafeFieldInvention: 0,
    };
  }

  const root = document.parsed;
  const failures = new Set<string>();
  if (Object.keys(root).length !== LIVE_AB_OUTPUT_ALLOWED_KEYS.length
    || LIVE_AB_OUTPUT_ALLOWED_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(root, key))) {
    addFailure(failures, "ROOT_KEYS_INVALID");
  }

  const recordWorthiness = ["record", "candidate", "ignore"].includes(String(root.recordWorthiness))
    ? root.recordWorthiness as "record" | "candidate" | "ignore"
    : null;
  if (!recordWorthiness) addFailure(failures, "ROOT_RECORD_WORTHINESS_INVALID");

  const rootMissingFields = Array.isArray(root.missingFields)
    ? root.missingFields.filter((value): value is string => typeof value === "string")
    : [];
  if (!Array.isArray(root.missingFields)
    || rootMissingFields.length !== root.missingFields.length
    || new Set(rootMissingFields).size !== rootMissingFields.length) {
    addFailure(failures, "ROOT_MISSING_FIELDS_INVALID");
  }

  const flagValue = (key: "clarificationExpected" | "correctionExpected" | "uncertaintyExpected"): boolean | null => {
    if (typeof root[key] === "boolean") return root[key] as boolean;
    addFailure(failures, `ROOT_FLAG_INVALID:${key}`);
    return null;
  };

  const facts: DiagnosticActualFact[] = [];
  let unsafeFieldInvention = 0;
  if (!Array.isArray(root.facts)) {
    addFailure(failures, "ROOT_FACTS_INVALID");
  } else {
    for (const item of root.facts) {
      if (!isRecord(item)) {
        addFailure(failures, "FACT_ITEM_INVALID");
        continue;
      }

      const taxonomyId = validTaxonomyId(item.taxonomyId) ? item.taxonomyId : null;
      if (!taxonomyId) addFailure(failures, "FACT_TAXONOMY_ID_INVALID");
      const definition = taxonomyId ? taxonomyDefinitionFor(taxonomyId) : null;
      const family = typeof item.family === "string" && ["operational_event", "operational_action", "operational_observation"].includes(item.family)
        ? item.family as RecordingFamily
        : null;
      const type = typeof item.type === "string" && ["event", "action", "observation"].includes(item.type)
        ? item.type as "event" | "action" | "observation"
        : null;
      if (!definition || family !== definition.family || type !== definition.canonicalType) addFailure(failures, "FACT_CONTRACT_INVALID");

      let subtype: string | null = null;
      if (item.subtype === null) {
        subtype = null;
      } else if (typeof item.subtype === "string" && definition?.canonicalSubtypes.includes(item.subtype)) {
        subtype = item.subtype;
      } else {
        addFailure(failures, "FACT_SUBTYPE_INVALID");
      }

      const fields: Record<string, string | number> = {};
      if (!isRecord(item.fields)) {
        addFailure(failures, "FACT_FIELDS_INVALID");
      } else {
        for (const [field, value] of Object.entries(item.fields)) {
          const forbidden = MODEL_FORMAL_FIELDS.has(field) || Boolean(definition?.derivedFields.includes(field));
          if (forbidden || !fieldAllowedForFact(taxonomyId, field)) {
            unsafeFieldInvention += 1;
            addFailure(failures, forbidden ? "UNSAFE_FORMAL_OR_DERIVED_FIELD" : "FIELD_UNSUPPORTED");
            continue;
          }
          if (!fieldHasValidShape(field, value) || !fieldHasValidValue(field, value)) {
            addFailure(failures, "FIELD_VALUE_INVALID");
            continue;
          }
          fields[field] = value;
        }
      }

      const missingFields = Array.isArray(item.missingFields)
        ? item.missingFields.filter((value): value is string => typeof value === "string")
        : [];
      if (!Array.isArray(item.missingFields)
        || missingFields.length !== item.missingFields.length
        || new Set(missingFields).size !== missingFields.length) {
        addFailure(failures, "FACT_MISSING_FIELDS_INVALID");
      }
      facts.push({ taxonomyId, family, type, subtype, fields, missingFields });
    }
  }

  return {
    jsonParsed: true,
    root,
    recordWorthiness,
    facts,
    missingFields: [...new Set(rootMissingFields)],
    clarificationExpected: flagValue("clarificationExpected"),
    correctionExpected: flagValue("correctionExpected"),
    uncertaintyExpected: flagValue("uncertaintyExpected"),
    structuralFailures: [...failures].sort(),
    unsafeFieldInvention,
  };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.length === right.length && left.every((value) => rightSet.has(value));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return typeof left === typeof right && left === right;
}

function expectedMissingFields(item: FullTaxonomyBenchmarkCase): Set<string> {
  return new Set([...item.missingFields, ...item.facts.flatMap((fact) => fact.missingFields)]);
}

function matchFacts(expected: readonly BenchmarkExpectedFact[], actual: readonly DiagnosticActualFact[]): Array<{ expected: BenchmarkExpectedFact; actual: DiagnosticActualFact }> {
  const unused = new Set(expected.map((_item, index) => index));
  const matches: Array<{ expected: BenchmarkExpectedFact; actual: DiagnosticActualFact }> = [];
  for (const actualFact of actual) {
    if (!actualFact.taxonomyId) continue;
    const candidates = [...unused].filter((index) => expected[index]!.taxonomyId === actualFact.taxonomyId);
    const subtypeMatch = candidates.find((index) => expected[index]!.subtype === actualFact.subtype);
    const index = subtypeMatch ?? candidates[0];
    if (index === undefined) continue;
    unused.delete(index);
    matches.push({ expected: expected[index]!, actual: actualFact });
  }
  return matches;
}

function countExpectedFields(facts: readonly BenchmarkExpectedFact[]): number {
  return facts.reduce((sum, fact) => sum + Object.keys(fact.expectedFields).length, 0);
}

function fieldSwapCount(expected: readonly BenchmarkExpectedFact[], actual: readonly DiagnosticActualFact[]): number {
  const pairs: readonly (readonly [string, string])[] = [
    ["quantity", "weight"],
    ["vendor", "content"],
    ["farmText", "houseText"],
    ["houseText", "flockText"],
    ["sex", "subtype"],
    ["result", "content"],
  ];
  let swaps = 0;
  for (const match of matchFacts(expected, actual)) {
    for (const [left, right] of pairs) {
      const expectedLeft = match.expected.expectedFields[left];
      const expectedRight = match.expected.expectedFields[right];
      const actualLeft = match.actual.fields[left];
      const actualRight = match.actual.fields[right];
      if (expectedLeft !== undefined && expectedRight === undefined && actualLeft === undefined && valuesEqual(actualRight, expectedLeft)) swaps += 1;
      if (expectedRight !== undefined && expectedLeft === undefined && actualRight === undefined && valuesEqual(actualLeft, expectedRight)) swaps += 1;
    }
  }
  return swaps;
}

export interface FullTaxonomyV2CaseEvaluation {
  caseId: string;
  model: BenchmarkModel;
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  providerErrorCode: string | null;
  providerErrorClass: string | null;
  jsonParsed: boolean;
  schemaValidationPass: boolean;
  strictValidationErrorCode: string | null;
  strictExact: boolean;
  semanticExact: boolean;
  diagnosticRecordWorthiness: "record" | "candidate" | "ignore" | null;
  expectedRecordWorthiness: "record" | "candidate" | "ignore";
  expectedFactCount: number;
  actualFactCount: number;
  taxonomyCorrectCount: number;
  familyCorrectCount: number;
  subtypeCorrectCount: number;
  expectedFieldCount: number;
  actualFieldCount: number;
  comparableFieldCount: number;
  fieldCorrectCount: number;
  expectedMissingFieldCount: number;
  missingFieldDetectedCount: number;
  minimumQuestionApplicable: boolean;
  minimumQuestionCorrect: boolean;
  multiFactSplitCorrect: boolean | null;
  fieldSwapErrors: number;
  unsafeFieldInvention: number;
  factFusionErrors: number;
  extraFactErrors: number;
  quantityCrossFactContamination: number;
  questionAsFactError: number;
  hypotheticalAsFactError: number;
  negationAsFactError: number;
  correctionAsNewEventError: number;
  diagnosticStructuralFailures: string[];
}

function strictEvaluation(
  item: FullTaxonomyBenchmarkCase,
  model: BenchmarkModel,
  transport: BenchmarkTransportResult,
): FullTaxonomyCaseEvaluation {
  return evaluateFullTaxonomyCase(item, model, transport);
}

export const FULL_TAXONOMY_LIVE_AB_V2_DIAGNOSTIC_WRITE_AUTHORITY = "NONE" as const;

export function evaluateFullTaxonomyV2Case(
  item: FullTaxonomyBenchmarkCase,
  model: BenchmarkModel,
  transport: BenchmarkTransportResult,
): FullTaxonomyV2CaseEvaluation {
  const strict = strictEvaluation(item, model, transport);
  const diagnostic = transport.providerResponseConfirmed && Object.prototype.hasOwnProperty.call(transport, "providerResult")
    ? parseFullTaxonomyV2DiagnosticOutput(transport.providerResult)
    : {
        jsonParsed: false,
        root: null,
        recordWorthiness: null,
        facts: [],
        missingFields: [],
        clarificationExpected: null,
        correctionExpected: null,
        uncertaintyExpected: null,
        structuralFailures: [transport.errorClass ?? "PROVIDER_RESPONSE_NOT_AVAILABLE"],
        unsafeFieldInvention: 0,
      } satisfies DiagnosticParsedOutput;
  const actualFacts = diagnostic.facts;
  const matches = matchFacts(item.facts, actualFacts);
  const expectedMissing = expectedMissingFields(item);
  const actualMissing = new Set([...diagnostic.missingFields, ...actualFacts.flatMap((fact) => fact.missingFields)]);
  let fieldCorrectCount = 0;
  let comparableFieldCount = 0;
  for (const match of matches) {
    for (const [field, expectedValue] of Object.entries(match.expected.expectedFields)) {
      if (Object.prototype.hasOwnProperty.call(match.actual.fields, field)) {
        comparableFieldCount += 1;
        if (valuesEqual(match.actual.fields[field], expectedValue)) fieldCorrectCount += 1;
      }
    }
  }
  const actualFieldCount = actualFacts.reduce((sum, fact) => sum + Object.keys(fact.fields).length, 0);
  const missingFieldDetectedCount = [...expectedMissing].filter((field) => actualMissing.has(field)).length;
  const recordWorthinessExact = diagnostic.recordWorthiness === item.recordWorthiness;
  const semanticExact = Boolean(
    diagnostic.jsonParsed
    && diagnostic.facts.length === item.expectedFactCount
    && recordWorthinessExact
    && sameSet([...actualMissing], [...expectedMissing])
    && diagnostic.clarificationExpected === item.clarificationExpected
    && diagnostic.correctionExpected === item.correctionExpected
    && diagnostic.uncertaintyExpected === item.uncertaintyExpected
    && matches.length === item.facts.length
    && diagnostic.unsafeFieldInvention === 0
    && matches.every((match) => match.expected.taxonomyId === match.actual.taxonomyId
      && match.expected.family === match.actual.family
      && match.expected.type === match.actual.type
      && match.expected.subtype === match.actual.subtype
      && Object.keys(match.expected.expectedFields).length === Object.keys(match.actual.fields).filter((field) => field in match.expected.expectedFields).length
      && Object.entries(match.expected.expectedFields).every(([field, value]) => valuesEqual(match.actual.fields[field], value))
      && sameSet(match.expected.missingFields, match.actual.missingFields)),
  );
  const multiCase = item.bucket === "multi_fact_correction_contextual";
  const multiFactSplitCorrect = multiCase
    ? Boolean(actualFacts.length === item.expectedFactCount && matches.length === item.expectedFactCount && matches.every((match) => match.expected.subtype === match.actual.subtype))
    : null;
  const factFusionErrors = multiCase && item.expectedFactCount > 1 && actualFacts.length > 0 && actualFacts.length < item.expectedFactCount ? 1 : 0;
  const extraFactErrors = multiCase && actualFacts.length > item.expectedFactCount ? actualFacts.length - item.expectedFactCount : 0;
  const expectedQuantities = item.facts.map((fact) => fact.expectedFields.quantity).filter((value): value is number => typeof value === "number");
  const quantityCrossFactContamination = multiCase
    ? actualFacts.reduce((count, fact, index) => {
        const actualQuantity = fact.fields.quantity;
        const expectedQuantity = item.facts[index]?.expectedFields.quantity;
        return count + (typeof actualQuantity === "number" && typeof expectedQuantity === "number" && actualQuantity !== expectedQuantity && expectedQuantities.includes(actualQuantity) ? 1 : 0);
      }, 0)
    : 0;
  const isNewRecord = diagnostic.recordWorthiness === "record" || actualFacts.length > 0;
  const safetyFactError = isNewRecord ? 1 : 0;
  return {
    caseId: item.caseId,
    model,
    httpStatus: transport.httpStatus,
    providerResponseConfirmed: transport.providerResponseConfirmed,
    providerErrorCode: transport.errorCode ?? null,
    providerErrorClass: transport.errorClass ?? null,
    jsonParsed: diagnostic.jsonParsed,
    schemaValidationPass: strict.schemaValidationPass,
    strictValidationErrorCode: strict.validationErrorCode,
    strictExact: strict.exact,
    semanticExact,
    diagnosticRecordWorthiness: diagnostic.recordWorthiness,
    expectedRecordWorthiness: item.recordWorthiness,
    expectedFactCount: item.expectedFactCount,
    actualFactCount: actualFacts.length,
    taxonomyCorrectCount: matches.filter((match) => match.expected.taxonomyId === match.actual.taxonomyId).length,
    familyCorrectCount: matches.filter((match) => match.expected.family === match.actual.family).length,
    subtypeCorrectCount: matches.filter((match) => match.expected.subtype === match.actual.subtype).length,
    expectedFieldCount: countExpectedFields(item.facts),
    actualFieldCount,
    comparableFieldCount,
    fieldCorrectCount,
    expectedMissingFieldCount: expectedMissing.size,
    missingFieldDetectedCount,
    minimumQuestionApplicable: item.clarificationExpected,
    minimumQuestionCorrect: !item.clarificationExpected || Boolean(diagnostic.clarificationExpected && expectedMissing.size > 0 && expectedMissing.size === missingFieldDetectedCount),
    multiFactSplitCorrect,
    fieldSwapErrors: fieldSwapCount(item.facts, actualFacts),
    unsafeFieldInvention: diagnostic.unsafeFieldInvention,
    factFusionErrors,
    extraFactErrors,
    quantityCrossFactContamination,
    questionAsFactError: item.safetyClass === "question" && isNewRecord ? safetyFactError : 0,
    hypotheticalAsFactError: item.safetyClass === "hypothetical" && isNewRecord ? safetyFactError : 0,
    negationAsFactError: item.safetyClass === "negation" && isNewRecord ? safetyFactError : 0,
    correctionAsNewEventError: item.safetyClass === "correction" && isNewRecord ? safetyFactError : 0,
    diagnosticStructuralFailures: diagnostic.structuralFailures,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

export interface FullTaxonomyV2AggregateMetrics {
  totalCases: number;
  providerCalls: number;
  http200: number;
  jsonParsePasses: number;
  schemaPasses: number;
  strictExactMatches: number;
  semanticExactMatches: number;
  strictExactRate: number;
  semanticExactRate: number;
  recordWorthinessPrecision: number;
  recordWorthinessRecall: number;
  taxonomyPrecision: number;
  taxonomyRecall: number;
  familyAccuracy: number;
  subtypeAccuracy: number;
  fieldPrecision: number;
  fieldRecall: number;
  fieldValueAccuracy: number;
  knownFieldPreservation: number;
  missingFieldDetection: number;
  minimumQuestionAccuracy: number;
  multiFactSplitAccuracy: number;
  fieldSwapErrors: number;
  unsafeFieldInvention: number;
  factFusionErrors: number;
  extraFactErrors: number;
  quantityCrossFactContamination: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  questionAsFactErrors: number;
  hypotheticalAsFactErrors: number;
  negationAsFactErrors: number;
  correctionAsNewEventErrors: number;
  schemaValidationFailures: number;
  diagnosticStructuralFailureCases: number;
}

export function aggregateFullTaxonomyV2Evaluations(
  evaluations: readonly FullTaxonomyV2CaseEvaluation[],
  cases: readonly FullTaxonomyBenchmarkCase[] = FULL_TAXONOMY_LIVE_AB_V2_CASES,
): FullTaxonomyV2AggregateMetrics {
  const byId = new Map(cases.map((item) => [item.caseId, item]));
  const recordCases = evaluations.filter((evaluation) => evaluation.expectedRecordWorthiness === "record");
  const negativeCases = evaluations.filter((evaluation) => byId.get(evaluation.caseId)?.bucket === "negative_control");
  const expectedPositive = recordCases.length;
  const actualPositive = evaluations.filter((evaluation) => evaluation.diagnosticRecordWorthiness === "record").length;
  const truePositive = recordCases.filter((evaluation) => evaluation.diagnosticRecordWorthiness === "record").length;
  const falsePositive = negativeCases.filter((evaluation) => evaluation.diagnosticRecordWorthiness === "record" || evaluation.actualFactCount > 0).length;
  const falseNegative = recordCases.filter((evaluation) => evaluation.diagnosticRecordWorthiness !== "record").length;
  const expectedFacts = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedFactCount, 0);
  const actualFacts = evaluations.reduce((sum, evaluation) => sum + evaluation.actualFactCount, 0);
  const taxonomyCorrect = evaluations.reduce((sum, evaluation) => sum + evaluation.taxonomyCorrectCount, 0);
  const familyCorrect = evaluations.reduce((sum, evaluation) => sum + evaluation.familyCorrectCount, 0);
  const subtypeCorrect = evaluations.reduce((sum, evaluation) => sum + evaluation.subtypeCorrectCount, 0);
  const expectedFields = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedFieldCount, 0);
  const actualFields = evaluations.reduce((sum, evaluation) => sum + evaluation.actualFieldCount + evaluation.unsafeFieldInvention, 0);
  const comparableFields = evaluations.reduce((sum, evaluation) => sum + evaluation.comparableFieldCount, 0);
  const correctFields = evaluations.reduce((sum, evaluation) => sum + evaluation.fieldCorrectCount, 0);
  const expectedMissing = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedMissingFieldCount, 0);
  const detectedMissing = evaluations.reduce((sum, evaluation) => sum + evaluation.missingFieldDetectedCount, 0);
  const questionApplicable = evaluations.filter((evaluation) => evaluation.minimumQuestionApplicable);
  const multiCases = evaluations.filter((evaluation) => evaluation.multiFactSplitCorrect !== null);
  const strictExactMatches = evaluations.filter((evaluation) => evaluation.strictExact).length;
  const semanticExactMatches = evaluations.filter((evaluation) => evaluation.semanticExact).length;
  return {
    totalCases: evaluations.length,
    providerCalls: evaluations.filter((evaluation) => evaluation.httpStatus !== null).length,
    http200: evaluations.filter((evaluation) => evaluation.httpStatus === 200).length,
    jsonParsePasses: evaluations.filter((evaluation) => evaluation.jsonParsed).length,
    schemaPasses: evaluations.filter((evaluation) => evaluation.schemaValidationPass).length,
    strictExactMatches,
    semanticExactMatches,
    strictExactRate: ratio(strictExactMatches, evaluations.length),
    semanticExactRate: ratio(semanticExactMatches, evaluations.length),
    recordWorthinessPrecision: ratio(truePositive, actualPositive),
    recordWorthinessRecall: ratio(truePositive, expectedPositive),
    taxonomyPrecision: ratio(taxonomyCorrect, actualFacts),
    taxonomyRecall: ratio(taxonomyCorrect, expectedFacts),
    familyAccuracy: ratio(familyCorrect, expectedFacts),
    subtypeAccuracy: ratio(subtypeCorrect, expectedFacts),
    fieldPrecision: ratio(correctFields, actualFields),
    fieldRecall: ratio(correctFields, expectedFields),
    fieldValueAccuracy: ratio(correctFields, comparableFields),
    knownFieldPreservation: ratio(correctFields, expectedFields),
    missingFieldDetection: ratio(detectedMissing, expectedMissing),
    minimumQuestionAccuracy: ratio(questionApplicable.filter((evaluation) => evaluation.minimumQuestionCorrect).length, questionApplicable.length),
    multiFactSplitAccuracy: ratio(multiCases.filter((evaluation) => evaluation.multiFactSplitCorrect === true).length, multiCases.length),
    fieldSwapErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.fieldSwapErrors, 0),
    unsafeFieldInvention: evaluations.reduce((sum, evaluation) => sum + evaluation.unsafeFieldInvention, 0),
    factFusionErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.factFusionErrors, 0),
    extraFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.extraFactErrors, 0),
    quantityCrossFactContamination: evaluations.reduce((sum, evaluation) => sum + evaluation.quantityCrossFactContamination, 0),
    falsePositiveRate: ratio(falsePositive, negativeCases.length),
    falseNegativeRate: ratio(falseNegative, expectedPositive),
    questionAsFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.questionAsFactError, 0),
    hypotheticalAsFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.hypotheticalAsFactError, 0),
    negationAsFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.negationAsFactError, 0),
    correctionAsNewEventErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.correctionAsNewEventError, 0),
    schemaValidationFailures: evaluations.filter((evaluation) => !evaluation.schemaValidationPass).length,
    diagnosticStructuralFailureCases: evaluations.filter((evaluation) => evaluation.diagnosticStructuralFailures.length > 0).length,
  };
}

export interface FullTaxonomyV2LocalGateResult {
  strictEvaluatorFailClosed: "PASS" | "FAIL";
  diagnosticEvaluatorNoWriteAuthority: "PASS" | "FAIL";
  semanticSignalNotErasedByUnrelatedSchemaError: "PASS" | "FAIL";
}

export function runFullTaxonomyV2LocalGate(): FullTaxonomyV2LocalGateResult {
  const item = FULL_TAXONOMY_LIVE_AB_V2_CASES.find((candidate) => candidate.caseId === "E04-mortality")!;
  const expected = {
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
  const strictMalformed = { ...expected, facts: "wrong" };
  const strictEvaluatorFailClosed = validateFullTaxonomyBenchmarkOutput(strictMalformed).valid === false ? "PASS" : "FAIL";

  const unrelatedSchemaError = {
    ...expected,
    unrelatedDiagnosticMarker: true,
  } as Record<string, unknown>;
  const diagnostic = parseFullTaxonomyV2DiagnosticOutput(unrelatedSchemaError);
  const semanticSignalNotErasedByUnrelatedSchemaError = diagnostic.facts.length === 1
    && diagnostic.facts[0]?.taxonomyId === "O9"
    && diagnostic.facts[0]?.fields.quantity === 3
    && diagnostic.structuralFailures.includes("ROOT_KEYS_INVALID")
    ? "PASS"
    : "FAIL";

  return {
    strictEvaluatorFailClosed,
    diagnosticEvaluatorNoWriteAuthority: FULL_TAXONOMY_LIVE_AB_V2_DIAGNOSTIC_WRITE_AUTHORITY === "NONE" ? "PASS" : "FAIL",
    semanticSignalNotErasedByUnrelatedSchemaError,
  };
}

export const FULL_TAXONOMY_LIVE_AB_V2_MODELS = Object.freeze([MODEL_3B, MODEL_8B] as const);
