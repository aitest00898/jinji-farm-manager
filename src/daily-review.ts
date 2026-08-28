import { validateAmbientCandidateBundle, type AmbientCandidateBundle } from "./ambient";
import {
  buildDailyReviewFollowupReplies,
  buildTextMessage,
  type LineReplyMessage,
} from "./line-menu";

const TAIPEI = "Asia/Taipei";
export const AMBIENT_DIGEST_CRON = "0 1,4,7,10,22 * * *";
const DAILY_REVIEW_CRON = "0 13 * * *";
const DAILY_REVIEW_TYPE = "operations";
const DELIVERY_LEASE_MS = 30_000;

export interface DailyReviewEnv {
  DB: D1Database;
}

export interface DailyReviewGroup {
  groupId: string;
  organizationId: string;
}

export interface DailyReviewWindow {
  localDate: string;
  startAt: string;
  cutoffAt: string;
  nextStartAt: string;
}

export interface DailyReviewFarmSummary {
  farmId: string;
  farmName: string;
  mortality: number;
  cull: number;
  shipment: number;
  feed: number;
  water: number;
  abnormal: string[];
}

export interface DailyReviewPendingCandidate {
  candidateId: string;
  farmText: string | null;
  caretakerText: string | null;
  itemText: string;
  state: string;
}

export interface DailyReviewSnapshot {
  reviewType: typeof DAILY_REVIEW_TYPE;
  localDate: string;
  cutoffAt: string;
  weather: {
    date: string | null;
    condition: string | null;
    maxTemperatureC: number | null;
    maxTemperatureAt: string | null;
    minTemperatureC: number | null;
    minTemperatureAt: string | null;
  } | null;
  totals: {
    mortality: number;
    cull: number;
    shipment: number;
    feed: number;
    water: number;
    abnormal: number;
  };
  farms: DailyReviewFarmSummary[];
  pendingCandidates: DailyReviewPendingCandidate[];
  ambientFailureWarning?: string | null;
}

export interface DailyReviewDeliveryResult {
  status: "sent" | "already_sent" | "busy" | "failed";
  reviewId: string;
  localDate: string;
  message?: LineReplyMessage;
  errorClass?: string;
}

export interface DailyReviewRunResult {
  groups: number;
  sent: number;
  alreadySent: number;
  busy: number;
  failed: number;
  results: DailyReviewDeliveryResult[];
}

function localDateParts(now: Date): { year: number; month: number; day: number; localDate: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return { year, month, day, localDate: `${values.year}-${values.month}-${values.day}` };
}

function taipeiLocalDateToUtc(date: { year: number; month: number; day: number }, hour: number, minute: number): Date {
  // Taiwan has a fixed UTC+8 offset. This avoids relying on the Worker host's
  // timezone while keeping the business window explicit and reviewable.
  return new Date(Date.UTC(date.year, date.month - 1, date.day, hour - 8, minute, 0, 0));
}

export function dailyReviewWindow(now = new Date()): DailyReviewWindow {
  const local = localDateParts(now);
  const start = taipeiLocalDateToUtc(local, 0, 0);
  const cutoff = taipeiLocalDateToUtc(local, 21, 0);
  const nextStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    localDate: local.localDate,
    startAt: start.toISOString(),
    cutoffAt: cutoff.toISOString(),
    nextStartAt: nextStart.toISOString(),
  };
}

export function isDailyReviewCron(cron: string): boolean {
  return cron === DAILY_REVIEW_CRON;
}

export function scheduledJobForCron(cron: string): "ambient_digest" | "daily_review" | "recovery" | "unknown" {
  // Cloudflare supplies the configured expression for each scheduled trigger.
  // The local runtime uses the same production expression so schedule drift is
  // caught by tests instead of being hidden behind an hourly sentinel.
  if (cron === AMBIENT_DIGEST_CRON) return "ambient_digest";
  if (isDailyReviewCron(cron)) return "daily_review";
  if (cron === "*/2 * * * *") return "recovery";
  return "unknown";
}

function numberValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function candidateStateLabel(state: string | undefined): string {
  if (state === "possibly_recorded") return "可能已紀錄";
  if (state === "conflict" || state === "unresolved_quantity") return "資料待確認";
  if (state === "unresolved_entity") return "雞場待確認";
  return "待確認";
}

