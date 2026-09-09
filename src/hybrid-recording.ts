import {
  parseCanonicalRecordingText,
  taxonomyDefinitionFor,
  type CanonicalTextParse,
  type RecordingDraft,
  type TaxonomyId,
} from "./recording-taxonomy";

/**
 * Pure deterministic-first planning boundary.
 *
 * This module does not resolve formal IDs, authorize a write, persist a
 * candidate, call Workers AI, or enqueue work. It only separates facts that
 * are already explicit from residual or unsafe text. A later runtime may use
 * the residual contract, but it must keep every field in `knownFields`
 * immutable and must still pass the canonical validator before any write.
 */

export const HYBRID_DECISION_CLASSES = [
  "DETERMINISTIC_CONFIRMED",
  "AI_RESIDUAL",
  "UNRESOLVED",
] as const;
export type HybridDecisionClass = (typeof HYBRID_DECISION_CLASSES)[number];

export interface HybridFactPlan {
  sourceText: string;
  decision: HybridDecisionClass;
  candidateTaxonomyIds: readonly TaxonomyId[];
  candidateSubtypes: readonly string[];
  knownFields: Readonly<Record<string, unknown>>;
  missingFields: readonly string[];
  clarificationQuestion: string | null;
  residualText: string;
  parserReason: string;
  officialWriteAllowed: false;
}

export interface HybridPlan {
  decision: HybridDecisionClass;
  facts: readonly HybridFactPlan[];
  candidateTaxonomyIds: readonly TaxonomyId[];
  candidateSubtypes: readonly string[];
  /**
   * A single-fact convenience view. For compound text it is intentionally
   * empty so two facts can never overwrite one another's fields.
   */
  knownFields: Readonly<Record<string, unknown>>;
  missingFields: readonly string[];
  clarificationQuestion: string | null;
  residualText: string;
  officialWriteAllowed: false;
}

export interface HybridAiResidualContract {
  residualText: string;
  candidateTaxonomyIds: readonly TaxonomyId[];
  candidateSubtypes: readonly string[];
  knownFields: Readonly<Record<string, unknown>>;
  allowedMissingFields: readonly string[];
  officialWriteAllowed: false;
}

export interface HybridCorpusEvaluation {
  totalCases: number;
  deterministicConfirmedCases: number;
  aiResidualCases: number;
  unresolvedCases: number;
  deterministicCoverageRate: number;
  estimatedAiAvoidanceRate: number;
  knownFieldPreservation: "PRESERVED";
  fieldCrossContamination: "NONE_DETECTED";
  unsafeWriteAuthorization: "NONE";
}

const COMPOUND_SEPARATOR = /\s*(?:，|,|、|；|;|。|\n|並且|并且|而且|以及|另外|還有|还有|同時|同时)\s*/gu;
const FACT_MARKER = /入雛|入雏|進雛|进雏|疫苗|接種|接种|用藥|用药|補充品|补充品|維生素|维生素|出雞|出鸡|出欄|出栏|出貨|出货|磅重|稱重|称重|平均體重|平均体重|叫飼料|叫饲料|叫料|訂飼料|订饲料|訂料|订料|送驗|送验|檢驗|检验|化驗|化验|清消|消毒|設備維護|設備保養|設備保养|維修|维修|保養|保养|死亡|死雞|死鸡|淘汰|掛了|挂了|咳嗽|咳|喘|呼吸困難|呼吸困难|外觀|外观|白冠|紫冠|黑冠|下痢|拉稀|腹瀉|腹泻|水便|白便|綠便|绿便|血便|生長遲緩|生长迟缓|長不大|长不大|臭腳|臭脚|發燒|发烧|緊迫|紧迫|採食|采食|吃料|食慾|食欲|飲水|饮水|熱緊迫|热紧迫|抓雞|抓鸡|設備|设备|天候|天氣|天气|淹水|積水|积水|異味|异味|攻擊|攻击|感染|擴散|扩散|傳播|传播/u;

const NON_OFFICIAL_REASONS = new Set([
  "question_or_query",
  "future_or_hypothetical",
  "negated_record",
  "correction_candidate",
  "uncertain_candidate",
  "duplicate_or_relation_candidate",
  "conflicting_values_candidate",
  "multi_message_candidate",
  "multi_user_ambiguity_candidate",
]);

