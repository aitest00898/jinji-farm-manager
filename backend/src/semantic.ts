import { normalize, parseCommand, type OperationalDraft, type ParsedCommand } from "./core";
import { extractJsonValue } from "./ai-json";

export type UnifiedIntentName =
  | "record_mortality"
  | "record_cull"
  | "record_feed"
  | "record_water"
  | "record_shipment"
  | "record_inventory"
  | "query_today_mortality"
  | "query_today_mortality_top"
  | "query_recent_mortality_top"
  | "query_farm_mortality"
  | "query_current_stock"
  | "query_daily_summary"
  | "query_flock_age"
  | "query_upcoming_shipments"
  | "query_farm_list"
  | "query_equity"
  | "query_my_equity"
  | "query_farm_profit"
  | "query_farm_profit_list"
  | "query_portfolio_profit"
  | "query_investor_profit"
  | "create_test_farm"
  | "archive_test_farm"
  | "unknown";

export type UnifiedUnit = "bird" | "kg" | "L";
export type UnifiedSource = "deterministic" | "ai";
type ParsedAiUnit = UnifiedUnit | "ton";

export interface UnifiedIntent {
  intent: UnifiedIntentName;
  farmText: string | null;
  houseText: string | null;
  quantity: number | null;
  unit: UnifiedUnit | null;
  date: string | null;
  period: string | null;
  note: string | null;
  confidence: number;
  needsConfirmation: boolean;
  source: UnifiedSource;
}

const UNIFIED_INTENTS: ReadonlySet<string> = new Set<UnifiedIntentName>([
  "record_mortality",
  "record_cull",
  "record_feed",
  "record_water",
  "record_shipment",
  "record_inventory",
  "query_today_mortality",
  "query_today_mortality_top",
  "query_recent_mortality_top",
  "query_farm_mortality",
  "query_current_stock",
  "query_daily_summary",
  "query_flock_age",
  "query_upcoming_shipments",
  "query_farm_list",
  "query_equity",
  "query_my_equity",
  "query_farm_profit",
  "query_farm_profit_list",
  "query_portfolio_profit",
  "query_investor_profit",
  "create_test_farm",
  "archive_test_farm",
  "unknown",
]);

const RECORD_INTENTS: ReadonlySet<UnifiedIntentName> = new Set([
  "record_mortality",
  "record_cull",
  "record_feed",
  "record_water",
  "record_shipment",
  "record_inventory",
]);

const QUERY_INTENTS: ReadonlySet<UnifiedIntentName> = new Set([
  "query_today_mortality",
  "query_today_mortality_top",
  "query_recent_mortality_top",
  "query_farm_mortality",
  "query_current_stock",
  "query_daily_summary",
  "query_flock_age",
  "query_upcoming_shipments",
  "query_farm_list",
  "query_equity",
  "query_my_equity",
  "query_farm_profit",
  "query_farm_profit_list",
  "query_portfolio_profit",
  "query_investor_profit",
]);

export const UNIFIED_INTENT_JSON_SCHEMA = {
  name: "unified_intent",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: [...UNIFIED_INTENTS] },
      farmText: { type: ["string", "null"] },
      houseText: { type: ["string", "null"] },
      quantity: { type: ["number", "null"] },
      unit: { type: ["string", "null"], enum: ["bird", "隻", "只", "羽", "kg", "公斤", "千克", "L", "公升", "噸", "吨", null] },
      date: { type: ["string", "null"] },
      period: { type: ["string", "null"] },
      note: { type: ["string", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      needsConfirmation: { type: "boolean" },
    },
    required: ["intent", "farmText", "houseText", "quantity", "unit", "date", "period", "note", "confidence", "needsConfirmation"],
  },
} as const;

function baseIntent(source: UnifiedSource, intent: UnifiedIntentName): UnifiedIntent {
  return {
    intent,
    farmText: null,
    houseText: null,
    quantity: null,
    unit: null,
    date: null,
    period: null,
    note: null,
    confidence: source === "deterministic" ? 1 : 0,
    needsConfirmation: source === "ai",
    source,
  };
}

export function unknownIntent(source: UnifiedSource): UnifiedIntent {
  return baseIntent(source, "unknown");
}

function unitFromOperational(unit: OperationalDraft["unit"]): UnifiedUnit {
  if (unit === "隻") return "bird";
  return unit;
}

function operationalName(intent: OperationalDraft["intent"]): UnifiedIntentName {
  return `record_${intent}` as UnifiedIntentName;
}

