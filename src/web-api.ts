import { verifyAdminPassword } from "./admin-auth";
import { insertAbnormalEvent, parseAbnormalTiming } from "./abnormal";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  ambientPrefilter,
  validateAmbientCandidateBundle,
  type AmbientBufferedMessage,
  type AmbientCandidate,
} from "./ambient";
import { AMBIENT_DIGEST_CRON, dailyReviewCronExpression } from "./daily-review";
import {
  addIsoDays,
  deriveCurrentStock,
  flockAgeDays,
  isIsoDate,
  normalizedHouseName,
  shipmentReminder,
  taipeiDate,
  type StockAdjustment,
} from "./master-data";
import { normalizedFarmKey } from "./farm-resolver";
import {
  hashWebSessionToken,
  randomWebSessionToken,
  WEB_SESSION_TTL_MS,
  auditLogStatement,
  webSessionIsActive,
  writeAuditLog,
} from "./domain";
import { handlePhaseApi } from "./phase-api";
import {
  acknowledgeRetainedLineEvents,
  getReliabilityStatus,
  LINE_EVENT_RECOVERY_CRON,
  markRetainedLineEventManuallyRecorded,
  manuallyRecoverLineEvent,
  manuallyRecoverLineEvents,
  resolveRetainedLineEvent,
  type ReliabilityStatus,
} from "./reliability";

export interface WebApiEnv {
  DB: D1Database;
  EVENTS?: { send(message: unknown): Promise<unknown> };
  AI?: Ai;
  FARM_ADMIN_PASSWORD_HASH?: string;
  LINE_ACCOUNT_NAME?: string;
  CONVERSATION_V2_MODE?: string;
  CONVERSATION_MODEL?: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://aitest00898.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const OPERATIONAL_INTENTS = new Set(["mortality", "cull", "feed", "water", "shipment"]);
const UNITS = new Set(["隻", "bird", "kg", "L", "件"]);
const MAX_PAGE_SIZE = 100;

interface WebAmbientBufferedRow extends AmbientBufferedMessage {
  expiresAt: string;
}

interface WebPendingCandidateRow {
  id: string;
  organizationId: string;
  lineGroupId: string;
  hourBucket: string;
  candidateJson: string;
  status: string;
  expiresAt: string;
  snoozedUntil: string | null;
  source: string;
  workflowHistoryJson: string | null;
}

function shortIdentifier(value: string | null | undefined, length = 8): string {
  const normalized = String(value ?? "").replace(/[^A-Za-z0-9_-]/gu, "");
  return normalized ? normalized.slice(-length) : "—";
}

function taipeiDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function ambientEventLabel(value: string | undefined): string {
  return ({ mortality: "死亡", cull: "淘汰", abnormal: "異常" } as Record<string, string>)[value ?? ""] ?? "營運資訊";
}

function ambientCandidateStateLabel(value: string | undefined): string {
  return ({
    new: "待確認",
    unresolved_entity: "雞場或位置待確認",
    unresolved_quantity: "數量待確認",
    conflict: "資料不一致",
    possibly_recorded: "可能已記錄",
    already_recorded: "可能重複",
    no_actionable_event: "目前沒有可記錄項目",
    system_failure: "整理時發生問題",
  } as Record<string, string>)[value ?? ""] ?? "待確認";
}

function ambientCandidateSummary(candidate: AmbientCandidate): Record<string, unknown> {
  const blocking = (candidate.conflictEvidence ?? []).some((evidence) => evidence.blocking);
  const farm = candidate.farmText
    ?? candidate.resolution?.candidateFarmNames?.join("、")
    ?? (candidate.resolution?.resolvedFarmId ? `已選定雞場（${shortIdentifier(candidate.resolution.resolvedFarmId)}）` : null);
  const caretakerClues = Array.from(new Set([
    ...(candidate.caretakerClues ?? []),
    ...(candidate.caretakerText ? [candidate.caretakerText] : []),
  ])).filter(Boolean);
  return {
    event: ambientEventLabel(candidate.eventType),
    quantity: candidate.quantity ?? candidate.items.find((item) => item.quantity !== null)?.quantity ?? null,
    farm: farm ?? "尚未確定",
    house: candidate.houseText ?? candidate.resolution?.candidateHouseNames?.join("、") ?? "尚未確定",
    batch: candidate.flockText ?? "尚未確定",
    state: ambientCandidateStateLabel(candidate.state),
    conflict: Boolean(candidate.conflict),
    conflictText: candidate.conflictText ?? null,
    blocking,
    caretakerClues,
    reconciliation: candidate.reconciliation?.status ?? "not_recorded",
    evidenceCount: candidate.evidence?.length ?? 0,
    sourceTimestamps: candidate.sourceTimestamps ?? [],
  };
}

interface SessionRow {
  id: string;
  organizationId: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface FarmRow {
  id: string;
  organizationId: string;
  name: string;
  siteName: string | null;
  latitude: number | null;
  longitude: number | null;
  active: number;
  environment: "production" | "test";
  structureMode: "whole_farm" | "multi_house";
  note: string | null;
  version: number;
  playerGroupEquityFraction: number;
  createdAt: string;
  updatedAt: string;
}

interface HouseRow {
  id: string;
  farmId: string;
  name: string;
  normalizedName: string;
  capacity: number | null;
  active: number;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface FlockRow {
  id: string;
  farmId: string;
  houseId: string;
  batchCode: string;
  breed: string | null;
  chickInDate: string;
  initialCount: number;
  expectedShipmentDate: string | null;
  actualShipmentDate: string | null;
  status: "active" | "closed" | "cancelled";
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  active: number;
}

function requestId(request: Request): string {
  const provided = request.headers.get("x-request-id");
  return provided && /^[A-Za-z0-9._:-]{1,120}$/u.test(provided) ? provided : `web-${crypto.randomUUID()}`;
}

function originFor(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = originFor(request);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "false");
  }
  headers.set("vary", "Origin");
  headers.set("access-control-allow-headers", "Authorization, Content-Type, X-Request-Id");
  headers.set("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
  return headers;
}

export function isAllowedWebOrigin(origin: string | null): boolean {
  return Boolean(origin && ALLOWED_ORIGINS.has(origin));
}

function response(request: Request, body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-request-id", requestId(request));
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(request: Request, status: number, code: string, message: string): Response {
  return response(request, { error: code, message }, status);
}

async function bodyJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json() as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.normalize("NFKC").trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001F\u007F]/u.test(trimmed)) return null;
  return trimmed;
}

function nullableString(value: unknown, max = 500): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return stringValue(value, max);
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value: unknown): number | null {
  const number = positiveNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function coordinateValue(value: unknown, minimum: number, maximum: number): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : undefined;
}

function dateValue(value: unknown, fallback = taipeiDate()): string | null {
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "string" && isIsoDate(value) ? value : null;
}

