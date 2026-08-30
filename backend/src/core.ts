import { isIsoDate, normalizedHouseName, taipeiDate } from "./master-data";

export type OperationalIntent = "mortality" | "cull" | "feed" | "water" | "shipment";

export interface OperationalDraft {
  intent: OperationalIntent;
  quantity: number;
  unit: "隻" | "kg" | "L";
  farmText: string | null;
  rawFarmText: string | null;
  house?: string;
  eventDate?: string;
  note?: string;
  /** AI-extracted farm text is always a candidate and requires confirmation. */
  requiresFarmConfirmation?: boolean;
}

export type ParsedCommand =
  | { kind: "ping" }
  | { kind: "help" }
  | { kind: "menu" }
  | { kind: "menu_quick_record" }
  | { kind: "menu_today_summary" }
  | { kind: "menu_farms" }
  | { kind: "menu_recent_abnormal" }
  | { kind: "menu_correction_help" }
  | { kind: "menu_weather" }
  | { kind: "menu_ai" }
  | { kind: "menu_pending_candidates" }
  | { kind: "menu_finance" }
  | { kind: "menu_audit" }
  | { kind: "menu_help" }
  | { kind: "menu_management" }
  | { kind: "menu_developer" }
  | { kind: "system_status" }
  | { kind: "ambient_digest_now" }
  | { kind: "pending_ambient_preview" }
  | { kind: "cancel" }
  | { kind: "bind"; farmName: string }
  | { kind: "mortality"; house: string; amount: number }
  | { kind: "inventory"; house: string; amount: number }
  | { kind: "record_operational"; draft: OperationalDraft }
  | { kind: "summary"; house?: string }
  | { kind: "query_today_mortality"; house?: string }
  | { kind: "query_farm_today_mortality"; farmName: string; house?: string }
  | { kind: "query_inventory"; house?: string; farmName?: string }
  | { kind: "query_flock_age"; house: string; farmName?: string }
  | { kind: "query_upcoming_shipments" }
  | { kind: "query_farm_list" }
  | { kind: "query_equity" }
  | { kind: "query_my_equity" }
  | { kind: "query_farm_profit"; farmName: string }
  | { kind: "query_farm_profit_list" }
  | { kind: "query_portfolio_profit" }
  | { kind: "query_investor_profit" }
  | { kind: "create_test_farm"; farmName: string }
  | { kind: "archive_test_farm"; farmName: string }
  | { kind: "create_test_farm_usage" }
  | { kind: "archive_test_farm_usage" }
  | { kind: "create_farm"; farmName: string }
  | { kind: "archive_farm"; farmName: string }
  | { kind: "create_farm_usage" }
  | { kind: "archive_farm_usage" }
  | { kind: "create_house"; farmName: string; houseName: string }
  | { kind: "create_house_usage" }
  | { kind: "create_flock"; farmName: string; houseName: string; batchCode: string; chickInDate: string; initialCount: number; expectedShipmentDate?: string }
  | { kind: "create_flock_usage" }
  | { kind: "test_farm_list" }
  | { kind: "unknown"; text: string };

export type CommandClass =
  | "CONTROL"
  | "ADMIN"
  | "QUERY"
  | "COMPLETE_OPERATIONAL_EVENT"
  | "PENDING_RESPONSE"
  | "UNKNOWN";

