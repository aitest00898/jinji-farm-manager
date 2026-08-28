import { normalize } from "./core";
import { parseAbnormalTiming, type AbnormalTiming } from "./abnormal";
import { FarmResolver, normalizedFarmKey, type FarmCandidate } from "./farm-resolver";
import { normalizedHouseName, taipeiDate } from "./master-data";

/**
 * Small, deliberately bounded LINE quick-record layer. It is not a second
 * workflow engine: it only owns the five-minute conversational context and
 * the bundle/item linkage needed to make corrections auditable.
 */
export interface QuickRecordEnv {
  DB: D1Database;
  EVENTS?: { send(message: unknown): Promise<unknown> };
}

export interface QuickLineEvent {
  timestamp?: number;
  source?: { userId?: string; groupId?: string; roomId?: string };
  message?: { text?: string };
}

export interface QuickFarm {
  id: string;
  name: string;
  environment: "production" | "test";
  structureMode: "whole_farm" | "multi_house";
  active: number;
}

export interface QuickAlias {
  farmId: string;
  alias: string;
  normalizedAlias: string;
  status: "trusted" | "candidate" | "disabled";
}

type QuickItemType = "operational" | "abnormal";
type QuickOperationalIntent = "mortality" | "cull" | "feed" | "water" | "shipment";

export interface QuickItemDraft {
  itemType: QuickItemType;
  intent: QuickOperationalIntent | null;
  rawText: string;
  quantity: number | null;
  unit: "隻" | "kg" | "L" | "包" | null;
  timing: AbnormalTiming;
  houseText: string | null;
  originalText: string;
}

interface FarmMention {
  start: number;
  end: number;
  farm: QuickFarm;
  text: string;
}

interface QuickSegment {
  farmId: string | null;
  farmText: string | null;
  farmCandidates: FarmCandidate[];
  requiresConfirmation: boolean;
  items: QuickItemDraft[];
  houseText: string | null;
  suffixAssignment: boolean;
}

interface QuickSessionRow {
  id: string;
  lineGroupId: string;
  lineUserId: string;
  organizationId: string;
  activeFarmId: string | null;
  activeHouseId: string | null;
  activeFlockId: string | null;
  pendingItemsJson: string;
  pendingFarmCandidatesJson: string;
  pendingStatus: "active" | "waiting_farm" | "waiting_house" | "closed";
  lastConfirmedBundleId: string | null;
  lastActivityAt: string;
  expiresAt: string;
}

interface PendingItem extends QuickItemDraft {
  pendingId: string;
}

interface Scope {
  farm: QuickFarm;
  houseId: string | null;
  houseName: string | null;
  flockId: string | null;
  houseCandidates: Array<{ id: string; name: string }>;
  invalidHouse: string | null;
}

interface CommittedItem {
  item: QuickItemDraft;
  eventId: string;
  itemId: string;
}

interface CommittedBundle {
  id: string;
  farm: QuickFarm;
  houseName: string | null;
  items: CommittedItem[];
}

const QUICK_WINDOW_MS = 5 * 60 * 1000;
const FARMISH_MIN_LENGTH = 2;
const NUMBER_TOKEN = "(?:\\d+(?:\\.\\d+)?|[零〇一二兩两三四五六七八九十百千萬万]+)";
const HOUSE_TOKEN = "[\\p{L}\\p{N}_-]{1,18}\\s*舍";
const EVENT_RE = new RegExp(`(?:今天|今日|昨天|昨晚|早上|上午|下午|晚上)?(?:死亡|死了|死|掛了|掛|死掉)\\s*(${NUMBER_TOKEN})\\s*(隻|只|羽)?`, "giu");
const CULL_RE = new RegExp(`(?:淘汰|抓掉|抓走)\\s*(${NUMBER_TOKEN})\\s*(隻|只|羽)?`, "giu");
const FEED_RE = new RegExp(`(?:飼料|饲料|料)(?:用了?|使用了?|進料)?\\s*(${NUMBER_TOKEN})\\s*(kg|公斤|千克|包)?`, "giu");
const WATER_RE = new RegExp(`(?:飲水|饮水|用水|喝水|水)\\s*(${NUMBER_TOKEN})\\s*(L|公升|噸|吨)?`, "giu");
const SHIPMENT_RE = new RegExp(`(?:出雞|出鸡|出欄|出栏)(?:了)?\\s*(${NUMBER_TOKEN})\\s*(隻|只|羽)?`, "giu");

// These are intentionally concrete observation phrases. An arbitrary chat
// sentence is never promoted to an abnormal ledger row by this module.
const ABNORMAL_TERMS = [
  "氣溫太高", "气温太高", "風扇沒動", "风扇没动", "水簾壞掉", "水帘坏掉",
  "屋頂被風吹壞", "屋顶被风吹坏", "飼料晚一天到", "饲料晚一天到",
  "咳嗽", "喘", "臭腳", "臭脚", "白冠", "跛腳", "跛脚", "拉肚子", "腹瀉", "腹泻",
  "沒精神", "没精神", "雞怪怪", "鸡怪怪", "停電", "停电", "斷電", "断电",
  "漏水", "水簾", "水帘", "風扇", "风扇", "屋頂", "屋顶", "缺料", "缺水",
  "精神差", "採食下降", "飲水異常", "氣溫太低", "气温太低", "通風不良", "通风不良",
  "異味", "積水", "風災", "淹水", "屋頂受損", "屋顶受损", "設施受損", "设施受损",
  "風扇異常", "风扇异常", "水簾異常", "水帘异常", "飲水線異常", "饮水线异常",
  "飼料線異常", "饲料线异常", "發電機異常", "发电机异常", "照明異常",
  "異常", "异常", "故障", "壞掉", "坏掉",
];
const ABNORMAL_RE = new RegExp(ABNORMAL_TERMS.sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "gu");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/gu, "");
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function chineseNumber(value: string): number | null {
  if (/^\d+(?:\.\d+)?$/u.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of value) {
    if (char in digits) number = digits[char];
    else if (char === "十") { section += (number || 1) * 10; number = 0; }
    else if (char === "百") { section += (number || 1) * 100; number = 0; }
    else if (char === "千") { section += (number || 1) * 1000; number = 0; }
    else if (char === "萬" || char === "万") { section = (section + number) * 10000; number = 0; }
    else return null;
  }
  const result = section + number;
  return result > 0 && Number.isFinite(result) ? result : null;
}

