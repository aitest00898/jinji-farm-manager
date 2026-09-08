import { aiResponseText, extractJsonValue } from "./ai-json.ts";
import {
  FULL_TAXONOMY_LIVE_AB_V1_CASES,
  MODEL_3B,
  MODEL_8B,
  stableJson,
  type BenchmarkBucket,
  type BenchmarkModel,
} from "./full-taxonomy-live-ab-v1.ts";
import {
  RECORDING_TAXONOMY,
  taxonomyDefinitionFor,
  type TaxonomyId,
} from "./recording-taxonomy.ts";

/**
 * Fair semantic comparison contract.  This deliberately removes the formal
 * record envelope used by the full benchmark: both models see the same
 * prompt and may emit only worthiness, semantic taxonomy facts, and missing
 * fields.  It is a diagnostic evaluator, never a write-authority contract.
 */
export const SEMANTIC_AB_VERSION = "FULL_TAXONOMY_SEMANTIC_AB_V1" as const;
export const SEMANTIC_AB_CASE_COUNT = 12 as const;
export const SEMANTIC_AB_CALLS_PER_MODEL = SEMANTIC_AB_CASE_COUNT;
export const SEMANTIC_AB_MAX_TOKENS = 400 as const;
export const SEMANTIC_AB_TEMPERATURE = 0 as const;

export const SEMANTIC_AB_MODELS = Object.freeze([MODEL_3B, MODEL_8B] as const);
export type SemanticABModel = (typeof SEMANTIC_AB_MODELS)[number];

export const SEMANTIC_AB_BUCKETS = Object.freeze([
  "operational_event",
  "operational_action",
  "operational_observation",
  "missing_information",
  "multi_fact_correction_contextual",
  "negative_control",
] as const satisfies readonly BenchmarkBucket[]);

export interface SemanticABExpectedFact {
  readonly taxonomyId: TaxonomyId;
  readonly subtype: string | null;
}

export interface SemanticABCase {
  readonly caseId: string;
  readonly bucket: BenchmarkBucket;
  readonly input: string;
  readonly recordWorthiness: "record" | "candidate" | "ignore";
  readonly facts: readonly SemanticABExpectedFact[];
  readonly missingFields: readonly string[];
}