export function classifyCommand(command: ParsedCommand): CommandClass {
  switch (command.kind) {
    case "ping":
    case "help":
    case "menu":
    case "menu_quick_record":
    case "menu_today_summary":
    case "menu_farms":
    case "menu_recent_abnormal":
    case "menu_correction_help":
    case "menu_weather":
    case "menu_ai":
    case "menu_pending_candidates":
    case "menu_finance":
    case "menu_audit":
    case "menu_help":
    case "menu_management":
    case "menu_developer":
    case "system_status":
    case "cancel":
      return "CONTROL";
    // `摘要` is intentionally not a global wake/control word. The LINE
    // mention gate handles the explicit `@Bot 摘要` form; bare human text
    // must remain quiet even though it has a deterministic parser kind.
    case "ambient_digest_now":
      return "UNKNOWN";
    case "pending_ambient_preview":
      return "CONTROL";
    case "bind":
    case "create_test_farm":
    case "archive_test_farm":
    case "create_test_farm_usage":
    case "archive_test_farm_usage":
    case "create_farm":
    case "archive_farm":
    case "create_farm_usage":
    case "archive_farm_usage":
    case "test_farm_list":
    case "create_house":
    case "create_house_usage":
    case "create_flock":
    case "create_flock_usage":
      return "ADMIN";
    case "summary":
    case "query_today_mortality":
    case "query_farm_today_mortality":
    case "query_inventory":
    case "query_flock_age":
    case "query_upcoming_shipments":
    case "query_farm_list":
    case "query_equity":
    case "query_my_equity":
    case "query_farm_profit":
    case "query_farm_profit_list":
    case "query_portfolio_profit":
    case "query_investor_profit":
      return "QUERY";
    case "mortality":
    case "inventory":
    case "record_operational":
      return "COMPLETE_OPERATIONAL_EVENT";
    case "unknown":
      return "UNKNOWN";
    default:
      return "PENDING_RESPONSE";
  }
}

const SAFE_AI_INTENTS = new Set([
  "record_mortality",
  "record_inventory",
  "query_today_mortality",
  "query_inventory",
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

const OPERATIONAL_AI_INTENTS = new Set([
  "record_mortality",
  "record_cull",
  "record_feed",
  "record_water",
  "record_shipment",
]);

export const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/[：:，,。！？?!]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const houseName = (value: string): string => `${Number(value)}舍`;

const houseFromValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = normalizedHouseName(value);
  return /^(?:[\p{L}\p{N}_-]{1,18})舍$/u.test(normalized) ? normalized : undefined;
};

const amountFromValue = (value: unknown): number | undefined => {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000) return undefined;
  return amount;
};

const positiveQuantityFromValue = (value: unknown): number | undefined => {
  const quantity = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return undefined;
  return quantity;
};

type OperationalEventWord = "mortality" | "cull" | "feed" | "water" | "shipment";

function operationalEventWord(value: string): OperationalEventWord | undefined {
  if (/^(?:死亡|死|死亡數|死亡数)$/iu.test(value)) return "mortality";
  if (/^(?:掛|淘汰)$/iu.test(value)) return "cull";
  if (/^(?:飼料|饲料|料)$/iu.test(value)) return "feed";
  if (/^(?:飲水|饮水|水)$/iu.test(value)) return "water";
  if (/^(?:出雞|出鸡|出欄|出栏)$/iu.test(value)) return "shipment";
  return undefined;
}