function unitFor(intent: QuickOperationalIntent, rawUnit: string | undefined, quantity: number): { quantity: number; unit: "隻" | "kg" | "L" | "包" } | null {
  const unit = rawUnit?.toLowerCase();
  if (intent === "feed") {
    // A bag has no safe kg conversion without a feed-pack master. Preserve
    // the unit instead of inventing a weight.
    if (unit === "包") return { quantity, unit: "包" };
    if (unit && !/^(?:kg|公斤|千克)$/iu.test(unit)) return null;
    return { quantity, unit: "kg" };
  }
  if (intent === "water") {
    if (unit && /^(?:噸|吨)$/iu.test(unit)) return { quantity: quantity * 1000, unit: "L" };
    if (unit && !/^(?:L|公升)$/iu.test(unit)) return null;
    return { quantity, unit: "L" };
  }
  if (unit && !/^(?:隻|只|羽)$/iu.test(unit)) return null;
  return Number.isInteger(quantity) && quantity > 0 ? { quantity, unit: "隻" } : null;
}

function itemTiming(text: string, receivedAt: string): AbnormalTiming {
  return parseAbnormalTiming(text, receivedAt);
}

function makeItem(
  itemType: QuickItemType,
  intent: QuickOperationalIntent | null,
  rawText: string,
  quantity: number | null,
  unit: "隻" | "kg" | "L" | "包" | null,
  houseText: string | null,
  originalText: string,
  receivedAt: string,
): QuickItemDraft {
  return { itemType, intent, rawText: rawText.trim(), quantity, unit, timing: itemTiming(originalText, receivedAt), houseText, originalText };
}

function parseQuantity(value: string): number | null {
  const parsed = chineseNumber(value);
  return parsed !== null && parsed > 0 && parsed <= 1_000_000_000 ? parsed : null;
}

function parseHouse(text: string): string | null {
  return text.match(new RegExp(`(${HOUSE_TOKEN})`, "u"))?.[1]?.replace(/\s+/gu, "") ?? null;
}

function removeAll(text: string, regex: RegExp, make: (match: RegExpExecArray) => QuickItemDraft | null, items: QuickItemDraft[], houseText: string | null, receivedAt: string): string {
  regex.lastIndex = 0;
  let remaining = text;
  const matches: Array<{ start: number; end: number; item: QuickItemDraft }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const item = make(match);
    if (item) matches.push({ start: match.index, end: match.index + match[0].length, item });
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const found = matches[index];
    remaining = `${remaining.slice(0, found.start)} ${remaining.slice(found.end)}`;
    items.push(found.item);
  }
  return remaining;
}

function parseItems(text: string, receivedAt: string): { items: QuickItemDraft[]; remainder: string; houseText: string | null } {
  let remainder = normalize(text);
  const houseText = parseHouse(remainder);
  const items: QuickItemDraft[] = [];
  const original = normalize(text);
  remainder = removeAll(remainder, EVENT_RE, (match) => {
    const before = remainder.slice(0, match.index);
    if (/(?:沒有|沒|不是|非)\s*$/u.test(before)) return null;
    const quantity = parseQuantity(match[1]);
    const parsed = quantity === null ? null : unitFor("mortality", match[2], quantity);
    return parsed ? makeItem("operational", "mortality", `死亡 ${parsed.quantity}`, parsed.quantity, parsed.unit, houseText, original, receivedAt) : null;
  }, items, houseText, receivedAt);
  remainder = removeAll(remainder, CULL_RE, (match) => {
    const quantity = parseQuantity(match[1]);
    const parsed = quantity === null ? null : unitFor("cull", match[2], quantity);
    return parsed ? makeItem("operational", "cull", `淘汰 ${parsed.quantity}`, parsed.quantity, parsed.unit, houseText, original, receivedAt) : null;
  }, items, houseText, receivedAt);
  remainder = removeAll(remainder, FEED_RE, (match) => {
    const quantity = parseQuantity(match[1]);
    const parsed = quantity === null ? null : unitFor("feed", match[2], quantity);
    return parsed ? makeItem("operational", "feed", `飼料 ${parsed.quantity}`, parsed.quantity, parsed.unit, houseText, original, receivedAt) : null;
  }, items, houseText, receivedAt);
  remainder = removeAll(remainder, WATER_RE, (match) => {
    const quantity = parseQuantity(match[1]);
    const parsed = quantity === null ? null : unitFor("water", match[2], quantity);
    return parsed ? makeItem("operational", "water", `飲水 ${parsed.quantity}`, parsed.quantity, parsed.unit, houseText, original, receivedAt) : null;
  }, items, houseText, receivedAt);
  remainder = removeAll(remainder, SHIPMENT_RE, (match) => {
    const quantity = parseQuantity(match[1]);
    const parsed = quantity === null ? null : unitFor("shipment", match[2], quantity);
    return parsed ? makeItem("operational", "shipment", `出雞 ${parsed.quantity}`, parsed.quantity, parsed.unit, houseText, original, receivedAt) : null;
  }, items, houseText, receivedAt);
  remainder = remainder.replace(new RegExp(HOUSE_TOKEN, "gu"), " ").replace(/(?:今天|今日|昨天|昨晚|早上|上午|下午|晚上|傍晚|半夜|深夜|的|那邊|那边|這邊|这边|有|又|了|雞|鸡|隻|只|。|，|,|：|:)/gu, " ");
  ABNORMAL_RE.lastIndex = 0;
  const abnormalMatches = [...remainder.matchAll(ABNORMAL_RE)];
  for (let index = abnormalMatches.length - 1; index >= 0; index -= 1) {
    const match = abnormalMatches[index];
    const raw = match[0];
    items.push(makeItem("abnormal", null, raw, null, null, houseText, original, receivedAt));
    if (typeof match.index === "number") remainder = `${remainder.slice(0, match.index)} ${remainder.slice(match.index + raw.length)}`;
  }
  // A short remaining phrase can be an observation when it contains an
  // explicit anomaly cue; ordinary chat is intentionally left untouched.
  const residual = remainder.replace(/[\s、，,。！？?!]/gu, "").trim();
  if (!items.length && residual && /(?:異常|异常|不對|不对|太熱|太热|怪|壞|坏|故障|咳|臭|冠|停電|停电|漏水|缺水|缺料)/u.test(residual)) {
    items.push(makeItem("abnormal", null, residual, null, null, houseText, original, receivedAt));
  }
  // Each extractor works independently, so append order is not necessarily
  // the user's sentence order. Rebuild the order from the original text;
  // this matters for a grouped confirmation and for correction targeting.
  const compactOriginal = compact(original);
  const searchFromByText = new Map<string, number>();
  const ordered = items.map((item, index) => {
    const key = compact(item.rawText);
    const searchFrom = searchFromByText.get(key) ?? 0;
    const position = compactOriginal.indexOf(key, searchFrom);
    if (position >= 0) searchFromByText.set(key, position + key.length);
    return { item, index, position: position >= 0 ? position : Number.MAX_SAFE_INTEGER };
  }).sort((left, right) => left.position - right.position || left.index - right.index).map((entry) => entry.item);
  return { items: ordered, remainder: residual, houseText };
}

