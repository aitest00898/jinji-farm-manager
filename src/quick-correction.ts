import { normalize } from "./core";
import { FarmResolver, type FarmAliasRecord, type FarmCandidate, type FarmRecord } from "./farm-resolver";
import { normalizedHouseName } from "./master-data";
import type { QuickItemDraft, QuickLineEvent, QuickRecordEnv, QuickFarm } from "./quick-record";

export type CorrectionIntent =
  | { kind: "quantity"; oldQuantity: number | null; newQuantity: number }
  | { kind: "cancel"; rawText: string }
  | { kind: "replace"; fromText: string; toText: string }
  | { kind: "move"; farmText: string }
  | { kind: "partial_move"; assignments: Array<{ itemText: string; farmText: string }> }
  | { kind: "whole_cancel" };

interface QuickSessionCorrectionRow {
  id: string;
  organizationId: string;
  pendingItemsJson: string;
  pendingStatus: string;
  pendingCorrectionJson: string | null;
  lastConfirmedBundleId: string | null;
  activeFarmId: string | null;
  activeHouseId: string | null;
  activeFlockId: string | null;
}

interface CorrectionItemRow {
  itemId: string;
  bundleId: string;
  itemType: "operational" | "abnormal";
  intent: string | null;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  occurredAt: string;
  occurredDate: string;
  operationalEventId: string | null;
  abnormalEventId: string | null;
  itemStatus: string;
  farmId: string;
  farmName: string;
  environment: "production" | "test";
  houseId: string | null;
  flockId: string | null;
  confirmedAt: string;
}

export interface QuickCorrectionResult {
  handled: boolean;
  reply?: string;
}

export interface QuickCorrectionTarget {
  itemId: string;
  itemType: "operational" | "abnormal";
  farmName: string;
  rawText: string;
  quantity: number | null;
  occurredAt: string;
}

const correctionNumber = "(\\d+(?:\\.\\d+)?|[零〇一二兩两三四五六七八九十百千萬万]+)";

function compact(value: string): string {
  return normalize(value).replace(/\s+/gu, "");
}

function parseNumber(value: string): number | null {
  if (/^\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let section = 0;
  let current = 0;
  for (const char of value) {
    if (char in digits) current = digits[char];
    else if (char === "十") { section += (current || 1) * 10; current = 0; }
    else if (char === "百") { section += (current || 1) * 100; current = 0; }
    else if (char === "千") { section += (current || 1) * 1000; current = 0; }
    else if (char === "萬" || char === "万") { section = (section + current) * 10000; current = 0; }
    else return null;
  }
  const result = section + current;
  return result > 0 ? result : null;
}

export function parseQuickCorrection(text: string): CorrectionIntent | null {
  const value = compact(text);
  if (!value) return null;
  if (/^(?:剛剛|刚刚)全部(?:取消|不要記|不要记)$/u.test(value)) return { kind: "whole_cancel" };
  const move = /^(?:剛剛|刚刚)全部(?:是|在)(.+)$/u.exec(value);
  if (move?.[1]) return { kind: "move", farmText: move[1].replace(/(?:雞場|鸡场|場|场)$/u, "") };
  const partialParts = text.normalize("NFKC").split(/[，,；;]/u).map((part) => compact(part)).filter(Boolean);
  if (partialParts.length >= 2) {
    const assignments = partialParts.map((part) => {
      const match = /^(.+?)(?:才是|是|在)(.+)$/u.exec(part);
      return match?.[1] && match[2] ? { itemText: match[1], farmText: match[2] } : null;
    });
    if (assignments.every((assignment): assignment is { itemText: string; farmText: string } => Boolean(assignment))) {
      return { kind: "partial_move", assignments };
    }
  }
  const quantity = new RegExp(`^(?:死亡|死)(?:不是|原本是|原來是|原来是)?${correctionNumber}?[，,]?\\s*(?:是|改成|改為|改为)?\\s*${correctionNumber}$`, "u").exec(value);
  if (quantity) {
    const numbers = [...value.matchAll(new RegExp(correctionNumber, "gu"))].map((match) => parseNumber(match[1])).filter((number): number is number => number !== null);
    if (numbers.length) return { kind: "quantity", oldQuantity: numbers.length > 1 ? numbers[0] : null, newQuantity: numbers[numbers.length - 1] };
  }
  const shorthand = new RegExp(`^(?:死亡|死)改(?:成|為|为)?${correctionNumber}$`, "u").exec(value);
  if (shorthand) {
    const parsed = parseNumber(shorthand[1]);
    if (parsed !== null) return { kind: "quantity", oldQuantity: null, newQuantity: parsed };
  }
  const replace = /^(?:不是|非)(.+?)(?:，|,)?(?:是|改(?:成|為|为)?)(.+)$/u.exec(value);
  if (replace?.[1] && replace[2]) return { kind: "replace", fromText: replace[1], toText: replace[2] };
  const shorthandReplace = /^(.+?)改(?:成|為|为)?(.+)$/u.exec(value);
  if (shorthandReplace?.[1] && shorthandReplace[2]) return { kind: "replace", fromText: shorthandReplace[1], toText: shorthandReplace[2] };
  const cancel = /^(.+?)(?:不要記|不要记|不要)$/u.exec(value);
  if (cancel?.[1]) return { kind: "cancel", rawText: cancel[1] };
  return null;
}

export function parseQuickCorrections(text: string): CorrectionIntent[] | null {
  const raw = text.normalize("NFKC");
  const whole = parseQuickCorrection(text);
  const value = compact(text);
  if (whole?.kind === "quantity" && /^(?:死亡|死)/u.test(value)) return [whole];
  const parts = raw.split(/[，,；;]/u).map((part) => part.trim()).filter(Boolean);
  if (whole?.kind === "partial_move" || whole?.kind === "move" || whole?.kind === "whole_cancel") return [whole];
  if (parts.length <= 1) return whole ? [whole] : null;
  // A comma inside the canonical replacement phrase belongs to that one
  // replacement, not to a multi-action correction.
  if (/^(?:不是|非)/u.test(compact(text)) && whole?.kind === "replace") return [whole];
  const intents = parts.map((part) => parseQuickCorrection(part));
  return intents.every((intent): intent is CorrectionIntent => Boolean(intent)) ? intents : null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function loadSession(env: QuickRecordEnv, groupId: string, userId: string): Promise<QuickSessionCorrectionRow | null> {
  return env.DB.prepare(
    `SELECT id, organization_id AS organizationId, pending_items_json AS pendingItemsJson,
            pending_status AS pendingStatus, pending_correction_json AS pendingCorrectionJson,
            last_confirmed_bundle_id AS lastConfirmedBundleId, active_farm_id AS activeFarmId,
            active_house_id AS activeHouseId, active_flock_id AS activeFlockId
       FROM quick_record_sessions WHERE line_group_id = ? AND line_user_id = ? LIMIT 1`,
  ).bind(groupId, userId).first<QuickSessionCorrectionRow>();
}

function auditStatement(env: QuickRecordEnv, organizationId: string, userId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown, reason: string, requestId: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
       before_json, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, 'line', 'line_user', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`audit-correction-${requestId}-${entityId}-${action}`, organizationId, userId, action, entityType, entityId, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), JSON.stringify(["quantity", "rawText", "farmId", "houseId", "flockId", "status"]), reason, requestId);
}