function quantityAndUnit(
  event: OperationalEventWord,
  rawQuantity: string,
  rawUnit: string | undefined,
): { quantity: number; unit: "隻" | "kg" | "L" } | undefined {
  const quantity = Number(rawQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return undefined;
  const unit = rawUnit?.toLowerCase();
  if (event === "feed") {
    if (unit && !/^(?:kg|公斤|千克)$/iu.test(unit)) return undefined;
    return { quantity, unit: "kg" };
  }
  if (event === "water") {
    if (!unit || /^(?:l|公升)$/iu.test(unit)) return { quantity, unit: "L" };
    if (/^(?:噸|吨)$/iu.test(unit)) return { quantity: quantity * 1000, unit: "L" };
    return undefined;
  }
  if (unit && !/^(?:隻|只|羽)$/iu.test(unit)) return undefined;
  if (!Number.isInteger(quantity)) return undefined;
  return { quantity, unit: "隻" };
}

const EVENT_WORD_PATTERN = "(?:死亡數|死亡数|出雞|出鸡|出欄|出栏|飲水|饮水|飼料|饲料|死亡|死|掛|淘汰|料|水)";
const QUANTITY_PATTERN = "(\\d+(?:\\.\\d+)?)\\s*(隻|只|羽|kg|公斤|千克|L|公升|噸|吨)?";

function farmAndHouse(rawFarmText: string): { farmText: string | null; rawFarmText: string | null; house?: string } {
  const value = normalize(rawFarmText);
  // Prefer a complete house token after an explicit separator. The previous
  // numeric-first split treated `金雞測試場 測試1舍` as farm=`金雞測試場 測試`
  // and house=`1舍`, which downgraded an exact farm to a fuzzy candidate.
  const spacedFarmWithHouse = value.match(/^(.+?)\s+([\p{L}\p{N}_-]{1,18}\s*舍)$/iu);
  const concatenatedFarmWithHouse = value.match(/^(.+[場场])([\p{L}\p{N}_-]{1,18}\s*舍)$/iu);
  const farmWithHouse = spacedFarmWithHouse ?? concatenatedFarmWithHouse;
  if (farmWithHouse && farmWithHouse[1].trim()) {
    const farmText = farmWithHouse[1].trim();
    return {
      farmText,
      rawFarmText: farmText,
      house: normalizedHouseName(farmWithHouse[2]),
    };
  }
  const standaloneHouse = value.match(/^(?:[\p{L}\p{N}_-]{1,18})\s*舍$/iu);
  if (standaloneHouse) {
    return { farmText: null, rawFarmText: null, house: normalizedHouseName(standaloneHouse[0]) };
  }
  return { farmText: value || null, rawFarmText: value || null };
}

function parseOperationalDraft(text: string): OperationalDraft | undefined {
  const eventFirst = text.match(
    new RegExp(`^(?:今天|今日)?\\s*(${EVENT_WORD_PATTERN})\\s*(.*?)\\s*${QUANTITY_PATTERN}$`, "iu"),
  );
  if (eventFirst) {
    const event = operationalEventWord(eventFirst[1]);
    if (event) {
      const parsed = quantityAndUnit(event, eventFirst[3], eventFirst[4]);
      if (!parsed) return undefined;
      const target = farmAndHouse(eventFirst[2]);
      return { intent: event, quantity: parsed.quantity, unit: parsed.unit, ...target };
    }
  }

  const farmFirst = text.match(
    new RegExp(`^(.+?)\\s*(?:今天|今日)?\\s*(${EVENT_WORD_PATTERN})\\s*${QUANTITY_PATTERN}$`, "iu"),
  );
  if (!farmFirst) return undefined;
  const event = operationalEventWord(farmFirst[2]);
  if (!event) return undefined;
  const parsed = quantityAndUnit(event, farmFirst[3], farmFirst[4]);
  if (!parsed) return undefined;
  const target = farmAndHouse(farmFirst[1]);
  return { intent: event, quantity: parsed.quantity, unit: parsed.unit, ...target };
}

export function parseCommand(input: string): ParsedCommand {
  const text = normalize(input);
  if (/^(?:ping|測試|测试)$/iu.test(text)) return { kind: "ping" };
  if (/^(?:幫助|帮助|help|指令|功能)$/iu.test(text)) return { kind: "help" };
  if (/^(?:選單|功能選單)$/iu.test(text)) return { kind: "menu" };
  // These are the exact natural-language equivalents of Message Actions in
  // the LINE Flex menu. Keeping them as parser commands means a button and a
  // manually typed message use exactly the same business handler.
  if (/^快速紀錄$/iu.test(text)) return { kind: "menu_quick_record" };
  if (/^(?:今日營運|今日狀況)$/iu.test(text)) return { kind: "menu_today_summary" };
  if (/^(?:場次[／/]批次|雞場與批次)$/iu.test(text)) return { kind: "menu_farms" };
  if (/^最近異常$/iu.test(text)) return { kind: "menu_recent_abnormal" };
  if (/^(?:更正紀錄|修改紀錄)$/iu.test(text)) return { kind: "menu_correction_help" };
  if (/^雲林天氣$/iu.test(text)) return { kind: "menu_weather" };
  if (/^(?:AI\s*營運分析|AI\s*分析)$/iu.test(text)) return { kind: "menu_ai" };
  if (/^財務摘要$/iu.test(text)) return { kind: "menu_finance" };
  if (/^(?:歷史紀錄|變更紀錄)$/iu.test(text)) return { kind: "menu_audit" };
  if (/^使用說明$/iu.test(text)) return { kind: "menu_help" };
  if (/^管理功能$/iu.test(text)) return { kind: "menu_management" };
  if (/^開發選單$/iu.test(text)) return { kind: "menu_developer" };
  if (/^系統狀態$/iu.test(text)) return { kind: "system_status" };
  if (/^顯示待摘要訊息$/iu.test(text)) return { kind: "pending_ambient_preview" };
  if (/^待確認資料$/iu.test(text)) return { kind: "menu_pending_candidates" };
  if (/^摘要$/iu.test(text)) return { kind: "ambient_digest_now" };
  if (/^(?:取消|不要|算了)$/iu.test(text)) return { kind: "cancel" };

  if (/^(?:新增測試場|建立測試場|新增測試雞場|建立測試雞場)$/iu.test(text)) {
    return { kind: "create_test_farm_usage" };
  }
  const createTestFarm = text.match(/^(?:新增測試場|建立測試場|新增測試雞場|建立測試雞場)\s+(.+)$/iu);
  if (createTestFarm) return { kind: "create_test_farm", farmName: createTestFarm[1].trim() };
  if (/^(?:封存測試場|刪除測試場)$/iu.test(text)) {
    return { kind: "archive_test_farm_usage" };
  }
  const archiveTestFarm = text.match(/^(?:封存測試場|刪除測試場)\s+(.+)$/iu);
  if (archiveTestFarm) return { kind: "archive_test_farm", farmName: archiveTestFarm[1].trim() };
  if (/^測試場列表$/iu.test(text)) return { kind: "test_farm_list" };

  if (/^(?:新增養雞場|建立養雞場|新增雞場|建立雞場)$/iu.test(text)) {
    return { kind: "create_farm_usage" };
  }
  const createFarm = text.match(/^(?:新增養雞場|建立養雞場|新增雞場|建立雞場)\s+(.+)$/iu);
  if (createFarm) return { kind: "create_farm", farmName: createFarm[1].trim() };
  if (/^(?:封存養雞場|刪除養雞場|封存雞場|刪除雞場)$/iu.test(text)) {
    return { kind: "archive_farm_usage" };
  }
  const archiveFarm = text.match(/^(?:封存養雞場|刪除養雞場|封存雞場|刪除雞場)\s+(.+)$/iu);
  if (archiveFarm) return { kind: "archive_farm", farmName: archiveFarm[1].trim() };

  if (/^(?:新增雞舍|建立雞舍)$/iu.test(text)) return { kind: "create_house_usage" };
  const createHouse = text.match(/^(?:新增雞舍|建立雞舍)\s+(.+?)\s+([^\s]+舍)$/iu);
  if (createHouse) return { kind: "create_house", farmName: createHouse[1].trim(), houseName: normalizedHouseName(createHouse[2]) };

  if (/^(?:新增批次|建立批次)$/iu.test(text)) return { kind: "create_flock_usage" };
  const phase2Date = (value: string): string | undefined => {
    if (isIsoDate(value)) return value;
    const short = /^(\d{1,2})\/(\d{1,2})$/u.exec(value);
    if (!short) return undefined;
    const year = Number(taipeiDate().slice(0, 4));
    const candidate = `${year}-${String(Number(short[1])).padStart(2, "0")}-${String(Number(short[2])).padStart(2, "0")}`;
    return isIsoDate(candidate) ? candidate : undefined;
  };
  const createFlock = text.match(
    /^(?:新增批次|建立批次)\s+(.+?)\s+([^\s]+舍)\s+(\S+)\s+(?:入雛|入雏)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})\s+([\d,]+)\s*(?:隻|只|羽)?(?:\s+(?:預計)?(?:出雞|出鸡|出欄|出栏)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}))?$/iu,
  );
  if (createFlock) {
    const chickInDate = phase2Date(createFlock[4]);
    const expectedShipmentDate = createFlock[6] ? phase2Date(createFlock[6]) : undefined;
    const initialCount = Number(createFlock[5].replace(/,/gu, ""));
    if (chickInDate && (!createFlock[6] || expectedShipmentDate) && Number.isSafeInteger(initialCount) && initialCount > 0) {
      return {
        kind: "create_flock",
        farmName: createFlock[1].trim(),
        houseName: normalizedHouseName(createFlock[2]),
        batchCode: createFlock[3].trim(),
        chickInDate,
        initialCount,
        ...(expectedShipmentDate ? { expectedShipmentDate } : {}),
      };
    }
  }

  const bind = text.match(/^(?:綁定|绑定)(?:雞場|鸡场)?\s+(.+)$/iu);
  if (bind) return { kind: "bind", farmName: bind[1].trim() };

  // Preserve the existing house-level V1 contract for already-supported input.
  const mortality = text.match(
    /^(?:死亡|死雞|死鸡|死亡數|死亡数)\s*(\d+)\s*舍\s*(\d+)\s*(?:隻|只)?$/iu,
  );
  if (mortality) return { kind: "mortality", house: houseName(mortality[1]), amount: Number(mortality[2]) };

  const inventory = text.match(
    /^(?:存欄|存栏|現存|现存)\s*(\d+)\s*舍\s*(\d+)\s*(?:隻|只)?$/iu,
  );
  if (inventory) return { kind: "inventory", house: houseName(inventory[1]), amount: Number(inventory[2]) };

  // Deterministic query forms run before any AI call. "今天死亡" can never be
  // interpreted as a date, birthday, or free-chat question.
  const todayMortality = text.match(
    /^(?:(\d+)\s*舍\s*)?(?:(?:今天|今日)\s*)?(?:死亡|死亡數|死亡数)\s*(?:(\d+)\s*舍)?$/iu,
  );
  if (todayMortality) {
    const house = todayMortality[1] ?? todayMortality[2];
    return { kind: "query_today_mortality", house: house ? houseName(house) : undefined };
  }

  const farmTodayMortality = text.match(/^(.+?)\s*(?:(?:今天|今日)\s*)?(?:死亡|死亡數|死亡数)$/iu);
  if (farmTodayMortality && !/^\d+\s*舍$/iu.test(farmTodayMortality[1].trim())) {
    return { kind: "query_farm_today_mortality", farmName: farmTodayMortality[1].trim() };
  }

  const inventoryQuery = text.match(
    /^(?:(\d+)\s*舍\s*)?(?:(?:目前|現在|现在|當前|当前)\s*)?(?:存欄|存栏|現存|现存)\s*(?:(\d+)\s*舍)?$/iu,
  );
  if (inventoryQuery) {
    const house = inventoryQuery[1] ?? inventoryQuery[2];
    return { kind: "query_inventory", house: house ? houseName(house) : undefined };
  }
  const farmInventoryQuery = text.match(
    /^(.+?)\s+([\p{L}\p{N}_-]{1,18}\s*舍)\s+(?:(?:目前|現在|现在|當前|当前)\s*)?(?:存欄|存栏|現存|现存)$/iu,
  );
  if (farmInventoryQuery) {
    return {
      kind: "query_inventory",
      farmName: farmInventoryQuery[1].trim(),
      house: normalizedHouseName(farmInventoryQuery[2]),
    };
  }
  const flockAge = text.match(/^(\d+)\s*舍\s*(?:日齡|日龄)$/iu);
  if (flockAge) return { kind: "query_flock_age", house: houseName(flockAge[1]) };
  const farmFlockAge = text.match(
    /^(.+?)\s+([\p{L}\p{N}_-]{1,18}\s*舍)\s*(?:日齡|日龄)$/iu,
  );
  if (farmFlockAge) {
    return {
      kind: "query_flock_age",
      farmName: farmFlockAge[1].trim(),
      house: normalizedHouseName(farmFlockAge[2]),
    };
  }
  if (/^(?:下週出雞|下周出鸡|近期出雞|近期出鸡)$/iu.test(text)) return { kind: "query_upcoming_shipments" };

  if (/^(?:雞場列表|雞場清單|鸡场列表|鸡场清单|各場列表|各场列表)$/iu.test(text)) return { kind: "query_farm_list" };
  if (/^(?:各場持股|各場股份|各场持股|各场股份|投資組合持股|投资组合持股)$/iu.test(text)) return { kind: "query_equity" };
  if (/^(?:我的持股|我的股份|我的權益|我的权益)$/iu.test(text)) return { kind: "query_my_equity" };
  if (/^(?:各場盈虧|各场盈亏)$/iu.test(text)) return { kind: "query_farm_profit_list" };
  if (/^(?:大富翁盈虧|大富翁盈亏|總盈虧|总盈亏|投資組合盈虧|投资组合盈亏)$/iu.test(text)) return { kind: "query_portfolio_profit" };
  if (/^(?:我的累計盈虧|我的累計盈亏|我的盈虧|我的盈亏)$/iu.test(text)) return { kind: "query_investor_profit" };

  const operational = parseOperationalDraft(text);
  if (operational) return { kind: "record_operational", draft: operational };

  const farmProfit = text.match(/^(.+?)\s*(?:盈虧|盈亏)$/iu);
  if (farmProfit && farmProfit[1].trim()) return { kind: "query_farm_profit", farmName: farmProfit[1].trim() };
  const summary = text.match(/^(?:今日|今天|查詢|查询|統計|统计)(?:\s*(\d+)\s*舍)?$/iu);
  if (summary) return { kind: "summary", house: summary[1] ? houseName(summary[1]) : undefined };
  return { kind: "unknown", text };
}