function summarizeCandidate(candidateId: string, bundle: AmbientCandidateBundle): DailyReviewPendingCandidate {
  const candidate = bundle.candidates.find((item) => item.items.length > 0) ?? bundle.candidates[0];
  const item = candidate?.items[0];
  const itemText = item
    ? item.type === "mortality"
      ? `死亡${item.quantity ?? "?"}`
      : item.type === "cull"
        ? `淘汰${item.quantity ?? "?"}`
        : item.raw
    : "候選營運資訊";
  return {
    candidateId,
    farmText: candidate?.resolution?.resolvedFarmId ? candidate.farmText : candidate?.farmText ?? null,
    caretakerText: candidate?.caretakerText ?? null,
    itemText,
    state: candidateStateLabel(candidate?.state),
  };
}

export async function listDailyReviewGroups(env: DailyReviewEnv): Promise<DailyReviewGroup[]> {
  const rows = await env.DB.prepare(
    `SELECT group_id AS groupId, organization_id AS organizationId
       FROM line_groups
      WHERE organization_id IS NOT NULL AND status != 'left'
      ORDER BY group_id`,
  ).all<DailyReviewGroup>();
  return rows.results;
}

export async function buildDailyReviewSnapshot(
  env: DailyReviewEnv,
  organizationId: string,
  groupId: string,
  now = new Date(),
): Promise<DailyReviewSnapshot> {
  const window = dailyReviewWindow(now);
  const operationalRows = await env.DB.prepare(
    `SELECT oe.farm_id AS farmId, f.name AS farmName, oe.intent,
            SUM(oe.quantity) AS quantity
       FROM operational_events oe
       JOIN farms f ON f.id = oe.farm_id
      WHERE oe.organization_id = ?
        AND oe.event_date = ?
        AND datetime(COALESCE(
          (SELECT qri.occurred_at
             FROM quick_record_items qri
            WHERE qri.operational_event_id = oe.id
            ORDER BY qri.created_at DESC, qri.id DESC
            LIMIT 1),
          oe.created_at
        )) <= datetime(?)
        AND oe.reversed_at IS NULL
      GROUP BY oe.farm_id, f.name, oe.intent
      ORDER BY f.name, oe.intent`,
  ).bind(organizationId, window.localDate, window.cutoffAt).all<{
    farmId: string;
    farmName: string;
    intent: string;
    quantity: number;
  }>();

  const abnormalRows = await env.DB.prepare(
    `SELECT ae.farm_id AS farmId, f.name AS farmName, ae.raw_text AS rawText
       FROM abnormal_events ae
       JOIN farms f ON f.id = ae.farm_id
      WHERE ae.organization_id = ?
        AND ae.occurred_date = ?
        AND datetime(COALESCE(ae.occurred_at, ae.reported_at, ae.created_at)) <= datetime(?)
        AND ae.status = 'active'
      ORDER BY f.name, ae.created_at, ae.id`,
  ).bind(organizationId, window.localDate, window.cutoffAt).all<{
    farmId: string;
    farmName: string;
    rawText: string;
  }>();

  const farmMap = new Map<string, DailyReviewFarmSummary>();
  const getFarm = (farmId: string, farmName: string): DailyReviewFarmSummary => {
    const existing = farmMap.get(farmId);
    if (existing) return existing;
    const created: DailyReviewFarmSummary = {
      farmId,
      farmName,
      mortality: 0,
      cull: 0,
      shipment: 0,
      feed: 0,
      water: 0,
      abnormal: [],
    };
    farmMap.set(farmId, created);
    return created;
  };
  for (const row of operationalRows.results) {
    const farm = getFarm(row.farmId, row.farmName);
    if (row.intent === "mortality") farm.mortality += numberValue(row.quantity);
    else if (row.intent === "cull") farm.cull += numberValue(row.quantity);
    else if (row.intent === "shipment") farm.shipment += numberValue(row.quantity);
    else if (row.intent === "feed") farm.feed += numberValue(row.quantity);
    else if (row.intent === "water") farm.water += numberValue(row.quantity);
  }
  for (const row of abnormalRows.results) getFarm(row.farmId, row.farmName).abnormal.push(row.rawText);

  const weather = await env.DB.prepare(
    `SELECT w.weather_date AS date, w.weather_condition AS condition,
            w.max_temperature_c AS maxTemperatureC, w.max_temperature_at AS maxTemperatureAt,
            w.min_temperature_c AS minTemperatureC, w.min_temperature_at AS minTemperatureAt
       FROM weather_scope_daily w
       JOIN weather_scopes s ON s.id = w.weather_scope_id
      WHERE s.scope_key = 'yunlin-county-tw'
        AND s.active = 1
        AND w.fetch_status IN ('captured', 'backfilled')
        AND w.weather_date = ?
      LIMIT 1`,
  ).bind(window.localDate).first<{
    date: string;
    condition: string | null;
    maxTemperatureC: number | null;
    maxTemperatureAt: string | null;
    minTemperatureC: number | null;
    minTemperatureAt: string | null;
  }>();

  const candidateRows = await env.DB.prepare(
    `SELECT id, candidate_json AS candidateJson
       FROM ambient_digest_candidates
      WHERE organization_id = ? AND line_group_id = ?
        AND (status = 'pending' OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?))
      ORDER BY created_at, id`,
  ).bind(organizationId, groupId, now.toISOString()).all<{ id: string; candidateJson: string }>();
  const pendingCandidates: DailyReviewPendingCandidate[] = [];
  for (const row of candidateRows.results) {
    try {
      const bundle = validateAmbientCandidateBundle(JSON.parse(row.candidateJson));
      if (bundle) pendingCandidates.push(summarizeCandidate(row.id, bundle));
    } catch {
      // The candidate inbox diagnostics owns malformed-candidate observability;
      // a broken pending row must not make official Daily Review totals fail.
    }
  }

  let ambientFailureWarning: string | null = null;
  try {
    const invocationFailure = await env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM ambient_digest_invocations
        WHERE trigger_type = 'cron'
          AND invocation_status = 'failed'
          AND scheduled_for >= ?
          AND scheduled_for <= ?`,
    ).bind(window.startAt, window.cutoffAt).first<{ count: number }>();
    const groupFailure = await env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM ambient_digest_runs
        WHERE organization_id = ? AND line_group_id = ?
          AND run_status = 'failed'
          AND scheduled_for >= ?
          AND scheduled_for <= ?`,
    ).bind(organizationId, groupId, window.startAt, window.cutoffAt).first<{ count: number }>();
    const failureRetained = await env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM ambient_chat_buffer
        WHERE organization_id = ? AND line_group_id = ?
          AND digest_status = 'buffered'
          AND failure_retained_until IS NOT NULL
          AND julianday(failure_retained_until) > julianday(?)`,
    ).bind(organizationId, groupId, window.cutoffAt).first<{ count: number }>();
    if (Number(invocationFailure?.count ?? 0) > 0 || Number(groupFailure?.count ?? 0) > 0 || Number(failureRetained?.count ?? 0) > 0) {
      ambientFailureWarning = "另外有部分群組訊息尚未完成整理，系統會繼續處理；這些內容目前還不是正式紀錄。";
    }
  } catch {
    // The warning is additive. Older local fixtures without 0034 must keep
    // the existing Daily Review behavior.
  }

  const farms = [...farmMap.values()].filter((farm) =>
    farm.mortality || farm.cull || farm.shipment || farm.feed || farm.water || farm.abnormal.length,
  );
  return {
    reviewType: DAILY_REVIEW_TYPE,
    localDate: window.localDate,
    cutoffAt: window.cutoffAt,
    weather: weather ?? null,
    totals: {
      mortality: farms.reduce((sum, farm) => sum + farm.mortality, 0),
      cull: farms.reduce((sum, farm) => sum + farm.cull, 0),
      shipment: farms.reduce((sum, farm) => sum + farm.shipment, 0),
      feed: farms.reduce((sum, farm) => sum + farm.feed, 0),
      water: farms.reduce((sum, farm) => sum + farm.water, 0),
      abnormal: farms.reduce((sum, farm) => sum + farm.abnormal.length, 0),
    },
    farms,
    pendingCandidates,
    ambientFailureWarning,
  };
}

function quantityText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

export function formatDailyReview(snapshot: DailyReviewSnapshot): string {
  const lines = [
    "📋 金雞協會助理 AI｜今日營運總覽",
    snapshot.localDate,
  ];
  if (snapshot.weather) {
    const weather = snapshot.weather;
    lines.push(
      "",
      "🌤 雲林天氣",
      ...(weather.condition ? [`天氣：${weather.condition}`] : []),
      ...(weather.maxTemperatureC !== null ? [`最高溫 ${quantityText(weather.maxTemperatureC)}°C${weather.maxTemperatureAt ? `（${weather.maxTemperatureAt}）` : ""}`] : []),
      ...(weather.minTemperatureC !== null ? [`最低溫 ${quantityText(weather.minTemperatureC)}°C${weather.minTemperatureAt ? `（${weather.minTemperatureAt}）` : ""}`] : []),
    );
  }
  const totals = snapshot.totals;
  const totalLines = [
    totals.mortality ? `• 死亡：${quantityText(totals.mortality)}隻` : null,
    totals.cull ? `• 淘汰：${quantityText(totals.cull)}隻` : null,
    totals.shipment ? `• 出雞：${quantityText(totals.shipment)}` : null,
    totals.feed ? `• 飼料：${quantityText(totals.feed)}` : null,
    totals.water ? `• 飲水：${quantityText(totals.water)}` : null,
    totals.abnormal ? `• 異常：${totals.abnormal}筆` : null,
  ].filter((line): line is string => Boolean(line));
  lines.push("", "📊 今日合計", ...(totalLines.length ? totalLines : ["• 今天尚無正式營運紀錄"]));
  if (snapshot.ambientFailureWarning) lines.push("", snapshot.ambientFailureWarning);
  for (const farm of snapshot.farms) {
    lines.push("", `🐔 ${farm.farmName}`);
    if (farm.mortality) lines.push(`• 死亡：${quantityText(farm.mortality)}隻`);
    if (farm.cull) lines.push(`• 淘汰：${quantityText(farm.cull)}隻`);
    if (farm.shipment) lines.push(`• 出雞：${quantityText(farm.shipment)}`);
    if (farm.feed) lines.push(`• 飼料：${quantityText(farm.feed)}`);
    if (farm.water) lines.push(`• 飲水：${quantityText(farm.water)}`);
    for (const abnormal of farm.abnormal) lines.push(`• ${abnormal}`);
  }
  if (snapshot.pendingCandidates.length) {
    lines.push("", `⚠️ 待確認資訊：${snapshot.pendingCandidates.length}筆`);
    for (const candidate of snapshot.pendingCandidates) {
      const clue = candidate.caretakerText ? `｜${candidate.caretakerText}` : "";
      const farm = candidate.farmText ? `｜${candidate.farmText}` : "｜雞場待確認";
      lines.push(`• ${candidate.itemText}${clue}${farm}（${candidate.state}）`);
    }
  }
  lines.push("", "如內容正確，不需回覆。如需修改，可直接說明要更正的內容。");
  return lines.join("\n");
}

function reviewId(organizationId: string, groupId: string, localDate: string): string {
  const safe = `${organizationId}-${groupId}-${localDate}`.replace(/[^A-Za-z0-9_-]/gu, "_");
  return `daily-review-${safe.slice(0, 180)}`;
}

interface StoredDailyReview {
  id: string;
  localDate: string;
  payloadJson: string;
  contextExpiresAt: string;
  deliveryStatus: "pending" | "sending" | "sent" | "failed";
  deliveryLeaseUntil: string | null;
}

async function loadOrCreateReview(
  env: DailyReviewEnv,
  organizationId: string,
  groupId: string,
  now: Date,
): Promise<StoredDailyReview> {
  const window = dailyReviewWindow(now);
  const id = reviewId(organizationId, groupId, window.localDate);
  const existing = await env.DB.prepare(
    `SELECT id, local_date AS localDate, payload_json AS payloadJson,
            context_expires_at AS contextExpiresAt, delivery_status AS deliveryStatus,
            delivery_lease_until AS deliveryLeaseUntil
       FROM daily_operations_reviews
      WHERE id = ? LIMIT 1`,
  ).bind(id).first<StoredDailyReview>();
  if (existing) return existing;
  const snapshot = await buildDailyReviewSnapshot(env, organizationId, groupId, now);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO daily_operations_reviews
      (id, organization_id, line_group_id, review_type, local_date, snapshot_cutoff,
       payload_json, context_expires_at, delivery_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  ).bind(
    id,
    organizationId,
    groupId,
    DAILY_REVIEW_TYPE,
    window.localDate,
    window.cutoffAt,
    JSON.stringify(snapshot),
    window.nextStartAt,
  ).run();
  const created = await env.DB.prepare(
    `SELECT id, local_date AS localDate, payload_json AS payloadJson,
            context_expires_at AS contextExpiresAt, delivery_status AS deliveryStatus,
            delivery_lease_until AS deliveryLeaseUntil
       FROM daily_operations_reviews
      WHERE id = ? LIMIT 1`,
  ).bind(id).first<StoredDailyReview>();
  if (!created) throw new Error("daily_review_row_not_created");
  return created;
}

function deliveryOwner(): string {
  return `daily-review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function deliverDailyReviewForGroup(
  env: DailyReviewEnv,
  group: DailyReviewGroup,
  now: Date,
  push: (groupId: string, message: LineReplyMessage) => Promise<void>,
): Promise<DailyReviewDeliveryResult> {
  const row = await loadOrCreateReview(env, group.organizationId, group.groupId, now);
  if (row.deliveryStatus === "sent") {
    return { status: "already_sent", reviewId: row.id, localDate: row.localDate };
  }
  const owner = deliveryOwner();
  const leaseUntil = new Date(now.getTime() + DELIVERY_LEASE_MS).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE daily_operations_reviews
        SET delivery_status = 'sending', delivery_owner = ?, delivery_lease_until = ?,
            delivery_attempts = delivery_attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND (delivery_status IN ('pending', 'failed')
             OR (delivery_status = 'sending' AND delivery_lease_until IS NOT NULL AND delivery_lease_until <= ?))`,
  ).bind(owner, leaseUntil, row.id, now.toISOString()).run();
  if (!claimed.meta.changes) {
    const current = await env.DB.prepare(
      `SELECT delivery_status AS deliveryStatus FROM daily_operations_reviews WHERE id = ?`,
    ).bind(row.id).first<{ deliveryStatus: StoredDailyReview["deliveryStatus"] }>();
    return {
      status: current?.deliveryStatus === "sent" ? "already_sent" : "busy",
      reviewId: row.id,
      localDate: row.localDate,
    };
  }
  let snapshot: DailyReviewSnapshot;
  try {
    snapshot = JSON.parse(row.payloadJson) as DailyReviewSnapshot;
  } catch {
    await env.DB.prepare(
      `UPDATE daily_operations_reviews SET delivery_status = 'failed', delivery_owner = NULL,
              delivery_lease_until = NULL, last_error_class = 'invalid_payload_json', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND delivery_owner = ?`,
    ).bind(row.id, owner).run();
    return { status: "failed", reviewId: row.id, localDate: row.localDate, errorClass: "invalid_payload_json" };
  }
  const message = buildTextMessage(formatDailyReview(snapshot), buildDailyReviewFollowupReplies());
  try {
    await push(group.groupId, message);
    await env.DB.prepare(
      `UPDATE daily_operations_reviews
          SET delivery_status = 'sent', delivery_owner = NULL, delivery_lease_until = NULL,
              sent_at = CURRENT_TIMESTAMP, last_error_class = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND delivery_owner = ?`,
    ).bind(row.id, owner).run();
    return { status: "sent", reviewId: row.id, localDate: row.localDate, message };
  } catch (error) {
    const errorClass = error instanceof Error && error.name ? error.name : "line_delivery_failure";
    await env.DB.prepare(
      `UPDATE daily_operations_reviews
          SET delivery_status = 'failed', delivery_owner = NULL, delivery_lease_until = NULL,
              last_error_class = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND delivery_owner = ?`,
    ).bind(errorClass, row.id, owner).run();
    return { status: "failed", reviewId: row.id, localDate: row.localDate, errorClass };
  }
}

export async function runDailyOperationsReview(
  env: DailyReviewEnv,
  now: Date,
  push: (groupId: string, message: LineReplyMessage) => Promise<void>,
  targetGroupId?: string,
): Promise<DailyReviewRunResult> {
  const groups = (await listDailyReviewGroups(env)).filter((group) => !targetGroupId || group.groupId === targetGroupId);
  const results: DailyReviewDeliveryResult[] = [];
  for (const group of groups) results.push(await deliverDailyReviewForGroup(env, group, now, push));
  return {
    groups: groups.length,
    sent: results.filter((result) => result.status === "sent").length,
    alreadySent: results.filter((result) => result.status === "already_sent").length,
    busy: results.filter((result) => result.status === "busy").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export async function activateDailyReviewContext(
  env: DailyReviewEnv,
  organizationId: string,
  groupId: string,
  userId: string,
  reviewIdValue: string,
  now: Date,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id, payload_json AS payloadJson, context_expires_at AS contextExpiresAt
       FROM daily_operations_reviews
      WHERE ${reviewIdValue ? "id = ? AND" : "1 = 1 AND"} organization_id = ? AND line_group_id = ? AND delivery_status = 'sent'
      ${reviewIdValue ? "" : "ORDER BY local_date DESC"}
      LIMIT 1`,
  ).bind(...(reviewIdValue ? [reviewIdValue, organizationId, groupId] : [organizationId, groupId])).first<{ id: string; payloadJson: string; contextExpiresAt: string }>();
  if (!row || Date.parse(row.contextExpiresAt) <= now.getTime()) return false;
  await env.DB.prepare(
    `INSERT INTO daily_review_contexts
      (id, review_id, organization_id, line_group_id, line_user_id, context_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
       review_id = excluded.review_id, context_json = excluded.context_json,
       expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    `daily-review-context-${groupId}-${userId}`.slice(0, 180),
    row.id,
    organizationId,
    groupId,
    userId,
    row.payloadJson,
    row.contextExpiresAt,
  ).run();
  return true;
}

export async function hasActiveDailyReviewContext(
  env: DailyReviewEnv,
  groupId: string,
  userId: string,
  now: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS present FROM daily_review_contexts
      WHERE line_group_id = ? AND line_user_id = ? AND expires_at > ? LIMIT 1`,
  ).bind(groupId, userId, now).first<{ present: number }>();
  return Boolean(row?.present);
}

