import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type TouchEvent } from "react";
import {
  ApiClient,
  type Alias,
  type AbnormalEvent,
  type AnalysisResult,
  type AmbientPreview,
  type AuditRow,
  type Caretaker,
  type ChartResponse,
  type Dashboard,
  type DataHealth,
  type Farm,
  type FinanceData,
  type Flock,
  type House,
  type OperationalEvent,
  type PendingCandidate,
  type ReliabilityEvent,
  type SystemStatus,
  type TechnicalInfo,
  type TestToolsData,
  type TimelineItem,
  type WeatherDaily,
} from "./api";
import { NAV_GROUPS, NAV_ITEMS, type NavIconName, type NavKey } from "./navigation";

export { NAV_GROUPS, NAV_ITEMS } from "./navigation";

const api = new ApiClient();
type Navigate = (key: NavKey) => void;
type MutationResult = Promise<boolean> | void;

function LineIcon({ name, className = "nav-icon" }: { name: NavIconName; className?: string }) {
  let glyph: ReactNode;
  switch (name) {
    case "dashboard": glyph = <><path d="M4 14a8 8 0 0 1 16 0" /><path d="m12 14 4-4" /><circle cx="12" cy="14" r="1.4" /><path d="M5 19h14" /></>; break;
    case "organization": glyph = <><path d="M5 21V5h14v16" /><path d="M9 21v-4h6v4M8 9h2m4 0h2m-8 4h2m4 0h2" /><path d="M3 21h18" /></>; break;
    case "farms": glyph = <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7M8 11h2m4 0h2" /></>; break;
    case "caretakers": glyph = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-4 2.4-6 5.5-6s5 2 5.5 6" /><circle cx="17" cy="9" r="2.2" /><path d="M15 15c3.2-.5 5.1 1.2 5.5 4" /></>; break;
    case "houses": glyph = <><path d="M3 10h18M5 10v11h14V10M4 10l3-6h10l3 6" /><path d="M9 21v-6h6v6" /></>; break;
    case "flocks": glyph = <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></>; break;
    case "events": glyph = <><path d="M8 5h8M9 3h6v4H9z" /><path d="M6 5H4v16h16V5h-2" /><path d="m8 12 2 2 4-4M8 18h8" /></>; break;
    case "abnormal": glyph = <><path d="M12 3 21 19H3L12 3Z" /><path d="M12 9v5m0 3h.01" /></>; break;
    case "finance": glyph = <><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" /></>; break;
    case "equity": glyph = <><path d="M11 3a9 9 0 1 0 9 9h-9V3Z" /><path d="M15 3.8A9 9 0 0 1 20.2 9H15V3.8Z" /></>; break;
    case "charts": glyph = <><path d="M4 20V5M4 20h17" /><path d="m7 16 4-5 3 2 5-7" /><circle cx="7" cy="16" r="1" /><circle cx="11" cy="11" r="1" /><circle cx="14" cy="13" r="1" /><circle cx="19" cy="6" r="1" /></>; break;
    case "ai": glyph = <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /><circle cx="12" cy="12" r="4" /></>; break;
    case "reminders": glyph = <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" /><path d="M10 20h4M10 3h4" /></>; break;
    case "aliases": glyph = <><circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 5 5M7 8h6M7 11h4" /></>; break;
    case "audit": glyph = <><path d="M4 7v5h5" /><path d="M5.5 17a8 8 0 1 0-.8-9" /><path d="M12 7v5l3 2" /></>; break;
    case "pending": glyph = <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>; break;
    case "system": glyph = <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="M12 8v4l2 2" /></>; break;
    case "diagnostics": glyph = <><path d="M4 5h16v14H4z" /><path d="M7 9h10M7 13h6M7 16h3" /><circle cx="17" cy="16" r="2" /></>; break;
    case "pendingDiagnostics": glyph = <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h4" /><path d="m15 15 2 2 3-4" /></>; break;
    case "testTools": glyph = <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M8 15h8" /></>; break;
    case "health": glyph = <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>; break;
    case "settings": glyph = <><circle cx="12" cy="12" r="3" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="7" /></>; break;
    case "technical": glyph = <><path d="M4 5h16v14H4z" /><path d="M7 9h2m3 0h2m3 0h2M7 13h2m3 0h2m3 0h2M7 17h2m3 0h2" /></>; break;
    case "logout": glyph = <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></>; break;
  }
  return <svg className={className} data-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph}</svg>;
}

const chartOptions = [
  ["mortality", "每日死亡"],
  ["mortality-cumulative", "累積死亡"],
  ["mortality-rate", "死亡率"],
  ["stock", "存欄趨勢"],
  ["cull", "每日淘汰"],
  ["cull-cumulative", "累積淘汰"],
  ["feed", "每日飼料"],
  ["feed-cumulative", "累積飼料"],
  ["water", "每日飲水"],
  ["water-cumulative", "累積飲水"],
  ["shipment", "出雞數量"],
  ["weather-max", "每日最高溫"],
  ["weather-min", "每日最低溫"],
  ["farm-profit", "各場盈虧"],
  ["portfolio-net", "投資組合淨收入"],
] as const;

const rangeOptions = [
  ["7", "7 日"],
  ["30", "30 日"],
  ["90", "90 日"],
  ["all", "整批／全部"],
] as const;