async function savePending(env: QuickRecordEnv, session: QuickSessionCorrectionRow, items: unknown[], userId: string, correction: string | null, requestId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE quick_record_sessions SET pending_items_json = ?, pending_correction_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(JSON.stringify(items), correction, session.id),
    auditStatement(env, session.organizationId, userId, "pending_correction", "quick_record_session", session.id, { pendingItems: parseJson(session.pendingItemsJson, []) }, { pendingItems: items }, correction ?? "", requestId),
  ]);
}

async function latestItems(env: QuickRecordEnv, groupId: string, userId: string | null, organizationId: string): Promise<CorrectionItemRow[]> {
  const userClause = userId ? "AND b.line_user_id = ?" : "";
  const bindings = userId ? [organizationId, groupId, userId] : [organizationId, groupId];
  const rows = await env.DB.prepare(
    `SELECT i.id AS itemId, i.bundle_id AS bundleId, i.item_type AS itemType, i.intent,
            i.raw_text AS rawText, i.quantity, i.unit, i.occurred_at AS occurredAt,
            i.occurred_date AS occurredDate, i.operational_event_id AS operationalEventId,
            i.abnormal_event_id AS abnormalEventId, i.status AS itemStatus,
            b.farm_id AS farmId, f.name AS farmName, f.environment,
            b.house_id AS houseId, b.flock_id AS flockId, b.confirmed_at AS confirmedAt
       FROM quick_record_items i
       JOIN quick_record_bundles b ON b.id = i.bundle_id
       JOIN farms f ON f.id = b.farm_id
      WHERE b.organization_id = ? AND b.line_group_id = ? ${userClause}
        AND b.status IN ('active', 'corrected', 'moved', 'split')
        AND i.status = 'active'
        AND ((i.item_type = 'operational' AND EXISTS (SELECT 1 FROM operational_events e WHERE e.id = i.operational_event_id AND e.reversed_at IS NULL))
          OR (i.item_type = 'abnormal' AND EXISTS (SELECT 1 FROM abnormal_events a WHERE a.id = i.abnormal_event_id AND a.status = 'active')))
      ORDER BY b.confirmed_at DESC, i.item_index ASC LIMIT 30`,
  ).bind(...bindings).all<CorrectionItemRow>();
  return rows.results;
}

function correctionTarget(row: CorrectionItemRow): QuickCorrectionTarget {
  return {
    itemId: row.itemId,
    itemType: row.itemType,
    farmName: row.farmName,
    rawText: row.rawText,
    quantity: row.quantity,
    occurredAt: row.occurredAt,
  };
}

/**
 * Returns only currently effective records visible to this LINE user. The
 * postback still carries an opaque item id, but callers must re-check it here
 * immediately before applying a correction.
 */
export async function listQuickCorrectionTargets(
  env: QuickRecordEnv,
  groupId: string,
  userId: string,
  organizationId: string,
  kind: "quantity" | "cancel",
): Promise<QuickCorrectionTarget[]> {
  const rows = await latestItems(env, groupId, userId, organizationId);
  const filtered = kind === "quantity"
    ? rows.filter((row) => row.itemType === "operational" && row.intent === "mortality")
    : rows.filter((row) => row.itemType === "abnormal");
  return filtered.map(correctionTarget);
}

export async function applyQuickCorrectionTarget(
  env: QuickRecordEnv,
  groupId: string,
  userId: string,
  organizationId: string,
  itemId: string,
  kind: "quantity" | "cancel",
  requestId: string,
  newQuantity?: number,
): Promise<QuickCorrectionResult> {
  const rows = await latestItems(env, groupId, userId, organizationId);
  const row = rows.find((candidate) => candidate.itemId === itemId);
  if (!row) return { handled: true, reply: "⚠️ 這筆更正候選已失效，請重新輸入完整更正。" };
  if (kind === "quantity") {
    if (row.itemType !== "operational" || row.intent !== "mortality" || !Number.isInteger(newQuantity) || (newQuantity ?? 0) <= 0) {
      return { handled: true, reply: "⚠️ 這筆不是可更正的死亡紀錄。" };
    }
    return applyCorrection(env, row, { kind: "quantity", oldQuantity: row.quantity, newQuantity: newQuantity! }, userId, requestId);
  }
  if (row.itemType !== "abnormal") return { handled: true, reply: "⚠️ 這筆不是可直接取消的異常紀錄。" };
  return applyCorrection(env, row, { kind: "cancel", rawText: row.rawText }, userId, requestId);
}

