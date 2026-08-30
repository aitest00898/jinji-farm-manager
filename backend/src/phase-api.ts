import {
  buildAnalysisContext,
  classifyAnalysisFailure,
  generateDailyBrief,
  getCachedBrief,
  runReadOnlyAnalysis,
  validateAnalysisScope,
  type AnalysisEnv,
  type AnalysisScope,
} from "./analysis";
import {
  insertAbnormalEvent,
  parseAbnormalTiming,
  validateAbnormalRawText,
  type AbnormalEnv,
  type AbnormalScope,
} from "./abnormal";
import { isIsoDate, normalizedHouseName, taipeiDate } from "./master-data";

export interface PhaseApiEnv extends AbnormalEnv, AnalysisEnv {}

export interface PhaseSession {
  id: string;
  organizationId: string;
}

type Responder = (body: unknown, status?: number, extra?: HeadersInit) => Response;
type ErrorResponder = (status: number, code: string, message: string) => Response;

const MAX_PAGE_SIZE = 100;
const CATEGORIES = new Set(["health", "equipment", "environment", "weather_disaster", "feed", "water", "biosecurity", "operation", "logistics", "structure", "system", "other"]);

async function bodyJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json() as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function text(value: unknown, max = 1000): string | null {
  return typeof value === "string" && value.trim() && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)
    ? value
    : null;
}

function encoded(value: string): string {
  return btoa(value).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decoded(value: string): string | null {
  try { return atob(value.replace(/-/gu, "+").replace(/_/gu, "/")); } catch { return null; }
}

function cursorValue(value: string | null): { sortAt: string; id: string } | null {
  if (!value) return null;
  const raw = decoded(value);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sortAt?: unknown; id?: unknown };
    return typeof parsed.sortAt === "string" && typeof parsed.id === "string" ? { sortAt: parsed.sortAt, id: parsed.id } : null;
  } catch {
    return null;
  }
}

async function resolveAbnormalScope(
  env: PhaseApiEnv,
  organizationId: string,
  farmId: string,
  requestedHouseId: string | null,
  requestedFlockId: string | null,
): Promise<AbnormalScope & { houseCandidates?: Array<{ id: string; name: string }> } | null> {
  const farm = await env.DB.prepare(
    `SELECT id, name, environment, farm_structure_mode AS structureMode
       FROM farms WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1`,
  ).bind(farmId, organizationId).first<{ id: string; name: string; environment: "production" | "test"; structureMode: "whole_farm" | "multi_house" }>();
  if (!farm) return null;
  let house: { id: string; name: string } | null = null;
  if (requestedHouseId) {
    house = await env.DB.prepare(
      `SELECT id, name FROM houses WHERE id = ? AND farm_id = ? AND active = 1 LIMIT 1`,
    ).bind(requestedHouseId, farm.id).first<{ id: string; name: string }>();
    if (!house) return null;
  } else if (farm.structureMode === "multi_house") {
    const activeHouses = await env.DB.prepare(
      `SELECT DISTINCT h.id, h.name
         FROM houses h LEFT JOIN flocks k ON k.house_id = h.id AND k.status = 'active'
        WHERE h.farm_id = ? AND h.active = 1
        ORDER BY h.name`,
    ).bind(farm.id).all<{ id: string; name: string }>();
    if (activeHouses.results.length === 1) house = activeHouses.results[0];
    else if (activeHouses.results.length > 1) {
      return {
        organizationId,
        farmId: farm.id,
        farmName: farm.name,
        farmEnvironment: farm.environment,
        structureMode: farm.structureMode,
        houseId: null,
        houseName: null,
        flockId: null,
        houseCandidates: activeHouses.results,
      };
    }
  }
  let flockId = requestedFlockId;
  if (flockId) {
    const flock = await env.DB.prepare(
      `SELECT id FROM flocks WHERE id = ? AND farm_id = ? AND (? IS NULL OR house_id = ?) AND status = 'active' LIMIT 1`,
    ).bind(flockId, farm.id, house?.id ?? null, house?.id ?? null).first<{ id: string }>();
    if (!flock) return null;
  } else if (house) {
    const active = await env.DB.prepare(
      `SELECT id FROM flocks WHERE house_id = ? AND status = 'active' ORDER BY id`,
    ).bind(house.id).all<{ id: string }>();
    if (active.results.length === 1) flockId = active.results[0].id;
    if (active.results.length > 1) return null;
  }
  return {
    organizationId,
    farmId: farm.id,
    farmName: farm.name,
    farmEnvironment: farm.environment,
    structureMode: farm.structureMode,
    houseId: house?.id ?? null,
    houseName: house?.name ?? null,
    flockId: flockId ?? null,
  };
}

