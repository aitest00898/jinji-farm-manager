import { aiResponseText, extractJsonValue } from "./ai-json.ts";
import {
  RECORDING_SEXES,
  RECORDING_TAXONOMY,
  type RecordingFamily,
  type TaxonomyId,
  taxonomyDefinitionFor,
} from "./recording-taxonomy.ts";

/**
 * Permanent, model-independent benchmark contract for the reproducible 3B vs
 * 8B comparison.  The cases and expectations in this file are authored before
 * either provider run and are never changed by a run result.
 */
export const BENCHMARK_VERSION = "FULL_TAXONOMY_LIVE_AB_V1" as const;

export const MODEL_3B = "@cf/meta/llama-3.2-3b-instruct" as const;
export const MODEL_8B = "@cf/meta/llama-3.1-8b-instruct-fast" as const;
export const BENCHMARK_MODELS = Object.freeze([MODEL_3B, MODEL_8B] as const);
export type BenchmarkModel = (typeof BENCHMARK_MODELS)[number];

export const BENCHMARK_BUCKETS = Object.freeze([
  "operational_event",
  "operational_action",
  "operational_observation",
  "missing_information",
  "multi_fact_correction_contextual",
  "negative_control",
] as const);
export type BenchmarkBucket = (typeof BENCHMARK_BUCKETS)[number];

export type BenchmarkRecordWorthiness = "record" | "candidate" | "ignore";
export type BenchmarkSafetyClass = "none" | "question" | "hypothetical" | "negation" | "correction";

export interface BenchmarkExpectedFact {
  readonly taxonomyId: TaxonomyId;
  readonly family: RecordingFamily;
  readonly type: "event" | "action" | "observation";
  readonly subtype: string | null;
  readonly expectedFields: Readonly<Record<string, string | number>>;
  readonly forbiddenFields: readonly string[];
  readonly missingFields: readonly string[];
}

export interface FullTaxonomyBenchmarkCase {
  readonly caseId: string;
  readonly bucket: BenchmarkBucket;
  readonly input: string;
  readonly recordWorthiness: BenchmarkRecordWorthiness;
  readonly expectedFactCount: number;
  readonly facts: readonly BenchmarkExpectedFact[];
  readonly missingFields: readonly string[];
  readonly clarificationExpected: boolean;
  readonly correctionExpected: boolean;
  readonly uncertaintyExpected: boolean;
  readonly safetyClass: BenchmarkSafetyClass;
}