function fromOperationalDraft(draft: OperationalDraft, source: UnifiedSource): UnifiedIntent {
  return {
    intent: operationalName(draft.intent),
    farmText: draft.farmText,
    houseText: draft.house ?? null,
    quantity: draft.quantity,
    unit: unitFromOperational(draft.unit),
    date: draft.eventDate ?? "today",
    period: null,
    note: draft.note ?? null,
    confidence: source === "deterministic" ? 1 : 0,
    needsConfirmation: source === "ai",
    source,
  };
}

export function deterministicToUnified(command: ParsedCommand): UnifiedIntent | null {
  switch (command.kind) {
    case "record_operational":
      return fromOperationalDraft(command.draft, "deterministic");
    case "mortality":
      return fromOperationalDraft({
        intent: "mortality",
        quantity: command.amount,
        unit: "隻",
        farmText: null,
        rawFarmText: null,
        house: command.house,
      }, "deterministic");
    case "inventory":
      return {
        ...baseIntent("deterministic", "record_inventory"),
        houseText: command.house,
        quantity: command.amount,
        unit: "bird",
        date: "today",
      };
    case "query_today_mortality":
      return { ...baseIntent("deterministic", "query_today_mortality"), houseText: command.house ?? null, date: "today" };
    case "query_farm_today_mortality":
      return { ...baseIntent("deterministic", "query_farm_mortality"), farmText: command.farmName, houseText: command.house ?? null, date: "today" };
    case "query_inventory":
      return { ...baseIntent("deterministic", "query_current_stock"), farmText: command.farmName ?? null, houseText: command.house ?? null };
    case "summary":
      return { ...baseIntent("deterministic", "query_daily_summary"), houseText: command.house ?? null, date: "today" };
    case "query_flock_age":
      return { ...baseIntent("deterministic", "query_flock_age"), farmText: command.farmName ?? null, houseText: command.house };
    case "query_upcoming_shipments":
      return baseIntent("deterministic", "query_upcoming_shipments");
    case "query_farm_list":
      return baseIntent("deterministic", "query_farm_list");
    case "query_equity":
      return baseIntent("deterministic", "query_equity");
    case "query_my_equity":
      return baseIntent("deterministic", "query_my_equity");
    case "query_farm_profit":
      return { ...baseIntent("deterministic", "query_farm_profit"), farmText: command.farmName };
    case "query_farm_profit_list":
      return baseIntent("deterministic", "query_farm_profit_list");
    case "query_portfolio_profit":
      return baseIntent("deterministic", "query_portfolio_profit");
    case "query_investor_profit":
      return baseIntent("deterministic", "query_investor_profit");
    case "create_test_farm":
      return { ...baseIntent("deterministic", "create_test_farm"), farmText: command.farmName, needsConfirmation: true };
    case "archive_test_farm":
      return { ...baseIntent("deterministic", "archive_test_farm"), farmText: command.farmName, needsConfirmation: true };
    case "unknown":
      return unknownIntent("deterministic");
    default:
      return null;
  }
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = normalize(value);
  if (!text || text.length > maxLength || /[\u0000-\u001F\u007F]/u.test(text)) return undefined;
  return text;
}

function parseQuantity(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const quantity = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return undefined;
  return quantity;
}

function parseUnit(value: unknown): ParsedAiUnit | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  if (/^(?:bird|birds|隻|只|羽)$/iu.test(value)) return "bird";
  if (/^(?:kg|公斤|千克)$/iu.test(value)) return "kg";
  if (/^(?:l|公升)$/iu.test(value)) return "L";
  if (/^(?:噸|吨)$/iu.test(value)) return "ton";
  return undefined;
}

function parseHouse(value: unknown): string | null | undefined {
  const text = optionalText(value, 20);
  if (text === null || text === undefined) return text;
  const match = text.match(/^(\d+)\s*舍$/iu);
  return match ? `${Number(match[1])}舍` : undefined;
}

function parseDate(value: unknown): string | null | undefined {
  const text = optionalText(value, 40);
  if (text === null || text === undefined) return text;
  if (/^(?:today|今天|今日)$/iu.test(text)) return "today";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return text;
  return undefined;
}

function parsePeriod(value: unknown): string | null | undefined {
  const text = optionalText(value, 30);
  if (text === null || text === undefined) return text;
  if (/^(?:today|今天|今日)$/iu.test(text)) return "today";
  if (/^(?:recent|近期|最近)$/iu.test(text)) return "recent";
  if (/^(?:3d|3天)$/iu.test(text)) return "3d";
  if (/^(?:7d|7天)$/iu.test(text)) return "7d";
  if (/^(?:14d|14天)$/iu.test(text)) return "14d";
  return undefined;
}