function toFarm(row: FarmRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    siteName: row.siteName,
    latitude: row.latitude,
    longitude: row.longitude,
    active: row.active === 1,
    environment: row.environment,
    structureMode: row.structureMode,
    note: row.note,
    version: row.version,
    playerGroupEquityFraction: row.playerGroupEquityFraction,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toHouse(row: HouseRow): Record<string, unknown> {
  return {
    id: row.id,
    farmId: row.farmId,
    name: row.name,
    normalizedName: row.normalizedName,
    capacity: row.capacity,
    active: row.active === 1,
    note: row.note,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFlock(row: FlockRow): Record<string, unknown> {
  return {
    id: row.id,
    farmId: row.farmId,
    houseId: row.houseId,
    batchCode: row.batchCode,
    breed: row.breed,
    chickInDate: row.chickInDate,
    initialCount: row.initialCount,
    expectedShipmentDate: row.expectedShipmentDate,
    actualShipmentDate: row.actualShipmentDate,
    status: row.status,
    note: row.note,
    version: row.version,
    ageDays: row.status === "active" ? flockAgeDays(row.chickInDate) : null,
    shipmentReminder: row.status === "active" ? shipmentReminder(row.expectedShipmentDate) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function activeOrganization(env: WebApiEnv): Promise<OrganizationRow | null> {
  return env.DB.prepare(
    `SELECT id, name, active FROM organizations WHERE active = 1 ORDER BY id LIMIT 1`,
  ).first<OrganizationRow>();
}

async function sessionFor(request: Request, env: WebApiEnv): Promise<SessionRow | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!/^[A-Za-z0-9_-]{32,100}$/u.test(token)) return null;
  const tokenHash = await hashWebSessionToken(token);
  const session = await env.DB.prepare(
    `SELECT s.id, s.organization_id AS organizationId, s.expires_at AS expiresAt,
            s.revoked_at AS revokedAt
       FROM web_admin_sessions s
      WHERE s.token_hash = ?
      LIMIT 1`,
  ).bind(tokenHash).first<SessionRow>();
  if (!session || session.revokedAt || !webSessionIsActive(session.expiresAt)) return null;
  await env.DB.prepare(
    `UPDATE web_admin_sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL`,
  ).bind(session.id).run();
  return session;
}

async function requireSession(request: Request, env: WebApiEnv): Promise<SessionRow | Response> {
  const session = await sessionFor(request, env);
  return session ?? errorResponse(request, 401, "unauthorized", "請先登入管理介面。");
}

async function authLogin(request: Request, env: WebApiEnv): Promise<Response> {
  const body = await bodyJson(request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || password.length > 200) return errorResponse(request, 400, "invalid_credentials", "登入資料無效。");
  const valid = await verifyAdminPassword(password, env.FARM_ADMIN_PASSWORD_HASH);
  if (!valid) return errorResponse(request, 401, "invalid_credentials", "管理密碼錯誤。");
  const org = await activeOrganization(env);
  if (!org) return errorResponse(request, 503, "organization_unavailable", "目前沒有可用的組織。");
  const rawToken = randomWebSessionToken();
  const tokenHash = await hashWebSessionToken(rawToken);
  const id = `web-session-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + WEB_SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO web_admin_sessions (id, organization_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(id, org.id, tokenHash, expiresAt).run();
  await writeAuditLog(env, {
    organizationId: org.id,
    source: "web",
    actorType: "web_admin",
    actorId: id,
    action: "login",
    entityType: "web_session",
    entityId: id,
    requestId: requestId(request),
  });
  return response(request, { authenticated: true, token: rawToken, expiresAt, organization: org });
}

async function authLogout(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  await env.DB.prepare(
    `UPDATE web_admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL`,
  ).bind(session.id).run();
  return response(request, { authenticated: false });
}

async function authSession(request: Request, env: WebApiEnv): Promise<Response> {
  const session = await sessionFor(request, env);
  if (!session) return response(request, { authenticated: false });
  const org = await activeOrganization(env);
  return response(request, {
    authenticated: true,
    expiresAt: session.expiresAt,
    organization: org,
  });
}

async function farmById(env: WebApiEnv, organizationId: string, id: string): Promise<FarmRow | null> {
  return env.DB.prepare(
    `SELECT id, organization_id AS organizationId, name, site_name AS siteName,
            latitude, longitude,
            active, environment, farm_structure_mode AS structureMode, note, version,
            player_group_equity_fraction AS playerGroupEquityFraction,
            created_at AS createdAt, updated_at AS updatedAt
       FROM farms WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(id, organizationId).first<FarmRow>();
}

async function houseById(env: WebApiEnv, organizationId: string, id: string): Promise<(HouseRow & { farmName?: string; farmEnvironment?: string }) | null> {
  return env.DB.prepare(
    `SELECT h.id, h.farm_id AS farmId, h.name, h.normalized_name AS normalizedName,
            h.capacity, h.active, h.note, h.version, h.created_at AS createdAt,
            h.updated_at AS updatedAt, f.name AS farmName, f.environment AS farmEnvironment
       FROM houses h JOIN farms f ON f.id = h.farm_id
      WHERE h.id = ? AND f.organization_id = ? LIMIT 1`,
  ).bind(id, organizationId).first<HouseRow & { farmName?: string; farmEnvironment?: string }>();
}

async function flockById(env: WebApiEnv, organizationId: string, id: string): Promise<FlockRow | null> {
  return env.DB.prepare(
    `SELECT k.id, k.farm_id AS farmId, k.house_id AS houseId, k.batch_code AS batchCode,
            k.breed, k.chick_in_date AS chickInDate, k.initial_count AS initialCount,
            k.expected_shipment_date AS expectedShipmentDate,
            k.actual_shipment_date AS actualShipmentDate, k.status, k.note, k.version,
            k.created_at AS createdAt, k.updated_at AS updatedAt
       FROM flocks k JOIN farms f ON f.id = k.farm_id
      WHERE k.id = ? AND f.organization_id = ? LIMIT 1`,
  ).bind(id, organizationId).first<FlockRow>();
}

async function listFarms(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const environment = url.searchParams.get("environment");
  const active = url.searchParams.get("active");
  const clauses = ["organization_id = ?"];
  const bindings: unknown[] = [session.organizationId];
  if (environment === "production" || environment === "test") {
    clauses.push("environment = ?");
    bindings.push(environment);
  }
  if (active === "true" || active === "false") {
    clauses.push("active = ?");
    bindings.push(active === "true" ? 1 : 0);
  }
  const rows = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId, name, site_name AS siteName,
            latitude, longitude,
            active, environment, farm_structure_mode AS structureMode, note, version,
            player_group_equity_fraction AS playerGroupEquityFraction,
            created_at AS createdAt, updated_at AS updatedAt
       FROM farms WHERE ${clauses.join(" AND ")} ORDER BY environment, name`,
  ).bind(...bindings).all<FarmRow>();
  return response(request, { farms: rows.results.map(toFarm) });
}

async function createFarm(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const body = await bodyJson(request);
  const name = stringValue(body?.name, 100);
  if (!name) return errorResponse(request, 400, "invalid_name", "請提供雞場名稱。");
  const environment = body?.environment === "test" ? "test" : body?.environment === "production" ? "production" : null;
  const structureMode = body?.structureMode === "multi_house" ? "multi_house" : body?.structureMode === "whole_farm" ? "whole_farm" : "whole_farm";
  if (!environment) return errorResponse(request, 400, "invalid_environment", "environment 必須是 production 或 test。");
  const normalized = normalizedFarmKey(name);
  const duplicate = await env.DB.prepare(
    `SELECT id, name, active FROM farms WHERE organization_id = ? AND lower(replace(replace(replace(name, '雞場', ''), '場', ''), '牧場', '')) = lower(?) LIMIT 1`,
  ).bind(session.organizationId, normalized).first<{ id: string; name: string; active: number }>();
  if (duplicate) return errorResponse(request, 409, "duplicate_farm", `已有同名雞場：${duplicate.name}。`);
  const id = `farm-web-${crypto.randomUUID()}`;
  const siteName = nullableString(body?.siteName, 100);
  const note = nullableString(body?.note, 1000);
  const latitude = coordinateValue(body?.latitude, -90, 90);
  const longitude = coordinateValue(body?.longitude, -180, 180);
  if (latitude === undefined || longitude === undefined) return errorResponse(request, 400, "invalid_coordinates", "氣象座標無效。");
  await env.DB.prepare(
    `INSERT INTO farms
      (id, organization_id, name, active, farm_total_equity_fraction,
       player_group_equity_fraction, environment, site_name, farm_structure_mode, note,
       latitude, longitude)
     VALUES (?, ?, ?, 1, 0, 0, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, session.organizationId, name, environment, siteName ?? null, structureMode, note ?? null, latitude, longitude).run();
  const farm = await farmById(env, session.organizationId, id);
  await writeAuditLog(env, {
    organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id,
    action: "create", entityType: "farm", entityId: id, after: farm ? toFarm(farm) : { id, name, environment },
    changedFields: ["name", "environment", "siteName", "structureMode", "note", "latitude", "longitude"], requestId: requestId(request),
  });
  return response(request, { farm: farm ? toFarm(farm) : null }, 201);
}

async function updateFarm(request: Request, env: WebApiEnv, session: SessionRow, id: string): Promise<Response> {
  const farm = await farmById(env, session.organizationId, id);
  if (!farm) return errorResponse(request, 404, "not_found", "找不到雞場。");
  const body = await bodyJson(request);
  const expectedVersion = positiveInteger(body?.version);
  if (!expectedVersion || expectedVersion !== farm.version) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const changes: string[] = [];
  const name = body?.name === undefined ? farm.name : stringValue(body.name, 100);
  const siteName = body?.siteName === undefined ? farm.siteName : nullableString(body.siteName, 100);
  const note = body?.note === undefined ? farm.note : nullableString(body.note, 1000);
  const latitude = body?.latitude === undefined ? farm.latitude : coordinateValue(body.latitude, -90, 90);
  const longitude = body?.longitude === undefined ? farm.longitude : coordinateValue(body.longitude, -180, 180);
  const structureMode = body?.structureMode === undefined ? farm.structureMode : body.structureMode === "multi_house" ? "multi_house" : body.structureMode === "whole_farm" ? "whole_farm" : null;
  if (!name || !structureMode || latitude === undefined || longitude === undefined) return errorResponse(request, 400, "invalid_farm", "雞場資料無效。");
  const active = body?.active === undefined ? farm.active : body.active === true ? 1 : body.active === false ? 0 : null;
  if (active === null) return errorResponse(request, 400, "invalid_active", "active 必須是布林值。");
  if (active === 0 && farm.active === 1) {
    const dependencies = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM flocks WHERE farm_id = ? AND status = 'active'`,
    ).bind(id).first<{ count: number }>();
    if ((dependencies?.count ?? 0) > 0) return errorResponse(request, 409, "active_flock_dependency", "仍有進行中批次，請先完成批次後再封存。");
  }
  if (name !== farm.name) changes.push("name");
  if (siteName !== farm.siteName) changes.push("siteName");
  if (note !== farm.note) changes.push("note");
  if (latitude !== farm.latitude) changes.push("latitude");
  if (longitude !== farm.longitude) changes.push("longitude");
  if (structureMode !== farm.structureMode) changes.push("structureMode");
  if (active !== farm.active) changes.push("active");
  const updated = await env.DB.prepare(
    `UPDATE farms SET name = ?, site_name = ?, farm_structure_mode = ?, note = ?, latitude = ?, longitude = ?, active = ?,
            version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ? AND version = ?`,
  ).bind(name, siteName ?? null, structureMode, note ?? null, latitude, longitude, active, id, session.organizationId, expectedVersion).run();
  if (!updated.meta.changes) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const after = await farmById(env, session.organizationId, id);
  await writeAuditLog(env, {
    organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id,
    action: active === 0 ? "archive" : "update", entityType: "farm", entityId: id,
    before: toFarm(farm), after: after ? toFarm(after) : undefined, changedFields: changes, requestId: requestId(request),
  });
  return response(request, { farm: after ? toFarm(after) : null });
}

async function listCaretakers(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const includeHistory = new URL(request.url).searchParams.get("history") === "1";
  const rows = await env.DB.prepare(
    `SELECT c.id, c.name, c.active, c.note, c.version, c.created_at AS createdAt,
            c.updated_at AS updatedAt,
            COALESCE(json_group_array(CASE WHEN a.farm_id IS NOT NULL THEN json_object('farmId', a.farm_id, 'farmName', f.name, 'effectiveFrom', a.effective_from, 'effectiveTo', a.effective_to, 'isPrimary', a.is_primary) END), '[]') AS assignmentsJson
       FROM caretakers c
       LEFT JOIN farm_caretaker_assignments a ON a.caretaker_id = c.id ${includeHistory ? "" : "AND a.effective_to IS NULL"}
       LEFT JOIN farms f ON f.id = a.farm_id
      WHERE c.organization_id = ?
      GROUP BY c.id ORDER BY c.active DESC, c.name`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  return response(request, {
    history: includeHistory,
    caretakers: rows.results.map((row) => ({
      id: row.id, name: row.name, active: Number(row.active) === 1, note: row.note, version: row.version,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      assignments: safeJson(row.assignmentsJson, []).filter((item: unknown) => item && typeof item === "object" && "farmId" in item),
    })),
  });
}

function safeJson(value: unknown, fallback: unknown): any {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function createCaretaker(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const body = await bodyJson(request);
  const name = stringValue(body?.name, 100);
  if (!name) return errorResponse(request, 400, "invalid_name", "請提供飼養者姓名。");
  const normalized = name.normalize("NFKC").replace(/\s+/gu, "");
  const duplicate = await env.DB.prepare("SELECT id FROM caretakers WHERE organization_id = ? AND normalized_name = ? LIMIT 1").bind(session.organizationId, normalized).first<{ id: string }>();
  if (duplicate) return errorResponse(request, 409, "duplicate_caretaker", "已有同名飼養者。");
  const id = `caretaker-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO caretakers (id, organization_id, name, normalized_name, note) VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, session.organizationId, name, normalized, nullableString(body?.note, 1000) ?? null).run();
  const row = await env.DB.prepare("SELECT id, name, active, note, version, created_at AS createdAt, updated_at AS updatedAt FROM caretakers WHERE id = ?").bind(id).first<Record<string, unknown>>();
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "create", entityType: "caretaker", entityId: id, after: row, requestId: requestId(request) });
  return response(request, { caretaker: row }, 201);
}

async function updateCaretaker(request: Request, env: WebApiEnv, session: SessionRow, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT id, name, active, note, version, created_at AS createdAt, updated_at AS updatedAt FROM caretakers WHERE id = ? AND organization_id = ? LIMIT 1").bind(id, session.organizationId).first<Record<string, unknown> & { version: number; active: number }>();
  if (!row) return errorResponse(request, 404, "not_found", "找不到飼養者。");
  const body = await bodyJson(request);
  const version = positiveInteger(body?.version);
  if (!version || version !== row.version) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const name = body?.name === undefined ? String(row.name) : stringValue(body.name, 100);
  const note = body?.note === undefined ? (row.note as string | null) : nullableString(body.note, 1000);
  const active = body?.active === undefined ? row.active : body.active === true ? 1 : body.active === false ? 0 : null;
  if (!name || active === null) return errorResponse(request, 400, "invalid_caretaker", "飼養者資料無效。");
  if (active === 0 && row.active === 1) {
  }
  const result = await env.DB.prepare(
    `UPDATE caretakers SET name = ?, normalized_name = ?, note = ?, active = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ? AND version = ?`,
  ).bind(name, name.normalize("NFKC").replace(/\s+/gu, ""), note ?? null, active, id, session.organizationId, version).run();
  if (!result.meta.changes) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const after = await env.DB.prepare("SELECT id, name, active, note, version, created_at AS createdAt, updated_at AS updatedAt FROM caretakers WHERE id = ?").bind(id).first<Record<string, unknown>>();
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: active === 0 ? "archive" : "update", entityType: "caretaker", entityId: id, before: row, after, changedFields: ["name", "note", "active"], requestId: requestId(request) });
  return response(request, { caretaker: after });
}

async function assignCaretaker(request: Request, env: WebApiEnv, session: SessionRow, farmId: string): Promise<Response> {
  const farm = await farmById(env, session.organizationId, farmId);
  if (!farm) return errorResponse(request, 404, "not_found", "找不到雞場。");
  const body = await bodyJson(request);
  const caretakerId = stringValue(body?.caretakerId, 100);
  const effectiveFrom = dateValue(body?.effectiveFrom);
  if (!caretakerId || !effectiveFrom) return errorResponse(request, 400, "invalid_assignment", "飼養者與生效日期必填。");
  const caretaker = await env.DB.prepare("SELECT id, name, active FROM caretakers WHERE id = ? AND organization_id = ? LIMIT 1").bind(caretakerId, session.organizationId).first<{ id: string; name: string; active: number }>();
  if (!caretaker || caretaker.active !== 1) return errorResponse(request, 400, "invalid_caretaker", "飼養者不存在或已封存。");
  const isPrimary = body?.isPrimary === true;
  if (isPrimary) {
    await env.DB.prepare("UPDATE farm_caretaker_assignments SET effective_to = ? WHERE farm_id = ? AND effective_to IS NULL AND is_primary = 1").bind(effectiveFrom, farmId).run();
  }
  const id = `assignment-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO farm_caretaker_assignments (id, farm_id, caretaker_id, effective_from, is_primary) VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, farmId, caretakerId, effectiveFrom, isPrimary ? 1 : 0).run();
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "assign", entityType: "farm_caretaker_assignment", entityId: id, after: { id, farmId, caretakerId, effectiveFrom, isPrimary }, requestId: requestId(request) });
  return response(request, { assignment: { id, farmId, caretakerId, caretakerName: caretaker.name, effectiveFrom, isPrimary } }, 201);
}

async function listHouses(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const farmId = url.searchParams.get("farmId");
  const clauses = ["f.organization_id = ?"];
  const bindings: unknown[] = [session.organizationId];
  if (farmId) { clauses.push("h.farm_id = ?"); bindings.push(farmId); }
  const rows = await env.DB.prepare(
    `SELECT h.id, h.farm_id AS farmId, h.name, h.normalized_name AS normalizedName,
            h.capacity, h.active, h.note, h.version, h.created_at AS createdAt, h.updated_at AS updatedAt,
            f.name AS farmName, f.environment AS farmEnvironment
       FROM houses h JOIN farms f ON f.id = h.farm_id
      WHERE ${clauses.join(" AND ")} ORDER BY f.environment, f.name, h.normalized_name`,
  ).bind(...bindings).all<Record<string, unknown>>();
  return response(request, { houses: rows.results.map((row) => ({ ...row, active: Number(row.active) === 1 })) });
}

async function createHouse(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const body = await bodyJson(request);
  const farmId = stringValue(body?.farmId, 100);
  const farm = farmId ? await farmById(env, session.organizationId, farmId) : null;
  const rawName = stringValue(body?.name, 60);
  if (!farm || farm.active !== 1 || !rawName) return errorResponse(request, 400, "invalid_house", "雞場與雞舍名稱必填。");
  const name = normalizedHouseName(rawName);
  const capacity = body?.capacity === null || body?.capacity === undefined ? null : positiveInteger(body.capacity);
  if (body?.capacity !== null && body?.capacity !== undefined && capacity === null) return errorResponse(request, 400, "invalid_capacity", "容量必須是正整數。");
  const duplicate = await env.DB.prepare("SELECT id FROM houses WHERE farm_id = ? AND normalized_name = ? LIMIT 1").bind(farm.id, name).first<{ id: string }>();
  if (duplicate) return errorResponse(request, 409, "duplicate_house", "此雞場已有相同舍別。");
  const id = `house-web-${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO houses (id, farm_id, name, normalized_name, capacity, note) VALUES (?, ?, ?, ?, ?, ?)").bind(id, farm.id, name, name, capacity, nullableString(body?.note, 1000) ?? null).run();
  const house = await houseById(env, session.organizationId, id);
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "create", entityType: "house", entityId: id, after: house ? toHouse(house) : { id, farmId, name }, requestId: requestId(request) });
  return response(request, { house: house ? toHouse(house) : null }, 201);
}