export function parseQuickItems(text: string, receivedAt: string): { items: QuickItemDraft[]; remainder: string; houseText: string | null } {
  return parseItems(text, receivedAt);
}

// Kept as a stable test-facing alias. Ambient salvage uses the same parser so
// a model formatting problem cannot make an otherwise obvious record look like
// a system failure or create a second operational parser.
export function parseQuickItemsForTest(text: string, receivedAt: string): { items: QuickItemDraft[]; remainder: string; houseText: string | null } {
  return parseQuickItems(text, receivedAt);
}

export function parseQuickSegmentsForTest(text: string, receivedAt: string, farms: QuickFarm[], aliases: QuickAlias[] = []) {
  return buildSegments(text, receivedAt, farms, aliases);
}

async function loadFarmData(env: QuickRecordEnv, organizationId: string): Promise<{ farms: QuickFarm[]; aliases: QuickAlias[] }> {
  const farms = await env.DB.prepare(
    `SELECT id, name, active, environment, farm_structure_mode AS structureMode
       FROM farms WHERE organization_id = ? ORDER BY name, id`,
  ).bind(organizationId).all<QuickFarm>();
  const aliases = await env.DB.prepare(
    `SELECT a.farm_id AS farmId, a.alias, a.normalized_alias AS normalizedAlias, a.status
       FROM farm_aliases a JOIN farms f ON f.id = a.farm_id
      WHERE f.organization_id = ? ORDER BY LENGTH(a.alias) DESC, a.id`,
  ).bind(organizationId).all<QuickAlias>();
  return { farms: farms.results.filter((farm) => farm.active === 1), aliases: aliases.results };
}

function findFarmMentions(text: string, farms: QuickFarm[], aliases: QuickAlias[]): FarmMention[] {
  const normalized = compact(text);
  const candidates: FarmMention[] = [];
  for (const farm of farms) {
    const needle = compact(farm.name);
    const start = normalized.indexOf(needle);
    if (needle.length >= FARMISH_MIN_LENGTH && start >= 0) candidates.push({ start, end: start + needle.length, farm, text: farm.name });
  }
  for (const alias of aliases.filter((item) => item.status === "trusted")) {
    const farm = farms.find((item) => item.id === alias.farmId);
    const needle = compact(alias.alias);
    const start = normalized.indexOf(needle);
    if (farm && needle.length >= FARMISH_MIN_LENGTH && start >= 0) candidates.push({ start, end: start + needle.length, farm, text: alias.alias });
  }
  candidates.sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.start - right.start);
  const selected: FarmMention[] = [];
  for (const candidate of candidates) {
    if (selected.some((item) => candidate.start < item.end && candidate.end > item.start)) continue;
    selected.push(candidate);
  }
  return selected.sort((left, right) => left.start - right.start);
}

function buildSegments(text: string, receivedAt: string, farms: QuickFarm[], aliases: QuickAlias[]): { segments: QuickSegment[]; farmOnly: QuickFarm | null; unresolvedFarmText: string | null } {
  const normalized = compact(text);
  const mentions = findFarmMentions(text, farms, aliases);
  if (!mentions.length) {
    const parsed = parseItems(normalized, receivedAt);
    const residual = parsed.remainder;
    if (parsed.items.length && residual.length >= FARMISH_MIN_LENGTH && /[\p{Script=Han}A-Za-z]/u.test(residual)) {
      const resolver = new FarmResolver(farms, aliases.map((alias) => ({ ...alias, aliasType: "learned" as const })));
      const resolution = resolver.resolve(residual);
      if (resolution.kind === "candidates") {
        return { segments: [{ farmId: null, farmText: residual, farmCandidates: resolution.candidates, requiresConfirmation: true, items: parsed.items, houseText: parsed.houseText, suffixAssignment: false }], farmOnly: null, unresolvedFarmText: residual };
      }
      if (resolution.kind === "direct" && resolution.farm) {
        return { segments: [{ farmId: resolution.farm.id, farmText: residual, farmCandidates: [], requiresConfirmation: true, items: parsed.items, houseText: parsed.houseText, suffixAssignment: false }], farmOnly: null, unresolvedFarmText: residual };
      }
    }
    return { segments: [{ farmId: null, farmText: null, farmCandidates: [], requiresConfirmation: false, items: parsed.items, houseText: parsed.houseText, suffixAssignment: false }], farmOnly: null, unresolvedFarmText: null };
  }
  const segments: QuickSegment[] = mentions.map((mention) => ({
    farmId: mention.farm.id,
    farmText: mention.text,
    farmCandidates: [],
    requiresConfirmation: false,
    items: [],
    houseText: null,
    suffixAssignment: false,
  }));

  // A farm mention following unresolved items is a suffix assignment. Once
  // that segment closes, text after the mention belongs to a new unresolved
  // segment until another farm boundary appears. This is what makes:
  //   死亡3 / AAA場 / 咳嗽 / 白冠 / BBB場
  // resolve to AAA:死亡3 and BBB:咳嗽、白冠.
  for (let index = 0; index < mentions.length; index += 1) {
    const start = index === 0 ? 0 : mentions[index - 1].end;
    const parsed = parseItems(normalized.slice(start, mentions[index].start), receivedAt);
    if (!parsed.items.length) continue;
    if (index === 0 || segments[index - 1].suffixAssignment) {
      segments[index].items.push(...parsed.items);
      segments[index].houseText = parsed.houseText;
      segments[index].suffixAssignment = true;
    } else {
      segments[index - 1].items.push(...parsed.items);
      segments[index - 1].houseText ??= parsed.houseText;
    }
  }

  const tail = parseItems(normalized.slice(mentions[mentions.length - 1].end), receivedAt);
  if (tail.items.length) {
    const last = segments[segments.length - 1];
    if (last.suffixAssignment) {
      segments.push({ farmId: null, farmText: null, farmCandidates: [], requiresConfirmation: false, items: tail.items, houseText: tail.houseText, suffixAssignment: false });
    } else {
      last.items.push(...tail.items);
      last.houseText ??= tail.houseText;
    }
  }
  const lastSegment = segments[segments.length - 1];
  const farmOnly = lastSegment.farmId && !lastSegment.items.length ? mentions[mentions.length - 1].farm : null;
  return { segments, farmOnly, unresolvedFarmText: null };
}

function sessionId(groupId: string, userId: string): string {
  return `quick-session-${groupId}-${userId}`;
}