function parseConfidence(value: unknown): number | undefined {
  const confidence = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined;
}

function normalizeAiIntentName(value: unknown): UnifiedIntentName | undefined {
  if (typeof value !== "string" || !UNIFIED_INTENTS.has(value)) return undefined;
  return value as UnifiedIntentName;
}

const MORTALITY_LANGUAGE = /(?:死亡|死|掛(?:了)?)/u;
const CULL_LANGUAGE = /(?:淘汰)/u;
const FEED_LANGUAGE = /(?:飼料|饲料|餵|喂|料)/u;
const WATER_LANGUAGE = /(?:飲水|饮水|喝水)/u;
const SHIPMENT_LANGUAGE = /(?:出雞|出鸡|出欄|出栏)/u;
const QUERY_LANGUAGE = /(?:哪|多少|幾|几|最多|比較|比较|查詢|查询|統計|统计)/u;
const TOP_QUERY_LANGUAGE = /(?:哪\s*(?:一)?\s*場|哪\s*(?:一)?\s*場|最多|比較多|比较多)/u;
const RECENT_QUERY_LANGUAGE = /(?:最近|近期)/u;
const NEGATION_LANGUAGE = /(?:沒有|沒有|没(?:有)?|不是|並非|并非|未|無|无)/u;
const CORRECTION_LANGUAGE = /(?:不對|不对|講錯|讲错|改成|更正|不是.+是)/u;
const UNCERTAINTY_LANGUAGE = /(?:好像|應該|应该|聽說|听说|可能|大概|似乎)/u;

function safeUnknownIntent(): UnifiedIntent {
  return {
    ...unknownIntent("ai"),
    confidence: 0,
    needsConfirmation: true,
  };
}

function cleanAiFarmText(value: string | null): string | null {
  if (!value) return null;
  let text = normalize(value);
  const eventStart = text.search(/(?:死亡|死|掛|淘汰|飼料|饲料|餵|喂|料|飲水|饮水|喝水|出雞|出鸡|出欄|出栏)/u);
  if (eventStart >= 0) text = text.slice(0, eventStart);
  for (let pass = 0; pass < 3; pass += 1) {
    text = text
      .replace(/^(?:今天|今日|剛剛|刚刚|目前|現在|现在|最近|近期)\s*/iu, "")
      .replace(/(?:今天|今日|剛剛|刚刚|目前|現在|现在|最近|近期)\s*$/iu, "")
      .replace(/(?:那邊|那边|那場|那场|這邊|这边|這場|这场)\s*$/iu, "")
      .replace(/(?:又|好像|有|再)\s*$/iu, "")
      .trim();
  }
  return text || null;
}

function stripFarmCandidate(value: string): string | null {
  let text = normalize(value)
    .replace(/^(?:在|於|于|了|又|有|好像)\s*/iu, "")
    .replace(/(?:其中|備註|備註是|备注).*/u, "")
    .trim();
  const quantityStart = text.search(/\d+(?:\.\d+)?\s*(?:隻|只|羽|kg|公斤|千克|L|公升|噸|吨)?/iu);
  if (quantityStart >= 0) text = text.slice(0, quantityStart).trim();
  return cleanAiFarmText(text);
}

/**
 * Extract only the user-provided farm fragment. This is deliberately
 * independent of the model's farmText so an AI cannot turn a typo into a
 * canonical farm and bypass FarmResolver.
 */
export function farmFragmentFromInput(input: string): string | null {
  const text = normalize(input);
  const eventMatch = text.match(/(?:死亡|死|掛|淘汰|飼料|饲料|餵|喂|料|飲水|饮水|喝水|出雞|出鸡|出欄|出栏)/u);
  if (!eventMatch || eventMatch.index === undefined) return null;
  const before = text.slice(0, eventMatch.index).trim();
  const after = text.slice(eventMatch.index + eventMatch[0].length).trim();
  const cleanedBefore = stripFarmCandidate(before);
  const beforeIsQuantityOrFiller = !cleanedBefore || /^(?:今天|今日|剛剛|刚刚|目前|現在|现在|最近|近期|又|好像|有|再|\d+(?:\.\d+)?\s*(?:隻|只|羽)?)$/iu.test(cleanedBefore);
  if (!beforeIsQuantityOrFiller) return cleanedBefore;
  return stripFarmCandidate(after);
}

/**
 * Apply only input-consistency constraints after Workers AI returns JSON.
 * This does not resolve a farm or choose a farm_id; FarmResolver remains the
 * sole authority for that decision. It prevents a small model from turning
 * an explicit mortality phrase into feed, or from passing event words as the
 * farm fragment.
 */