async function listAbnormalEvents(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const cursor = cursorValue(url.searchParams.get("cursor"));
  const clauses = ["a.organization_id = ?"];
  const bindings: unknown[] = [session.organizationId];
  const farmId = url.searchParams.get("farmId");
  const houseId = url.searchParams.get("houseId");
  const flockId = url.searchParams.get("flockId");
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (farmId) { clauses.push("a.farm_id = ?"); bindings.push(farmId); }
  if (houseId) { clauses.push("a.house_id = ?"); bindings.push(houseId); }
  if (flockId) { clauses.push("a.flock_id = ?"); bindings.push(flockId); }
  if (category && CATEGORIES.has(category)) { clauses.push("a.ai_category = ?"); bindings.push(category); }
  if (search?.trim()) { clauses.push("a.raw_text LIKE ? ESCAPE '\\'"); bindings.push(`%${search.trim().replace(/[\\%_]/gu, "\\$&")}%`); }
  if (from && isIsoDate(from)) { clauses.push("a.occurred_date >= ?"); bindings.push(from); }
  if (to && isIsoDate(to)) { clauses.push("a.occurred_date <= ?"); bindings.push(to); }
  if (cursor) { clauses.push("(a.reported_at < ? OR (a.reported_at = ? AND a.id < ?))"); bindings.push(cursor.sortAt, cursor.sortAt, cursor.id); }
  const rows = await env.DB.prepare(
    `SELECT a.id, a.farm_id AS farmId, f.name AS farmName, f.environment,
            a.house_id AS houseId, h.name AS houseName, a.flock_id AS flockId,
            a.occurred_at AS occurredAt, a.occurred_date AS occurredDate,
            a.approximate_period AS approximatePeriod, a.reported_at AS reportedAt,
            a.raw_text AS rawText, a.source, a.ai_category AS category,
            a.ai_tags_json AS tagsJson, a.ai_confidence AS confidence,
            a.classification_status AS classificationStatus, a.weather_date AS weatherDate,
            a.status, a.correction_of_id AS correctionOfId, a.reversal_of_id AS reversalOfId,
            a.reason, a.created_at AS createdAt
       FROM abnormal_events a JOIN farms f ON f.id = a.farm_id
       LEFT JOIN houses h ON h.id = a.house_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.reported_at DESC, a.id DESC LIMIT ?`,
  ).bind(...bindings, limit + 1).all<Record<string, unknown>>();
  const values = rows.results.slice(0, limit);
  const responseValues = values.map((row) => ({ ...row, tags: typeof row.tagsJson === "string" ? JSON.parse(row.tagsJson as string) : [] }));
  const last = values[values.length - 1];
  const nextCursor = rows.results.length > limit && last ? encoded(JSON.stringify({ sortAt: last.reportedAt, id: last.id })) : null;
  return respond({ abnormalEvents: responseValues, nextCursor });
}