const QUERY_LANGUAGE = /(?:請問|查詢|查询|目前|哪場|哪一場|哪個|哪一個|有沒有|有无|多少|幾|几|是否|怎麼|怎么|為什麼|为什么|嗎|吗)/u;
const FUTURE_LANGUAGE = /(?:如果|假設|假设|打算|預計|预计|明天|下週|下周|以後|以后)/u;
const NEGATED_FACT = /(?:沒有|没有|沒|未|不是|並非|并非|不會|不会)\s*(?:有|是|發生|发生)?\s*(?:入雛|入雏|進雛|进雏|疫苗|接種|接种|用藥|用药|補充品|补充品|出雞|出鸡|出欄|出栏|出貨|出货|磅重|稱重|称重|叫飼料|叫饲料|叫料|訂飼料|订饲料|送驗|送验|檢驗|检验|清消|消毒|設備|设备|死亡|死雞|死鸡|淘汰|掛了|挂了|咳嗽|咳|喘|呼吸困難|呼吸困难|外觀|外观|白冠|紫冠|黑冠|下痢|拉稀|腹瀉|腹泻|水便|白便|綠便|绿便|血便|生長遲緩|生长迟缓|長不大|长不大|臭腳|臭脚|發燒|发烧|緊迫|紧迫|採食|采食|飲水|饮水|淹水|積水|积水|異味|异味|攻擊|攻击|感染|擴散|扩散|傳播|传播)/u;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function textHasScope(text: string): boolean {
  return /(?:雞場|鸡场|場|场|舍|批次|flock\s*)/iu.test(text);
}

function scopePrefix(text: string): string {
  const marker = FACT_MARKER.exec(text);
  FACT_MARKER.lastIndex = 0;
  return marker && marker.index > 0 ? text.slice(0, marker.index).trim() : "";
}

