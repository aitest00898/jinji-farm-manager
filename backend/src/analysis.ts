import {
  deterministicAbnormalClassification,
  parseAbnormalClassification,
  type AbnormalClassification,
} from "./abnormal";
import { taipeiDate } from "./master-data";
import { extractJsonResult, extractJsonValue, type JsonExtractionFailure } from "./ai-json";

export const PRODUCTION_AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export const ANALYSIS_TOOL_NAMES = [
  "get_farm_summary",
  "get_house_summary",
  "get_flock_summary",
  "get_operational_events",
  "get_abnormal_events",
  "get_weather_daily",
  "get_finance_summary",
  "get_kpi_trends",
  "compare_farms",
  "compare_flocks",
  "get_audit_summary",
] as const;

export type AnalysisToolName = (typeof ANALYSIS_TOOL_NAMES)[number];
export type AnalysisScopeType = "organization" | "farm" | "house" | "flock" | "finance" | "trend";

export interface AnalysisScope {
  type: AnalysisScopeType;
  id: string;
}

export interface StructuredAnalysis {
  currentStatus: string;
  findings: string[];
  possibleCauses: Array<{ text: string; evidence: "strong" | "medium" | "weak" }>;
  risks: string[];
  recommendations: string[];
  limitations: string[];
}

export interface AnalysisContext {
  asOf: string;
  scope: AnalysisScope;
  scopeEntity: Record<string, unknown> | null;
  liveStatus: Record<string, number>;
  flocks: Array<Record<string, unknown>>;
  operations: Array<Record<string, unknown>>;
  abnormalities: Array<Record<string, unknown>>;
  weather: Array<Record<string, unknown>>;
  finance: Record<string, number> | null;
  audit: Array<Record<string, unknown>>;
  toolsUsed: AnalysisToolName[];
}

export interface AnalysisEnv {
  DB: D1Database;
  AI?: Ai;
}

export interface AnalysisRunResult {
  report: StructuredAnalysis;
  cached: boolean;
  contextHash: string;
  model: string;
  createdAt: string;
}

export type AnalysisFailureLayer = "context" | "provider" | "response_validation" | "persistence" | "unknown";

export const ANALYSIS_RESPONSE_FAILURE_CODES = {
  response_text_missing: "ai_response_text_missing",
  // Kept for compatibility with previously emitted bounded errors. New
  // parsing failures use the structural subtypes below.
  json_extraction_failed: "ai_response_json_extraction_failed",
  json_no_object_candidate: "ai_response_json_no_object_candidate",
  json_object_unterminated: "ai_response_json_object_unterminated",
  json_object_candidate_invalid: "ai_response_json_object_candidate_invalid",
  json_object_candidate_ambiguous: "ai_response_json_object_candidate_ambiguous",
  schema_top_level_invalid: "ai_response_schema_top_level_invalid",
  schema_required_field_missing: "ai_response_schema_required_field_missing",
  schema_field_type_invalid: "ai_response_schema_field_type_invalid",
  schema_possible_causes_invalid: "ai_response_schema_possible_causes_invalid",
  schema_evidence_enum_invalid: "ai_response_schema_evidence_enum_invalid",
  schema_constraint_invalid: "ai_response_schema_constraint_invalid",
} as const;

export type AnalysisResponseFailureSubtype = keyof typeof ANALYSIS_RESPONSE_FAILURE_CODES;
type AnalysisResponseFailureCode = (typeof ANALYSIS_RESPONSE_FAILURE_CODES)[AnalysisResponseFailureSubtype];

export interface AnalysisFailureClassification {
  layer: AnalysisFailureLayer;
  code: "ai_context_unavailable" | "ai_provider_unavailable" | "ai_response_invalid" | AnalysisResponseFailureCode | "ai_cache_unavailable" | "ai_report_persistence_failed" | "ai_analysis_unavailable";
}

function isAnalysisResponseFailureSubtype(value: string): value is AnalysisResponseFailureSubtype {
  return Object.prototype.hasOwnProperty.call(ANALYSIS_RESPONSE_FAILURE_CODES, value);
}

