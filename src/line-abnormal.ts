import { botName, normalize } from "./core";
import {
  formatAbnormalReply,
  insertAbnormalEvent,
  parseAbnormalTiming,
  type AbnormalScope,
} from "./abnormal";
import { canonicalFarmKey, FarmResolver, normalizedFarmKey, type FarmCandidate, type FarmRecord } from "./farm-resolver";
import { normalizedHouseName } from "./master-data";

export interface LineAbnormalEnv {
  DB: D1Database;
  EVENTS?: { send(message: unknown): Promise<unknown> };
}

export interface LineAbnormalEvent {
  type: string;
  timestamp?: number;
  source?: { userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string };
}

export interface LineAbnormalState {
  farmId: string | null;
}

interface FarmRow extends FarmRecord {
  id: string;
  name: string;
  environment: "production" | "test";
  structureMode: "whole_farm" | "multi_house";
}

interface HouseRow {
  id: string;
  farmId: string;
  name: string;
  normalizedName: string;
  active: number;
}

interface ContextRow {
  farmId: string;
  houseId: string | null;
  flockId: string | null;
}

interface AbnormalPendingRow {
  id: string;
  lineGroupId: string;
  lineUserId: string;
  organizationId: string;
  rawText: string;
  reportedAt: string;
  occurredAt: string | null;
  occurredDate: string;
  approximatePeriod: "morning" | "afternoon" | "evening" | "night" | null;
  farmId: string | null;
  houseId: string | null;
  candidateFarmsJson: string;
  candidateHousesJson: string;
  status: "waiting_farm" | "waiting_house" | "completed" | "cancelled" | "expired";
  expiresAt: string;
  sourceEventId: string;
}

interface TargetFarm {
  explicit: boolean;
  farmId: string | null;
  candidates: FarmCandidate[];
  rawFarmText: string | null;
}

interface TargetScope {
  scope: AbnormalScope | null;
  houseCandidates: Array<{ id: string; name: string }>;
  invalidHouseText: string | null;
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const HOUSE_PATTERN = /([\p{L}\p{N}_-]{1,18}\s*舍)/u;
const PERIOD_WORDS = /(?:今天|今日|昨天|昨晚|昨天下午|昨天下午|早上|上午|下午|晚上|傍晚|半夜|深夜|夜間|夜间)/gu;
const CONTEXT_WORDS = /(?:的|那邊|那边|這邊|这边|那裡|那里|這裡|这里|有|發生|发生|開始|开始|又|了|雞|鸡|隻|只|目前|好像|似乎|今天|今日|昨天|昨晚|早上|上午|下午|晚上|傍晚|半夜|深夜)/gu;
const ABNORMAL_WORDS = /(?:咳嗽|咳|喘|臭腳|臭脚|跛腳|跛脚|拉肚子|腹瀉|腹泻|不吃|沒精神|没精神|怪怪|異常|异常|故障|壞掉|坏掉|壞|坏|沒動|没动|停電|停电|斷電|断电|漏水|破掉|受損|受损|風吹|淹水|倒塌|水簾|水帘|風扇|风扇|屋頂|屋顶|飼料|饲料|缺料|缺水)/gu;

function compact(value: string): string {
  return canonicalFarmKey(value).replace(/\s+/gu, "");
}

function farmLabel(farm: Pick<FarmRow, "name" | "environment">): string {
  return `${farm.environment === "test" ? "🧪 " : ""}${farm.name}`;
}

function candidateList(candidates: FarmCandidate[]): string {
  return candidates.map((candidate, index) => `${index + 1}. ${candidate.environment === "test" ? "🧪 " : ""}${candidate.farmName}`).join("\n");
}

function houseList(candidates: Array<{ id: string; name: string }>): string {
  return candidates.map((candidate, index) => `${index + 1}. ${candidate.name}`).join("\n");
}

function parseCandidates(value: string): FarmCandidate[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FarmCandidate => {
      if (typeof item !== "object" || item === null) return false;
      const row = item as Record<string, unknown>;
      return typeof row.farmId === "string" && typeof row.farmName === "string";
    });
  } catch {
    return [];
  }
}