export function classifyInput(input: string): CommandClass {
  const command = parseCommand(input);
  if (command.kind === "unknown" && /^(?:\d+|是|好|確認|確定|否|不是)$/iu.test(normalize(input))) {
    return "PENDING_RESPONSE";
  }
  return classifyCommand(command);
}

/** Parse only the structured JSON contract returned by the Finance AI parser. */
export function parseAiIntent(raw: string): ParsedCommand | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  let value: unknown;
  try { value = JSON.parse(cleaned); } catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const intent = typeof record.intent === "string" ? record.intent : "";
  if (!SAFE_AI_INTENTS.has(intent)) return null;

  if (intent === "record_mortality" || intent === "record_inventory") {
    const house = houseFromValue(record.house);
    const amount = amountFromValue(record.amount);
    if (!house || amount === undefined) return null;
    return { kind: intent === "record_mortality" ? "mortality" : "inventory", house, amount };
  }
  if (intent === "query_today_mortality" || intent === "query_inventory") {
    if (record.house === undefined || record.house === null || record.house === "") return { kind: intent, house: undefined };
    const house = houseFromValue(record.house);
    return house ? { kind: intent, house } : null;
  }
  if (intent === "query_flock_age") {
    const house = houseFromValue(record.house);
    return house ? { kind: "query_flock_age", house } : null;
  }
  if (intent === "query_farm_profit") {
    if (typeof record.farm !== "string") return null;
    const farmName = normalize(record.farm);
    return farmName ? { kind: "query_farm_profit", farmName } : null;
  }
  if (intent === "query_farm_list") return { kind: "query_farm_list" };
  if (intent === "query_equity") return { kind: "query_equity" };
  if (intent === "query_my_equity") return { kind: "query_my_equity" };
  if (intent === "query_farm_profit_list") return { kind: "query_farm_profit_list" };
  if (intent === "query_upcoming_shipments") return { kind: "query_upcoming_shipments" };
  if (intent === "query_portfolio_profit") return { kind: "query_portfolio_profit" };
  if (intent === "query_investor_profit") return { kind: "query_investor_profit" };
  return null;
}