export function normalizeAiUnifiedIntent(intent: UnifiedIntent, input: string): UnifiedIntent {
  const text = normalize(input);
  const farmText = farmFragmentFromInput(input) ?? cleanAiFarmText(intent.farmText);
  const hasMortality = MORTALITY_LANGUAGE.test(text);
  const hasCulling = CULL_LANGUAGE.test(text);
  const hasFeed = FEED_LANGUAGE.test(text);
  const hasWater = WATER_LANGUAGE.test(text);
  const hasShipment = SHIPMENT_LANGUAGE.test(text);
  const hasQuery = QUERY_LANGUAGE.test(text);

  // Safety gate before any resolver or DB path. Negation, correction and
  // multiple-event sentences must never become a single write by accident.
  const eventCount = [hasMortality, hasCulling, hasFeed, hasWater, hasShipment].filter(Boolean).length;
  if ((NEGATION_LANGUAGE.test(text) || CORRECTION_LANGUAGE.test(text)) && eventCount > 0) return safeUnknownIntent();
  if (eventCount > 1) return safeUnknownIntent();
  if (hasQuery && UNCERTAINTY_LANGUAGE.test(text)) return safeUnknownIntent();

  // These expressions are deliberately not silently normalized into a
  // deterministic event. They may describe loss, a correction, or a unit
  // the domain has not defined, so an explicit confirmation/clarification is
  // required before any write.
  const ambiguousLoss = /(?:少|少掉|少了)\s*(?:\d+(?:\.\d+)?|[零一二兩三四五六七八九十百千]+)/u.test(text)
    && eventCount === 0;
  const uncertainRecord = UNCERTAINTY_LANGUAGE.test(text) && eventCount === 1 && RECORD_INTENTS.has(intent.intent);
  const ambiguousCull = /抓掉/u.test(text) && hasCulling;
  const feedWithoutDefinedWeight = hasFeed && /包/u.test(text) && !/(?:kg|公斤|千克)/iu.test(text);
  const shipmentWithoutExplicitUnit = hasShipment && /\d/u.test(text) && !/(?:隻|只|羽|箱|公斤|kg|噸|吨)/iu.test(text);
  if (feedWithoutDefinedWeight || shipmentWithoutExplicitUnit) return safeUnknownIntent();

  if (hasMortality && hasQuery && !hasCulling && !hasFeed && !hasWater && !hasShipment) {
    if (TOP_QUERY_LANGUAGE.test(text)) {
      return {
        ...intent,
        intent: RECENT_QUERY_LANGUAGE.test(text) ? "query_recent_mortality_top" : "query_today_mortality_top",
        farmText: null,
        quantity: null,
        unit: null,
        date: "today",
        period: RECENT_QUERY_LANGUAGE.test(text) ? (intent.period ?? "recent") : "today",
        note: null,
        needsConfirmation: false,
      };
    }
    return {
      ...intent,
      intent: farmText ? "query_farm_mortality" : "query_today_mortality",
      farmText,
      quantity: null,
      unit: null,
      date: "today",
      period: "today",
      note: null,
      needsConfirmation: false,
    };
  }

  let eventIntent = intent.intent;
  let unit = intent.unit;
  if (hasFeed && !hasMortality && !hasCulling && !hasWater && !hasShipment) {
    eventIntent = "record_feed";
    unit = "kg";
  } else if (hasWater && !hasMortality && !hasCulling && !hasFeed && !hasShipment) {
    eventIntent = "record_water";
    unit = "L";
  } else if (hasShipment && !hasMortality && !hasCulling && !hasFeed && !hasWater) {
    eventIntent = "record_shipment";
    unit = "bird";
  } else if (hasCulling && !hasMortality && !hasFeed && !hasWater && !hasShipment) {
    eventIntent = "record_cull";
    unit = "bird";
  } else if (hasMortality && !hasCulling && !hasFeed && !hasWater && !hasShipment) {
    eventIntent = "record_mortality";
    unit = "bird";
  }

  return {
    ...intent,
    intent: eventIntent,
    farmText,
    unit,
    needsConfirmation: intent.needsConfirmation || uncertainRecord || ambiguousCull || ambiguousLoss,
  };
}