function parseHouseCandidates(value: string): Array<{ id: string; name: string }> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is { id: string; name: string } => {
      if (typeof item !== "object" || item === null) return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === "string" && typeof row.name === "string";
    });
  } catch {
    return [];
  }
}

async function loadFarms(env: LineAbnormalEnv, organizationId: string): Promise<{ farms: FarmRow[]; aliases: Array<{ farmId: string; alias: string; normalizedAlias: string; aliasType: "manual" | "short_name" | "homophone" | "learned"; status: "trusted" | "candidate" | "disabled" }> }> {
  const farms = await env.DB.prepare(
    `SELECT id, name, active, environment, site_name AS siteName,
            farm_structure_mode AS structureMode, note, version
       FROM farms WHERE organization_id = ? ORDER BY id`,
  ).bind(organizationId).all<FarmRow>();
  const aliases = await env.DB.prepare(
    `SELECT a.farm_id AS farmId, a.alias,
            a.normalized_alias AS normalizedAlias, a.alias_type AS aliasType, a.status
       FROM farm_aliases a JOIN farms f ON f.id = a.farm_id
      WHERE f.organization_id = ? ORDER BY a.id`,
  ).bind(organizationId).all<{ farmId: string; alias: string; normalizedAlias: string; aliasType: "manual" | "short_name" | "homophone" | "learned"; status: "trusted" | "candidate" | "disabled" }>();
  return { farms: farms.results.filter((farm) => farm.active !== 0), aliases: aliases.results };
}

function cleanFarmFragment(rawText: string): string {
  let value = normalize(rawText).replace(HOUSE_PATTERN, " ");
  value = value.replace(PERIOD_WORDS, " ").replace(ABNORMAL_WORDS, " ").replace(CONTEXT_WORDS, " ");
  value = value.replace(/[0-9０-９]+/gu, " ").replace(/[：:，,。！？?!]/gu, " ");
  return value.replace(/\s+/gu, " ").trim();
}