async function getSession(env: QuickRecordEnv, groupId: string, userId: string, organizationId: string, now: string): Promise<QuickSessionRow> {
  const row = await env.DB.prepare(
    `SELECT id, line_group_id AS lineGroupId, line_user_id AS lineUserId,
            organization_id AS organizationId, active_farm_id AS activeFarmId,
            active_house_id AS activeHouseId, active_flock_id AS activeFlockId,
            pending_items_json AS pendingItemsJson, pending_farm_candidates_json AS pendingFarmCandidatesJson,
            pending_status AS pendingStatus, last_confirmed_bundle_id AS lastConfirmedBundleId,
            last_activity_at AS lastActivityAt, expires_at AS expiresAt
       FROM quick_record_sessions WHERE line_group_id = ? AND line_user_id = ? LIMIT 1`,
  ).bind(groupId, userId).first<QuickSessionRow>();
  if (row) {
    if (row.organizationId === organizationId && Date.parse(row.expiresAt) > Date.parse(now)) return row;
    await env.DB.prepare(
      `UPDATE quick_record_sessions
          SET organization_id = ?, active_farm_id = NULL, active_house_id = NULL, active_flock_id = NULL,
              pending_items_json = '[]', pending_farm_candidates_json = '[]', pending_status = 'closed',
              last_confirmed_bundle_id = NULL, last_activity_at = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    ).bind(organizationId, now, new Date(Date.parse(now) + QUICK_WINDOW_MS).toISOString(), row.id).run();
    return { ...row, organizationId, activeFarmId: null, activeHouseId: null, activeFlockId: null, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "closed", lastConfirmedBundleId: null, lastActivityAt: now, expiresAt: new Date(Date.parse(now) + QUICK_WINDOW_MS).toISOString() };
  }
  const created: QuickSessionRow = { id: sessionId(groupId, userId), lineGroupId: groupId, lineUserId: userId, organizationId, activeFarmId: null, activeHouseId: null, activeFlockId: null, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "closed", lastConfirmedBundleId: null, lastActivityAt: now, expiresAt: new Date(Date.parse(now) + QUICK_WINDOW_MS).toISOString() };
  await env.DB.prepare(
    `INSERT INTO quick_record_sessions
      (id, line_group_id, line_user_id, organization_id, last_activity_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(created.id, groupId, userId, organizationId, now, created.expiresAt).run();
  return created;
}

function pendingItems(row: QuickSessionRow): PendingItem[] {
  return parseJson<PendingItem[]>(row.pendingItemsJson, []);
}

function candidateList(candidates: FarmCandidate[]): string {
  return candidates.map((candidate, index) => `${index + 1}. ${candidate.environment === "test" ? "🧪 " : ""}${candidate.farmName}`).join("\n");
}

function itemLabel(item: QuickItemDraft): string {
  if (item.itemType === "abnormal") return item.rawText;
  const eventLabel: Record<string, string> = { mortality: "死亡", cull: "淘汰", feed: "飼料", water: "飲水", shipment: "出雞" };
  return `${eventLabel[item.intent ?? ""] ?? item.intent ?? "事件"} ${item.quantity ?? 0}${item.unit === "隻" ? "隻" : item.unit ? ` ${item.unit}` : ""}`;
}

function farmDisplay(farm: QuickFarm): string {
  return `${farm.environment === "test" ? "🧪 " : "🐔 "}${farm.name}`;
}

function pendingReply(items: QuickItemDraft[], candidates: FarmCandidate[], confirmation = false): string {
  const header = confirmation && candidates.length === 1
    ? `🐔 你指的是「${candidates[0].farmName}」嗎？`
    : "請問以下紀錄要記在哪個場次呢？";
  return [header, ...items.map((item) => `• ${itemLabel(item)}`), candidateList(candidates), confirmation && candidates.length === 1 ? "請回覆：是 / 否" : "請回覆名稱或編號。"].join("\n");
}

function farmOnlyIsQuery(text: string): boolean {
  const value = compact(text);
  return /(?:今天|今日|昨天|昨晚|目前|現在|现在|存欄|存栏|日齡|日龄|盈虧|盈亏|持股|股份|列表|清單|清单|近期|天氣|天气|哪|死亡(?:數|数|多少|幾隻|几只)?$|出雞|出鸡)/u.test(value);
}

async function resolveScope(env: QuickRecordEnv, organizationId: string, farm: QuickFarm, requestedHouse: string | null, fallbackHouseId: string | null): Promise<Scope> {
  const houses = await env.DB.prepare(
    `SELECT id, name, normalized_name AS normalizedName
       FROM houses WHERE farm_id = ? AND active = 1 ORDER BY normalized_name, id`,
  ).bind(farm.id).all<{ id: string; name: string; normalizedName: string }>();
  let house: { id: string; name: string } | null = null;
  if (requestedHouse) {
    const wanted = normalizedHouseName(requestedHouse);
    house = houses.results.find((row) => normalizedHouseName(row.name) === wanted) ?? null;
    if (!house) return { farm, houseId: null, houseName: null, flockId: null, houseCandidates: [], invalidHouse: requestedHouse };
  } else if (fallbackHouseId) {
    house = houses.results.find((row) => row.id === fallbackHouseId) ?? null;
  }
  if (!house && houses.results.length > 1) return { farm, houseId: null, houseName: null, flockId: null, houseCandidates: houses.results.map((row) => ({ id: row.id, name: row.name })), invalidHouse: null };
  if (!house && houses.results.length === 1) house = houses.results[0];
  let flockId: string | null = null;
  if (house) {
    const flocks = await env.DB.prepare(
      `SELECT id FROM flocks WHERE farm_id = ? AND house_id = ? AND status = 'active' ORDER BY id`,
    ).bind(farm.id, house.id).all<{ id: string }>();
    if (flocks.results.length === 1) flockId = flocks.results[0].id;
  }
  return { farm, houseId: house?.id ?? null, houseName: house?.name ?? null, flockId, houseCandidates: [], invalidHouse: null };
}

function auditStatement(env: QuickRecordEnv, organizationId: string, actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown, reason: string | null, requestId: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
       before_json, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, 'line', 'line_user', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`audit-quick-${requestId}-${entityId}-${action}`, organizationId, actorId, action, entityType, entityId, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), JSON.stringify(["status", "quantity", "rawText", "farmId", "houseId", "flockId"]), reason, requestId);
}

function stablePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_:.=-]/gu, "_");
}