function money(value: unknown): string {
  return Number(value ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function quantity(value: unknown): string {
  return Number(value ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function farmLabel(farm: Pick<Farm, "name" | "environment">): string {
  return `${farm.environment === "test" ? "🧪 " : "🐔 "}${farm.name}`;
}

function eventLabel(intent: string): string {
  return ({ mortality: "死亡", cull: "淘汰", feed: "飼料", water: "飲水", shipment: "出雞" } as Record<string, string>)[intent] ?? intent;
}

function sourceLabel(source: string): string {
  return ({ line: "LINE", web: "網頁", system: "系統", migration: "資料更新" } as Record<string, string>)[source] ?? source;
}

function fieldLabel(field: string): string {
  return ({
    expectedShipDate: "預計出雞日期",
    expectedShipmentDate: "預計出雞日期",
    chickInDate: "入雛日期",
    initialCount: "初始數量",
    quantity: "數量",
    active: "狀態",
    note: "備註",
    status: "批次狀態",
    name: "名稱",
    farmId: "雞場",
    houseId: "雞舍",
    flockId: "批次",
    reason: "原因",
  } as Record<string, string>)[field] ?? field;
}

function formatValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function taipeiTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function reconciliationLabel(value: string): string {
  return ({ not_recorded: "尚未找到正式紀錄", possibly_recorded: "可能已記錄", already_recorded: "可能重複" } as Record<string, string>)[value] ?? value;
}

function routeFromHash(): NavKey {
  if (typeof window === "undefined") return "dashboard";
  const value = window.location.hash.replace(/^#\/?/, "");
  return NAV_ITEMS.some((item) => item.key === value) ? (value as NavKey) : "dashboard";
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warn" | "neutral" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function PanelTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return <div className="panel-title"><h3>{title}</h3>{action && <button className="text-button" onClick={onClick}>{action} →</button>}</div>;
}

function Loading() {
  return <section className="page"><div className="loading" role="status">載入共用 D1 資料…</div></section>;
}

function EmptyState({ title = "目前沒有資料", detail }: { title?: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{detail}</p></div>;
}

function DataTable({ headers, children, mobile, className = "" }: { headers: string[]; children: ReactNode; mobile?: ReactNode; className?: string }) {
  return <>
    <div className={`table-wrap desktop-table ${mobile ? "has-mobile-cards" : ""} ${className}`}>
      <table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table>
    </div>
    {mobile && <div className={`mobile-card-list ${className}`}>{mobile}</div>}
  </>;
}

function MobileCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`mobile-card ${className}`}>{children}</article>;
}

function Metric({ title, value, detail, tone = "neutral" }: { title: string; value: string | number; detail: string; tone?: "good" | "warn" | "neutral" }) {
  return <div className={`metric-card ${tone}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])");
    (focusable?.[0] ?? dialogRef.current)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, []);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
      <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="關閉" onClick={onClose}>×</button></div>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

function Login({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗。");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">🐔</div><p className="eyebrow">金雞協會助理Ai</p><h1>雞場管理中心</h1>
    <p className="muted">使用現有管理密碼登入。密碼只送往 Worker 驗證，不會保存在瀏覽器。</p>
    <form onSubmit={submit}><label>管理密碼<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button className="primary full" disabled={busy || !password}>{busy ? "驗證中…" : "登入管理中心"}</button></form>
    {error && <p className="error-text" role="alert">{error}</p>}
  </section></main>;
}

function ReasonModal({ title, quantityValue, correction, onSubmit, onClose }: { title: string; quantityValue?: number; correction?: boolean; onSubmit: (reason: string, nextQuantity?: number) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [nextQuantity, setNextQuantity] = useState(quantityValue === undefined ? "" : String(quantityValue));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) { setError("修改原因必填。"); return; }
    if (correction && (!nextQuantity || Number(nextQuantity) <= 0)) { setError("修正數量必須大於 0。"); return; }
    setBusy(true);
    setError("");
    try { await onSubmit(reason.trim(), correction ? Number(nextQuantity) : undefined); } catch (err) { setError(err instanceof Error ? err.message : "操作失敗。"); } finally { setBusy(false); }
  }
  return <Modal title={title} onClose={onClose}><form onSubmit={submit}>
    {correction && <label>修正數量<input type="number" min="0.01" step="0.01" value={nextQuantity} onChange={(event) => setNextQuantity(event.target.value)} /></label>}
    <label>修改原因<span className="required">必填</span><textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：現場回報誤登死亡數" /></label>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? "送出中…" : "確認送出"}</button></div>{error && <p className="error-text" role="alert">{error}</p>}
  </form></Modal>;
}

function SimpleChart({ chart }: { chart: ChartResponse | null }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (!chart) return <div className="empty">尚未載入圖表。</div>;
  if (chart.status === "insufficient-data") return <div className="empty">此期間缺少可用分母，無法安全計算死亡率。</div>;
  if (!chart.series.length) return <div className="empty">目前期間沒有資料。</div>;
  const max = Math.max(...chart.series.map((point) => Number(point.value)), 1);
  const min = Math.min(...chart.series.map((point) => Number(point.value)), 0);
  const span = Math.max(max - min, 1);
  const pointPosition = (index: number) => ({ x: (index / Math.max(chart.series.length - 1, 1)) * 100, y: 100 - ((Number(chart.series[index].value) - min) / span) * 88 - 6 });
  const coords = chart.series.map((_, index) => { const point = pointPosition(index); return `${point.x},${point.y}`; }).join(" ");
  const active = activeIndex === null ? null : chart.series[activeIndex];
  return <div className="chart-wrap" data-gesture-lock>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={chart.metric}>
      <line x1="0" y1="94" x2="100" y2="94" className="chart-axis" /><polyline points={coords} className="chart-line" />
      {chart.series.map((point, index) => { const position = pointPosition(index); return <circle key={`${point.date}-${index}`} cx={position.x} cy={position.y} r={activeIndex === index ? 3 : 1.7} className="chart-point" tabIndex={0} aria-label={`${point.date}: ${quantity(point.value)} ${chart.unit}`} onPointerEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onClick={() => setActiveIndex(index)} />; })}
    </svg>
    {active && <div className="chart-tooltip" role="status"><strong>{active.date}</strong><span>{quantity(active.value)} {chart.unit}</span></div>}
    <div className="chart-labels"><span>{chart.series[0].date}</span><strong>{quantity(chart.series[chart.series.length - 1].value)} {chart.unit}</strong><span>{chart.series[chart.series.length - 1].date}</span></div>
    <p className="chart-help">點擊資料點查看日期與數值</p>
  </div>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [page, setPage] = useState<NavKey>(routeFromHash);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [organization, setOrganization] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [reliabilityEvents, setReliabilityEvents] = useState<ReliabilityEvent[]>([]);
  const [ambientPreview, setAmbientPreview] = useState<AmbientPreview | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<PendingCandidate[]>([]);
  const [pendingCandidateInvalidCount, setPendingCandidateInvalidCount] = useState(0);
  const [pendingCandidatePage, setPendingCandidatePage] = useState(0);
  const [pendingCandidateTotalPages, setPendingCandidateTotalPages] = useState(1);
  const [testTools, setTestTools] = useState<TestToolsData | null>(null);
  const [technicalInfo, setTechnicalInfo] = useState<TechnicalInfo | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [abnormalEvents, setAbnormalEvents] = useState<AbnormalEvent[]>([]);
  const [abnormalCursor, setAbnormalCursor] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherDaily[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [abnormalContext, setAbnormalContext] = useState<{ farmId: string; houseId?: string; flockId?: string } | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<AnalysisResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState("mortality");
  const [chartRange, setChartRange] = useState("30");
  const [chartGranularity, setChartGranularity] = useState<"daily" | "weekly" | "monthly">("daily");
  const [chartFarmId, setChartFarmId] = useState("");
  const [chartHouseId, setChartHouseId] = useState("");
  const [chartFlockId, setChartFlockId] = useState("");
  const [chartEnvironment, setChartEnvironment] = useState("");
  const [chartCaretakerId, setChartCaretakerId] = useState("");
  const navigationSource = useRef<"push" | "history">("push");
  const scrollPositions = useRef<Partial<Record<NavKey, number>>>({});
  const touchStart = useRef<{ x: number; y: number; time: number; ignored: boolean } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerWasOpen = useRef(false);
  const current = useMemo(() => NAV_ITEMS.find((item) => item.key === page) ?? NAV_ITEMS[0], [page]);

  async function loadAll() {
    setBusy(true); setError("");
    try {
      const [dash, orgData, farmData, caretakerData, houseData, flockData, eventData, financeData, aliasData, healthData, auditData, abnormalData, weatherData, timelineData, systemData, reliabilityData, previewData, pendingData, testData, technicalData] = await Promise.all([
        api.dashboard(), api.organizations(), api.farms(), api.caretakers(true), api.houses(), api.flocks(), api.events({ limit: 50 }), api.finance(), api.aliases(), api.dataHealth(), api.audit(), api.abnormalEvents({ limit: 50 }), api.weather({ limit: 100 }), api.timeline({ limit: 100 }), api.systemStatus(), api.reliabilityEvents(), api.ambientPreview(), api.pendingCandidates(), api.testTools(), api.technicalInfo(),
      ]);
      setDashboard(dash); setOrganization(orgData.organizations.find(Boolean) ?? null); setFarms(farmData.farms); setCaretakers(caretakerData.caretakers); setHouses(houseData.houses); setFlocks(flockData.flocks); setEvents(eventData.events); setEventsCursor(eventData.nextCursor); setFinance(financeData); setAliases(aliasData.aliases); setHealth(healthData); setAudit(auditData.auditLogs); setAuditCursor(auditData.nextCursor); setAbnormalEvents(abnormalData.abnormalEvents); setAbnormalCursor(abnormalData.nextCursor); setWeather(weatherData.weather); setTimeline(timelineData.timeline); setSystemStatus(systemData.status); setReliabilityEvents(reliabilityData.events); setAmbientPreview(previewData); setPendingCandidates(pendingData.candidates); setPendingCandidateInvalidCount(pendingData.invalidCount); setPendingCandidatePage(pendingData.page); setPendingCandidateTotalPages(pendingData.totalPages); setTestTools(testData); setTechnicalInfo(technicalData);
    } catch (err) { if ((err as { status?: number }).status === 401) { api.setToken(null); setAuthenticated(false); } setError(err instanceof Error ? err.message : "資料載入失敗。"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/dashboard");
    const handleHistory = () => { navigationSource.current = "history"; setPage(routeFromHash()); setDrawerOpen(false); };
    window.addEventListener("hashchange", handleHistory); window.addEventListener("popstate", handleHistory);
    return () => { window.removeEventListener("hashchange", handleHistory); window.removeEventListener("popstate", handleHistory); };
  }, []);

  useEffect(() => { if (authenticated) void loadAll(); }, [authenticated]);

  useEffect(() => {
    if (!authenticated || page !== "charts") return;
    const from = chartRange === "all" ? "2020-01-01" : isoDaysAgo(Number(chartRange));
    const financeMetric = chartMetric.includes("profit") || chartMetric === "portfolio-net";
    let cancelled = false;
    setChartLoading(true);
    api.chart(chartMetric, { from, to: new Date().toISOString().slice(0, 10), granularity: chartGranularity, farmId: chartFarmId || undefined, houseId: financeMetric ? undefined : chartHouseId || undefined, flockId: financeMetric ? undefined : chartFlockId || undefined, environment: chartEnvironment || undefined, caretakerId: financeMetric ? undefined : chartCaretakerId || undefined }).then((result) => { if (!cancelled) setChart(result); }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "圖表載入失敗。"); }).finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [authenticated, page, chartMetric, chartRange, chartGranularity, chartFarmId, chartHouseId, chartFlockId, chartEnvironment, chartCaretakerId]);

  useEffect(() => { if (authenticated) { window.scrollTo({ top: navigationSource.current === "history" ? scrollPositions.current[page] ?? 0 : 0, behavior: "auto" }); navigationSource.current = "push"; } }, [authenticated, page]);
  useEffect(() => { const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, []);
  useEffect(() => { document.body.classList.toggle("drawer-lock", drawerOpen); return () => document.body.classList.remove("drawer-lock"); }, [drawerOpen]);
  useEffect(() => {
    let frame = 0;
    if (drawerOpen) {
      drawerWasOpen.current = true;
      frame = window.requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>('button[aria-current="page"]')?.focus());
    } else if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      frame = window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
    return () => window.cancelAnimationFrame(frame);
  }, [drawerOpen]);

  function navigateTo(next: NavKey) { if (next === page) { setDrawerOpen(false); return; } scrollPositions.current[page] = window.scrollY; navigationSource.current = "push"; window.history.pushState(null, "", `#/${next}`); setPage(next); setDrawerOpen(false); }
  function openAbnormalComposer(context?: { farmId: string; houseId?: string; flockId?: string }) { setAbnormalContext(context ?? null); navigateTo("abnormal"); }
  function touchIsIgnored(target: EventTarget | null): boolean { if (!(target instanceof Element)) return false; return Boolean(target.closest("input, textarea, select, button, a, dialog, .modal, .chart-wrap, .table-wrap, .range-chips, .filter-grid, [data-gesture-lock], [data-scroll-container]")); }
  function handleTouchStart(event: TouchEvent<HTMLElement>) { const touch = event.touches[0]; if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now(), ignored: touchIsIgnored(event.target) }; }
  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current; touchStart.current = null; if (!start || start.ignored) return;
    const touch = event.changedTouches[0]; if (!touch) return;
    const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y; const duration = Math.max(Date.now() - start.time, 1);
    if (Math.abs(deltaY) < 72 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.35 || (Math.abs(deltaY) / duration < 0.28 && Math.abs(deltaY) < 110)) return;
    const scrollTop = window.scrollY; const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0); const atTop = scrollTop <= 4; const atBottom = scrollTop >= maxScroll - 4; const index = NAV_ITEMS.findIndex((item) => item.key === page);
    if (deltaY < 0 && atBottom && index < NAV_ITEMS.length - 1) navigateTo(NAV_ITEMS[index + 1].key);
    if (deltaY > 0 && atTop && index > 0) navigateTo(NAV_ITEMS[index - 1].key);
  }

  async function login(password: string) { const result = await api.login(password); api.setToken(result.token); setAuthenticated(true); }
  async function logout() { try { await api.logout(); } finally { api.setToken(null); setAuthenticated(false); } }
  async function runMutation(work: () => Promise<unknown>, successMessage = "已更新共用 D1 資料"): Promise<boolean> { setError(""); try { await work(); await loadAll(); setToast(successMessage); window.setTimeout(() => setToast(""), 2800); return true; } catch (err) { setError(err instanceof Error ? err.message : "操作失敗。"); return false; } }
  async function loadMoreEvents() { if (!eventsCursor) return; try { const result = await api.events({ limit: 50, cursor: eventsCursor }); setEvents((currentEvents) => [...currentEvents, ...result.events]); setEventsCursor(result.nextCursor); } catch (err) { setError(err instanceof Error ? err.message : "營運紀錄載入失敗。"); } }
  async function loadMoreAudit() { if (!auditCursor) return; try { const result = await api.audit({ cursor: auditCursor }); setAudit((currentAudit) => [...currentAudit, ...result.auditLogs]); setAuditCursor(result.nextCursor); } catch (err) { setError(err instanceof Error ? err.message : "Audit 載入失敗。"); } }
  async function loadMoreAbnormal() { if (!abnormalCursor) return; try { const result = await api.abnormalEvents({ limit: 50, cursor: abnormalCursor }); setAbnormalEvents((currentEvents) => [...currentEvents, ...result.abnormalEvents]); setAbnormalCursor(result.nextCursor); } catch (err) { setError(err instanceof Error ? err.message : "異常紀錄載入失敗。"); } }
  async function loadPendingPage(pageNumber: number) { try { const result = await api.pendingCandidates({ page: pageNumber }); setPendingCandidates(result.candidates); setPendingCandidateInvalidCount(result.invalidCount); setPendingCandidatePage(result.page); setPendingCandidateTotalPages(result.totalPages); } catch (err) { setError(err instanceof Error ? err.message : "待確認資料載入失敗。"); } }

  async function askAi(question: string, force = false) {
    const value = question.trim();
    if (!value) return;
    setAiBusy(true); setError("");
    try {
      const result = await api.aiAnalyze(value, { type: "organization", id: "organization" }, force);
      setAiResult(result.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 分析目前無法使用。");
    } finally { setAiBusy(false); }
  }

  if (!authenticated) return <Login onLogin={login} />;
  return <div className="app-shell">
    {drawerOpen && <button className="drawer-backdrop" aria-label="關閉導覽選單" onClick={() => setDrawerOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${drawerOpen ? "drawer-open" : ""}`} id="primary-navigation" aria-label="管理中心導覽">
      <div className="brand"><span>🐔</span><div><strong>金雞協會助理Ai</strong><small>農場管理中心</small></div><button className="drawer-close icon-button" aria-label="關閉導覽選單" onClick={() => setDrawerOpen(false)}>×</button></div>
      <nav className="sidebar-nav" aria-label="主要功能" data-scroll-container>
        {NAV_GROUPS.map((group) => <div className="nav-group" role="group" aria-labelledby={`nav-group-${group.key}`} key={group.key}>
          <p className="nav-group-title" id={`nav-group-${group.key}`}>{group.label}</p>
          <div className="nav-group-items">{NAV_ITEMS.filter((item) => item.group === group.key).map((item) => <button data-nav-key={item.key} key={item.key} className={item.key === page ? "active" : ""} aria-current={item.key === page ? "page" : undefined} onClick={() => navigateTo(item.key)}>
            <LineIcon name={item.icon} />
            <span className="nav-copy"><span className="nav-label">{item.label}</span><span className="nav-hint">（{item.description}）</span></span>
          </button>)}</div>
        </div>)}
      </nav>
      <div className="sidebar-foot"><span>共用正式 D1</span><button className="logout-button" onClick={() => void logout()}><LineIcon name="logout" /><span>登出</span></button></div>
    </aside>
    <main className="content" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <header className="topbar"><div className="topbar-heading"><button ref={menuButtonRef} className="menu-button icon-button" aria-label={drawerOpen ? "關閉導覽選單" : "開啟導覽選單"} aria-expanded={drawerOpen} aria-controls="primary-navigation" onClick={() => setDrawerOpen((open) => !open)}>☰</button><div><p className="eyebrow">管理工作台</p><h1>{current.label}</h1></div></div><div className="top-actions"><StatusPill tone="good">Worker 線上</StatusPill><button className="icon-button" title="重新整理" aria-label="重新整理" onClick={() => void loadAll()} disabled={busy}>↻</button></div></header>
      <div className="page-purpose" aria-label={`${current.label}頁面說明`}><p>{current.pageDescription}</p></div>
      {toast && <div className="toast" role="status" aria-live="polite">✓ {toast}</div>}{error && <div className="alert error-text" role="alert">{error}<button aria-label="關閉錯誤" onClick={() => setError("")}>×</button></div>}
      {page === "dashboard" && <DashboardView dashboard={dashboard} farms={farms} flocks={flocks} onNavigate={navigateTo} />}
      {page === "organization" && <OrganizationView organization={organization} farms={farms} />}
      {page === "farms" && <FarmsView farms={farms} onCreate={(body) => runMutation(() => api.createFarm(body))} onUpdate={(id, body) => runMutation(() => api.updateFarm(id, body))} onRecord={(farmId) => openAbnormalComposer({ farmId })} />}
      {page === "caretakers" && <CaretakersView caretakers={caretakers} farms={farms} onCreate={(body) => runMutation(() => api.createCaretaker(body))} onUpdate={(id, body) => runMutation(() => api.updateCaretaker(id, body))} onAssign={(farmId, body) => runMutation(() => api.assignCaretaker(farmId, body))} />}
      {page === "houses" && <HousesView houses={houses} farms={farms} onCreate={(body) => runMutation(() => api.createHouse(body))} onUpdate={(id, body) => runMutation(() => api.updateHouse(id, body))} onRecord={(farmId, houseId) => openAbnormalComposer({ farmId, houseId })} />}
      {page === "flocks" && <FlocksView flocks={flocks} farms={farms} houses={houses} onCreate={(body) => runMutation(() => api.createFlock(body))} onUpdate={(id, body) => runMutation(() => api.updateFlock(id, body))} onRecord={(farmId, houseId, flockId) => openAbnormalComposer({ farmId, houseId, flockId })} />}
      {page === "events" && <EventsView events={events} farms={farms} houses={houses} onCreate={(body) => runMutation(() => api.createEvent(body))} onReverse={(id, reason) => runMutation(() => api.reverseEvent(id, reason))} onCorrect={(id, body) => runMutation(() => api.correctEvent(id, body))} onLoadMore={loadMoreEvents} hasMore={Boolean(eventsCursor)} />}
      {page === "abnormal" && <AbnormalView initialContext={abnormalContext} abnormalEvents={abnormalEvents} timeline={timeline} weather={weather} farms={farms} houses={houses} onCreate={(body) => runMutation(() => api.createAbnormalEvent(body))} onReverse={(id, reason) => runMutation(() => api.reverseAbnormalEvent(id, reason))} onCorrect={(id, body) => runMutation(() => api.correctAbnormalEvent(id, body))} onLoadMore={loadMoreAbnormal} hasMore={Boolean(abnormalCursor)} />}
      {page === "finance" && <FinanceView finance={finance} />}
      {page === "equity" && <EquityView finance={finance} />}
      {page === "charts" && <ChartsView chart={chart} loading={chartLoading} farms={farms} houses={houses} flocks={flocks} caretakers={caretakers} metric={chartMetric} setMetric={setChartMetric} range={chartRange} setRange={setChartRange} granularity={chartGranularity} setGranularity={setChartGranularity} farmId={chartFarmId} setFarmId={(value) => { setChartFarmId(value); setChartHouseId(""); setChartFlockId(""); }} houseId={chartHouseId} setHouseId={(value) => { setChartHouseId(value); setChartFlockId(""); }} flockId={chartFlockId} setFlockId={setChartFlockId} environment={chartEnvironment} setEnvironment={setChartEnvironment} caretakerId={chartCaretakerId} setCaretakerId={setChartCaretakerId} />}
      {page === "ai" && <AiView result={aiResult} question={aiQuestion} setQuestion={setAiQuestion} busy={aiBusy} onAsk={() => void askAi(aiQuestion)} />}
      {page === "reminders" && <RemindersView flocks={flocks} />}
      {page === "pending" && <PendingCandidatesView candidates={pendingCandidates} invalidCount={pendingCandidateInvalidCount} page={pendingCandidatePage} totalPages={pendingCandidateTotalPages} onPage={loadPendingPage} diagnostic={false} />}
      {page === "aliases" && <AliasesView aliases={aliases} />}
      {page === "audit" && <AuditView audit={audit} onLoadMore={loadMoreAudit} hasMore={Boolean(auditCursor)} />}
      {page === "health" && <HealthView health={health} />}
      {page === "system" && <SystemStatusView status={systemStatus} events={reliabilityEvents} farms={farms} houses={houses} flocks={flocks} onRecover={() => void runMutation(() => api.recoverUnfinished())} onRecoverEvent={(id) => runMutation(() => api.recoverRetained(id), "已重新安排這筆訊息處理。")} onAcknowledge={() => void runMutation(() => api.acknowledgeRetained(), "已記下查看結果；尚待決定的訊息仍會保留。")} onResolve={(id, action, reason, note, confirm) => runMutation(() => api.resolveRetained(id, action, reason, note, confirm), action === "force_close" ? "這筆訊息已強制結案。" : "這筆訊息已結案。")} onRecord={(id, body) => runMutation(() => api.recordRetained(id, body), "已補登正式紀錄，這筆訊息已結案。")} />}
      {page === "diagnostics" && <MessageDiagnosticsView preview={ambientPreview} events={reliabilityEvents} onPage={(nextPage) => { void api.ambientPreview({ page: nextPage }).then(setAmbientPreview).catch((err) => setError(err instanceof Error ? err.message : "訊息診斷載入失敗。")); }} />}
      {page === "pendingDiagnostics" && <PendingCandidatesView candidates={pendingCandidates} invalidCount={pendingCandidateInvalidCount} page={pendingCandidatePage} totalPages={pendingCandidateTotalPages} onPage={loadPendingPage} diagnostic />}
      {page === "testTools" && <TestToolsView data={testTools} />}
      {page === "settings" && <SettingsView farms={farms} organization={organization} />}
      {page === "technical" && <TechnicalInfoView info={technicalInfo} />}
    </main>
    <button className="ai-float-button" aria-label="開啟 AI 助理" onClick={() => setAiOpen(true)}>✦<span>AI</span></button>
    {aiOpen && <AiSheet question={aiQuestion} setQuestion={setAiQuestion} result={aiResult} busy={aiBusy} onClose={() => setAiOpen(false)} onAsk={() => void askAi(aiQuestion)} />}
  </div>;
}

function DashboardView({ dashboard, farms, flocks, onNavigate }: { dashboard: Dashboard | null; farms: Farm[]; flocks: Flock[]; onNavigate: Navigate }) {
  if (!dashboard) return <Loading />;
  const activeFlocks = flocks.filter((flock) => flock.status === "active").slice(0, 8);
  const activeFarms = farms.filter((farm) => farm.active);
  return <section className="page"><div className="hero"><div><span className="hero-kicker">截至 {dashboard.asOf}</span><h2>今天，讓每一筆雞場資料都清楚可追溯。</h2><p>營運資料由 LINE 與 Web 共用；正式財務統計自動排除測試場。</p></div><button className="primary" onClick={() => onNavigate("events")}>記錄營運事件 ＋</button></div><div className="metric-grid"><Metric title="有效雞場" value={dashboard.counts.farms} detail={`正式 ${dashboard.counts.productionFarms} ／ 測試 ${dashboard.counts.testFarms}`} /><Metric title="目前存欄" value={`${quantity(dashboard.stock)} 隻`} detail={`${dashboard.counts.activeFlocks} 個進行中批次`} /><Metric title="今日死亡" value={`${quantity(dashboard.today.mortality)} 隻`} detail={`淘汰 ${quantity(dashboard.today.cull)} 隻`} tone={dashboard.today.mortality > 0 ? "warn" : "good"} /><Metric title="歷史淨收入" value={`NT${money(dashboard.finance.net)}`} detail="僅正式雞場財務" /></div><div className="two-col"><section className="panel"><PanelTitle title="雞場概覽" action="查看全部" onClick={() => onNavigate("farms")} />{activeFarms.length ? <div className="farm-list">{activeFarms.map((farm) => <div className="farm-row" key={farm.id}><div className="farm-avatar">{farm.environment === "test" ? "🧪" : "🐔"}</div><div className="grow"><strong>{farm.name}</strong><span>{farm.siteName || (farm.structureMode === "multi_house" ? "多舍管理" : "全場管理")}</span></div><StatusPill tone={farm.environment === "test" ? "warn" : "good"}>{farm.environment === "test" ? "測試" : "正式"}</StatusPill></div>)}</div> : <EmptyState detail="目前沒有啟用中的雞場。" />}</section><section className="panel"><PanelTitle title="資料健康度" action="檢視健康檢查" onClick={() => onNavigate("health")} />{dashboard.dataHealth.warnings.length ? <div className="warning-list">{dashboard.dataHealth.warnings.map((warning) => <p key={warning}>⚠️ {warning}</p>)}</div> : <div className="healthy"><span>✓</span><div><strong>目前沒有阻塞性警告</strong><p>主檔、批次與財務資料可正常使用。</p></div></div>}<div className="mini-summary"><span>預計 7 日內出雞</span><strong>{dashboard.upcomingShipments} 批</strong></div></section></div><section className="panel"><PanelTitle title="進行中批次" action="管理批次" onClick={() => onNavigate("flocks")} />{!activeFlocks.length && <EmptyState detail="目前沒有進行中的批次；可到批次頁建立入雛資料。" />}<DataTable headers={["批次", "雞場", "入雛日", "日齡", "預計出雞", "狀態"]}>{activeFlocks.map((flock) => <tr key={flock.id}><td><strong>{flock.batchCode}</strong></td><td>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}</td><td>{flock.chickInDate}</td><td>{flock.ageDays ?? 0} 日</td><td>{flock.expectedShipmentDate ?? "未設定"}</td><td><StatusPill tone="good">進行中</StatusPill></td></tr>)}</DataTable><div className="mobile-card-list">{activeFlocks.map((flock) => <MobileCard key={flock.id}><div className="mobile-card-head"><strong>{flock.batchCode}</strong><StatusPill tone="good">進行中</StatusPill></div><dl className="mobile-fields"><div><dt>雞場</dt><dd>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}</dd></div><div><dt>入雛／日齡</dt><dd>{flock.chickInDate} · {flock.ageDays ?? 0} 日</dd></div><div><dt>預計出雞</dt><dd>{flock.expectedShipmentDate ?? "未設定"}</dd></div></dl></MobileCard>)}</div></section></section>;
}

function PendingCandidatesView({ candidates, invalidCount, page, totalPages, onPage, diagnostic }: { candidates: PendingCandidate[]; invalidCount: number; page: number; totalPages: number; onPage: (page: number) => Promise<void>; diagnostic: boolean }) {
  return <section className="page">
    <div className="hero"><div><span className="hero-kicker">{diagnostic ? "系統維護" : "一般場務"}</span><h2>{diagnostic ? "待確認資料診斷" : "待確認資料"}</h2><p>{diagnostic ? "查看資料狀態、來源與不一致原因；這裡只查看，不會修改資料。" : "查看目前還需要人工確認的營運資訊。"}</p></div></div>
    <div className="metric-grid"><Metric title="待確認資料" value={candidates.length} detail="尚未完成確認" tone={candidates.length ? "warn" : "good"} /><Metric title="來源訊息" value={candidates.reduce((sum, item) => sum + item.sourceMessageCount, 0)} detail="保留必要來源數量" /><Metric title="資料不一致" value={candidates.reduce((sum, item) => sum + item.entries.filter((entry) => entry.conflict).length, 0)} detail="需要查看原因" tone={candidates.some((item) => item.entries.some((entry) => entry.conflict)) ? "warn" : "good"} /></div>
    {invalidCount > 0 && <div className="alert">⚠️ 有 {invalidCount} 筆資料格式不足，沒有猜測內容；請到變更紀錄查看處理痕跡。</div>}
    {candidates.length ? candidates.map((candidate) => <section className="panel" key={candidate.idShort}>
      <div className="panel-title"><h3>待確認資料 · {candidate.idShort}</h3><StatusPill tone="warn">{candidate.status}</StatusPill></div>
      <p className="muted">群組 {candidate.groupIdShort} · {candidate.createdTimeTaipei} · 來源 {candidate.sourceMessageCount} 則</p>
      {candidate.entries.map((entry, index) => <article className="candidate-entry" key={`${candidate.idShort}-${index}`}>
        <div className="panel-title"><h4>{entry.event}{entry.quantity === null ? "" : ` ${quantity(entry.quantity)}${entry.event === "異常" ? "" : "隻"}`}</h4><StatusPill tone={entry.blocking ? "warn" : "good"}>{entry.state}</StatusPill></div>
        <p>雞場：{entry.farm}　雞舍：{entry.house}　批次：{entry.batch}</p>
        {entry.caretakerClues.length > 0 && <p>飼養者線索：{entry.caretakerClues.join("、")}</p>}
        {entry.conflict && <p className="notice">資料不一致：{entry.conflictText ?? "目前有不同線索，需要查看原因。"}{entry.blocking ? " 目前會影響完成。" : " 目前不影響正式紀錄。"}</p>}
        <p className="muted">正式紀錄比對：{reconciliationLabel(entry.reconciliation)} · 已保存證據 {entry.evidenceCount} 項</p>
        {diagnostic && <details><summary>查看來源摘要</summary><p className="muted">來源短編號：{candidate.sourceIdsShort.join("、") || "—"}</p><p className="muted">來源時間：{candidate.sourceTimestamps.map(taipeiTime).join("、") || "—"}</p></details>}
      </article>)}
    </section>) : <div className="panel empty">目前沒有待確認資料。</div>}
    {totalPages > 1 && <div className="page-actions"><button disabled={page <= 0} onClick={() => void onPage(page - 1)}>上一頁</button><span className="muted">第 {page + 1}／{totalPages} 頁</span><button disabled={page >= totalPages - 1} onClick={() => void onPage(page + 1)}>下一頁</button></div>}
    <div className="notice">正式紀錄、修改或取消仍須經既有安全流程；本頁目前只提供查看。</div>
  </section>;
}

function reliabilityStateLabel(value: string): string {
  return ({ received: "已收到，等待處理", queued: "等待處理", processing: "正在處理", reply_pending: "資料完成，正在回覆", retry_waiting: "正在自動再試", retained: "已保留待處理", reply_completed: "已完成" } as Record<string, string>)[value] ?? "需要查看";
}

function reliabilityStageLabel(value: string | null): string {
  return ({ enqueue: "接收後排入處理", processing: "資料處理", reply: "LINE 回覆" } as Record<string, string>)[value ?? ""] ?? "—";
}

type RetainedResolutionAction = "manual_resolve" | "force_close";

function RetainedResolutionModal({ event, action, onClose, onSubmit }: { event: ReliabilityEvent; action: RetainedResolutionAction; onClose: () => void; onSubmit: (reason: string, note: string, confirm: boolean) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const force = action === "force_close";
  async function submit(eventValue: FormEvent) {
    eventValue.preventDefault();
    if (!reason.trim()) { setError("請填寫原因。"); return; }
    if (force && !confirm) { setError("請再次確認後才能強制結案。"); return; }
    setBusy(true); setError("");
    try { if (await onSubmit(reason.trim(), note.trim(), confirm)) onClose(); } catch (err) { setError(err instanceof Error ? err.message : "操作失敗。"); } finally { setBusy(false); }
  }
  return <Modal title={force ? "強制結案" : "確認不用處理"} onClose={onClose}><form onSubmit={submit}>
    <p className="muted">訊息短編號：{event.eventIdShort}</p>
    {force && <div className="notice">這筆訊息結案後，系統不會再自動處理，但處理紀錄仍會保留。</div>}
    <label>原因<span className="required">必填</span><textarea autoFocus value={reason} onChange={(change) => setReason(change.target.value)} placeholder={force ? "例如：確認為測試或重複訊息" : "例如：確認不需要建立正式紀錄"} /></label>
    <label>補充說明（可選）<textarea value={note} onChange={(change) => setNote(change.target.value)} /></label>
    {force && <label className="checkbox-label"><input type="checkbox" checked={confirm} onChange={(change) => setConfirm(change.target.checked)} />我已確認這筆訊息不再自動處理</label>}
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className={force ? "danger-action" : "primary"} disabled={busy}>{busy ? "送出中…" : force ? "確認強制結案" : "確認不用處理"}</button></div>{error && <p className="error-text" role="alert">{error}</p>}
  </form></Modal>;
}

function RetainedRecordModal({ event, farms, houses, flocks, onClose, onSubmit }: { event: ReliabilityEvent; farms: Farm[]; houses: House[]; flocks: Flock[]; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [farmId, setFarmId] = useState("");
  const [houseId, setHouseId] = useState("");
  const [flockId, setFlockId] = useState("");
  const [intent, setIntent] = useState("mortality");
  const [quantityValue, setQuantityValue] = useState("");
  const [unit, setUnit] = useState("隻");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const availableHouses = houses.filter((house) => house.farmId === farmId && house.active);
  const availableFlocks = flocks.filter((flock) => flock.farmId === farmId && (!houseId || flock.houseId === houseId));
  const abnormal = intent === "abnormal";
  async function submit(eventValue: FormEvent) {
    eventValue.preventDefault();
    if (!farmId || !eventDate || !reason.trim() || (abnormal ? !note.trim() : !quantityValue)) { setError(abnormal ? "請填寫雞場、事件內容、日期與原因。" : "請填寫雞場、事件類型、數量、日期與原因。"); return; }
    setBusy(true); setError("");
    try {
      if (await onSubmit({ farmId, houseId: houseId || null, flockId: flockId || null, intent, quantity: abnormal ? null : Number(quantityValue), unit: abnormal ? null : unit, eventDate, note: note.trim() || null, reason: reason.trim() })) onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "補登失敗。"); } finally { setBusy(false); }
  }
  return <Modal title="補登資料" onClose={onClose}><form onSubmit={submit}>
    <p className="muted">原始內容已超過保存期限，請依你確認的資料補登；系統不會猜測原訊息。</p>
    <label>雞場<span className="required">必填</span><select autoFocus value={farmId} onChange={(change) => { setFarmId(change.target.value); setHouseId(""); setFlockId(""); }}><option value="">請選擇雞場</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>
    <label>雞舍（可選）<select value={houseId} onChange={(change) => { setHouseId(change.target.value); setFlockId(""); }}><option value="">場級／未指定</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>
    <label>批次（可選）<select value={flockId} onChange={(change) => setFlockId(change.target.value)}><option value="">未指定</option>{availableFlocks.map((flock) => <option key={flock.id} value={flock.id}>{flock.batchCode}</option>)}</select></label>
    <label>事件類型<span className="required">必填</span><select value={intent} onChange={(change) => setIntent(change.target.value)}><option value="mortality">死亡</option><option value="cull">淘汰</option><option value="feed">飼料</option><option value="water">飲水</option><option value="shipment">出雞</option><option value="abnormal">異常</option></select></label>
    {!abnormal && <><label>數量<span className="required">必填</span><input type="number" min="0.01" step="0.01" value={quantityValue} onChange={(change) => setQuantityValue(change.target.value)} /></label><label>單位<select value={unit} onChange={(change) => setUnit(change.target.value)}><option value="隻">隻</option><option value="kg">kg</option><option value="L">L</option><option value="件">件</option></select></label></>}
    <label>發生日期<span className="required">必填</span><input type="date" value={eventDate} onChange={(change) => setEventDate(change.target.value)} /></label>
    <label>{abnormal ? "事件內容" : "備註"}{abnormal && <span className="required">必填</span>}<textarea value={note} onChange={(change) => setNote(change.target.value)} /></label>
    <label>補登原因<span className="required">必填</span><textarea value={reason} onChange={(change) => setReason(change.target.value)} placeholder="例如：依現場紀錄補登" /></label>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? "送出中…" : "確認補登"}</button></div>{error && <p className="error-text" role="alert">{error}</p>}
  </form></Modal>;
}

function retainedResolutionLabel(event: ReliabilityEvent): string {
  if (event.lifecycleStatus !== "retained") return reliabilityStateLabel(event.lifecycleStatus);
  if (["manually_resolved", "manually_recorded", "force_closed"].includes(event.resolutionStatus)) return "已結案";
  if (event.resolutionStatus === "acknowledged") return "已查看，尚待決定";
  return "已保留待處理";
}

const retainedTerminalStatuses = new Set(["manually_resolved", "manually_recorded", "force_closed"]);

function retainedProblemText(event: ReliabilityEvent): string {
  if (event.payloadAvailable) {
    if (event.lastErrorStage === "enqueue") return "訊息已收到，但尚未順利排入處理。";
    if (event.lastErrorStage === "processing") return "資料處理中斷，系統多次再試仍未完成。";
    if (event.lastErrorStage === "reply") return "資料已完成，但 LINE 回覆沒有完成。";
  }
  if (event.lastErrorStage === "expiry_cleanup") return "原始訊息已超過保存期限，無法安全重新處理。";
  return "系統多次處理仍未完成，已先保留這筆訊息。";
}

function RetainedDetailModal({ event, onClose, onRecover, onRecord, onResolve }: { event: ReliabilityEvent; onClose: () => void; onRecover: (event: ReliabilityEvent) => Promise<boolean>; onRecord: (event: ReliabilityEvent) => void; onResolve: (event: ReliabilityEvent, action: RetainedResolutionAction) => void }) {
  const [confirmRecover, setConfirmRecover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const terminal = retainedTerminalStatuses.has(event.resolutionStatus);
  const retained = event.lifecycleStatus === "retained" && !terminal;
  async function recover() {
    setBusy(true); setError("");
    try { if (await onRecover(event)) onClose(); } catch (err) { setError(err instanceof Error ? err.message : "重新處理失敗。"); } finally { setBusy(false); }
  }
  return <Modal title="這筆訊息尚未完成" onClose={onClose}>
    <div className="detail-grid">
      <div><span>收到時間</span><strong>{taipeiTime(event.receivedAt)}</strong></div>
      <div><span>短編號</span><strong>{event.eventIdShort}</strong></div>
      <div><span>目前狀態</span><strong>{retainedResolutionLabel(event)}</strong></div>
      <div><span>原始內容</span><strong>{event.payloadAvailable ? "仍在保存期限內" : "已超過保存期限或已清除"}</strong></div>
    </div>
    <div className="notice"><strong>為什麼沒有完成</strong><p>{retainedProblemText(event)}</p>{!event.payloadAvailable && <p>原始訊息已超過保存時間，現在無法自動重新處理。</p>}</div>
    {terminal && <div className="healthy"><span>✓</span><div><strong>這筆已結案</strong><p>{event.resolutionReason ?? "已完成管理者決定。"}{event.resolvedAt ? ` · ${taipeiTime(event.resolvedAt)}` : ""}</p>{event.manualRecordReference && <p>正式紀錄：{event.manualRecordReference}</p>}</div></div>}
    {retained && <div className="detail-actions">
      {event.payloadAvailable && !confirmRecover && <button className="primary" onClick={() => setConfirmRecover(true)}>重新處理</button>}
      {!event.payloadAvailable && <p className="muted">目前不能重新處理；可以補登資料或結案。</p>}
      <button onClick={() => onRecord(event)}>補登資料</button>
      <button onClick={() => onResolve(event, "manual_resolve")}>確認不用處理</button>
      <details className="danger-details"><summary>其他處理方式</summary><p>只有在無法確認原始內容，而且確定不需要繼續追查時，才使用強制結案。</p><button className="danger-action" onClick={() => onResolve(event, "force_close")}>強制結案</button></details>
    </div>}
    {confirmRecover && <div className="notice recovery-confirm"><strong>請再次確認</strong><p>系統會再處理一次這筆訊息，不會重做已完成的紀錄。</p><div className="modal-actions"><button type="button" onClick={() => setConfirmRecover(false)}>先不要</button><button className="primary" disabled={busy} onClick={() => void recover()}>{busy ? "送出中…" : "確認重新處理"}</button></div></div>}
    <details className="technical-detail"><summary>技術資料</summary><dl className="mobile-fields"><div><dt>關聯短編號</dt><dd>{event.correlationIdShort}</dd></div><div><dt>最近處理階段</dt><dd>{reliabilityStageLabel(event.lastErrorStage)}</dd></div><div><dt>再試次數</dt><dd>{event.queueAttempts + event.processingAttempts + event.replyAttempts}</dd></div><div><dt>最近問題</dt><dd>{event.lastErrorClass ?? "—"}</dd></div></dl></details>
    {error && <p className="error-text" role="alert">{error}</p>}
  </Modal>;
}

function SystemStatusView({ status, events, farms, houses, flocks, onRecover, onRecoverEvent, onAcknowledge, onResolve, onRecord }: { status: SystemStatus | null; events: ReliabilityEvent[]; farms: Farm[]; houses: House[]; flocks: Flock[]; onRecover: () => void; onRecoverEvent: (eventId: string) => Promise<boolean>; onAcknowledge: () => void; onResolve: (eventId: string, action: RetainedResolutionAction, reason: string, note: string, confirm: boolean) => Promise<boolean>; onRecord: (eventId: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [showEvents, setShowEvents] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [detailEvent, setDetailEvent] = useState<ReliabilityEvent | null>(null);
  const [action, setAction] = useState<{ kind: "resolve" | "force" | "record"; event: ReliabilityEvent } | null>(null);
  if (!status) return <Loading />;
  const openRetained = events.filter((event) => event.lifecycleStatus === "retained" && !retainedTerminalStatuses.has(event.resolutionStatus));
  const resolvedRetained = events.filter((event) => event.lifecycleStatus === "retained" && retainedTerminalStatuses.has(event.resolutionStatus));
  const replayable = openRetained.some((event) => event.payloadAvailable);
  const attentionCount = Math.max(status.retainedOpenCount, status.stalledCount, status.deliveryUncertainCount);
  const manuallyRecorded = events.filter((event) => event.resolutionStatus === "manually_recorded").length;
  const manuallyResolved = events.filter((event) => event.resolutionStatus === "manually_resolved").length;
  const forceClosed = events.filter((event) => event.resolutionStatus === "force_closed").length;
  const openEvents = events.filter((event) => event.lifecycleStatus !== "reply_completed" && !retainedTerminalStatuses.has(event.resolutionStatus));
  const openAction = (event: ReliabilityEvent, kind: "record" | "resolve" | "force") => { setDetailEvent(null); setAction({ kind, event }); };
  return <section className="page">
    <div className={`hero ${status.level === "attention" ? "warning" : ""}`}>
      <div><span className="hero-kicker">系統目前狀態</span><h2>{status.level === "normal" ? "✅ 系統目前運作正常" : status.level === "slow" ? "⚠️ 目前有些訊息處理比較慢" : `❗ 有 ${attentionCount} 筆訊息尚未完成`}</h2><p>{status.retainedOpenCount > 0 && status.retainedAcknowledgedCount > 0 ? `已查看，但仍有 ${status.retainedOpenCount} 筆需要決定如何處理。` : status.message}</p></div>
      <div className="modal-actions">{(status.actionableUnfinishedCount > 0 || status.stalledCount > 0 || status.deliveryUncertainCount > 0 || replayable) ? <button className="primary" onClick={onRecover}>🔄 重新處理可恢復訊息</button> : null}{status.retainedUnacknowledgedCount > 0 ? <button onClick={onAcknowledge}>我已查看</button> : null}</div>
    </div>
    <div className="metric-grid"><Metric title="尚待決定" value={status.retainedOpenCount} detail="請逐筆選擇處理方式" tone={status.retainedOpenCount ? "warn" : "good"} /><Metric title="已查看待決定" value={status.retainedAcknowledgedCount} detail="已查看，但還沒有結案" tone={status.retainedAcknowledgedCount ? "warn" : "good"} /><Metric title="可以重新處理" value={openRetained.filter((event) => event.payloadAvailable).length} detail="原始內容仍可使用" tone={replayable ? "warn" : "good"} /><Metric title="已補登" value={manuallyRecorded} detail="已建立正式紀錄" tone="good" /><Metric title="已確認不用處理" value={manuallyResolved} detail="已結案，不建立紀錄" tone="good" /><Metric title="已強制結案" value={forceClosed} detail="已結案，保留處理紀錄" tone="good" /></div>
    <section className="panel"><PanelTitle title="各部分狀態" /><DataTable headers={["項目", "目前狀態", "說明"]}><tr><td>接收群組訊息</td><td><StatusPill tone={status.level === "attention" ? "warn" : "good"}>{status.checks.receive}</StatusPill></td><td>已收到的訊息會先保留處理紀錄。</td></tr><tr><td>處理群組訊息</td><td><StatusPill tone={status.checks.process === "正常" ? "good" : "warn"}>{status.checks.process}</StatusPill></td><td>卡住時會自動重新安排處理。</td></tr><tr><td>資料儲存</td><td><StatusPill tone="good">{status.checks.storage}</StatusPill></td><td>正式資料仍由同一份資料庫保存。</td></tr><tr><td>LINE 回覆</td><td><StatusPill tone={status.checks.reply === "正常" ? "good" : "warn"}>{status.checks.reply}</StatusPill></td><td>資料已完成但回覆失敗時，只會重送回覆。</td></tr></DataTable></section>
    <section className="panel"><PanelTitle title="未完成訊息" action={showEvents ? "收起" : "🔍 查看未完成訊息"} onClick={() => setShowEvents((value) => !value)} />{showEvents ? (openEvents.length ? <DataTable headers={["短編號", "收到時間", "目前狀態", "最近問題", "操作"]}>{openEvents.map((event) => { const retained = event.lifecycleStatus === "retained"; return <tr key={`${event.eventIdShort}-${event.receivedAt}`}><td><code>{event.eventIdShort}</code></td><td>{taipeiTime(event.receivedAt)}</td><td>{retainedResolutionLabel(event)}</td><td>{event.lastErrorStage ? `${reliabilityStageLabel(event.lastErrorStage)}：發生問題` : "—"}</td><td>{retained ? <button className="table-button" onClick={() => setDetailEvent(event)}>查看／處理</button> : <span className="muted">系統正在處理</span>}</td></tr>; })}</DataTable> : <div className="empty">目前沒有未完成訊息。</div>) : <p className="muted">這裡列出尚未完成的訊息；點「查看／處理」可查看原因與下一步。已結案資料仍保留處理紀錄。</p>}</section>
    <section className="panel"><PanelTitle title="已結案訊息" action={showResolved ? "收起" : "查看已結案訊息"} onClick={() => setShowResolved((value) => !value)} />{showResolved ? (resolvedRetained.length ? <DataTable headers={["短編號", "收到時間", "結案方式", "結案時間", "操作者", "原因", "查看"]}>{resolvedRetained.map((event) => <tr key={`${event.eventIdShort}-${event.resolvedAt}`}><td><code>{event.eventIdShort}</code></td><td>{taipeiTime(event.receivedAt)}</td><td>{event.resolutionStatus === "manually_recorded" ? "已補登" : event.resolutionStatus === "force_closed" ? "強制結案" : "確認不用處理"}</td><td>{taipeiTime(event.resolvedAt)}</td><td>{event.resolvedBy ?? "—"}</td><td>{event.resolutionReason ?? "—"}</td><td><button className="table-button" onClick={() => setDetailEvent(event)}>查看</button></td></tr>)}</DataTable> : <div className="empty">目前沒有已結案訊息。</div>) : <p className="muted">已結案的處理紀錄不會刪除，也不會再列為未完成。</p>}</section>
    <section className="panel"><PanelTitle title="最近問題" /><p>{status.lastProblemAt ? `最近一次問題：${taipeiTime(status.lastProblemAt)}` : "目前沒有最近問題。"}</p><p className="muted">系統會先自動恢復；多次失敗的訊息會保留，管理者可逐筆選擇重新處理、補登或結案。</p></section>
    {detailEvent && <RetainedDetailModal event={detailEvent} onClose={() => setDetailEvent(null)} onRecover={(event) => onRecoverEvent(event.eventId)} onRecord={(event) => openAction(event, "record")} onResolve={(event, resolveAction) => openAction(event, resolveAction === "force_close" ? "force" : "resolve")} />}
    {action?.kind === "record" && <RetainedRecordModal event={action.event} farms={farms} houses={houses} flocks={flocks} onClose={() => setAction(null)} onSubmit={(body) => onRecord(action.event.eventId, body)} />}
    {action?.kind === "resolve" && <RetainedResolutionModal event={action.event} action="manual_resolve" onClose={() => setAction(null)} onSubmit={(reason, note, confirm) => onResolve(action.event.eventId, "manual_resolve", reason, note, confirm)} />}
    {action?.kind === "force" && <RetainedResolutionModal event={action.event} action="force_close" onClose={() => setAction(null)} onSubmit={(reason, note, confirm) => onResolve(action.event.eventId, "force_close", reason, note, confirm)} />}
  </section>;
}

function MessageDiagnosticsView({ preview, events, onPage }: { preview: AmbientPreview | null; events: ReliabilityEvent[]; onPage?: (page: number) => void }) {
  if (!preview) return <Loading />;
  const failureLabel = (value: string | null): string => ({ extract: "資料整理", resolve: "資料比對", reconcile: "資料確認", push: "回覆傳送", expiry_cleanup: "保存期限處理" } as Record<string, string>)[value ?? ""] ?? "發生問題";
  return <section className="page">
    <div className="hero"><div><span className="hero-kicker">系統維護</span><h2>訊息診斷</h2><p>查看尚未整理、已過期未完成，以及尚未完成的訊息。這裡只查看，不會跑摘要或修改資料。</p></div></div>
    <div className="metric-grid"><Metric title="尚待整理訊息" value={preview.total} detail="目前尚未完成整理" tone={preview.total ? "warn" : "good"} /><Metric title="可能與營運有關" value={preview.candidateLikeCount} detail="需要摘要檢查" /><Metric title="待確認資料" value={preview.openCandidateCount} detail="不等於正式紀錄" /><Metric title="已過期但未完成" value={preview.expiredDiagnosticCount} detail="只保留診斷摘要" tone={preview.expiredDiagnosticCount ? "warn" : "good"} /></div>
    <section className="panel"><div className="panel-title"><h3>尚未整理訊息</h3><span className="muted">第 {preview.page + 1}／{preview.totalPages} 頁</span></div>{preview.truncated && <p className="notice">目前只先載入部分資料；請用下一頁查看其他訊息。</p>}{preview.rows.length ? <DataTable headers={["時間", "群組", "內容", "判定", "保存期限"]}>{preview.rows.map((row) => <tr key={row.idShort}><td>{row.eventTimeTaipei}</td><td>{row.groupIdShort}</td><td>{row.text}</td><td><StatusPill tone={row.candidateLike ? "warn" : "neutral"}>{row.candidateLike ? "可能與營運有關" : "目前判定與營運無關"}</StatusPill></td><td>{taipeiTime(row.expiresAt)}</td></tr>)}</DataTable> : <div className="empty">目前沒有尚未整理的群組訊息。</div>}{preview.totalPages > 1 && <div className="page-actions"><button disabled={preview.page <= 0} onClick={() => onPage?.(preview.page - 1)}>上一頁</button><button disabled={preview.page >= preview.totalPages - 1} onClick={() => onPage?.(preview.page + 1)}>下一頁</button></div>}</section>
    <section className="panel"><PanelTitle title="已過期但未完成" /><p className="muted">原始訊息仍依保存期限清理；這裡只顯示不含原文的診斷資訊。</p>{preview.expiredDiagnostics.length ? <DataTable headers={["原始時間", "短編號", "判定", "最後問題"]}>{preview.expiredDiagnostics.map((row) => <tr key={`${row.sourceIdShort}-${row.expiredAt}`}><td>{row.eventTimeTaipei}</td><td><code>{row.sourceIdShort}</code></td><td>{row.prefilterResult}</td><td>{row.lastFailureStage ? failureLabel(row.lastFailureStage) : "—"}</td></tr>)}</DataTable> : <div className="empty">目前沒有已過期但未完成的訊息。</div>}</section>
    <section className="panel"><PanelTitle title="尚未完成訊息" /><p className="muted">這裡只列短編號與處理狀態，不顯示原始內容。</p>{events.length ? <DataTable headers={["短編號", "收到時間", "目前狀態", "最近問題", "再試次數"]}>{events.map((event) => <tr key={`${event.eventIdShort}-${event.receivedAt}`}><td><code>{event.eventIdShort}</code></td><td>{taipeiTime(event.receivedAt)}</td><td>{reliabilityStateLabel(event.lifecycleStatus)}</td><td>{event.lastErrorStage ? reliabilityStageLabel(event.lastErrorStage) : "—"}</td><td>{event.queueAttempts + event.processingAttempts + event.replyAttempts}</td></tr>)}</DataTable> : <div className="empty">目前沒有尚未完成訊息。</div>}</section>
    <div className="notice">本頁不會呼叫 AI、不會建立待確認資料、不會消耗來源訊息，也不會修改正式資料。</div>
  </section>;
}

function TestToolsView({ data }: { data: TestToolsData | null }) {
  if (!data) return <Loading />;
  return <section className="page"><div className="hero"><div><span className="hero-kicker">系統維護</span><h2>測試工具</h2><p>{data.warning}</p></div></div><div className="metric-grid"><Metric title="測試雞場" value={data.farms.length} detail="只讀查看" /><Metric title="測試雞舍" value={data.houses.length} detail="只讀查看" /><Metric title="測試批次" value={data.flocks.length} detail="只讀查看" /></div><section className="panel"><PanelTitle title="測試雞場" /><DataTable headers={["雞場", "狀態", "雞舍數", "進行中批次"]}>{data.farms.map((farm) => <tr key={String(farm.id)}><td><strong>{String(farm.name)}</strong></td><td>{Number(farm.active) === 1 ? "啟用" : "封存"}</td><td>{String(farm.houseCount ?? 0)}</td><td>{String(farm.flockCount ?? 0)}</td></tr>)}</DataTable></section><section className="panel"><PanelTitle title="測試雞舍與批次" /><DataTable headers={["雞場／雞舍", "批次", "入雛日期", "初始數量", "狀態"]}>{data.flocks.map((flock) => <tr key={String(flock.id)}><td>{String(flock.farmName)}／{String(flock.houseName)}</td><td>{String(flock.batchCode)}</td><td>{String(flock.chickInDate)}</td><td>{quantity(flock.initialCount)}</td><td>{String(flock.status) === "active" ? "進行中" : String(flock.status)}</td></tr>)}</DataTable></section><div className="notice">測試工具沒有建立、修改或刪除正式營運紀錄的按鈕。</div></section>;
}

function TechnicalInfoView({ info }: { info: TechnicalInfo | null }) {
  if (!info) return <Loading />;
  return <section className="page"><div className="hero"><div><span className="hero-kicker">系統維護</span><h2>技術資訊</h2><p>{info.note}</p></div></div><section className="panel"><PanelTitle title="服務設定" /><div className="setting-row"><span>服務</span><strong>{info.service}</strong></div><div className="setting-row"><span>LINE 帳號</span><strong>{info.accountName}</strong></div><div className="setting-row"><span>對話模式</span><strong>{info.conversationMode}</strong></div><div className="setting-row"><span>對話模型</span><strong>{info.conversationModel}</strong></div><div className="setting-row"><span>背景整理模型</span><strong>{info.ambientModel}</strong></div><div className="setting-row"><span>資料庫版本</span><strong>{info.migration}</strong></div></section><section className="panel"><PanelTitle title="訊息處理設定" /><div className="setting-row"><span>訊息處理</span><strong>{info.queue.name}</strong></div><div className="setting-row"><span>每批最多</span><strong>{info.queue.batchSize} 筆</strong></div><div className="setting-row"><span>等待時間</span><strong>{info.queue.timeoutSeconds} 秒</strong></div><div className="setting-row"><span>最多自動再試</span><strong>{info.queue.maxRetries} 次</strong></div><div className="setting-row"><span>排程</span><strong>{info.schedules.join("、")}</strong></div></section><div className="notice">未顯示密碼、權杖、完整使用者編號、原始訊息或完整處理內容。</div></section>;
}

function abnormalCategoryLabel(category: string | null): string {
  return ({ health: "雞隻健康", equipment: "設備", environment: "環境", weather_disaster: "天災／災損", feed: "飼料", water: "飲水", biosecurity: "生物安全", operation: "操作", logistics: "物流", structure: "設施", system: "系統", other: "其他" } as Record<string, string>)[category ?? ""] ?? "待分類";
}

function abnormalStateLabel(status: string): ReactNode {
  if (status === "reversed") return <StatusPill>已反轉</StatusPill>;
  if (status === "corrected") return <StatusPill>已修正</StatusPill>;
  return <StatusPill tone="good">有效</StatusPill>;
}

function AbnormalCorrectionModal({ event, onSubmit, onClose }: { event: AbnormalEvent; onSubmit: (rawText: string, reason: string) => Promise<void>; onClose: () => void }) {
  const [rawText, setRawText] = useState(event.rawText);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(eventValue: FormEvent) {
    eventValue.preventDefault();
    if (!rawText.trim() || !reason.trim()) { setError("修正內容與原因皆必填。"); return; }
    setBusy(true); setError("");
    try { await onSubmit(rawText.trim(), reason.trim()); } catch (err) { setError(err instanceof Error ? err.message : "修正失敗。"); } finally { setBusy(false); }
  }
  return <Modal title="修正異常紀錄" onClose={onClose}><form onSubmit={submit}><label>原始紀錄<textarea value={event.rawText} readOnly /></label><label>修正後內容<textarea autoFocus value={rawText} onChange={(change) => setRawText(change.target.value)} /></label><label>修改原因<span className="required">必填</span><textarea value={reason} onChange={(change) => setReason(change.target.value)} placeholder="例如：現場回報原文誤植" /></label><div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? "送出中…" : "確認修正"}</button></div>{error && <p className="error-text" role="alert">{error}</p>}</form></Modal>;
}

function AbnormalView({ initialContext, abnormalEvents, timeline, weather, farms, houses, onCreate, onReverse, onCorrect, onLoadMore, hasMore }: { initialContext: { farmId: string; houseId?: string; flockId?: string } | null; abnormalEvents: AbnormalEvent[]; timeline: TimelineItem[]; weather: WeatherDaily[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => MutationResult; onReverse: (id: string, reason: string) => MutationResult; onCorrect: (id: string, body: Record<string, unknown>) => MutationResult; onLoadMore: () => Promise<void>; hasMore: boolean }) {
  const [farmId, setFarmId] = useState("");
  const [houseId, setHouseId] = useState("");
  const [flockId, setFlockId] = useState("");
  const [rawText, setRawText] = useState("");
  const [more, setMore] = useState(false);
  const [modal, setModal] = useState<{ kind: "reverse" | "correct"; event: AbnormalEvent } | null>(null);
  useEffect(() => { setFarmId(initialContext?.farmId ?? ""); setHouseId(initialContext?.houseId ?? ""); setFlockId(initialContext?.flockId ?? ""); }, [initialContext]);
  const availableHouses = houses.filter((house) => house.farmId === farmId && house.active);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!farmId || !rawText.trim()) return; void onCreate({ farmId, houseId: houseId || null, flockId: flockId || null, rawText: rawText.trim() }); setRawText(""); };
  return <section className="page"><div className="panel"><PanelTitle title="＋ 記一件事" /><p className="muted">只要記錄現場發生什麼；時間、批次、天氣與分類由系統補足。</p><form className="minimal-event-form" onSubmit={submit}><label>雞場<select value={farmId} onChange={(event) => { setFarmId(event.target.value); setHouseId(""); }}><option value="">先選雞場</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label>{availableHouses.length > 0 && <label>雞舍（可選）<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">自動判定／全場</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>}<label className="event-text-field">發生什麼事？<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="例如：咳嗽、臭腳、水簾壞掉" /></label><button className="primary" disabled={!farmId || !rawText.trim()}>記錄</button></form><button className="text-button more-options" aria-expanded={more} onClick={() => setMore((value) => !value)}>{more ? "收起更多選項" : "更多選項"}</button>{more && <p className="notice">目前時間與現有雞場／雞舍 context 會自動帶入；日期修正可在紀錄建立後使用修正流程。</p>}</div><section className="panel"><PanelTitle title="異常紀錄" /><p className="muted">原始文字永久保留；AI 分類失敗不會影響紀錄有效性。</p>{!abnormalEvents.length && <EmptyState detail="目前尚無異常紀錄。" />}<DataTable headers={["時間", "雞場／雞舍", "原始紀錄", "分類", "天氣", "狀態", "操作"]}>{abnormalEvents.map((event) => <tr key={event.id} className={event.status !== "active" ? "muted-row" : ""}><td>{event.occurredAt ?? `${event.occurredDate} ${event.approximatePeriod ?? ""}`}</td><td>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })}<br /><span className="muted">{event.houseName ?? "場級"}</span></td><td><strong>{event.rawText}</strong></td><td>{abnormalCategoryLabel(event.category)}<br /><small>{event.tags.length ? event.tags.join("、") : "待分類"}</small></td><td>{event.maxTemperatureC ?? "—"} {event.maxTemperatureAt ? `（${event.maxTemperatureAt}）` : ""}</td><td>{abnormalStateLabel(event.status)}</td><td>{event.status === "active" && <div className="button-row"><button className="table-button" onClick={() => setModal({ kind: "correct", event })}>修正</button><button className="table-button danger" onClick={() => setModal({ kind: "reverse", event })}>反轉</button></div>}</td></tr>)}</DataTable><div className="mobile-card-list">{abnormalEvents.map((event) => <MobileCard key={event.id} className={event.status !== "active" ? "muted-row" : ""}><div className="mobile-card-head"><strong>⚠️ {event.rawText}</strong>{abnormalStateLabel(event.status)}</div><dl className="mobile-fields"><div><dt>雞場／雞舍</dt><dd>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })} · {event.houseName ?? "場級"}</dd></div><div><dt>時間</dt><dd>{event.occurredAt ?? `${event.occurredDate} ${event.approximatePeriod ?? ""}`}</dd></div><div><dt>分類／天氣</dt><dd>{abnormalCategoryLabel(event.category)} · {event.maxTemperatureC ?? "待補"}{event.maxTemperatureAt ? `°C（${event.maxTemperatureAt}）` : ""}</dd></div></dl>{event.status === "active" && <div className="card-actions"><button className="table-button" onClick={() => setModal({ kind: "correct", event })}>修正</button><button className="table-button danger" onClick={() => setModal({ kind: "reverse", event })}>反轉</button></div>}</MobileCard>)}</div>{hasMore && <div className="load-more"><button onClick={() => void onLoadMore()}>載入更多異常</button></div>}</section><section className="panel"><PanelTitle title="營運時間軸" /><p className="muted">死亡、淘汰、飼料、飲水、出雞與異常事件依時間合併。</p>{timeline.length ? <div className="timeline-list">{timeline.slice(0, 30).map((item) => <article className="timeline-item" key={`${item.itemType}-${item.id}`}><div className="timeline-marker">{item.itemType === "abnormal" ? "⚠️" : "•"}</div><div className="grow"><strong>{item.itemType === "abnormal" ? item.rawText : `${eventLabel(item.eventType ?? "")} ${quantity(item.quantity)} ${item.unit ?? ""}`}</strong><span>{item.occurredDate} · {farmLabel({ name: item.farmName, environment: item.environment as "production" | "test" })} · {item.houseName ?? "場級"}</span>{item.maxTemperatureC !== null && <small>{item.maxTemperatureC}°C（{item.maxTemperatureAt ?? "時間待補"}）／{item.minTemperatureC ?? "—"}°C（{item.minTemperatureAt ?? "時間待補"}）</small>}</div>{abnormalStateLabel(item.status)}</article>)}</div> : <EmptyState detail="目前尚無可合併的時間軸資料。" />}</section><section className="panel"><PanelTitle title="每日天氣摘要" /><p className="muted">雲林縣每日一筆區域摘要，不保存每小時歷史。</p>{weather.length ? <DataTable headers={["日期", "區域", "天氣", "最高溫", "最低溫", "狀態"]}>{weather.slice(0, 50).map((row) => <tr key={row.id}><td>{row.weatherDate}</td><td>{row.weatherScope ?? row.farmName}</td><td>{row.condition ?? "—"}</td><td>{row.maxTemperatureC === null ? "待補" : `${row.maxTemperatureC}°C（${row.maxTemperatureAt ?? "時間待補"}）`}</td><td>{row.minTemperatureC === null ? "待補" : `${row.minTemperatureC}°C（${row.minTemperatureAt ?? "時間待補"}）`}</td><td><StatusPill tone={row.fetchStatus === "captured" || row.fetchStatus === "backfilled" ? "good" : "warn"}>{row.fetchStatus}</StatusPill></td></tr>)}</DataTable> : <EmptyState detail="尚未抓到雲林縣每日天氣摘要；每日排程會取得前一個完整日。" />}</section>{modal?.kind === "reverse" && <ReasonModal title="反轉異常紀錄" onClose={() => setModal(null)} onSubmit={async (reason) => { await onReverse(modal.event.id, reason); setModal(null); }} />}{modal?.kind === "correct" && <AbnormalCorrectionModal event={modal.event} onClose={() => setModal(null)} onSubmit={async (text, reason) => { await onCorrect(modal.event.id, { rawText: text, reason }); setModal(null); }} />}</section>;
}

function AnalysisReportView({ result }: { result: AnalysisResult | null }) {
  if (!result) return <EmptyState detail="提出一個營運問題後，這裡會顯示唯讀分析報告。" />;
  return <div className="analysis-report"><div className="notice"><strong>目前狀態</strong><p>{result.report.currentStatus}</p></div><h4>主要發現</h4><ul>{result.report.findings.map((item) => <li key={item}>{item}</li>)}</ul><h4>可能原因</h4><ul>{result.report.possibleCauses.map((item) => <li key={item.text}>{item.text}（證據{item.evidence === "strong" ? "較強" : item.evidence === "medium" ? "中等" : "較弱"}）</li>)}</ul><h4>風險</h4><ul>{result.report.risks.map((item) => <li key={item}>{item}</li>)}</ul><h4>建議</h4><ul>{result.report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul><p className="muted">資料限制：{result.report.limitations.join("；") || "無"}</p><small className="technical-meta">模型：{result.model} · {result.cached ? "使用快取" : "本次分析"}</small></div>;
}

function AiSheet({ question, setQuestion, result, busy, onClose, onAsk }: { question: string; setQuestion: (value: string) => void; result: AnalysisResult | null; busy: boolean; onClose: () => void; onAsk: () => void }) {
  return <div className="ai-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="ai-sheet" role="dialog" aria-modal="true" aria-label="AI 助理"><div className="panel-title"><div><p className="eyebrow">AI 營運助理</p><h2>詢答與分析</h2></div><button className="icon-button" aria-label="關閉 AI 助理" onClick={onClose}>×</button></div><p className="muted">只讀分析目前共用 D1，不會直接修改資料。</p><div className="ai-question-block"><strong>快速提問</strong><span className="muted">點一下帶入問題，可先修改再分析。</span><div className="quick-prompts">{["最近有哪些異常？", "最近哪一場需要注意？", "比較目前營運狀態"].map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div><form className="ai-question-form ai-sheet-form" onSubmit={(event) => { event.preventDefault(); onAsk(); }}><label>請輸入問題<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：最近哪一場最需要注意？" /></label><button className="primary full" disabled={busy || !question.trim()}>{busy ? "分析中…" : "開始分析"}</button></form><div className="ai-result-block"><strong>分析結果</strong><AnalysisReportView result={result} /></div></section></div>;
}

function AiView({ result, question, setQuestion, busy, onAsk }: { result: AnalysisResult | null; question: string; setQuestion: (value: string) => void; busy: boolean; onAsk: () => void }) {
  return <section className="page"><div className="panel ai-workspace"><div className="ai-workspace-heading"><div><p className="eyebrow">AI 營運助理</p><h2>詢答與分析</h2></div><span className="pill">唯讀</span></div><p className="muted">只讀取已驗證的營運、異常、天氣與財務摘要；固定查詢仍直接由 D1 回答。</p><div className="ai-question-block"><strong>快速提問</strong><span className="muted">點一下帶入問題，不會直接送出。</span><div className="quick-prompts">{["這一批最近有哪些異常？", "哪一場最近需要注意？", "異常發生時的天氣有什麼共同點？"].map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div><form className="ai-question-form" onSubmit={(event) => { event.preventDefault(); onAsk(); }}><label>請輸入問題<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：最近哪一場最需要注意？" /></label><button className="primary full" disabled={busy || !question.trim()}>{busy ? "分析中…" : "開始分析"}</button></form><div className="ai-result-block"><strong>分析結果</strong><AnalysisReportView result={result} /></div></div></section>;
}

function OrganizationView({ organization, farms }: { organization: { id: string; name: string; active: boolean } | null; farms: Farm[] }) { return <section className="page"><div className="panel"><PanelTitle title="協會與投資組合" />{organization ? <><div className="setting-row"><span>名稱</span><strong>{organization.name}</strong></div><div className="setting-row technical-row"><span>組織識別碼</span><code>{organization.id}</code></div><div className="setting-row"><span>狀態</span><StatusPill tone={organization.active ? "good" : "neutral"}>{organization.active ? "啟用" : "停用"}</StatusPill></div><div className="setting-row"><span>雞場範圍</span><strong>{farms.length} 個（含測試雞場）</strong></div><p className="notice">LINE 群組綁定協會投資組合；同一群組可管理多個雞場，營運事件再由雞場、雞舍與批次定位。</p></> : <EmptyState detail="尚未取得協會投資組合資料，請重新整理後再試。" />}</div></section>; }

function FarmsView({ farms, onCreate, onUpdate, onRecord }: { farms: Farm[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => MutationResult; onRecord: (farmId: string) => void }) {
  const [filter, setFilter] = useState<"all" | "production" | "test">("all"); const [show, setShow] = useState(false); const [noteId, setNoteId] = useState(""); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false); const [savedId, setSavedId] = useState(""); const visible = farms.filter((farm) => filter === "all" || farm.environment === filter);
  async function saveNote(farm: Farm) { setSaving(true); const result = await onUpdate(farm.id, { version: farm.version, note }, false); setSaving(false); if (result !== false) { setNoteId(""); setSavedId(farm.id); window.setTimeout(() => setSavedId(""), 2800); } }
  return <section className="page"><div className="page-actions"><div className="segmented" role="tablist" aria-label="雞場環境篩選">{([ ["all", "全部"], ["production", "正式"], ["test", "測試"] ] as const).map(([key, label]) => <button role="tab" aria-selected={filter === key} className={filter === key ? "selected" : ""} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div><button className="primary" onClick={() => setShow((value) => !value)}>新增雞場 ＋</button></div>{show && <FarmForm onSubmit={(body) => { void onCreate(body); setShow(false); }} />}<div className="farm-cards">{visible.length ? visible.map((farm) => <article className={`farm-card ${farm.environment === "test" ? "test" : ""}`} key={farm.id}><div className="farm-card-head"><div className="farm-avatar large">{farm.environment === "test" ? "🧪" : "🐔"}</div><div className="grow"><span className="eyebrow">{farm.environment === "test" ? "測試雞場" : "正式雞場"}</span><h3>{farm.name}</h3></div><StatusPill tone={farm.active ? "good" : "neutral"}>{farm.active ? "啟用" : "已封存"}</StatusPill></div><div className="farm-meta"><div><span>場址</span><strong>{farm.siteName || "尚未設定"}</strong></div><div><span>結構</span><strong>{farm.structureMode === "multi_house" ? "多舍" : "全場"}</strong></div></div><div className="farm-note"><span>備註</span><p className={farm.note ? "note-summary" : "note-empty"}>{farm.note || "尚無備註"}</p>{farm.note && farm.note.length > 90 && <details><summary>展開全文</summary><p>{farm.note}</p></details>}</div><div className="card-actions"><button onClick={() => onRecord(farm.id)}>＋ 記一件事</button><button className={farm.active ? "danger-action" : ""} onClick={() => void onUpdate(farm.id, { version: farm.version, active: !farm.active }, true)}>{farm.active ? "封存" : "重新啟用"}</button><button onClick={() => { setNoteId(noteId === farm.id ? "" : farm.id); setNote(farm.note ?? ""); }}>{noteId === farm.id ? "收起備註" : "編輯備註"}</button></div><small className="technical-meta">資料版本 v{farm.version}</small>{savedId === farm.id && <p className="success-text" role="status">✅ 備註已儲存</p>}{noteId === farm.id && <form className="mini-form" onSubmit={(event) => { event.preventDefault(); void saveNote(farm); }}><label>場務備註<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="primary" disabled={saving}>{saving ? "儲存中…" : "儲存備註"}</button></form>}</article>) : <EmptyState detail={filter === "all" ? "可使用上方「新增雞場」建立第一個雞場。" : `目前沒有${filter === "production" ? "正式" : "測試"}雞場。`} />}</div></section>;
}

function FarmForm({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => void }) { const [name, setName] = useState(""); const [environment, setEnvironment] = useState("test"); const [structureMode, setStructureMode] = useState("whole_farm"); return <form className="panel inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), environment, structureMode }); }}><label>名稱<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：新測試場" /></label><label>環境<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="test">測試</option><option value="production">正式</option></select></label><label>結構<select value={structureMode} onChange={(event) => setStructureMode(event.target.value)}><option value="whole_farm">全場</option><option value="multi_house">多舍</option></select></label><button className="primary">送出</button></form>; }

function CaretakersView({ caretakers, farms, onCreate, onUpdate, onAssign }: { caretakers: Caretaker[]; farms: Farm[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => MutationResult; onAssign: (farmId: string, body: Record<string, unknown>) => MutationResult }) { const [name, setName] = useState(""); const [farmId, setFarmId] = useState(""); return <section className="page"><div className="panel"><PanelTitle title="飼養者與場務責任" /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { void onCreate({ name: name.trim() }); setName(""); } }}><label>新增飼養者<input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名或稱呼" /></label><button className="primary">新增</button></form></div>{!caretakers.length && <EmptyState detail="新增飼養者後，即可查看目前與歷史雞場指派。" />}<div className="card-grid">{caretakers.map((caretaker) => <article className="panel" key={caretaker.id}><div className="panel-title"><h3>{caretaker.name}</h3><StatusPill tone={caretaker.active ? "good" : "neutral"}>{caretaker.active ? "啟用" : "封存"}</StatusPill></div><p className="muted">目前與歷史指派共 {caretaker.assignments?.length ?? 0} 筆</p>{caretaker.assignments?.length ? <div className="tag-list">{caretaker.assignments.map((assignment, index) => <span className="tag" key={`${assignment.farmId}-${assignment.effectiveFrom}-${index}`}>{assignment.farmName} · {assignment.effectiveFrom}～{assignment.effectiveTo ?? "現在"}{assignment.isPrimary ? " · 主要" : ""}</span>)}</div> : <p className="muted">目前尚未指派雞場。</p>}<div className="card-actions"><select value={farmId} onChange={(event) => setFarmId(event.target.value)}><option value="">選擇要指派的雞場</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select><button disabled={!farmId} onClick={() => { void onAssign(farmId, { caretakerId: caretaker.id, effectiveFrom: new Date().toISOString().slice(0, 10), isPrimary: true }); setFarmId(""); }}>指派主要飼養者</button><button className={caretaker.active ? "danger-action" : ""} onClick={() => void onUpdate(caretaker.id, { version: caretaker.version, active: !caretaker.active }, true)}>{caretaker.active ? "封存" : "啟用"}</button></div></article>)}</div></section>; }

function HousesView({ houses, farms, onCreate, onUpdate, onRecord }: { houses: House[]; farms: Farm[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => MutationResult; onRecord: (farmId: string, houseId: string) => void }) { const [farmId, setFarmId] = useState(""); const [name, setName] = useState(""); const [capacity, setCapacity] = useState(""); return <section className="page"><div className="panel"><PanelTitle title="雞舍主檔" /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (farmId && name.trim()) { void onCreate({ farmId, name: name.trim(), capacity: capacity ? Number(capacity) : null }); setName(""); setCapacity(""); } }}><label>所屬雞場<select value={farmId} onChange={(event) => setFarmId(event.target.value)}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍名稱<input value={name} onChange={(event) => setName(event.target.value)} placeholder="測試1舍" /></label><label>容量（可選）<input type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><button className="primary">建立雞舍</button></form></div>{!houses.length && <EmptyState detail="先選擇雞場並建立雞舍，之後即可建立入雛批次。" />}<DataTable headers={["雞場", "雞舍", "容量", "版本", "狀態", "操作"]}>{houses.map((house) => <tr key={house.id}><td>{house.farmName ?? farms.find((farm) => farm.id === house.farmId)?.name ?? "—"}</td><td><strong>{house.name}</strong></td><td>{house.capacity ? quantity(house.capacity) : "未設定"}</td><td>v{house.version}</td><td><StatusPill tone={house.active ? "good" : "neutral"}>{house.active ? "啟用" : "封存"}</StatusPill></td><td><button className="table-button" onClick={() => onRecord(house.farmId, house.id)}>＋記一件事</button><button className={`table-button ${house.active ? "danger-action" : ""}`} onClick={() => void onUpdate(house.id, { version: house.version, active: !house.active }, true)}>{house.active ? "封存" : "啟用"}</button></td></tr>)}</DataTable><div className="mobile-card-list">{houses.map((house) => <MobileCard key={house.id}><div className="mobile-card-head"><strong>{house.name}</strong><StatusPill tone={house.active ? "good" : "neutral"}>{house.active ? "啟用" : "封存"}</StatusPill></div><dl className="mobile-fields"><div><dt>雞場</dt><dd>{house.farmName ?? farms.find((farm) => farm.id === house.farmId)?.name ?? "—"}</dd></div><div><dt>容量</dt><dd>{house.capacity ? quantity(house.capacity) : "未設定"}</dd></div></dl><small className="technical-meta">資料版本 v{house.version}</small><button className="table-button" onClick={() => onRecord(house.farmId, house.id)}>＋記一件事</button><button className={`table-button ${house.active ? "danger-action" : ""}`} onClick={() => void onUpdate(house.id, { version: house.version, active: !house.active }, true)}>{house.active ? "封存" : "啟用"}</button></MobileCard>)}</div></section>; }

function FlocksView({ flocks, farms, houses, onCreate, onUpdate, onRecord }: { flocks: Flock[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>) => MutationResult; onRecord: (farmId: string, houseId: string, flockId: string) => void }) { const [farmId, setFarmId] = useState(""); const [houseId, setHouseId] = useState(""); const [batchCode, setBatchCode] = useState(""); const [date, setDate] = useState(""); const [count, setCount] = useState(""); const [expected, setExpected] = useState(""); const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); return <section className="page"><div className="panel"><PanelTitle title="批次／入雛主檔" /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (farmId && houseId && batchCode && date && count) { void onCreate({ farmId, houseId, batchCode, chickInDate: date, initialCount: Number(count), expectedShipmentDate: expected || null }); setBatchCode(""); } }}><label>雞場<select value={farmId} onChange={(event) => { setFarmId(event.target.value); setHouseId(""); }}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">請選擇</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>批次代碼<input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder="TEST-BATCH-002" /></label><label>入雛日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>初始數量<input type="number" min="1" value={count} onChange={(event) => setCount(event.target.value)} /></label><label>預計出雞<input type="date" value={expected} onChange={(event) => setExpected(event.target.value)} /></label><button className="primary">建立批次</button></form></div>{!flocks.length && <EmptyState detail="建立雞場與雞舍後，可在上方登錄第一批入雛資料。" />}<DataTable headers={["批次", "雞場／雞舍", "入雛", "日齡", "初始數", "預計出雞", "狀態", "操作"]}>{flocks.map((flock) => <tr key={flock.id}><td><strong>{flock.batchCode}</strong></td><td>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}<br /><span className="muted">{flock.houseName ?? houses.find((house) => house.id === flock.houseId)?.name ?? "—"}</span></td><td>{flock.chickInDate}</td><td>{flock.ageDays ?? "—"} 日</td><td>{quantity(flock.initialCount)}</td><td>{flock.expectedShipmentDate ?? "未設定"}</td><td><StatusPill tone={flock.status === "active" ? "good" : "neutral"}>{flock.status === "active" ? "進行中" : flock.status}</StatusPill></td><td><button className="table-button" onClick={() => onRecord(flock.farmId, flock.houseId, flock.id)}>＋記一件事</button>{flock.status === "active" && <button className="table-button danger-action" onClick={() => void onUpdate(flock.id, { version: flock.version, status: "closed" })}>結束批次</button>}</td></tr>)}</DataTable><div className="mobile-card-list">{flocks.map((flock) => <MobileCard key={flock.id}><div className="mobile-card-head"><strong>{flock.batchCode}</strong><StatusPill tone={flock.status === "active" ? "good" : "neutral"}>{flock.status === "active" ? "進行中" : flock.status}</StatusPill></div><dl className="mobile-fields"><div><dt>雞場／雞舍</dt><dd>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"} · {flock.houseName ?? houses.find((house) => house.id === flock.houseId)?.name ?? "—"}</dd></div><div><dt>入雛／日齡</dt><dd>{flock.chickInDate} · {flock.ageDays ?? "—"} 日</dd></div><div><dt>初始數量／預計出雞</dt><dd>{quantity(flock.initialCount)} 隻 · {flock.expectedShipmentDate ?? "未設定"}</dd></div></dl><button className="table-button" onClick={() => onRecord(flock.farmId, flock.houseId, flock.id)}>＋記一件事</button>{flock.status === "active" && <button className="table-button danger-action" onClick={() => void onUpdate(flock.id, { version: flock.version, status: "closed" })}>結束批次</button>}</MobileCard>)}</div></section>; }

function EventsView({ events, farms, houses, onCreate, onReverse, onCorrect, onLoadMore, hasMore }: { events: OperationalEvent[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => MutationResult; onReverse: (id: string, reason: string) => MutationResult; onCorrect: (id: string, body: Record<string, unknown>) => MutationResult; onLoadMore: () => Promise<void>; hasMore: boolean }) { const [farmId, setFarmId] = useState(""); const [houseId, setHouseId] = useState(""); const [intent, setIntent] = useState("mortality"); const [quantityValue, setQuantityValue] = useState(""); const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10)); const [modal, setModal] = useState<{ kind: "reverse" | "correct"; event: OperationalEvent } | null>(null); const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); function status(event: OperationalEvent) { return event.reversedAt ? <StatusPill>已反轉</StatusPill> : <StatusPill tone="good">有效</StatusPill>; } function eventCard(event: OperationalEvent) { return <MobileCard key={event.id} className={event.reversedAt ? "muted-row" : ""}><div className="mobile-card-head"><strong>{eventLabel(event.intent)}</strong>{status(event)}</div><dl className="mobile-fields"><div><dt>雞場／雞舍</dt><dd>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })} · {event.house ?? "場級"}</dd></div><div><dt>數量／日期</dt><dd>{quantity(event.quantity)} {event.unit} · {event.eventDate}</dd></div><div><dt>批次</dt><dd>{event.flockId ?? "—"}</dd></div></dl>{!event.reversedAt && <div className="card-actions"><button className="table-button danger" onClick={() => setModal({ kind: "reverse", event })}>反轉</button><button className="table-button" onClick={() => setModal({ kind: "correct", event })}>修正</button></div>}</MobileCard>; } return <section className="page"><div className="panel"><PanelTitle title="新增營運事件" /><p className="muted">資料會寫入共用營運紀錄；若需更正，系統會保留原紀錄並建立反轉與修正鏈。</p><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (farmId && quantityValue) { const unit = intent === "feed" ? "kg" : intent === "water" ? "L" : "隻"; void onCreate({ farmId, houseId: houseId || null, intent, quantity: Number(quantityValue), unit, eventDate }); setQuantityValue(""); } }}><label>雞場<select value={farmId} onChange={(event) => { setFarmId(event.target.value); setHouseId(""); }}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">場級／請選擇</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>事件<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="mortality">死亡</option><option value="cull">淘汰</option><option value="feed">飼料</option><option value="water">飲水</option><option value="shipment">出雞</option></select></label><label>數量<input type="number" min="0.01" step="0.01" value={quantityValue} onChange={(event) => setQuantityValue(event.target.value)} /></label><label>日期<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label><button className="primary">寫入事件</button></form></div>{!events.length && <EmptyState detail="目前尚無營運紀錄；可使用上方表單或 LINE 登錄第一筆事件。" />}<DataTable headers={["日期", "雞場／雞舍", "事件", "數量", "批次", "狀態", "操作"]}>{events.map((event) => <tr key={event.id} className={event.reversedAt ? "muted-row" : ""}><td>{event.eventDate}</td><td>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })}<br /><span className="muted">{event.house ?? "場級"}</span></td><td>{eventLabel(event.intent)}</td><td><strong>{quantity(event.quantity)} {event.unit}</strong></td><td>{event.flockId ?? "—"}</td><td>{status(event)}</td><td className="button-row">{!event.reversedAt && <><button className="table-button danger" onClick={() => setModal({ kind: "reverse", event })}>反轉</button><button className="table-button" onClick={() => setModal({ kind: "correct", event })}>修正</button></>}</td></tr>)}</DataTable><div className="mobile-card-list">{events.map(eventCard)}</div>{hasMore && <div className="load-more"><button onClick={() => void onLoadMore()}>載入更多</button></div>}{modal?.kind === "reverse" && <ReasonModal title="反轉營運事件" onClose={() => setModal(null)} onSubmit={async (reason) => { await onReverse(modal.event.id, reason); setModal(null); }} />}{modal?.kind === "correct" && <ReasonModal title="修正營運事件" correction quantityValue={modal.event.quantity} onClose={() => setModal(null)} onSubmit={async (reason, nextQuantity) => { await onCorrect(modal.event.id, { quantity: nextQuantity, reason }); setModal(null); }} />}</section>; }

function FinanceView({ finance }: { finance: FinanceData | null }) { if (!finance) return <Loading />; return <section className="page"><div className="metric-grid"><Metric title="玩家分配盈虧" value={`NT${money(finance.totals.allocated)}`} detail="正式雞場歷史" /><Metric title="支出" value={`NT${money(finance.totals.expense)}`} detail="正式雞場歷史" tone="warn" /><Metric title="玩家淨收入" value={`NT${money(finance.totals.net)}`} detail="D1 帳本計算" tone="good" /></div><div className="two-col"><section className="panel"><PanelTitle title="投資人累計" />{finance.investors.length ? finance.investors.map((investor) => <div className="finance-row" key={String(investor.id)}><span>{String(investor.name)}</span><strong>${money(investor.amount)}</strong></div>) : <EmptyState detail="目前沒有投資人盈虧資料。" />}</section><section className="panel"><PanelTitle title="各場淨收入" />{finance.farms.length ? finance.farms.map((farm) => <div className="finance-row" key={String(farm.id)}><span>{String(farm.name)} <small>{Number(farm.playerGroupEquityFraction) * 100}%</small></span><strong>${money(farm.net)}</strong></div>) : <EmptyState detail="目前沒有正式雞場盈虧資料。" />}</section></div><section className="panel"><PanelTitle title="盈虧分配與支出" />{finance.distributions.length ? <DataTable className="dense-table" headers={["日期", "雞場", "總盈虧", "玩家分配", "支出", "淨收入", "來源"]}>{finance.distributions.map((row) => <tr key={String(row.id)}><td>{String(row.distributionDate)}</td><td>{String(row.farmName)}</td><td>${money(row.grossProfitLoss)}</td><td>${money(row.allocatedProfitLoss)}</td><td>${money(row.expense)}</td><td>${money(row.netIncome)}</td><td><small>{String(row.sourceDataset ?? "—")}</small></td></tr>)}</DataTable> : <EmptyState detail="目前沒有歷史盈虧分配紀錄。" />}</section><section className="panel"><PanelTitle title="投資人分配明細" />{finance.allocations.length ? <DataTable className="dense-table" headers={["分配日期", "投資人", "金額"]}>{finance.allocations.map((row) => <tr key={String(row.id)}><td>{String(finance.distributions.find((distribution) => distribution.id === row.distributionId)?.distributionDate ?? "—")}</td><td>{String(row.investorName)}</td><td>${money(row.amount)}</td></tr>)}</DataTable> : <EmptyState detail="目前沒有投資人分配明細。" />}</section><div className="notice">財務頁面只讀取正式雞場；測試雞場不會進入投資與盈虧總計。</div></section>; }

function ChartsView({ chart, loading, farms, houses, flocks, caretakers, metric, setMetric, range, setRange, granularity, setGranularity, farmId, setFarmId, houseId, setHouseId, flockId, setFlockId, environment, setEnvironment, caretakerId, setCaretakerId }: { chart: ChartResponse | null; loading: boolean; farms: Farm[]; houses: House[]; flocks: Flock[]; caretakers: Caretaker[]; metric: string; setMetric: (value: string) => void; range: string; setRange: (value: string) => void; granularity: "daily" | "weekly" | "monthly"; setGranularity: (value: "daily" | "weekly" | "monthly") => void; farmId: string; setFarmId: (value: string) => void; houseId: string; setHouseId: (value: string) => void; flockId: string; setFlockId: (value: string) => void; environment: string; setEnvironment: (value: string) => void; caretakerId: string; setCaretakerId: (value: string) => void }) { const financeMetric = metric.includes("profit") || metric === "portfolio-net"; const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); const availableFlocks = flocks.filter((flock) => (!farmId || flock.farmId === farmId) && (!houseId || flock.houseId === houseId)); return <section className="page"><section className="panel"><PanelTitle title="D1 趨勢分析" /><div className="filter-grid"><label>指標<select value={metric} onChange={(event) => setMetric(event.target.value)}>{chartOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><fieldset className="range-filter"><legend>日期範圍</legend><div className="range-chips">{rangeOptions.map(([key, label]) => <button type="button" className={range === key ? "selected" : ""} aria-pressed={range === key} key={key} onClick={() => setRange(key)}>{label}</button>)}</div></fieldset><label className="granularity-filter">粒度<select value={granularity} onChange={(event) => setGranularity(event.target.value as "daily" | "weekly" | "monthly")}><option value="daily">每日</option><option value="weekly">每週</option><option value="monthly">每月</option></select></label><label>環境<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="">全部</option><option value="production">正式</option><option value="test">測試</option></select></label><label>雞場<select value={farmId} onChange={(event) => setFarmId(event.target.value)}><option value="">全部雞場</option>{farms.filter((farm) => !environment || farm.environment === environment).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>{!financeMetric && <><label>雞舍<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">全部雞舍</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>批次<select value={flockId} onChange={(event) => setFlockId(event.target.value)}><option value="">全部批次</option>{availableFlocks.map((flock) => <option key={flock.id} value={flock.id}>{flock.batchCode}</option>)}</select></label><label>飼養者<select value={caretakerId} onChange={(event) => setCaretakerId(event.target.value)}><option value="">全部飼養者</option>{caretakers.filter((caretaker) => caretaker.active).map((caretaker) => <option key={caretaker.id} value={caretaker.id}>{caretaker.name}</option>)}</select></label></>}</div>{metric === "farm-profit" && !farmId && <p className="notice">各場盈虧需先指定雞場；投資組合淨收入可直接查看整體。</p>}</section><section className="panel chart-panel"><div className="chart-heading"><div><h3>{chartOptions.find(([key]) => key === metric)?.[1] ?? metric}</h3><p className="muted">{chart?.definition ?? "資料由 D1 聚合查詢提供。"}</p></div>{chart && <StatusPill tone={chart.status === "ok" ? "good" : "warn"}>{chart.unit}</StatusPill>}</div>{loading ? <div className="loading">查詢 D1 聚合資料…</div> : <SimpleChart chart={chart} />}</section></section>; }

function RemindersView({ flocks }: { flocks: Flock[] }) { const reminders = flocks.filter((flock) => flock.status === "active" && flock.shipmentReminder); return <section className="page"><div className="panel"><PanelTitle title="出雞提醒" /><p className="muted">由批次預計出雞日期與台北時區計算。</p>{reminders.length ? reminders.map((flock) => <div className="reminder-row" key={flock.id}><span>📅</span><div className="grow"><strong>{flock.batchCode}</strong><small>{flock.expectedShipmentDate} · 日齡 {flock.ageDays} 日</small></div><StatusPill tone="warn">{flock.shipmentReminder === "overdue" ? "已逾期" : flock.shipmentReminder === "today" ? "今天" : "7 日內"}</StatusPill></div>) : <div className="empty">目前沒有 7 日內的出雞提醒。</div>}</div></section>; }

function AliasesView({ aliases }: { aliases: Alias[] }) { return <section className="page"><div className="panel"><PanelTitle title="雞場名稱解析（唯讀）" /><p className="muted">正式名稱由雞場主檔提供；候選別名、錯字與同音名稱仍需通過安全確認。</p>{aliases.length ? <DataTable className="dense-table" headers={["正式雞場", "別名", "類型", "狀態", "確認次數", "最後確認"]}>{aliases.map((alias) => <tr key={alias.id}><td>{alias.farmName}</td><td><strong>{alias.alias}</strong><br /><small>{alias.normalizedAlias}</small></td><td>{alias.aliasType}</td><td><StatusPill tone={alias.status === "trusted" ? "good" : alias.status === "disabled" ? "neutral" : "warn"}>{alias.status}</StatusPill></td><td>{alias.confirmationCount}</td><td>{alias.lastConfirmedAt ?? "—"}</td></tr>)}</DataTable> : <EmptyState detail="目前沒有雞場別名；正式名稱仍可正常使用。" />}</div></section>; }

function HealthView({ health }: { health: DataHealth | null }) { if (!health) return <Loading />; return <section className="page"><div className="panel"><PanelTitle title="資料健康檢查" /><p className="muted">只讀檢查，不會自動修正資料。檢查時間：{health.checkedAt}</p><DataTable headers={["檢查", "結果", "狀態"]}>{(health.checks ?? []).map((check) => <tr key={check.code}><td>{check.label}</td><td>{check.count}</td><td><StatusPill tone={check.count ? "warn" : "good"}>{check.count ? "需檢視" : "正常"}</StatusPill></td></tr>)}</DataTable>{health.warnings.length ? <div className="warning-list">{health.warnings.map((warning) => <p key={warning}>⚠️ {warning}</p>)}</div> : <div className="healthy"><span>✓</span><strong>所有目前檢查正常</strong></div>}</div></section>; }

function AuditDiff({ row }: { row: AuditRow }) { const fields = row.changedFields.length ? row.changedFields : Array.from(new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})])); return <details className="audit-detail"><summary>查看修改差異</summary><div className="diff-grid"><div><strong>修改前</strong>{fields.map((field) => <div className="diff-row" key={`before-${field}`}><span>{fieldLabel(field)}</span><code>{formatValue(row.before?.[field])}</code></div>)}</div><div><strong>修改後</strong>{fields.map((field) => <div className="diff-row" key={`after-${field}`}><span>{fieldLabel(field)}</span><code>{formatValue(row.after?.[field])}</code></div>)}</div></div><p className="muted">變更欄位：{fields.length ? fields.map(fieldLabel).join("、") : "—"}</p><details><summary>技術診斷原始 JSON</summary><pre>{JSON.stringify({ before: row.before, after: row.after, changedFields: row.changedFields }, null, 2)}</pre></details></details>; }

function AuditCard({ row }: { row: AuditRow }) { return <MobileCard><div className="mobile-card-head"><strong>{row.action}</strong><StatusPill>{sourceLabel(row.source)}</StatusPill></div><dl className="mobile-fields"><div><dt>時間／實體</dt><dd>{row.createdAt} · {row.entityType}</dd></div><div><dt>操作者</dt><dd>{row.actorType} · {row.actorId ?? "—"}</dd></div><div><dt>原因</dt><dd>{row.reason ?? "—"}</dd></div></dl><AuditDiff row={row} /></MobileCard>; }

function AuditView({ audit, onLoadMore, hasMore }: { audit: AuditRow[]; onLoadMore: () => Promise<void>; hasMore: boolean }) { return <section className="page"><div className="panel"><PanelTitle title="不可覆寫的變更紀錄" /><p className="muted">LINE、WEB、SYSTEM、MIGRATION 來源清楚分開；展開後可查看修改前、修改後與變更欄位。</p>{!audit.length && <EmptyState detail="目前沒有變更紀錄；日後的資料修改會依時間列在這裡。" />}<DataTable headers={["時間", "來源", "操作", "實體", "操作者", "原因", "差異"]}>{audit.map((row) => <tr key={row.id}><td>{row.createdAt}</td><td><StatusPill>{sourceLabel(row.source)}</StatusPill></td><td>{row.action}</td><td>{row.entityType}<br /><small>{row.entityId}</small></td><td>{row.actorType}<br /><small>{row.actorId ?? "—"}</small></td><td>{row.reason ?? "—"}</td><td><AuditDiff row={row} /></td></tr>)}</DataTable><div className="mobile-card-list">{audit.map((row) => <AuditCard key={row.id} row={row} />)}</div>{hasMore && <div className="load-more"><button onClick={() => void onLoadMore()}>載入更多變更紀錄</button></div>}</div></section>; }

function SettingsView({ farms, organization }: { farms: Farm[]; organization: { id: string; name: string; active: boolean } | null }) { return <section className="page"><div className="panel settings"><PanelTitle title="系統設定" /><div className="setting-row"><span>LINE 助理</span><strong>金雞協會助理Ai / @550rsdwc</strong></div><div className="setting-row"><span>後端服務</span><strong>chicken-line-production</strong></div><div className="setting-row"><span>資料庫</span><strong>共用正式資料</strong></div><div className="setting-row technical-row"><span>AI 模型</span><strong>@cf/meta/llama-3.2-3b-instruct</strong></div><div className="setting-row"><span>協會組織</span><strong>{organization?.name ?? "—"}</strong></div><div className="setting-row"><span>雞場範圍</span><strong>{farms.length} 個雞場（含測試）</strong></div><div className="setting-row"><span>LINE 訊息重送</span><strong>需要到 LINE Developers 網頁確認</strong></div><div className="notice">目前程式沒有可驗證的人工重送設定結果，也不會自行猜測或修改外部設定。編修會沿用目前登入狀態，並保留完整變更紀錄供查閱。</div></div></section>; }

function EquityView({ finance }: { finance: FinanceData | null }) { if (!finance) return <Loading />; return <section className="page"><div className="panel"><PanelTitle title="投資人與雞場持股" /><p className="muted">顯示正式雞場的實際投資人持股；測試雞場不納入股權與財務歷史。</p>{finance.farmInvestorEquity.length ? <DataTable className="dense-table" headers={["雞場", "投資人", "實際持股", "來源", "生效日"]}>{finance.farmInvestorEquity.map((row) => <tr key={String(row.id)}><td>{String(row.farmName)}</td><td>{String(row.investorName)}</td><td>{(Number(row.equityFraction) * 100).toFixed(4)}%</td><td>{String(row.source ?? "—")}</td><td>{String(row.effectiveDate ?? "—")}</td></tr>)}</DataTable> : <EmptyState detail="目前沒有投資人持股資料。" />}</div></section>; }