const MODEL_SCOPE_FIELDS = ["farmText", "houseText", "flockText"] as const;
const MODEL_CONTEXT_FIELD_ALIASES: Readonly<Record<string, string>> = {
  houseId: "houseText",
  flockId: "flockText",
  linkedMortalityEventId: "linkedMortalityEventText",
};
const MODEL_FORMAL_FIELDS = Object.freeze([
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
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function scopeFields(farmText: string, houseText: string, flockText?: string): Record<string, string> {
  return {
    farmText,
    houseText,
    ...(flockText ? { flockText } : {}),
  };
}

function modelFieldName(field: string): string {
  return MODEL_CONTEXT_FIELD_ALIASES[field] ?? field;
}

function defaultForbiddenFields(taxonomyId: TaxonomyId, extra: readonly string[] = []): readonly string[] {
  const definition = taxonomyDefinitionFor(taxonomyId);
  return Object.freeze([...new Set([
    ...MODEL_FORMAL_FIELDS,
    ...definition.derivedFields,
    ...extra,
  ])]);
}

function expectedFact(
  taxonomyId: TaxonomyId,
  subtype: string | null,
  expectedFields: Readonly<Record<string, string | number>>,
  missingFields: readonly string[] = [],
  extraForbiddenFields: readonly string[] = [],
): BenchmarkExpectedFact {
  const definition = taxonomyDefinitionFor(taxonomyId);
  if (subtype !== null && !definition.canonicalSubtypes.includes(subtype)) {
    throw new Error(`BENCHMARK_FIXTURE_SUBTYPE_INVALID:${taxonomyId}:${subtype}`);
  }
  return deepFreeze({
    taxonomyId,
    family: definition.family,
    type: definition.canonicalType as "event" | "action" | "observation",
    subtype,
    expectedFields: { ...expectedFields },
    forbiddenFields: defaultForbiddenFields(taxonomyId, extraForbiddenFields),
    missingFields: [...missingFields],
  });
}

function benchmarkCase(
  caseId: string,
  bucket: BenchmarkBucket,
  input: string,
  recordWorthiness: BenchmarkRecordWorthiness,
  facts: readonly BenchmarkExpectedFact[],
  options: {
    missingFields?: readonly string[];
    clarificationExpected?: boolean;
    correctionExpected?: boolean;
    uncertaintyExpected?: boolean;
    safetyClass?: BenchmarkSafetyClass;
  } = {},
): FullTaxonomyBenchmarkCase {
  return deepFreeze({
    caseId,
    bucket,
    input,
    recordWorthiness,
    expectedFactCount: facts.length,
    facts: [...facts],
    missingFields: [...(options.missingFields ?? facts.flatMap((fact) => fact.missingFields))],
    clarificationExpected: options.clarificationExpected ?? recordWorthiness === "candidate",
    correctionExpected: options.correctionExpected ?? false,
    uncertaintyExpected: options.uncertaintyExpected ?? false,
    safetyClass: options.safetyClass ?? "none",
  });
}

const testFarm = "金雞測試場";
const testHouse = "測試一舍";
const testFlock = "批次A";

/** Exactly 30 cases, frozen before any live provider request. */
export const FULL_TAXONOMY_LIVE_AB_V1_CASES: readonly FullTaxonomyBenchmarkCase[] = deepFreeze([
  // 6 operational events: O1, O3, O4, O9.
  benchmarkCase(
    "E01-chick-in",
    "operational_event",
    `${testFarm}${testHouse}${testFlock}今天進雛，公雞600、母雞400，狀況很好`,
    "record",
    [expectedFact("O1", "chick_in", { ...scopeFields(testFarm, testHouse, testFlock), maleCount: 600, femaleCount: 400, condition: "good" })],
  ),
  benchmarkCase(
    "E02-shipment",
    "operational_event",
    `${testFarm}${testHouse}${testFlock}今天出雞100隻，公雞，總重180公斤`,
    "record",
    [expectedFact("O3", "shipment", { ...scopeFields(testFarm, testHouse, testFlock), quantity: 100, sex: "male", totalWeight: 180 })],
  ),
  benchmarkCase(
    "E03-weigh",
    "operational_event",
    `${testFarm}${testHouse}${testFlock}今天磅重，母雞平均1.8公斤`,
    "record",
    [expectedFact("O4", "weigh", { ...scopeFields(testFarm, testHouse, testFlock), averageWeight: 1.8, sex: "female" })],
  ),
  benchmarkCase(
    "E04-mortality",
    "operational_event",
    `${testFarm}${testHouse}${testFlock}早上又死3隻`,
    "record",
    [expectedFact("O9", "mortality", { ...scopeFields(testFarm, testHouse, testFlock), quantity: 3 })],
  ),
  benchmarkCase(
    "E05-cull",
    "operational_event",
    `${testFarm}${testHouse}${testFlock}今天淘汰2隻`,
    "record",
    [expectedFact("O9", "cull", { ...scopeFields(testFarm, testHouse, testFlock), quantity: 2 })],
  ),
  benchmarkCase(
    "E06-shipment-colloquial",
    "operational_event",
    "東勢雞場一舍批次C下午出雞50隻，母雞，總重85公斤",
    "record",
    [expectedFact("O3", "shipment", { ...scopeFields("東勢雞場", "一舍", "批次C"), quantity: 50, sex: "female", totalWeight: 85 })],
  ),

  // 6 operational actions: O2, O5, O6, O7, O8.
  benchmarkCase(
    "A01-vaccination",
    "operational_action",
    `${testFarm}${testHouse}${testFlock}今天做了新城雞瘟疫苗`,
    "record",
    [expectedFact("O2", "vaccination", { ...scopeFields(testFarm, testHouse, testFlock), content: "新城雞瘟疫苗" })],
  ),
  benchmarkCase(
    "A02-medication",
    "operational_action",
    `二林雞場二舍批次B剛剛用了球蟲藥`,
    "record",
    [expectedFact("O2", "medication", { ...scopeFields("二林雞場", "二舍", "批次B"), content: "球蟲藥" })],
  ),
  benchmarkCase(
    "A03-feed-order",
    "operational_action",
    "幫東勢雞場一舍叫正大500公斤飼料",
    "record",
    [expectedFact("O5", "feed_order", { ...scopeFields("東勢雞場", "一舍"), vendor: "正大", weight: 500, weightUnit: "kg" })],
  ),
  benchmarkCase(
    "A04-lab-test",
    "operational_action",
    `2026-09-08T09:00:00+08:00 ${testFarm}${testHouse}送一管血去驗，等待結果`,
    "record",
    [expectedFact("O6", "lab_test", { ...scopeFields(testFarm, testHouse), submittedAt: "2026-09-08T09:00:00+08:00", content: "一管血", workflowStatus: "waiting_result" })],
  ),
  benchmarkCase(
    "A05-disinfection",
    "operational_action",
    `${testFarm}${testHouse}早上清消做完了`,
    "record",
    [expectedFact("O7", "disinfection", { ...scopeFields(testFarm, testHouse), workflowStatus: "completed" })],
  ),
  benchmarkCase(
    "A06-maintenance",
    "operational_action",
    `${testFarm}${testHouse}水線今天做保養`,
    "record",
    [expectedFact("O8", "maintenance", { ...scopeFields(testFarm, testHouse), maintenanceContent: "水線" })],
  ),

  // 6 operational observations: representative A2, A5, A6, A8, A10, A12.
  benchmarkCase(
    "O01-cough",
    "operational_observation",
    `${testFarm}${testHouse}早上有幾隻一直咳，範圍不大`,
    "record",
    [expectedFact("A2", "cough", { ...scopeFields(testFarm, testHouse), extent: "small" })],
  ),
  benchmarkCase(
    "O02-white-crown",
    "operational_observation",
    `${testFarm}${testHouse}今天看到白冠，範圍不大`,
    "record",
    [expectedFact("A5", "white_crown", { ...scopeFields(testFarm, testHouse), extent: "small" })],
  ),
  benchmarkCase(
    "O03-green-droppings",
    "operational_observation",
    `${testFarm}${testHouse}這兩天有綠便，中等範圍`,
    "record",
    [expectedFact("A6", "green", { ...scopeFields(testFarm, testHouse), extent: "medium" })],
  ),
  benchmarkCase(
    "O04-foot-odor",
    "operational_observation",
    `${testFarm}${testHouse}雞腳有臭味，只有小範圍`,
    "record",
    [expectedFact("A8", "foot_odor", { ...scopeFields(testFarm, testHouse), extent: "small" })],
  ),
  benchmarkCase(
    "O05-heat-stress",
    "operational_observation",
    `${testFarm}${testHouse}天氣太熱，雞群看起來有熱緊迫，大範圍`,
    "record",
    [expectedFact("A10", "heat_stress", { ...scopeFields(testFarm, testHouse), extent: "large" })],
  ),
  benchmarkCase(
    "O06-fan-failure",
    "operational_observation",
    `${testFarm}${testHouse}風扇故障，影響大範圍`,
    "record",
    [expectedFact("A12", "fan", { ...scopeFields(testFarm, testHouse), extent: "large" })],
  ),

  // 4 missing-information / clarification cases.
  benchmarkCase(
    "M01-mortality-missing-quantity",
    "missing_information",
    `${testFarm}${testHouse}死亡`,
    "candidate",
    [expectedFact("O9", "mortality", { ...scopeFields(testFarm, testHouse) }, ["quantity"])],
    { missingFields: ["quantity"], clarificationExpected: true },
  ),
  benchmarkCase(
    "M02-appearance-ambiguous",
    "missing_information",
    `${testFarm}${testHouse}外觀異常，大範圍`,
    "candidate",
    [expectedFact("A5", null, { ...scopeFields(testFarm, testHouse), extent: "large" }, ["subtype"])],
    { missingFields: ["subtype"], clarificationExpected: true },
  ),
  benchmarkCase(
    "M03-equipment-ambiguous",
    "missing_information",
    `${testFarm}${testHouse}設備異常，影響大範圍`,
    "candidate",
    [expectedFact("A12", null, { ...scopeFields(testFarm, testHouse), extent: "large" }, ["subtype"])],
    { missingFields: ["subtype"], clarificationExpected: true },
  ),
  benchmarkCase(
    "M04-completed-lab-missing-result",
    "missing_information",
    `2026-09-08T02:00:00+08:00 ${testFarm}${testHouse}送驗新城雞瘟，已完成`,
    "candidate",
    [expectedFact(
      "O6",
      "lab_test",
      { ...scopeFields(testFarm, testHouse), submittedAt: "2026-09-08T02:00:00+08:00", content: "新城雞瘟", workflowStatus: "completed" },
      ["result", "completedAt"],
    )],
    { missingFields: ["result", "completedAt"], clarificationExpected: true },
  ),

  // 4 multi-fact / correction / contextual cases.
  benchmarkCase(
    "C01-mortality-and-cough",
    "multi_fact_correction_contextual",
    `${testFarm}${testHouse}今天死3隻，另外幾隻在咳嗽，小範圍`,
    "record",
    [
      expectedFact("O9", "mortality", { ...scopeFields(testFarm, testHouse), quantity: 3 }),
      expectedFact("A2", "cough", { ...scopeFields(testFarm, testHouse), extent: "small" }),
    ],
  ),
  benchmarkCase(
    "C02-correction",
    "multi_fact_correction_contextual",
    `剛剛說${testFarm}${testHouse}死5隻那筆記錯了，應該是3隻`,
    "candidate",
    [],
    { missingFields: ["correctionTarget"], clarificationExpected: true, correctionExpected: true, safetyClass: "correction" },
  ),
  benchmarkCase(
    "C03-contextual-appearance",
    "multi_fact_correction_contextual",
    `早上看${testFarm}${testHouse}有一些白冠，範圍不大`,
    "record",
    [expectedFact("A5", "white_crown", { ...scopeFields(testFarm, testHouse), extent: "small" })],
  ),
  benchmarkCase(
    "C04-two-observations",
    "multi_fact_correction_contextual",
    `${testFarm}${testHouse}今天高溫，還有飲水異常，中範圍`,
    "record",
    [
      expectedFact("A13", "high_temperature", { ...scopeFields(testFarm, testHouse), extent: "medium" }),
      expectedFact("A11", "water_abnormality", { ...scopeFields(testFarm, testHouse), extent: "medium" }),
    ],
  ),

  // 4 negative controls: question, hypothetical, negation, casual chat.
  benchmarkCase("N01-question", "negative_control", "昨天是不是死5隻？", "ignore", [], { clarificationExpected: false, safetyClass: "question" }),
  benchmarkCase("N02-hypothetical", "negative_control", "如果明天死很多，大家要注意", "ignore", [], { clarificationExpected: false, safetyClass: "hypothetical" }),
  benchmarkCase("N03-negation", "negative_control", "今天沒有發現臭腳", "ignore", [], { clarificationExpected: false, safetyClass: "negation" }),
  benchmarkCase("N04-casual-chat", "negative_control", "哈哈，辛苦了，晚點吃飯", "ignore", [], { clarificationExpected: false }),
] as const);

export const LIVE_AB_OUTPUT_ALLOWED_KEYS = Object.freeze([
  "recordWorthiness",
  "facts",
  "missingFields",
  "clarificationExpected",
  "correctionExpected",
  "uncertaintyExpected",
] as const);

const MODEL_FIELD_NAMES = Object.freeze([...new Set([
  ...MODEL_SCOPE_FIELDS,
  "linkedMortalityEventText",
  ...RECORDING_TAXONOMY.flatMap((definition) => [
    ...definition.requiredFields,
    ...definition.optionalFields,
  ].map(modelFieldName)),
])].filter((field) => !MODEL_FORMAL_FIELDS.includes(field as (typeof MODEL_FORMAL_FIELDS)[number])));

const NUMBER_FIELDS = new Set([
  "maleCount",
  "femaleCount",
  "quantity",
  "weight",
  "totalWeight",
  "averageWeight",
  "measuredTemperature",
]);

function fieldSchema(field: string): Record<string, unknown> {
  if (field === "sex") return { type: "string", enum: [...RECORDING_SEXES] };
  if (field === "condition") return { type: "string", enum: ["good", "fair", "poor"] };
  if (field === "extent") return { type: "string", enum: ["small", "medium", "large"] };
  if (field === "weightUnit") return { type: "string", enum: ["kg", "bag"] };
  if (field === "workflowStatus") return { type: "string", enum: ["pending", "waiting_result", "completed"] };
  return NUMBER_FIELDS.has(field)
    ? { type: "number" }
    : { type: "string", maxLength: 240 };
}

/** Prompt-visible schema; local validation remains the authority. */
export const LIVE_AB_OUTPUT_SCHEMA = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    recordWorthiness: { type: "string", enum: ["record", "candidate", "ignore"] },
    facts: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          taxonomyId: { type: "string", enum: [...new Set(RECORDING_TAXONOMY.map((definition) => definition.id))] },
          family: { type: "string", enum: ["operational_event", "operational_action", "operational_observation"] },
          type: { type: "string", enum: ["event", "action", "observation"] },
          subtype: { type: ["string", "null"] },
          fields: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(MODEL_FIELD_NAMES.map((field) => [field, fieldSchema(field)])),
          },
          missingFields: { type: "array", uniqueItems: true, items: { type: "string", maxLength: 80 } },
        },
        required: ["taxonomyId", "family", "type", "subtype", "fields", "missingFields"],
      },
    },
    missingFields: { type: "array", uniqueItems: true, items: { type: "string", maxLength: 80 } },
    clarificationExpected: { type: "boolean" },
    correctionExpected: { type: "boolean" },
    uncertaintyExpected: { type: "boolean" },
  },
  required: [...LIVE_AB_OUTPUT_ALLOWED_KEYS],
});

