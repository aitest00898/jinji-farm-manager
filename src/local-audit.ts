import type {
  AbnormalEvent,
  Alias,
  AmbientPreview,
  AuditRow,
  Caretaker,
  CaretakerAssignment,
  ChartResponse,
  DataHealth,
  Farm,
  FinanceData,
  Flock,
  House,
  LineGroup,
  OperationalEvent,
  PendingCandidate,
  ReliabilityEvent,
  SystemStatus,
  TechnicalInfo,
  TestToolsData,
  TimelineItem,
  WeatherDaily,
} from "./api";

/**
 * Local external-audit mode is opt-in and intentionally has no persistence.
 * A browser query is useful for an auditor opening the normal Vite server;
 * the env flag is useful for a clearly named local-only start command.
 */
export function isLocalAuditMode(): boolean {
  const envValue = import.meta.env?.VITE_LOCAL_AUDIT_MODE;
  if (import.meta.env?.DEV && (envValue === "1" || envValue === "true")) return true;
  if (typeof window === "undefined") return false;
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  return localHost && new URLSearchParams(window.location.search).get("audit") === "local";
}

export const LOCAL_AUDIT_PASSWORD = "audit-local-only";
export const LOCAL_AUDIT_ANCHOR_DATE = "2026-08-31";
export const LOCAL_AUDIT_MODEL = "synthetic-audit-fixture";

/** The audit mirror is deterministic; Production keeps its real-time clock. */
export function auditToday(): string {
  return LOCAL_AUDIT_ANCHOR_DATE;
}

let networkGuardInstalled = false;

/** Block accidental calls to a remote API while local audit mode is active. */
export function installLocalAuditNetworkGuard(): void {
  if (!isLocalAuditMode() || networkGuardInstalled || typeof window === "undefined") return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (requestUrl.origin !== window.location.origin) return Promise.reject(new Error("LOCAL_AUDIT_NETWORK_BLOCKED"));
    return originalFetch(input, init);
  }) as typeof window.fetch;
  networkGuardInstalled = true;
}

type LocalApiError = Error & { status: number; code?: string };