async function updateHouse(request: Request, env: WebApiEnv, session: SessionRow, id: string): Promise<Response> {
  const house = await houseById(env, session.organizationId, id);
  if (!house) return errorResponse(request, 404, "not_found", "找不到雞舍。");
  const body = await bodyJson(request);
  const version = positiveInteger(body?.version);
  if (!version || version !== house.version) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const active = body?.active === undefined ? house.active : body.active === true ? 1 : body.active === false ? 0 : null;
  const name = body?.name === undefined ? house.name : stringValue(body.name, 60);
  const capacity = body?.capacity === undefined ? house.capacity : body.capacity === null ? null : positiveInteger(body.capacity);
  const note = body?.note === undefined ? house.note : nullableString(body.note, 1000);
  if (active === null || !name || (body?.capacity !== undefined && body.capacity !== null && capacity === null)) return errorResponse(request, 400, "invalid_house", "雞舍資料無效。");
  if (active === 0 && house.active === 1) {
    const activeFlocks = await env.DB.prepare("SELECT COUNT(*) AS count FROM flocks WHERE house_id = ? AND status = 'active'").bind(id).first<{ count: number }>();
    if ((activeFlocks?.count ?? 0) > 0) return errorResponse(request, 409, "active_flock_dependency", "仍有進行中批次，請先完成批次後再封存雞舍。");
  }
  const result = await env.DB.prepare(
    `UPDATE houses SET name = ?, normalized_name = ?, capacity = ?, note = ?, active = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?`,
  ).bind(name, normalizedHouseName(name), capacity, note ?? null, active, id, version).run();
  if (!result.meta.changes) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const after = await houseById(env, session.organizationId, id);
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: active === 0 ? "archive" : "update", entityType: "house", entityId: id, before: toHouse(house), after: after ? toHouse(after) : undefined, requestId: requestId(request) });
  return response(request, { house: after ? toHouse(after) : null });
}

async function listFlocks(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const farmId = url.searchParams.get("farmId");
  const houseId = url.searchParams.get("houseId");
  const clauses = ["f.organization_id = ?"];
  const bindings: unknown[] = [session.organizationId];
  if (farmId) { clauses.push("k.farm_id = ?"); bindings.push(farmId); }
  if (houseId) { clauses.push("k.house_id = ?"); bindings.push(houseId); }
  const rows = await env.DB.prepare(
    `SELECT k.id, k.farm_id AS farmId, k.house_id AS houseId, k.batch_code AS batchCode,
            k.breed, k.chick_in_date AS chickInDate, k.initial_count AS initialCount,
            k.expected_shipment_date AS expectedShipmentDate, k.actual_shipment_date AS actualShipmentDate,
            k.status, k.note, k.version, k.created_at AS createdAt, k.updated_at AS updatedAt,
            f.name AS farmName, h.name AS houseName
       FROM flocks k JOIN farms f ON f.id = k.farm_id JOIN houses h ON h.id = k.house_id
      WHERE ${clauses.join(" AND ")} ORDER BY k.status, k.chick_in_date DESC, k.batch_code`,
  ).bind(...bindings).all<Record<string, unknown>>();
  return response(request, { flocks: rows.results.map((row) => ({ ...row, ...toFlock(row as unknown as FlockRow) })) });
}

async function createFlock(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const body = await bodyJson(request);
  const farmId = stringValue(body?.farmId, 100);
  const houseId = stringValue(body?.houseId, 100);
  const farm = farmId ? await farmById(env, session.organizationId, farmId) : null;
  const house = houseId ? await houseById(env, session.organizationId, houseId) : null;
  const batchCode = stringValue(body?.batchCode, 100);
  const chickInDate = dateValue(body?.chickInDate, "");
  const initialCount = positiveInteger(body?.initialCount);
  const expectedShipmentDate = body?.expectedShipmentDate === null || body?.expectedShipmentDate === undefined ? null : dateValue(body.expectedShipmentDate, "");
  if (!farm || farm.active !== 1 || !house || house.farmId !== farm.id || house.active !== 1 || !batchCode || !chickInDate || !initialCount || (body?.expectedShipmentDate !== null && body?.expectedShipmentDate !== undefined && !expectedShipmentDate)) return errorResponse(request, 400, "invalid_flock", "批次資料無效。");
  if (expectedShipmentDate && expectedShipmentDate < chickInDate) return errorResponse(request, 400, "invalid_dates", "預計出雞日期不可早於入雛日期。");
  const duplicate = await env.DB.prepare("SELECT id FROM flocks WHERE farm_id = ? AND batch_code = ? LIMIT 1").bind(farm.id, batchCode).first<{ id: string }>();
  if (duplicate) return errorResponse(request, 409, "duplicate_flock", "此雞場已有相同批次代碼。");
  const id = `flock-web-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO flocks (id, farm_id, house_id, batch_code, breed, chick_in_date, initial_count, expected_shipment_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, farm.id, house.id, batchCode, nullableString(body?.breed, 100) ?? null, chickInDate, initialCount, expectedShipmentDate, nullableString(body?.note, 1000) ?? null).run();
  const flock = await flockById(env, session.organizationId, id);
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "create", entityType: "flock", entityId: id, after: flock ? toFlock(flock) : { id, farmId, houseId, batchCode }, requestId: requestId(request) });
  return response(request, { flock: flock ? toFlock(flock) : null }, 201);
}

async function updateFlock(request: Request, env: WebApiEnv, session: SessionRow, id: string): Promise<Response> {
  const flock = await flockById(env, session.organizationId, id);
  if (!flock) return errorResponse(request, 404, "not_found", "找不到批次。");
  const body = await bodyJson(request);
  const version = positiveInteger(body?.version);
  if (!version || version !== flock.version) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const status = body?.status === undefined ? flock.status : body.status === "active" || body.status === "closed" || body.status === "cancelled" ? body.status : null;
  const breed = body?.breed === undefined ? flock.breed : nullableString(body.breed, 100);
  const expectedShipmentDate = body?.expectedShipmentDate === undefined ? flock.expectedShipmentDate : body.expectedShipmentDate === null ? null : dateValue(body.expectedShipmentDate, "");
  const actualShipmentDate = body?.actualShipmentDate === undefined ? flock.actualShipmentDate : body.actualShipmentDate === null ? null : dateValue(body.actualShipmentDate, "");
  const note = body?.note === undefined ? flock.note : nullableString(body.note, 1000);
  if (!status || (body?.expectedShipmentDate !== undefined && body.expectedShipmentDate !== null && !expectedShipmentDate) || (body?.actualShipmentDate !== undefined && body.actualShipmentDate !== null && !actualShipmentDate)) return errorResponse(request, 400, "invalid_flock", "批次資料無效。");
  const result = await env.DB.prepare(
    `UPDATE flocks SET breed = ?, expected_shipment_date = ?, actual_shipment_date = ?, status = ?, note = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?`,
  ).bind(breed ?? null, expectedShipmentDate, actualShipmentDate, status, note ?? null, id, version).run();
  if (!result.meta.changes) return errorResponse(request, 409, "stale_write", "資料已更新，請重新載入後再試。");
  const after = await flockById(env, session.organizationId, id);
  await writeAuditLog(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "update", entityType: "flock", entityId: id, before: toFlock(flock), after: after ? toFlock(after) : undefined, requestId: requestId(request) });
  return response(request, { flock: after ? toFlock(after) : null });
}

async function ensureWebGroup(env: WebApiEnv, organizationId: string): Promise<string> {
  const groupId = `web-admin-${organizationId}`;
  await env.DB.prepare(
    `INSERT INTO line_groups (group_id, status, organization_id) VALUES (?, 'unbound', ?)
     ON CONFLICT(group_id) DO UPDATE SET organization_id = COALESCE(line_groups.organization_id, excluded.organization_id)`,
  ).bind(groupId, organizationId).run();
  return groupId;
}

async function validateEventScope(env: WebApiEnv, organizationId: string, farmId: string, houseId: string | null, flockId: string | null): Promise<{ farm: FarmRow; house: HouseRow | null; flock: FlockRow | null } | null> {
  const farm = await farmById(env, organizationId, farmId);
  if (!farm || farm.active !== 1) return null;
  const house = houseId ? await houseById(env, organizationId, houseId) : null;
  if (houseId && (!house || house.farmId !== farm.id || house.active !== 1)) return null;
  const flock = flockId ? await flockById(env, organizationId, flockId) : null;
  if (flockId && (!flock || flock.farmId !== farm.id || (house && flock.houseId !== house.id))) return null;
  if (farm.structureMode === "multi_house" && !house) return null;
  return { farm, house, flock };
}

interface RetainedManualRecordInput {
  organizationId: string;
  actorId: string;
  sourceEventId: string;
  requestId: string;
  farmId: string;
  houseId: string | null;
  flockId: string | null;
  intent: string;
  quantity: number | null;
  unit: string | null;
  eventDate: string;
  note: string | null;
  lineGroupId: string | null;
}

interface RetainedManualRecordResult {
  id: string;
  kind: "operational_event" | "abnormal_event";
  created: boolean;
  farmName: string;
}

async function createValidatedRetainedRecord(env: WebApiEnv, input: RetainedManualRecordInput): Promise<RetainedManualRecordResult> {
  const scope = await validateEventScope(env, input.organizationId, input.farmId, input.houseId, input.flockId);
  if (!scope) throw new Error("invalid_scope");
  if (input.intent === "abnormal") {
    const rawText = input.note?.trim() ?? "";
    if (!rawText) throw new Error("abnormal_note_required");
    const occurredAt = new Date(`${input.eventDate}T00:00:00+08:00`).toISOString();
    const timing = parseAbnormalTiming(rawText, occurredAt);
    const result = await insertAbnormalEvent(env, {
      organizationId: input.organizationId,
      farmId: scope.farm.id,
      farmName: scope.farm.name,
      farmEnvironment: scope.farm.environment,
      structureMode: scope.farm.structureMode,
      houseId: scope.house?.id ?? null,
      houseName: scope.house?.name ?? null,
      flockId: scope.flock?.id ?? null,
      ...timing,
      occurredAt,
      occurredDate: input.eventDate,
      weatherDate: input.eventDate,
      approximatePeriod: null,
      rawText,
      source: "web",
      actorId: input.actorId,
      sourceEventId: input.sourceEventId,
    });
    return { id: result.id, kind: "abnormal_event", created: result.created, farmName: scope.farm.name };
  }
  if (!OPERATIONAL_INTENTS.has(input.intent) || input.quantity === null || !input.unit) throw new Error("invalid_event");
  if ((input.intent === "mortality" || input.intent === "cull" || input.intent === "shipment") && (!Number.isInteger(input.quantity) || !["隻", "bird"].includes(input.unit))) throw new Error("invalid_event");
  if (input.intent === "feed" && input.unit !== "kg") throw new Error("invalid_unit");
  if (input.intent === "water" && input.unit !== "L") throw new Error("invalid_unit");
  let flockId = scope.flock?.id ?? input.flockId;
  if (!flockId && scope.house) {
    const active = await env.DB.prepare("SELECT id FROM flocks WHERE house_id = ? AND status = 'active' ORDER BY id").bind(scope.house.id).all<{ id: string }>();
    if (active.results.length === 1) flockId = active.results[0].id;
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM operational_events WHERE source_event_id = ? AND organization_id = ? LIMIT 1",
  ).bind(input.sourceEventId, input.organizationId).first<{ id: string }>();
  if (existing) return { id: existing.id, kind: "operational_event", created: false, farmName: scope.farm.name };
  const id = `operational-retained-${crypto.randomUUID()}`;
  const groupId = input.lineGroupId ?? await ensureWebGroup(env, input.organizationId);
  const rawMessage = "管理者補登：原始訊息已過保存期限";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO operational_events
        (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
         event_date, house, house_id, flock_id, raw_message, raw_farm_text, note, source_event_id)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, input.organizationId, scope.farm.id, groupId, input.intent, input.quantity, input.unit, input.eventDate, scope.house?.name ?? null, scope.house?.id ?? null, flockId, rawMessage, scope.farm.name, input.note, input.sourceEventId),
    auditLogStatement(env, {
      organizationId: input.organizationId,
      source: "web",
      actorType: "web_admin",
      actorId: input.actorId,
      action: "create",
      entityType: "operational_event",
      entityId: id,
      after: { id, farmId: scope.farm.id, houseId: scope.house?.id ?? null, flockId, intent: input.intent, quantity: input.quantity, unit: input.unit, eventDate: input.eventDate, sourceEventId: input.sourceEventId },
      reason: "retained_message_manual_record",
      requestId: input.requestId,
    }),
  ]);
  return { id, kind: "operational_event", created: true, farmName: scope.farm.name };
}

async function listOperationalEvents(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? safeJson(decodeCursor(cursorRaw), null) as { createdAt?: string; id?: string } | null : null;
  const clauses = ["e.organization_id = ?"];
  const bindings: unknown[] = [session.organizationId];
  const farmId = url.searchParams.get("farmId");
  const houseId = url.searchParams.get("houseId");
  const intent = url.searchParams.get("intent");
  if (farmId) { clauses.push("e.farm_id = ?"); bindings.push(farmId); }
  if (houseId) { clauses.push("e.house_id = ?"); bindings.push(houseId); }
  if (intent && OPERATIONAL_INTENTS.has(intent)) { clauses.push("e.intent = ?"); bindings.push(intent); }
  if (cursor?.createdAt && cursor.id) { clauses.push("(e.created_at < ? OR (e.created_at = ? AND e.id < ?))"); bindings.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  const rows = await env.DB.prepare(
    `SELECT e.id, e.organization_id AS organizationId, e.farm_id AS farmId, f.name AS farmName,
            f.environment, e.house_id AS houseId, e.house, e.flock_id AS flockId,
            e.intent, e.quantity, e.unit, e.event_date AS eventDate, e.note,
            e.reversed_at AS reversedAt, e.reversal_reason AS reversalReason,
            e.reversal_of_event_id AS reversalOfEventId, e.correction_of_event_id AS correctionOfEventId,
            e.source_event_id AS sourceEventId, e.created_at AS createdAt
       FROM operational_events e JOIN farms f ON f.id = e.farm_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
  ).bind(...bindings, limit + 1).all<Record<string, unknown>>();
  const values = rows.results.slice(0, limit);
  const last = values[values.length - 1];
  const nextCursor = rows.results.length > limit && last ? encodeCursor(JSON.stringify({ createdAt: last.createdAt, id: last.id })) : null;
  return response(request, { events: values, nextCursor });
}