async function contextFor(env: LineAbnormalEnv, groupId: string, userId: string, stateFarmId: string | null): Promise<ContextRow | null> {
  const context = await env.DB.prepare(
    `SELECT farm_id AS farmId, house_id AS houseId, flock_id AS flockId
       FROM line_operational_contexts
      WHERE line_group_id = ? AND line_user_id = ?
      LIMIT 1`,
  ).bind(groupId, userId).first<ContextRow>();
  if (context) return context;
  const recent = await env.DB.prepare(
    `SELECT farm_id AS farmId, house_id AS houseId, flock_id AS flockId
       FROM operational_events
      WHERE line_group_id = ? AND line_user_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).bind(groupId, userId).first<ContextRow>();
  if (recent) return recent;
  return stateFarmId ? { farmId: stateFarmId, houseId: null, flockId: null } : null;
}

async function targetFarm(env: LineAbnormalEnv, organizationId: string, rawText: string, groupId: string, userId: string, stateFarmId: string | null): Promise<TargetFarm> {
  const rows = await loadFarms(env, organizationId);
  const resolver = new FarmResolver(rows.farms, rows.aliases);
  const compactText = compact(rawText);
  const exact = rows.farms
    .filter((farm) => compactText.includes(compact(farm.name)))
    .sort((left, right) => compact(right.name).length - compact(left.name).length)[0];
  if (exact) return { explicit: true, farmId: exact.id, candidates: [], rawFarmText: exact.name };
  const trustedAliases = rows.aliases
    .filter((alias) => alias.status === "trusted")
    .sort((left, right) => compact(right.alias).length - compact(left.alias).length);
  const alias = trustedAliases.find((item) => compactText.includes(compact(item.alias)));
  if (alias) {
    const farm = rows.farms.find((item) => item.id === alias.farmId);
    if (farm) return { explicit: true, farmId: farm.id, candidates: [], rawFarmText: alias.alias };
  }
  const fragment = cleanFarmFragment(rawText);
  if (fragment.length >= 2 && /[\p{Script=Han}A-Za-z]/u.test(fragment)) {
    const resolution = resolver.resolve(fragment);
    if (resolution.kind === "direct" && resolution.farm) return { explicit: true, farmId: resolution.farm.id, candidates: [], rawFarmText: fragment };
    if (resolution.kind === "candidates") return { explicit: true, farmId: null, candidates: resolution.candidates, rawFarmText: fragment };
    return { explicit: true, farmId: null, candidates: resolver.allCandidates(), rawFarmText: fragment };
  }
  const context = await contextFor(env, groupId, userId, stateFarmId);
  return context ? { explicit: false, farmId: context.farmId, candidates: [], rawFarmText: null } : { explicit: false, farmId: null, candidates: resolver.allCandidates(), rawFarmText: null };
}

async function activeHouses(env: LineAbnormalEnv, farmId: string): Promise<HouseRow[]> {
  const rows = await env.DB.prepare(
    `SELECT h.id, h.farm_id AS farmId, h.name, h.normalized_name AS normalizedName, h.active
       FROM houses h WHERE h.farm_id = ? AND h.active = 1 ORDER BY h.normalized_name, h.id`,
  ).bind(farmId).all<HouseRow>();
  return rows.results;
}

function houseFromText(text: string, houses: HouseRow[]): { specified: boolean; house: HouseRow | null; invalid: string | null } {
  const token = text.match(HOUSE_PATTERN)?.[1] ?? null;
  if (!token) return { specified: false, house: null, invalid: null };
  const normalized = normalizedHouseName(token);
  const house = houses.find((item) => normalizedHouseName(item.name) === normalized || compact(item.name) === compact(token)) ?? null;
  return house ? { specified: true, house, invalid: null } : { specified: true, house: null, invalid: normalized };
}

async function scopeForFarm(env: LineAbnormalEnv, organizationId: string, farmId: string, rawText: string, contextHouseId: string | null, selectedHouseId: string | null = null): Promise<TargetScope> {
  const farm = await env.DB.prepare(
    `SELECT id, name, environment, farm_structure_mode AS structureMode
       FROM farms WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1`,
  ).bind(farmId, organizationId).first<FarmRow>();
  if (!farm) return { scope: null, houseCandidates: [], invalidHouseText: null };
  const houses = await activeHouses(env, farm.id);
  const parsedHouse = houseFromText(rawText, houses);
  if (parsedHouse.invalid) return { scope: null, houseCandidates: [], invalidHouseText: parsedHouse.invalid };
  let house = parsedHouse.house;
  if (!house && selectedHouseId) house = houses.find((item) => item.id === selectedHouseId) ?? null;
  if (!house && !parsedHouse.specified && contextHouseId) house = houses.find((item) => item.id === contextHouseId) ?? null;
  if (!house && houses.length > 1) return { scope: null, houseCandidates: houses.map((item) => ({ id: item.id, name: item.name })), invalidHouseText: null };
  if (!house && houses.length === 1) house = houses[0];
  let flockId: string | null = null;
  if (house) {
    const flocks = await env.DB.prepare(
      `SELECT id FROM flocks WHERE farm_id = ? AND house_id = ? AND status = 'active' ORDER BY id`,
    ).bind(farm.id, house.id).all<{ id: string }>();
    if (flocks.results.length === 1) flockId = flocks.results[0].id;
  }
  return {
    scope: {
      organizationId,
      farmId: farm.id,
      farmName: farm.name,
      farmEnvironment: farm.environment,
      structureMode: farm.structureMode ?? "whole_farm",
      houseId: house?.id ?? null,
      houseName: house?.name ?? null,
      flockId,
    },
    houseCandidates: [],
    invalidHouseText: null,
  };
}

function timingFromPending(row: AbnormalPendingRow): ReturnType<typeof parseAbnormalTiming> {
  return {
    reportedAt: row.reportedAt,
    occurredAt: row.occurredAt,
    occurredDate: row.occurredDate,
    approximatePeriod: row.approximatePeriod,
    weatherDate: row.occurredDate,
  };
}

function abnormalSuccessReply(rawText: string, timing: ReturnType<typeof parseAbnormalTiming>, scope: AbnormalScope): string {
  const base = formatAbnormalReply(rawText, timing);
  const separator = base.indexOf("｜");
  const when = separator >= 0 ? base.slice(separator + 1) : timing.occurredDate;
  let label = rawText.trim();
  // Farm/house names are user data; remove literal text without compiling it
  // as a regular expression (names may contain regex metacharacters).
  if (scope.farmName) label = label.split(scope.farmName).join("");
  if (scope.houseName) label = label.split(scope.houseName).join("");
  label = label.replace(PERIOD_WORDS, " ").replace(/\s+/gu, " ").replace(/^[的那邊那边這邊这边\s]+|[的\s]+$/gu, "").trim() || rawText.trim();
  return `✅ 已記錄\n${farmLabel({ name: scope.farmName, environment: scope.farmEnvironment })}${scope.houseName ? `｜${scope.houseName}` : ""}｜${label}｜${when}`;
}

async function createPending(env: LineAbnormalEnv, event: LineAbnormalEvent, eventId: string, groupId: string, organizationId: string, rawText: string, timing: ReturnType<typeof parseAbnormalTiming>, farmCandidates: FarmCandidate[], farmId: string | null, houseCandidates: Array<{ id: string; name: string }>, accountName: string): Promise<string> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return `${botName(accountName)}\n⚠️ 找不到操作者，沒有寫入。`;
  const existing = await env.DB.prepare(
    `SELECT id, status, candidate_farms_json AS candidateFarmsJson, candidate_houses_json AS candidateHousesJson
       FROM abnormal_pending_actions WHERE source_event_id = ? LIMIT 1`,
  ).bind(eventId).first<{ id: string; status: AbnormalPendingRow["status"]; candidateFarmsJson: string; candidateHousesJson: string }>();
  if (existing?.status === "completed") return `${botName(accountName)}\n✅ 上一筆異常紀錄已完成，沒有重複寫入。`;
  const status = farmId && houseCandidates.length ? "waiting_house" : "waiting_farm";
  const id = existing?.id ?? `abnormal-pending-${crypto.randomUUID()}`;
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO abnormal_pending_actions
        (id, line_group_id, line_user_id, organization_id, raw_text, reported_at,
         occurred_at, occurred_date, approximate_period, farm_id, candidate_farms_json,
         candidate_houses_json, status, expires_at, source_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, groupId, lineUserId, organizationId, rawText, timing.reportedAt,
      timing.occurredAt, timing.occurredDate, timing.approximatePeriod, farmId,
      JSON.stringify(farmCandidates), JSON.stringify(houseCandidates), status,
      new Date(Date.now() + PENDING_TTL_MS).toISOString(), eventId,
    ).run();
  }
  const farms = farmCandidates.length ? farmCandidates : parseCandidates(existing?.candidateFarmsJson ?? "[]");
  const houses = houseCandidates.length ? houseCandidates : parseHouseCandidates(existing?.candidateHousesJson ?? "[]");
  if (status === "waiting_house") {
    return `${botName(accountName)}\n要將「${rawText.trim()}」記錄在哪一舍？\n${houseList(houses)}\n請回覆舍別名稱或編號。`;
  }
  return [
    `${botName(accountName)} 要將「${rawText.trim()}」記錄在哪一個雞場？`,
    candidateList(farms),
    "請回覆名稱或編號。",
  ].join("\n");
}

async function expirePending(env: LineAbnormalEnv, groupId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE abnormal_pending_actions SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ? AND status IN ('waiting_farm', 'waiting_house') AND expires_at <= ?`,
  ).bind(groupId, userId, new Date().toISOString()).run();
}