export interface ParsedAiOperationalIntent {
  intent: `record_${OperationalIntent}`;
  quantity: number;
  unit: "隻" | "kg" | "L";
  farmText: string | null;
  candidateFarmIds: string[];
  confidence: number;
  needsConfirmation: boolean;
  house?: string;
}

function normalizeAiUnit(intent: OperationalIntent, value: unknown): "隻" | "kg" | "L" | undefined {
  const unit = typeof value === "string" ? value.toLowerCase() : "";
  if (intent === "feed") return !unit || /^(?:kg|公斤|千克)$/iu.test(unit) ? "kg" : undefined;
  if (intent === "water") return !unit || /^(?:l|公升)$/iu.test(unit) ? "L" : undefined;
  return !unit || /^(?:隻|只|羽)$/iu.test(unit) ? "隻" : undefined;
}

/** Validate an operational AI response against known IDs; it never writes. */
export function parseAiOperationalIntent(
  raw: string,
  knownFarmIds: ReadonlySet<string>,
): ParsedAiOperationalIntent | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  let value: unknown;
  try { value = JSON.parse(cleaned); } catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawIntent = typeof record.intent === "string" ? record.intent : "";
  if (!OPERATIONAL_AI_INTENTS.has(rawIntent)) return null;
  const intent = rawIntent.slice("record_".length) as OperationalIntent;
  const quantity = positiveQuantityFromValue(record.quantity);
  const unit = normalizeAiUnit(intent, record.unit);
  if (quantity === undefined || !unit) return null;
  if (intent !== "feed" && intent !== "water" && !Number.isInteger(quantity)) return null;
  const farmText = record.farmText === null || record.farmText === undefined
    ? null
    : typeof record.farmText === "string" && normalize(record.farmText)
      ? normalize(record.farmText)
      : undefined;
  if (farmText === undefined) return null;
  if (!Array.isArray(record.candidateFarmIds) || !record.candidateFarmIds.every((id) => typeof id === "string")) return null;
  const candidateFarmIds = record.candidateFarmIds as string[];
  if (candidateFarmIds.some((id) => !knownFarmIds.has(id))) return null;
  const confidence = typeof record.confidence === "number" ? record.confidence : Number(record.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const needsConfirmation = record.needsConfirmation === true;
  const house = record.house === undefined || record.house === null ? undefined : houseFromValue(record.house);
  if (record.house !== undefined && record.house !== null && !house) return null;
  // AI output is always treated as an interpretation requiring local validation
  // and, for a farm inference, human confirmation.
  return { intent: rawIntent as `record_${OperationalIntent}`, quantity, unit, farmText, candidateFarmIds, confidence, needsConfirmation: true, house };
}