const BENCHMARK_TAXONOMY_CATALOG = deepFreeze(RECORDING_TAXONOMY.map((definition) => ({
  taxonomyId: definition.id,
  family: definition.family,
  type: definition.canonicalType,
  subtypes: [...definition.canonicalSubtypes],
  requiredSemanticFields: definition.requiredFields.map(modelFieldName),
  optionalSemanticFields: definition.optionalFields.map(modelFieldName),
  derivedFields: [...definition.derivedFields],
})));

export const PROMPT_SPEC = deepFreeze({
  version: "full-taxonomy-live-ab-v1-prompt-v1",
  responseFormat: "prompt_only_json",
  role: "semantic taxonomy classifier only",
  noFormalIds: true,
  noDatabaseAccess: true,
  noDiagnosis: true,
  noInventedValues: true,
  multiFactPolicy: "one independent fact per facts item, preserve quantities by fact",
  ambiguityPolicy: "candidate plus minimum missingFields, never guess subtype or missing values",
  safetyPolicy: "questions, hypotheticals, negations, corrections are not new official records",
  scopePolicy: "use farmText, houseText, flockText as text hints; never emit formal IDs",
});

export function buildFullTaxonomySystemPrompt(): string {
  return [
    "你是金雞協會助理的唯讀語意分類器。你只負責把一段台灣雞場對話分類成既有 Recording Taxonomy 語意；不查資料庫、不寫正式資料、不做疾病診斷、不產生正式 ID。",
    "只輸出一個合法 JSON 物件，不要 Markdown、不要說明文字、不要額外欄位。",
    "recordWorthiness 只能是 record、candidate、ignore。能表達為明確營運事件/動作/現場觀察時用 record；缺少必要值、分類不明、需要更正或不確定時用 candidate；問題、假設、否定、閒聊不是新紀錄，使用 ignore。",
    "facts 必須一個獨立事實一項；同一句有兩個獨立事實時分開，不能合併，也不能把一個事實的數量帶到另一個事實。",
    "taxonomyId、family、type、subtype 必須互相一致並只使用下方 catalog；不確定 subtype 時 subtype=null 並列出 subtype。",
    "fields 只能使用 schema 列出的語意欄位。farmText、houseText、flockText 是文字提示，不是 ID。不得輸出 id、farmId、houseId、flockId、sourceMessageId、rawText、createdAt、occurredAt、correctionOfId、reversalOfId、replacementOfId 或 derivedFields。不得補猜缺失數字、日期、結果或原因。",
    "每個 fact 都必須有 missingFields 陣列；根物件也要有 missingFields。沒有缺漏就用空陣列。correctionExpected 與 uncertaintyExpected 只反映輸入是否是更正或不確定語意。",
    `OUTPUT_SCHEMA=${stableJson(LIVE_AB_OUTPUT_SCHEMA)}`,
    `TAXONOMY_CATALOG=${stableJson(BENCHMARK_TAXONOMY_CATALOG)}`,
  ].join("\n");
}