function encodeCursor(value: string): string {
  return btoa(value).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeCursor(value: string): string {
  return atob(value.replace(/-/gu, "+").replace(/_/gu, "/"));
}

async function createOperationalEvent(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const body = await bodyJson(request);
  const farmId = stringValue(body?.farmId, 100);
  const houseId = body?.houseId === null || body?.houseId === undefined ? null : stringValue(body.houseId, 100);
  const requestedFlockId = body?.flockId === null || body?.flockId === undefined ? null : stringValue(body.flockId, 100);
  const intent = typeof body?.intent === "string" && OPERATIONAL_INTENTS.has(body.intent) ? body.intent : null;
  const quantity = positiveNumber(body?.quantity);
  const unit = typeof body?.unit === "string" && UNITS.has(body.unit) ? body.unit : null;
  const eventDate = dateValue(body?.eventDate);
  if (!farmId || !intent || quantity === null || !unit || !eventDate) return errorResponse(request, 400, "invalid_event", "營運事件資料無效。");
  if ((intent === "mortality" || intent === "cull" || intent === "shipment") && (!Number.isInteger(quantity) || unit !== "隻" && unit !== "bird")) return errorResponse(request, 400, "invalid_event", "此事件必須使用整數隻數。");
  if (intent === "feed" && unit !== "kg") return errorResponse(request, 400, "invalid_unit", "飼料事件必須使用 kg。");
  if (intent === "water" && unit !== "L") return errorResponse(request, 400, "invalid_unit", "飲水事件必須使用 L。");
  const scope = await validateEventScope(env, session.organizationId, farmId, houseId, requestedFlockId);
  if (!scope) return errorResponse(request, 400, "invalid_scope", "雞場、雞舍或批次不在同一有效範圍，沒有寫入。");
  let flockId = requestedFlockId;
  if (!flockId && scope.house) {
    const active = await env.DB.prepare("SELECT id FROM flocks WHERE house_id = ? AND status = 'active' ORDER BY id").bind(scope.house.id).all<{ id: string }>();
    if (active.results.length === 1) flockId = active.results[0].id;
  }
  const id = `operational-web-${crypto.randomUUID()}`;
  const sourceEventId = `web-${crypto.randomUUID()}`;
  const groupId = await ensureWebGroup(env, session.organizationId);
  const note = nullableString(body?.note, 1000);
  const insert = env.DB.prepare(
    `INSERT INTO operational_events
      (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
       event_date, house, house_id, flock_id, raw_message, raw_farm_text, note, source_event_id)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, session.organizationId, farmId, groupId, intent, quantity, unit, eventDate, scope.house?.name ?? null, scope.house?.id ?? null, flockId, `web:${intent}`, scope.farm.name, note, sourceEventId);
  await env.DB.batch([
    insert,
    auditLogStatement(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "create", entityType: "operational_event", entityId: id, after: { id, farmId, houseId: scope.house?.id ?? null, flockId, intent, quantity, unit, eventDate, note }, requestId: requestId(request) }),
  ]);
  return response(request, { event: { id, farmId, farmName: scope.farm.name, houseId: scope.house?.id ?? null, house: scope.house?.name ?? null, flockId, intent, quantity, unit, eventDate, note } }, 201);
}

async function reverseOperationalEvent(request: Request, env: WebApiEnv, session: SessionRow, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT e.*, f.name AS farmName FROM operational_events e JOIN farms f ON f.id = e.farm_id
      WHERE e.id = ? AND e.organization_id = ? LIMIT 1`,
  ).bind(id, session.organizationId).first<Record<string, unknown> & { reversed_at?: string | null; farmName?: string }>();
  if (!row) return errorResponse(request, 404, "not_found", "找不到營運事件。");
  if (row.reversed_at) return response(request, { reversed: false, alreadyReversed: true, eventId: id });
  const body = await bodyJson(request);
  const reason = stringValue(body?.reason, 500) ?? null;
  await env.DB.batch([
    env.DB.prepare("UPDATE operational_events SET reversed_at = CURRENT_TIMESTAMP, reversal_reason = ? WHERE id = ? AND organization_id = ? AND reversed_at IS NULL").bind(reason, id, session.organizationId),
    auditLogStatement(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "reverse", entityType: "operational_event", entityId: id, before: row, after: { reversedAt: new Date().toISOString(), reason }, reason, requestId: requestId(request) }),
  ]);
  return response(request, { reversed: true, eventId: id });
}

async function correctOperationalEvent(request: Request, env: WebApiEnv, session: SessionRow, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM operational_events WHERE id = ? AND organization_id = ? LIMIT 1").bind(id, session.organizationId).first<Record<string, unknown> & { reversed_at?: string | null; farm_id: string; house_id: string | null; flock_id: string | null; intent: string; unit: string; event_date: string; quantity: number; house: string | null; raw_farm_text: string | null }>();
  if (!row) return errorResponse(request, 404, "not_found", "找不到營運事件。");
  if (row.reversed_at) return errorResponse(request, 409, "already_reversed", "原事件已被反轉，不能重複修正。");
  const body = await bodyJson(request);
  const quantity = positiveNumber(body?.quantity);
  if (quantity === null || ((row.intent === "mortality" || row.intent === "cull" || row.intent === "shipment") && !Number.isInteger(quantity))) return errorResponse(request, 400, "invalid_quantity", "修正數量無效。");
  const reason = stringValue(body?.reason, 500) ?? null;
  const newId = `operational-web-${crypto.randomUUID()}`;
  const sourceEventId = `web-correction-${crypto.randomUUID()}`;
  const groupId = await ensureWebGroup(env, session.organizationId);
  await env.DB.batch([
    env.DB.prepare("UPDATE operational_events SET reversed_at = CURRENT_TIMESTAMP, reversal_reason = ? WHERE id = ? AND organization_id = ? AND reversed_at IS NULL").bind(reason, id, session.organizationId),
    env.DB.prepare(
      `INSERT INTO operational_events
        (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date,
         house, house_id, flock_id, raw_message, raw_farm_text, note, source_event_id, correction_of_event_id)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId, session.organizationId, row.farm_id, groupId, row.intent, quantity, row.unit, row.event_date, row.house, row.house_id, row.flock_id, "web:correction", row.raw_farm_text, nullableString(body?.note, 1000) ?? null, sourceEventId, id),
    auditLogStatement(env, { organizationId: session.organizationId, source: "web", actorType: "web_admin", actorId: session.id, action: "correct", entityType: "operational_event", entityId: newId, before: { id, quantity: row.quantity }, after: { id: newId, quantity, correctionOfEventId: id }, reason, requestId: requestId(request) }),
  ]);
  return response(request, { corrected: true, originalEventId: id, eventId: newId }, 201);
}

async function financeSummary(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const totals = await env.DB.prepare(
    `SELECT COALESCE(SUM(d.allocated_profit_loss), 0) AS allocated,
            COALESCE(SUM(d.expense), 0) AS expense,
            COALESCE(SUM(d.net_income), 0) AS net,
            COALESCE(SUM(d.gross_profit_loss), 0) AS gross
       FROM profit_distributions d JOIN farms f ON f.id = d.farm_id
      WHERE d.organization_id = ? AND f.environment = 'production'`,
  ).bind(session.organizationId).first<Record<string, number>>();
  const investors = await env.DB.prepare(
    `SELECT i.id, i.name, COALESCE(SUM(CASE WHEN f.environment = 'production' THEN a.amount ELSE 0 END), 0) AS amount
       FROM investors i LEFT JOIN profit_distribution_allocations a ON a.investor_id = i.id
       LEFT JOIN profit_distributions d ON d.id = a.distribution_id
       LEFT JOIN farms f ON f.id = d.farm_id
      WHERE i.organization_id = ? GROUP BY i.id, i.name ORDER BY i.id`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  const farms = await env.DB.prepare(
    `SELECT f.id, f.name, f.player_group_equity_fraction AS playerGroupEquityFraction,
            COALESCE(SUM(CASE WHEN d.id IS NOT NULL THEN d.net_income ELSE 0 END), 0) AS net
       FROM farms f LEFT JOIN profit_distributions d ON d.farm_id = f.id
      WHERE f.organization_id = ? AND f.environment = 'production'
      GROUP BY f.id, f.name, f.player_group_equity_fraction ORDER BY f.name`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  const distributions = await env.DB.prepare(
    `SELECT d.id, d.farm_id AS farmId, f.name AS farmName, d.distribution_date AS distributionDate,
            d.source_date_roc AS sourceDateRoc, d.gross_profit_loss AS grossProfitLoss,
            d.allocated_profit_loss AS allocatedProfitLoss, d.expense, d.net_income AS netIncome,
            d.note, d.source_dataset AS sourceDataset, d.source_row_key AS sourceRowKey
       FROM profit_distributions d JOIN farms f ON f.id = d.farm_id
      WHERE d.organization_id = ? AND f.environment = 'production'
      ORDER BY d.distribution_date DESC, d.id DESC LIMIT ?`,
  ).bind(session.organizationId, MAX_PAGE_SIZE).all<Record<string, unknown>>();
  const allocations = await env.DB.prepare(
    `SELECT a.id, a.distribution_id AS distributionId, a.investor_id AS investorId,
            i.name AS investorName, a.amount
       FROM profit_distribution_allocations a JOIN investors i ON i.id = a.investor_id
       JOIN profit_distributions d ON d.id = a.distribution_id JOIN farms f ON f.id = d.farm_id
      WHERE i.organization_id = ? AND f.environment = 'production'
      ORDER BY d.distribution_date DESC, i.name LIMIT ?`,
  ).bind(session.organizationId, MAX_PAGE_SIZE).all<Record<string, unknown>>();
  const farmInvestorEquity = await env.DB.prepare(
    `SELECT e.id, e.farm_id AS farmId, f.name AS farmName, i.id AS investorId,
            i.name AS investorName, e.equity_fraction AS equityFraction,
            e.source, e.effective_date AS effectiveDate
       FROM farm_investor_equity e JOIN farms f ON f.id = e.farm_id
       JOIN investors i ON i.id = e.investor_id
      WHERE f.organization_id = ? AND f.environment = 'production'
      ORDER BY f.name, i.name LIMIT ?`,
  ).bind(session.organizationId, MAX_PAGE_SIZE).all<Record<string, unknown>>();
  return response(request, { totals: totals ?? { allocated: 0, expense: 0, net: 0, gross: 0 }, investors: investors.results, farms: farms.results, distributions: distributions.results, allocations: allocations.results, farmInvestorEquity: farmInvestorEquity.results });
}

async function dashboard(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const org = session.organizationId;
  const [farms, productionFarms, testFarms, caretakers, activeFlocks, stockRows, todayRows, shipments, finance] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM farms WHERE organization_id = ? AND active = 1").bind(org).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM farms WHERE organization_id = ? AND active = 1 AND environment = 'production'").bind(org).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM farms WHERE organization_id = ? AND active = 1 AND environment = 'test'").bind(org).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM caretakers WHERE organization_id = ? AND active = 1").bind(org).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM flocks k JOIN farms f ON f.id = k.farm_id WHERE f.organization_id = ? AND k.status = 'active'").bind(org).first<{ count: number }>(),
    env.DB.prepare("SELECT k.initial_count AS initialCount, k.farm_id AS farmId, COALESCE(SUM(CASE WHEN e.intent IN ('mortality', 'cull', 'shipment') AND e.reversed_at IS NULL THEN e.quantity ELSE 0 END), 0) AS removed FROM flocks k JOIN farms f ON f.id = k.farm_id LEFT JOIN operational_events e ON e.flock_id = k.id WHERE f.organization_id = ? AND k.status = 'active' GROUP BY k.id").bind(org).all<{ initialCount: number; farmId: string; removed: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN intent = 'mortality' THEN quantity ELSE 0 END), 0) AS mortality, COALESCE(SUM(CASE WHEN intent = 'cull' THEN quantity ELSE 0 END), 0) AS cull, COALESCE(SUM(CASE WHEN intent = 'feed' THEN quantity ELSE 0 END), 0) AS feed, COALESCE(SUM(CASE WHEN intent = 'water' THEN quantity ELSE 0 END), 0) AS water FROM operational_events WHERE organization_id = ? AND event_date = ? AND reversed_at IS NULL").bind(org, taipeiDate()).first<Record<string, number>>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM flocks k JOIN farms f ON f.id = k.farm_id WHERE f.organization_id = ? AND k.status = 'active' AND k.expected_shipment_date IS NOT NULL AND k.expected_shipment_date <= date('now', '+7 day')").bind(org).first<{ count: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(d.net_income), 0) AS net FROM profit_distributions d JOIN farms f ON f.id = d.farm_id WHERE d.organization_id = ? AND f.environment = 'production'").bind(org).first<{ net: number }>(),
  ]);
  const warnings: string[] = [];
  if ((testFarms?.count ?? 0) > 0) warnings.push("目前含有測試雞場；財務統計已排除測試資料。");
  if ((activeFlocks?.count ?? 0) === 0) warnings.push("尚未建立進行中的批次。");
  return response(request, {
    asOf: taipeiDate(),
    counts: { farms: farms?.count ?? 0, productionFarms: productionFarms?.count ?? 0, testFarms: testFarms?.count ?? 0, caretakers: caretakers?.count ?? 0, activeFlocks: activeFlocks?.count ?? 0 },
    stock: stockRows.results.reduce((sum, row) => sum + Math.max(0, Number(row.initialCount || 0) - Number(row.removed || 0)), 0),
    today: todayRows ?? { mortality: 0, cull: 0, feed: 0, water: 0 },
    upcomingShipments: shipments?.count ?? 0,
    finance: finance ?? { net: 0 },
    dataHealth: { warnings },
  });
}

type ChartGranularity = "daily" | "weekly" | "monthly";

const CHART_METRICS = new Set([
  "mortality", "mortality-cumulative", "mortality-rate", "stock", "cull", "cull-cumulative",
  "feed", "feed-cumulative", "water", "water-cumulative", "shipment", "farm-profit", "portfolio-net", "finance",
  "weather-max", "weather-min",
]);

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function chartBucketExpression(column: string, granularity: ChartGranularity): string {
  if (granularity === "monthly") return `substr(${column}, 1, 7) || '-01'`;
  if (granularity === "weekly") return `date(${column}, printf('-%d days', (CAST(strftime('%w', ${column}) AS INTEGER) + 6) % 7))`;
  return column;
}

function chartBuckets(from: string, to: string, granularity: ChartGranularity): string[] {
  const values: string[] = [];
  let cursor = from;
  if (granularity === "monthly") {
    cursor = `${from.slice(0, 7)}-01`;
  } else if (granularity === "weekly") {
    const date = new Date(`${from}T00:00:00Z`);
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - mondayOffset);
    cursor = date.toISOString().slice(0, 10);
  }
  while (cursor <= to && values.length < 2000) {
    values.push(cursor);
    if (granularity === "monthly") {
      const date = new Date(`${cursor}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + 1, 1);
      cursor = date.toISOString().slice(0, 10);
    } else {
      cursor = shiftDate(cursor, granularity === "weekly" ? 7 : 1);
    }
  }
  return values;
}

