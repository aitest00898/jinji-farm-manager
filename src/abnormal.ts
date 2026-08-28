import { taipeiDate } from "./master-data";

export const ABNORMAL_CATEGORIES = [
  "health",
  "equipment",
  "environment",
  "weather_disaster",
  "feed",
  "water",
  "biosecurity",
  "operation",
  "logistics",
  "structure",
  "system",
  "other",
] as const;

export type AbnormalCategory = (typeof ABNORMAL_CATEGORIES)[number];
export type ApproximatePeriod = "morning" | "afternoon" | "evening" | "night";

export interface AbnormalTiming {
  reportedAt: string;
  occurredAt: string | null;
  occurredDate: string;
  approximatePeriod: ApproximatePeriod | null;
  weatherDate: string;
}

export interface AbnormalClassification {
  category: AbnormalCategory;
  tags: string[];
  confidence: number;
}

export interface AbnormalScope {
  organizationId: string;
  farmId: string;
  farmName: string;
  farmEnvironment: "production" | "test";
  structureMode: "whole_farm" | "multi_house";
  houseId: string | null;
  houseName: string | null;
  flockId: string | null;
}

export interface AbnormalWriteInput extends AbnormalScope, AbnormalTiming {
  rawText: string;
  source: "line" | "web" | "system";
  actorId: string | null;
  sourceEventId: string;
  lineGroupId?: string | null;
  lineUserId?: string | null;
  correctionOfId?: string | null;
  reversalOfId?: string | null;
  quickBundleId?: string | null;
  status?: "active" | "reversal";
  reason?: string | null;
}

export interface AbnormalEnv {
  DB: D1Database;
  EVENTS?: { send(message: unknown): Promise<unknown> };
}

const MINIMAL_ABNORMAL_LANGUAGE = /(?:咳(?:嗽)?|喘|臭腳|臭脚|跛腳|跛脚|拉肚子|腹瀉|腹泻|不吃|沒精神|没精神|怪怪|異常|异常|故障|壞(?:掉)?|坏(?:掉)?|沒動|没动|停電|停电|斷電|断电|漏水|破掉|受損|受损|風吹|淹水|倒塌|水簾|水帘|風扇|风扇|屋頂|屋顶|飼料.+(?:晚|缺|沒到|没到)|(?:晚|延遲|延迟).+到|缺料|缺水)/u;
const QUESTION_LANGUAGE = /(?:怎麼辦|怎么办|如何|為什麼|为什么|可以嗎|可以吗|要不要|請問|请问|幫我|帮我|什麼藥|什么药|劑量|剂量|處方|处方)/u;
const COMMAND_LANGUAGE = /(?:今天死亡|目前存欄|現在存欄|雞場列表|各場持股|盈虧|新增.+場|封存.+場|新增雞舍|新增批次|幫助|help|ping)/iu;

function previousIsoDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function taipeiClock(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function periodFromText(value: string): ApproximatePeriod | null {
  if (/(?:早上|上午|清晨)/u.test(value)) return "morning";
  if (/(?:下午)/u.test(value)) return "afternoon";
  if (/(?:晚上|傍晚)/u.test(value)) return "evening";
  if (/(?:半夜|深夜|夜間|夜间)/u.test(value)) return "night";
  return null;
}

export function validateAbnormalRawText(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 2000
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

/**
 * Deliberately narrow recognition for a bare LINE message. Unknown chat is not
 * silently turned into a ledger row; phrases that clearly describe an anomaly
 * are. Classification happens only after the raw row exists.
 */
export function looksLikeMinimalAbnormalText(value: string): boolean {
  const text = value.normalize("NFKC").trim();
  if (!text || text.length > 500 || COMMAND_LANGUAGE.test(text) || QUESTION_LANGUAGE.test(text)) return false;
  return MINIMAL_ABNORMAL_LANGUAGE.test(text);
}

export function parseAbnormalTiming(rawText: string, receivedAt: string): AbnormalTiming {
  const received = Number.isFinite(Date.parse(receivedAt)) ? new Date(receivedAt).toISOString() : new Date().toISOString();
  const receivedDate = taipeiDate(new Date(received));
  const yesterday = /昨天/u.test(rawText);
  const period = periodFromText(rawText);
  const occurredDate = yesterday ? previousIsoDate(receivedDate) : receivedDate;
  const approximate = yesterday || period !== null;
  return {
    reportedAt: received,
    occurredAt: approximate ? null : received,
    occurredDate,
    approximatePeriod: period,
    weatherDate: occurredDate,
  };
}

export function periodLabel(period: ApproximatePeriod | null): string | null {
  if (period === "morning") return "早上";
  if (period === "afternoon") return "下午";
  if (period === "evening") return "晚上";
  if (period === "night") return "深夜";
  return null;
}

export function formatAbnormalReply(rawText: string, timing: AbnormalTiming): string {
  const when = timing.occurredAt
    ? taipeiClock(timing.occurredAt)
    : `${timing.occurredDate} ${periodLabel(timing.approximatePeriod) ?? "時間未指定"}`;
  return `✅ 已記錄\n${rawText.trim()}｜${when}`;
}

export function deterministicAbnormalClassification(rawText: string): AbnormalClassification | null {
  const text = rawText.normalize("NFKC");
  if (/(?:咳|喘|臭腳|臭脚|跛腳|跛脚|拉肚子|腹瀉|腹泻|不吃|沒精神|没精神|雞怪怪|鸡怪怪)/u.test(text)) {
    const tags: string[] = [];
    if (/(?:咳|喘)/u.test(text)) tags.push("respiratory");
    if (/(?:臭腳|臭脚|跛腳|跛脚)/u.test(text)) tags.push("foot");
    if (/(?:拉肚子|腹瀉|腹泻)/u.test(text)) tags.push("digestive");
    return { category: "health", tags: tags.length ? tags : ["health_observation"], confidence: 0.98 };
  }
  if (/(?:水簾|水帘|風扇|风扇|馬達|马达|機器|机器).*(?:壞|坏|沒動|没动|故障|異常|异常)|(?:壞|坏|沒動|没动|故障).*(?:水簾|水帘|風扇|风扇|馬達|马达)/u.test(text)) {
    const tags = /(?:水簾|水帘)/u.test(text) ? ["cooling_pad"] : /(?:風扇|风扇)/u.test(text) ? ["fan"] : ["equipment_fault"];
    return { category: "equipment", tags, confidence: 0.98 };
  }
  if (/(?:停電|停电|斷電|断电)/u.test(text)) return { category: "system", tags: ["power_outage"], confidence: 0.99 };
  if (/(?:屋頂|屋顶|風吹|颱風|台风|淹水|倒塌)/u.test(text)) return { category: "weather_disaster", tags: [/(?:屋頂|屋顶)/u.test(text) ? "roof" : "weather_damage"], confidence: 0.94 };
  if (/(?:飼料|饲料|缺料)/u.test(text)) return { category: /(?:晚|延遲|延迟|沒到|没到)/u.test(text) ? "logistics" : "feed", tags: ["feed_supply"], confidence: 0.9 };
  if (/(?:缺水|飲水|饮水|漏水)/u.test(text)) return { category: "water", tags: ["water_supply"], confidence: 0.9 };
  return null;
}

function safeTag(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/u.test(value);
}

export function parseAbnormalClassification(value: unknown): AbnormalClassification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.category !== "string" || !ABNORMAL_CATEGORIES.includes(record.category as AbnormalCategory)) return null;
  if (!Array.isArray(record.tags) || record.tags.length > 8 || !record.tags.every(safeTag)) return null;
  const confidence = typeof record.confidence === "number" ? record.confidence : NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { category: record.category as AbnormalCategory, tags: [...new Set(record.tags)], confidence };
}