async function farmCandidates(env: QuickRecordEnv, organizationId: string): Promise<{ farms: QuickFarm[]; resolver: FarmResolver }> {
  const farms = await env.DB.prepare(
    `SELECT id, name, active, environment, farm_structure_mode AS structureMode
       FROM farms WHERE organization_id = ? AND active = 1 ORDER BY name, id`,
  ).bind(organizationId).all<QuickFarm>();
  const aliases = await env.DB.prepare(
    `SELECT farm_id AS farmId, alias, normalized_alias AS normalizedAlias, alias_type AS aliasType, status
       FROM farm_aliases WHERE status = 'trusted' ORDER BY LENGTH(alias) DESC`,
  ).all<FarmAliasRecord>();
  return { farms: farms.results, resolver: new FarmResolver(farms.results as FarmRecord[], aliases.results) };
}

async function targetScope(env: QuickRecordEnv, organizationId: string, farm: QuickFarm, source: CorrectionItemRow): Promise<{ houseId: string | null; houseName: string | null; flockId: string | null } | null> {
  const houses = await env.DB.prepare(
    `SELECT id, name FROM houses WHERE farm_id = ? AND active = 1 ORDER BY id`,
  ).bind(farm.id).all<{ id: string; name: string }>();
  let house = source.houseId ? houses.results.find((row) => row.id === source.houseId) ?? null : null;
  if (!house && houses.results.length === 1) house = houses.results[0];
  if (!house && houses.results.length > 1) return null;
  let flockId: string | null = null;
  if (house) {
    const flocks = await env.DB.prepare(`SELECT id FROM flocks WHERE farm_id = ? AND house_id = ? AND status = 'active' ORDER BY id`).bind(farm.id, house.id).all<{ id: string }>();
    if (flocks.results.length === 1) flockId = flocks.results[0].id;
  }
  return { houseId: house?.id ?? null, houseName: house?.name ?? null, flockId };
}