function chartGranularity(value: string | null): ChartGranularity {
  return value === "weekly" || value === "monthly" ? value : "daily";
}

function addOperationalChartFilters(
  url: URL,
  clauses: string[],
  bindings: unknown[],
  eventAlias: string,
  farmAlias: string,
  dateColumn: string,
): void {
  const farmId = url.searchParams.get("farmId");
  const houseId = url.searchParams.get("houseId");
  const flockId = url.searchParams.get("flockId");
  const environment = url.searchParams.get("environment");
  const caretakerId = url.searchParams.get("caretakerId");
  if (farmId) { clauses.push(`${eventAlias}.farm_id = ?`); bindings.push(farmId); }
  if (houseId) { clauses.push(`${eventAlias}.house_id = ?`); bindings.push(houseId); }
  if (flockId) { clauses.push(`${eventAlias}.flock_id = ?`); bindings.push(flockId); }
  if (environment === "production" || environment === "test") { clauses.push(`${farmAlias}.environment = ?`); bindings.push(environment); }
  if (caretakerId) {
    clauses.push(`EXISTS (SELECT 1 FROM farm_caretaker_assignments ca WHERE ca.farm_id = ${farmAlias}.id AND ca.caretaker_id = ? AND ca.effective_from <= ${dateColumn} AND (ca.effective_to IS NULL OR ca.effective_to >= ${dateColumn}))`);
    bindings.push(caretakerId);
  }
}

function chartResult(
  request: Request,
  metric: string,
  from: string,
  to: string,
  granularity: ChartGranularity,
  series: Array<{ date: string; value: number }>,
  unit: string,
  definition: string,
  extra: Record<string, unknown> = {},
): Response {
  return response(request, {
    metric,
    from,
    to,
    granularity,
    unit,
    definition,
    source: "共用資料庫彙總",
    status: "ok",
    series: series.map((point) => ({ date: point.date, value: Number(point.value) })),
    ...extra,
  });
}

async function charts(request: Request, env: WebApiEnv, session: SessionRow, metric: string): Promise<Response> {
  const url = new URL(request.url);
  if (!CHART_METRICS.has(metric)) return errorResponse(request, 400, "invalid_metric", "不支援的圖表指標。");
  const today = taipeiDate();
  const from = dateValue(url.searchParams.get("from"), shiftDate(today, -29)) ?? shiftDate(today, -29);
  const to = dateValue(url.searchParams.get("to"), today) ?? today;
  if (from > to) return errorResponse(request, 400, "invalid_date_range", "圖表日期範圍無效。");
  const granularity = chartGranularity(url.searchParams.get("granularity"));
  const buckets = chartBuckets(from, to, granularity);
  const cumulative = metric.endsWith("-cumulative");
  const baseMetric = metric === "mortality-rate" ? "mortality" : cumulative ? metric.slice(0, -"-cumulative".length) : metric;
  const eventIntent = baseMetric === "shipment" ? "shipment" : baseMetric;
  const eventMetrics = new Set(["mortality", "cull", "feed", "water", "shipment"]);

  if (baseMetric === "weather-max" || baseMetric === "weather-min") {
    const bucket = chartBucketExpression("w.weather_date", granularity);
    const clauses = ["s.scope_key = 'yunlin-county-tw'", "w.weather_date BETWEEN ? AND ?", "w.fetch_status IN ('captured', 'backfilled')"];
    const bindings: unknown[] = [from, to];
    const farmId = url.searchParams.get("farmId");
    // Weather V1 is an area-level background series. Farm/house/flock filters
    // do not duplicate or average the same county row; a farm filter only
    // validates that the selected farm belongs to the authenticated org.
    if (farmId) { clauses.push("EXISTS (SELECT 1 FROM farms filtered_farm WHERE filtered_farm.id = ? AND filtered_farm.organization_id = ?)"); bindings.push(farmId, session.organizationId); }
    const valueColumn = baseMetric === "weather-max" ? "w.max_temperature_c" : "w.min_temperature_c";
    const rows = await env.DB.prepare(
      `SELECT ${bucket} AS date, AVG(${valueColumn}) AS value
         FROM weather_scope_daily w JOIN weather_scopes s ON s.id = w.weather_scope_id
        WHERE ${clauses.join(" AND ")} AND ${valueColumn} IS NOT NULL
        GROUP BY ${bucket} ORDER BY date`,
    ).bind(...bindings).all<{ date: string; value: number }>();
    const values = new Map(rows.results.map((row) => [row.date, Number(row.value)]));
    return chartResult(
      request,
      metric,
      from,
      to,
      granularity,
      buckets.filter((date) => values.has(date)).map((date) => ({ date, value: values.get(date) ?? 0 })),
      "°C",
      baseMetric === "weather-max" ? "每日最高溫；多雞場時為符合篩選場的日最高溫平均。" : "每日最低溫；多雞場時為符合篩選場的日最低溫平均。",
      { weatherProvider: "open-meteo", noHourlyStorage: true },
    );
  }

  if (eventMetrics.has(eventIntent)) {
    const bucket = chartBucketExpression("e.event_date", granularity);
    const clauses = ["e.organization_id = ?", "e.event_date BETWEEN ? AND ?", "e.reversed_at IS NULL", "e.intent = ?"];
    const bindings: unknown[] = [session.organizationId, from, to, eventIntent];
    addOperationalChartFilters(url, clauses, bindings, "e", "f", "e.event_date");
    const rows = await env.DB.prepare(
      `SELECT ${bucket} AS date, COALESCE(SUM(e.quantity), 0) AS value
         FROM operational_events e JOIN farms f ON f.id = e.farm_id
        WHERE ${clauses.join(" AND ")}
        GROUP BY ${bucket} ORDER BY date`,
    ).bind(...bindings).all<{ date: string; value: number }>();
    const values = new Map(rows.results.map((row) => [row.date, Number(row.value)]));
    let running = 0;
    const series = buckets.map((date) => {
      const value = values.get(date) ?? 0;
      running += value;
      return { date, value: cumulative ? running : value };
    });
    if (metric === "mortality-rate") {
      const denominatorClauses = ["f.organization_id = ?", "k.chick_in_date <= ?", "k.status <> 'cancelled'"];
      const denominatorBindings: unknown[] = [session.organizationId, to];
      const farmId = url.searchParams.get("farmId");
      const houseId = url.searchParams.get("houseId");
      const flockId = url.searchParams.get("flockId");
      const environment = url.searchParams.get("environment");
      const caretakerId = url.searchParams.get("caretakerId");
      if (farmId) { denominatorClauses.push("k.farm_id = ?"); denominatorBindings.push(farmId); }
      if (houseId) { denominatorClauses.push("k.house_id = ?"); denominatorBindings.push(houseId); }
      if (flockId) { denominatorClauses.push("k.id = ?"); denominatorBindings.push(flockId); }
      if (environment === "production" || environment === "test") { denominatorClauses.push("f.environment = ?"); denominatorBindings.push(environment); }
      if (caretakerId) {
        denominatorClauses.push("EXISTS (SELECT 1 FROM farm_caretaker_assignments ca WHERE ca.farm_id = f.id AND ca.caretaker_id = ? AND ca.effective_from <= k.chick_in_date AND (ca.effective_to IS NULL OR ca.effective_to >= k.chick_in_date))");
        denominatorBindings.push(caretakerId);
      }
      const denominator = await env.DB.prepare(`SELECT COALESCE(SUM(k.initial_count), 0) AS value FROM flocks k JOIN farms f ON f.id = k.farm_id WHERE ${denominatorClauses.join(" AND ")}`).bind(...denominatorBindings).first<{ value: number }>();
      if (!Number(denominator?.value)) return response(request, { metric, from, to, granularity, unit: "%", status: "insufficient-data", definition: "每日死亡數 ÷ 該範圍批次初始數量；缺少批次分母時不顯示。", series: [] });
      return chartResult(request, metric, from, to, granularity, series.map((point) => ({ date: point.date, value: point.value / Number(denominator?.value) * 100 })), "%", "每日死亡數 ÷ 該範圍批次初始數量。", { denominator: Number(denominator?.value) });
    }
    const unit = eventIntent === "feed" ? "kg" : eventIntent === "water" ? "L" : "隻";
    const definition = cumulative ? `資料庫整理後的${eventIntent}累計值。` : `依${granularity === "daily" ? "日" : granularity === "weekly" ? "週" : "月"}整理的${eventIntent}數量。`;
    return chartResult(request, metric, from, to, granularity, series, unit, definition);
  }

  if (baseMetric === "stock") {
    const flockClauses = ["f.organization_id = ?", "k.chick_in_date <= ?", "k.status <> 'cancelled'"];
    const flockBindings: unknown[] = [session.organizationId, to];
    const farmId = url.searchParams.get("farmId");
    const houseId = url.searchParams.get("houseId");
    const flockId = url.searchParams.get("flockId");
    const environment = url.searchParams.get("environment");
    const caretakerId = url.searchParams.get("caretakerId");
    if (farmId) { flockClauses.push("k.farm_id = ?"); flockBindings.push(farmId); }
    if (houseId) { flockClauses.push("k.house_id = ?"); flockBindings.push(houseId); }
    if (flockId) { flockClauses.push("k.id = ?"); flockBindings.push(flockId); }
    if (environment === "production" || environment === "test") { flockClauses.push("f.environment = ?"); flockBindings.push(environment); }
    if (caretakerId) { flockClauses.push("EXISTS (SELECT 1 FROM farm_caretaker_assignments ca WHERE ca.farm_id = f.id AND ca.caretaker_id = ? AND ca.effective_from <= k.chick_in_date AND (ca.effective_to IS NULL OR ca.effective_to >= k.chick_in_date))"); flockBindings.push(caretakerId); }
    const flocks = await env.DB.prepare(`SELECT k.chick_in_date AS chickInDate, k.initial_count AS initialCount FROM flocks k JOIN farms f ON f.id = k.farm_id WHERE ${flockClauses.join(" AND ")}`).bind(...flockBindings).all<{ chickInDate: string; initialCount: number }>();
    const eventClauses = ["e.organization_id = ?", "e.event_date <= ?", "e.reversed_at IS NULL", "e.intent IN ('mortality', 'cull', 'shipment')"];
    const eventBindings: unknown[] = [session.organizationId, to];
    addOperationalChartFilters(url, eventClauses, eventBindings, "e", "f", "e.event_date");
    const bucket = chartBucketExpression("e.event_date", granularity);
    const removals = await env.DB.prepare(`SELECT ${bucket} AS date, COALESCE(SUM(e.quantity), 0) AS value FROM operational_events e JOIN farms f ON f.id = e.farm_id WHERE ${eventClauses.join(" AND ")} GROUP BY ${bucket} ORDER BY date`).bind(...eventBindings).all<{ date: string; value: number }>();
    const removed = new Map(removals.results.map((row) => [row.date, Number(row.value)]));
    const firstBucket = buckets[0] ?? from;
    let cumulativeRemoved = removals.results.filter((row) => row.date < firstBucket).reduce((sum, row) => sum + Number(row.value), 0);
    const series = buckets.map((date) => {
      cumulativeRemoved += removed.get(date) ?? 0;
      const initial = flocks.results.filter((flock) => flock.chickInDate <= date).reduce((sum, flock) => sum + Number(flock.initialCount), 0);
      return { date, value: initial - cumulativeRemoved };
    });
    return chartResult(request, metric, from, to, granularity, series, "隻", "批次初始數量減去有效的死亡、淘汰、出雞紀錄。", { derived: true });
  }

  const financeMetric = metric === "finance" ? "portfolio-net" : metric;
  if (financeMetric === "farm-profit" || financeMetric === "portfolio-net") {
    const bucket = chartBucketExpression("d.distribution_date", granularity);
    const clauses = ["d.organization_id = ?", "d.distribution_date BETWEEN ? AND ?", "f.environment = 'production'"];
    const bindings: unknown[] = [session.organizationId, from, to];
    const farmId = url.searchParams.get("farmId");
    const environment = url.searchParams.get("environment");
    if (financeMetric === "farm-profit" && !farmId) return errorResponse(request, 400, "farm_required", "各場盈虧趨勢需要指定雞場。");
    if (farmId) { clauses.push("d.farm_id = ?"); bindings.push(farmId); }
    if (environment === "test") return chartResult(request, metric, from, to, granularity, [], "元", "財務趨勢只包含 Production 雞場。", { status: "ok" });
    const rows = await env.DB.prepare(`SELECT ${bucket} AS date, COALESCE(SUM(d.net_income), 0) AS value FROM profit_distributions d JOIN farms f ON f.id = d.farm_id WHERE ${clauses.join(" AND ")} GROUP BY ${bucket} ORDER BY date`).bind(...bindings).all<{ date: string; value: number }>();
    const values = new Map(rows.results.map((row) => [row.date, Number(row.value)]));
    return chartResult(request, metric, from, to, granularity, buckets.map((date) => ({ date, value: values.get(date) ?? 0 })), "元", financeMetric === "farm-profit" ? "Production 指定雞場 profit_distributions.net_income。" : "Production 全 portfolio profit_distributions.net_income。", { financeEnvironment: "production" });
  }
  return errorResponse(request, 400, "invalid_metric", "不支援的圖表指標。");
}