export function classifyAnalysisFailure(error: unknown): AnalysisFailureClassification {
  const code = error instanceof Error ? error.message : "";
  const responseFailurePrefix = "analysis_response_invalid:";
  if (code.startsWith(responseFailurePrefix)) {
    const subtype = code.slice(responseFailurePrefix.length);
    if (isAnalysisResponseFailureSubtype(subtype)) {
      return { layer: "response_validation", code: ANALYSIS_RESPONSE_FAILURE_CODES[subtype] };
    }
  }
  if (code === "analysis_context_unavailable") return { layer: "context", code: "ai_context_unavailable" };
  if (code === "analysis_ai_unavailable") return { layer: "provider", code: "ai_provider_unavailable" };
  if (code === "analysis_schema_invalid") return { layer: "response_validation", code: "ai_response_invalid" };
  if (code === "analysis_cache_read_failed") return { layer: "persistence", code: "ai_cache_unavailable" };
  if (code === "analysis_report_persistence_failed") return { layer: "persistence", code: "ai_report_persistence_failed" };
  return { layer: "unknown", code: "ai_analysis_unavailable" };
}

const ANALYSIS_EVIDENCE = new Set(["strong", "medium", "weak"]);
const SCOPE_TYPES = new Set<AnalysisScopeType>(["organization", "farm", "house", "flock", "finance", "trend"]);
const SQL_LANGUAGE = /(?:\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bPRAGMA\b|;|--)/iu;

export function isReadOnlyAnalysisQuestion(value: string): boolean {
  const text = value.normalize("NFKC").trim();
  if (!text || text.length > 1000) return false;
  return /(?:分析|比較|比较|原因|為什麼|为什么|需要注意|共同點|共同点|表現比較差|表现比较差|最近有哪些異常|最近有哪些异常|死亡率比較高|死亡率比较高|營收較差|营收较差)/u.test(text);
}

export function validateAnalysisScope(value: unknown): AnalysisScope | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || !SCOPE_TYPES.has(record.type as AnalysisScopeType)) return null;
  if (typeof record.id !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/u.test(record.id)) return null;
  return { type: record.type as AnalysisScopeType, id: record.id };
}

export function validateAnalysisToolPlan(value: unknown): Array<{ name: AnalysisToolName; args: Record<string, unknown> }> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const tools = (value as { tools?: unknown }).tools;
  if (!Array.isArray(tools) || tools.length < 1 || tools.length > 8) return null;
  const parsed: Array<{ name: AnalysisToolName; args: Record<string, unknown> }> = [];
  for (const item of tools) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string" || !ANALYSIS_TOOL_NAMES.includes(record.name as AnalysisToolName)) return null;
    if (typeof record.args !== "object" || record.args === null || Array.isArray(record.args)) return null;
    if (SQL_LANGUAGE.test(JSON.stringify(record.args))) return null;
    parsed.push({ name: record.name as AnalysisToolName, args: record.args as Record<string, unknown> });
  }
  return parsed;
}

function aiText(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return "";
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string") return response;
  if (response && typeof response === "object") return JSON.stringify(response);
  return "";
}

function jsonValue(raw: string): unknown {
  return extractJsonValue(raw);
}

type AnalysisSchemaFailureSubtype = Exclude<
  AnalysisResponseFailureSubtype,
  "response_text_missing" | "json_extraction_failed" | JsonExtractionFailure
>;
type StructuredAnalysisParseResult =
  | { ok: true; report: StructuredAnalysis }
  | { ok: false; subtype: AnalysisSchemaFailureSubtype };
type TextListParseResult =
  | { ok: true; value: string[] }
  | { ok: false; subtype: "schema_field_type_invalid" | "schema_constraint_invalid" };

function textListResult(value: unknown, maxItems = 8): TextListParseResult {
  if (!Array.isArray(value)) return { ok: false, subtype: "schema_field_type_invalid" };
  if (value.length > maxItems) return { ok: false, subtype: "schema_constraint_invalid" };
  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, subtype: "schema_field_type_invalid" };
    const text = item.trim();
    if (!text || text.length > 500) return { ok: false, subtype: "schema_constraint_invalid" };
    values.push(text);
  }
  return { ok: true, value: values };
}

/** Finance values in this system are TWD. Normalize legacy/model wording at
 * the response boundary so cached AI briefs cannot display a foreign unit. */
function normalizeCurrencyText(value: string): string {
  return value
    .replace(/(?:美元|美金|US\s*dollars?|USD)/giu, "元")
    .replace(/(^|[^A-Za-z])\$\s*(?=\d)/gu, "$1NT$");
}

const REQUIRED_ANALYSIS_FIELDS = ["currentStatus", "findings", "possibleCauses", "risks", "recommendations", "limitations"] as const;