const SELECTED_CASE_IDS = Object.freeze([
  "E02-shipment",
  "E04-mortality",
  "A01-vaccination",
  "A04-lab-test",
  "O01-cough",
  "O03-green-droppings",
  "M01-mortality-missing-quantity",
  "M02-appearance-ambiguous",
  "C01-mortality-and-cough",
  "C02-correction",
  "N01-question",
  "N03-negation",
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function selectedCase(caseId: string): SemanticABCase {
  const source = FULL_TAXONOMY_LIVE_AB_V1_CASES.find((item) => item.caseId === caseId);
  if (!source) throw new Error(`SEMANTIC_AB_CASE_NOT_FOUND:${caseId}`);
  return {
    caseId: source.caseId,
    bucket: source.bucket,
    input: source.input,
    recordWorthiness: source.recordWorthiness,
    facts: source.facts.map((fact) => ({ taxonomyId: fact.taxonomyId, subtype: fact.subtype })),
    missingFields: [...source.missingFields],
  };
}

/** Exactly two authored cases from each of the six benchmark buckets. */
export const SEMANTIC_AB_CASES: readonly SemanticABCase[] = deepFreeze(
  SELECTED_CASE_IDS.map(selectedCase),
);

export const SEMANTIC_AB_OUTPUT_KEYS = Object.freeze([
  "recordWorthiness",
  "facts",
  "missingFields",
] as const);

export const SEMANTIC_AB_FACT_KEYS = Object.freeze([
  "taxonomyId",
  "subtype",
] as const);

const SEMANTIC_AB_FORMAL_KEYS = new Set([
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
  "derivedFields",
]);

const SEMANTIC_AB_TAXONOMY_CATALOG = Object.freeze(
  RECORDING_TAXONOMY.map((definition) => ({
    taxonomyId: definition.id,
    subtypes: [...definition.canonicalSubtypes],
  })),
);

export const SEMANTIC_AB_PROMPT_SPEC = deepFreeze({
  version: "full-taxonomy-semantic-ab-v1-prompt-v1",
  responseFormat: "prompt_only_json",
  outputKeys: [...SEMANTIC_AB_OUTPUT_KEYS],
  factKeys: [...SEMANTIC_AB_FACT_KEYS],
  noFormalIds: true,
  noPersistenceFields: true,
  noDerivedValues: true,
  samePromptForBothModels: true,
  safetyPolicy: "questions, hypotheticals, negations, corrections are not new official records",
  ambiguityPolicy: "candidate plus minimum missingFields; never guess",
});

export const SEMANTIC_AB_PREPROCESSOR_SPEC = deepFreeze({
  version: "nfkc-collapse-whitespace-trim-v1",
  normalization: "NFKC",
  whitespace: "collapse-to-single-space",
  trim: true,
});

export const SEMANTIC_AB_EVALUATOR_SPEC = deepFreeze({
  version: "semantic-minimal-output-evaluator-v1",
  primaryMatch: "recordWorthiness + taxonomyId/subtype multiset + missingFields set",
  extraKeys: "reported separately; do not erase core semantic comparison",
  forbiddenFormalKeys: [...SEMANTIC_AB_FORMAL_KEYS],
  noPersistence: true,
});

export const SEMANTIC_AB_HARNESS_SPEC = deepFreeze({
  version: "single-agent-direct-rest-semantic-ab-v1",
  caseCountPerModel: SEMANTIC_AB_CALLS_PER_MODEL,
  models: [...SEMANTIC_AB_MODELS],
  maxConcurrentAiCalls: 1,
  retries: 0,
  responseFormat: "prompt_only_json",
  structuredOutput: false,
  maxTokens: SEMANTIC_AB_MAX_TOKENS,
  temperature: SEMANTIC_AB_TEMPERATURE,
  requestShape: "messages + max_tokens + temperature; model is endpoint path only",
  productionBindings: false,
});

export function preprocessSemanticABInput(input: string): string {
  return input.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function semanticCatalogText(): string {
  return stableJson(SEMANTIC_AB_TAXONOMY_CATALOG);
}

export function buildSemanticABSystemPrompt(): string {
  return [
    "你是金雞協會助理的唯讀語意分類器。你只分類文字，不查資料庫、不寫正式資料、不做疾病診斷。",
    "只輸出一個合法 JSON 物件，不要 Markdown、不要說明文字、不要額外欄位。",
    "根物件只能有 recordWorthiness、facts、missingFields；recordWorthiness 只能是 record、candidate、ignore。",
    "facts 每項只能有 taxonomyId、subtype；taxonomyId 是語意分類代碼，不是 farmId/houseId/flockId 或資料庫 ID。",
    "明確營運事件、動作或觀察用 record；缺必要值、分類不明、更正或不確定用 candidate；問題、假設、否定、閒聊用 ignore。",
    "同一句有兩個獨立事實時分開；不得把數量帶到另一個事實。不能猜 subtype 或缺失值。",
    "不得輸出 id、farmId、houseId、flockId、sourceMessageId、rawText、createdAt、occurredAt、correctionOfId、reversalOfId、replacementOfId 或任何 derived value。",
    `TAXONOMY_CATALOG=${semanticCatalogText()}`,
    "OUTPUT_SHAPE={\"recordWorthiness\":\"record|candidate|ignore\",\"facts\":[{\"taxonomyId\":\"O9\",\"subtype\":\"mortality\"}],\"missingFields\":[]}",
  ].join("\n");
}

export interface SemanticABAiRequest {
  readonly messages: readonly [
    { readonly role: "system"; readonly content: string },
    { readonly role: "user"; readonly content: string },
  ];
  readonly max_tokens: typeof SEMANTIC_AB_MAX_TOKENS;
  readonly temperature: typeof SEMANTIC_AB_TEMPERATURE;
}

export function buildSemanticABAiRequest(item: SemanticABCase): SemanticABAiRequest {
  return {
    messages: [
      { role: "system", content: buildSemanticABSystemPrompt() },
      { role: "user", content: `請只依據以下輸入做語意分類，不要延伸猜測：\n${preprocessSemanticABInput(item.input)}` },
    ],
    max_tokens: SEMANTIC_AB_MAX_TOKENS,
    temperature: SEMANTIC_AB_TEMPERATURE,
  };
}

export function modelForSemanticAB(value: string): SemanticABModel {
  if (!SEMANTIC_AB_MODELS.includes(value as SemanticABModel)) throw new Error("SEMANTIC_AB_MODEL_NOT_ALLOWED");
  return value as SemanticABModel;
}

export interface SemanticABFixtureValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
}

export function validateSemanticABFixture(
  cases: readonly SemanticABCase[] = SEMANTIC_AB_CASES,
): SemanticABFixtureValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  const counts = Object.fromEntries(SEMANTIC_AB_BUCKETS.map((bucket) => [bucket, 0]));
  for (const item of cases) {
    if (ids.has(item.caseId)) errors.push(`${item.caseId}:duplicate_case_id`);
    ids.add(item.caseId);
    counts[item.bucket] = (counts[item.bucket] ?? 0) + 1;
    if (!SEMANTIC_AB_BUCKETS.includes(item.bucket)) errors.push(`${item.caseId}:bucket_invalid`);
    if (item.recordWorthiness === "ignore" && item.facts.length > 0) errors.push(`${item.caseId}:ignore_has_facts`);
    if (new Set(item.missingFields).size !== item.missingFields.length) errors.push(`${item.caseId}:duplicate_missing_fields`);
    for (const fact of item.facts) {
      const definition = taxonomyDefinitionFor(fact.taxonomyId);
      if (fact.subtype !== null && !definition.canonicalSubtypes.includes(fact.subtype)) {
        errors.push(`${item.caseId}:subtype_invalid`);
      }
    }
  }
  if (cases.length !== SEMANTIC_AB_CASE_COUNT) errors.push(`case_count:${cases.length}`);
  for (const bucket of SEMANTIC_AB_BUCKETS) if (counts[bucket] !== 2) errors.push(`bucket_count:${bucket}:${counts[bucket]}`);
  return { valid: errors.length === 0, errors, counts };
}

export interface SemanticABTransportResult {
  readonly httpStatus: number | null;
  readonly providerResponseConfirmed: boolean;
  readonly providerResult?: unknown;
  readonly errorCode?: string | null;
  readonly errorClass?: string | null;
}

interface SemanticABActualFact {
  readonly taxonomyId: TaxonomyId;
  readonly subtype: string | null;
}

interface SemanticABOutput {
  readonly recordWorthiness: "record" | "candidate" | "ignore";
  readonly facts: readonly SemanticABActualFact[];
  readonly missingFields: readonly string[];
}

export interface SemanticABOutputValidation {
  readonly jsonParsed: boolean;
  readonly coreShapeValid: boolean;
  readonly minimalContractPass: boolean;
  readonly errorCode: string | null;
  readonly unknownKeyCount: number;
  readonly forbiddenKeyCount: number;
  readonly output: SemanticABOutput | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key));
}