async function applyQuantity(env: QuickRecordEnv, row: CorrectionItemRow, newQuantity: number, userId: string, reason: string, requestId: string): Promise<void> {
  if (!row.operationalEventId || row.itemType !== "operational") throw new Error("correction_target_not_operational");
  const original = await env.DB.prepare(`SELECT * FROM operational_events WHERE id = ? AND reversed_at IS NULL LIMIT 1`).bind(row.operationalEventId).first<Record<string, unknown>>();
  if (!original) throw new Error("correction_target_inactive");
  const newId = `operational-line-correction-${requestId}`;
  const sourceEventId = `${requestId}:correction:${row.itemId}`;
  await env.DB.batch([
    env.DB.prepare(`UPDATE operational_events SET reversed_at = CURRENT_TIMESTAMP, reversal_reason = ? WHERE id = ? AND reversed_at IS NULL`).bind(reason, row.operationalEventId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO operational_events
        (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date,
         house, house_id, flock_id, raw_message, raw_farm_text, note, source_event_id, correction_of_event_id, quick_bundle_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId, original.organization_id, original.farm_id, original.line_group_id, userId, original.intent, newQuantity, original.unit, original.event_date, original.house, original.house_id, original.flock_id, reason, original.raw_farm_text, original.note, sourceEventId, row.operationalEventId, row.bundleId),
    env.DB.prepare(`UPDATE quick_record_items SET status = 'corrected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(row.itemId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO quick_record_items
        (id, bundle_id, item_index, item_type, intent, raw_text, quantity, unit, occurred_at, occurred_date,
         operational_event_id, status, correction_of_item_id, source_event_id)
       SELECT ?, bundle_id, item_index, item_type, intent, ?, ?, unit, occurred_at, occurred_date,
              ?, 'active', id, ? FROM quick_record_items WHERE id = ?`,
    ).bind(`quick-item-${sourceEventId}`, `死亡 ${newQuantity}`, newQuantity, newId, sourceEventId, row.itemId),
    auditStatement(env, original.organization_id as string, userId, "correct", "operational_event", row.operationalEventId, { quantity: original.quantity, farmId: original.farm_id }, { quantity: newQuantity, correctionEventId: newId }, reason, requestId),
  ]);
}

async function applyAbnormalChange(env: QuickRecordEnv, row: CorrectionItemRow, userId: string, reason: string, requestId: string, mode: "cancel" | "replace", replacement?: string): Promise<void> {
  if (!row.abnormalEventId || row.itemType !== "abnormal") throw new Error("correction_target_not_abnormal");
  const original = await env.DB.prepare(`SELECT * FROM abnormal_events WHERE id = ? AND status = 'active' LIMIT 1`).bind(row.abnormalEventId).first<Record<string, unknown>>();
  if (!original) throw new Error("correction_target_inactive");
  const newId = `abnormal-line-correction-${requestId}`;
  const sourceEventId = `${requestId}:${mode}:${row.itemId}`;
  const status = mode === "cancel" ? "reversal" : "active";
  await env.DB.batch([
    env.DB.prepare(`UPDATE abnormal_events SET status = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(mode === "cancel" ? "reversed" : "corrected", reason, row.abnormalEventId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO abnormal_events
        (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date, approximate_period,
         reported_at, raw_text, source, actor_id, classification_status, weather_date, status,
         correction_of_id, reversal_of_id, reason, source_event_id, quick_bundle_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId, original.organization_id, original.farm_id, original.house_id, original.flock_id, original.occurred_at, original.occurred_date, original.approximate_period, new Date().toISOString(), replacement ?? original.raw_text, userId, original.weather_date, status, mode === "replace" ? row.abnormalEventId : null, mode === "cancel" ? row.abnormalEventId : null, reason, sourceEventId, row.bundleId),
    env.DB.prepare(`UPDATE quick_record_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(mode === "cancel" ? "reversed" : "corrected", row.itemId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO quick_record_items
        (id, bundle_id, item_index, item_type, raw_text, occurred_at, occurred_date, abnormal_event_id,
         status, correction_of_item_id, source_event_id)
       SELECT ?, bundle_id, item_index, item_type, ?, occurred_at, occurred_date, ?, ?, id, ?
         FROM quick_record_items WHERE id = ?`,
    ).bind(`quick-item-${sourceEventId}`, replacement ?? original.raw_text, newId, mode === "cancel" ? "reversed" : "active", sourceEventId, row.itemId),
    auditStatement(env, original.organization_id as string, userId, mode === "cancel" ? "reverse" : "correct", "abnormal_event", row.abnormalEventId, { rawText: original.raw_text, status: "active" }, { rawText: replacement ?? original.raw_text, status, correctionEventId: newId }, reason, requestId),
  ]);
  if (mode === "replace" && env.EVENTS) {
    try { await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: newId }); } catch { /* classification is non-blocking */ }
  }
}

async function moveBundleItems(
  env: QuickRecordEnv,
  rows: CorrectionItemRow[],
  farm: QuickFarm,
  userId: string,
  reason: string,
  requestId: string,
): Promise<void> {
  if (!rows.length) return;
  const scopes = await Promise.all(rows.map((row) => targetScope(env, row.farmId, farm, row)));
  if (scopes.some((scope) => !scope)) throw new Error("move_house_ambiguous");
  const firstScope = scopes[0]!;
  const bundleId = `quick-move-bundle-${requestId}`.replace(/[^A-Za-z0-9_:.=-]/gu, "_");
  const orderedRows = [...rows].sort((left, right) => left.confirmedAt.localeCompare(right.confirmedAt) || left.itemId.localeCompare(right.itemId));
  const openedAt = orderedRows[0]?.occurredAt ?? new Date().toISOString();
  const lastEventAt = orderedRows[orderedRows.length - 1]?.occurredAt ?? openedAt;
  const statements: D1PreparedStatement[] = [];

  // The bundle owner fields come from the source rows. They are loaded once
  // from the session-visible item set and are identical for a bundle move.
  const sourceBundle = await env.DB.prepare(
    `SELECT line_group_id AS lineGroupId, organization_id AS organizationId
       FROM quick_record_bundles WHERE id = ? LIMIT 1`,
  ).bind(orderedRows[0].bundleId).first<{ lineGroupId: string; organizationId: string }>();
  if (!sourceBundle) throw new Error("move_source_bundle_missing");
  statements.push(env.DB.prepare(
    `INSERT OR IGNORE INTO quick_record_bundles
      (id, line_group_id, line_user_id, organization_id, farm_id, house_id, flock_id,
       status, opened_at, last_event_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).bind(bundleId, sourceBundle.lineGroupId, userId, sourceBundle.organizationId, farm.id, firstScope.houseId, firstScope.flockId, openedAt, lastEventAt, new Date().toISOString()));

  const movedAbnormalIds: string[] = [];
  for (const [index, row] of orderedRows.entries()) {
    const scope = scopes[rows.indexOf(row)]!;
    const sourceEventId = `${requestId}:move:${row.itemId}`;
    if (row.itemType === "operational" && row.operationalEventId) {
      const original = await env.DB.prepare(`SELECT * FROM operational_events WHERE id = ? AND reversed_at IS NULL LIMIT 1`).bind(row.operationalEventId).first<Record<string, unknown>>();
      if (!original) throw new Error("correction_target_inactive");
      const newId = `operational-line-move-${requestId}-${index}`.replace(/[^A-Za-z0-9_:.=-]/gu, "_");
      statements.push(
        env.DB.prepare(`UPDATE operational_events SET reversed_at = CURRENT_TIMESTAMP, reversal_reason = ? WHERE id = ? AND reversed_at IS NULL`).bind(reason, row.operationalEventId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO operational_events
            (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date,
             house, house_id, flock_id, raw_message, raw_farm_text, note, source_event_id,
             correction_of_event_id, quick_bundle_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(newId, original.organization_id, farm.id, sourceBundle.lineGroupId, userId, original.intent, original.quantity, original.unit, original.event_date, scope.houseName, scope.houseId, scope.flockId, original.raw_message, farm.name, original.note, sourceEventId, row.operationalEventId, bundleId),
        env.DB.prepare(`UPDATE quick_record_items SET status = 'moved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(row.itemId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO quick_record_items
            (id, bundle_id, item_index, item_type, intent, raw_text, quantity, unit, occurred_at,
             occurred_date, operational_event_id, status, correction_of_item_id, source_event_id)
           VALUES (?, ?, ?, 'operational', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        ).bind(`quick-item-${sourceEventId}`, bundleId, index, row.intent, row.rawText, row.quantity, row.unit, row.occurredAt, row.occurredDate, newId, row.itemId, sourceEventId),
        auditStatement(env, sourceBundle.organizationId, userId, "move", "operational_event", row.operationalEventId, { farmId: row.farmId, farmName: row.farmName, quantity: row.quantity }, { farmId: farm.id, farmName: farm.name, quantity: row.quantity, correctionEventId: newId, bundleId }, reason, requestId),
      );
    } else if (row.itemType === "abnormal" && row.abnormalEventId) {
      const original = await env.DB.prepare(`SELECT * FROM abnormal_events WHERE id = ? AND status = 'active' LIMIT 1`).bind(row.abnormalEventId).first<Record<string, unknown>>();
      if (!original) throw new Error("correction_target_inactive");
      const newId = `abnormal-line-move-${requestId}-${index}`.replace(/[^A-Za-z0-9_:.=-]/gu, "_");
      movedAbnormalIds.push(newId);
      statements.push(
        env.DB.prepare(`UPDATE abnormal_events SET status = 'reversed', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(reason, row.abnormalEventId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO abnormal_events
            (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date, approximate_period,
             reported_at, raw_text, source, actor_id, classification_status, weather_date, status,
             correction_of_id, reversal_of_id, reason, source_event_id, quick_bundle_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', ?, 'pending', ?, 'active', ?, NULL, ?, ?, ?)`,
        ).bind(newId, original.organization_id, farm.id, scope.houseId, scope.flockId, original.occurred_at, original.occurred_date, original.approximate_period, new Date().toISOString(), original.raw_text, userId, original.weather_date, row.abnormalEventId, reason, sourceEventId, bundleId),
        env.DB.prepare(`UPDATE quick_record_items SET status = 'moved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(row.itemId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO quick_record_items
            (id, bundle_id, item_index, item_type, raw_text, occurred_at, occurred_date,
             abnormal_event_id, status, correction_of_item_id, source_event_id)
           VALUES (?, ?, ?, 'abnormal', ?, ?, ?, ?, 'active', ?, ?)`,
        ).bind(`quick-item-${sourceEventId}`, bundleId, index, row.rawText, row.occurredAt, row.occurredDate, newId, row.itemId, sourceEventId),
        auditStatement(env, sourceBundle.organizationId, userId, "move", "abnormal_event", row.abnormalEventId, { farmId: row.farmId, farmName: row.farmName, rawText: row.rawText }, { farmId: farm.id, farmName: farm.name, rawText: row.rawText, correctionEventId: newId, bundleId }, reason, requestId),
      );
    }
  }

  const sourceBundles = [...new Set(orderedRows.map((row) => row.bundleId))];
  for (const sourceBundleId of sourceBundles) {
    const activeCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM quick_record_items WHERE bundle_id = ? AND status = 'active'`,
    ).bind(sourceBundleId).first<{ count: number }>();
    const movedCount = orderedRows.filter((row) => row.bundleId === sourceBundleId).length;
    if (Number(activeCount?.count ?? 0) <= movedCount) {
      statements.push(env.DB.prepare(`UPDATE quick_record_bundles SET status = 'moved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(sourceBundleId));
    }
  }
  statements.push(env.DB.prepare(
    `INSERT INTO line_operational_contexts
      (line_group_id, line_user_id, organization_id, farm_id, house_id, flock_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
       organization_id = excluded.organization_id, farm_id = excluded.farm_id,
       house_id = excluded.house_id, flock_id = excluded.flock_id, updated_at = excluded.updated_at`,
  ).bind(sourceBundle.lineGroupId, userId, sourceBundle.organizationId, farm.id, firstScope.houseId, firstScope.flockId, new Date().toISOString()));
  await env.DB.batch(statements);
  for (const abnormalId of movedAbnormalIds) {
    if (env.EVENTS) {
      try { await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: abnormalId }); } catch { /* classification is non-blocking */ }
    }
  }
}

function correctionReply(row: CorrectionItemRow, text: string): string {
  return `✅ 已更正 ${row.farmName}\n• ${text}`;
}

function matchingRows(rows: CorrectionItemRow[], intent: CorrectionIntent): CorrectionItemRow[] {
  if (intent.kind === "quantity") return rows.filter((row) => row.itemType === "operational" && row.intent === "mortality" && (intent.oldQuantity === null || row.quantity === intent.oldQuantity));
  if (intent.kind === "cancel") return rows.filter((row) => row.rawText.includes(intent.rawText));
  if (intent.kind === "replace") return rows.filter((row) => row.itemType === "abnormal" && row.rawText.includes(intent.fromText));
  return rows;
}

/**
 * Daily Review is group-scoped, so its correction context cannot assume that
 * the replying member is the author of the original Quick Record bundle.
 * Reuse the same correction primitives and audit-producing apply functions,
 * but resolve targets across the group's effective Quick Record items.
 */
export async function handleGroupCorrectionInput(
  env: QuickRecordEnv,
  event: QuickLineEvent,
  text: string,
  eventId: string,
  groupId: string,
  organizationId: string,
): Promise<QuickCorrectionResult> {
  const userId = event.source?.userId;
  if (!userId) return { handled: false };
  const intents = parseQuickCorrections(text);
  if (!intents?.length) return { handled: false };
  const rows = await latestItems(env, groupId, null, organizationId);
  if (!rows.length) return { handled: true, reply: "目前沒有可更正的正式紀錄。" };

  if (intents.length > 1 && intents.every((item) => item.kind === "quantity" || item.kind === "cancel" || item.kind === "replace")) {
    const targets: Array<{ row: CorrectionItemRow; intent: CorrectionIntent }> = [];
    const seen = new Set<string>();
    for (const intent of intents) {
      const matches = matchingRows(rows, intent);
      if (matches.length !== 1 || seen.has(matches[0]?.itemId ?? "")) {
        return { handled: true, reply: "⚠️ 這組日結更正無法唯一對應紀錄，請補充雞場或事件內容。" };
      }
      seen.add(matches[0].itemId);
      targets.push({ row: matches[0], intent });
    }
    const replies: string[] = [];
    for (const [index, target] of targets.entries()) {
      const result = await applyCorrection(env, target.row, target.intent, userId, `${eventId}-${index}`);
      if (result.reply) replies.push(result.reply.replace(/^✅ 已更正 [^\n]+\n/u, ""));
    }
    return { handled: true, reply: `✅ 已更正 ${targets[0].row.farmName}\n${replies.join("\n")}` };
  }

  const intent = intents[0];
  if (intent.kind === "whole_cancel") {
    const latestBundle = rows[0]?.bundleId;
    const targets = latestBundle ? rows.filter((row) => row.bundleId === latestBundle) : [];
    if (!targets.length) return { handled: true, reply: "目前沒有可取消的正式紀錄。" };
    for (const row of targets) await applyCorrection(env, row, { kind: "cancel", rawText: row.rawText }, userId, eventId);
    return { handled: true, reply: `✅ 已取消剛才紀錄｜${targets[0].farmName}` };
  }
  if (intent.kind === "move") {
    const latestBundle = rows[0]?.bundleId;
    const targets = latestBundle ? rows.filter((row) => row.bundleId === latestBundle) : [];
    if (!targets.length) return { handled: true, reply: "目前沒有可移動的正式紀錄。" };
    const { farms, resolver } = await farmCandidates(env, organizationId);
    const resolved = resolver.resolve(intent.farmText);
    if (resolved.kind !== "direct" || !resolved.farm) {
      return { handled: true, reply: resolved.candidates.length
        ? `⚠️ 請先確認要移到哪一場：\n${resolved.candidates.map((candidate, index) => `${index + 1}. ${candidate.farmName}`).join("\n")}`
        : "⚠️ 找不到要移入的雞場，沒有修改。" };
    }
    const targetFarm = farms.find((farm) => farm.id === resolved.farm?.id);
    if (!targetFarm) return { handled: true, reply: "⚠️ 找不到要移入的有效雞場，沒有修改。" };
    await moveBundleItems(env, targets, targetFarm, userId, text, eventId);
    return { handled: true, reply: `✅ 已更正紀錄場次\n${targets[0].farmName} → ${targetFarm.name}` };
  }
  if (intent.kind === "partial_move") {
    const { farms, resolver } = await farmCandidates(env, organizationId);
    const selected = new Map<string, { farm: QuickFarm; rows: CorrectionItemRow[] }>();
    const used = new Set<string>();
    for (const assignment of intent.assignments) {
      const resolved = resolver.resolve(assignment.farmText);
      if (resolved.kind !== "direct" || !resolved.farm) return { handled: true, reply: "⚠️ 請補充要移到哪一場，原始紀錄保持不變。" };
      const farm = farms.find((candidate) => candidate.id === resolved.farm?.id);
      if (!farm) return { handled: true, reply: "⚠️ 找不到要移入的有效雞場，沒有修改。" };
      const itemKey = compact(assignment.itemText);
      const matches = rows.filter((row) => {
        const rawKey = compact(row.rawText);
        return !used.has(row.itemId) && (itemKey.includes(rawKey) || rawKey.includes(itemKey));
      });
      if (!matches.length) return { handled: true, reply: `⚠️ 找不到「${assignment.itemText}」對應的正式紀錄，沒有修改。` };
      matches.forEach((row) => used.add(row.itemId));
      const current = selected.get(farm.id);
      if (current) current.rows.push(...matches);
      else selected.set(farm.id, { farm, rows: matches });
    }
    for (const [index, group] of [...selected.values()].entries()) await moveBundleItems(env, group.rows, group.farm, userId, text, `${eventId}-split-${index}`);
    return { handled: true, reply: "✅ 已完成日結紀錄的場次更正。" };
  }

  const matches = matchingRows(rows, intent);
  if (!matches.length) return { handled: true, reply: "⚠️ 找不到符合日結內容的正式紀錄，沒有修改。" };
  if (matches.length > 1) {
    return {
      handled: true,
      reply: `請問要更正哪一筆？\n${matches.map((row, index) => `${index + 1}. ${row.farmName}｜${row.rawText}${row.quantity === null ? "" : ` ${row.quantity}`}`).join("\n")}\n請補充雞場或事件內容。`,
    };
  }
  return applyCorrection(env, matches[0], intent, userId, eventId);
}

export function correctionLooksRelevant(text: string): boolean {
  const value = compact(text);
  return /(?:不是.+是|改成|改為|改为|改|不要記|不要记|不要$|剛剛全部是|刚刚全部是|剛剛全部取消|刚刚全部取消|才是|其他|其餘|其余)/u.test(value);
}

export async function handleQuickCorrectionInput(env: QuickRecordEnv, event: QuickLineEvent, text: string, eventId: string, groupId: string, organizationId: string): Promise<QuickCorrectionResult> {
  const userId = event.source?.userId;
  if (!userId) return { handled: false };
  const session = await loadSession(env, groupId, userId);
  if (!session || session.organizationId !== organizationId) return { handled: false };
  const pendingCorrection = parseJson<{ intent: CorrectionIntent; candidates: string[] } | null>(session.pendingCorrectionJson, null);
  if (pendingCorrection && /^\d+$/u.test(compact(text))) {
    const index = Number(compact(text)) - 1;
    const selectedId = pendingCorrection.candidates[index];
    if (!selectedId) return { handled: true, reply: "請回覆候選編號。" };
    const rows = await latestItems(env, groupId, userId, organizationId);
    const row = rows.find((candidate) => candidate.itemId === selectedId);
    if (!row) return { handled: true, reply: "⚠️ 這筆更正候選已失效，請重新輸入完整更正。" };
    await env.DB.prepare(`UPDATE quick_record_sessions SET pending_correction_json = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(session.id).run();
    return applyCorrection(env, row, pendingCorrection.intent, userId, eventId);
  }
  const intents = parseQuickCorrections(text);
  if (!intents?.length) return { handled: false };
  const intent = intents[0];
  const pendingItems = parseJson<QuickItemDraft[]>(session.pendingItemsJson, []);
  if (pendingItems.length && intents.every((item) => item.kind === "quantity" || item.kind === "cancel" || item.kind === "replace")) {
    const before = pendingItems.map((item) => ({ rawText: item.rawText, quantity: item.quantity }));
    let next = pendingItems;
    const replies: string[] = [];
    for (const action of intents) {
      if (action.kind === "quantity") {
        const index = next.findIndex((item) => item.itemType === "operational" && item.intent === "mortality" && (action.oldQuantity === null || item.quantity === action.oldQuantity));
        if (index < 0) return { handled: true, reply: "⚠️ 找不到待記錄的死亡事件，沒有修改。" };
        const previous = next[index].quantity;
        next = next.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: action.newQuantity, rawText: `死亡 ${action.newQuantity}` } : item);
        replies.push(`• 死亡：${previous ?? "—"} → ${action.newQuantity}`);
      } else if (action.kind === "cancel") {
        const matched = next.some((item) => item.rawText.includes(action.rawText));
        if (!matched) return { handled: true, reply: `⚠️ 找不到待記錄的「${action.rawText}」，沒有修改。` };
        next = next.filter((item) => !item.rawText.includes(action.rawText));
        replies.push(`• ${action.rawText}：已取消`);
      } else {
        const matched = next.some((item) => item.itemType === "abnormal" && item.rawText.includes(action.fromText));
        if (!matched) return { handled: true, reply: `⚠️ 找不到待記錄的「${action.fromText}」，沒有修改。` };
        next = next.map((item) => item.itemType === "abnormal" && item.rawText.includes(action.fromText) ? { ...item, rawText: action.toText } : item);
        replies.push(`• 異常：${action.fromText} → ${action.toText}`);
      }
    }
    await savePending(env, session, next, userId, text, eventId);
    void before;
    return { handled: true, reply: `✅ 已更新待記錄內容\n${replies.join("\n")}` };
  }
  const rows = await latestItems(env, groupId, userId, organizationId);
  if (intents.length > 1 && intents.every((item) => item.kind === "quantity" || item.kind === "cancel" || item.kind === "replace")) {
    const targets: Array<{ row: CorrectionItemRow; intent: CorrectionIntent }> = [];
    const seen = new Set<string>();
    for (const action of intents) {
      const matches = matchingRows(rows, action);
      if (matches.length !== 1 || seen.has(matches[0]?.itemId ?? "")) {
        return { handled: true, reply: "⚠️ 這組更正無法唯一對應上一組紀錄，沒有修改。" };
      }
      seen.add(matches[0].itemId);
      targets.push({ row: matches[0], intent: action });
    }
    const replies: string[] = [];
    for (const target of targets) {
      const result = await applyCorrection(env, target.row, target.intent, userId, `${eventId}-${replies.length}`);
      if (result.reply) replies.push(result.reply.replace(/^✅ 已更正 [^\n]+\n/u, ""));
    }
    return { handled: true, reply: `✅ 已更正 ${targets[0].row.farmName}\n${replies.join("\n")}` };
  }
  if (intent.kind === "whole_cancel") {
    const latestBundle = rows[0]?.bundleId;
    const targets = latestBundle ? rows.filter((row) => row.bundleId === latestBundle) : [];
    if (!targets.length) return { handled: true, reply: "目前沒有可取消的上一組紀錄。" };
    for (const row of targets) await applyCorrection(env, row, { kind: "cancel", rawText: row.rawText }, userId, eventId);
    return { handled: true, reply: `✅ 已取消剛才紀錄｜${targets[0].farmName}\n${targets.map((row) => `• ${row.rawText}：已取消`).join("\n")}` };
  }
  if (intent.kind === "move") {
    const latestBundle = rows[0]?.bundleId;
    const targets = latestBundle ? rows.filter((row) => row.bundleId === latestBundle) : [];
    if (!targets.length) return { handled: true, reply: "目前沒有可移動的上一組紀錄。" };
    const { farms, resolver } = await farmCandidates(env, organizationId);
    const resolved = resolver.resolve(intent.farmText);
    if (resolved.kind !== "direct" || !resolved.farm) return { handled: true, reply: resolved.candidates.length ? `⚠️ 請先確認要移到哪一場：\n${resolved.candidates.map((candidate, index) => `${index + 1}. ${candidate.farmName}`).join("\n")}` : "⚠️ 找不到要移入的雞場，沒有修改。" };
    const targetFarm = farms.find((farm) => farm.id === resolved.farm?.id);
    if (!targetFarm) return { handled: true, reply: "⚠️ 找不到要移入的有效雞場，沒有修改。" };
    // The original rows remain in the ledger; the whole bundle is moved by a
    // single D1 batch so its event/item/audit chain cannot partially commit.
    await moveBundleItems(env, targets, targetFarm, userId, text, eventId);
    return { handled: true, reply: `✅ 已更正紀錄場次\n${targets[0].farmName} → ${targetFarm.name}\n${targets.map((row) => `• ${row.rawText}`).join("\n")}` };
  }
  if (intent.kind === "partial_move") {
    const { farms, resolver } = await farmCandidates(env, organizationId);
    const selected = new Map<string, { farm: QuickFarm; rows: CorrectionItemRow[] }>();
    const used = new Set<string>();
    for (const assignment of intent.assignments) {
      const resolved = resolver.resolve(assignment.farmText);
      if (resolved.kind !== "direct" || !resolved.farm) {
        return { handled: true, reply: resolved.candidates.length ? `⚠️ 請先確認要移到哪一場：\n${resolved.candidates.map((candidate, index) => `${index + 1}. ${candidate.farmName}`).join("\n")}` : "⚠️ 找不到要移入的雞場，沒有修改。" };
      }
      const farm = farms.find((candidate) => candidate.id === resolved.farm?.id);
      if (!farm) return { handled: true, reply: "⚠️ 找不到要移入的有效雞場，沒有修改。" };
      const itemKey = compact(assignment.itemText);
      const matches = rows.filter((row) => {
        const rawKey = compact(row.rawText);
        return !used.has(row.itemId) && (itemKey.includes(rawKey) || rawKey.includes(itemKey));
      });
      if (!matches.length) return { handled: true, reply: `⚠️ 找不到「${assignment.itemText}」對應的上一筆紀錄，沒有修改。` };
      matches.forEach((row) => used.add(row.itemId));
      const existing = selected.get(farm.id);
      if (existing) existing.rows.push(...matches);
      else selected.set(farm.id, { farm, rows: matches });
    }
    for (const [index, group] of Array.from(selected.values()).entries()) {
      await moveBundleItems(env, group.rows, group.farm, userId, text, `${eventId}-split-${index}`);
    }
    const lines = [...selected.values()].map((group, index) => `${index + 1}. ${group.farm.name}\n${group.rows.map((row) => `   • ${row.rawText}`).join("\n")}`);
    return { handled: true, reply: `✅ 已更正紀錄\n${lines.join("\n\n")}` };
  }
  const matches = matchingRows(rows, intent);
  if (!matches.length) return { handled: true, reply: "⚠️ 找不到可更正的上一筆紀錄，沒有修改。" };
  if (matches.length > 1) {
    await env.DB.prepare(`UPDATE quick_record_sessions SET pending_correction_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(JSON.stringify({ intent, candidates: matches.map((row) => row.itemId) }), session.id).run();
    return { handled: true, reply: `請問要更正哪一筆？\n${matches.map((row, index) => `${index + 1}. ${row.farmName}｜${row.rawText}${row.quantity === null ? "" : ` ${row.quantity}`}`).join("\n")}\n請回覆編號。` };
  }
  return applyCorrection(env, matches[0], intent, userId, eventId);
}

async function applyCorrection(env: QuickRecordEnv, row: CorrectionItemRow, intent: CorrectionIntent, userId: string, requestId: string): Promise<QuickCorrectionResult> {
  try {
    if (intent.kind === "quantity") {
      await applyQuantity(env, row, intent.newQuantity, userId, `LINE 更正：死亡 ${row.quantity ?? "—"} → ${intent.newQuantity}`, requestId);
      return { handled: true, reply: correctionReply(row, `死亡：${row.quantity ?? "—"} → ${intent.newQuantity}`) };
    }
    if (intent.kind === "cancel") {
      await applyAbnormalChange(env, row, userId, `LINE 取消：${intent.rawText}`, requestId, "cancel");
      return { handled: true, reply: correctionReply(row, `${intent.rawText}：已取消`) };
    }
    if (intent.kind === "replace") {
      await applyAbnormalChange(env, row, userId, `LINE 更正：${intent.fromText} → ${intent.toText}`, requestId, "replace", intent.toText);
      return { handled: true, reply: correctionReply(row, `異常：${intent.fromText} → ${intent.toText}`) };
    }
  } catch {
    return { handled: true, reply: "⚠️ 更正未完成，原始紀錄保持不變。" };
  }
  return { handled: true, reply: "⚠️ 這種更正目前無法安全處理，原始紀錄保持不變。" };
}

async function moveItem(env: QuickRecordEnv, row: CorrectionItemRow, farm: QuickFarm, userId: string, reason: string, requestId: string): Promise<void> {
  const scope = await targetScope(env, row.farmId ? row.farmId : row.farmId, farm, row);
  if (!scope) throw new Error("move_house_ambiguous");
  if (row.itemType === "operational" && row.operationalEventId) {
    const original = await env.DB.prepare(`SELECT * FROM operational_events WHERE id = ? AND reversed_at IS NULL LIMIT 1`).bind(row.operationalEventId).first<Record<string, unknown>>();
    if (!original) return;
    const newId = `operational-line-move-${requestId}-${row.itemId}`;
    const sourceEventId = `${requestId}:move:${row.itemId}`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE operational_events SET reversed_at = CURRENT_TIMESTAMP, reversal_reason = ? WHERE id = ? AND reversed_at IS NULL`).bind(reason, row.operationalEventId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO operational_events
          (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date,
           house, house_id, flock_id, raw_message, raw_farm_text, note, source_event_id, correction_of_event_id, quick_bundle_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId, original.organization_id, farm.id, original.line_group_id, userId, original.intent, original.quantity, original.unit, original.event_date, scope.houseName, scope.houseId, scope.flockId, reason, farm.name, sourceEventId, row.operationalEventId, row.bundleId),
      env.DB.prepare(`UPDATE quick_record_items SET status = 'moved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(row.itemId),
      auditStatement(env, original.organization_id as string, userId, "move", "operational_event", row.operationalEventId, { farmId: row.farmId, farmName: row.farmName }, { farmId: farm.id, farmName: farm.name }, reason, requestId),
    ]);
  } else if (row.itemType === "abnormal" && row.abnormalEventId) {
    const original = await env.DB.prepare(`SELECT * FROM abnormal_events WHERE id = ? AND status = 'active' LIMIT 1`).bind(row.abnormalEventId).first<Record<string, unknown>>();
    if (!original) return;
    const newId = `abnormal-line-move-${requestId}-${row.itemId}`;
    const sourceEventId = `${requestId}:move:${row.itemId}`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE abnormal_events SET status = 'reversed', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(reason, row.abnormalEventId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO abnormal_events
          (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date, approximate_period,
           reported_at, raw_text, source, actor_id, classification_status, weather_date, status,
           correction_of_id, reversal_of_id, reason, source_event_id, quick_bundle_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', ?, 'pending', ?, 'active', ?, NULL, ?, ?, ?)`,
      ).bind(newId, original.organization_id, farm.id, scope.houseId, scope.flockId, original.occurred_at, original.occurred_date, original.approximate_period, new Date().toISOString(), original.raw_text, userId, original.weather_date, row.abnormalEventId, reason, sourceEventId, row.bundleId),
      env.DB.prepare(`UPDATE quick_record_items SET status = 'moved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'`).bind(row.itemId),
      auditStatement(env, original.organization_id as string, userId, "move", "abnormal_event", row.abnormalEventId, { farmId: row.farmId, farmName: row.farmName }, { farmId: farm.id, farmName: farm.name }, reason, requestId),
    ]);
    if (env.EVENTS) {
      try { await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: newId }); } catch { /* non-blocking */ }
    }
  }
}