async function latestPending(env: LineAbnormalEnv, groupId: string, userId: string): Promise<AbnormalPendingRow | null> {
  return env.DB.prepare(
    `SELECT id, line_group_id AS lineGroupId, line_user_id AS lineUserId,
            organization_id AS organizationId, raw_text AS rawText, reported_at AS reportedAt,
            occurred_at AS occurredAt, occurred_date AS occurredDate,
            approximate_period AS approximatePeriod, farm_id AS farmId, house_id AS houseId,
            candidate_farms_json AS candidateFarmsJson, candidate_houses_json AS candidateHousesJson,
            status, expires_at AS expiresAt, source_event_id AS sourceEventId
       FROM abnormal_pending_actions
      WHERE line_group_id = ? AND line_user_id = ? AND status IN ('waiting_farm', 'waiting_house')
      ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).bind(groupId, userId).first<AbnormalPendingRow>();
}

async function completePending(env: LineAbnormalEnv, event: LineAbnormalEvent, eventId: string, pending: AbnormalPendingRow, farmId: string, houseId: string | null, accountName: string): Promise<string> {
  if (pending.expiresAt <= new Date().toISOString()) {
    await env.DB.prepare(`UPDATE abnormal_pending_actions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('waiting_farm', 'waiting_house')`).bind(pending.id).run();
    return `${botName(accountName)}\n⚠️ 上一筆待確認異常已逾時，請重新輸入。`;
  }
  const scopeResult = await scopeForFarm(env, pending.organizationId, farmId, pending.rawText, null, houseId);
  if (scopeResult.invalidHouseText) return `${botName(accountName)}\n⚠️ 找不到 ${scopeResult.invalidHouseText} 雞舍，沒有寫入。`;
  if (!scopeResult.scope && scopeResult.houseCandidates.length) {
    await env.DB.prepare(`UPDATE abnormal_pending_actions SET farm_id = ?, candidate_houses_json = ?, status = 'waiting_house', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'waiting_farm'`).bind(farmId, JSON.stringify(scopeResult.houseCandidates), pending.id).run();
    return `${botName(accountName)}\n要將「${pending.rawText.trim()}」記錄在哪一舍？\n${houseList(scopeResult.houseCandidates)}\n請回覆舍別名稱或編號。`;
  }
  if (!scopeResult.scope) return `${botName(accountName)}\n⚠️ 找不到可用的雞場主檔，沒有寫入。`;
  const timing = timingFromPending(pending);
  const inserted = await insertAbnormalEvent(env, {
    ...scopeResult.scope,
    ...timing,
    rawText: pending.rawText,
    source: "line",
    actorId: pending.lineUserId,
    sourceEventId: eventId,
    lineGroupId: pending.lineGroupId,
    lineUserId: pending.lineUserId,
  });
  await env.DB.prepare(`UPDATE abnormal_pending_actions SET status = 'completed', farm_id = ?, house_id = ?, completed_event_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status IN ('waiting_farm', 'waiting_house')`).bind(farmId, scopeResult.scope.houseId, inserted.id, pending.id, pending.lineGroupId, pending.lineUserId).run();
  return abnormalSuccessReply(pending.rawText, timing, scopeResult.scope);
}

export async function handleLineAbnormalPendingInput(env: LineAbnormalEnv, event: LineAbnormalEvent, text: string, eventId: string, groupId: string, accountName: string): Promise<string | null> {
  const userId = event.source?.userId;
  if (!userId) return null;
  await expirePending(env, groupId, userId);
  const pending = await latestPending(env, groupId, userId);
  if (!pending) return null;
  const normalized = normalize(text);
  if (/^(?:取消|不要|算了)$/iu.test(normalized)) {
    await env.DB.prepare(`UPDATE abnormal_pending_actions SET status = 'cancelled', cancel_reason = 'user_cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status IN ('waiting_farm', 'waiting_house')`).bind(pending.id, groupId, userId).run();
    return `${botName(accountName)}\n✅ 已取消上一筆異常紀錄。`;
  }
  if (pending.status === "waiting_house") {
    const houses = parseHouseCandidates(pending.candidateHousesJson);
    const number = normalized.match(/^(\d+)$/u);
    const selected = number ? houses[Number(number[1]) - 1] : houses.find((item) => normalizedHouseName(item.name) === normalizedHouseName(normalized));
    if (!selected && /^(?:是|好|確認|確定)$/iu.test(normalized) && houses.length === 1) return completePending(env, event, eventId, pending, pending.farmId ?? "", houses[0].id, accountName);
    if (!selected) return `${botName(accountName)}\n請回覆舍別名稱或編號。\n${houseList(houses)}`;
    return completePending(env, event, eventId, pending, pending.farmId ?? "", selected.id, accountName);
  }
  const candidates = parseCandidates(pending.candidateFarmsJson);
  const number = normalized.match(/^(\d+)$/u);
  const selected = number ? candidates[Number(number[1]) - 1] : candidates.find((item) => normalizedFarmKey(item.farmName) === normalizedFarmKey(normalized));
  if (!selected && /^(?:是|好|確認|確定)$/iu.test(normalized) && candidates.length === 1) return completePending(env, event, eventId, pending, candidates[0].farmId, null, accountName);
  if (!selected) return `${botName(accountName)}\n請回覆雞場名稱或編號。\n${candidateList(candidates)}`;
  return completePending(env, event, eventId, pending, selected.farmId, null, accountName);
}