function parseStructuredAnalysisResult(value: unknown): StructuredAnalysisParseResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, subtype: "schema_top_level_invalid" };
  const record = value as Record<string, unknown>;
  for (const field of REQUIRED_ANALYSIS_FIELDS) {
    if (record[field] === undefined) return { ok: false, subtype: "schema_required_field_missing" };
  }
  if (typeof record.currentStatus !== "string") return { ok: false, subtype: "schema_field_type_invalid" };
  if (!record.currentStatus.trim() || record.currentStatus.length > 1200) return { ok: false, subtype: "schema_constraint_invalid" };

  const findings = textListResult(record.findings);
  if (!findings.ok) return findings;
  const risks = textListResult(record.risks);
  if (!risks.ok) return risks;
  const recommendations = textListResult(record.recommendations);
  if (!recommendations.ok) return recommendations;
  const limitations = textListResult(record.limitations);
  if (!limitations.ok) return limitations;

  if (!Array.isArray(record.possibleCauses)) return { ok: false, subtype: "schema_possible_causes_invalid" };
  if (record.possibleCauses.length > 8) return { ok: false, subtype: "schema_constraint_invalid" };
  const possibleCauses: StructuredAnalysis["possibleCauses"] = [];
  for (const item of record.possibleCauses) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return { ok: false, subtype: "schema_possible_causes_invalid" };
    const cause = item as Record<string, unknown>;
    if (typeof cause.text !== "string" || typeof cause.evidence !== "string") return { ok: false, subtype: "schema_possible_causes_invalid" };
    if (!cause.text.trim() || cause.text.length > 500) return { ok: false, subtype: "schema_constraint_invalid" };
    if (!ANALYSIS_EVIDENCE.has(cause.evidence)) return { ok: false, subtype: "schema_evidence_enum_invalid" };
    possibleCauses.push({ text: cause.text.trim(), evidence: cause.evidence as "strong" | "medium" | "weak" });
  }
  return {
    ok: true,
    report: {
      currentStatus: normalizeCurrencyText(record.currentStatus.trim()),
      findings: findings.value.map(normalizeCurrencyText),
      possibleCauses: possibleCauses.map((cause) => ({ ...cause, text: normalizeCurrencyText(cause.text) })),
      risks: risks.value.map(normalizeCurrencyText),
      recommendations: recommendations.value.map(normalizeCurrencyText),
      limitations: limitations.value.map(normalizeCurrencyText),
    },
  };
}

export function parseStructuredAnalysis(value: unknown): StructuredAnalysis | null {
  const result = parseStructuredAnalysisResult(value);
  return result.ok ? result.report : null;
}

export type AnalysisResponseParseResult =
  | { ok: true; report: StructuredAnalysis }
  | { ok: false; subtype: AnalysisResponseFailureSubtype };

export function parseAnalysisResponse(result: unknown): AnalysisResponseParseResult {
  const raw = aiText(result);
  if (!raw.trim()) return { ok: false, subtype: "response_text_missing" };
  const json = extractJsonResult(raw);
  if (!json.ok) return { ok: false, subtype: json.failure };
  return parseStructuredAnalysisResult(json.value);
}

async function hashJson(value: unknown): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

interface ScopeResolution {
  entity: Record<string, unknown> | null;
  farmId: string | null;
  houseId: string | null;
  flockId: string | null;
}