async function auditList(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? safeJson(decodeCursor(cursorRaw), null) as { createdAt?: string; id?: string } | null : null;
  const cursorClause = cursor?.createdAt && cursor.id ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : "";
  const bindings: unknown[] = [session.organizationId];
  if (cursor?.createdAt && cursor.id) bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  const rows = await env.DB.prepare(
    `SELECT id, source, actor_type AS actorType, actor_id AS actorId, action, entity_type AS entityType,
            entity_id AS entityId, before_json AS beforeJson, after_json AS afterJson,
            changed_fields_json AS changedFieldsJson, reason, request_id AS requestId, created_at AS createdAt
       FROM audit_logs WHERE organization_id = ? ${cursorClause}
      ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(...bindings, limit + 1).all<Record<string, unknown>>();
  const values = rows.results.slice(0, limit);
  const last = values[values.length - 1];
  const nextCursor = rows.results.length > limit && last ? encodeCursor(JSON.stringify({ createdAt: last.createdAt, id: last.id })) : null;
  return response(request, { auditLogs: values.map((row) => ({ ...row, before: safeJson(row.beforeJson, null), after: safeJson(row.afterJson, null), changedFields: safeJson(row.changedFieldsJson, []) })), nextCursor });
}

async function aliasList(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.farm_id AS farmId, f.name AS farmName, a.alias,
            a.normalized_alias AS normalizedAlias, a.alias_type AS aliasType,
            a.status, a.confirmation_count AS confirmationCount,
            a.last_confirmed_at AS lastConfirmedAt, a.created_at AS createdAt,
            a.updated_at AS updatedAt
       FROM farm_aliases a JOIN farms f ON f.id = a.farm_id
      WHERE f.organization_id = ? ORDER BY f.name, a.status, a.alias`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  return response(request, { aliases: rows.results });
}

async function dataHealth(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const warnings: string[] = [];
  const weatherTarget = addIsoDays(taipeiDate(), -1);
  const [activeWithoutCaretaker, multiHouseWithoutHouse, activeFlockNoShipment, negativeStock, flockCollision, orphanHouses, orphanAliases, orphanAssignments, auditMismatch, missingCoordinates, weatherFailures, weatherMissing, classificationPending] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM farms f LEFT JOIN farm_caretaker_assignments a ON a.farm_id = f.id AND a.effective_to IS NULL AND a.is_primary = 1 WHERE f.organization_id = ? AND f.active = 1 AND a.id IS NULL`).bind(session.organizationId).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM farms f LEFT JOIN houses h ON h.farm_id = f.id AND h.active = 1 WHERE f.organization_id = ? AND f.active = 1 AND f.farm_structure_mode = 'multi_house' GROUP BY f.id HAVING COUNT(h.id) = 0`).bind(session.organizationId).all<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM flocks k JOIN farms f ON f.id = k.farm_id WHERE f.organization_id = ? AND k.status = 'active' AND k.expected_shipment_date IS NULL").bind(session.organizationId).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM flocks k JOIN farms f ON f.id = k.farm_id LEFT JOIN operational_events e ON e.flock_id = k.id AND e.reversed_at IS NULL AND e.intent IN ('mortality', 'cull', 'shipment') WHERE f.organization_id = ? GROUP BY k.id HAVING k.initial_count - COALESCE(SUM(e.quantity), 0) < 0`).bind(session.organizationId).all<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM (SELECT house_id FROM flocks k JOIN farms f ON f.id = k.farm_id WHERE f.organization_id = ? AND k.status = 'active' GROUP BY house_id HAVING COUNT(*) > 1)").bind(session.organizationId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM houses h LEFT JOIN farms f ON f.id = h.farm_id WHERE f.id IS NULL OR f.organization_id <> ?").bind(session.organizationId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM farm_aliases a LEFT JOIN farms f ON f.id = a.farm_id WHERE f.id IS NULL OR f.organization_id <> ?").bind(session.organizationId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM farm_caretaker_assignments a LEFT JOIN farms f ON f.id = a.farm_id LEFT JOIN caretakers c ON c.id = a.caretaker_id WHERE f.id IS NULL OR c.id IS NULL OR f.organization_id <> ? OR c.organization_id <> ?").bind(session.organizationId, session.organizationId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = ? AND action IN ('update', 'archive', 'reverse', 'correct') AND before_json IS NULL").bind(session.organizationId).first<{ count: number }>(),
    env.DB.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM weather_scopes WHERE scope_key = 'yunlin-county-tw' AND active = 1) THEN 0 ELSE 1 END AS count").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM weather_scope_daily w JOIN weather_scopes s ON s.id = w.weather_scope_id WHERE s.scope_key = 'yunlin-county-tw' AND w.fetch_status = 'failed'").first<{ count: number }>(),
    env.DB.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM weather_scope_daily w JOIN weather_scopes s ON s.id = w.weather_scope_id WHERE s.scope_key = 'yunlin-county-tw' AND w.weather_date = ? AND w.fetch_status IN ('captured', 'backfilled')) THEN 0 ELSE 1 END AS count").bind(weatherTarget).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM abnormal_events a JOIN farms f ON f.id = a.farm_id WHERE f.organization_id = ? AND a.classification_status = 'pending'").bind(session.organizationId).first<{ count: number }>(),
  ]);
  const checks = [
    { code: "active_farm_without_caretaker", count: activeWithoutCaretaker?.count ?? 0, label: "啟用雞場未指派飼養者" },
    { code: "multi_house_without_house", count: multiHouseWithoutHouse.results.length, label: "多舍雞場沒有啟用雞舍" },
    { code: "active_flock_missing_expected_shipment", count: activeFlockNoShipment?.count ?? 0, label: "進行中批次缺少預計出雞日期" },
    { code: "negative_derived_stock", count: negativeStock.results.length, label: "衍生存欄低於零" },
    { code: "multiple_active_flock_collision", count: flockCollision?.count ?? 0, label: "同一雞舍有多個進行中批次" },
    { code: "orphan_house", count: orphanHouses?.count ?? 0, label: "雞舍關聯異常" },
    { code: "orphan_alias", count: orphanAliases?.count ?? 0, label: "別名關聯異常" },
    { code: "orphan_assignment", count: orphanAssignments?.count ?? 0, label: "飼養者指派關聯異常" },
    { code: "audit_mismatch", count: auditMismatch?.count ?? 0, label: "變更 audit 缺少 before" },
    { code: "weather_scope_missing", count: missingCoordinates?.count ?? 0, label: "雲林縣共用氣象位置尚未設定" },
    { code: "weather_fetch_failed", count: weatherFailures?.count ?? 0, label: "每日天氣抓取失敗" },
    { code: "weather_daily_missing", count: weatherMissing?.count ?? 0, label: "昨日天氣摘要尚未取得" },
    { code: "abnormal_classification_pending", count: classificationPending?.count ?? 0, label: "異常分類待處理" },
  ];
  for (const check of checks) if (check.count > 0) warnings.push(`${check.label}：${check.count} 筆。`);
  return response(request, { warnings, checks, checkedAt: new Date().toISOString() });
}

function reliabilityStatusCopy(status: ReliabilityStatus): Record<string, unknown> {
  return {
    level: status.level,
    label: status.label,
    message: status.message,
    unfinishedCount: status.unfinishedCount,
    stalledCount: status.stalledCount,
    retryingCount: status.retryingCount,
    retainedCount: status.retainedCount,
    retainedUnacknowledgedCount: status.retainedUnacknowledgedCount,
    retainedAcknowledgedCount: status.retainedAcknowledgedCount,
    retainedOpenCount: status.retainedOpenCount,
    retainedResolvedCount: status.retainedResolvedCount,
    actionableUnfinishedCount: status.actionableUnfinishedCount,
    deliveryUncertainCount: status.deliveryUncertainCount,
    replyFailureCount: status.replyFailureCount,
    lastCompletedAt: status.lastCompletedAt,
    lastProblemAt: status.lastProblemAt,
    checkedAt: status.checkedAt,
    checks: {
      receive: status.retainedOpenCount > 0 ? "需處理" : "正常",
      process: status.stalledCount > 0 || status.actionableUnfinishedCount > 0 ? "較慢" : "正常",
      storage: "正常",
      reply: status.replyFailureCount > 0 || status.deliveryUncertainCount > 0 ? "需查看" : "正常",
    },
  };
}

async function systemStatus(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const status = await getReliabilityStatus(env, session.organizationId);
  return response(request, { status: reliabilityStatusCopy(status) });
}