export function preprocessFullTaxonomyInput(input: string): string {
  return input.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export interface FullTaxonomyAiRequest {
  messages: readonly [
    { readonly role: "system"; readonly content: string },
    { readonly role: "user"; readonly content: string },
  ];
  max_tokens: number;
  temperature: 0;
}

export function buildFullTaxonomyAiRequest(item: FullTaxonomyBenchmarkCase): FullTaxonomyAiRequest {
  return {
    messages: [
      { role: "system", content: buildFullTaxonomySystemPrompt() },
      { role: "user", content: `請只依據以下輸入做語意分類，不要延伸猜測：\n${preprocessFullTaxonomyInput(item.input)}` },
    ],
    max_tokens: 800,
    temperature: 0,
  };
}

export const PREPROCESSOR_SPEC = deepFreeze({
  version: "nfkc-collapse-whitespace-trim-v1",
  normalization: "NFKC",
  whitespace: "collapse-to-single-space",
  trim: true,
});

export const EVALUATOR_SPEC = deepFreeze({
  version: "strict-taxonomy-evaluator-v1",
  rootAdditionalProperties: false,
  factAdditionalProperties: false,
  matching: "deterministic taxonomyId/subtype multiset matching",
  fieldPolicy: "exact values; unknown/formal/derived fields fail closed",
  safetyPolicy: "question/hypothetical/negation/correction facts are high-severity errors",
});

export const HARNESS_SPEC = deepFreeze({
  version: "single-agent-direct-rest-v1",
  maxConcurrentAiCalls: 1,
  retries: 0,
  caseGrouping: "one case per request",
  caseOrder: "FULL_TAXONOMY_LIVE_AB_V1_CASES array order",
  responseFormat: "prompt_only_json",
  structuredOutput: false,
  maxTokens: 800,
  temperature: 0,
  requestShape: "messages + max_tokens + temperature; model is endpoint path only",
  productionBindings: false,
});

export function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  throw new Error("STABLE_JSON_UNSUPPORTED_VALUE");
}

export function benchmarkFingerprintMaterials(): Record<string, string> {
  return {
    caseSet: stableJson({ benchmarkVersion: BENCHMARK_VERSION, cases: FULL_TAXONOMY_LIVE_AB_V1_CASES }),
    prompt: stableJson({ promptSpec: PROMPT_SPEC, schema: LIVE_AB_OUTPUT_SCHEMA, taxonomyCatalog: BENCHMARK_TAXONOMY_CATALOG }),
    schema: stableJson(LIVE_AB_OUTPUT_SCHEMA),
    evaluator: stableJson(EVALUATOR_SPEC),
    preprocessor: stableJson(PREPROCESSOR_SPEC),
    harness: stableJson(HARNESS_SPEC),
  };
}

export function modelForFullTaxonomyBenchmark(value: string): BenchmarkModel {
  if (!BENCHMARK_MODELS.includes(value as BenchmarkModel)) throw new Error("BENCHMARK_MODEL_NOT_ALLOWED");
  return value as BenchmarkModel;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.length === right.length && left.every((value) => rightSet.has(value));
}

export interface BenchmarkFixtureValidation {
  valid: boolean;
  errors: string[];
  counts: Record<string, number>;
  coveredFamilies: string[];
  coveredTaxonomyIds: string[];
}

export function validateFullTaxonomyBenchmarkFixture(
  cases: readonly FullTaxonomyBenchmarkCase[] = FULL_TAXONOMY_LIVE_AB_V1_CASES,
): BenchmarkFixtureValidation {
  const errors: string[] = [];
  const expectedBuckets: Record<BenchmarkBucket, number> = {
    operational_event: 6,
    operational_action: 6,
    operational_observation: 6,
    missing_information: 4,
    multi_fact_correction_contextual: 4,
    negative_control: 4,
  };
  const counts = Object.fromEntries(BENCHMARK_BUCKETS.map((bucket) => [bucket, 0]));
  const caseIds = new Set<string>();
  const coveredFamilies = new Set<string>();
  const coveredTaxonomyIds = new Set<string>();
  for (const item of cases) {
    if (caseIds.has(item.caseId)) errors.push(`${item.caseId}:duplicate_case_id`);
    caseIds.add(item.caseId);
    counts[item.bucket] = (counts[item.bucket] ?? 0) + 1;
    if (item.expectedFactCount !== item.facts.length) errors.push(`${item.caseId}:fact_count_mismatch`);
    if (item.recordWorthiness === "ignore" && item.facts.length > 0) errors.push(`${item.caseId}:ignore_has_facts`);
    if (item.correctionExpected && item.recordWorthiness === "record") errors.push(`${item.caseId}:correction_record_forbidden`);
    if (item.safetyClass !== "none" && item.facts.length > 0) errors.push(`${item.caseId}:safety_control_has_fact`);
    if (new Set(item.missingFields).size !== item.missingFields.length) errors.push(`${item.caseId}:duplicate_missing_fields`);
    for (const fact of item.facts) {
      coveredFamilies.add(fact.family);
      coveredTaxonomyIds.add(fact.taxonomyId);
      const definition = taxonomyDefinitionFor(fact.taxonomyId);
      if (fact.family !== definition.family || fact.type !== definition.canonicalType) errors.push(`${item.caseId}:fact_contract_mismatch`);
      if (fact.subtype !== null && !definition.canonicalSubtypes.includes(fact.subtype)) errors.push(`${item.caseId}:fact_subtype_invalid`);
      if (new Set(fact.missingFields).size !== fact.missingFields.length) errors.push(`${item.caseId}:fact_duplicate_missing_fields`);
      for (const field of Object.keys(fact.expectedFields)) {
        if (fact.forbiddenFields.includes(field)) errors.push(`${item.caseId}:expected_forbidden_field:${field}`);
      }
    }
  }
  if (cases.length !== 30) errors.push(`case_count:${cases.length}`);
  for (const bucket of BENCHMARK_BUCKETS) {
    if (counts[bucket] !== expectedBuckets[bucket]) errors.push(`bucket_count:${bucket}:${counts[bucket]}`);
  }
  for (const requiredFamily of ["operational_event", "operational_action", "operational_observation"]) {
    if (!coveredFamilies.has(requiredFamily)) errors.push(`family_missing:${requiredFamily}`);
  }
  for (const requiredTaxonomyId of ["O1", "O2", "O3", "O5", "O6", "O9", "A2", "A5", "A6", "A8", "A10", "A12"]) {
    if (!coveredTaxonomyIds.has(requiredTaxonomyId)) errors.push(`taxonomy_missing:${requiredTaxonomyId}`);
  }
  return {
    valid: errors.length === 0,
    errors,
    counts,
    coveredFamilies: [...coveredFamilies].sort(),
    coveredTaxonomyIds: [...coveredTaxonomyIds].sort(),
  };
}