async function resolveScope(env: AnalysisEnv, organizationId: string, scope: AnalysisScope): Promise<ScopeResolution | null> {
  if (scope.type === "organization" || scope.type === "finance" || scope.type === "trend") {
    const entity = await env.DB.prepare("SELECT id, name FROM organizations WHERE id = ? AND active = 1").bind(organizationId).first<Record<string, unknown>>();
    return entity ? { entity, farmId: null, houseId: null, flockId: null } : null;
  }
  if (scope.type === "farm") {
    const entity = await env.DB.prepare(
      `SELECT id, name, environment, farm_structure_mode AS structureMode
         FROM farms WHERE id = ? AND organization_id = ? AND active = 1`,
    ).bind(scope.id, organizationId).first<Record<string, unknown>>();
    return entity ? { entity, farmId: scope.id, houseId: null, flockId: null } : null;
  }
  if (scope.type === "house") {
    const entity = await env.DB.prepare(
      `SELECT h.id, h.name, h.farm_id AS farmId, f.name AS farmName, f.environment
         FROM houses h JOIN farms f ON f.id = h.farm_id
        WHERE h.id = ? AND f.organization_id = ? AND h.active = 1`,
    ).bind(scope.id, organizationId).first<Record<string, unknown> & { farmId?: string }>();
    return entity?.farmId ? { entity, farmId: entity.farmId, houseId: scope.id, flockId: null } : null;
  }
  const entity = await env.DB.prepare(
    `SELECT k.id, k.batch_code AS batchCode, k.farm_id AS farmId, k.house_id AS houseId,
            k.chick_in_date AS chickInDate, k.initial_count AS initialCount, k.status,
            f.name AS farmName, f.environment
       FROM flocks k JOIN farms f ON f.id = k.farm_id
      WHERE k.id = ? AND f.organization_id = ?`,
  ).bind(scope.id, organizationId).first<Record<string, unknown> & { farmId?: string; houseId?: string }>();
  return entity?.farmId && entity.houseId ? { entity, farmId: entity.farmId, houseId: entity.houseId, flockId: scope.id } : null;
}

function scopedClause(resolution: ScopeResolution, alias: string): { sql: string; bindings: unknown[] } {
  if (resolution.flockId) return { sql: ` AND ${alias}.flock_id = ?`, bindings: [resolution.flockId] };
  if (resolution.houseId) return { sql: ` AND ${alias}.house_id = ?`, bindings: [resolution.houseId] };
  if (resolution.farmId) return { sql: ` AND ${alias}.farm_id = ?`, bindings: [resolution.farmId] };
  return { sql: "", bindings: [] };
}