function localError(status: number, code: string, message: string): LocalApiError {
  const error = new Error(message) as LocalApiError;
  error.status = status;
  error.code = code;
  return error;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

function timestamp(minute: number): string {
  return `${auditToday()}T12:${String(minute % 60).padStart(2, "0")}:00Z`;
}

function farmRecord(
  id: string,
  name: string,
  environment: Farm["environment"],
  structureMode: Farm["structureMode"],
  siteName: string,
  note: string | null,
): Farm {
  return {
    id,
    name,
    siteName,
    active: true,
    environment,
    structureMode,
    note,
    version: 1,
    playerGroupEquityFraction: environment === "production" ? 0.6 : 0,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-31T08:00:00Z",
  };
}

function houseRecord(
  id: string,
  farm: Farm,
  name: string,
  capacity: number | null,
  active = true,
): House {
  return {
    id,
    farmId: farm.id,
    name,
    normalizedName: name,
    capacity,
    active,
    note: active ? "本地固定資料：可用於稽核。" : "本地固定資料：已封存。",
    version: 1,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-31T08:00:00Z",
    farmName: farm.name,
    farmEnvironment: farm.environment,
  };
}

function flockRecord(
  id: string,
  farm: Farm,
  house: House,
  batchCode: string,
  chickInDate: string,
  initialCount: number,
  expectedShipmentDate: string | null,
  status: Flock["status"],
): Flock {
  const today = auditToday();
  const reminder = expectedShipmentDate
    ? expectedShipmentDate < today
      ? "overdue"
      : expectedShipmentDate === today
        ? "today"
        : daysBetween(today, expectedShipmentDate) <= 7
          ? "upcoming"
          : null
    : null;
  return {
    id,
    farmId: farm.id,
    houseId: house.id,
    batchCode,
    breed: batchCode.includes("RED") ? "紅羽土雞" : batchCode.includes("BLACK") ? "黑羽土雞" : batchCode.includes("SILK") ? "烏骨雞" : batchCode.includes("NEW") ? "白羽新品系" : "黃金土雞",
    chickInDate,
    initialCount,
    expectedShipmentDate,
    actualShipmentDate: status === "closed" ? "2026-08-29" : null,
    status,
    note: status === "closed" ? "本地歷史批次，用於更正與出雞檢視。" : null,
    version: 1,
    ageDays: daysBetween(chickInDate, today),
    shipmentReminder: status === "active" ? reminder : null,
    farmName: farm.name,
    houseName: house.name,
  };
}

function eventRecord(
  id: string,
  farm: Farm,
  house: House,
  flock: Flock,
  intent: string,
  quantity: number,
  unit: string,
  eventDate: string,
  note: string | null = null,
  extra: Partial<OperationalEvent> = {},
): OperationalEvent {
  return {
    id,
    farmId: farm.id,
    farmName: farm.name,
    environment: farm.environment,
    source: "local_audit",
    houseId: house.id,
    house: house.name,
    flockId: flock.id,
    intent,
    quantity,
    unit,
    eventDate,
    note,
    reversedAt: null,
    reversalReason: null,
    sourceEventId: `synthetic-source-${id}`,
    createdAt: `${eventDate}T08:00:00Z`,
    ...extra,
  };
}

function abnormalRecord(
  id: string,
  farm: Farm,
  house: House,
  flock: Flock,
  rawText: string,
  category: string,
  occurredDate: string,
  tags: string[],
  extra: Partial<AbnormalEvent> = {},
): AbnormalEvent {
  return {
    id,
    farmId: farm.id,
    farmName: farm.name,
    environment: farm.environment,
    houseId: house.id,
    houseName: house.name,
    flockId: flock.id,
    occurredAt: `${occurredDate}T09:30:00Z`,
    occurredDate,
    approximatePeriod: "上午",
    reportedAt: `${occurredDate}T10:00:00Z`,
    rawText,
    source: "local_audit_fixture",
    category,
    tags,
    confidence: 0.86,
    classificationStatus: "classified",
    weatherDate: occurredDate,
    maxTemperatureC: 29.4,
    maxTemperatureAt: `${occurredDate}T13:00:00+08:00`,
    status: "active",
    correctionOfId: null,
    reversalOfId: null,
    reason: null,
    createdAt: `${occurredDate}T10:00:00Z`,
    ...extra,
  };
}

function assignmentRecord(id: string, caretaker: Caretaker, farm: Farm, effectiveFrom: string, isPrimary: boolean, effectiveTo: string | null = null): CaretakerAssignment & { id: string } {
  return { id, farmId: farm.id, farmName: farm.name, effectiveFrom, effectiveTo, isPrimary };
}

function auditRecord(
  id: string,
  source: AuditRow["source"],
  action: string,
  entityType: string,
  entityId: string,
  actorType: string,
  reason: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  changedFields: string[] | Array<Record<string, unknown>>,
  minute: number,
): AuditRow {
  return {
    id,
    source,
    actorType,
    actorId: source === "system" ? null : "synthetic-audit-admin",
    action,
    entityType,
    entityId,
    before,
    after,
    changedFields: changedFields as string[],
    reason,
    requestId: `synthetic-request-${id}`,
    createdAt: timestamp(minute),
  };
}

export interface LocalAuditState {
  authenticated: boolean;
  sequence: number;
  organization: { id: string; name: string; active: boolean };
  farms: Farm[];
  houses: House[];
  flocks: Flock[];
  caretakers: Caretaker[];
  events: OperationalEvent[];
  abnormalEvents: AbnormalEvent[];
  weather: WeatherDaily[];
  audit: AuditRow[];
  reliabilityEvents: ReliabilityEvent[];
  lineGroups: LineGroup[];
  aliases: Alias[];
  finance: FinanceData;
  pendingCandidates: PendingCandidate[];
  ambientPreview: AmbientPreview;
}

function baselineState(): LocalAuditState {
  const farm1 = farmRecord("synthetic-audit-farm-red-01", "稽核紅羽一場", "production", "multi_house", "本地東區", "多舍、正常營運樣本；所有內容皆為本地虛擬資料。\n可用來檢視長備註與場務流程。 ");
  const farm2 = farmRecord("synthetic-audit-farm-black-02", "稽核黑羽二場", "production", "whole_farm", "本地南區", "含死亡、淘汰與異常樣本。 ");
  const farm3 = farmRecord("synthetic-audit-farm-silkie-03", "稽核烏骨三場", "test", "multi_house", "本地西區", "測試環境多舍資料；不代表任何正式雞場。 ");
  const farm4 = farmRecord("synthetic-audit-farm-new-04", "稽核新批四場", "test", "multi_house", "本地北區", null);
  const farm5 = farmRecord("synthetic-audit-farm-history-05", "稽核歷史五場", "production", "whole_farm", "本地中區", "含目前批次、已出雞批次與歷史更正樣本。 ");
  farm5.playerGroupEquityFraction = 0.98;
  const farms = [farm1, farm2, farm3, farm4, farm5];

  const h11 = houseRecord("synthetic-audit-house-red-1", farm1, "紅羽一舍", 1300);
  const h12 = houseRecord("synthetic-audit-house-red-2", farm1, "紅羽二舍", 1000);
  const h21 = houseRecord("synthetic-audit-house-black-1", farm2, "黑羽主舍", 1600);
  const h31 = houseRecord("synthetic-audit-house-silkie-1", farm3, "烏骨一舍", 700);
  const h32 = houseRecord("synthetic-audit-house-silkie-2", farm3, "烏骨二舍", 500);
  const h33 = houseRecord("synthetic-audit-house-silkie-3", farm3, "烏骨三舍", 500, false);
  const h41 = houseRecord("synthetic-audit-house-new-1", farm4, "新批主舍", 900);
  const h42 = houseRecord("synthetic-audit-house-new-2", farm4, "新批副舍", 700);
  const h51 = houseRecord("synthetic-audit-house-history-1", farm5, "歷史主舍", 1100);
  const houses = [h11, h12, h21, h31, h32, h33, h41, h42, h51];

  const f1 = flockRecord("synthetic-audit-flock-red-alpha", farm1, h11, "AUDIT-RED-ALPHA", "2026-07-20", 1200, "2026-09-03", "active");
  const f2 = flockRecord("synthetic-audit-flock-red-beta", farm1, h12, "AUDIT-RED-BETA", "2026-07-25", 900, "2026-09-12", "active");
  const f3 = flockRecord("synthetic-audit-flock-black-main", farm2, h21, "AUDIT-BLACK-MAIN", "2026-07-10", 1500, "2026-09-01", "active");
  const f4 = flockRecord("synthetic-audit-flock-silkie-alpha", farm3, h31, "AUDIT-SILK-ALPHA", "2026-08-01", 600, "2026-09-06", "active");
  const f5 = flockRecord("synthetic-audit-flock-silkie-history", farm3, h32, "AUDIT-SILK-HISTORY", "2026-07-01", 450, null, "closed");
  const f6 = flockRecord("synthetic-audit-flock-new-main", farm4, h41, "AUDIT-NEW-MAIN", "2026-08-29", 800, "2026-09-01", "active");
  const f7 = flockRecord("synthetic-audit-flock-history-now", farm5, h51, "AUDIT-HISTORY-NOW", "2026-08-10", 1000, "2026-09-10", "active");
  const f8 = { ...flockRecord("synthetic-audit-flock-history-old", farm5, h51, "AUDIT-HISTORY-OLD", "2026-06-01", 700, "2026-07-31", "closed"), actualShipmentDate: "2026-07-31" };
  const flocks = [f1, f2, f3, f4, f5, f6, f7, f8];

  const events = [
    eventRecord("synthetic-audit-event-001", farm1, h11, f1, "mortality", 8, "隻", "2026-08-27", "巡場記錄。"),
    eventRecord("synthetic-audit-event-002", farm1, h11, f1, "cull", 4, "隻", "2026-08-28", "已確認為誤登。", { reversedAt: "2026-08-29T02:00:00Z", reversalReason: "本地稽核反轉樣本。" }),
    eventRecord("synthetic-audit-event-003", farm1, h11, f1, "feed", 240, "kg", "2026-08-29"),
    eventRecord("synthetic-audit-event-004", farm1, h11, f1, "water", 480, "L", "2026-08-29"),
    eventRecord("synthetic-audit-event-005", farm1, h12, f2, "feed", 180, "kg", "2026-08-30"),
    eventRecord("synthetic-audit-event-006", farm1, h12, f2, "water", 360, "L", "2026-08-30"),
    eventRecord("synthetic-audit-event-007", farm2, h21, f3, "mortality", 10, "隻", "2026-08-28", "原始數量，保留供修正鏈檢視。", { reversedAt: "2026-08-29T03:00:00Z", reversalReason: "修正流程會先反轉原事件。" }),
    eventRecord("synthetic-audit-event-008", farm2, h21, f3, "mortality", 12, "隻", "2026-08-28", "修正後數量。", { correctionOfEventId: "synthetic-audit-event-007" }),
    eventRecord("synthetic-audit-event-009", farm2, h21, f3, "cull", 6, "隻", "2026-08-29"),
    eventRecord("synthetic-audit-event-010", farm2, h21, f3, "feed", 300, "kg", "2026-08-30"),
    eventRecord("synthetic-audit-event-011", farm2, h21, f3, "water", 600, "L", "2026-08-30"),
    eventRecord("synthetic-audit-event-012", farm3, h31, f4, "mortality", 3, "隻", "2026-08-29"),
    eventRecord("synthetic-audit-event-013", farm3, h32, f5, "mortality", 5, "隻", "2026-08-27"),
    eventRecord("synthetic-audit-event-014", farm3, h32, f5, "cull", 3, "隻", "2026-08-28"),
    eventRecord("synthetic-audit-event-015", farm3, h32, f5, "shipment", 442, "隻", "2026-08-29"),
    eventRecord("synthetic-audit-event-016", farm4, h41, f6, "feed", 210, "kg", "2026-08-30"),
    eventRecord("synthetic-audit-event-017", farm4, h41, f6, "water", 420, "L", "2026-08-30"),
    eventRecord("synthetic-audit-event-018", farm5, h51, f7, "mortality", 10, "隻", "2026-08-25"),
    eventRecord("synthetic-audit-event-019", farm5, h51, f7, "cull", 5, "隻", "2026-08-26"),
    eventRecord("synthetic-audit-event-020", farm5, h51, f8, "mortality", 10, "隻", "2026-07-25"),
    eventRecord("synthetic-audit-event-021", farm5, h51, f8, "shipment", 690, "隻", "2026-07-31"),
    eventRecord("synthetic-audit-event-022", farm5, h51, f7, "feed", 220, "kg", "2026-08-24"),
    eventRecord("synthetic-audit-event-023", farm1, h11, f1, "mortality", 2, "隻", auditToday(), "固定錨點今日事件。"),
    eventRecord("synthetic-audit-event-024", farm2, h21, f3, "mortality", 4, "隻", "2026-08-27", "多日圖表樣本。"),
    eventRecord("synthetic-audit-event-025", farm2, h21, f3, "cull", 2, "隻", "2026-08-30", "多日圖表樣本。"),
    eventRecord("synthetic-audit-event-026", farm3, h31, f4, "feed", 150, "kg", "2026-08-27", "多日圖表樣本。"),
    eventRecord("synthetic-audit-event-027", farm3, h31, f4, "water", 300, "L", "2026-08-28", "多日圖表樣本。"),
    eventRecord("synthetic-audit-event-028", farm4, h41, f6, "mortality", 2, "隻", auditToday(), "多環境圖表樣本。"),
    eventRecord("synthetic-audit-event-029", farm5, h51, f7, "feed", 260, "kg", "2026-08-27", "多日圖表樣本。"),
    eventRecord("synthetic-audit-event-030", farm1, h11, f1, "shipment", 100, "隻", auditToday(), "多日圖表樣本。"),
  ];

  const caretakerA: Caretaker = { id: "synthetic-audit-caretaker-a", name: "模擬飼養員－陳甲", active: true, note: "一般場務樣本。", version: 1 };
  const caretakerB: Caretaker = { id: "synthetic-audit-caretaker-b", name: "模擬飼養員－林乙", active: true, note: "接近出雞場務樣本。", version: 1 };
  const caretakerC: Caretaker = { id: "synthetic-audit-caretaker-c", name: "模擬飼養員－黃丙", active: true, note: "多舍異常追蹤樣本。", version: 1 };
  const caretakerD: Caretaker = { id: "synthetic-audit-caretaker-d", name: "模擬飼養員－蔡戊", active: true, note: "歷史批次樣本。", version: 1 };
  const caretakerE: Caretaker = { id: "synthetic-audit-caretaker-e", name: "模擬飼養員－吳丁", active: true, note: "新批入雛樣本。", version: 1 };
  const caretakerF: Caretaker = { id: "synthetic-audit-caretaker-f", name: "模擬副手－周丙", active: true, note: "多飼養者與歷史指派樣本。", version: 1 };
  const caretakers = [caretakerA, caretakerB, caretakerC, caretakerD, caretakerE, caretakerF];
  caretakerA.assignments = [assignmentRecord("synthetic-audit-assignment-001", caretakerA, farm1, "2026-08-01", true)];
  caretakerB.assignments = [assignmentRecord("synthetic-audit-assignment-002", caretakerB, farm2, "2026-08-01", true), assignmentRecord("synthetic-audit-assignment-003", caretakerB, farm3, "2026-08-10", false)];
  caretakerC.assignments = [assignmentRecord("synthetic-audit-assignment-004", caretakerC, farm3, "2026-08-01", true)];
  caretakerD.assignments = [assignmentRecord("synthetic-audit-assignment-005", caretakerD, farm5, "2026-08-01", true)];
  caretakerE.assignments = [assignmentRecord("synthetic-audit-assignment-006", caretakerE, farm4, "2026-08-01", true)];
  caretakerF.assignments = [assignmentRecord("synthetic-audit-assignment-007", caretakerF, farm3, "2026-08-01", false), assignmentRecord("synthetic-audit-assignment-008", caretakerF, farm4, "2026-07-01", false, "2026-07-31")];

  const abnormalEvents = [
    abnormalRecord("synthetic-audit-abnormal-001", farm2, h21, f3, "黑羽主舍持續咳嗽", "health", "2026-08-30", ["咳嗽", "健康"]),
    abnormalRecord("synthetic-audit-abnormal-002", farm3, h31, f4, "飲水器流量變小", "equipment", "2026-08-29", ["飲水", "設備"]),
    abnormalRecord("synthetic-audit-abnormal-003", farm3, h32, f5, "飲水器流量變小", "water", auditToday(), ["飲水", "異常"]),
    abnormalRecord("synthetic-audit-abnormal-004", farm5, h51, f7, "歷史高溫紀錄待修正", "weather_disaster", "2026-08-27", ["高溫"], { status: "corrected" }),
    abnormalRecord("synthetic-audit-abnormal-005", farm5, h51, f7, "歷史高溫紀錄已修正", "weather_disaster", "2026-08-27", ["高溫", "修正"], { correctionOfId: "synthetic-audit-abnormal-004" }),
    abnormalRecord("synthetic-audit-abnormal-006", farm4, h41, f6, "飼料盤測試原始訊息", "feed", "2026-08-30", ["飼料"], { status: "reversed", reason: "本地反轉樣本。" }),
    abnormalRecord("synthetic-audit-abnormal-007", farm4, h41, f6, "飼料盤測試訊息（已反轉）", "feed", "2026-08-30", ["飼料", "反轉"], { status: "reversal", reversalOfId: "synthetic-audit-abnormal-006", classificationStatus: "skipped", reason: "本地反轉樣本。" }),
    abnormalRecord("synthetic-audit-abnormal-008", farm1, h11, f1, "紅羽一舍通風異常", "equipment", "2026-08-27", ["通風", "設備"]),
    abnormalRecord("synthetic-audit-abnormal-009", farm2, h21, f3, "黑羽主舍溫度偏高", "weather_disaster", "2026-08-28", ["高溫", "環境"]),
    abnormalRecord("synthetic-audit-abnormal-010", farm4, h41, f6, "新批飲水記錄待看", "water", "2026-08-31", ["飲水"]),
    abnormalRecord("synthetic-audit-abnormal-011", farm5, h51, f7, "歷史舍區異常追蹤", "health", "2026-08-29", ["健康", "追蹤"]),
  ];

  const weather: WeatherDaily[] = [
    { id: "synthetic-audit-weather-001", farmId: null, farmName: "本地稽核區域", environment: "production", weatherScope: "area", weatherDate: "2026-08-27", condition: "晴時多雲", maxTemperatureC: 30.2, maxTemperatureAt: "2026-08-27T13:00:00+08:00", minTemperatureC: 24.8, minTemperatureAt: "2026-08-27T05:30:00+08:00", provider: "local-fixture", fetchStatus: "captured", errorCode: null, fetchedAt: "2026-08-27T06:00:00Z" },
    { id: "synthetic-audit-weather-002", farmId: null, farmName: "本地稽核區域", environment: "production", weatherScope: "area", weatherDate: "2026-08-28", condition: "炎熱", maxTemperatureC: 32.4, maxTemperatureAt: "2026-08-28T13:00:00+08:00", minTemperatureC: 25.6, minTemperatureAt: "2026-08-28T05:30:00+08:00", provider: "local-fixture", fetchStatus: "captured", errorCode: null, fetchedAt: "2026-08-28T06:00:00Z" },
    { id: "synthetic-audit-weather-003", farmId: null, farmName: "本地稽核區域", environment: "production", weatherScope: "area", weatherDate: "2026-08-29", condition: "短暫雨", maxTemperatureC: 28.7, maxTemperatureAt: "2026-08-29T12:00:00+08:00", minTemperatureC: 23.4, minTemperatureAt: "2026-08-29T05:30:00+08:00", provider: "local-fixture", fetchStatus: "backfilled", errorCode: null, fetchedAt: "2026-08-30T06:00:00Z" },
    { id: "synthetic-audit-weather-004", farmId: null, farmName: "本地稽核區域", environment: "production", weatherScope: "area", weatherDate: "2026-08-30", condition: "炎熱", maxTemperatureC: 33.8, maxTemperatureAt: "2026-08-30T13:00:00+08:00", minTemperatureC: 26.2, minTemperatureAt: "2026-08-30T05:30:00+08:00", provider: "local-fixture", fetchStatus: "captured", errorCode: null, fetchedAt: "2026-08-30T06:00:00Z" },
    { id: "synthetic-audit-weather-005", farmId: null, farmName: "本地稽核區域", environment: "production", weatherScope: "area", weatherDate: auditToday(), condition: "晴時多雲", maxTemperatureC: 31.2, maxTemperatureAt: "2026-08-31T13:00:00+08:00", minTemperatureC: 25.1, minTemperatureAt: "2026-08-31T05:30:00+08:00", provider: "local-fixture", fetchStatus: "captured", errorCode: null, fetchedAt: "2026-08-31T06:00:00Z" },
  ];

  for (const event of abnormalEvents) {
    const snapshot = weather.find((row) => row.weatherDate === event.occurredDate);
    event.weatherDate = snapshot?.weatherDate ?? null;
    event.maxTemperatureC = snapshot?.maxTemperatureC ?? null;
    event.maxTemperatureAt = snapshot?.maxTemperatureAt ?? null;
  }

  const audit = [
    auditRecord("synthetic-audit-log-001", "migration", "local_fixture_loaded", "audit_environment", "synthetic-audit-org", "system", "本地固定基線", null, { farms: 5, caretakers: 6 }, ["farms", "caretakers"], 1),
    auditRecord("synthetic-audit-log-002", "web", "farm_note_updated", "farm", farm1.id, "web_admin", "固定備註樣本", { note: null }, { note: farm1.note }, ["note"], 2),
    auditRecord("synthetic-audit-log-003", "line", "operational_event_created", "operational_event", events[0].id, "line_user", "本地 LINE 樣本", null, { intent: "mortality", quantity: 8 }, ["intent", "quantity"], 3),
    auditRecord("synthetic-audit-log-004", "web", "operational_event_reversed", "operational_event", events[1].id, "web_admin", "本地反轉樣本", { reversedAt: null }, { reversedAt: events[1].reversedAt }, ["reversedAt", "reversalReason"], 4),
    auditRecord("synthetic-audit-log-005", "web", "operational_event_corrected", "operational_event", events[7].id, "web_admin", "本地修正樣本", { quantity: 10 }, { quantity: 12 }, [{ field: "quantity", from: 10, to: 12 }], 5),
    auditRecord("synthetic-audit-log-006", "system", "abnormal_classified", "abnormal_event", abnormalEvents[0].id, "system", "本地分類樣本", { classificationStatus: "pending" }, { classificationStatus: "classified" }, ["classificationStatus", "category"], 6),
    auditRecord("synthetic-audit-log-007", "web", "caretaker_assigned", "caretaker_assignment", "synthetic-audit-assignment-001", "web_admin", "本地責任指派樣本", null, { farmId: farm1.id, isPrimary: true }, ["farmId", "isPrimary"], 7),
    auditRecord("synthetic-audit-log-008", "web", "line_group_ai_updated", "line_group_ai_conversation", "synthetic-audit-group-001", "web_admin", "本地設定樣本", { conversationV2Enabled: false }, { conversationV2Enabled: true }, [{ field: "conversationV2Enabled", from: false, to: true }], 8),
    auditRecord("synthetic-audit-log-009", "system", "reliability_retained", "reliability_event", "synthetic-audit-reliability-001", "system", "本地可靠性樣本", null, { lifecycleStatus: "retained" }, ["lifecycleStatus"], 9),
    auditRecord("synthetic-audit-log-010", "web", "abnormal_corrected", "abnormal_event", abnormalEvents[4].id, "web_admin", "本地異常修正樣本", { rawText: "歷史溫度紀錄待修正" }, { rawText: abnormalEvents[4].rawText }, ["rawText", "correctionOfId"], 10),
    auditRecord("synthetic-audit-log-011", "migration", "finance_fixture_loaded", "finance_snapshot", "synthetic-audit-finance", "system", "本地財務樣本", null, { net: 86000 }, ["net"], 11),
    auditRecord("synthetic-audit-log-012", "line", "pending_candidate_created", "pending_candidate", "synthetic-audit-pending-001", "line_user", "本地待確認樣本", null, { status: "pending" }, ["status"], 12),
  ];

  const reliabilityEvents: ReliabilityEvent[] = [
    {
      eventId: "synthetic-audit-reliability-001", eventIdShort: "audit-rel-001", correlationIdShort: "audit-cor-001", lifecycleStatus: "retained", businessStatus: "failed", replyStatus: "failed", receivedAt: "2026-08-31T03:00:00Z", queuedAt: "2026-08-31T03:00:01Z", processingStartedAt: "2026-08-31T03:00:02Z", businessCompletedAt: null, replyCompletedAt: null, queueAttempts: 2, processingAttempts: 3, replyAttempts: 0, lastErrorStage: "processing", lastErrorClass: "synthetic_temporary_failure", lastErrorAt: "2026-08-31T03:02:00Z", nextRetryAt: null, resolutionStatus: "unresolved", retainedAcknowledgedAt: null, retainedAcknowledgedBy: null, resolvedAt: null, resolvedBy: null, resolutionReason: null, resolutionNote: null, manualRecordReference: null, payloadAvailable: true, payloadExpiresAt: "2026-09-01T03:00:00Z",
    },
    {
      eventId: "synthetic-audit-reliability-002", eventIdShort: "audit-rel-002", correlationIdShort: "audit-cor-002", lifecycleStatus: "reply_completed", businessStatus: "completed", replyStatus: "completed", receivedAt: "2026-08-31T04:00:00Z", queuedAt: "2026-08-31T04:00:01Z", processingStartedAt: "2026-08-31T04:00:02Z", businessCompletedAt: "2026-08-31T04:00:04Z", replyCompletedAt: "2026-08-31T04:00:05Z", queueAttempts: 1, processingAttempts: 1, replyAttempts: 1, lastErrorStage: null, lastErrorClass: null, lastErrorAt: null, nextRetryAt: null, resolutionStatus: "completed", retainedAcknowledgedAt: null, retainedAcknowledgedBy: null, resolvedAt: "2026-08-31T04:00:05Z", resolvedBy: "system", resolutionReason: null, resolutionNote: null, manualRecordReference: null, payloadAvailable: false, payloadExpiresAt: null,
    },
    {
      eventId: "synthetic-audit-reliability-003", eventIdShort: "audit-rel-003", correlationIdShort: "audit-cor-003", lifecycleStatus: "retained", businessStatus: "failed", replyStatus: "failed", receivedAt: "2026-08-30T05:00:00Z", queuedAt: "2026-08-30T05:00:01Z", processingStartedAt: "2026-08-30T05:00:02Z", businessCompletedAt: null, replyCompletedAt: null, queueAttempts: 3, processingAttempts: 3, replyAttempts: 1, lastErrorStage: "expiry_cleanup", lastErrorClass: "synthetic_expired_payload", lastErrorAt: "2026-08-30T05:10:00Z", nextRetryAt: null, resolutionStatus: "force_closed", retainedAcknowledgedAt: "2026-08-30T06:00:00Z", retainedAcknowledgedBy: "synthetic-audit-admin", resolvedAt: "2026-08-30T06:10:00Z", resolvedBy: "synthetic-audit-admin", resolutionReason: "本地歷史結案樣本", resolutionNote: "不含原始內容。", manualRecordReference: null, payloadAvailable: false, payloadExpiresAt: "2026-08-30T05:30:00Z",
    },
    {
      eventId: "synthetic-audit-reliability-004", eventIdShort: "audit-rel-004", correlationIdShort: "audit-cor-004", lifecycleStatus: "retained", businessStatus: "failed", replyStatus: "failed", receivedAt: "2026-08-31T05:00:00Z", queuedAt: "2026-08-31T05:00:01Z", processingStartedAt: "2026-08-31T05:00:02Z", businessCompletedAt: null, replyCompletedAt: null, queueAttempts: 1, processingAttempts: 1, replyAttempts: 0, lastErrorStage: "reply", lastErrorClass: "synthetic_reply_uncertain", lastErrorAt: "2026-08-31T05:02:00Z", nextRetryAt: null, resolutionStatus: "acknowledged", retainedAcknowledgedAt: "2026-08-31T05:10:00Z", retainedAcknowledgedBy: "synthetic-audit-admin", resolvedAt: null, resolvedBy: null, resolutionReason: null, resolutionNote: null, manualRecordReference: null, payloadAvailable: false, payloadExpiresAt: null,
    },
  ];

  const lineGroups: LineGroup[] = [
    { groupId: "synthetic-audit-group-001", groupIdShort: "audit-grp-001", status: "active", farmName: farm1.name, farmId: farm1.id, conversationV2Enabled: true },
    { groupId: "synthetic-audit-group-002", groupIdShort: "audit-grp-002", status: "unbound", farmName: null, farmId: null, conversationV2Enabled: false },
    { groupId: "synthetic-audit-group-003", groupIdShort: "audit-grp-003", status: "left", farmName: farm3.name, farmId: farm3.id, conversationV2Enabled: false },
  ];

  const aliases: Alias[] = [
    { id: "synthetic-audit-alias-001", farmId: farm1.id, farmName: farm1.name, alias: "紅羽一", normalizedAlias: "紅羽一", aliasType: "short", status: "trusted", confirmationCount: 4, lastConfirmedAt: "2026-08-30", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" },
    { id: "synthetic-audit-alias-002", farmId: farm2.id, farmName: farm2.name, alias: "黑羽二場（口語）", normalizedAlias: "黑羽二場", aliasType: "spoken", status: "pending", confirmationCount: 1, lastConfirmedAt: null, createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z" },
    { id: "synthetic-audit-alias-003", farmId: farm3.id, farmName: farm3.name, alias: "舊烏骨名稱", normalizedAlias: "舊烏骨名稱", aliasType: "historical", status: "disabled", confirmationCount: 0, lastConfirmedAt: null, createdAt: "2026-08-05T00:00:00Z", updatedAt: "2026-08-05T00:00:00Z" },
  ];

  const finance: FinanceData = {
    totals: { gross: 175000, allocated: 124000, expense: 38000, net: 86000 },
    investors: [
      { id: "synthetic-audit-investor-001", name: "稽核投資人甲", amount: 65500 },
      { id: "synthetic-audit-investor-002", name: "稽核投資人乙", amount: 41700 },
      { id: "synthetic-audit-investor-003", name: "稽核投資人丙", amount: 16800 },
    ],
    farms: [
      { id: farm1.id, name: farm1.name, playerGroupEquityFraction: farm1.playerGroupEquityFraction, net: 21000 },
      { id: farm2.id, name: farm2.name, playerGroupEquityFraction: farm2.playerGroupEquityFraction, net: 24000 },
      { id: farm5.id, name: farm5.name, playerGroupEquityFraction: farm5.playerGroupEquityFraction, net: 41000 },
    ],
    distributions: [
      { id: "synthetic-audit-distribution-001", farmId: farm1.id, farmName: farm1.name, distributionDate: "2026-08-15", grossProfitLoss: 55000, allocatedProfitLoss: 33000, expense: 12000, netIncome: 21000, sourceDataset: "local-fixture" },
      { id: "synthetic-audit-distribution-002", farmId: farm2.id, farmName: farm2.name, distributionDate: "2026-08-20", grossProfitLoss: 70000, allocatedProfitLoss: 42000, expense: 18000, netIncome: 24000, sourceDataset: "local-fixture" },
      { id: "synthetic-audit-distribution-003", farmId: farm5.id, farmName: farm5.name, distributionDate: "2026-08-25", grossProfitLoss: 50000, allocatedProfitLoss: 49000, expense: 8000, netIncome: 41000, sourceDataset: "local-fixture" },
    ],
    allocations: [
      { id: "synthetic-audit-allocation-001", distributionId: "synthetic-audit-distribution-001", investorName: "稽核投資人甲", amount: 16500 },
      { id: "synthetic-audit-allocation-002", distributionId: "synthetic-audit-distribution-001", investorName: "稽核投資人乙", amount: 16500 },
      { id: "synthetic-audit-allocation-003", distributionId: "synthetic-audit-distribution-002", investorName: "稽核投資人乙", amount: 25200 },
      { id: "synthetic-audit-allocation-004", distributionId: "synthetic-audit-distribution-002", investorName: "稽核投資人丙", amount: 16800 },
      { id: "synthetic-audit-allocation-005", distributionId: "synthetic-audit-distribution-003", investorName: "稽核投資人甲", amount: 49000 },
    ],
    farmInvestorEquity: [
      { id: "synthetic-audit-equity-001", farmName: farm1.name, investorName: "稽核投資人甲", equityFraction: 0.3, source: "local-fixture", effectiveDate: "2026-08-01" },
      { id: "synthetic-audit-equity-002", farmName: farm1.name, investorName: "稽核投資人乙", equityFraction: 0.3, source: "local-fixture", effectiveDate: "2026-08-01" },
      { id: "synthetic-audit-equity-003", farmName: farm2.name, investorName: "稽核投資人乙", equityFraction: 0.36, source: "local-fixture", effectiveDate: "2026-08-01" },
      { id: "synthetic-audit-equity-004", farmName: farm2.name, investorName: "稽核投資人丙", equityFraction: 0.24, source: "local-fixture", effectiveDate: "2026-08-01" },
      { id: "synthetic-audit-equity-005", farmName: farm5.name, investorName: "稽核投資人甲", equityFraction: 0.98, source: "local-fixture", effectiveDate: "2026-08-01" },
    ],
  };

  const pendingCandidates: PendingCandidate[] = [
    {
      idShort: "audit-pending-001", groupIdShort: "audit-grp-002", status: "pending", hourBucket: "2026-08-31 10", createdTimeTaipei: "2026/08/31 10:12", expiresAt: "2026-09-01T02:12:00Z", source: "local_audit_fixture", sourceMessageCount: 2, sourceIdsShort: ["audit-msg-001", "audit-msg-002"], sourceTimestamps: ["2026-08-31T02:10:00Z", "2026-08-31T02:12:00Z"], workflowHistoryAvailable: true, entries: [{ event: "死亡", quantity: 4, farm: farm2.name, house: h21.name, batch: f3.batchCode, state: "等待確認", conflict: true, conflictText: "兩段虛擬訊息數量不同。", blocking: true, caretakerClues: ["模擬飼養員－林乙"], reconciliation: "not_recorded", evidenceCount: 2, sourceTimestamps: ["2026-08-31T02:10:00Z", "2026-08-31T02:12:00Z"] }],
    },
    {
      idShort: "audit-pending-002", groupIdShort: "audit-grp-001", status: "pending", hourBucket: "2026-08-31 11", createdTimeTaipei: "2026/08/31 11:04", expiresAt: "2026-09-01T03:04:00Z", source: "local_audit_fixture", sourceMessageCount: 1, sourceIdsShort: ["audit-msg-003"], sourceTimestamps: ["2026-08-31T03:04:00Z"], workflowHistoryAvailable: true, entries: [{ event: "異常", quantity: null, farm: farm1.name, house: h11.name, batch: f1.batchCode, state: "等待確認", conflict: false, conflictText: null, blocking: false, caretakerClues: [], reconciliation: "not_recorded", evidenceCount: 1, sourceTimestamps: ["2026-08-31T03:04:00Z"] }],
    },
    {
      idShort: "audit-pending-003", groupIdShort: "audit-grp-003", status: "expired", hourBucket: "2026-08-30 08", createdTimeTaipei: "2026/08/30 08:20", expiresAt: "2026-08-31T00:20:00Z", source: "local_audit_fixture", sourceMessageCount: 3, sourceIdsShort: ["audit-msg-004"], sourceTimestamps: ["2026-08-30T00:20:00Z"], workflowHistoryAvailable: false, entries: [{ event: "死亡", quantity: null, farm: farm3.name, house: "—", batch: "—", state: "已過期", conflict: false, conflictText: null, blocking: false, caretakerClues: [], reconciliation: "not_recorded", evidenceCount: 0, sourceTimestamps: [] }],
    },
  ];

  const ambientPreview: AmbientPreview = {
    cutoffAt: "2026-08-31T04:00:00Z", page: 0, pageSize: 2, total: 3, totalPages: 2, candidateLikeCount: 2, excludedCount: 1, openCandidateCount: 2, processed24hCount: 0, expiredDiagnosticCount: 0, expiredDiagnostics: [], truncated: true, readOnly: true,
    rows: [
      { idShort: "audit-msg-001", groupIdShort: "audit-grp-002", sourceIdShort: "audit-src-001", eventTimestamp: "2026-08-31T02:10:00Z", eventTimeTaipei: "2026/08/31 10:10", expiresAt: "2026-09-01T02:10:00Z", text: "稽核資料待確認：死亡數量有兩種說法。", candidateLike: true },
      { idShort: "audit-msg-002", groupIdShort: "audit-grp-002", sourceIdShort: "audit-src-002", eventTimestamp: "2026-08-31T02:12:00Z", eventTimeTaipei: "2026/08/31 10:12", expiresAt: "2026-09-01T02:12:00Z", text: "一般聊天樣本，不建立正式紀錄。", candidateLike: false },
    ],
  };

  return { authenticated: false, sequence: 20, organization: { id: "synthetic-audit-org", name: "本地稽核虛擬組合", active: true }, farms, houses, flocks, caretakers, events, abnormalEvents, weather, audit, reliabilityEvents, lineGroups, aliases, finance, pendingCandidates, ambientPreview };
}

let localState = baselineState();

export function resetLocalAuditState(): void {
  localState = baselineState();
}

export function getLocalAuditStateSnapshot(): LocalAuditState {
  return copy(localState);
}

export interface FixtureGraphValidation {
  operational: { correctionsChecked: number; reversalsChecked: number; invalidLinks: number; cycles: number; duplicateActiveReplacements: number };
  abnormal: { correctionsChecked: number; reversalsChecked: number; invalidLinks: number; cycles: number; duplicateActiveReplacements: number };
  pass: boolean;
}

function countCorrectionCycles<T extends { id: string; correctionOfEventId?: string | null; correctionOfId?: string | null }>(rows: T[], parentKey: "correctionOfEventId" | "correctionOfId"): number {
  const parents = new Map(rows.map((row) => [row.id, row[parentKey] ?? null]));
  let cycles = 0;
  for (const row of rows) {
    const seen = new Set<string>();
    let cursor: string | null | undefined = row.id;
    while (cursor) {
      if (seen.has(cursor)) { cycles += 1; break; }
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
  return cycles;
}

export function validateFixtureGraphs(state: LocalAuditState = localState): FixtureGraphValidation {
  const eventIds = new Set(state.events.map((event) => event.id));
  const operationalCorrections = state.events.filter((event) => event.correctionOfEventId);
  const operationalInvalidLinks = operationalCorrections.filter((event) => {
    const parent = state.events.find((candidate) => candidate.id === event.correctionOfEventId);
    return !parent || parent.id === event.id || !parent.reversedAt;
  }).length;
  const operationalReplacementCounts = new Map<string, number>();
  for (const event of operationalCorrections) if (!event.reversedAt && event.correctionOfEventId) operationalReplacementCounts.set(event.correctionOfEventId, (operationalReplacementCounts.get(event.correctionOfEventId) ?? 0) + 1);
  const operationalDuplicateReplacements = [...operationalReplacementCounts.values()].filter((count) => count > 1).length;
  const operationalReversals = state.events.filter((event) => event.reversedAt);
  const operationalReversalInvalid = operationalReversals.filter((event) => !event.reversedAt || !eventIds.has(event.id)).length;
  const operational = { correctionsChecked: operationalCorrections.length, reversalsChecked: operationalReversals.length, invalidLinks: operationalInvalidLinks + operationalReversalInvalid, cycles: countCorrectionCycles(state.events, "correctionOfEventId"), duplicateActiveReplacements: operationalDuplicateReplacements };

  const abnormalIds = new Set(state.abnormalEvents.map((event) => event.id));
  const abnormalCorrections = state.abnormalEvents.filter((event) => event.correctionOfId);
  const abnormalInvalidCorrections = abnormalCorrections.filter((event) => {
    const parent = state.abnormalEvents.find((candidate) => candidate.id === event.correctionOfId);
    return !parent || parent.id === event.id || parent.status !== "corrected" || event.status !== "active";
  }).length;
  const abnormalReplacementCounts = new Map<string, number>();
  for (const event of abnormalCorrections) if (event.status === "active" && event.correctionOfId) abnormalReplacementCounts.set(event.correctionOfId, (abnormalReplacementCounts.get(event.correctionOfId) ?? 0) + 1);
  const abnormalDuplicateReplacements = [...abnormalReplacementCounts.values()].filter((count) => count > 1).length;
  const abnormalReversals = state.abnormalEvents.filter((event) => event.status === "reversal");
  const abnormalInvalidReversals = abnormalReversals.filter((event) => !event.reversalOfId || !abnormalIds.has(event.reversalOfId) || state.abnormalEvents.find((candidate) => candidate.id === event.reversalOfId)?.status !== "reversed").length;
  const abnormal = { correctionsChecked: abnormalCorrections.length, reversalsChecked: abnormalReversals.length, invalidLinks: abnormalInvalidCorrections + abnormalInvalidReversals, cycles: countCorrectionCycles(state.abnormalEvents, "correctionOfId"), duplicateActiveReplacements: abnormalDuplicateReplacements };
  const pass = operational.invalidLinks === 0 && operational.cycles === 0 && operational.duplicateActiveReplacements === 0
    && abnormal.invalidLinks === 0 && abnormal.cycles === 0 && abnormal.duplicateActiveReplacements === 0;
  return { operational, abnormal, pass };
}

export interface FinanceInvariantValidation {
  arithmetic: boolean;
  domain: boolean;
  issues: string[];
  pass: boolean;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateSyntheticFinance(state: LocalAuditState = localState): FinanceInvariantValidation {
  const issues: string[] = [];
  const farms = new Map(state.farms.map((farm) => [farm.id, farm]));
  const distributions = state.finance.distributions;
  const allocationsByDistribution = new Map<string, Array<Record<string, unknown>>>();
  for (const allocation of state.finance.allocations) {
    const key = String(allocation.distributionId ?? "");
    allocationsByDistribution.set(key, [...(allocationsByDistribution.get(key) ?? []), allocation]);
  }
  const equityByFarm = new Map<string, Array<Record<string, unknown>>>();
  for (const equity of state.finance.farmInvestorEquity) {
    const farmName = String(equity.farmName ?? "");
    equityByFarm.set(farmName, [...(equityByFarm.get(farmName) ?? []), equity]);
  }
  for (const distribution of distributions) {
    const farm = farms.get(String(distribution.farmId ?? ""));
    const gross = Number(distribution.grossProfitLoss ?? NaN);
    const allocated = Number(distribution.allocatedProfitLoss ?? NaN);
    const expense = Number(distribution.expense ?? NaN);
    const net = Number(distribution.netIncome ?? NaN);
    const expectedAllocated = roundMoney(gross * Number(farm?.playerGroupEquityFraction ?? NaN));
    const allocationRows = allocationsByDistribution.get(String(distribution.id ?? "")) ?? [];
    const allocationTotal = roundMoney(allocationRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    if (!farm || !Number.isFinite(gross) || !Number.isFinite(allocated) || allocated !== expectedAllocated || roundMoney(allocated - expense) !== net || allocationTotal !== roundMoney(allocated)) issues.push(`distribution:${String(distribution.id ?? "unknown")}`);
    const equityRows = equityByFarm.get(String(farm?.name ?? "")) ?? [];
    const equityTotal = roundMoney(equityRows.reduce((sum, row) => sum + Number(row.equityFraction ?? 0), 0));
    if (farm && equityTotal !== roundMoney(farm.playerGroupEquityFraction)) issues.push(`equity:${farm.id}`);
  }
  const distributionSums = { gross: roundMoney(distributions.reduce((sum, row) => sum + Number(row.grossProfitLoss ?? 0), 0)), allocated: roundMoney(distributions.reduce((sum, row) => sum + Number(row.allocatedProfitLoss ?? 0), 0)), expense: roundMoney(distributions.reduce((sum, row) => sum + Number(row.expense ?? 0), 0)), net: roundMoney(distributions.reduce((sum, row) => sum + Number(row.netIncome ?? 0), 0)) };
  for (const key of ["gross", "allocated", "expense", "net"] as const) if (Number(state.finance.totals[key] ?? NaN) !== distributionSums[key]) issues.push(`total:${key}`);
  const investorSums = new Map<string, number>();
  for (const allocation of state.finance.allocations) { const name = String(allocation.investorName ?? ""); investorSums.set(name, roundMoney((investorSums.get(name) ?? 0) + Number(allocation.amount ?? 0))); }
  for (const investor of state.finance.investors) if (roundMoney(Number(investor.amount ?? NaN)) !== (investorSums.get(String(investor.name ?? "")) ?? 0)) issues.push(`investor:${String(investor.id ?? "unknown")}`);
  const arithmetic = issues.filter((issue) => issue.startsWith("distribution:") || issue.startsWith("total:")).length === 0;
  const domain = issues.length === 0;
  return { arithmetic, domain, issues, pass: arithmetic && domain };
}

function parseBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string" || !init.body) return {};
  try {
    const value = JSON.parse(init.body) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    throw localError(400, "local_audit_invalid_json", "本地稽核資料格式無法解析。");
  }
}

function decode(value: string | undefined): string {
  return value ? decodeURIComponent(value) : "";
}

function nextLocalId(kind: string): string {
  localState.sequence += 1;
  return `synthetic-audit-${kind}-${String(localState.sequence).padStart(3, "0")}`;
}

function addAudit(action: string, entityType: string, entityId: string, reason: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, changedFields: string[] = []): void {
  localState.audit.unshift(auditRecord(nextLocalId("audit"), "web", action, entityType, entityId, "local_audit_admin", reason, before, after, changedFields, localState.sequence % 60));
}

function requireFarm(id: string): Farm {
  const farm = localState.farms.find((item) => item.id === id);
  if (!farm) throw localError(404, "local_audit_farm_not_found", "本地稽核資料找不到這個雞場。");
  return farm;
}

function requireHouse(id: string): House {
  const house = localState.houses.find((item) => item.id === id);
  if (!house) throw localError(404, "local_audit_house_not_found", "本地稽核資料找不到這個雞舍。");
  return house;
}

function requireFlock(id: string): Flock {
  const flock = localState.flocks.find((item) => item.id === id);
  if (!flock) throw localError(404, "local_audit_flock_not_found", "本地稽核資料找不到這個批次。");
  return flock;
}

function requireCaretaker(id: string): Caretaker {
  const caretaker = localState.caretakers.find((item) => item.id === id);
  if (!caretaker) throw localError(404, "local_audit_caretaker_not_found", "本地稽核資料找不到這位飼養者。");
  return caretaker;
}

function requireReliabilityEvent(id: string): ReliabilityEvent {
  const event = localState.reliabilityEvents.find((item) => item.eventId === id);
  if (!event) throw localError(404, "local_audit_reliability_not_found", "本地稽核資料找不到這筆訊息。");
  return event;
}

function queryParams(path: string): URLSearchParams {
  return new URL(path, "http://local-audit.invalid").searchParams;
}

function effectiveEvents(): OperationalEvent[] {
  const correctedIds = new Set(localState.events.flatMap((event) => event.correctionOfEventId ? [event.correctionOfEventId] : []));
  return localState.events.filter((event) => !event.reversedAt && !correctedIds.has(event.id));
}

function flockStock(flock: Flock): number {
  return Math.max(0, flock.initialCount - effectiveEvents().filter((event) => event.flockId === flock.id).reduce((total, event) => {
    if (event.intent === "mortality" || event.intent === "cull" || event.intent === "shipment") return total + event.quantity;
    return total;
  }, 0));
}

function dashboardPayload(): Record<string, unknown> {
  const today = auditToday();
  const activeFlocks = localState.flocks.filter((flock) => flock.status === "active");
  const todayEvents = effectiveEvents().filter((event) => event.eventDate === today);
  const activeFarms = localState.farms.filter((farm) => farm.active);
  const warnings = ["本地稽核模式：所有數據均為固定虛擬資料。"];
  return {
    asOf: today,
    counts: { farms: activeFarms.length, productionFarms: activeFarms.filter((farm) => farm.environment === "production").length, testFarms: activeFarms.filter((farm) => farm.environment === "test").length, caretakers: localState.caretakers.filter((caretaker) => caretaker.active).length, activeFlocks: activeFlocks.length },
    stock: activeFlocks.reduce((total, flock) => total + flockStock(flock), 0),
    today: { mortality: todayEvents.filter((event) => event.intent === "mortality").reduce((sum, event) => sum + event.quantity, 0), cull: todayEvents.filter((event) => event.intent === "cull").reduce((sum, event) => sum + event.quantity, 0) },
    upcomingShipments: activeFlocks.filter((flock) => flock.expectedShipmentDate && flock.expectedShipmentDate >= today && daysBetween(today, flock.expectedShipmentDate) <= 7).length,
    finance: { net: localState.finance.totals.net },
    dataHealth: { warnings },
  };
}

function filterScopedEvents(params: URLSearchParams): OperationalEvent[] {
  const farmId = params.get("farmId");
  const houseId = params.get("houseId");
  const flockId = params.get("flockId");
  const environment = params.get("environment");
  return localState.events.filter((event) => (!farmId || event.farmId === farmId) && (!houseId || event.houseId === houseId) && (!flockId || event.flockId === flockId) && (!environment || event.environment === environment));
}

function filterScopedAbnormal(params: URLSearchParams): AbnormalEvent[] {
  const farmId = params.get("farmId");
  const houseId = params.get("houseId");
  const flockId = params.get("flockId");
  const search = (params.get("search") ?? "").toLocaleLowerCase();
  return localState.abnormalEvents.filter((event) => (!farmId || event.farmId === farmId) && (!houseId || event.houseId === houseId) && (!flockId || event.flockId === flockId) && (!search || event.rawText.toLocaleLowerCase().includes(search)));
}

function pageSlice<T>(items: T[], params: URLSearchParams, defaultSize: number): { items: T[]; nextCursor: string | null } {
  const limit = Math.max(1, Number(params.get("limit") ?? defaultSize) || defaultSize);
  const cursor = params.get("cursor");
  const start = cursor === "synthetic-cursor-1" ? limit : 0;
  return { items: items.slice(start, start + limit), nextCursor: start + limit < items.length ? "synthetic-cursor-1" : null };
}

type LocalChartGranularity = ChartResponse["granularity"];

const LOCAL_CHART_METRICS = new Set([
  "mortality", "mortality-cumulative", "mortality-rate", "stock", "cull", "cull-cumulative",
  "feed", "feed-cumulative", "water", "water-cumulative", "shipment", "farm-profit", "portfolio-net", "finance",
  "weather-max", "weather-min",
]);

function shiftAuditDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function auditChartBuckets(from: string, to: string, granularity: LocalChartGranularity): string[] {
  const values: string[] = [];
  let cursor = from;
  if (granularity === "monthly") {
    cursor = `${from.slice(0, 7)}-01`;
  } else if (granularity === "weekly") {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    cursor = date.toISOString().slice(0, 10);
  }
  while (cursor <= to && values.length < 2000) {
    values.push(cursor);
    if (granularity === "monthly") {
      const date = new Date(`${cursor}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + 1, 1);
      cursor = date.toISOString().slice(0, 10);
    } else cursor = shiftAuditDate(cursor, granularity === "weekly" ? 7 : 1);
  }
  return values;
}

function auditChartBucket(date: string, granularity: LocalChartGranularity): string {
  if (granularity === "monthly") return `${date.slice(0, 7)}-01`;
  if (granularity === "weekly") {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.toISOString().slice(0, 10);
  }
  return date;
}

function assignmentCovers(farmId: string, caretakerId: string, date: string): boolean {
  return localState.caretakers.some((caretaker) => caretaker.assignments?.some((assignment) => assignment.farmId === farmId && assignment.isPrimary !== false && assignment.effectiveFrom <= date && (!assignment.effectiveTo || assignment.effectiveTo >= date) && caretaker.id === caretakerId));
}

function eventMatchesChartScope(event: OperationalEvent, params: URLSearchParams): boolean {
  const environment = params.get("environment");
  return (!params.get("farmId") || event.farmId === params.get("farmId"))
    && (!params.get("houseId") || event.houseId === params.get("houseId"))
    && (!params.get("flockId") || event.flockId === params.get("flockId"))
    && (!environment || event.environment === environment)
    && (!params.get("caretakerId") || assignmentCovers(event.farmId, params.get("caretakerId") as string, event.eventDate));
}

function flockMatchesChartScope(flock: Flock, params: URLSearchParams): boolean {
  const farm = localState.farms.find((item) => item.id === flock.farmId);
  const environment = params.get("environment");
  return Boolean(farm)
    && (!params.get("farmId") || flock.farmId === params.get("farmId"))
    && (!params.get("houseId") || flock.houseId === params.get("houseId"))
    && (!params.get("flockId") || flock.id === params.get("flockId"))
    && (!environment || farm?.environment === environment)
    && (!params.get("caretakerId") || assignmentCovers(flock.farmId, params.get("caretakerId") as string, flock.chickInDate));
}

function chartEventValues(metric: string, params: URLSearchParams, from: string, to: string, buckets: string[], granularity: LocalChartGranularity): number[] {
  const intent = metric === "mortality-rate" ? "mortality" : metric.replace(/-cumulative$/, "");
  const values = new Map(buckets.map((bucket) => [bucket, 0]));
  for (const event of effectiveEvents()) {
    if (event.eventDate < from || event.eventDate > to || event.intent !== intent || !eventMatchesChartScope(event, params)) continue;
    const bucket = auditChartBucket(event.eventDate, granularity);
    if (values.has(bucket)) values.set(bucket, (values.get(bucket) ?? 0) + event.quantity);
  }
  return buckets.map((bucket) => values.get(bucket) ?? 0);
}

function chartPayload(metric: string, params: URLSearchParams): ChartResponse {
  const from = params.get("from") ?? shiftAuditDate(auditToday(), -29);
  const to = params.get("to") ?? auditToday();
  if (from > to) throw localError(400, "invalid_date_range", "圖表日期範圍無效。");
  const granularity = params.get("granularity") === "weekly" || params.get("granularity") === "monthly" ? params.get("granularity") as LocalChartGranularity : "daily";
  const buckets = auditChartBuckets(from, to, granularity);
  if (!LOCAL_CHART_METRICS.has(metric)) throw localError(400, "invalid_metric", "不支援的圖表指標。");

  if (metric === "weather-max" || metric === "weather-min") {
    if (params.get("farmId")) requireFarm(params.get("farmId") as string);
    const values = new Map<string, number[]>();
    for (const row of localState.weather) {
      if (row.weatherScope !== "area" || !["captured", "backfilled"].includes(row.fetchStatus) || row.weatherDate < from || row.weatherDate > to) continue;
      const temperature = metric === "weather-max" ? row.maxTemperatureC : row.minTemperatureC;
      if (temperature === null) continue;
      const bucket = auditChartBucket(row.weatherDate, granularity);
      const group = values.get(bucket) ?? [];
      group.push(temperature);
      values.set(bucket, group);
    }
    return { metric, from, to, granularity, unit: "°C", definition: "區域每日天氣資料的溫度平均；雞場篩選只驗證範圍，不複製區域列。", status: "ok", series: buckets.filter((bucket) => values.has(bucket)).map((bucket) => ({ date: bucket, value: Number((values.get(bucket) as number[]).reduce((sum, value) => sum + value, 0) / (values.get(bucket) as number[]).length) })), derived: true };
  }

  if (metric === "stock") {
    const scopedFlocks = localState.flocks.filter((flock) => flock.status !== "cancelled" && flock.chickInDate <= to && flockMatchesChartScope(flock, params));
    const scopedEvents = effectiveEvents().filter((event) => event.eventDate <= to && ["mortality", "cull", "shipment"].includes(event.intent) && eventMatchesChartScope(event, params));
    const series = buckets.map((bucket) => {
      const initial = scopedFlocks.filter((flock) => flock.chickInDate <= bucket).reduce((sum, flock) => sum + flock.initialCount, 0);
      const removed = scopedEvents.filter((event) => event.eventDate <= bucket).reduce((sum, event) => sum + event.quantity, 0);
      return { date: bucket, value: initial - removed };
    });
    return { metric, from, to, granularity, unit: "隻", definition: "批次初始數量減去有效的死亡、淘汰、出雞紀錄；已出雞批次仍納入歷史日期。", status: "ok", series, denominator: series.length ? series[series.length - 1].value : 0, derived: true };
  }

  if (metric === "mortality-rate") {
    const denominator = localState.flocks.filter((flock) => flock.status !== "cancelled" && flock.chickInDate <= to && flockMatchesChartScope(flock, params)).reduce((sum, flock) => sum + flock.initialCount, 0);
    const mortality = chartEventValues(metric, params, from, to, buckets, granularity);
    return denominator ? { metric, from, to, granularity, unit: "%", definition: "死亡數除以該範圍批次初始數量。", status: "ok", series: mortality.map((value, index) => ({ date: buckets[index], value: value / denominator * 100 })), denominator, derived: true } : { metric, from, to, granularity, unit: "%", definition: "死亡數除以該範圍批次初始數量；缺少分母時不顯示。", status: "insufficient-data", series: [], denominator: 0, derived: true };
  }

  const financeMetric = metric === "finance" ? "portfolio-net" : metric;
  if (financeMetric === "farm-profit" || financeMetric === "portfolio-net") {
    const farmId = params.get("farmId");
    if (financeMetric === "farm-profit" && !farmId) throw localError(400, "farm_required", "各場盈虧趨勢需要指定雞場。");
    const values = new Map(buckets.map((bucket) => [bucket, 0]));
    for (const row of localState.finance.distributions) {
      const farm = localState.farms.find((item) => item.id === row.farmId);
      if (!farm || farm.environment !== "production" || (params.get("environment") === "test") || (farmId && row.farmId !== farmId)) continue;
      const date = String(row.distributionDate ?? "");
      if (date < from || date > to) continue;
      const bucket = auditChartBucket(date, granularity);
      if (values.has(bucket)) values.set(bucket, (values.get(bucket) ?? 0) + Number(row.netIncome ?? 0));
    }
    return { metric, from, to, granularity, unit: "元", definition: financeMetric === "farm-profit" ? "Production 指定雞場 profit_distributions.net_income。" : "Production 全 portfolio profit_distributions.net_income。", status: "ok", series: buckets.map((date) => ({ date, value: values.get(date) ?? 0 })), derived: true };
  }

  const values = chartEventValues(metric, params, from, to, buckets, granularity);
  const cumulative = metric.endsWith("-cumulative");
  let running = 0;
  const series = values.map((value, index) => ({ date: buckets[index], value: cumulative ? (running += value) : value }));
  const unit = metric === "feed" || metric === "feed-cumulative" ? "kg" : metric === "water" || metric === "water-cumulative" ? "L" : "隻";
  return { metric, from, to, granularity, unit, definition: `依${granularity === "daily" ? "日" : granularity === "weekly" ? "週" : "月"}整理的有效${metric}數量。`, status: "ok", series, derived: cumulative };
}

function timelinePayload(params: URLSearchParams): TimelineItem[] {
  const eventRows = filterScopedEvents(params).map((event): TimelineItem => {
    const weather = localState.weather.find((row) => row.weatherScope === "area" && row.weatherDate === event.eventDate);
    return { id: event.id, itemType: "operational", farmId: event.farmId, farmName: event.farmName, environment: event.environment, houseId: event.houseId, houseName: event.house, flockId: event.flockId, occurredDate: event.eventDate, sortAt: event.createdAt, eventType: event.intent, quantity: event.quantity, unit: event.unit, rawText: event.note, status: event.reversedAt ? "reversed" : "active", weatherCondition: weather?.condition ?? null, maxTemperatureC: weather?.maxTemperatureC ?? null, maxTemperatureAt: weather?.maxTemperatureAt ?? null, minTemperatureC: weather?.minTemperatureC ?? null, minTemperatureAt: weather?.minTemperatureAt ?? null, weatherStatus: weather?.fetchStatus ?? null };
  });
  const abnormalRows = filterScopedAbnormal(params).map((event): TimelineItem => {
    const weather = localState.weather.find((row) => row.weatherScope === "area" && row.weatherDate === event.occurredDate);
    return { id: event.id, itemType: "abnormal", farmId: event.farmId, farmName: event.farmName, environment: event.environment, houseId: event.houseId, houseName: event.houseName, flockId: event.flockId, occurredDate: event.occurredDate, sortAt: event.createdAt, eventType: event.category, quantity: null, unit: null, rawText: event.rawText, status: event.status, weatherCondition: weather?.condition ?? null, maxTemperatureC: weather?.maxTemperatureC ?? null, maxTemperatureAt: weather?.maxTemperatureAt ?? null, minTemperatureC: weather?.minTemperatureC ?? null, minTemperatureAt: weather?.minTemperatureAt ?? null, weatherStatus: weather?.fetchStatus ?? null };
  });
  return [...eventRows, ...abnormalRows].sort((a, b) => b.sortAt.localeCompare(a.sortAt));
}

function systemStatusPayload(): SystemStatus {
  const retained = localState.reliabilityEvents.filter((event) => event.lifecycleStatus === "retained");
  const open = retained.filter((event) => !["manually_resolved", "manually_recorded", "force_closed", "completed"].includes(event.resolutionStatus));
  const unacknowledged = open.filter((event) => event.resolutionStatus === "unresolved");
  const acknowledged = open.filter((event) => event.resolutionStatus === "acknowledged");
  return {
    level: open.length ? "attention" : "normal", label: open.length ? "需要處理" : "正常", message: open.length ? `本地虛擬資料有 ${open.length} 筆訊息尚未完成。` : "本地稽核資料目前沒有未完成訊息。", unfinishedCount: open.length, stalledCount: 0, retryingCount: 0, retainedCount: retained.length, retainedUnacknowledgedCount: unacknowledged.length, retainedAcknowledgedCount: acknowledged.length, retainedOpenCount: open.length, retainedResolvedCount: retained.length - open.length, actionableUnfinishedCount: open.filter((event) => event.payloadAvailable).length, deliveryUncertainCount: 0, replyFailureCount: 0, lastCompletedAt: "2026-08-31T04:00:05Z", lastProblemAt: open.length ? "2026-08-31T03:02:00Z" : null, checkedAt: "2026-08-31T12:00:00Z", checks: { receive: "正常", process: open.length ? "需處理" : "正常", storage: "正常", reply: "正常" },
  };
}

function testToolsPayload(): TestToolsData {
  return {
    farms: localState.farms.map((farm) => ({ id: farm.id, name: farm.name, active: farm.active ? 1 : 0, environment: farm.environment, houseCount: localState.houses.filter((house) => house.farmId === farm.id).length, flockCount: localState.flocks.filter((flock) => flock.farmId === farm.id).length })),
    houses: localState.houses.map((house) => ({ id: house.id, farmId: house.farmId, farmName: house.farmName, name: house.name, active: house.active ? 1 : 0 })),
    flocks: localState.flocks.map((flock) => ({ id: flock.id, farmId: flock.farmId, farmName: flock.farmName, houseName: flock.houseName, batchCode: flock.batchCode, chickInDate: flock.chickInDate, initialCount: flock.initialCount, status: flock.status })),
    warning: "此頁只顯示本地稽核虛擬資料；沒有建立、修改或刪除正式資料的能力。",
    readOnly: true,
  };
}

function technicalInfoPayload(): TechnicalInfo {
  return { service: "local-audit-memory-adapter", accountName: "本地稽核虛擬帳號", conversationMode: "local_synthetic", conversationModel: LOCAL_AUDIT_MODEL, ambientModel: LOCAL_AUDIT_MODEL, queue: { name: "memory-only", batchSize: 10, timeoutSeconds: 0, maxRetries: 0 }, schedules: [`固定錨點：${auditToday()}`], migration: "local-baseline", secretsIncluded: false, rawPayloadIncluded: false, note: "本地稽核模式不連 Worker、D1、LINE、Queue 或 Workers AI；資料只存在目前分頁記憶體。" };
}

function parsePath(path: string): { pathname: string; params: URLSearchParams; parts: string[] } {
  const url = new URL(path, "http://local-audit.invalid");
  return { pathname: url.pathname, params: url.searchParams, parts: url.pathname.split("/").filter(Boolean) };
}

function caretakerResponse(history: boolean): { caretakers: Caretaker[]; history: boolean } {
  return { caretakers: localState.caretakers.filter((caretaker) => history || caretaker.active), history };
}

function updateCaretakerAssignments(): void {
  for (const caretaker of localState.caretakers) caretaker.assignments = caretaker.assignments ?? [];
}

/**
 * Dispatches the existing Web API contract without creating a local HTTP
 * server. Every state transition below is memory-only and gets an audit row.
 */
export async function localAuditRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { pathname, params, parts } = parsePath(path);
  const method = (init.method ?? "GET").toUpperCase();
  const body = parseBody(init);

  if (pathname === "/api/web/auth/login" && method === "POST") {
    if (body.password !== LOCAL_AUDIT_PASSWORD) throw localError(401, "invalid_credentials", "本地稽核密碼不正確。");
    localState.authenticated = true;
    return copy({ authenticated: true, token: "synthetic-audit-session", expiresAt: "2099-01-01T00:00:00Z", organization: localState.organization }) as T;
  }
  if (pathname === "/api/web/auth/session" && method === "GET") return copy({ authenticated: localState.authenticated, expiresAt: localState.authenticated ? "2099-01-01T00:00:00Z" : undefined }) as T;
  if (pathname === "/api/web/auth/logout" && method === "POST") {
    localState.authenticated = false;
    return copy({ authenticated: false }) as T;
  }
  if (!localState.authenticated) throw localError(401, "local_audit_auth_required", "請先使用本地稽核密碼登入。");

  if (pathname === "/api/dashboard" && method === "GET") return copy(dashboardPayload()) as T;
  if (pathname === "/api/organizations" && method === "GET") return copy({ organizations: [localState.organization] }) as T;

  if (parts[0] === "api" && parts[1] === "farms") {
    const id = decode(parts[2]);
    if (parts.length === 3 && method === "PATCH") {
      const farm = requireFarm(id);
      const before = { ...farm };
      if (typeof body.note === "string" || body.note === null) farm.note = body.note as string | null;
      if (typeof body.active === "boolean") farm.active = body.active;
      if (typeof body.structureMode === "string" && ["whole_farm", "multi_house"].includes(body.structureMode)) farm.structureMode = body.structureMode as Farm["structureMode"];
      farm.version += 1;
      farm.updatedAt = timestamp(localState.sequence);
      addAudit("farm_updated", "farm", farm.id, "本地稽核操作", { note: before.note, active: before.active }, { note: farm.note, active: farm.active }, ["note", "active"]);
      return copy({ farm }) as T;
    }
    if (parts.length === 4 && parts[3] === "caretakers" && method === "POST") {
      const farm = requireFarm(id);
      const caretaker = requireCaretaker(String(body.caretakerId ?? ""));
      const effectiveFrom = typeof body.effectiveFrom === "string" ? body.effectiveFrom : auditToday();
      const isPrimary = body.isPrimary === true;
      updateCaretakerAssignments();
      if (isPrimary) {
        for (const item of localState.caretakers) {
          for (const assignment of item.assignments ?? []) {
            if (assignment.farmId === farm.id && assignment.isPrimary && !assignment.effectiveTo) assignment.effectiveTo = effectiveFrom;
          }
        }
      }
      const assignment = assignmentRecord(nextLocalId("assignment"), caretaker, farm, effectiveFrom, isPrimary);
      caretaker.assignments = [...(caretaker.assignments ?? []), assignment];
      addAudit("caretaker_assigned", "caretaker_assignment", assignment.id, "本地稽核責任指派", null, { farmId: farm.id, caretakerId: caretaker.id, isPrimary }, ["farmId", "caretakerId", "isPrimary"]);
      return copy({ assignment }) as T;
    }
    if (parts.length === 2 && method === "GET") {
      const environment = params.get("environment");
      return copy({ farms: localState.farms.filter((farm) => !environment || farm.environment === environment) }) as T;
    }
    if (parts.length === 2 && method === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw localError(400, "local_audit_invalid_farm", "本地稽核雞場名稱不可為空白。");
      const farm = farmRecord(nextLocalId("farm"), name, body.environment === "production" ? "production" : "test", body.structureMode === "multi_house" ? "multi_house" : "whole_farm", "本地新增", null);
      localState.farms.push(farm);
      addAudit("farm_created", "farm", farm.id, "本地稽核建立雞場", null, { name: farm.name, environment: farm.environment }, ["name", "environment"]);
      return copy({ farm }) as T;
    }
  }

  if (parts[0] === "api" && parts[1] === "caretakers") {
    const id = decode(parts[2]);
    if (parts.length === 2 && method === "GET") return copy(caretakerResponse(params.get("history") === "1")) as T;
    if (parts.length === 2 && method === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw localError(400, "local_audit_invalid_caretaker", "本地稽核飼養者名稱不可為空白。");
      const caretaker: Caretaker = { id: nextLocalId("caretaker"), name, active: true, note: typeof body.note === "string" ? body.note : null, version: 1, assignments: [] };
      localState.caretakers.push(caretaker);
      addAudit("caretaker_created", "caretaker", caretaker.id, "本地稽核建立飼養者", null, { name: caretaker.name, active: true }, ["name", "active"]);
      return copy({ caretaker }) as T;
    }
    if (parts.length === 3 && method === "PATCH") {
      const caretaker = requireCaretaker(id);
      const before = { name: caretaker.name, active: caretaker.active, note: caretaker.note };
      if (typeof body.name === "string" && body.name.trim()) caretaker.name = body.name.trim();
      if (typeof body.active === "boolean") caretaker.active = body.active;
      if (typeof body.note === "string" || body.note === null) caretaker.note = body.note as string | null;
      caretaker.version += 1;
      addAudit(caretaker.active ? "caretaker_updated" : "caretaker_archived", "caretaker", caretaker.id, caretaker.active ? "本地稽核更新飼養者" : "本地稽核封存飼養者", before, { name: caretaker.name, active: caretaker.active, note: caretaker.note }, ["name", "active", "note"]);
      return copy({ caretaker }) as T;
    }
  }

  if (parts[0] === "api" && parts[1] === "houses") {
    const id = decode(parts[2]);
    if (parts.length === 2 && method === "GET") return copy({ houses: localState.houses.filter((house) => !params.get("farmId") || house.farmId === params.get("farmId")) }) as T;
    if (parts.length === 2 && method === "POST") {
      const farm = requireFarm(String(body.farmId ?? ""));
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw localError(400, "local_audit_invalid_house", "本地稽核雞舍名稱不可為空白。");
      const house = houseRecord(nextLocalId("house"), farm, name, typeof body.capacity === "number" ? body.capacity : null);
      localState.houses.push(house);
      addAudit("house_created", "house", house.id, "本地稽核建立雞舍", null, { farmId: house.farmId, name: house.name }, ["farmId", "name"]);
      return copy({ house }) as T;
    }
    if (parts.length === 3 && method === "PATCH") {
      const house = requireHouse(id);
      const before = { name: house.name, capacity: house.capacity, active: house.active, note: house.note };
      if (typeof body.name === "string" && body.name.trim()) { house.name = body.name.trim(); house.normalizedName = house.name; }
      if (typeof body.capacity === "number" || body.capacity === null) house.capacity = body.capacity as number | null;
      if (typeof body.active === "boolean") house.active = body.active;
      if (typeof body.note === "string" || body.note === null) house.note = body.note as string | null;
      house.version += 1;
      addAudit(house.active ? "house_updated" : "house_archived", "house", house.id, "本地稽核更新雞舍", before, { name: house.name, capacity: house.capacity, active: house.active, note: house.note }, ["name", "capacity", "active", "note"]);
      return copy({ house }) as T;
    }
  }

  if (parts[0] === "api" && parts[1] === "flocks") {
    const id = decode(parts[2]);
    if (parts.length === 2 && method === "GET") return copy({ flocks: localState.flocks.filter((flock) => !params.get("farmId") || flock.farmId === params.get("farmId")) }) as T;
    if (parts.length === 2 && method === "POST") {
      const farm = requireFarm(String(body.farmId ?? ""));
      const house = requireHouse(String(body.houseId ?? ""));
      if (house.farmId !== farm.id) throw localError(400, "local_audit_house_farm_mismatch", "本地稽核雞舍不屬於所選雞場。");
      const batchCode = typeof body.batchCode === "string" ? body.batchCode.trim() : "";
      const chickInDate = typeof body.chickInDate === "string" ? body.chickInDate : "";
      const initialCount = Number(body.initialCount);
      if (!batchCode || !chickInDate || !Number.isFinite(initialCount) || initialCount <= 0) throw localError(400, "local_audit_invalid_flock", "本地稽核批次欄位不足。");
      const flock = flockRecord(nextLocalId("flock"), farm, house, batchCode, chickInDate, initialCount, typeof body.expectedShipmentDate === "string" ? body.expectedShipmentDate : null, "active");
      localState.flocks.push(flock);
      addAudit("flock_created", "flock", flock.id, "本地稽核建立批次", null, { farmId: farm.id, houseId: house.id, batchCode }, ["farmId", "houseId", "batchCode"]);
      return copy({ flock }) as T;
    }
    if (parts.length === 3 && method === "PATCH") {
      const flock = requireFlock(id);
      const before = { status: flock.status, note: flock.note, expectedShipmentDate: flock.expectedShipmentDate };
      if (body.status === "active" || body.status === "closed" || body.status === "cancelled") flock.status = body.status;
      if (typeof body.note === "string" || body.note === null) flock.note = body.note as string | null;
      if (typeof body.expectedShipmentDate === "string" || body.expectedShipmentDate === null) flock.expectedShipmentDate = body.expectedShipmentDate as string | null;
      flock.version += 1;
      addAudit(flock.status === "closed" ? "flock_closed" : "flock_updated", "flock", flock.id, "本地稽核更新批次", before, { status: flock.status, note: flock.note, expectedShipmentDate: flock.expectedShipmentDate }, ["status", "note", "expectedShipmentDate"]);
      return copy({ flock }) as T;
    }
  }

  if (parts[0] === "api" && parts[1] === "operational-events") {
    const id = decode(parts[2]);
    if (parts.length === 2 && method === "GET") {
      const page = pageSlice(filterScopedEvents(params), params, 50);
      return copy({ events: page.items, nextCursor: page.nextCursor }) as T;
    }
    if (parts.length === 2 && method === "POST") {
      const farm = requireFarm(String(body.farmId ?? ""));
      const house = body.houseId ? requireHouse(String(body.houseId)) : null;
      const flock = body.flockId ? requireFlock(String(body.flockId)) : null;
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || typeof body.intent !== "string") throw localError(400, "local_audit_invalid_operational_event", "本地稽核營運事件欄位不足。");
      const event: OperationalEvent = { id: nextLocalId("event"), farmId: farm.id, farmName: farm.name, environment: farm.environment, source: "local_audit", houseId: house?.id ?? null, house: house?.name ?? null, flockId: flock?.id ?? null, intent: body.intent, quantity, unit: typeof body.unit === "string" ? body.unit : "隻", eventDate: typeof body.eventDate === "string" ? body.eventDate : auditToday(), note: typeof body.note === "string" ? body.note : null, reversedAt: null, reversalReason: null, sourceEventId: `synthetic-source-${nextLocalId("source")}`, createdAt: timestamp(localState.sequence) };
      localState.events.unshift(event);
      addAudit("operational_event_created", "operational_event", event.id, "本地稽核建立營運事件", null, { intent: event.intent, quantity: event.quantity, farmId: event.farmId }, ["intent", "quantity", "farmId"]);
      return copy({ event }) as T;
    }
    if (parts.length === 4 && parts[3] === "reverse" && method === "POST") {
      const event = localState.events.find((item) => item.id === id);
      if (!event) throw localError(404, "local_audit_event_not_found", "本地稽核資料找不到這筆營運事件。");
      if (!event.reversedAt) { event.reversedAt = timestamp(localState.sequence); event.reversalReason = typeof body.reason === "string" ? body.reason : null; addAudit("operational_event_reversed", "operational_event", event.id, event.reversalReason ?? "本地稽核反轉", { reversedAt: null }, { reversedAt: event.reversedAt }, ["reversedAt", "reversalReason"]); }
      return copy({ ok: true, changed: true, message: "本地虛擬事件已反轉。", eventId: event.id }) as T;
    }
    if (parts.length === 4 && parts[3] === "correct" && method === "POST") {
      const original = localState.events.find((item) => item.id === id);
      if (!original) throw localError(404, "local_audit_event_not_found", "本地稽核資料找不到這筆營運事件。");
      if (original.reversedAt) throw localError(409, "already_reversed", "本地稽核原事件已反轉，不能重複修正。");
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw localError(400, "local_audit_invalid_correction", "本地稽核修正數量必須大於 0。");
      original.reversedAt = timestamp(localState.sequence);
      original.reversalReason = typeof body.reason === "string" ? body.reason : "本地稽核修正先反轉原事件";
      const correction = { ...original, id: nextLocalId("event"), quantity, correctionOfEventId: original.id, sourceEventId: `synthetic-source-${nextLocalId("source")}`, createdAt: timestamp(localState.sequence), note: typeof body.note === "string" ? body.note : original.note };
      correction.reversedAt = null;
      correction.reversalReason = null;
      localState.events.unshift(correction);
      addAudit("operational_event_corrected", "operational_event", correction.id, typeof body.reason === "string" ? body.reason : "本地稽核修正", { quantity: original.quantity, reversedAt: null }, { quantity: correction.quantity, correctionOfEventId: original.id, originalReversed: true }, ["quantity", "correctionOfEventId", "originalReversed"]);
      return copy({ ok: true, changed: true, message: "本地虛擬事件已建立修正鏈。", correctionEventId: correction.id, originalEventId: original.id }) as T;
    }
  }

  if (pathname === "/api/finance" && method === "GET") return copy(localState.finance) as T;
  if (parts[0] === "api" && parts[1] === "charts" && parts[2] && method === "GET") return copy(chartPayload(decode(parts[2]), params)) as T;
  if (pathname === "/api/audit" && method === "GET") {
    const page = pageSlice(localState.audit, params, 50);
    return copy({ auditLogs: page.items, nextCursor: page.nextCursor }) as T;
  }
  if (pathname === "/api/farm-aliases" && method === "GET") return copy({ aliases: localState.aliases }) as T;
  if (pathname === "/api/data-health" && method === "GET") return copy({ warnings: ["本地稽核模式：資料來源為固定虛擬 fixture。"], checks: [{ code: "local_fixture_integrity", count: 0, label: "本地 fixture 結構" }, { code: "synthetic_only", count: 0, label: "虛擬資料隔離" }], checkedAt: "2026-08-31T12:00:00Z" } satisfies DataHealth) as T;

  if (parts[0] === "api" && parts[1] === "abnormal-events") {
    const id = decode(parts[2]);
    if (parts.length === 2 && method === "GET") {
      const page = pageSlice(filterScopedAbnormal(params), params, 50);
      return copy({ abnormalEvents: page.items, nextCursor: page.nextCursor }) as T;
    }
    if (parts.length === 2 && method === "POST") {
      const farm = requireFarm(String(body.farmId ?? ""));
      const house = body.houseId ? requireHouse(String(body.houseId)) : localState.houses.find((item) => item.farmId === farm.id) ?? null;
      const flock = body.flockId ? requireFlock(String(body.flockId)) : localState.flocks.find((item) => item.farmId === farm.id) ?? null;
      const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
      if (!rawText) throw localError(400, "local_audit_invalid_abnormal_event", "本地稽核異常內容不可為空白。");
      const event = abnormalRecord(nextLocalId("abnormal"), farm, house ?? houseRecord(nextLocalId("house"), farm, "場級", null), flock ?? flockRecord(nextLocalId("flock"), farm, house ?? houseRecord(nextLocalId("house"), farm, "場級", null), "AUDIT-SCOPE", auditToday(), 0, null, "active"), rawText, "other", auditToday(), ["待分類"]);
      localState.abnormalEvents.unshift(event);
      addAudit("abnormal_created", "abnormal_event", event.id, "本地稽核建立異常", null, { rawText: event.rawText, farmId: event.farmId }, ["rawText", "farmId"]);
      return copy({ created: true, id: event.id, rawText: event.rawText }) as T;
    }
    if (parts.length === 4 && parts[3] === "reverse" && method === "POST") {
      const event = localState.abnormalEvents.find((item) => item.id === id);
      if (!event) throw localError(404, "local_audit_abnormal_not_found", "本地稽核資料找不到這筆異常。");
      if (event.status !== "active") throw localError(409, "already_inactive", "本地稽核異常已修正或反轉。");
      const reason = typeof body.reason === "string" ? body.reason : null;
      event.status = "reversed";
      event.reason = reason;
      const reversal = { ...event, id: nextLocalId("abnormal"), status: "reversal", reversalOfId: event.id, correctionOfId: null, classificationStatus: "skipped", reason, createdAt: timestamp(localState.sequence) };
      localState.abnormalEvents.unshift(reversal);
      addAudit("abnormal_reversed", "abnormal_event", event.id, reason ?? "本地稽核反轉異常", { status: "active" }, { status: event.status, reversalId: reversal.id }, ["status", "reason"]);
      return copy({ ok: true, changed: true, message: "本地虛擬異常已反轉。", reversalId: reversal.id }) as T;
    }
    if (parts.length === 4 && parts[3] === "correct" && method === "POST") {
      const original = localState.abnormalEvents.find((item) => item.id === id);
      if (!original) throw localError(404, "local_audit_abnormal_not_found", "本地稽核資料找不到這筆異常。");
      const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
      if (!rawText) throw localError(400, "local_audit_invalid_abnormal_correction", "本地稽核修正內容不可為空白。");
      original.status = "corrected";
      const correction = { ...original, id: nextLocalId("abnormal"), rawText, status: "active", correctionOfId: original.id, reversalOfId: null, reason: typeof body.reason === "string" ? body.reason : null, createdAt: timestamp(localState.sequence) };
      localState.abnormalEvents.unshift(correction);
      addAudit("abnormal_corrected", "abnormal_event", correction.id, correction.reason ?? "本地稽核修正異常", { rawText: original.rawText }, { rawText: correction.rawText, correctionOfId: original.id }, ["rawText", "correctionOfId"]);
      return copy({ ok: true, changed: true, message: "本地虛擬異常已建立修正鏈。", correctionId: correction.id }) as T;
    }
  }

  if (pathname === "/api/weather" && method === "GET") {
    const from = params.get("from");
    const to = params.get("to");
    if (params.get("farmId")) requireFarm(params.get("farmId") as string);
    return copy({ weather: localState.weather.filter((row) => row.weatherScope === "area" && ["captured", "backfilled"].includes(row.fetchStatus) && (!from || row.weatherDate >= from) && (!to || row.weatherDate <= to)) }) as T;
  }
  if (pathname === "/api/timeline" && method === "GET") {
    const page = pageSlice(timelinePayload(params), params, 100);
    return copy({ timeline: page.items, nextCursor: page.nextCursor }) as T;
  }
  if (pathname === "/api/ai/analyze" && method === "POST") {
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) throw localError(400, "invalid_analysis_question", "本地稽核問題不可為空白。");
    return copy({ result: { report: { currentStatus: "本地虛擬資料可供唯讀分析。", findings: ["稽核資料顯示近期有死亡、淘汰與設備異常樣本。", "不同雞場的批次、天氣與歷史資料可分開查看。"], possibleCauses: [{ text: "目前資料不足以確認單一原因。", evidence: "weak" }, { text: "環境與設備因素值得依現場紀錄持續比對。", evidence: "medium" }], risks: ["這是固定示範資料，不可用來判斷任何真實雞場。"], recommendations: ["先查看異常紀錄與每日營運事件，再由管理者決定。", "維持原始紀錄與修正鏈的可追溯性。"], limitations: ["本地模式沒有呼叫 Workers AI，也沒有讀取 Production D1。"] }, cached: false, contextHash: "synthetic-audit-context-v1", model: LOCAL_AUDIT_MODEL, createdAt: "2026-08-31T12:00:00Z" }, readOnly: true }) as T;
  }
  if (pathname === "/api/ai/live-status" && method === "GET") return copy({ context: { source: "local_synthetic", farmCount: localState.farms.length, activeFlockCount: localState.flocks.filter((flock) => flock.status === "active").length }, aiInvoked: false }) as T;
  if (pathname === "/api/ai/brief" && method === "GET") return copy({ brief: null, liveStatus: { synthetic: 1 }, aiInvoked: false }) as T;

  if (pathname === "/api/system-status" && method === "GET") return copy({ status: systemStatusPayload() }) as T;
  if (pathname === "/api/reliability/events" && method === "GET") return copy({ events: localState.reliabilityEvents }) as T;
  if (pathname === "/api/reliability/recover" && method === "POST") {
    const recoverable = localState.reliabilityEvents.filter((event) => event.lifecycleStatus === "retained" && event.payloadAvailable && !["manually_resolved", "manually_recorded", "force_closed"].includes(event.resolutionStatus));
    for (const event of recoverable) event.lifecycleStatus = "processing";
    addAudit("reliability_recover_requested", "reliability_event", "synthetic-audit-reliability", "本地稽核可靠性操作", null, { requeued: recoverable.length }, ["requeued"]);
    return copy({ ok: true, message: `本地虛擬資料已重新安排 ${recoverable.length} 筆。`, result: { requeued: recoverable.length } }) as T;
  }
  if (pathname === "/api/reliability/acknowledge" && method === "POST") {
    let acknowledged = 0;
    for (const event of localState.reliabilityEvents) if (event.lifecycleStatus === "retained" && event.resolutionStatus === "unresolved") { event.resolutionStatus = "acknowledged"; event.retainedAcknowledgedAt = timestamp(localState.sequence); event.retainedAcknowledgedBy = "local_audit_admin"; acknowledged += 1; }
    addAudit("reliability_acknowledged", "reliability_event", "synthetic-audit-reliability", "本地稽核查看可靠性資料", null, { acknowledged }, ["acknowledged"]);
    return copy({ ok: true, message: "已記下本地虛擬資料查看結果。", acknowledged }) as T;
  }
  if (parts[0] === "api" && parts[1] === "reliability" && parts[2] === "events" && parts[3]) {
    const event = requireReliabilityEvent(decode(parts[3]));
    if (parts[4] === "recover" && method === "POST") {
      if (event.payloadAvailable) event.lifecycleStatus = "processing";
      addAudit("reliability_event_recover_requested", "reliability_event", event.eventId, "本地稽核重新處理", null, { lifecycleStatus: event.lifecycleStatus }, ["lifecycleStatus"]);
      return copy({ ok: true, message: event.payloadAvailable ? "本地虛擬訊息已重新安排。" : "本地虛擬訊息沒有可重新處理的內容。", result: { requeued: event.payloadAvailable ? 1 : 0 } }) as T;
    }
    if (parts[4] === "resolve" && method === "POST") {
      const action = body.action === "force_close" ? "force_closed" : "manually_resolved";
      event.resolutionStatus = action; event.resolvedAt = timestamp(localState.sequence); event.resolvedBy = "local_audit_admin"; event.resolutionReason = typeof body.reason === "string" ? body.reason : null; event.resolutionNote = typeof body.note === "string" ? body.note : null;
      addAudit("reliability_event_resolved", "reliability_event", event.eventId, event.resolutionReason ?? "本地稽核結案", { resolutionStatus: "unresolved" }, { resolutionStatus: event.resolutionStatus }, ["resolutionStatus", "resolvedAt"]);
      return copy({ ok: true, changed: true, message: "本地虛擬訊息已結案。" }) as T;
    }
    if (parts[4] === "record" && method === "POST") {
      const farm = requireFarm(String(body.farmId ?? ""));
      const quantity = Number(body.quantity);
      if (body.intent !== "abnormal" && (!Number.isFinite(quantity) || quantity <= 0)) throw localError(400, "local_audit_invalid_manual_record", "本地稽核補登數量不足。");
      event.resolutionStatus = "manually_recorded"; event.resolvedAt = timestamp(localState.sequence); event.resolvedBy = "local_audit_admin"; event.manualRecordReference = `synthetic-audit-record-${localState.sequence}`;
      addAudit("reliability_event_manually_recorded", "reliability_event", event.eventId, typeof body.reason === "string" ? body.reason : "本地稽核補登", null, { manualRecordReference: event.manualRecordReference, farmId: farm.id }, ["manualRecordReference", "farmId"]);
      return copy({ ok: true, changed: true, message: "已補登本地虛擬紀錄，訊息已結案。", record: { kind: body.intent === "abnormal" ? "abnormal" : "operational", id: event.manualRecordReference } }) as T;
    }
  }

  if (pathname === "/api/ambient/preview" && method === "GET") {
    const page = Number(params.get("page") ?? 0) || 0;
    const pageSize = Number(params.get("pageSize") ?? 2) || 2;
    const result = { ...localState.ambientPreview, page, pageSize, rows: localState.ambientPreview.rows.slice(page * pageSize, (page + 1) * pageSize) };
    return copy(result) as T;
  }
  if (pathname === "/api/pending-candidates" && method === "GET") {
    const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
    const pageSize = Math.max(1, Number(params.get("pageSize") ?? 2) || 2);
    return copy({ page, pageSize, total: localState.pendingCandidates.length, totalPages: Math.ceil(localState.pendingCandidates.length / pageSize), candidates: localState.pendingCandidates.slice(page * pageSize, (page + 1) * pageSize), invalidCount: 0, truncated: true, readOnly: true }) as T;
  }
  if (pathname === "/api/line-groups" && method === "GET") return copy({ groups: localState.lineGroups }) as T;
  if (parts[0] === "api" && parts[1] === "line-groups" && parts[2] && parts[3] === "ai-conversation" && method === "PATCH") {
    const group = localState.lineGroups.find((item) => item.groupId === decode(parts[2]));
    if (!group) throw localError(404, "local_audit_line_group_not_found", "本地稽核資料找不到這個群組。");
    if (group.status === "left") throw localError(400, "local_audit_left_group", "已離開的本地虛擬群組不可切換。");
    group.conversationV2Enabled = body.enabled === true;
    addAudit("line_group_ai_updated", "line_group_ai_conversation", group.groupId, "本地稽核群組設定", { conversationV2Enabled: !group.conversationV2Enabled }, { conversationV2Enabled: group.conversationV2Enabled }, ["conversationV2Enabled"]);
    return copy({ ok: true, changed: true, enabled: group.conversationV2Enabled, message: "本地虛擬群組設定已更新。" }) as T;
  }
  if (pathname === "/api/test-tools" && method === "GET") return copy(testToolsPayload()) as T;
  if (pathname === "/api/technical-info" && method === "GET") return copy(technicalInfoPayload()) as T;

  throw localError(501, "local_audit_unimplemented", `本地稽核 adapter 尚未實作 ${method} ${pathname}。`);
}