async function commitBundles(
  env: QuickRecordEnv,
  event: QuickLineEvent,
  eventId: string,
  groupId: string,
  userId: string,
  organizationId: string,
  bundles: Array<{ farm: QuickFarm; scope: Scope; items: QuickItemDraft[]; bundleIndex: number; existingBundleId?: string | null }>,
): Promise<CommittedBundle[]> {
  const statements: D1PreparedStatement[] = [];
  const committed: CommittedBundle[] = [];
  const requestId = stablePart(eventId);
  for (const bundle of bundles) {
    const bundleId = bundle.existingBundleId ?? `quick-bundle-${requestId}-${bundle.bundleIndex}`;
    const openedAt = bundle.items[0]?.timing.reportedAt ?? new Date().toISOString();
    const lastEventAt = bundle.items[bundle.items.length - 1]?.timing.reportedAt ?? openedAt;
    let itemIndexOffset = 0;
    if (bundle.existingBundleId) {
      const lastItem = await env.DB.prepare(
        `SELECT COALESCE(MAX(item_index) + 1, 0) AS nextIndex
           FROM quick_record_items WHERE bundle_id = ? AND status <> 'reversed'`,
      ).bind(bundle.existingBundleId).first<{ nextIndex: number }>();
      itemIndexOffset = Number(lastItem?.nextIndex ?? 0);
      statements.push(env.DB.prepare(
        `UPDATE quick_record_bundles
            SET last_event_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status <> 'reversed'`,
      ).bind(lastEventAt, bundle.existingBundleId));
    } else {
      statements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO quick_record_bundles
          (id, line_group_id, line_user_id, organization_id, farm_id, house_id, flock_id,
           status, opened_at, last_event_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      ).bind(bundleId, groupId, userId, organizationId, bundle.farm.id, bundle.scope.houseId, bundle.scope.flockId, openedAt, lastEventAt, new Date().toISOString()));
    }
    const committedItems: CommittedItem[] = [];
    bundle.items.forEach((item, itemIndex) => {
      const childEventId = `${requestId}:quick:${bundle.bundleIndex}:${itemIndex}`;
      const itemId = `quick-item-${childEventId}`;
      const sourceEventId = childEventId;
      const rawMessage = item.originalText;
      if (item.itemType === "operational") {
        const operationalId = `operational-${childEventId}`;
        statements.push(env.DB.prepare(
          `INSERT OR IGNORE INTO operational_events
            (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
             event_date, house, house_id, flock_id, raw_message, raw_farm_text, note,
             pending_action_id, source_event_id, quick_bundle_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        ).bind(operationalId, organizationId, bundle.farm.id, groupId, userId, item.intent, item.quantity, item.unit, item.timing.occurredDate, bundle.scope.houseName, bundle.scope.houseId, bundle.scope.flockId, rawMessage, bundle.farm.name, sourceEventId, bundleId));
        statements.push(auditStatement(env, organizationId, userId, "create", "operational_event", operationalId, undefined, { id: operationalId, farmId: bundle.farm.id, houseId: bundle.scope.houseId, flockId: bundle.scope.flockId, intent: item.intent, quantity: item.quantity, unit: item.unit, occurredAt: item.timing.occurredAt, bundleId }, null, sourceEventId));
        statements.push(env.DB.prepare(
          `INSERT OR IGNORE INTO quick_record_items
            (id, bundle_id, item_index, item_type, intent, raw_text, quantity, unit,
             occurred_at, occurred_date, operational_event_id, status, source_event_id)
           VALUES (?, ?, ?, 'operational', ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        ).bind(itemId, bundleId, itemIndexOffset + itemIndex, item.intent, item.rawText, item.quantity, item.unit, item.timing.occurredAt ?? item.timing.reportedAt, item.timing.occurredDate, operationalId, sourceEventId));
        committedItems.push({ item, eventId: operationalId, itemId });
      } else {
        const abnormalId = `abnormal-${childEventId}`;
        statements.push(env.DB.prepare(
          `INSERT OR IGNORE INTO abnormal_events
            (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
             approximate_period, reported_at, raw_text, source, actor_id, weather_date,
             status, source_event_id, quick_bundle_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', ?, ?, 'active', ?, ?)`,
        ).bind(abnormalId, organizationId, bundle.farm.id, bundle.scope.houseId, bundle.scope.flockId, item.timing.occurredAt, item.timing.occurredDate, item.timing.approximatePeriod, item.timing.reportedAt, item.rawText, userId, item.timing.weatherDate, sourceEventId, bundleId));
        statements.push(auditStatement(env, organizationId, userId, "create", "abnormal_event", abnormalId, undefined, { id: abnormalId, farmId: bundle.farm.id, houseId: bundle.scope.houseId, flockId: bundle.scope.flockId, rawText: item.rawText, occurredAt: item.timing.occurredAt, bundleId }, null, sourceEventId));
        statements.push(env.DB.prepare(
          `INSERT OR IGNORE INTO quick_record_items
            (id, bundle_id, item_index, item_type, raw_text, occurred_at, occurred_date,
             abnormal_event_id, status, source_event_id)
           VALUES (?, ?, ?, 'abnormal', ?, ?, ?, ?, 'active', ?)`,
        ).bind(itemId, bundleId, itemIndexOffset + itemIndex, item.rawText, item.timing.occurredAt ?? item.timing.reportedAt, item.timing.occurredDate, abnormalId, sourceEventId));
        committedItems.push({ item, eventId: abnormalId, itemId });
      }
    });
    statements.push(env.DB.prepare(
      `INSERT INTO line_operational_contexts
        (line_group_id, line_user_id, organization_id, farm_id, house_id, flock_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
         organization_id = excluded.organization_id, farm_id = excluded.farm_id,
         house_id = excluded.house_id, flock_id = excluded.flock_id, updated_at = excluded.updated_at`,
    ).bind(groupId, userId, organizationId, bundle.farm.id, bundle.scope.houseId, bundle.scope.flockId, new Date().toISOString()));
    committed.push({ id: bundleId, farm: bundle.farm, houseName: bundle.scope.houseName, items: committedItems });
  }
  if (statements.length) await env.DB.batch(statements);
  for (const bundle of committed) {
    for (const item of bundle.items) {
      if (item.item.itemType === "abnormal" && env.EVENTS) {
        try { await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: item.eventId }); } catch { /* raw record already committed */ }
      }
    }
  }
  return committed;
}

async function saveSession(env: QuickRecordEnv, row: QuickSessionRow, patch: Partial<QuickSessionRow>, now: string): Promise<void> {
  const next = { ...row, ...patch, lastActivityAt: now, expiresAt: new Date(Date.parse(now) + QUICK_WINDOW_MS).toISOString() };
  await env.DB.prepare(
    `UPDATE quick_record_sessions
        SET active_farm_id = ?, active_house_id = ?, active_flock_id = ?,
            pending_items_json = ?, pending_farm_candidates_json = ?, pending_status = ?,
            last_confirmed_bundle_id = ?, last_activity_at = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).bind(next.activeFarmId, next.activeHouseId, next.activeFlockId, next.pendingItemsJson, next.pendingFarmCandidatesJson, next.pendingStatus, next.lastConfirmedBundleId, now, next.expiresAt, row.id).run();
}

async function sessionAudit(env: QuickRecordEnv, organizationId: string, userId: string, groupId: string, action: string, before: unknown, after: unknown, rawText: string, requestId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
       before_json, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, 'line', 'line_user', ?, ?, 'quick_record_session', ?, ?, ?, ?, ?, ?)`,
  ).bind(`audit-quick-session-${requestId}-${action}`, organizationId, userId, action, `quick-session-${groupId}-${userId}`, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), JSON.stringify(["pendingItems", "farmId", "houseId", "quantity", "rawText"]), rawText, requestId).run();
}