export async function buildAnalysisContext(env: AnalysisEnv, organizationId: string, scope: AnalysisScope): Promise<AnalysisContext> {
  const resolved = await resolveScope(env, organizationId, scope);
  if (!resolved) throw new Error("analysis_scope_not_found");
  const operationScope = scopedClause(resolved, "e");
  const abnormalScope = scopedClause(resolved, "a");
  const flockScope = resolved.flockId
    ? { sql: " AND k.id = ?", bindings: [resolved.flockId] }
    : resolved.houseId
      ? { sql: " AND k.house_id = ?", bindings: [resolved.houseId] }
      : resolved.farmId
        ? { sql: " AND k.farm_id = ?", bindings: [resolved.farmId] }
        : { sql: "", bindings: [] as unknown[] };
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  const fromDate = from.toISOString().slice(0, 10);
  const today = taipeiDate();

  const [live, flocks, operations, abnormalities, weather, finance, audit] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN e.intent = 'mortality' AND e.event_date = ? AND e.reversed_at IS NULL THEN e.quantity ELSE 0 END), 0) AS todayMortality,
         COALESCE(SUM(CASE WHEN e.intent = 'cull' AND e.event_date = ? AND e.reversed_at IS NULL THEN e.quantity ELSE 0 END), 0) AS todayCull,
         COALESCE(SUM(CASE WHEN e.intent = 'feed' AND e.event_date = ? AND e.reversed_at IS NULL THEN e.quantity ELSE 0 END), 0) AS todayFeed,
         COALESCE(SUM(CASE WHEN e.intent = 'water' AND e.event_date = ? AND e.reversed_at IS NULL THEN e.quantity ELSE 0 END), 0) AS todayWater
       FROM operational_events e WHERE e.organization_id = ?${operationScope.sql}`,
    ).bind(today, today, today, today, organizationId, ...operationScope.bindings).first<Record<string, number>>(),
    env.DB.prepare(
      `SELECT k.id, k.batch_code AS batchCode, k.farm_id AS farmId, k.house_id AS houseId,
              k.chick_in_date AS chickInDate, k.initial_count AS initialCount,
              k.expected_shipment_date AS expectedShipmentDate, k.status,
              MAX(0, k.initial_count - COALESCE(SUM(CASE WHEN e.reversed_at IS NULL AND e.intent IN ('mortality','cull','shipment') THEN e.quantity ELSE 0 END), 0)) AS currentStock
         FROM flocks k JOIN farms f ON f.id = k.farm_id
         LEFT JOIN operational_events e ON e.flock_id = k.id
        WHERE f.organization_id = ?${flockScope.sql}
        GROUP BY k.id ORDER BY k.chick_in_date DESC LIMIT 20`,
    ).bind(organizationId, ...flockScope.bindings).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT e.event_date AS eventDate, e.intent, SUM(e.quantity) AS quantity, e.unit,
              e.farm_id AS farmId, e.house_id AS houseId, e.flock_id AS flockId
         FROM operational_events e
        WHERE e.organization_id = ? AND e.event_date BETWEEN ? AND ? AND e.reversed_at IS NULL${operationScope.sql}
        GROUP BY e.event_date, e.intent, e.unit, e.farm_id, e.house_id, e.flock_id
        ORDER BY e.event_date DESC LIMIT 120`,
    ).bind(organizationId, fromDate, today, ...operationScope.bindings).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT a.id, a.occurred_date AS occurredDate, a.approximate_period AS approximatePeriod,
              a.raw_text AS rawText, a.ai_category AS category, a.ai_tags_json AS tagsJson,
              a.farm_id AS farmId, a.house_id AS houseId, a.flock_id AS flockId
         FROM abnormal_events a
        WHERE a.organization_id = ? AND a.occurred_date BETWEEN ? AND ?
          AND a.status = 'active'${abnormalScope.sql}
        ORDER BY a.occurred_date DESC, a.created_at DESC LIMIT 50`,
    ).bind(organizationId, fromDate, today, ...abnormalScope.bindings).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT w.weather_date AS weatherDate, w.weather_condition AS condition,
              w.max_temperature_c AS maxTemperatureC, w.max_temperature_at AS maxTemperatureAt,
              w.min_temperature_c AS minTemperatureC, w.min_temperature_at AS minTemperatureAt,
              NULL AS farmId, s.label AS weatherScope
         FROM weather_scope_daily w JOIN weather_scopes s ON s.id = w.weather_scope_id
        WHERE s.scope_key = 'yunlin-county-tw' AND w.weather_date BETWEEN ? AND ?
          AND w.fetch_status IN ('captured', 'backfilled')
        ORDER BY w.weather_date DESC LIMIT 100`,
    ).bind(fromDate, today).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(d.allocated_profit_loss), 0) AS allocated,
              COALESCE(SUM(d.expense), 0) AS expense,
              COALESCE(SUM(d.net_income), 0) AS net
         FROM profit_distributions d JOIN farms f ON f.id = d.farm_id
        WHERE d.organization_id = ? AND f.environment = 'production'${resolved.farmId ? " AND d.farm_id = ?" : ""}`,
    ).bind(organizationId, ...(resolved.farmId ? [resolved.farmId] : [])).first<Record<string, number>>(),
    env.DB.prepare(
      `SELECT action, entity_type AS entityType, COUNT(*) AS count
         FROM audit_logs WHERE organization_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY action, entity_type ORDER BY count DESC LIMIT 20`,
    ).bind(organizationId).all<Record<string, unknown>>(),
  ]);
  const abnormalCount = abnormalities.results.length;
  const liveStatus = { ...(live ?? {}), recentAbnormalEvents: abnormalCount, activeFlocks: flocks.results.filter((row) => row.status === "active").length };
  return {
    asOf: new Date().toISOString(),
    scope,
    scopeEntity: resolved.entity,
    liveStatus,
    flocks: flocks.results,
    operations: operations.results,
    abnormalities: abnormalities.results.map((row) => ({ ...row, tags: typeof row.tagsJson === "string" ? jsonValue(row.tagsJson) : [] })),
    weather: weather.results,
    finance: finance ?? null,
    audit: audit.results,
    toolsUsed: [
      resolved.flockId ? "get_flock_summary" : resolved.houseId ? "get_house_summary" : resolved.farmId ? "get_farm_summary" : "get_kpi_trends",
      "get_operational_events",
      "get_abnormal_events",
      "get_weather_daily",
      "get_finance_summary",
      "get_audit_summary",
    ],
  };
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["currentStatus", "findings", "possibleCauses", "risks", "recommendations", "limitations"],
  properties: {
    currentStatus: { type: "string" },
    findings: { type: "array", items: { type: "string" }, maxItems: 8 },
    possibleCauses: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidence"],
        properties: { text: { type: "string" }, evidence: { type: "string", enum: ["strong", "medium", "weak"] } },
      },
    },
    risks: { type: "array", items: { type: "string" }, maxItems: 8 },
    recommendations: { type: "array", items: { type: "string" }, maxItems: 8 },
    limitations: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
};

const ANALYSIS_SYSTEM_PROMPT = `你是金雞協會的唯讀雞場營運分析助理。只能根據提供的 validated context 回答，不得生成 SQL、不得修改資料、不得聲稱已執行任何寫入。
回答必須是單一 JSON 物件，且永遠包含以下六個欄位：currentStatus（字串）、findings（字串陣列）、possibleCauses（物件陣列，每個物件必須包含 text（字串）與 evidence（只能是 strong、medium、weak））、risks（字串陣列）、recommendations（字串陣列）、limitations（字串陣列）。沒有適用內容的陣列請使用 []，不可省略欄位；資料不足請寫入 limitations，不得為填滿欄位而捏造事實。區分事實、相關性、推測與因果；資料只顯示同期間變化時，只能稱為相關或同時發生。
不得提供獸醫診斷、藥物或抗生素劑量；相關情況應建議聯絡合格獸醫。資料不足要列在 limitations。
所有財務金額均為台灣貨幣 TWD；輸出請使用「元」或「台幣」，絕對不可寫成美元、美金、USD 或未標示的外幣。不得換算金額。`;

async function invokeAnalysisAi(env: AnalysisEnv, question: string, context: AnalysisContext): Promise<StructuredAnalysis> {
  if (!env.AI) throw new Error("analysis_ai_unavailable");
  let result: unknown;
  try {
    result = await env.AI.run(PRODUCTION_AI_MODEL, {
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: `問題：${question}\nvalidatedContext=${JSON.stringify(context)}` },
      ],
      // The production Llama model uses prompt-constrained JSON plus strict
      // local validation; response_format/json_schema is intentionally absent.
      max_tokens: 1200,
      temperature: 0,
    });
  } catch {
    throw new Error("analysis_ai_unavailable");
  }
  const parsed = parseAnalysisResponse(result);
  if (!parsed.ok) throw new Error(`analysis_response_invalid:${parsed.subtype}`);
  return parsed.report;
}

export async function runReadOnlyAnalysis(
  env: AnalysisEnv,
  organizationId: string,
  scope: AnalysisScope,
  question: string,
  force = false,
): Promise<AnalysisRunResult> {
  const normalizedQuestion = question.normalize("NFKC").trim();
  if (!normalizedQuestion || normalizedQuestion.length > 1000 || SQL_LANGUAGE.test(normalizedQuestion)) throw new Error("invalid_analysis_question");
  let context: AnalysisContext;
  try {
    context = await buildAnalysisContext(env, organizationId, scope);
  } catch (error) {
    if (error instanceof Error && error.message === "analysis_scope_not_found") throw error;
    throw new Error("analysis_context_unavailable");
  }
  const contextHash = await hashJson({ context, question: normalizedQuestion });
  if (!force) {
    let cached: { contentJson: string; model: string; createdAt: string } | null;
    try {
      cached = await env.DB.prepare(
        `SELECT content_json AS contentJson, model, created_at AS createdAt
           FROM ai_reports
          WHERE organization_id = ? AND scope_type = ? AND scope_id = ?
            AND report_type = 'question' AND context_hash = ?
          ORDER BY created_at DESC LIMIT 1`,
      ).bind(organizationId, scope.type, scope.id, contextHash).first<{ contentJson: string; model: string; createdAt: string }>();
    } catch {
      throw new Error("analysis_cache_read_failed");
    }
    const report = cached ? parseStructuredAnalysis(jsonValue(cached.contentJson)) : null;
    if (cached && report) return { report, cached: true, contextHash, model: cached.model, createdAt: cached.createdAt };
  }
  const report = await invokeAnalysisAi(env, normalizedQuestion, context);
  const id = `ai-report-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO ai_reports
        (id, organization_id, scope_type, scope_id, report_type, question, content_json, context_hash, model)
       VALUES (?, ?, ?, ?, 'question', ?, ?, ?, ?)
       ON CONFLICT(organization_id, scope_type, scope_id, report_type, context_hash) DO UPDATE SET
         question = excluded.question, content_json = excluded.content_json,
         model = excluded.model, created_at = CURRENT_TIMESTAMP`,
    ).bind(id, organizationId, scope.type, scope.id, normalizedQuestion, JSON.stringify(report), contextHash, PRODUCTION_AI_MODEL).run();
  } catch {
    throw new Error("analysis_report_persistence_failed");
  }
  return { report, cached: false, contextHash, model: PRODUCTION_AI_MODEL, createdAt: now };
}

export async function getCachedBrief(env: AnalysisEnv, organizationId: string, scope: AnalysisScope): Promise<AnalysisRunResult | null> {
  const row = await env.DB.prepare(
    `SELECT content_json AS contentJson, context_hash AS contextHash, model, created_at AS createdAt
       FROM ai_briefs
      WHERE organization_id = ? AND scope_type = ? AND scope_id = ? AND brief_date = ?
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(organizationId, scope.type, scope.id, taipeiDate()).first<{ contentJson: string; contextHash: string; model: string; createdAt: string }>();
  const report = row ? parseStructuredAnalysis(jsonValue(row.contentJson)) : null;
  return row && report ? { report, cached: true, contextHash: row.contextHash, model: row.model, createdAt: row.createdAt } : null;
}