async function createAbnormalEvent(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder, fail: ErrorResponder): Promise<Response> {
  const body = await bodyJson(request);
  const rawText = body?.rawText;
  const farmId = text(body?.farmId, 160);
  const houseId = body?.houseId === null || body?.houseId === undefined || body?.houseId === "" ? null : text(body.houseId, 160);
  const flockId = body?.flockId === null || body?.flockId === undefined || body?.flockId === "" ? null : text(body.flockId, 160);
  if (!validateAbnormalRawText(rawText) || !farmId) return fail(400, "invalid_abnormal_event", "只需填寫發生的事情，並指定有效雞場。");
  const scope = await resolveAbnormalScope(env, session.organizationId, farmId, houseId, flockId);
  if (!scope) return fail(400, "invalid_scope", "雞場、雞舍或批次範圍無效，沒有寫入。");
  if (scope.houseCandidates?.length) return fail(409, "house_required", "此雞場有多個雞舍，請只選擇要記錄的雞舍。");
  const reportedAt = new Date().toISOString();
  const timing = parseAbnormalTiming(rawText, reportedAt);
  if (typeof body?.occurredAt === "string" && Number.isFinite(Date.parse(body.occurredAt))) {
    const exact = new Date(body.occurredAt).toISOString();
    timing.occurredAt = exact;
    timing.occurredDate = taipeiDate(new Date(exact));
    timing.weatherDate = timing.occurredDate;
    timing.approximatePeriod = null;
  }
  const sourceEventId = `web-abnormal-${crypto.randomUUID()}`;
  const result = await insertAbnormalEvent(env, {
    ...scope,
    ...timing,
    rawText,
    source: "web",
    actorId: session.id,
    sourceEventId,
  });
  return respond({ created: result.created, id: result.id, rawText, timing }, result.created ? 201 : 200);
}