function selectionFarm(text: string, candidates: FarmCandidate[]): FarmCandidate | null {
  const normalized = compact(text);
  const number = /^\d+$/u.exec(normalized);
  if (number) return candidates[Number(number[0]) - 1] ?? null;
  return candidates.find((candidate) => normalizedFarmKey(candidate.farmName) === normalizedFarmKey(normalized)) ?? null;
}

function candidateRecords(farms: QuickFarm[]): FarmCandidate[] {
  return farms.map((farm) => ({ farmId: farm.id, farmName: farm.name, score: 1, reason: "substring", environment: farm.environment }));
}

function quickFarmChoices(candidates: FarmCandidate[], farms: QuickFarm[]): QuickFarm[] {
  return candidates
    .map((candidate) => farms.find((farm) => farm.id === candidate.farmId))
    .filter((farm): farm is QuickFarm => Boolean(farm));
}

function pendingFromItems(items: QuickItemDraft[]): PendingItem[] {
  return items.map((item, index) => ({ ...item, pendingId: `pending-item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}` }));
}

function toDraft(item: PendingItem): QuickItemDraft {
  const { pendingId: _pendingId, ...draft } = item;
  return draft;
}

function groupReply(bundles: CommittedBundle[]): string {
  if (bundles.length === 1) {
    const bundle = bundles[0];
    return [`✅ 已紀錄至 ${farmDisplay(bundle.farm)}${bundle.houseName ? `｜${bundle.houseName}` : ""}`, ...bundle.items.map((item) => `• ${itemLabel(item.item)}`)].join("\n");
  }
  return ["✅ 已完成紀錄", ...bundles.map((bundle, index) => [`${index + 1}. ${farmDisplay(bundle.farm)}${bundle.houseName ? `｜${bundle.houseName}` : ""}`, ...bundle.items.map((item) => `   • ${itemLabel(item.item)}`)].join("\n"))].join("\n\n");
}

async function commitForFarm(env: QuickRecordEnv, event: QuickLineEvent, eventId: string, groupId: string, userId: string, organizationId: string, farm: QuickFarm, items: QuickItemDraft[], requestedHouse: string | null, fallbackHouseId: string | null, bundleIndex: number, existingBundleId: string | null = null): Promise<{ bundle: CommittedBundle | null; reply: string | null; scope: Scope }> {
  const scope = await resolveScope(env, organizationId, farm, requestedHouse, fallbackHouseId);
  if (scope.invalidHouse) return { bundle: null, reply: `⚠️ 找不到 ${scope.invalidHouse}，這組紀錄沒有寫入。`, scope };
  if (scope.houseCandidates.length) return { bundle: null, reply: `這組紀錄要記在哪一舍？\n${scope.houseCandidates.map((house, index) => `${index + 1}. ${house.name}`).join("\n")}\n請回覆舍別名稱或編號。`, scope };
  const [bundle] = await commitBundles(env, event, eventId, groupId, userId, organizationId, [{ farm, scope, items, bundleIndex, existingBundleId }]);
  return { bundle, reply: null, scope };
}

export interface QuickHandleResult {
  handled: boolean;
  reply?: string;
  quickReplyFarms?: QuickFarm[];
  quickReplyHouses?: Array<{ id: string; name: string }>;
  quickReplyHouseFarm?: QuickFarm;
}

export async function quickRecordHasPending(env: QuickRecordEnv, groupId: string, userId: string, now = new Date().toISOString()): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS present
       FROM quick_record_sessions
      WHERE line_group_id = ? AND line_user_id = ?
        AND pending_status IN ('waiting_farm', 'waiting_house')
        AND expires_at > ?
      LIMIT 1`,
  ).bind(groupId, userId, now).first<{ present: number }>();
  return Boolean(row?.present);
}

/**
 * Returns whether this exact group/user still owns a live quick-record
 * context. The group is deliberately part of the key so one person's wake
 * state can never make another member's ordinary chat active.
 */
export async function quickRecordHasActiveContext(env: QuickRecordEnv, groupId: string, userId: string, now = new Date().toISOString()): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS present
       FROM quick_record_sessions
      WHERE line_group_id = ? AND line_user_id = ?
        AND pending_status IN ('active', 'waiting_farm', 'waiting_house')
        AND expires_at > ?
      LIMIT 1`,
  ).bind(groupId, userId, now).first<{ present: number }>();
  return Boolean(row?.present);
}