async function reliabilityEvents(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT e.event_id AS eventId,
            substr(e.event_id, -8) AS eventIdShort,
            substr(COALESCE(e.correlation_id, e.event_id), -8) AS correlationIdShort,
            e.lifecycle_status AS lifecycleStatus,
            e.business_status AS businessStatus,
            e.reply_status AS replyStatus,
            e.received_at AS receivedAt,
            e.queued_at AS queuedAt,
            e.processing_started_at AS processingStartedAt,
            e.business_completed_at AS businessCompletedAt,
            e.reply_completed_at AS replyCompletedAt,
            e.queue_attempts AS queueAttempts,
            e.processing_attempts AS processingAttempts,
            e.reply_attempts AS replyAttempts,
            e.last_error_stage AS lastErrorStage,
            e.last_error_class AS lastErrorClass,
            e.last_error_at AS lastErrorAt,
            e.next_retry_at AS nextRetryAt,
            COALESCE(e.resolution_status, 'unresolved') AS resolutionStatus,
            e.retained_acknowledged_at AS retainedAcknowledgedAt,
            e.retained_acknowledged_by AS retainedAcknowledgedBy,
            e.resolved_at AS resolvedAt,
            e.resolved_by AS resolvedBy,
            e.resolution_reason AS resolutionReason,
            e.resolution_note AS resolutionNote,
            e.manual_record_reference AS manualRecordReference,
            CASE WHEN e.payload_json IS NOT NULL
                       AND e.payload_json <> '{"redacted":true}'
                       AND (e.payload_expires_at IS NULL OR julianday(e.payload_expires_at) > julianday(?))
                 THEN 1 ELSE 0 END AS payloadAvailable,
            e.payload_expires_at AS payloadExpiresAt
       FROM line_events e
       LEFT JOIN line_groups g ON g.group_id = e.group_id
      WHERE g.organization_id = ?
        AND e.lifecycle_status <> 'reply_completed'
      ORDER BY e.received_at DESC, e.event_id DESC
      LIMIT 50`,
  ).bind(new Date().toISOString(), session.organizationId).all<Record<string, unknown>>();
  return response(request, { events: rows.results });
}

async function ambientPreview(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const cutoff = new Date();
  const cutoffIso = cutoff.toISOString();
  const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get("pageSize") ?? 10) || 10));
  const requestedPage = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const [buffered, expired, pending, processed] = await Promise.all([
    env.DB.prepare(
      `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
              line_user_id AS lineUserId, line_message_id AS lineMessageId,
              event_timestamp AS eventTimestamp, text, digest_hour AS digestHour,
              expires_at AS expiresAt
         FROM ambient_chat_buffer
        WHERE organization_id = ? AND digest_status = 'buffered'
          AND julianday(expires_at) > julianday(?)
          AND julianday(event_timestamp) <= julianday(?)
        ORDER BY event_timestamp, id LIMIT 200`,
    ).bind(session.organizationId, cutoffIso, cutoffIso).all<WebAmbientBufferedRow>(),
    env.DB.prepare(
      `SELECT substr(source_fingerprint, -10) AS sourceIdShort,
              original_event_timestamp AS originalEventTimestamp,
              expired_at AS expiredAt, prefilter_result AS prefilterResult,
              last_failure_stage AS lastFailureStage
         FROM ambient_expiry_diagnostics
        WHERE organization_id = ?
          AND julianday(expired_at) <= julianday(?)
          AND julianday(retain_until) > julianday(?)
        ORDER BY expired_at DESC, id DESC LIMIT 100`,
    ).bind(session.organizationId, cutoffIso, cutoffIso).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count FROM ambient_digest_candidates
        WHERE organization_id = ?
          AND (status = 'pending' OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?))`,
    ).bind(session.organizationId, cutoffIso).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count FROM ambient_chat_buffer
        WHERE organization_id = ? AND digest_status = 'processed'
          AND event_timestamp >= ? AND event_timestamp <= ?`,
    ).bind(session.organizationId, new Date(cutoff.getTime() - 24 * 60 * 60 * 1000).toISOString(), cutoffIso).first<{ count: number }>(),
  ]);
  const candidateLikeIds = new Set(ambientPrefilter(buffered.results).map((row) => row.id));
  const classified = buffered.results.map((row) => ({
    idShort: shortIdentifier(row.id),
    groupIdShort: shortIdentifier(row.lineGroupId),
    sourceIdShort: shortIdentifier(row.lineMessageId),
    eventTimestamp: row.eventTimestamp,
    eventTimeTaipei: taipeiDisplay(row.eventTimestamp),
    expiresAt: row.expiresAt,
    text: row.text.replace(/\s+/gu, " ").trim().slice(0, 240),
    candidateLike: candidateLikeIds.has(row.id),
  }));
  const totalPages = Math.max(1, Math.ceil(classified.length / pageSize));
  const page = Math.min(requestedPage, totalPages - 1);
  return response(request, {
    cutoffAt: cutoffIso,
    page,
    pageSize,
    total: classified.length,
    totalPages,
    candidateLikeCount: classified.filter((row) => row.candidateLike).length,
    excludedCount: classified.filter((row) => !row.candidateLike).length,
    openCandidateCount: Number(pending?.count ?? 0),
    processed24hCount: Number(processed?.count ?? 0),
    expiredDiagnosticCount: expired.results.length,
    expiredDiagnostics: expired.results.map((row) => ({
      sourceIdShort: String(row.sourceIdShort ?? "—"),
      originalEventTimestamp: row.originalEventTimestamp,
      eventTimeTaipei: taipeiDisplay(String(row.originalEventTimestamp ?? "")),
      expiredAt: row.expiredAt,
      expiredTimeTaipei: taipeiDisplay(String(row.expiredAt ?? "")),
      prefilterResult: row.prefilterResult === "candidate_like" ? "可能與營運有關" : "目前判定與營運無關",
      lastFailureStage: row.lastFailureStage ?? null,
    })),
    rows: classified.slice(page * pageSize, (page + 1) * pageSize),
    truncated: buffered.results.length >= 200,
    readOnly: true,
  });
}

async function pendingCandidates(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const url = new URL(request.url);
  const now = new Date().toISOString();
  const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get("pageSize") ?? 10) || 10));
  const requestedPage = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM ambient_digest_candidates
      WHERE organization_id = ?
        AND (status = 'pending' OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?))`,
  ).bind(session.organizationId, now).first<{ count: number }>();
  const total = Number(totalRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages - 1);
  const rows = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
            hour_bucket AS hourBucket, candidate_json AS candidateJson,
            status, expires_at AS expiresAt, snoozed_until AS snoozedUntil,
            source, workflow_history_json AS workflowHistoryJson
       FROM ambient_digest_candidates
      WHERE organization_id = ?
        AND (status = 'pending' OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?))
      ORDER BY created_at, id LIMIT ? OFFSET ?`,
  ).bind(session.organizationId, now, pageSize, page * pageSize).all<WebPendingCandidateRow>();
  let invalidCount = 0;
  const candidates = rows.results.flatMap((row) => {
    let parsed: unknown;
    try { parsed = JSON.parse(row.candidateJson); } catch { invalidCount += 1; return []; }
    const bundle = validateAmbientCandidateBundle(parsed);
    if (!bundle) { invalidCount += 1; return []; }
    const sourceIds = Array.from(new Set([
      ...(bundle.sourceMessageIds ?? []),
      ...bundle.candidates.flatMap((candidate) => candidate.sourceMessageIds ?? []),
    ]));
    return [{
      idShort: shortIdentifier(row.id),
      groupIdShort: shortIdentifier(row.lineGroupId),
      status: row.status === "snoozed" ? "待確認" : "待確認",
      hourBucket: row.hourBucket,
      createdTimeTaipei: taipeiDisplay(row.hourBucket),
      expiresAt: row.expiresAt,
      source: row.source,
      sourceMessageCount: sourceIds.length,
      sourceIdsShort: sourceIds.slice(0, 20).map((id) => shortIdentifier(id)),
      sourceTimestamps: bundle.sourceTimestamps ?? bundle.candidates.flatMap((candidate) => candidate.sourceTimestamps ?? []),
      workflowHistoryAvailable: Boolean(row.workflowHistoryJson && row.workflowHistoryJson !== "[]"),
      entries: bundle.candidates.map(ambientCandidateSummary),
    }];
  });
  return response(request, { page, pageSize, total, totalPages, candidates, invalidCount, truncated: false, readOnly: true });
}

async function testTools(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const farms = await env.DB.prepare(
    `SELECT f.id, f.name, f.active, f.environment, f.farm_structure_mode AS structureMode,
            COUNT(DISTINCT h.id) AS houseCount, COUNT(DISTINCT k.id) AS flockCount
       FROM farms f
       LEFT JOIN houses h ON h.farm_id = f.id AND h.active = 1
       LEFT JOIN flocks k ON k.farm_id = f.id AND k.status = 'active'
      WHERE f.organization_id = ? AND f.environment = 'test'
      GROUP BY f.id ORDER BY f.name`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  const houses = await env.DB.prepare(
    `SELECT h.id, h.name, h.active, h.capacity, f.name AS farmName
       FROM houses h JOIN farms f ON f.id = h.farm_id
      WHERE f.organization_id = ? AND f.environment = 'test'
      ORDER BY f.name, h.name`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  const flocks = await env.DB.prepare(
    `SELECT k.id, k.batch_code AS batchCode, k.status, k.chick_in_date AS chickInDate,
            k.initial_count AS initialCount, f.name AS farmName, h.name AS houseName
       FROM flocks k JOIN farms f ON f.id = k.farm_id JOIN houses h ON h.id = k.house_id
      WHERE f.organization_id = ? AND f.environment = 'test'
      ORDER BY f.name, k.batch_code`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  return response(request, {
    farms: farms.results,
    houses: houses.results,
    flocks: flocks.results,
    warning: "這裡只查看測試場資料，不會直接建立營運紀錄。",
    readOnly: true,
  });
}

async function lineGroups(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT group_id AS groupId,
            substr(group_id, 1, 4) || '…' || substr(group_id, -4) AS groupIdShort,
            status, farm_name AS farmName, farm_id AS farmId,
            COALESCE(conversation_v2_enabled, 0) AS conversationV2Enabled
       FROM line_groups
      WHERE organization_id = ?
      ORDER BY status, group_id`,
  ).bind(session.organizationId).all<Record<string, unknown>>();
  return response(request, {
    groups: rows.results.map((row) => ({
      groupId: String(row.groupId),
      groupIdShort: String(row.groupIdShort),
      status: String(row.status),
      farmName: row.farmName ? String(row.farmName) : null,
      farmId: row.farmId ? String(row.farmId) : null,
      conversationV2Enabled: Number(row.conversationV2Enabled ?? 0) === 1,
    })),
  });
}