async function abnormalById(env: PhaseApiEnv, organizationId: string, id: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(
    `SELECT * FROM abnormal_events WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(id, organizationId).first<Record<string, unknown>>();
}

async function reverseAbnormalEvent(request: Request, env: PhaseApiEnv, session: PhaseSession, id: string, respond: Responder, fail: ErrorResponder): Promise<Response> {
  const body = await bodyJson(request);
  const reason = text(body?.reason, 500)?.trim() ?? null;
  const row = await abnormalById(env, session.organizationId, id);
  if (!row) return fail(404, "not_found", "找不到異常紀錄。");
  if (row.status !== "active") return fail(409, "already_inactive", "此紀錄已修正或反轉。");
  const reversalId = `abnormal-reversal-${crypto.randomUUID()}`;
  const sourceEventId = `web-abnormal-reversal-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE abnormal_events SET status = 'reversed', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ? AND status = 'active'").bind(reason, id, session.organizationId),
    env.DB.prepare(
      `INSERT INTO abnormal_events
        (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
         approximate_period, reported_at, raw_text, source, actor_id, classification_status,
         weather_date, status, reversal_of_id, reason, source_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web', ?, 'skipped', ?, 'reversal', ?, ?, ?)`,
    ).bind(reversalId, session.organizationId, row.farm_id, row.house_id, row.flock_id, row.occurred_at, row.occurred_date, row.approximate_period, now, row.raw_text, session.id, row.weather_date, id, reason, sourceEventId),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
         before_json, after_json, changed_fields_json, reason, request_id)
       VALUES (?, ?, 'web', 'web_admin', ?, 'reverse', 'abnormal_event', ?, ?, ?, '["status"]', ?, ?)`,
    ).bind(`audit-${crypto.randomUUID()}`, session.organizationId, session.id, id, JSON.stringify(row), JSON.stringify({ status: "reversed", reversalId }), reason, sourceEventId),
  ]);
  return respond({ reversed: true, id, reversalId });
}

async function correctAbnormalEvent(request: Request, env: PhaseApiEnv, session: PhaseSession, id: string, respond: Responder, fail: ErrorResponder): Promise<Response> {
  const body = await bodyJson(request);
  const reason = text(body?.reason, 500)?.trim() ?? null;
  const rawText = body?.rawText;
  if (!validateAbnormalRawText(rawText)) return fail(400, "invalid_abnormal_text", "請輸入修正後的內容。");
  const row = await abnormalById(env, session.organizationId, id);
  if (!row) return fail(404, "not_found", "找不到異常紀錄。");
  if (row.status !== "active") return fail(409, "already_inactive", "此紀錄已修正或反轉。");
  const correctedId = `abnormal-correction-${crypto.randomUUID()}`;
  const sourceEventId = `web-abnormal-correction-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE abnormal_events SET status = 'corrected', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ? AND status = 'active'").bind(reason, id, session.organizationId),
    env.DB.prepare(
      `INSERT INTO abnormal_events
        (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
         approximate_period, reported_at, raw_text, source, actor_id, weather_date,
         status, correction_of_id, reason, source_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web', ?, ?, 'active', ?, ?, ?)`,
    ).bind(correctedId, session.organizationId, row.farm_id, row.house_id, row.flock_id, row.occurred_at, row.occurred_date, row.approximate_period, now, rawText, session.id, row.weather_date, id, reason, sourceEventId),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
         before_json, after_json, changed_fields_json, reason, request_id)
       VALUES (?, ?, 'web', 'web_admin', ?, 'correct', 'abnormal_event', ?, ?, ?, '["rawText","status"]', ?, ?)`,
    ).bind(`audit-${crypto.randomUUID()}`, session.organizationId, session.id, id, JSON.stringify(row), JSON.stringify({ correctedId, rawText, status: "corrected" }), reason, sourceEventId),
  ]);
  if (env.EVENTS) {
    try { await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: correctedId }); } catch { /* non-blocking */ }
  }
  return respond({ corrected: true, id, correctedId }, 201);
}

async function timeline(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const cursor = cursorValue(url.searchParams.get("cursor"));
  const farmId = url.searchParams.get("farmId");
  const houseId = url.searchParams.get("houseId");
  const flockId = url.searchParams.get("flockId");
  const shared = (alias: string): { sql: string; bindings: unknown[] } => {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (farmId) { clauses.push(`${alias}.farm_id = ?`); bindings.push(farmId); }
    if (houseId) { clauses.push(`${alias}.house_id = ?`); bindings.push(houseId); }
    if (flockId) { clauses.push(`${alias}.flock_id = ?`); bindings.push(flockId); }
    return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", bindings };
  };
  const operational = shared("e");
  const abnormal = shared("a");
  const cursorSql = cursor ? "WHERE (t.sortAt < ? OR (t.sortAt = ? AND t.id < ?))" : "";
  const cursorBindings = cursor ? [cursor.sortAt, cursor.sortAt, cursor.id] : [];
  const rows = await env.DB.prepare(
    `SELECT t.*, COALESCE(w.weather_condition, sw.weather_condition) AS weatherCondition,
            COALESCE(w.max_temperature_c, sw.max_temperature_c) AS maxTemperatureC,
            COALESCE(w.max_temperature_at, sw.max_temperature_at) AS maxTemperatureAt,
            COALESCE(w.min_temperature_c, sw.min_temperature_c) AS minTemperatureC,
            COALESCE(w.min_temperature_at, sw.min_temperature_at) AS minTemperatureAt,
            COALESCE(w.fetch_status, sw.fetch_status) AS weatherStatus
       FROM (
         SELECT e.id, 'operational' AS itemType, e.organization_id AS organizationId,
                e.farm_id AS farmId, f.name AS farmName, f.environment,
                e.house_id AS houseId, COALESCE(h.name, e.house) AS houseName,
                e.flock_id AS flockId, e.event_date AS occurredDate,
                e.created_at AS sortAt, e.intent AS eventType, e.quantity, e.unit,
                NULL AS rawText, CASE WHEN e.reversed_at IS NULL THEN 'active' ELSE 'reversed' END AS status
           FROM operational_events e JOIN farms f ON f.id = e.farm_id
           LEFT JOIN houses h ON h.id = e.house_id
          WHERE e.organization_id = ?${operational.sql}
         UNION ALL
         SELECT a.id, 'abnormal' AS itemType, a.organization_id AS organizationId,
                a.farm_id AS farmId, f.name AS farmName, f.environment,
                a.house_id AS houseId, h.name AS houseName, a.flock_id AS flockId,
                a.occurred_date AS occurredDate, COALESCE(a.occurred_at, a.reported_at) AS sortAt,
                a.ai_category AS eventType, NULL AS quantity, NULL AS unit,
                a.raw_text AS rawText, a.status
           FROM abnormal_events a JOIN farms f ON f.id = a.farm_id
           LEFT JOIN houses h ON h.id = a.house_id
          WHERE a.organization_id = ?${abnormal.sql}
       ) t
       LEFT JOIN weather_daily w ON w.farm_id = t.farmId AND w.weather_date = t.occurredDate
       LEFT JOIN weather_scope_daily sw ON sw.weather_date = t.occurredDate
       LEFT JOIN weather_scopes ws ON ws.id = sw.weather_scope_id AND ws.scope_key = 'yunlin-county-tw'
       ${cursorSql}
      ORDER BY t.sortAt DESC, t.id DESC LIMIT ?`,
  ).bind(session.organizationId, ...operational.bindings, session.organizationId, ...abnormal.bindings, ...cursorBindings, limit + 1).all<Record<string, unknown>>();
  const values = rows.results.slice(0, limit);
  const last = values[values.length - 1];
  const nextCursor = rows.results.length > limit && last ? encoded(JSON.stringify({ sortAt: last.sortAt, id: last.id })) : null;
  return respond({ timeline: values, nextCursor });
}

async function weatherList(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder): Promise<Response> {
  const url = new URL(request.url);
  const clauses = ["s.scope_key = 'yunlin-county-tw'"];
  const bindings: unknown[] = [];
  const farmId = url.searchParams.get("farmId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && isIsoDate(from)) { clauses.push("w.weather_date >= ?"); bindings.push(from); }
  if (to && isIsoDate(to)) { clauses.push("w.weather_date <= ?"); bindings.push(to); }
  const rows = await env.DB.prepare(
    `SELECT w.id, NULL AS farmId, s.label AS farmName, 'production' AS environment,
            w.weather_date AS weatherDate, w.weather_condition AS condition,
            w.max_temperature_c AS maxTemperatureC, w.max_temperature_at AS maxTemperatureAt,
            w.min_temperature_c AS minTemperatureC, w.min_temperature_at AS minTemperatureAt,
            w.provider, w.fetch_status AS fetchStatus, w.error_code AS errorCode,
            w.fetched_at AS fetchedAt, s.scope_key AS weatherScope
       FROM weather_scope_daily w JOIN weather_scopes s ON s.id = w.weather_scope_id
      WHERE ${clauses.join(" AND ")}
        AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = ? AND o.active = 1)
      ORDER BY w.weather_date DESC LIMIT ?`,
  ).bind(...bindings, session.organizationId, MAX_PAGE_SIZE).all<Record<string, unknown>>();
  return respond({ weather: rows.results, weatherScope: "雲林縣" });
}

async function aiLiveStatus(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder, fail: ErrorResponder): Promise<Response> {
  const url = new URL(request.url);
  const scope = validateAnalysisScope({ type: url.searchParams.get("scopeType") ?? "organization", id: url.searchParams.get("scopeId") ?? "organization" });
  if (!scope) return fail(400, "invalid_analysis_scope", "分析範圍無效。");
  try {
    const context = await buildAnalysisContext(env, session.organizationId, scope);
    return respond({ context, aiInvoked: false });
  } catch {
    return fail(404, "analysis_scope_not_found", "找不到分析範圍。");
  }
}

async function aiBrief(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder, fail: ErrorResponder): Promise<Response> {
  const scope: AnalysisScope = { type: "organization", id: "organization" };
  try {
    if (request.method === "GET") {
      const [brief, context] = await Promise.all([getCachedBrief(env, session.organizationId, scope), buildAnalysisContext(env, session.organizationId, scope)]);
      return respond({ brief, liveStatus: context.liveStatus, aiInvoked: false });
    }
    const brief = await generateDailyBrief(env, session.organizationId, scope, true);
    return respond({ brief, aiInvoked: true });
  } catch {
    return fail(503, "ai_analysis_unavailable", "目前無法產生 AI 簡報；即時營運數據仍可正常查看。");
  }
}

async function aiAnalyze(request: Request, env: PhaseApiEnv, session: PhaseSession, respond: Responder, fail: ErrorResponder): Promise<Response> {
  const body = await bodyJson(request);
  const question = text(body?.question, 1000)?.trim();
  const scope = validateAnalysisScope(body?.scope ?? { type: "organization", id: "organization" });
  const force = body?.force === true;
  if (!question || !scope) return fail(400, "invalid_analysis_request", "請輸入問題並使用有效分析範圍。");
  try {
    const result = await runReadOnlyAnalysis(env, session.organizationId, scope, question, force);
    return respond({ result, readOnly: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "invalid_analysis_question") return fail(400, "invalid_analysis_question", "AI 助理只接受唯讀營運分析問題，不接受 SQL 或資料修改指令。");
    if (code === "analysis_scope_not_found") return fail(404, "analysis_scope_not_found", "找不到分析範圍。");
    const failure = classifyAnalysisFailure(error);
    return fail(503, failure.code, "目前無法完成 AI 分析；D1 查詢與異常紀錄不受影響。");
  }
}

async function aiHistory(env: PhaseApiEnv, session: PhaseSession, respond: Responder): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, scope_type AS scopeType, scope_id AS scopeId, report_type AS reportType,
            question, content_json AS contentJson, context_hash AS contextHash,
            model, created_at AS createdAt
       FROM ai_reports WHERE organization_id = ?
      ORDER BY created_at DESC LIMIT 30`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  return respond({ reports: rows.results.map((row) => ({ ...row, content: typeof row.contentJson === "string" ? JSON.parse(row.contentJson as string) : null })) });
}