/** Handles quick records and their narrow Farm/House selection responses. */
export async function handleQuickRecordInput(
  env: QuickRecordEnv,
  event: QuickLineEvent,
  text: string,
  eventId: string,
  groupId: string,
  organizationId: string,
  accountName: string,
): Promise<QuickHandleResult> {
  const userId = event.source?.userId;
  if (!userId) return { handled: false };
  const receivedAt = new Date(event.timestamp ?? Date.now()).toISOString();
  const { farms, aliases } = await loadFarmData(env, organizationId);
  const session = await getSession(env, groupId, userId, organizationId, receivedAt);
  const parsed = buildSegments(text, receivedAt, farms, aliases);
  const hasItems = parsed.segments.some((segment) => segment.items.length > 0);
  const currentPending = pendingItems(session);
  const candidates = parseJson<FarmCandidate[]>(session.pendingFarmCandidatesJson, []);

  // A farm-only response is the backward assignment form, or a selection for
  // a pending bundle. It never becomes a sticky context when it closes a
  // suffix segment.
  // A bare canonical farm is a context switch, but a farm-prefixed query
  // such as「金雞測試場今天死亡」must continue to the deterministic query
  // router instead of being consumed as a context-only message.
  if (parsed.farmOnly && !farmOnlyIsQuery(text)) {
    if (session.pendingStatus === "waiting_farm" && currentPending.length) {
      const result = await commitForFarm(env, event, eventId, groupId, userId, organizationId, parsed.farmOnly, currentPending.map(toDraft), null, null, 0);
      if (result.reply) return { handled: true, reply: result.reply };
      await saveSession(env, session, { activeFarmId: null, activeHouseId: null, activeFlockId: null, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "closed", lastConfirmedBundleId: result.bundle?.id ?? null }, receivedAt);
      if (result.bundle) return { handled: true, reply: groupReply([result.bundle]) };
    }
    await saveSession(env, session, { activeFarmId: parsed.farmOnly.id, activeHouseId: null, activeFlockId: null, lastConfirmedBundleId: null, pendingStatus: "active" }, receivedAt);
    return { handled: true, reply: `✅ 已切換至 ${farmDisplay(parsed.farmOnly)}，接下來的紀錄會沿用這個場次（5 分鐘內）。` };
  }

  // Pending house selection is intentionally narrow: ordinary event text is
  // appended to the same bundle instead of being rejected as an option.
  if (session.pendingStatus === "waiting_house" && currentPending.length) {
    const farm = farms.find((row) => row.id === session.activeFarmId) ?? null;
    const scope = farm ? await resolveScope(env, organizationId, farm, null, session.activeHouseId) : null;
    if (farm && scope?.houseCandidates.length) {
      const houseNumber = /^\d+$/u.exec(compact(text));
      const selected = houseNumber ? scope.houseCandidates[Number(houseNumber[0]) - 1] : scope.houseCandidates.find((house) => normalizedHouseName(house.name) === normalizedHouseName(compact(text)));
      if (selected) {
        const committed = await commitForFarm(env, event, eventId, groupId, userId, organizationId, farm, currentPending.map(toDraft), selected.name, null, 0);
        if (committed.reply) return { handled: true, reply: committed.reply };
        await saveSession(env, session, { activeFarmId: farm.id, activeHouseId: committed.scope.houseId, activeFlockId: committed.scope.flockId, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "active", lastConfirmedBundleId: committed.bundle?.id ?? null }, receivedAt);
        return { handled: true, reply: committed.bundle ? groupReply([committed.bundle]) : `✅ 已完成 ${farmDisplay(farm)} 紀錄。` };
      }
    }
  }

  if (!hasItems && session.pendingStatus === "waiting_farm" && currentPending.length) {
    const selected = selectionFarm(text, candidates);
    if (selected) {
      const result = await commitForFarm(env, event, eventId, groupId, userId, organizationId, farms.find((farm) => farm.id === selected.farmId) ?? farms[0], currentPending.map(toDraft), null, null, 0);
      if (result.reply) return { handled: true, reply: result.reply };
      await saveSession(env, session, { activeFarmId: null, activeHouseId: null, activeFlockId: null, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "closed", lastConfirmedBundleId: result.bundle?.id ?? null }, receivedAt);
      return { handled: true, reply: result.bundle ? groupReply([result.bundle]) : "目前無法完成這組紀錄。" };
    }
    if (/^(?:是|好|確認|確定)$/iu.test(compact(text)) && candidates.length === 1) {
      const selectedCandidate = candidates[0];
      const result = await commitForFarm(env, event, eventId, groupId, userId, organizationId, farms.find((farm) => farm.id === selectedCandidate.farmId) ?? farms[0], currentPending.map(toDraft), null, null, 0);
      if (result.reply) return { handled: true, reply: result.reply };
      await saveSession(env, session, { activeFarmId: null, activeHouseId: null, activeFlockId: null, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "closed", lastConfirmedBundleId: result.bundle?.id ?? null }, receivedAt);
      return { handled: true, reply: result.bundle ? groupReply([result.bundle]) : "目前無法完成這組紀錄。" };
    }
  }

  if (!hasItems && session.pendingStatus === "waiting_house" && currentPending.length) {
    return { handled: true, reply: "請回覆舍別名稱或編號；新的異常文字可以直接繼續輸入，我會加入同一組紀錄。" };
  }

  if (!hasItems) {
    // Do not consume ordinary commands or chat. A known farm fragment is
    // handled above; all other routing remains with the existing parser.
    return { handled: false };
  }

  // If a complete explicit farm event arrives while an older unknown-farm
  // bundle is waiting, the explicit farm is a new boundary. Keep the old
  // bundle audit-visible but do not attach it to the new farm.
  const explicitSegments = parsed.segments.filter((segment) => segment.items.length && (segment.farmId || segment.farmCandidates.length || segment.requiresConfirmation));
  const supersedesPending = (session.pendingStatus === "waiting_farm" || session.pendingStatus === "waiting_house")
    && currentPending.length
    && explicitSegments.length > 0;
  if (supersedesPending) {
    await saveSession(env, session, { pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "closed", activeFarmId: null, activeHouseId: null, activeFlockId: null }, receivedAt);
    await sessionAudit(env, organizationId, userId, groupId, "pending_superseded", currentPending, explicitSegments, text, eventId);
  }

  const bundles: CommittedBundle[] = [];
  // When the user is still choosing a farm/house, a new observation without
  // a boundary is appended to the existing bundle. A complete farm-bearing
  // event was handled above as a superseding command.
  const pending: QuickItemDraft[] = supersedesPending
    ? []
    : (session.pendingStatus === "waiting_farm" || session.pendingStatus === "waiting_house")
      ? currentPending.map(toDraft)
      : [];
  let lastFarmId: string | null = session.activeFarmId;
  let lastHouseId: string | null = session.activeHouseId;
  let lastFlockId: string | null = session.activeFlockId;
  for (const segment of parsed.segments) {
    if (!segment.items.length) continue;
    if (segment.farmCandidates.length || segment.requiresConfirmation) {
      const candidateSet = segment.farmCandidates.length ? segment.farmCandidates : candidateRecords(farms);
      const allItems = [...pending, ...segment.items];
      const pendingRows = pendingFromItems(allItems);
      await saveSession(env, session, { pendingItemsJson: JSON.stringify(pendingRows), pendingFarmCandidatesJson: JSON.stringify(candidateSet), pendingStatus: "waiting_farm", activeFarmId: null, activeHouseId: null, activeFlockId: null }, receivedAt);
      await sessionAudit(env, organizationId, userId, groupId, "pending_record", undefined, { items: allItems, candidates: candidateSet }, text, eventId);
      return {
        handled: true,
        reply: pendingReply(allItems, candidateSet, segment.requiresConfirmation),
        quickReplyFarms: segment.requiresConfirmation ? undefined : quickFarmChoices(candidateSet, farms),
      };
    }
    const farm = farms.find((row) => row.id === (segment.farmId ?? session.activeFarmId)) ?? null;
    if (!farm) {
      pending.push(...segment.items);
      continue;
    }
    const itemsForSegment = !segment.farmId && session.pendingStatus === "waiting_house" && pending.length
      ? pending.splice(0, pending.length).concat(segment.items)
      : segment.items;
    const canAppendToSessionBundle = !segment.farmId
      && session.pendingStatus === "active"
      && session.activeFarmId === farm.id
      && Boolean(session.lastConfirmedBundleId)
      && !segment.houseText;
    const result = await commitForFarm(env, event, eventId, groupId, userId, organizationId, farm, itemsForSegment, segment.houseText, session.activeHouseId, bundles.length, canAppendToSessionBundle ? session.lastConfirmedBundleId : null);
    if (result.reply) {
      if (result.scope.houseCandidates.length) {
        const pendingRows = pendingFromItems(itemsForSegment);
        await saveSession(env, session, { pendingItemsJson: JSON.stringify(pendingRows), pendingFarmCandidatesJson: "[]", pendingStatus: "waiting_house", activeFarmId: farm.id, activeHouseId: null, activeFlockId: null }, receivedAt);
        return {
          handled: true,
          reply: result.reply,
          quickReplyHouses: result.scope.houseCandidates,
          quickReplyHouseFarm: farm,
        };
      }
      return { handled: true, reply: result.reply };
    }
    if (result.bundle) {
      bundles.push(result.bundle);
      lastFarmId = segment.suffixAssignment ? null : farm.id;
      lastHouseId = segment.suffixAssignment ? null : result.scope.houseId;
      lastFlockId = segment.suffixAssignment ? null : result.scope.flockId;
    }
  }
  if (pending.length) {
    const pendingRows = pendingFromItems(pending);
    const candidateSet = candidateRecords(farms);
    await saveSession(env, session, { pendingItemsJson: JSON.stringify(pendingRows), pendingFarmCandidatesJson: JSON.stringify(candidateSet), pendingStatus: "waiting_farm", activeFarmId: null, activeHouseId: null, activeFlockId: null }, receivedAt);
    return { handled: true, reply: pendingReply(pending, candidateSet), quickReplyFarms: quickFarmChoices(candidateSet, farms) };
  }
  if (!bundles.length) return { handled: false };
  await saveSession(env, session, { activeFarmId: lastFarmId, activeHouseId: lastHouseId, activeFlockId: lastFlockId, pendingItemsJson: "[]", pendingFarmCandidatesJson: "[]", pendingStatus: "active", lastConfirmedBundleId: bundles[bundles.length - 1].id }, receivedAt);
  return { handled: true, reply: groupReply(bundles) };
}

