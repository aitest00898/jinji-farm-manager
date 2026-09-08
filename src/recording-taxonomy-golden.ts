import {
  RECORDING_TAXONOMY,
  type CanonicalTextParse,
  type TaxonomyId,
  parseCanonicalRecordingText,
} from "./recording-taxonomy";

export interface GoldenExpected {
  taxonomyId: TaxonomyId | null;
  subtype: string | null;
  recordWorthiness: "record" | "candidate" | "ignore";
  missingFields?: readonly string[];
  fields?: Readonly<Record<string, unknown>>;
  questionStartsWith?: string;
  reason?: string;
  allowedFields?: readonly string[];
}

export interface GoldenCase {
  id: string;
  text: string;
  expected: GoldenExpected;
  goldPositive: boolean;
}

const scope = "金雞測試場 測試一舍 批次A ";

// These expected values are authored before any model experiment. They are
// deterministic parser contract fixtures, not model-generated expectations.
export const TAXONOMY_GOLDEN_CASES: readonly GoldenCase[] = Object.freeze([
  { id: "O1-chick-in", text: scope + "入雛 公雞600 母雞400 良好", goldPositive: true, expected: { taxonomyId: "O1", subtype: "chick_in", recordWorthiness: "record", fields: { farmText: "金雞測試場", houseText: "測試一舍", flockText: "A", maleCount: 600, femaleCount: 400, condition: "good" } } },
  { id: "O2-vaccination", text: scope + "疫苗 新城雞瘟", goldPositive: true, expected: { taxonomyId: "O2", subtype: "vaccination", recordWorthiness: "record", fields: { content: "新城雞瘟" } } },
  { id: "O2-medication", text: scope + "用藥 球蟲藥", goldPositive: true, expected: { taxonomyId: "O2", subtype: "medication", recordWorthiness: "record", fields: { content: "球蟲藥" } } },
  { id: "O2-supplement", text: scope + "補充品 維生素", goldPositive: true, expected: { taxonomyId: "O2", subtype: "supplement", recordWorthiness: "record", fields: { content: "維生素" } } },
  { id: "O3-shipment", text: scope + "出雞100 公雞 總重180kg", goldPositive: true, expected: { taxonomyId: "O3", subtype: "shipment", recordWorthiness: "record", fields: { quantity: 100, sex: "male", totalWeight: 180 } } },
  { id: "O4-weigh", text: scope + "磅重1.8kg 母雞", goldPositive: true, expected: { taxonomyId: "O4", subtype: "weigh", recordWorthiness: "record", fields: { averageWeight: 1.8, sex: "female", flockText: "A" } } },
  { id: "O5-feed-order", text: scope + "叫飼料 玉米廠 500kg", goldPositive: true, expected: { taxonomyId: "O5", subtype: "feed_order", recordWorthiness: "record", fields: { vendor: "玉米廠", weight: 500, weightUnit: "kg" } } },
  { id: "O6-lab-test", text: scope + "送驗 新城雞瘟", goldPositive: true, expected: { taxonomyId: "O6", subtype: "lab_test", recordWorthiness: "record", fields: { content: "新城雞瘟", workflowStatus: "waiting_result" } } },
  { id: "O7-disinfection", text: scope + "清消 完成", goldPositive: true, expected: { taxonomyId: "O7", subtype: "disinfection", recordWorthiness: "record", fields: { workflowStatus: "completed" } } },
  { id: "O8-maintenance", text: scope + "設備維護 水線", goldPositive: true, expected: { taxonomyId: "O8", subtype: "maintenance", recordWorthiness: "record", fields: { maintenanceContent: "水線" } } },
  { id: "O9-mortality", text: scope + "死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { quantity: 5 } } },
  { id: "O9-cull", text: scope + "淘汰2", goldPositive: true, expected: { taxonomyId: "O9", subtype: "cull", recordWorthiness: "record", fields: { quantity: 2 } } },
  { id: "A1-mortality-abnormality", text: scope + "死亡異常 大範圍", goldPositive: true, expected: { taxonomyId: "A1", subtype: "mortality_abnormality", recordWorthiness: "candidate", missingFields: ["linkedMortalityEventId"], fields: { extent: "large" }, questionStartsWith: "請指出" } },
  { id: "A2-cough", text: scope + "咳嗽 小範圍", goldPositive: true, expected: { taxonomyId: "A2", subtype: "cough", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A3-respiratory-distress", text: scope + "呼吸困難 中範圍", goldPositive: true, expected: { taxonomyId: "A3", subtype: "respiratory_distress", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A4-activity-down", text: scope + "活動力下降 大範圍", goldPositive: true, expected: { taxonomyId: "A4", subtype: "activity_down", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A5-eye-swelling", text: scope + "眼睛腫 小範圍", goldPositive: true, expected: { taxonomyId: "A5", subtype: "eye_swelling", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A5-white-crown", text: scope + "白冠 小範圍", goldPositive: true, expected: { taxonomyId: "A5", subtype: "white_crown", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A5-purple-crown", text: scope + "紫冠 中範圍", goldPositive: true, expected: { taxonomyId: "A5", subtype: "purple_crown", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A5-black-crown", text: scope + "黑冠 大範圍", goldPositive: true, expected: { taxonomyId: "A5", subtype: "black_crown", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A6-watery", text: scope + "水便 小範圍", goldPositive: true, expected: { taxonomyId: "A6", subtype: "watery", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A6-white", text: scope + "白便 小範圍", goldPositive: true, expected: { taxonomyId: "A6", subtype: "white", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A6-green", text: scope + "綠便 中範圍", goldPositive: true, expected: { taxonomyId: "A6", subtype: "green", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A6-bloody", text: scope + "血便 大範圍", goldPositive: true, expected: { taxonomyId: "A6", subtype: "bloody", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A7-growth-delay", text: scope + "生長遲緩 中範圍", goldPositive: true, expected: { taxonomyId: "A7", subtype: "growth_delay", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A8-foot-odor", text: scope + "臭腳 小範圍", goldPositive: true, expected: { taxonomyId: "A8", subtype: "foot_odor", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A9-fever", text: scope + "發燒 中範圍", goldPositive: true, expected: { taxonomyId: "A9", subtype: "fever", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A10-heat-stress", text: scope + "熱緊迫 大範圍", goldPositive: true, expected: { taxonomyId: "A10", subtype: "heat_stress", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A10-catching-stress", text: scope + "抓雞緊迫 小範圍", goldPositive: true, expected: { taxonomyId: "A10", subtype: "catching_stress", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A11-feeding-abnormality", text: scope + "採食異常 小範圍", goldPositive: true, expected: { taxonomyId: "A11", subtype: "feeding_abnormality", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A11-water-abnormality", text: scope + "飲水異常 中範圍", goldPositive: true, expected: { taxonomyId: "A11", subtype: "water_abnormality", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A12-feed", text: scope + "設備異常 飼料線 小範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "feed", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A12-water", text: scope + "設備異常 水線 小範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "water", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A12-electricity", text: scope + "設備異常 停電 中範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "electricity", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A12-fan", text: scope + "設備異常 風扇 大範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "fan", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A12-cooling", text: scope + "設備異常 水簾 小範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "cooling", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A12-heating", text: scope + "設備異常 加熱 中範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "heating", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A12-other", text: scope + "設備異常 其他 水泵漏水 大範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "other", recordWorthiness: "record", fields: { extent: "large", detail: "水泵漏水" } } },
  { id: "A13-high-temperature", text: scope + "高溫 大範圍", goldPositive: true, expected: { taxonomyId: "A13", subtype: "high_temperature", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A13-low-temperature", text: scope + "低溫 小範圍", goldPositive: true, expected: { taxonomyId: "A13", subtype: "low_temperature", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A13-heavy-rain", text: scope + "大雨 中範圍", goldPositive: true, expected: { taxonomyId: "A13", subtype: "heavy_rain", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A14-flooding", text: scope + "淹水 大範圍", goldPositive: true, expected: { taxonomyId: "A14", subtype: "flooding", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A15-odor", text: scope + "異味 小範圍", goldPositive: true, expected: { taxonomyId: "A15", subtype: "odor", recordWorthiness: "record", fields: { extent: "small" } } },
  { id: "A16-attack", text: scope + "攻擊 中範圍", goldPositive: true, expected: { taxonomyId: "A16", subtype: "attack", recordWorthiness: "record", fields: { extent: "medium" } } },
  { id: "A16-infection", text: scope + "感染 大範圍", goldPositive: true, expected: { taxonomyId: "A16", subtype: "infection", recordWorthiness: "record", fields: { extent: "large" } } },
  { id: "A16-spread", text: scope + "擴散 小範圍", goldPositive: true, expected: { taxonomyId: "A16", subtype: "spread", recordWorthiness: "record", fields: { extent: "small" } } },
]);

export const TAXONOMY_GOLDEN_EDGE_CASES: readonly GoldenCase[] = Object.freeze([
  { id: "missing-mortality-quantity", text: scope + "死亡", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "candidate", missingFields: ["quantity"], questionStartsWith: "請補充數量" } },
  { id: "missing-observation-extent", text: scope + "臭腳", goldPositive: true, expected: { taxonomyId: "A8", subtype: "foot_odor", recordWorthiness: "candidate", missingFields: ["extent"], questionStartsWith: "請選擇" } },
  { id: "ambiguous-appearance", text: scope + "外觀異常 大範圍", goldPositive: true, expected: { taxonomyId: "A5", subtype: null, recordWorthiness: "candidate", missingFields: ["subtype"], fields: { extent: "large" }, questionStartsWith: "請補充更明確" } },
  { id: "ambiguous-diarrhea", text: scope + "下痢 大範圍", goldPositive: true, expected: { taxonomyId: "A6", subtype: null, recordWorthiness: "candidate", missingFields: ["subtype"], fields: { extent: "large" }, questionStartsWith: "請補充更明確" } },
  { id: "ambiguous-stress", text: scope + "緊迫 大範圍", goldPositive: true, expected: { taxonomyId: "A10", subtype: null, recordWorthiness: "candidate", missingFields: ["subtype"], fields: { extent: "large" }, questionStartsWith: "請補充更明確" } },
  { id: "ambiguous-equipment", text: scope + "設備異常 大範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: null, recordWorthiness: "candidate", missingFields: ["subtype"], fields: { extent: "large" }, questionStartsWith: "請補充更明確" } },
  { id: "missing-other-detail", text: scope + "設備異常 其他 大範圍", goldPositive: true, expected: { taxonomyId: "A12", subtype: "other", recordWorthiness: "candidate", missingFields: ["detail"], fields: { extent: "large" }, questionStartsWith: "請補充其他" } },
  { id: "missing-feed-vendor", text: scope + "叫飼料 500kg", goldPositive: true, expected: { taxonomyId: "O5", subtype: "feed_order", recordWorthiness: "candidate", missingFields: ["vendor"] } },
  { id: "missing-chick-in-fields", text: "金雞測試場 測試一舍 入雛 公雞600 母雞400", goldPositive: true, expected: { taxonomyId: "O1", subtype: "chick_in", recordWorthiness: "candidate", missingFields: ["condition", "flockId"] } },
  { id: "completed-lab-needs-result", text: scope + "送驗 新城雞瘟 完成", goldPositive: true, expected: { taxonomyId: "O6", subtype: "lab_test", recordWorthiness: "candidate", missingFields: ["result", "completedAt"] } },
  { id: "query-is-not-record", text: "請問目前存欄？", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "ignore" } },
  { id: "future-is-not-record", text: "明天金雞測試場死亡5", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "ignore" } },
  { id: "negated-is-not-record", text: "不是死亡5", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "ignore" } },
  { id: "ordinary-chat-is-not-record", text: "晚安，明天見", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "ignore" } },
  { id: "unknown-is-candidate", text: "金雞測試場 一舍 有點怪怪的", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate" } },
  { id: "today-is-explicitly-recorded", text: "今天 金雞測試場 測試一舍 批次A 死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { quantity: 5, occurredAt: "2026-09-08T00:00:00+08:00" } } },
  { id: "tomorrow-is-not-recorded", text: "明天 金雞測試場 測試一舍 批次A 死亡5", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "ignore", reason: "future_or_hypothetical" } },
  { id: "yesterday-is-explicitly-recorded", text: "昨天 金雞測試場 測試一舍 批次A 死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { quantity: 5, occurredAt: "2026-09-07T00:00:00+08:00" } } },
  { id: "explicit-date-is-preserved", text: "2026-09-01 金雞測試場 測試一舍 批次A 死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { quantity: 5, occurredAt: "2026-09-01T00:00:00+08:00" } } },
  { id: "farm-only-scope-is-a-record", text: "金雞測試場 死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { farmText: "金雞測試場", quantity: 5 } } },
  { id: "farm-house-scope-without-flock", text: "金雞測試場 測試一舍 死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { farmText: "金雞測試場", houseText: "測試一舍", quantity: 5 } } },
  { id: "same-quantity-is-genuinely-new", text: "今天 金雞測試場 測試一舍 批次B 新增死亡5", goldPositive: true, expected: { taxonomyId: "O9", subtype: "mortality", recordWorthiness: "record", fields: { quantity: 5, occurredAt: "2026-09-08T00:00:00+08:00" } } },
  { id: "correction-is-not-a-new-record", text: "修正 金雞測試場 測試一舍 死亡5改成3", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate", reason: "correction_candidate" } },
  { id: "uncertainty-is-not-a-new-record", text: "金雞測試場 測試一舍 可能死亡5", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate", reason: "uncertain_candidate" } },
  { id: "question-is-not-a-record", text: "死亡幾隻？", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "ignore", reason: "question_or_query" } },
  { id: "duplicate-relation-is-not-a-new-record", text: "金雞測試場 測試一舍 剛才那筆死亡5不是新增", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate", reason: "duplicate_or_relation_candidate" } },
  { id: "conflicting-values-stay-closed", text: "金雞測試場 測試一舍 死亡5還是8", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate", reason: "conflicting_values_candidate" } },
  { id: "multi-message-stays-closed", text: "第一則死亡5，第二則咳嗽", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate", reason: "multi_message_candidate" } },
  { id: "multi-user-stays-closed", text: "甲說死亡5，乙說死亡3", goldPositive: false, expected: { taxonomyId: null, subtype: null, recordWorthiness: "candidate", reason: "multi_user_ambiguity_candidate" } },
]);

export interface GoldenMetrics {
  totalCases: number;
  taxonomyCases: number;
  categoriesCovered: number;
  subtypesCovered: number;
  recordWorthinessPrecision: number;
  recordWorthinessRecall: number;
  taxonomyPrecision: number;
  taxonomyRecall: number;
  subtypePrecision: number;
  subtypeRecall: number;
  classificationPrecision: number;
  classificationRecall: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  fieldPrecision: number;
  fieldRecall: number;
  fieldValueAccuracy: number;
  fieldAccuracy: number;
  fieldSwapErrors: number;
  unsafeFieldInvention: number;
  allowedFieldViolations: number;
  knownFieldPreservation: number;
  minimumQuestionAccuracy: number;
  failures: string[];
}

function sameValue(actual: unknown, expected: unknown): boolean {
  return Object.is(actual, expected);
}

function checkExpected(item: GoldenCase, actual: CanonicalTextParse): string[] {
  const failures: string[] = [];
  const expected = item.expected;
  if (actual.taxonomyId !== expected.taxonomyId) failures.push(item.id + ":taxonomyId");
  if (actual.subtype !== expected.subtype) failures.push(item.id + ":subtype");
  if (actual.recordWorthiness !== expected.recordWorthiness) failures.push(item.id + ":recordWorthiness");
  if (expected.reason && actual.reason !== expected.reason) failures.push(item.id + ":reason");
  if (expected.missingFields && JSON.stringify(actual.missingFields) !== JSON.stringify(expected.missingFields)) failures.push(item.id + ":missingFields");
  Object.entries(expected.fields || {}).forEach(([field, value]) => {
    if (!sameValue(actual.fields[field], value)) failures.push(item.id + ":field:" + field);
  });
  if (expected.questionStartsWith && !String(actual.clarificationQuestion || "").startsWith(expected.questionStartsWith)) failures.push(item.id + ":clarificationQuestion");
  return failures;
}

const SCOPE_FIELDS = new Set(["farmText", "houseText", "flockText"]);
const FIELD_SWAP_PAIRS: readonly (readonly [string, string])[] = [
  ["quantity", "weight"],
  ["vendor", "content"],
  ["farmText", "houseText"],
  ["houseText", "flockText"],
  ["sex", "subtype"],
  ["result", "content"],
];

function allowedFieldsForCase(item: GoldenCase): Set<string> {
  const allowed = new Set<string>([
    "farmText",
    "houseText",
    "flockText",
    "occurredAt",
  ]);
  Object.keys(item.expected.fields || {}).forEach((field) => allowed.add(field));
  (item.expected.allowedFields || []).forEach((field) => allowed.add(field));
  if (item.expected.taxonomyId === null) {
    allowed.add("rawText");
  } else {
    const definition = RECORDING_TAXONOMY.find((entry) => entry.id === item.expected.taxonomyId);
    definition?.requiredFields.forEach((field) => allowed.add(field));
    definition?.optionalFields.forEach((field) => allowed.add(field));
    definition?.derivedFields.forEach((field) => allowed.add(field));
    if (item.expected.taxonomyId === "O6") allowed.add("submittedAt");
  }
  return allowed;
}

function fieldQuality(item: GoldenCase, actual: CanonicalTextParse): {
  correct: number;
  expected: number;
  unsafe: number;
  swaps: number;
} {
  const expectedFields = item.expected.fields || {};
  const actualKeys = Object.keys(actual.fields).filter((field) => !SCOPE_FIELDS.has(field));
  const allowed = allowedFieldsForCase(item);
  const correct = Object.entries(expectedFields).filter(([field, value]) => sameValue(actual.fields[field], value)).length;
  const unsafe = actualKeys.filter((field) => !allowed.has(field)).length;
  let swaps = 0;
  for (const [left, right] of FIELD_SWAP_PAIRS) {
    const expectedLeft = expectedFields[left];
    const expectedRight = expectedFields[right];
    const actualLeft = actual.fields[left];
    const actualRight = actual.fields[right];
    if (expectedLeft !== undefined && expectedRight !== undefined
      && sameValue(actualLeft, expectedRight) && sameValue(actualRight, expectedLeft)
      && !sameValue(actualLeft, expectedLeft)) swaps += 1;
    else if (expectedLeft !== undefined && expectedRight === undefined
      && sameValue(actualLeft, undefined) && sameValue(actualRight, expectedLeft)) swaps += 1;
    else if (expectedRight !== undefined && expectedLeft === undefined
      && sameValue(actualRight, undefined) && sameValue(actualLeft, expectedRight)) swaps += 1;
  }
  return { correct, expected: Object.keys(expectedFields).length, unsafe, swaps };
}

export function runTaxonomyGoldenCorpus(now = new Date()): GoldenMetrics {
  const all = [...TAXONOMY_GOLDEN_CASES, ...TAXONOMY_GOLDEN_EDGE_CASES];
  const results = all.map((item) => ({ item, actual: parseCanonicalRecordingText(item.text, now) }));
  const failures = results.flatMap(({ item, actual }) => checkExpected(item, actual));
  const negatives = results.filter(({ item }) => !item.goldPositive);
  const expectedWorthwhile = results.filter(({ item }) => item.expected.recordWorthiness !== "ignore");
  const predictedWorthwhile = results.filter(({ actual }) => actual.recordWorthiness !== "ignore");
  const worthwhileTruePositive = results.filter(({ item, actual }) =>
    item.expected.recordWorthiness !== "ignore" && actual.recordWorthiness !== "ignore").length;
  const taxonomyExpected = results.filter(({ item }) => item.expected.taxonomyId !== null);
  const taxonomyPredicted = results.filter(({ actual }) => actual.taxonomyId !== null && actual.recordWorthiness !== "ignore");
  const taxonomyTruePositive = results.filter(({ item, actual }) =>
    item.expected.taxonomyId !== null && actual.taxonomyId === item.expected.taxonomyId).length;
  const subtypeExpected = results.filter(({ item }) => item.expected.taxonomyId !== null && item.expected.subtype !== null);
  const subtypePredicted = results.filter(({ actual }) => actual.taxonomyId !== null && actual.subtype !== null && actual.recordWorthiness !== "ignore");
  const subtypeTruePositive = results.filter(({ item, actual }) =>
    item.expected.taxonomyId !== null
    && item.expected.subtype !== null
    && actual.taxonomyId === item.expected.taxonomyId
    && actual.subtype === item.expected.subtype).length;
  const falsePositive = negatives.filter(({ actual }) => actual.taxonomyId !== null && actual.recordWorthiness !== "ignore").length;
  const fieldQualityTotals = results.map(({ item, actual }) => fieldQuality(item, actual));
  const expectedFieldCount = fieldQualityTotals.reduce((sum, row) => sum + row.expected, 0);
  const preservedFieldCount = fieldQualityTotals.reduce((sum, row) => sum + row.correct, 0);
  const unsafeFieldInvention = fieldQualityTotals.reduce((sum, row) => sum + row.unsafe, 0);
  const fieldSwapErrors = fieldQualityTotals.reduce((sum, row) => sum + row.swaps, 0);
  const questionCases = results.filter(({ item }) => Boolean(item.expected.questionStartsWith));
  const questionPasses = questionCases.filter(({ item, actual }) => String(actual.clarificationQuestion || "").startsWith(item.expected.questionStartsWith || "")).length;
  const categories = new Set(TAXONOMY_GOLDEN_CASES.map((item) => item.expected.taxonomyId).filter(Boolean));
  const subtypes = new Set(TAXONOMY_GOLDEN_CASES.map((item) => item.expected.taxonomyId + ":" + item.expected.subtype));
  const recordWorthinessPrecision = predictedWorthwhile.length ? worthwhileTruePositive / predictedWorthwhile.length : 1;
  const recordWorthinessRecall = expectedWorthwhile.length ? worthwhileTruePositive / expectedWorthwhile.length : 1;
  const taxonomyPrecision = taxonomyPredicted.length ? taxonomyTruePositive / taxonomyPredicted.length : 1;
  const taxonomyRecall = taxonomyExpected.length ? taxonomyTruePositive / taxonomyExpected.length : 1;
  const subtypePrecision = subtypePredicted.length ? subtypeTruePositive / subtypePredicted.length : 1;
  const subtypeRecall = subtypeExpected.length ? subtypeTruePositive / subtypeExpected.length : 1;
  const fieldPrecision = (preservedFieldCount + unsafeFieldInvention) ? preservedFieldCount / (preservedFieldCount + unsafeFieldInvention) : 1;
  const fieldRecall = expectedFieldCount ? preservedFieldCount / expectedFieldCount : 1;
  return {
    totalCases: all.length,
    taxonomyCases: TAXONOMY_GOLDEN_CASES.length,
    categoriesCovered: categories.size,
    subtypesCovered: subtypes.size,
    recordWorthinessPrecision,
    recordWorthinessRecall,
    taxonomyPrecision,
    taxonomyRecall,
    subtypePrecision,
    subtypeRecall,
    classificationPrecision: subtypePrecision,
    classificationRecall: subtypeRecall,
    precision: taxonomyPrecision,
    recall: taxonomyRecall,
    falsePositiveRate: negatives.length ? falsePositive / negatives.length : 0,
    fieldPrecision,
    fieldRecall,
    fieldValueAccuracy: fieldRecall,
    fieldAccuracy: fieldRecall,
    fieldSwapErrors,
    unsafeFieldInvention,
    allowedFieldViolations: unsafeFieldInvention,
    knownFieldPreservation: expectedFieldCount ? preservedFieldCount / expectedFieldCount : 1,
    minimumQuestionAccuracy: questionCases.length ? questionPasses / questionCases.length : 1,
    failures,
  };
}

export function taxonomyCoverage(): { categories: number; subtypes: number; registryCategories: number; registrySubtypes: number } {
  const registrySubtypes = RECORDING_TAXONOMY.reduce((sum, item) => sum + item.canonicalSubtypes.length, 0);
  return {
    categories: new Set(TAXONOMY_GOLDEN_CASES.map((item) => item.expected.taxonomyId)).size,
    subtypes: new Set(TAXONOMY_GOLDEN_CASES.map((item) => item.expected.taxonomyId + ":" + item.expected.subtype)).size,
    registryCategories: RECORDING_TAXONOMY.length,
    registrySubtypes,
  };
}