export async function handleLineAbnormalInput(env: LineAbnormalEnv, event: LineAbnormalEvent, rawText: string, eventId: string, groupId: string, organizationId: string, state: LineAbnormalState, accountName: string): Promise<string> {
  const userId = event.source?.userId;
  if (!userId) return `${botName(accountName)}\n⚠️ 找不到操作者，沒有寫入。`;
  const receivedAt = new Date(event.timestamp ?? Date.now()).toISOString();
  const timing = parseAbnormalTiming(rawText, receivedAt);
  const target = await targetFarm(env, organizationId, rawText, groupId, userId, state.farmId);
  if (!target.farmId) {
    return createPending(env, event, eventId, groupId, organizationId, rawText, timing, target.candidates, null, [], accountName);
  }
  const context = await contextFor(env, groupId, userId, state.farmId);
  const scopeResult = await scopeForFarm(env, organizationId, target.farmId, rawText, context?.farmId === target.farmId ? context.houseId : null);
  if (scopeResult.invalidHouseText) return `${botName(accountName)}\n⚠️ 找不到 ${scopeResult.invalidHouseText} 雞舍，沒有寫入。`;
  if (!scopeResult.scope && scopeResult.houseCandidates.length) {
    const farm = await env.DB.prepare(`SELECT name, environment FROM farms WHERE id = ? AND organization_id = ? LIMIT 1`).bind(target.farmId, organizationId).first<{ name: string; environment: "production" | "test" }>();
    return createPending(env, event, eventId, groupId, organizationId, rawText, timing, [{ farmId: target.farmId, farmName: farm?.name ?? target.rawFarmText ?? "雞場", score: 1, reason: "substring", environment: farm?.environment }], target.farmId, scopeResult.houseCandidates, accountName);
  }
  if (!scopeResult.scope) return `${botName(accountName)}\n⚠️ 找不到可用的雞場主檔，沒有寫入。`;
  const inserted = await insertAbnormalEvent(env, {
    ...scopeResult.scope,
    ...timing,
    rawText,
    source: "line",
    actorId: userId,
    sourceEventId: eventId,
    lineGroupId: groupId,
    lineUserId: userId,
  });
  return abnormalSuccessReply(rawText, timing, scopeResult.scope);
}