async function updateLineGroupConversationV2(
  request: Request,
  env: WebApiEnv,
  session: SessionRow,
  groupId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT group_id AS groupId, status, COALESCE(conversation_v2_enabled, 0) AS conversationV2Enabled
       FROM line_groups
      WHERE group_id = ? AND organization_id = ? LIMIT 1`,
  ).bind(groupId, session.organizationId).first<{ groupId: string; status: string; conversationV2Enabled: number }>();
  if (!row) return errorResponse(request, 404, "not_found", "找不到這個 LINE 群組。");
  if (row.status === "left") return errorResponse(request, 409, "group_left", "這個群組已離開，不能調整 AI 對話設定。");
  const body = await bodyJson(request);
  if (typeof body?.enabled !== "boolean") return errorResponse(request, 400, "invalid_enabled", "請選擇開啟或關閉 AI 對話。");
  const enabled = body.enabled ? 1 : 0;
  if (Number(row.conversationV2Enabled ?? 0) === enabled) {
    return response(request, { ok: true, changed: false, enabled: enabled === 1, message: enabled ? "這個群組的 AI 對話已經開啟。" : "這個群組的 AI 對話已經關閉。" });
  }
  await env.DB.prepare(
    `UPDATE line_groups SET conversation_v2_enabled = ?
      WHERE group_id = ? AND organization_id = ?`,
  ).bind(enabled, groupId, session.organizationId).run();
  await writeAuditLog(env, {
    organizationId: session.organizationId,
    source: "web",
    actorType: "web_admin",
    actorId: session.id,
    action: "update",
    entityType: "line_group_ai_conversation",
    entityId: groupId,
    before: { conversationV2Enabled: Number(row.conversationV2Enabled ?? 0) === 1 },
    after: { conversationV2Enabled: enabled === 1 },
    reason: "web_admin_group_ai_conversation_toggle",
    requestId: requestId(request),
  });
  return response(request, {
    ok: true,
    changed: true,
    enabled: enabled === 1,
    message: enabled ? "已開啟這個群組的 AI 對話。" : "已關閉這個群組的 AI 對話。",
  });
}

async function technicalInfo(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  void session;
  return response(request, {
    service: "chicken-line-production",
    accountName: env.LINE_ACCOUNT_NAME ?? "金雞協會助理Ai",
    conversationMode: env.CONVERSATION_V2_MODE ?? "未設定",
    conversationModel: env.CONVERSATION_MODEL ?? PRODUCTION_AI_MODEL,
    ambientModel: PRODUCTION_AI_MODEL,
    queue: { name: "chicken-line-events", batchSize: 10, timeoutSeconds: 0, maxRetries: 3 },
    schedules: [AMBIENT_DIGEST_CRON, dailyReviewCronExpression(), LINE_EVENT_RECOVERY_CRON],
    migration: "0031_conversation_v2_group_rollout_observability.sql",
    secretsIncluded: false,
    rawPayloadIncluded: false,
    note: "這裡只顯示必要技術資料，不顯示密碼、權杖、完整使用者編號或原始訊息。",
  });
}

async function recoverUnfinished(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const result = await manuallyRecoverLineEvents(env, session.id, new Date(), 20);
  await writeAuditLog(env, {
    organizationId: session.organizationId,
    source: "web",
    actorType: "web_admin",
    actorId: session.id,
    action: "manual_recovery",
    entityType: "line_event_recovery",
    entityId: result.eventIds.join(",").slice(0, 200) || "none",
    after: { scanned: result.scanned, requeued: result.requeued, failed: result.failed },
    reason: "web_manual_recovery",
    requestId: requestId(request),
  });
  return response(request, {
    ok: true,
    message: result.requeued > 0
      ? `已重新安排 ${result.requeued} 筆未完成訊息。`
      : "目前沒有可以重新處理的未完成訊息。",
    result,
  });
}

async function recoverRetainedEvent(request: Request, env: WebApiEnv, session: SessionRow, eventId: string): Promise<Response> {
  const row = await retainedEventForOrganization(env, eventId, session.organizationId);
  if (!row) return errorResponse(request, 404, "not_found", "找不到這筆待處理訊息。");
  if (row.lifecycleStatus !== "retained") return errorResponse(request, 409, "recovery_not_available", "這筆訊息目前不在可重新處理的狀態。");
  const payload = typeof row.payloadJson === "string" ? row.payloadJson : "";
  const expiresAt = typeof row.payloadExpiresAt === "string" ? Date.parse(row.payloadExpiresAt) : NaN;
  if (!payload || payload === '{"redacted":true}' || (Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
    return errorResponse(request, 409, "payload_expired", "原始內容已超過保存期限，現在無法重新處理；可以選擇補登資料或結案。");
  }
  const result = await manuallyRecoverLineEvent(env, eventId, session.id, new Date(), "web_admin");
  await writeAuditLog(env, {
    organizationId: session.organizationId,
    source: "web",
    actorType: "web_admin",
    actorId: session.id,
    action: "manual_recovery",
    entityType: "line_event_recovery",
    entityId: eventId,
    before: { lifecycleStatus: row.lifecycleStatus, resolutionStatus: row.resolutionStatus },
    after: { requeued: result.requeued, skipped: result.skipped, failed: result.failed },
    reason: "web_manual_recovery_single_event",
    requestId: requestId(request),
  });
  return response(request, {
    ok: true,
    result,
    message: result.requeued > 0 ? "已重新安排這筆訊息處理。" : "這筆訊息沒有重新安排，可能已被其他處理程序接手。",
  });
}

async function acknowledgeRetained(request: Request, env: WebApiEnv, session: SessionRow): Promise<Response> {
  const acknowledged = await acknowledgeRetainedLineEvents(env, session.id, new Date(), session.organizationId);
  await writeAuditLog(env, {
    organizationId: session.organizationId,
    source: "web",
    actorType: "web_admin",
    actorId: session.id,
    action: "acknowledge",
    entityType: "line_event_recovery",
    entityId: "retained",
    after: { acknowledged },
    reason: "admin_reviewed_retained_messages",
    requestId: requestId(request),
  });
  return response(request, {
    ok: true,
    message: acknowledged > 0 ? `已記下你已查看 ${acknowledged} 筆訊息。` : "目前沒有新的待查看訊息。",
    acknowledged,
  });
}

async function retainedEventForOrganization(env: WebApiEnv, eventId: string, organizationId: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(
    `SELECT e.event_id AS eventId, e.correlation_id AS correlationId,
            e.group_id AS groupId, e.lifecycle_status AS lifecycleStatus,
            COALESCE(e.resolution_status, 'unresolved') AS resolutionStatus,
            e.payload_json AS payloadJson, e.payload_expires_at AS payloadExpiresAt,
            e.resolution_reason AS resolutionReason, e.resolution_note AS resolutionNote,
            e.manual_record_reference AS manualRecordReference
       FROM line_events e
       LEFT JOIN line_groups g ON g.group_id = e.group_id
      WHERE e.event_id = ? AND g.organization_id = ? LIMIT 1`,
  ).bind(eventId, organizationId).first<Record<string, unknown>>();
}

async function resolveRetainedEvent(request: Request, env: WebApiEnv, session: SessionRow, eventId: string): Promise<Response> {
  const row = await retainedEventForOrganization(env, eventId, session.organizationId);
  if (!row) return errorResponse(request, 404, "not_found", "找不到這筆待處理訊息。");
  const body = await bodyJson(request);
  const action = body?.action === "force_close" ? "force_close" : body?.action === "manual_resolve" ? "manual_resolve" : null;
  const reason = stringValue(body?.reason, 500) ?? null;
  const note = nullableString(body?.note, 1000) ?? null;
  if (!action) return errorResponse(request, 400, "invalid_resolution", "請選擇結案方式。");
  if (action === "force_close" && body?.confirm !== true) return errorResponse(request, 400, "confirmation_required", "強制結案需要再次確認。");
  try {
    const result = await resolveRetainedLineEvent(env, eventId, action, session.id, new Date(), reason, note, "web_admin");
    if (result.changed) {
      await writeAuditLog(env, {
        organizationId: session.organizationId,
        source: "web",
        actorType: "web_admin",
        actorId: session.id,
        action: action === "force_close" ? "force_close" : "manual_resolve",
        entityType: "line_event_recovery",
        entityId: eventId,
        before: { resolutionStatus: row.resolutionStatus },
        after: { resolutionStatus: result.resolutionStatus, resolvedAt: new Date().toISOString() },
        reason,
        requestId: requestId(request),
      });
    }
    return response(request, {
      ok: true,
      changed: result.changed,
      resolutionStatus: result.resolutionStatus,
      message: result.changed
        ? action === "force_close" ? "這筆訊息已強制結案，處理紀錄仍會保留。" : "這筆訊息已結案，不會建立正式紀錄。"
        : "這筆訊息已經處理過，沒有重複變更。",
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "line_event_is_not_retained" ? "這筆訊息目前不是可結案的保留資料。" : "目前無法結案，請重新載入後再試。";
    return errorResponse(request, 409, "resolution_not_available", message);
  }
}

async function recordRetainedEvent(request: Request, env: WebApiEnv, session: SessionRow, eventId: string): Promise<Response> {
  const row = await retainedEventForOrganization(env, eventId, session.organizationId);
  if (!row) return errorResponse(request, 404, "not_found", "找不到這筆待處理訊息。");
  if (row.lifecycleStatus !== "retained") return errorResponse(request, 409, "record_not_available", "這筆訊息目前不能補登。");
  if (["manually_resolved", "manually_recorded", "force_closed"].includes(String(row.resolutionStatus))) return response(request, { ok: true, changed: false, message: "這筆訊息已經結案，沒有重複寫入正式資料。" });
  const body = await bodyJson(request);
  const farmId = stringValue(body?.farmId, 100);
  const houseId = body?.houseId === null || body?.houseId === undefined || body.houseId === "" ? null : stringValue(body.houseId, 100);
  const flockId = body?.flockId === null || body?.flockId === undefined || body.flockId === "" ? null : stringValue(body.flockId, 100);
  const intent = typeof body?.intent === "string" && (OPERATIONAL_INTENTS.has(body.intent) || body.intent === "abnormal") ? body.intent : null;
  const quantity = body?.quantity === null || body?.quantity === undefined || body.quantity === "" ? null : positiveNumber(body.quantity);
  const unit = body?.unit === null || body?.unit === undefined || body.unit === "" ? null : typeof body.unit === "string" && UNITS.has(body.unit) ? body.unit : null;
  const eventDate = dateValue(body?.eventDate, "");
  const note = nullableString(body?.note, 1000) ?? null;
  const reason = stringValue(body?.reason, 500) ?? null;
  if (!farmId || !intent || !eventDate || (intent === "abnormal" ? !note : quantity === null || !unit)) return errorResponse(request, 400, "invalid_manual_record", "請填寫雞場、事件類型、發生日期，以及事件需要的欄位。");
  const sourceEventId = `retained-manual-${eventId}`;
  try {
    const record = await createValidatedRetainedRecord(env, {
      organizationId: session.organizationId,
      actorId: session.id,
      sourceEventId,
      requestId: requestId(request),
      farmId,
      houseId,
      flockId,
      intent,
      quantity,
      unit,
      eventDate,
      note,
      lineGroupId: typeof row.groupId === "string" ? row.groupId : null,
    });
    const reference = `${record.kind}:${record.id}`;
    const resolved = await markRetainedLineEventManuallyRecorded(env, eventId, session.id, reference, new Date(), reason, note, "web_admin");
    if (resolved.changed) {
      await writeAuditLog(env, {
        organizationId: session.organizationId,
        source: "web",
        actorType: "web_admin",
        actorId: session.id,
        action: "manual_record",
        entityType: "line_event_recovery",
        entityId: eventId,
        before: { resolutionStatus: row.resolutionStatus },
        after: { resolutionStatus: resolved.resolutionStatus, manualRecordReference: reference },
        reason,
        requestId: requestId(request),
      });
    }
    return response(request, { ok: true, changed: resolved.changed, record, resolutionStatus: resolved.resolutionStatus, message: record.created ? "已補登正式紀錄，這筆訊息已結案。" : "正式紀錄已存在，這筆訊息已結案，沒有重複寫入。" });
  } catch (error) {
    const message = error instanceof Error && error.message === "invalid_scope" ? "雞場、雞舍或批次不在同一有效範圍，沒有寫入。" : error instanceof Error && error.message === "invalid_unit" ? "事件單位不符合這種事件的規則。" : error instanceof Error && error.message === "abnormal_note_required" ? "異常紀錄需要填寫內容。" : "補登資料失敗，沒有寫入正式紀錄。";
    return errorResponse(request, 400, "manual_record_failed", message);
  }
}

export async function handleWebApi(request: Request, env: WebApiEnv): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return errorResponse(request, 404, "not_found", "Not found");
  if (request.headers.has("origin") && !originFor(request)) return errorResponse(request, 403, "origin_not_allowed", "此來源未獲授權。");
  try {
    if (url.pathname === "/api/web/auth/login" && request.method === "POST") return authLogin(request, env);
    if (url.pathname === "/api/web/auth/session" && request.method === "GET") return authSession(request, env);
    const session = await requireSession(request, env);
    if (session instanceof Response) return session;
    if (url.pathname === "/api/web/auth/logout" && request.method === "POST") return authLogout(request, env, session);
    const phaseResponse = await handlePhaseApi(
      request,
      env,
      session,
      (body, status = 200, extra) => response(request, body, status, extra),
      (status, code, message) => errorResponse(request, status, code, message),
    );
    if (phaseResponse) return phaseResponse;
    if (url.pathname === "/api/organizations" && request.method === "GET") return response(request, { organizations: [await activeOrganization(env)] });
    if (url.pathname === "/api/dashboard" && request.method === "GET") return dashboard(request, env, session);
    if (url.pathname === "/api/data-health" && request.method === "GET") return dataHealth(request, env, session);
    if (url.pathname === "/api/system-status" && request.method === "GET") return systemStatus(request, env, session);
    if (url.pathname === "/api/reliability/events" && request.method === "GET") return reliabilityEvents(request, env, session);
    if (url.pathname === "/api/ambient/preview" && request.method === "GET") return ambientPreview(request, env, session);
    if (url.pathname === "/api/pending-candidates" && request.method === "GET") return pendingCandidates(request, env, session);
    if (url.pathname === "/api/line-groups" && request.method === "GET") return lineGroups(request, env, session);
    const lineGroupConversationMatch = /^\/api\/line-groups\/([^/]+)\/ai-conversation$/u.exec(url.pathname);
    if (lineGroupConversationMatch && request.method === "PATCH") {
      return updateLineGroupConversationV2(request, env, session, decodeURIComponent(lineGroupConversationMatch[1]));
    }
    if (url.pathname === "/api/test-tools" && request.method === "GET") return testTools(request, env, session);
    if (url.pathname === "/api/technical-info" && request.method === "GET") return technicalInfo(request, env, session);
    if (url.pathname === "/api/reliability/recover" && request.method === "POST") return recoverUnfinished(request, env, session);
    if (url.pathname === "/api/reliability/acknowledge" && request.method === "POST") return acknowledgeRetained(request, env, session);
    const retainedRecoverMatch = /^\/api\/reliability\/events\/([^/]+)\/recover$/u.exec(url.pathname);
    if (retainedRecoverMatch && request.method === "POST") return recoverRetainedEvent(request, env, session, decodeURIComponent(retainedRecoverMatch[1]));
    const retainedResolveMatch = /^\/api\/reliability\/events\/([^/]+)\/resolve$/u.exec(url.pathname);
    if (retainedResolveMatch && request.method === "POST") return resolveRetainedEvent(request, env, session, decodeURIComponent(retainedResolveMatch[1]));
    const retainedRecordMatch = /^\/api\/reliability\/events\/([^/]+)\/record$/u.exec(url.pathname);
    if (retainedRecordMatch && request.method === "POST") return recordRetainedEvent(request, env, session, decodeURIComponent(retainedRecordMatch[1]));
    if (url.pathname === "/api/farms" && request.method === "GET") return listFarms(request, env, session);
    if (url.pathname === "/api/farms" && request.method === "POST") return createFarm(request, env, session);
    const farmMatch = /^\/api\/farms\/([^/]+)$/u.exec(url.pathname);
    const farmCaretakerMatch = /^\/api\/farms\/([^/]+)\/caretakers$/u.exec(url.pathname);
    if (farmCaretakerMatch && request.method === "POST") return assignCaretaker(request, env, session, farmCaretakerMatch[1]);
    if (farmMatch && request.method === "GET") {
      const farm = await farmById(env, session.organizationId, farmMatch[1]);
      return farm ? response(request, { farm: toFarm(farm) }) : errorResponse(request, 404, "not_found", "找不到雞場。");
    }
    if (farmMatch && request.method === "PATCH") return updateFarm(request, env, session, farmMatch[1]);
    if (url.pathname === "/api/caretakers" && request.method === "GET") return listCaretakers(request, env, session);
    if (url.pathname === "/api/caretakers" && request.method === "POST") return createCaretaker(request, env, session);
    const caretakerMatch = /^\/api\/caretakers\/([^/]+)$/u.exec(url.pathname);
    if (caretakerMatch && request.method === "PATCH") return updateCaretaker(request, env, session, caretakerMatch[1]);
    if (url.pathname === "/api/houses" && request.method === "GET") return listHouses(request, env, session);
    if (url.pathname === "/api/houses" && request.method === "POST") return createHouse(request, env, session);
    const houseMatch = /^\/api\/houses\/([^/]+)$/u.exec(url.pathname);
    if (houseMatch && request.method === "PATCH") return updateHouse(request, env, session, houseMatch[1]);
    if (url.pathname === "/api/flocks" && request.method === "GET") return listFlocks(request, env, session);
    if (url.pathname === "/api/flocks" && request.method === "POST") return createFlock(request, env, session);
    const flockMatch = /^\/api\/flocks\/([^/]+)$/u.exec(url.pathname);
    if (flockMatch && request.method === "PATCH") return updateFlock(request, env, session, flockMatch[1]);
    if (url.pathname === "/api/operational-events" && request.method === "GET") return listOperationalEvents(request, env, session);
    if (url.pathname === "/api/operational-events" && request.method === "POST") return createOperationalEvent(request, env, session);
    const eventReverseMatch = /^\/api\/operational-events\/([^/]+)\/reverse$/u.exec(url.pathname);
    if (eventReverseMatch && request.method === "POST") return reverseOperationalEvent(request, env, session, eventReverseMatch[1]);
    const eventCorrectMatch = /^\/api\/operational-events\/([^/]+)\/correct$/u.exec(url.pathname);
    if (eventCorrectMatch && request.method === "POST") return correctOperationalEvent(request, env, session, eventCorrectMatch[1]);
    if (url.pathname === "/api/finance" && request.method === "GET") return financeSummary(request, env, session);
    const chartMatch = /^\/api\/charts\/([^/]+)$/u.exec(url.pathname);
    if (chartMatch && request.method === "GET") return charts(request, env, session, chartMatch[1]);
    if (url.pathname === "/api/audit" && request.method === "GET") return auditList(request, env, session);
    if (url.pathname === "/api/farm-aliases" && request.method === "GET") return aliasList(request, env, session);
    return errorResponse(request, 404, "not_found", "Not found");
  } catch (error) {
    // The error message is intentionally not returned: it could contain D1 or
    // runtime internals. Observability receives the platform exception only.
    void error;
    return errorResponse(request, 500, "internal_error", "伺服器暫時無法完成操作。");
  }
}