export interface BenchmarkTransportResult {
  readonly httpStatus: number | null;
  readonly providerResponseConfirmed: boolean;
  readonly providerResult?: unknown;
  readonly errorCode?: string | null;
  readonly errorClass?: string | null;
}

interface ActualFact {
  taxonomyId: TaxonomyId;
  family: RecordingFamily;
  type: "event" | "action" | "observation";
  subtype: string | null;
  fields: Record<string, string | number>;
  missingFields: string[];
}

interface ValidatedBenchmarkOutput {
  recordWorthiness: BenchmarkRecordWorthiness;
  facts: ActualFact[];
  missingFields: string[];
  clarificationExpected: boolean;
  correctionExpected: boolean;
  uncertaintyExpected: boolean;
}

export interface BenchmarkOutputValidation {
  valid: boolean;
  jsonParsed: boolean;
  errorCode: string | null;
  unsafeFieldCount: number;
  output: ValidatedBenchmarkOutput | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key)) && Object.keys(value).length === allowed.length;
}

function fieldAllowedForFact(fact: { taxonomyId: TaxonomyId }, field: string): boolean {
  if (MODEL_SCOPE_FIELDS.includes(field as (typeof MODEL_SCOPE_FIELDS)[number]) || field === "linkedMortalityEventText") return true;
  const definition = taxonomyDefinitionFor(fact.taxonomyId);
  return [...definition.requiredFields, ...definition.optionalFields].map(modelFieldName).includes(field);
}

function fieldHasValidShape(field: string, value: unknown): value is string | number {
  if (NUMBER_FIELDS.has(field)) return typeof value === "number" && Number.isFinite(value);
  if (typeof value !== "string") return false;
  return value.length > 0 && value.length <= 240 && !/[\u0000-\u001F\u007F]/u.test(value);
}

function validateActualFieldValue(field: string, value: string | number): boolean {
  if (field === "sex") return typeof value === "string" && RECORDING_SEXES.includes(value as (typeof RECORDING_SEXES)[number]);
  if (field === "condition") return typeof value === "string" && ["good", "fair", "poor"].includes(value);
  if (field === "extent") return typeof value === "string" && ["small", "medium", "large"].includes(value);
  if (field === "weightUnit") return typeof value === "string" && ["kg", "bag"].includes(value);
  if (field === "workflowStatus") return typeof value === "string" && ["pending", "waiting_result", "completed"].includes(value);
  if (["quantity", "maleCount", "femaleCount"].includes(field)) return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (["weight", "totalWeight", "averageWeight"].includes(field)) return typeof value === "number" && Number.isFinite(value) && value > 0;
  return true;
}