function parseProviderJson(result: unknown): { parsed: unknown; jsonParsed: boolean; errorCode: string | null } {
  const text = aiResponseText(result);
  if (!text.trim()) {
    return isPlainRecord(result) && Object.prototype.hasOwnProperty.call(result, "recordWorthiness")
      ? { parsed: result, jsonParsed: true, errorCode: null }
      : { parsed: null, jsonParsed: false, errorCode: "JSON_EMPTY" };
  }
  const parsed = extractJsonValue(text);
  return parsed === null
    ? { parsed: null, jsonParsed: false, errorCode: /\{/u.test(text) ? "JSON_INVALID" : "JSON_NO_OBJECT_CANDIDATE" }
    : { parsed, jsonParsed: true, errorCode: null };
}

export function validateSemanticABOutput(result: unknown): SemanticABOutputValidation {
  const parsedResult = parseProviderJson(result);
  if (!parsedResult.jsonParsed || !isPlainRecord(parsedResult.parsed)) {
    return {
      jsonParsed: parsedResult.jsonParsed,
      coreShapeValid: false,
      minimalContractPass: false,
      errorCode: parsedResult.errorCode ?? "ROOT_OBJECT_INVALID",
      unknownKeyCount: 0,
      forbiddenKeyCount: 0,
      output: null,
    };
  }
  const root = parsedResult.parsed;
  const rootUnknown = unknownKeys(root, SEMANTIC_AB_OUTPUT_KEYS);
  const forbiddenRoot = rootUnknown.filter((key) => SEMANTIC_AB_FORMAL_KEYS.has(key));
  if (!(root.recordWorthiness === "record" || root.recordWorthiness === "candidate" || root.recordWorthiness === "ignore")) {
    return { jsonParsed: true, coreShapeValid: false, minimalContractPass: false, errorCode: "SEMANTIC_RECORD_WORTHINESS_INVALID", unknownKeyCount: rootUnknown.length, forbiddenKeyCount: forbiddenRoot.length, output: null };
  }
  if (!Array.isArray(root.facts) || root.facts.length > 8) {
    return { jsonParsed: true, coreShapeValid: false, minimalContractPass: false, errorCode: "SEMANTIC_FACTS_INVALID", unknownKeyCount: rootUnknown.length, forbiddenKeyCount: forbiddenRoot.length, output: null };
  }
  if (!Array.isArray(root.missingFields) || root.missingFields.some((field) => typeof field !== "string") || new Set(root.missingFields).size !== root.missingFields.length) {
    return { jsonParsed: true, coreShapeValid: false, minimalContractPass: false, errorCode: "SEMANTIC_MISSING_FIELDS_INVALID", unknownKeyCount: rootUnknown.length, forbiddenKeyCount: forbiddenRoot.length, output: null };
  }

  const facts: SemanticABActualFact[] = [];
  let unknownKeyCount = rootUnknown.length;
  let forbiddenKeyCount = forbiddenRoot.length;
  for (const factValue of root.facts) {
    if (!isPlainRecord(factValue)) {
      return { jsonParsed: true, coreShapeValid: false, minimalContractPass: false, errorCode: "SEMANTIC_FACT_INVALID", unknownKeyCount, forbiddenKeyCount, output: null };
    }
    const factUnknown = unknownKeys(factValue, SEMANTIC_AB_FACT_KEYS);
    unknownKeyCount += factUnknown.length;
    forbiddenKeyCount += factUnknown.filter((key) => SEMANTIC_AB_FORMAL_KEYS.has(key)).length;
    if (typeof factValue.taxonomyId !== "string" || !RECORDING_TAXONOMY.some((definition) => definition.id === factValue.taxonomyId)) {
      return { jsonParsed: true, coreShapeValid: false, minimalContractPass: false, errorCode: "SEMANTIC_TAXONOMY_ID_INVALID", unknownKeyCount, forbiddenKeyCount, output: null };
    }
    const taxonomyId = factValue.taxonomyId as TaxonomyId;
    const subtype = factValue.subtype;
    if (subtype !== null && (typeof subtype !== "string" || !taxonomyDefinitionFor(taxonomyId).canonicalSubtypes.includes(subtype))) {
      return { jsonParsed: true, coreShapeValid: false, minimalContractPass: false, errorCode: "SEMANTIC_SUBTYPE_INVALID", unknownKeyCount, forbiddenKeyCount, output: null };
    }
    facts.push({ taxonomyId, subtype: subtype as string | null });
  }
  const output: SemanticABOutput = {
    recordWorthiness: root.recordWorthiness,
    facts,
    missingFields: [...root.missingFields] as string[],
  };
  return {
    jsonParsed: true,
    coreShapeValid: true,
    minimalContractPass: unknownKeyCount === 0,
    errorCode: unknownKeyCount === 0 ? null : "SEMANTIC_EXTRA_KEYS_PRESENT",
    unknownKeyCount,
    forbiddenKeyCount,
    output,
  };
}

function factKey(fact: SemanticABExpectedFact | SemanticABActualFact): string {
  return `${fact.taxonomyId}\u0000${fact.subtype ?? "null"}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.length === right.length && left.every((item) => rightSet.has(item));
}

function sameFactMultiset(expected: readonly SemanticABExpectedFact[], actual: readonly SemanticABActualFact[]): boolean {
  if (expected.length !== actual.length) return false;
  const counts = new Map<string, number>();
  for (const fact of expected) counts.set(factKey(fact), (counts.get(factKey(fact)) ?? 0) + 1);
  for (const fact of actual) {
    const key = factKey(fact);
    const remaining = counts.get(key) ?? 0;
    if (remaining === 0) return false;
    counts.set(key, remaining - 1);
  }
  return [...counts.values()].every((count) => count === 0);
}

export interface SemanticABCaseEvaluation {
  readonly caseId: string;
  readonly model: SemanticABModel;
  readonly httpStatus: number | null;
  readonly providerResponseConfirmed: boolean;
  readonly providerErrorCode: string | null;
  readonly providerErrorClass: string | null;
  readonly jsonParsed: boolean;
  readonly coreShapeValid: boolean;
  readonly minimalContractPass: boolean;
  readonly validationErrorCode: string | null;
  readonly semanticPass: boolean;
  readonly recordWorthinessExact: boolean;
  readonly factsExact: boolean;
  readonly missingFieldsExact: boolean;
  readonly safetyPass: boolean;
  readonly expectedRecordWorthiness: SemanticABCase["recordWorthiness"];
  readonly predictedRecordWorthiness: SemanticABCase["recordWorthiness"] | null;
  readonly expectedFactCount: number;
  readonly actualFactCount: number;
  readonly expectedMissingFieldCount: number;
  readonly actualMissingFieldCount: number;
  readonly unknownKeyCount: number;
  readonly forbiddenKeyCount: number;
}

export function evaluateSemanticABCase(
  item: SemanticABCase,
  model: SemanticABModel,
  transport: SemanticABTransportResult,
): SemanticABCaseEvaluation {
  const validation = transport.providerResponseConfirmed && Object.prototype.hasOwnProperty.call(transport, "providerResult")
    ? validateSemanticABOutput(transport.providerResult)
    : {
        jsonParsed: false,
        coreShapeValid: false,
        minimalContractPass: false,
        errorCode: transport.errorClass ?? "PROVIDER_RESPONSE_NOT_AVAILABLE",
        unknownKeyCount: 0,
        forbiddenKeyCount: 0,
        output: null,
      } satisfies SemanticABOutputValidation;
  const output = validation.output;
  const recordWorthinessExact = output?.recordWorthiness === item.recordWorthiness;
  const factsExact = Boolean(output && sameFactMultiset(item.facts, output.facts));
  const missingFieldsExact = Boolean(output && sameStringSet(item.missingFields, output.missingFields));
  const safetyPass = item.recordWorthiness !== "ignore"
    ? Boolean(output && output.facts.length === item.facts.length)
    : Boolean(output && output.recordWorthiness === "ignore" && output.facts.length === 0);
  return {
    caseId: item.caseId,
    model,
    httpStatus: transport.httpStatus,
    providerResponseConfirmed: transport.providerResponseConfirmed,
    providerErrorCode: transport.errorCode ?? null,
    providerErrorClass: transport.errorClass ?? null,
    jsonParsed: validation.jsonParsed,
    coreShapeValid: validation.coreShapeValid,
    minimalContractPass: validation.minimalContractPass,
    validationErrorCode: validation.errorCode,
    semanticPass: Boolean(validation.coreShapeValid && recordWorthinessExact && factsExact && missingFieldsExact && safetyPass),
    recordWorthinessExact,
    factsExact,
    missingFieldsExact,
    safetyPass,
    expectedRecordWorthiness: item.recordWorthiness,
    predictedRecordWorthiness: output?.recordWorthiness ?? null,
    expectedFactCount: item.facts.length,
    actualFactCount: output?.facts.length ?? 0,
    expectedMissingFieldCount: item.missingFields.length,
    actualMissingFieldCount: output?.missingFields.length ?? 0,
    unknownKeyCount: validation.unknownKeyCount,
    forbiddenKeyCount: validation.forbiddenKeyCount,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

export interface SemanticABAggregateMetrics {
  readonly totalCases: number;
  readonly providerCalls: number;
  readonly providerResponses: number;
  readonly http200: number;
  readonly jsonParsed: number;
  readonly coreShapePasses: number;
  readonly minimalContractPasses: number;
  readonly semanticPasses: number;
  readonly semanticPassRate: number;
  readonly recordWorthinessExact: number;
  readonly factsExact: number;
  readonly missingFieldsExact: number;
  readonly safetyPasses: number;
  readonly safetyErrors: number;
  readonly falseNegatives: number;
  readonly falsePositives: number;
  readonly unknownKeys: number;
  readonly forbiddenKeys: number;
  readonly byBucket: Readonly<Record<string, { total: number; semanticPasses: number; semanticPassRate: number }>>;
}

export function aggregateSemanticABEvaluations(
  evaluations: readonly SemanticABCaseEvaluation[],
  cases: readonly SemanticABCase[] = SEMANTIC_AB_CASES,
): SemanticABAggregateMetrics {
  const byId = new Map(cases.map((item) => [item.caseId, item]));
  const buckets: Record<string, { total: number; semanticPasses: number }> = {};
  for (const evaluation of evaluations) {
    const bucket = byId.get(evaluation.caseId)?.bucket ?? "unknown";
    const current = buckets[bucket] ?? { total: 0, semanticPasses: 0 };
    current.total += 1;
    if (evaluation.semanticPass) current.semanticPasses += 1;
    buckets[bucket] = current;
  }
  const recordCases = evaluations.filter((item) => item.expectedRecordWorthiness === "record");
  const negativeCases = evaluations.filter((item) => byId.get(item.caseId)?.bucket === "negative_control");
  return {
    totalCases: evaluations.length,
    providerCalls: evaluations.filter((item) => item.httpStatus !== null).length,
    providerResponses: evaluations.filter((item) => item.providerResponseConfirmed).length,
    http200: evaluations.filter((item) => item.httpStatus === 200).length,
    jsonParsed: evaluations.filter((item) => item.jsonParsed).length,
    coreShapePasses: evaluations.filter((item) => item.coreShapeValid).length,
    minimalContractPasses: evaluations.filter((item) => item.minimalContractPass).length,
    semanticPasses: evaluations.filter((item) => item.semanticPass).length,
    semanticPassRate: ratio(evaluations.filter((item) => item.semanticPass).length, evaluations.length),
    recordWorthinessExact: evaluations.filter((item) => item.recordWorthinessExact).length,
    factsExact: evaluations.filter((item) => item.factsExact).length,
    missingFieldsExact: evaluations.filter((item) => item.missingFieldsExact).length,
    safetyPasses: evaluations.filter((item) => item.safetyPass).length,
    safetyErrors: evaluations.filter((item) => !item.safetyPass).length,
    falseNegatives: recordCases.filter((item) => !item.recordWorthinessExact).length,
    falsePositives: negativeCases.filter((item) => !item.safetyPass).length,
    unknownKeys: evaluations.reduce((sum, item) => sum + item.unknownKeyCount, 0),
    forbiddenKeys: evaluations.reduce((sum, item) => sum + item.forbiddenKeyCount, 0),
    byBucket: Object.fromEntries(Object.entries(buckets).map(([bucket, value]) => [bucket, {
      ...value,
      semanticPassRate: ratio(value.semanticPasses, value.total),
    }])),
  };
}

export type SemanticABCaseDelta = "8B_BETTER" | "3B_BETTER" | "EQUAL_PASS" | "EQUAL_FAIL";

export interface SemanticABCaseComparison {
  readonly caseId: string;
  readonly threeBSemanticPass: boolean;
  readonly eightBSemanticPass: boolean;
  readonly threeBRecordWorthinessExact: boolean;
  readonly eightBRecordWorthinessExact: boolean;
  readonly threeBFactsExact: boolean;
  readonly eightBFactsExact: boolean;
  readonly threeBSafetyPass: boolean;
  readonly eightBSafetyPass: boolean;
  readonly delta: SemanticABCaseDelta;
}

export function compareSemanticABEvaluations(
  threeB: readonly SemanticABCaseEvaluation[],
  eightB: readonly SemanticABCaseEvaluation[],
  cases: readonly SemanticABCase[] = SEMANTIC_AB_CASES,
): readonly SemanticABCaseComparison[] {
  const by3B = new Map(threeB.map((item) => [item.caseId, item]));
  const by8B = new Map(eightB.map((item) => [item.caseId, item]));
  return cases.map((item) => {
    const left = by3B.get(item.caseId);
    const right = by8B.get(item.caseId);
    if (!left || !right) throw new Error(`SEMANTIC_AB_COMPARISON_CASE_MISSING:${item.caseId}`);
    let delta: SemanticABCaseDelta;
    if (right.semanticPass && !left.semanticPass) delta = "8B_BETTER";
    else if (left.semanticPass && !right.semanticPass) delta = "3B_BETTER";
    else if (left.semanticPass && right.semanticPass) delta = "EQUAL_PASS";
    else if (right.safetyPass && !left.safetyPass) delta = "8B_BETTER";
    else if (left.safetyPass && !right.safetyPass) delta = "3B_BETTER";
    else delta = "EQUAL_FAIL";
    return {
      caseId: item.caseId,
      threeBSemanticPass: left.semanticPass,
      eightBSemanticPass: right.semanticPass,
      threeBRecordWorthinessExact: left.recordWorthinessExact,
      eightBRecordWorthinessExact: right.recordWorthinessExact,
      threeBFactsExact: left.factsExact,
      eightBFactsExact: right.factsExact,
      threeBSafetyPass: left.safetyPass,
      eightBSafetyPass: right.safetyPass,
      delta,
    };
  });
}

export function semanticABFingerprintMaterials(): Readonly<Record<string, string>> {
  return {
    caseSet: stableJson({ version: SEMANTIC_AB_VERSION, cases: SEMANTIC_AB_CASES }),
    prompt: stableJson({ spec: SEMANTIC_AB_PROMPT_SPEC, catalog: SEMANTIC_AB_TAXONOMY_CATALOG }),
    evaluator: stableJson(SEMANTIC_AB_EVALUATOR_SPEC),
    preprocessor: stableJson(SEMANTIC_AB_PREPROCESSOR_SPEC),
    harness: stableJson(SEMANTIC_AB_HARNESS_SPEC),
  };
}