/**
 * A sent review is a short-lived group-level correction affordance. This
 * read-only probe lets the Interaction Gate admit a correction-like plain
 * message before a per-user context row exists; the row is materialized
 * lazily by handleCommand for the actual follow-up lifecycle.
 */
export async function hasRecentSentDailyReview(
  env: DailyReviewEnv,
  groupId: string,
  now: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS present FROM daily_operations_reviews
      WHERE line_group_id = ? AND delivery_status = 'sent' AND context_expires_at > ?
      ORDER BY local_date DESC
      LIMIT 1`,
  ).bind(groupId, now).first<{ present: number }>();
  return Boolean(row?.present);
}

export async function loadActiveDailyReviewContext(
  env: DailyReviewEnv,
  groupId: string,
  userId: string,
  now: string,
): Promise<{ reviewId: string; payloadJson: string } | null> {
  const row = await env.DB.prepare(
    `SELECT review_id AS reviewId, context_json AS payloadJson
       FROM daily_review_contexts
      WHERE line_group_id = ? AND line_user_id = ? AND expires_at > ?
      LIMIT 1`,
  ).bind(groupId, userId, now).first<{ reviewId: string; payloadJson: string }>();
  return row ?? null;
}

export async function clearDailyReviewContext(env: DailyReviewEnv, groupId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM daily_review_contexts WHERE line_group_id = ? AND line_user_id = ?`,
  ).bind(groupId, userId).run();
}

export function dailyReviewCronExpression(): string {
  return DAILY_REVIEW_CRON;
}