function parseProviderJson(result: unknown): { parsed: unknown; jsonParsed: boolean; errorCode: string | null } {
  const text = aiResponseText(result);
  if (!text.trim()) {
    if (isPlainRecord(result) && Object.prototype.hasOwnProperty.call(result, "recordWorthiness")) {
      return { parsed: result, jsonParsed: true, errorCode: null };
    }
    return { parsed: null, jsonParsed: false, errorCode: "JSON_EMPTY" };
  }
  const parsed = extractJsonValue(text);
  if (parsed === null) {
    return {
      parsed: null,
      jsonParsed: false,
      errorCode: /\{/u.test(text) ? "JSON_INVALID" : "JSON_NO_OBJECT_CANDIDATE",
    };
  }
  return { parsed, jsonParsed: true, errorCode: null };
}

export function validateFullTaxonomyBenchmarkOutput(result: unknown): BenchmarkOutputValidation {
  const parsedResult = parseProviderJson(result);
  if (!parsedResult.jsonParsed || !isPlainRecord(parsedResult.parsed)) {
    return { valid: false, jsonParsed: parsedResult.jsonParsed, errorCode: parsedResult.errorCode ?? "ROOT_OBJECT_INVALID", unsafeFieldCount: 0, output: null };
  }
  const root = parsedResult.parsed;
  if (!exactKeys(root, LIVE_AB_OUTPUT_ALLOWED_KEYS)) {
    return { valid: false, jsonParsed: true, errorCode: "SCHEMA_TOP_LEVEL_KEYS_INVALID", unsafeFieldCount: 0, output: null };
  }
  if (!(["record", "candidate", "ignore"] as const).includes(root.recordWorthiness as BenchmarkRecordWorthiness)) {
    return { valid: false, jsonParsed: true, errorCode: "SCHEMA_RECORD_WORTHINESS_INVALID", unsafeFieldCount: 0, output: null };
  }
  if (!Array.isArray(root.facts) || root.facts.length > 8) {
    return { valid: false, jsonParsed: true, errorCode: "SCHEMA_FACTS_INVALID", unsafeFieldCount: 0, output: null };
  }
  if (!Array.isArray(root.missingFields) || root.missingFields.some((item) => typeof item !== "string") || new Set(root.missingFields).size !== root.missingFields.length) {
    return { valid: false, jsonParsed: true, errorCode: "SCHEMA_MISSING_FIELDS_INVALID", unsafeFieldCount: 0, output: null };
  }
  for (const flag of ["clarificationExpected", "correctionExpected", "uncertaintyExpected"] as const) {
    if (typeof root[flag] !== "boolean") return { valid: false, jsonParsed: true, errorCode: `SCHEMA_FLAG_INVALID:${flag}`, unsafeFieldCount: 0, output: null };
  }

  const facts: ActualFact[] = [];
  let unsafeFieldCount = 0;
  for (const item of root.facts) {
    if (!isPlainRecord(item) || !exactKeys(item, ["taxonomyId", "family", "type", "subtype", "fields", "missingFields"])) {
      return { valid: false, jsonParsed: true, errorCode: "SCHEMA_FACT_KEYS_INVALID", unsafeFieldCount, output: null };
    }
    if (typeof item.taxonomyId !== "string" || !RECORDING_TAXONOMY.some((definition) => definition.id === item.taxonomyId)) {
      return { valid: false, jsonParsed: true, errorCode: "SCHEMA_TAXONOMY_ID_INVALID", unsafeFieldCount, output: null };
    }
    const taxonomyId = item.taxonomyId as TaxonomyId;
    const definition = taxonomyDefinitionFor(taxonomyId);
    if (item.family !== definition.family || item.type !== definition.canonicalType) {
      return { valid: false, jsonParsed: true, errorCode: "SCHEMA_FACT_CONTRACT_INVALID", unsafeFieldCount, output: null };
    }
    if (item.subtype !== null && (typeof item.subtype !== "string" || !definition.canonicalSubtypes.includes(item.subtype))) {
      return { valid: false, jsonParsed: true, errorCode: "SCHEMA_SUBTYPE_INVALID", unsafeFieldCount, output: null };
    }
    if (!isPlainRecord(item.fields)) return { valid: false, jsonParsed: true, errorCode: "SCHEMA_FIELDS_INVALID", unsafeFieldCount, output: null };
    if (!Array.isArray(item.missingFields) || item.missingFields.some((field) => typeof field !== "string") || new Set(item.missingFields).size !== item.missingFields.length) {
      return { valid: false, jsonParsed: true, errorCode: "SCHEMA_FACT_MISSING_FIELDS_INVALID", unsafeFieldCount, output: null };
    }
    const fields: Record<string, string | number> = {};
    for (const [field, value] of Object.entries(item.fields)) {
      const forbidden = MODEL_FORMAL_FIELDS.includes(field as (typeof MODEL_FORMAL_FIELDS)[number]) || definition.derivedFields.includes(field);
      if (forbidden || !fieldAllowedForFact({ taxonomyId }, field)) {
        unsafeFieldCount += 1;
        return { valid: false, jsonParsed: true, errorCode: forbidden ? "UNSAFE_FORMAL_OR_DERIVED_FIELD" : "SCHEMA_FIELD_UNSUPPORTED", unsafeFieldCount, output: null };
      }
      if (!fieldHasValidShape(field, value) || !validateActualFieldValue(field, value as string | number)) {
        return { valid: false, jsonParsed: true, errorCode: "SCHEMA_FIELD_TYPE_OR_VALUE_INVALID", unsafeFieldCount, output: null };
      }
      fields[field] = value as string | number;
    }
    facts.push({
      taxonomyId,
      family: definition.family,
      type: definition.canonicalType as "event" | "action" | "observation",
      subtype: item.subtype as string | null,
      fields,
      missingFields: [...item.missingFields] as string[],
    });
  }
  return {
    valid: true,
    jsonParsed: true,
    errorCode: null,
    unsafeFieldCount,
    output: {
      recordWorthiness: root.recordWorthiness as BenchmarkRecordWorthiness,
      facts,
      missingFields: [...root.missingFields] as string[],
      clarificationExpected: root.clarificationExpected as boolean,
      correctionExpected: root.correctionExpected as boolean,
      uncertaintyExpected: root.uncertaintyExpected as boolean,
    },
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return typeof left === typeof right && left === right;
}

function matchFacts(expected: readonly BenchmarkExpectedFact[], actual: readonly ActualFact[]): Array<{ expected: BenchmarkExpectedFact; actual: ActualFact }> {
  const unused = new Set(expected.map((_item, index) => index));
  const matches: Array<{ expected: BenchmarkExpectedFact; actual: ActualFact }> = [];
  for (const actualFact of actual) {
    const candidates = [...unused].filter((index) => expected[index]!.taxonomyId === actualFact.taxonomyId);
    const subtypeMatch = candidates.find((index) => expected[index]!.subtype === actualFact.subtype);
    const index = subtypeMatch ?? candidates[0];
    if (index === undefined) continue;
    unused.delete(index);
    matches.push({ expected: expected[index]!, actual: actualFact });
  }
  return matches;
}

export interface FullTaxonomyCaseEvaluation {
  caseId: string;
  model: BenchmarkModel;
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  providerErrorCode: string | null;
  providerErrorClass: string | null;
  jsonParsed: boolean;
  schemaValidationPass: boolean;
  validationErrorCode: string | null;
  exact: boolean;
  recordWorthinessExact: boolean;
  expectedRecordWorthiness: BenchmarkRecordWorthiness;
  predictedRecordWorthiness: BenchmarkRecordWorthiness | null;
  expectedFactCount: number;
  actualFactCount: number;
  taxonomyCorrectCount: number;
  familyCorrectCount: number;
  subtypeCorrectCount: number;
  expectedFieldCount: number;
  actualFieldCount: number;
  comparableFieldCount: number;
  fieldCorrectCount: number;
  fieldScore: number;
  expectedMissingFieldCount: number;
  missingFieldDetectedCount: number;
  minimumQuestionApplicable: boolean;
  minimumQuestionCorrect: boolean;
  fieldSwapErrors: number;
  unsafeFieldInvention: number;
  multiFactSplitCorrect: boolean | null;
  factFusionErrors: number;
  extraFactErrors: number;
  quantityCrossFactContamination: number;
  questionAsFactError: number;
  hypotheticalAsFactError: number;
  negationAsFactError: number;
  correctionAsNewEventError: number;
}

function countExpectedFields(cases: readonly BenchmarkExpectedFact[]): number {
  return cases.reduce((sum, fact) => sum + Object.keys(fact.expectedFields).length, 0);
}

function missingFieldsForOutput(output: ValidatedBenchmarkOutput): Set<string> {
  return new Set([...output.missingFields, ...output.facts.flatMap((fact) => fact.missingFields)]);
}

function expectedMissingFields(item: FullTaxonomyBenchmarkCase): Set<string> {
  return new Set([...item.missingFields, ...item.facts.flatMap((fact) => fact.missingFields)]);
}

function fieldSwapCount(
  expected: readonly BenchmarkExpectedFact[],
  actual: readonly ActualFact[],
): number {
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

export function evaluateFullTaxonomyCase(
  item: FullTaxonomyBenchmarkCase,
  model: BenchmarkModel,
  transport: BenchmarkTransportResult,
): FullTaxonomyCaseEvaluation {
  const expectedFieldCount = countExpectedFields(item.facts);
  const expectedMissing = expectedMissingFields(item);
  const outputValidation = transport.providerResponseConfirmed && Object.prototype.hasOwnProperty.call(transport, "providerResult")
    ? validateFullTaxonomyBenchmarkOutput(transport.providerResult)
    : {
        valid: false,
        jsonParsed: false,
        errorCode: transport.errorClass ?? "PROVIDER_RESPONSE_NOT_AVAILABLE",
        unsafeFieldCount: 0,
        output: null,
      } satisfies BenchmarkOutputValidation;
  const output = outputValidation.output;
  const actualFacts = output?.facts ?? [];
  const matches = output ? matchFacts(item.facts, actualFacts) : [];
  const taxonomyCorrectCount = matches.filter((match) => match.expected.taxonomyId === match.actual.taxonomyId).length;
  const familyCorrectCount = matches.filter((match) => match.expected.family === match.actual.family).length;
  const subtypeCorrectCount = matches.filter((match) => match.expected.subtype === match.actual.subtype).length;
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
  const actualMissing = output ? missingFieldsForOutput(output) : new Set<string>();
  const missingFieldDetectedCount = [...expectedMissing].filter((field) => actualMissing.has(field)).length;
  const recordWorthinessExact = output?.recordWorthiness === item.recordWorthiness;
  const semanticExact = Boolean(
    output
    && output.facts.length === item.expectedFactCount
    && recordWorthinessExact
    && sameSet([...actualMissing], [...expectedMissing])
    && output.clarificationExpected === item.clarificationExpected
    && output.correctionExpected === item.correctionExpected
    && output.uncertaintyExpected === item.uncertaintyExpected
    && matches.length === item.facts.length
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
    ? Boolean(output && output.facts.length === item.expectedFactCount && matches.length === item.expectedFactCount && subtypeCorrectCount === item.expectedFactCount)
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
  const safetyFactError = output && output.facts.length > 0 ? 1 : 0;
  const isNewRecord = output?.recordWorthiness === "record" || actualFacts.length > 0;
  return {
    caseId: item.caseId,
    model,
    httpStatus: transport.httpStatus,
    providerResponseConfirmed: transport.providerResponseConfirmed,
    providerErrorCode: transport.errorCode ?? null,
    providerErrorClass: transport.errorClass ?? null,
    jsonParsed: outputValidation.jsonParsed,
    schemaValidationPass: outputValidation.valid,
    validationErrorCode: outputValidation.errorCode,
    exact: outputValidation.valid && semanticExact,
    recordWorthinessExact,
    expectedRecordWorthiness: item.recordWorthiness,
    predictedRecordWorthiness: output?.recordWorthiness ?? null,
    expectedFactCount: item.expectedFactCount,
    actualFactCount: actualFacts.length,
    taxonomyCorrectCount,
    familyCorrectCount,
    subtypeCorrectCount,
    expectedFieldCount,
    actualFieldCount,
    comparableFieldCount,
    fieldCorrectCount,
    fieldScore: expectedFieldCount === 0 ? (item.expectedFactCount === actualFacts.length ? 1 : 0) : fieldCorrectCount / expectedFieldCount,
    expectedMissingFieldCount: expectedMissing.size,
    missingFieldDetectedCount,
    minimumQuestionApplicable: item.clarificationExpected,
    minimumQuestionCorrect: !item.clarificationExpected || Boolean(output?.clarificationExpected && expectedMissing.size > 0 && expectedMissing.size === missingFieldDetectedCount),
    fieldSwapErrors: fieldSwapCount(item.facts, actualFacts),
    unsafeFieldInvention: outputValidation.unsafeFieldCount,
    multiFactSplitCorrect,
    factFusionErrors,
    extraFactErrors,
    quantityCrossFactContamination,
    questionAsFactError: item.safetyClass === "question" && isNewRecord ? safetyFactError : 0,
    hypotheticalAsFactError: item.safetyClass === "hypothetical" && isNewRecord ? safetyFactError : 0,
    negationAsFactError: item.safetyClass === "negation" && isNewRecord ? safetyFactError : 0,
    correctionAsNewEventError: item.safetyClass === "correction" && isNewRecord ? safetyFactError : 0,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

export interface FullTaxonomyAggregateMetrics {
  totalCases: number;
  providerCalls: number;
  http200: number;
  exactMatches: number;
  exactMatchRate: number;
  recordWorthinessPrecision: number;
  recordWorthinessRecall: number;
  taxonomyPrecision: number;
  taxonomyRecall: number;
  familyAccuracy: number;
  subtypeAccuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  fieldPrecision: number;
  fieldRecall: number;
  fieldValueAccuracy: number;
  fieldSwapErrors: number;
  unsafeFieldInvention: number;
  knownFieldPreservation: number;
  missingFieldDetection: number;
  minimumQuestionAccuracy: number;
  multiFactSplitAccuracy: number;
  factFusionErrors: number;
  extraFactErrors: number;
  quantityCrossFactContamination: number;
  questionAsFactErrors: number;
  hypotheticalAsFactErrors: number;
  negationAsFactErrors: number;
  correctionAsNewEventErrors: number;
  schemaValidationFailures: number;
}

export function aggregateFullTaxonomyEvaluations(
  evaluations: readonly FullTaxonomyCaseEvaluation[],
  cases: readonly FullTaxonomyBenchmarkCase[] = FULL_TAXONOMY_LIVE_AB_V1_CASES,
): FullTaxonomyAggregateMetrics {
  const byId = new Map(cases.map((item) => [item.caseId, item]));
  const recordCases = evaluations.filter((evaluation) => evaluation.expectedRecordWorthiness === "record");
  const negativeCases = evaluations.filter((evaluation) => byId.get(evaluation.caseId)?.bucket === "negative_control");
  const expectedPositive = recordCases.length;
  const actualPositive = evaluations.filter((evaluation) => evaluation.predictedRecordWorthiness === "record").length;
  const truePositive = recordCases.filter((evaluation) => evaluation.predictedRecordWorthiness === "record").length;
  const falsePositive = negativeCases.filter((evaluation) => evaluation.predictedRecordWorthiness === "record" || evaluation.actualFactCount > 0).length;
  const falseNegative = recordCases.filter((evaluation) => evaluation.predictedRecordWorthiness !== "record").length;
  const expectedFacts = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedFactCount, 0);
  const actualFacts = evaluations.reduce((sum, evaluation) => sum + evaluation.actualFactCount, 0);
  const taxonomyCorrect = evaluations.reduce((sum, evaluation) => sum + evaluation.taxonomyCorrectCount, 0);
  const familyCorrect = evaluations.reduce((sum, evaluation) => sum + evaluation.familyCorrectCount, 0);
  const subtypeCorrect = evaluations.reduce((sum, evaluation) => sum + evaluation.subtypeCorrectCount, 0);
  const expectedFields = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedFieldCount, 0);
  const actualFields = evaluations.reduce((sum, evaluation) => sum + evaluation.actualFieldCount, 0);
  const comparableFields = evaluations.reduce((sum, evaluation) => sum + evaluation.comparableFieldCount, 0);
  const correctFields = evaluations.reduce((sum, evaluation) => sum + evaluation.fieldCorrectCount, 0);
  const expectedMissing = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedMissingFieldCount, 0);
  const detectedMissing = evaluations.reduce((sum, evaluation) => sum + evaluation.missingFieldDetectedCount, 0);
  const questionApplicable = evaluations.filter((evaluation) => evaluation.minimumQuestionApplicable);
  const multiCases = evaluations.filter((evaluation) => evaluation.multiFactSplitCorrect !== null);
  return {
    totalCases: evaluations.length,
    providerCalls: evaluations.filter((evaluation) => evaluation.httpStatus !== null).length,
    http200: evaluations.filter((evaluation) => evaluation.httpStatus === 200).length,
    exactMatches: evaluations.filter((evaluation) => evaluation.exact).length,
    exactMatchRate: ratio(evaluations.filter((evaluation) => evaluation.exact).length, evaluations.length),
    recordWorthinessPrecision: ratio(truePositive, actualPositive),
    recordWorthinessRecall: ratio(truePositive, expectedPositive),
    taxonomyPrecision: ratio(taxonomyCorrect, actualFacts),
    taxonomyRecall: ratio(taxonomyCorrect, expectedFacts),
    familyAccuracy: ratio(familyCorrect, expectedFacts),
    subtypeAccuracy: ratio(subtypeCorrect, expectedFacts),
    falsePositiveRate: ratio(falsePositive, negativeCases.length),
    falseNegativeRate: ratio(falseNegative, expectedPositive),
    fieldPrecision: ratio(correctFields, actualFields),
    fieldRecall: ratio(correctFields, expectedFields),
    fieldValueAccuracy: ratio(correctFields, comparableFields),
    fieldSwapErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.fieldSwapErrors, 0),
    unsafeFieldInvention: evaluations.reduce((sum, evaluation) => sum + evaluation.unsafeFieldInvention, 0),
    knownFieldPreservation: ratio(correctFields, expectedFields),
    missingFieldDetection: ratio(detectedMissing, expectedMissing),
    minimumQuestionAccuracy: ratio(questionApplicable.filter((evaluation) => evaluation.minimumQuestionCorrect).length, questionApplicable.length),
    multiFactSplitAccuracy: ratio(multiCases.filter((evaluation) => evaluation.multiFactSplitCorrect === true).length, multiCases.length),
    factFusionErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.factFusionErrors, 0),
    extraFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.extraFactErrors, 0),
    quantityCrossFactContamination: evaluations.reduce((sum, evaluation) => sum + evaluation.quantityCrossFactContamination, 0),
    questionAsFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.questionAsFactError, 0),
    hypotheticalAsFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.hypotheticalAsFactError, 0),
    negationAsFactErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.negationAsFactError, 0),
    correctionAsNewEventErrors: evaluations.reduce((sum, evaluation) => sum + evaluation.correctionAsNewEventError, 0),
    schemaValidationFailures: evaluations.filter((evaluation) => !evaluation.schemaValidationPass).length,
  };
}