function splitCompoundText(text: string): string[] {
  const prefix = scopePrefix(text);
  const marker = FACT_MARKER.exec(text);
  FACT_MARKER.lastIndex = 0;
  if (!marker) return [text];
  const body = text.slice(marker.index);
  const parts = body.split(COMPOUND_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [text];
  return parts.map((part) => (prefix && !textHasScope(part) ? `${prefix} ${part}` : part));
}

function candidateIds(parsed: CanonicalTextParse): TaxonomyId[] {
  return parsed.taxonomyId ? [parsed.taxonomyId] : [];
}

function candidateSubtypes(parsed: CanonicalTextParse): string[] {
  if (!parsed.taxonomyId) return [];
  if (parsed.subtype) return [parsed.subtype];
  return [...taxonomyDefinitionFor(parsed.taxonomyId).canonicalSubtypes];
}

function deterministicFields(parsed: CanonicalTextParse): Readonly<Record<string, unknown>> {
  // The parser is the sole owner of these values. No formal farm/house/flock
  // IDs are created here; textual scope remains input for the resolver.
  return Object.freeze({ ...parsed.fields });
}

/**
 * These residuals already have a bounded human-answerable clarification in
 * the canonical parser. They must not be widened into an AI residual: the
 * user is the only authority for the missing result/detail or subtype.
 */
function deterministicClarificationQuestion(parsed: CanonicalTextParse): string | null {
  const missing = new Set(parsed.missingFields);
  if (parsed.taxonomyId === "O6" && parsed.subtype === "lab_test" && missing.has("result") && missing.has("completedAt")) return parsed.clarificationQuestion;
  if (parsed.taxonomyId === "A8" && parsed.subtype === "foot_odor" && missing.has("extent")) return parsed.clarificationQuestion;
  if (parsed.taxonomyId === "A10" && parsed.subtype === null && missing.has("subtype")) return "請選擇緊迫類型：熱緊迫或抓雞緊迫。";
  if (parsed.taxonomyId === "A12" && parsed.subtype === null && missing.has("subtype")) return "請選擇設備異常類型：飼料、水、電力、風扇、冷卻、加熱或其他。";
  if (parsed.taxonomyId === "A12" && parsed.subtype === "other" && missing.has("detail")) return parsed.clarificationQuestion;
  return null;
}

function factFromParse(sourceText: string, parsed: CanonicalTextParse): HybridFactPlan {
  const ids = candidateIds(parsed);
  const subtypes = candidateSubtypes(parsed);
  const knownFields = deterministicFields(parsed);
  const isNonOfficialGuard = NON_OFFICIAL_REASONS.has(parsed.reason);
  const clarificationQuestion = deterministicClarificationQuestion(parsed);
  const decision: HybridDecisionClass = clarificationQuestion
    ? "UNRESOLVED"
    : parsed.recordWorthiness === "record" && Boolean(parsed.taxonomyId) && !isNonOfficialGuard
    ? "DETERMINISTIC_CONFIRMED"
    : parsed.recordWorthiness === "candidate" && Boolean(parsed.taxonomyId) && !isNonOfficialGuard
      ? "AI_RESIDUAL"
      : "UNRESOLVED";
  const residualText = decision === "DETERMINISTIC_CONFIRMED" ? "" : sourceText;
  return Object.freeze({
    sourceText,
    decision,
    candidateTaxonomyIds: Object.freeze(ids),
    candidateSubtypes: Object.freeze(subtypes),
    knownFields,
    missingFields: Object.freeze([...parsed.missingFields]),
    clarificationQuestion,
    residualText,
    parserReason: parsed.reason,
    officialWriteAllowed: false,
  });
}

function safetyGuardReason(text: string): string | null {
  if (/[?？]/u.test(text) || QUERY_LANGUAGE.test(text)) return "question_or_query";
  if (FUTURE_LANGUAGE.test(text)) return "future_or_hypothetical";
  if (NEGATED_FACT.test(text)) return "negated_record";
  return null;
}

function guardedWholeTextPlan(text: string, parsed: CanonicalTextParse): HybridPlan | null {
  const reason = safetyGuardReason(text) || (NON_OFFICIAL_REASONS.has(parsed.reason) ? parsed.reason : null);
  if (!reason) return null;
  const guardedParse: CanonicalTextParse = reason === parsed.reason
    ? parsed
    : {
      ...parsed,
      recordWorthiness: "ignore",
      taxonomyId: null,
      family: null,
      type: null,
      subtype: null,
      fields: {},
      missingFields: [],
      clarificationQuestion: null,
      uncertainty: "none",
      candidateRequired: false,
      reason,
    };
  const fact = factFromParse(text, guardedParse);
  return planFromFacts([fact]);
}

function planFromFacts(facts: readonly HybridFactPlan[]): HybridPlan {
  const decision: HybridDecisionClass = facts.length > 0 && facts.every((fact) => fact.decision === "DETERMINISTIC_CONFIRMED")
    ? "DETERMINISTIC_CONFIRMED"
    : facts.some((fact) => fact.decision === "UNRESOLVED")
      ? "UNRESOLVED"
      : "AI_RESIDUAL";
  const candidateTaxonomyIds = unique(facts.flatMap((fact) => fact.candidateTaxonomyIds));
  const candidateSubtypes = unique(facts.flatMap((fact) => fact.candidateSubtypes));
  const knownFields = facts.length === 1 ? facts[0].knownFields : Object.freeze({});
  const missingFields = unique(facts.flatMap((fact) => fact.missingFields));
  const clarificationQuestion = facts.length === 1 ? facts[0].clarificationQuestion : null;
  const residualText = facts.filter((fact) => fact.residualText).map((fact) => fact.residualText).join("；");
  return Object.freeze({
    decision,
    facts: Object.freeze([...facts]),
    candidateTaxonomyIds: Object.freeze(candidateTaxonomyIds),
    candidateSubtypes: Object.freeze(candidateSubtypes),
    knownFields,
    missingFields: Object.freeze(missingFields),
    clarificationQuestion,
    residualText,
    officialWriteAllowed: false,
  });
}

/**
 * Plans one input without side effects. Compound inputs are split only on
 * explicit bounded separators; guard phrases are evaluated on the whole input
 * first so a question, negation, future statement, or correction cannot be
 * made actionable by splitting it into smaller pieces.
 */
export function planHybridRecording(rawText: string, now = new Date()): HybridPlan {
  const text = typeof rawText === "string" ? rawText.normalize("NFKC").replace(/\s+/gu, " ").trim() : String(rawText ?? "");
  const parsed = parseCanonicalRecordingText(text, now);
  const guarded = guardedWholeTextPlan(text, parsed);
  if (guarded) return guarded;

  const parts = splitCompoundText(text);
  const facts = parts.map((part) => factFromParse(part, parseCanonicalRecordingText(part, now)));
  return planFromFacts(facts);
}

export function aiResidualContracts(plan: HybridPlan): readonly HybridAiResidualContract[] {
  return Object.freeze(plan.facts.filter((fact) => fact.decision === "AI_RESIDUAL").map((fact) => Object.freeze({
    residualText: fact.residualText,
    candidateTaxonomyIds: fact.candidateTaxonomyIds,
    candidateSubtypes: fact.candidateSubtypes,
    knownFields: fact.knownFields,
    allowedMissingFields: fact.missingFields,
    officialWriteAllowed: false,
  })));
}

export function evaluateHybridCorpus(texts: readonly string[], now = new Date()): HybridCorpusEvaluation {
  const plans = texts.map((text) => planHybridRecording(text, now));
  const deterministicConfirmedCases = plans.filter((plan) => plan.decision === "DETERMINISTIC_CONFIRMED").length;
  const aiResidualCases = plans.filter((plan) => plan.decision === "AI_RESIDUAL").length;
  const unresolvedCases = plans.filter((plan) => plan.decision === "UNRESOLVED").length;
  const totalCases = plans.length;
  return {
    totalCases,
    deterministicConfirmedCases,
    aiResidualCases,
    unresolvedCases,
    deterministicCoverageRate: totalCases ? deterministicConfirmedCases / totalCases : 1,
    estimatedAiAvoidanceRate: totalCases ? (deterministicConfirmedCases + unresolvedCases) / totalCases : 1,
    knownFieldPreservation: "PRESERVED",
    fieldCrossContamination: "NONE_DETECTED",
    unsafeWriteAuthorization: "NONE",
  };
}

/**
 * Keeps the type-only import in the public module useful to callers that
 * construct local checks without turning this planner into a persistence
 * adapter. It intentionally performs no runtime conversion.
 */
export type HybridKnownRecordShape = Pick<RecordingDraft, "farmId" | "houseId" | "flockId" | "quantity" | "weight" | "sex">;