export async function generateDailyBrief(
  env: AnalysisEnv,
  organizationId: string,
  scope: AnalysisScope = { type: "organization", id: "organization" },
  force = false,
): Promise<AnalysisRunResult> {
  if (!force) {
    const cached = await getCachedBrief(env, organizationId, scope);
    if (cached) return cached;
  }
  const context = await buildAnalysisContext(env, organizationId, scope);
  const contextHash = await hashJson(context);
  const report = await invokeAnalysisAi(env, "請根據目前資料產生精簡的今日營運簡報。", context);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ai_briefs
      (id, organization_id, scope_type, scope_id, brief_date, content_json,
       context_hash, model, generated_through_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, scope_type, scope_id, brief_date, context_hash) DO UPDATE SET
       content_json = excluded.content_json, model = excluded.model,
       generated_through_at = excluded.generated_through_at, updated_at = CURRENT_TIMESTAMP`,
  ).bind(`ai-brief-${crypto.randomUUID()}`, organizationId, scope.type, scope.id, taipeiDate(), JSON.stringify(report), contextHash, PRODUCTION_AI_MODEL, now).run();
  return { report, cached: false, contextHash, model: PRODUCTION_AI_MODEL, createdAt: now };
}

const CLASSIFICATION_SCHEMA = {
  name: "abnormal_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["category", "tags", "confidence"],
    properties: {
      category: { type: "string", enum: ["health", "equipment", "environment", "weather_disaster", "feed", "water", "biosecurity", "operation", "logistics", "structure", "system", "other"] },
      tags: { type: "array", maxItems: 8, items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$" } },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  },
};

export async function classifyAbnormalWithAi(ai: Ai, rawText: string): Promise<AbnormalClassification | null> {
  const result = await ai.run(PRODUCTION_AI_MODEL, {
    messages: [
      { role: "system", content: "你是雞場異常紀錄分類器。只輸出 JSON metadata，不提供診斷、藥物、處方或任何資料庫操作。原文不可被改寫。" },
      { role: "user", content: rawText },
    ],
    // Keep this call compatible with the same model contract as Ambient and
    // semantic parsing: prompt-constrained JSON, then local validation.
    max_tokens: 160,
    temperature: 0,
  });
  return parseAbnormalClassification(jsonValue(aiText(result)));
}

export async function processAbnormalClassification(env: AnalysisEnv, abnormalEventId: string): Promise<"classified" | "failed" | "skipped"> {
  const row = await env.DB.prepare(
    `SELECT id, raw_text AS rawText, classification_status AS classificationStatus
       FROM abnormal_events WHERE id = ? LIMIT 1`,
  ).bind(abnormalEventId).first<{ id: string; rawText: string; classificationStatus: string }>();
  if (!row || row.classificationStatus === "classified") return "skipped";
  try {
    const classification = deterministicAbnormalClassification(row.rawText)
      ?? (env.AI ? await classifyAbnormalWithAi(env.AI, row.rawText) : null);
    if (!classification) {
      await env.DB.prepare(
        `UPDATE abnormal_events SET classification_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(row.id).run();
      return "failed";
    }
    await env.DB.prepare(
      `UPDATE abnormal_events
          SET ai_category = ?, ai_tags_json = ?, ai_confidence = ?,
              classification_status = 'classified', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    ).bind(classification.category, JSON.stringify(classification.tags), classification.confidence, row.id).run();
    return "classified";
  } catch {
    await env.DB.prepare(
      `UPDATE abnormal_events SET classification_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(row.id).run();
    return "failed";
  }
}