export function weatherTemperatureLabel(value: number | null, at: string | null): string {
  if (value === null || !Number.isFinite(value)) return "待補";
  const temperature = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 }).format(value);
  return at ? `${temperature}°C（${at}）` : `${temperature}°C`;
}

async function stableId(prefix: string, value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  let hex = "";
  for (const byte of bytes.slice(0, 16)) hex += byte.toString(16).padStart(2, "0");
  return `${prefix}-${hex}`;
}

export function rememberLineContextStatement(env: AbnormalEnv, input: AbnormalWriteInput): D1PreparedStatement | null {
  if (!input.lineGroupId || !input.lineUserId) return null;
  return env.DB.prepare(
    `INSERT INTO line_operational_contexts
      (line_group_id, line_user_id, organization_id, farm_id, house_id, flock_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
       organization_id = excluded.organization_id,
       farm_id = excluded.farm_id,
       house_id = excluded.house_id,
       flock_id = excluded.flock_id,
       updated_at = excluded.updated_at`,
  ).bind(
    input.lineGroupId,
    input.lineUserId,
    input.organizationId,
    input.farmId,
    input.houseId,
    input.flockId,
    input.reportedAt,
  );
}

export async function insertAbnormalEvent(env: AbnormalEnv, input: AbnormalWriteInput): Promise<{ id: string; created: boolean }> {
  if (!validateAbnormalRawText(input.rawText)) throw new Error("invalid_abnormal_text");
  const id = await stableId("abnormal", input.sourceEventId);
  const auditId = await stableId("audit-abnormal", input.sourceEventId);
  const eventStatus = input.status ?? "active";
  const insert = env.DB.prepare(
    `INSERT OR IGNORE INTO abnormal_events
      (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
       approximate_period, reported_at, raw_text, source, actor_id, weather_date,
       status, correction_of_id, reversal_of_id, reason, source_event_id, quick_bundle_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    input.organizationId,
    input.farmId,
    input.houseId,
    input.flockId,
    input.occurredAt,
    input.occurredDate,
    input.approximatePeriod,
    input.reportedAt,
    input.rawText,
    input.source,
    input.actorId,
    input.weatherDate,
    eventStatus,
    input.correctionOfId ?? null,
    input.reversalOfId ?? null,
    input.reason ?? null,
    input.sourceEventId,
    input.quickBundleId ?? null,
  );
  const after = JSON.stringify({
    id,
    farmId: input.farmId,
    houseId: input.houseId,
    flockId: input.flockId,
    occurredAt: input.occurredAt,
    occurredDate: input.occurredDate,
    approximatePeriod: input.approximatePeriod,
    rawText: input.rawText,
    status: eventStatus,
  });
  const audit = env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type,
       entity_id, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, ?, ?, ?, ?, 'abnormal_event', ?, ?, ?, ?, ?)`,
  ).bind(
    auditId,
    input.organizationId,
    input.source,
    input.source === "web" ? "web_admin" : input.source === "line" ? "line_user" : "system",
    input.actorId,
    input.correctionOfId ? "correct" : input.reversalOfId ? "reverse" : "create",
    id,
    after,
    JSON.stringify(["rawText", "occurredDate", "farmId", "houseId", "flockId", "status"]),
    input.reason ?? null,
    input.sourceEventId,
  );
  const statements = [insert, audit];
  const context = rememberLineContextStatement(env, input);
  if (context) statements.push(context);
  const results = await env.DB.batch(statements);
  const created = Number((results[0] as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  if (created && env.EVENTS) {
    try {
      await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: id });
    } catch {
      // Classification is deliberately non-blocking. The pending row remains
      // visible to Data Health and can be retried later.
    }
  }
  return { id, created };
}