export async function handlePhaseApi(
  request: Request,
  env: PhaseApiEnv,
  session: PhaseSession,
  respond: Responder,
  fail: ErrorResponder,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/abnormal-events" && request.method === "GET") return listAbnormalEvents(request, env, session, respond);
  if (url.pathname === "/api/abnormal-events" && request.method === "POST") return createAbnormalEvent(request, env, session, respond, fail);
  const reverse = /^\/api\/abnormal-events\/([^/]+)\/reverse$/u.exec(url.pathname);
  if (reverse && request.method === "POST") return reverseAbnormalEvent(request, env, session, reverse[1], respond, fail);
  const correct = /^\/api\/abnormal-events\/([^/]+)\/correct$/u.exec(url.pathname);
  if (correct && request.method === "POST") return correctAbnormalEvent(request, env, session, correct[1], respond, fail);
  if (url.pathname === "/api/timeline" && request.method === "GET") return timeline(request, env, session, respond);
  if (url.pathname === "/api/weather" && request.method === "GET") return weatherList(request, env, session, respond);
  if (url.pathname === "/api/ai/live-status" && request.method === "GET") return aiLiveStatus(request, env, session, respond, fail);
  if (url.pathname === "/api/ai/brief" && (request.method === "GET" || request.method === "POST")) return aiBrief(request, env, session, respond, fail);
  if (url.pathname === "/api/ai/analyze" && request.method === "POST") return aiAnalyze(request, env, session, respond, fail);
  if (url.pathname === "/api/ai/reports" && request.method === "GET") return aiHistory(env, session, respond);
  return null;
}

export { normalizedHouseName };