export function parseAiUnifiedIntent(raw: string): UnifiedIntent | null {
  const value = extractJsonValue(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const intent = normalizeAiIntentName(record.intent);
  const farmText = optionalText(record.farmText, 80);
  const houseText = parseHouse(record.houseText);
  const quantity = parseQuantity(record.quantity);
  const unit = parseUnit(record.unit);
  const date = parseDate(record.date);
  const period = parsePeriod(record.period);
  const note = optionalText(record.note, 500);
  const confidence = parseConfidence(record.confidence);
  if (!intent || farmText === undefined || houseText === undefined || quantity === undefined || unit === undefined || date === undefined || period === undefined || note === undefined || confidence === undefined) return null;
  if (typeof record.needsConfirmation !== "boolean") return null;
  if (Array.isArray(record.candidateFarmIds)) return null;

  let normalizedQuantity = quantity;
  let normalizedUnit: UnifiedUnit | null = unit === "ton" ? null : unit;
  if (unit === "ton") {
    if (intent !== "record_water" || quantity === null || quantity * 1000 > 1_000_000_000) return null;
    normalizedQuantity = quantity * 1000;
    normalizedUnit = "L";
  }

  if (RECORD_INTENTS.has(intent)) {
    if (normalizedQuantity === null || normalizedUnit === null) return null;
    if (normalizedUnit === "bird" && !Number.isInteger(normalizedQuantity)) return null;
  } else if (intent === "query_farm_mortality" || intent === "query_farm_profit") {
    if (!farmText) return null;
  } else if (intent === "query_today_mortality_top" || intent === "query_recent_mortality_top") {
    // A model may return either the semantic marker "today" or the current
    // ISO date. Both are valid here; the application layer still rejects a
    // stale date before executing a query.
    if (intent === "query_today_mortality_top" && date !== null && date !== "today" && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
    if (intent === "query_recent_mortality_top" && period !== "recent" && period !== "3d" && period !== "7d" && period !== "14d") return null;
  } else if (intent === "unknown") {
    return {
      ...unknownIntent("ai"),
      confidence: 0,
      needsConfirmation: true,
    };
  }

  return {
    intent,
    farmText,
    houseText,
    quantity: normalizedQuantity,
    unit: normalizedUnit,
    date,
    period,
    note,
    confidence,
    needsConfirmation: record.needsConfirmation,
    source: "ai",
  };
}

export function isUnifiedRecordIntent(intent: UnifiedIntentName): boolean {
  return RECORD_INTENTS.has(intent);
}

export function isUnifiedQueryIntent(intent: UnifiedIntentName): boolean {
  return QUERY_INTENTS.has(intent);
}

export function operationalDraftFromUnified(intent: UnifiedIntent): OperationalDraft | null {
  if (!isUnifiedRecordIntent(intent.intent) || intent.intent === "record_inventory") return null;
  if (intent.quantity === null || intent.unit === null) return null;
  const unit = intent.unit === "bird" ? "隻" : intent.unit;
  return {
    intent: intent.intent.slice("record_".length) as OperationalDraft["intent"],
    quantity: intent.quantity,
    unit,
    farmText: intent.farmText,
    rawFarmText: intent.farmText,
    house: intent.houseText ?? undefined,
    eventDate: intent.date ?? "today",
    note: intent.note ?? undefined,
  };
}

export function shouldInvokeSemanticAi(input: string): boolean {
  const text = normalize(input);
  if (!text || /^(?:\d+|是|好|確認|確定|否|不是)$/iu.test(text)) return false;
  if (/(?:生日|死亡日|餐廳|菜單|菜单|位置|營業時間|营业时间|獸醫|兽医|藥物|药物|處方|处方)/iu.test(text)) return false;
  const deterministic = deterministicToUnified(parseCommand(text));
  if (deterministic && deterministic.intent !== "unknown" && !shouldPreferAiOverDeterministic(text, deterministic)) {
    return false;
  }
  const eventWords = /(?:死亡|死|掛|淘汰|飼料|饲料|料|飲水|饮水|水|出雞|出鸡|出欄|出栏|餵|喂)/iu.test(text);
  const queryWords = /(?:哪|多少|幾|几|最近|近期|比較|比较|最多|統計|统计|查詢|查询|目前|現在|现在)/iu.test(text);
  const quantityWords = /(?:\d|零|一|二|兩|两|三|四|五|六|七|八|九|十|百|千)/u.test(text);
  return (eventWords && (quantityWords || text.length >= 6)) || (queryWords && text.length >= 4);
}

export function shouldPreferAiOverDeterministic(input: string, intent: UnifiedIntent): boolean {
  if (intent.source !== "deterministic" || !isUnifiedRecordIntent(intent.intent)) return false;
  const text = normalize(input);
  if (/(?:那邊|那場|這邊|好像|又|其中|餵|喂|餵了|喂了|了)/u.test(text)) return true;
  if (/(?:今天|今日)/u.test(text)) return true;
  return false;
}