export function botName(accountName = "金雞協會助理Ai"): string {
  return `🐔 ${accountName}`;
}

export function safeRejectionReply(accountName = "金雞協會助理Ai"): string {
  return `${botName(accountName)}\n⚠️ 我目前還不確定你要查詢、修改還是記錄哪一件事，所以沒有改動資料。\n你可以再說明要查什麼，或輸入「幫助」查看可以做的事。`;
}

export function unboundReply(accountName = "金雞協會助理Ai"): string {
  return `${botName(accountName)}\n⚠️ 本群目前尚未完成資料綁定。\n目前尚未綁定雞場資料，請先完成組織綁定後再查詢。`;
}

export function officialWelcomeReply(accountName = "金雞協會助理Ai", organizationBound = false): string {
  const lines = [
    `${botName(accountName)}`,
    "可協助記錄與查詢雞場營運及投資資料。",
    "常用指令：",
    "死亡 3舍 5",
    "今天死亡",
    "目前存欄",
    "3舍日齡",
    "飼料 3舍 800kg",
    "飲水 3舍 2300L",
    "近期出雞",
    "也可以查詢：",
    "雞場列表",
    "各場持股",
    "各場盈虧",
    "我的累計盈虧",
  ];
  if (!organizationBound) lines.push("", "⚠️ 本群目前尚未完成資料綁定。");
  return lines.join("\n");
}

export function joinReply(accountName = "金雞協會助理Ai", organizationBound = false): string {
  return officialWelcomeReply(accountName, organizationBound);
}