/**
 * Handles a server-generated Farm Quick Reply. The button is only a
 * convenience for the existing waiting_farm flow; ownership, expiry and the
 * candidate list are reloaded from D1 before any write.
 */
export async function handlePendingFarmPostback(
  env: QuickRecordEnv,
  event: QuickLineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  farmId: string,
): Promise<QuickHandleResult> {
  const userId = event.source?.userId;
  if (!userId || !farmId) return { handled: true, reply: "這組紀錄已完成或已逾時，請重新輸入紀錄。" };
  const receivedAt = new Date(event.timestamp ?? Date.now()).toISOString();
  const { farms } = await loadFarmData(env, organizationId);
  const session = await getSession(env, groupId, userId, organizationId, receivedAt);
  const currentPending = pendingItems(session);
  const candidates = parseJson<FarmCandidate[]>(session.pendingFarmCandidatesJson, []);
  const farm = farms.find((row) => row.id === farmId);
  const allowed = session.pendingStatus === "waiting_farm"
    && currentPending.length > 0
    && Date.parse(session.expiresAt) > Date.parse(receivedAt)
    && candidates.some((candidate) => candidate.farmId === farmId)
    && Boolean(farm);
  if (!allowed || !farm) {
    return { handled: true, reply: "這組紀錄已完成或已逾時，請重新輸入紀錄。" };
  }

  const result = await commitForFarm(env, event, eventId, groupId, userId, organizationId, farm, currentPending.map(toDraft), null, null, 0);
  if (result.reply) {
    if (result.scope.houseCandidates.length) {
      const pendingRows = pendingFromItems(currentPending.map(toDraft));
      await saveSession(env, session, {
        pendingItemsJson: JSON.stringify(pendingRows),
        pendingFarmCandidatesJson: "[]",
        pendingStatus: "waiting_house",
        activeFarmId: farm.id,
        activeHouseId: null,
        activeFlockId: null,
      }, receivedAt);
      return {
        handled: true,
        reply: result.reply,
        quickReplyHouses: result.scope.houseCandidates,
        quickReplyHouseFarm: farm,
      };
    }
    return { handled: true, reply: result.reply };
  }
  await saveSession(env, session, {
    activeFarmId: farm.id,
    activeHouseId: result.scope.houseId,
    activeFlockId: result.scope.flockId,
    pendingItemsJson: "[]",
    pendingFarmCandidatesJson: "[]",
    pendingStatus: "active",
    lastConfirmedBundleId: result.bundle?.id ?? null,
  }, receivedAt);
  return { handled: true, reply: result.bundle ? groupReply([result.bundle]) : "目前無法完成這組紀錄。" };
}

/** Handles a server-generated House Quick Reply for an existing waiting bundle. */
export async function handlePendingHousePostback(
  env: QuickRecordEnv,
  event: QuickLineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  farmId: string,
  houseId: string,
): Promise<QuickHandleResult> {
  const userId = event.source?.userId;
  if (!userId || !farmId || !houseId) return { handled: true, reply: "這組紀錄已完成或已逾時，請重新輸入紀錄。" };
  const receivedAt = new Date(event.timestamp ?? Date.now()).toISOString();
  const { farms } = await loadFarmData(env, organizationId);
  const session = await getSession(env, groupId, userId, organizationId, receivedAt);
  const currentPending = pendingItems(session);
  const farm = farms.find((row) => row.id === farmId) ?? null;
  if (!farm || session.pendingStatus !== "waiting_house" || session.activeFarmId !== farmId || !currentPending.length || Date.parse(session.expiresAt) <= Date.parse(receivedAt)) {
    return { handled: true, reply: "這組紀錄已完成或已逾時，請重新輸入紀錄。" };
  }
  const scope = await resolveScope(env, organizationId, farm, null, null);
  const selectedHouse = scope.houseCandidates.find((house) => house.id === houseId);
  if (!selectedHouse) return { handled: true, reply: "這個雞舍選項已失效，請重新輸入紀錄。" };
  const result = await commitForFarm(env, event, eventId, groupId, userId, organizationId, farm, currentPending.map(toDraft), selectedHouse.name, null, 0);
  if (result.reply) return { handled: true, reply: result.reply };
  await saveSession(env, session, {
    activeFarmId: farm.id,
    activeHouseId: result.scope.houseId,
    activeFlockId: result.scope.flockId,
    pendingItemsJson: "[]",
    pendingFarmCandidatesJson: "[]",
    pendingStatus: "active",
    lastConfirmedBundleId: result.bundle?.id ?? null,
  }, receivedAt);
  return { handled: true, reply: result.bundle ? groupReply([result.bundle]) : "目前無法完成這組紀錄。" };
}

export function quickRecordLooksRelevant(text: string): boolean {
  const normalized = compact(text);
  return /(?:死亡|死|掛|淘汰|抓掉|飼料|饲料|飲水|饮水|用水|出雞|出鸡|出欄|出栏|咳嗽|臭腳|臭脚|白冠|氣溫太高|气温太高|氣溫太低|气温太低|停電|停电|水簾|水帘|風扇|风扇|屋頂|屋顶|故障|異常|异常|缺料|缺水|精神差|採食下降|飲水異常|通風不良|通风不良|異味|積水|風災|淹水|受損)/u.test(normalized);
}

export function quickRecordTimingForTest(text: string, receivedAt: string): AbnormalTiming {
  return parseAbnormalTiming(text, receivedAt);
}