export type BenchmarkCaseDelta = "8B_BETTER" | "3B_BETTER" | "EQUAL_PASS" | "EQUAL_FAIL";

export interface BenchmarkCaseComparison {
  caseId: string;
  threeBExact: boolean;
  eightBExact: boolean;
  threeBTaxonomy: number;
  eightBTaxonomy: number;
  threeBFieldScore: number;
  eightBFieldScore: number;
  threeBSafetyError: number;
  eightBSafetyError: number;
  delta: BenchmarkCaseDelta;
}

function safetyErrorCount(evaluation: FullTaxonomyCaseEvaluation): number {
  return evaluation.questionAsFactError + evaluation.hypotheticalAsFactError + evaluation.negationAsFactError + evaluation.correctionAsNewEventError;
}

export function compareFullTaxonomyEvaluations(
  threeB: readonly FullTaxonomyCaseEvaluation[],
  eightB: readonly FullTaxonomyCaseEvaluation[],
): BenchmarkCaseComparison[] {
  const byId3B = new Map(threeB.map((item) => [item.caseId, item]));
  const byId8B = new Map(eightB.map((item) => [item.caseId, item]));
  return FULL_TAXONOMY_LIVE_AB_V1_CASES.map((item) => {
    const left = byId3B.get(item.caseId);
    const right = byId8B.get(item.caseId);
    if (!left || !right) throw new Error(`BENCHMARK_COMPARISON_CASE_MISSING:${item.caseId}`);
    let delta: BenchmarkCaseDelta;
    if (right.exact && !left.exact) delta = "8B_BETTER";
    else if (left.exact && !right.exact) delta = "3B_BETTER";
    else if (left.exact && right.exact) delta = "EQUAL_PASS";
    else if (right.taxonomyCorrectCount > left.taxonomyCorrectCount
      || (right.taxonomyCorrectCount === left.taxonomyCorrectCount && right.fieldScore > left.fieldScore)
      || (right.taxonomyCorrectCount === left.taxonomyCorrectCount && right.fieldScore === left.fieldScore && safetyErrorCount(right) < safetyErrorCount(left))) delta = "8B_BETTER";
    else if (left.taxonomyCorrectCount > right.taxonomyCorrectCount
      || (left.taxonomyCorrectCount === right.taxonomyCorrectCount && left.fieldScore > right.fieldScore)
      || (left.taxonomyCorrectCount === right.taxonomyCorrectCount && left.fieldScore === right.fieldScore && safetyErrorCount(left) < safetyErrorCount(right))) delta = "3B_BETTER";
    else delta = "EQUAL_FAIL";
    return {
      caseId: item.caseId,
      threeBExact: left.exact,
      eightBExact: right.exact,
      threeBTaxonomy: left.taxonomyCorrectCount,
      eightBTaxonomy: right.taxonomyCorrectCount,
      threeBFieldScore: left.fieldScore,
      eightBFieldScore: right.fieldScore,
      threeBSafetyError: safetyErrorCount(left),
      eightBSafetyError: safetyErrorCount(right),
      delta,
    };
  });
}

export function modelIsolationEvidence(productionModel: string = MODEL_3B): { productionModel: string; benchmarkModels: readonly string[]; isolationPass: boolean } {
  const benchmarkIdentityPreserved = BENCHMARK_MODELS.length === 2
    && BENCHMARK_MODELS[0] === MODEL_3B
    && BENCHMARK_MODELS[1] === MODEL_8B
    && new Set(BENCHMARK_MODELS).size === BENCHMARK_MODELS.length;
  return {
    productionModel,
    benchmarkModels: BENCHMARK_MODELS,
    isolationPass: benchmarkIdentityPreserved && BENCHMARK_MODELS.includes(productionModel as BenchmarkModel),
  };
}
