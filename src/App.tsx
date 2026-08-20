import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type TouchEvent } from "react";
import {
  ApiClient,
  type Alias,
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
} from "./api";

const api = new ApiClient();

export const NAV_ITEMS = [
  { key: "dashboard", label: "總覽" },
  { key: "organization", label: "組織" },
  { key: "farms", label: "雞場" },
  { key: "caretakers", label: "飼養者" },
  { key: "houses", label: "雞舍" },
  { key: "flocks", label: "批次" },
  { key: "events", label: "營運紀錄" },
  { key: "finance", label: "財務" },
  { key: "equity", label: "股權" },
  { key: "charts", label: "趨勢分析" },
  { key: "reminders", label: "提醒" },
  { key: "aliases", label: "名稱解析" },
  { key: "audit", label: "變更紀錄" },
  { key: "health", label: "資料健康" },
  { key: "settings", label: "設定" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];
type Navigate = (key: NavKey) => void;
type MutationResult = Promise<boolean> | void;

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
  ["farm-profit", "各場盈虧"],
  ["portfolio-net", "Portfolio 淨收入"],
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
  return ({ line: "LINE", web: "WEB", system: "SYSTEM", migration: "MIGRATION" } as Record<string, string>)[source] ?? source;
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

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])");
    (focusable?.[0] ?? dialogRef.current)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

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

function AdminAuthModal({ onSubmit, onClose, error }: { onSubmit: (password: string) => Promise<void>; onClose: () => void; error: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { await onSubmit(password); } finally { setPassword(""); setBusy(false); }
  }
  return <Modal title="重新驗證管理權限" onClose={() => { setPassword(""); onClose(); }}>
    <p className="muted">此結構性操作需要 5 分鐘 fresh authorization。輸入值不會保存。</p>
    <form onSubmit={submit}><label>管理密碼<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" /></label><div className="modal-actions"><button type="button" onClick={() => { setPassword(""); onClose(); }}>取消</button><button className="primary" disabled={!password || busy}>{busy ? "驗證中…" : "驗證"}</button></div>{error && <p className="error-text" role="alert">{error}</p>}</form>
  </Modal>;
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
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const authResolver = useRef<((allowed: boolean) => void) | null>(null);
  const navigationSource = useRef<"push" | "history">("push");
  const scrollPositions = useRef<Partial<Record<NavKey, number>>>({});
  const touchStart = useRef<{ x: number; y: number; time: number; ignored: boolean } | null>(null);
  const current = useMemo(() => NAV_ITEMS.find((item) => item.key === page) ?? NAV_ITEMS[0], [page]);

  async function loadAll() {
    setBusy(true); setError("");
    try {
      const [dash, orgData, farmData, caretakerData, houseData, flockData, eventData, financeData, aliasData, healthData, auditData] = await Promise.all([
        api.dashboard(), api.organizations(), api.farms(), api.caretakers(true), api.houses(), api.flocks(), api.events({ limit: 50 }), api.finance(), api.aliases(), api.dataHealth(), api.audit(),
      ]);
      setDashboard(dash); setOrganization(orgData.organizations.find(Boolean) ?? null); setFarms(farmData.farms); setCaretakers(caretakerData.caretakers); setHouses(houseData.houses); setFlocks(flockData.flocks); setEvents(eventData.events); setEventsCursor(eventData.nextCursor); setFinance(financeData); setAliases(aliasData.aliases); setHealth(healthData); setAudit(auditData.auditLogs); setAuditCursor(auditData.nextCursor);
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

  function navigateTo(next: NavKey) { if (next === page) { setDrawerOpen(false); return; } scrollPositions.current[page] = window.scrollY; navigationSource.current = "push"; window.history.pushState(null, "", `#/${next}`); setPage(next); setDrawerOpen(false); }
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
  function requestAuthorization(): Promise<boolean> { return new Promise((resolve) => { authResolver.current = resolve; setAuthError(""); setAuthOpen(true); }); }
  async function submitAuthorization(password: string) { try { await api.authorize(password); authResolver.current?.(true); authResolver.current = null; setAuthOpen(false); } catch (err) { setAuthError(err instanceof Error ? err.message : "管理權限驗證失敗。"); } }
  function closeAuthorization() { authResolver.current?.(false); authResolver.current = null; setAuthOpen(false); setAuthError(""); }
  async function runMutation(work: () => Promise<unknown>, needsAuth = false): Promise<boolean> { setError(""); if (needsAuth && !(await requestAuthorization())) return false; try { await work(); await loadAll(); setToast("已更新共用 D1 資料"); window.setTimeout(() => setToast(""), 2800); return true; } catch (err) { setError(err instanceof Error ? err.message : "操作失敗。"); return false; } }
  async function loadMoreEvents() { if (!eventsCursor) return; try { const result = await api.events({ limit: 50, cursor: eventsCursor }); setEvents((currentEvents) => [...currentEvents, ...result.events]); setEventsCursor(result.nextCursor); } catch (err) { setError(err instanceof Error ? err.message : "營運紀錄載入失敗。"); } }
  async function loadMoreAudit() { if (!auditCursor) return; try { const result = await api.audit({ cursor: auditCursor }); setAudit((currentAudit) => [...currentAudit, ...result.auditLogs]); setAuditCursor(result.nextCursor); } catch (err) { setError(err instanceof Error ? err.message : "Audit 載入失敗。"); } }

  if (!authenticated) return <Login onLogin={login} />;
  return <div className="app-shell">
    {drawerOpen && <button className="drawer-backdrop" aria-label="關閉導覽選單" onClick={() => setDrawerOpen(false)} />}
    <aside className={`sidebar ${drawerOpen ? "drawer-open" : ""}`} id="primary-navigation"><div className="brand"><span>🐔</span><div><strong>金雞協會助理Ai</strong><small>農場管理中心</small></div><button className="drawer-close icon-button" aria-label="關閉導覽選單" onClick={() => setDrawerOpen(false)}>×</button></div><nav aria-label="主要功能">{NAV_ITEMS.map((item) => <button key={item.key} className={item.key === page ? "active" : ""} aria-current={item.key === page ? "page" : undefined} onClick={() => navigateTo(item.key)}><span className={`nav-icon nav-${item.key}`} aria-hidden="true" /><span>{item.label}</span></button>)}</nav><div className="sidebar-foot"><span>共用 Production D1</span><button onClick={() => void logout()}>登出</button></div></aside>
    <main className="content" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}><header className="topbar"><div className="topbar-heading"><button className="menu-button icon-button" aria-label="開啟導覽選單" aria-expanded={drawerOpen} aria-controls="primary-navigation" onClick={() => setDrawerOpen((open) => !open)}>☰</button><div><p className="eyebrow">管理工作台 / {current.label}</p><h1>{current.label}</h1></div></div><div className="top-actions"><StatusPill tone="good">Worker 線上</StatusPill><button className="icon-button" title="重新整理" aria-label="重新整理" onClick={() => void loadAll()} disabled={busy}>↻</button></div></header>{toast && <div className="toast" role="status" aria-live="polite">✓ {toast}</div>}{error && <div className="alert error-text" role="alert">{error}<button aria-label="關閉錯誤" onClick={() => setError("")}>×</button></div>}
      {page === "dashboard" && <DashboardView dashboard={dashboard} farms={farms} flocks={flocks} onNavigate={navigateTo} />}
      {page === "organization" && <OrganizationView organization={organization} farms={farms} />}
      {page === "farms" && <FarmsView farms={farms} onCreate={(body) => runMutation(() => api.createFarm(body), true)} onUpdate={(id, body, structural) => runMutation(() => api.updateFarm(id, body), structural)} />}
      {page === "caretakers" && <CaretakersView caretakers={caretakers} farms={farms} onCreate={(body) => runMutation(() => api.createCaretaker(body), true)} onUpdate={(id, body, structural) => runMutation(() => api.updateCaretaker(id, body), structural)} onAssign={(farmId, body) => runMutation(() => api.assignCaretaker(farmId, body), true)} />}
      {page === "houses" && <HousesView houses={houses} farms={farms} onCreate={(body) => runMutation(() => api.createHouse(body), true)} onUpdate={(id, body, structural) => runMutation(() => api.updateHouse(id, body), structural)} />}
      {page === "flocks" && <FlocksView flocks={flocks} farms={farms} houses={houses} onCreate={(body) => runMutation(() => api.createFlock(body), true)} onUpdate={(id, body) => runMutation(() => api.updateFlock(id, body))} />}
      {page === "events" && <EventsView events={events} farms={farms} houses={houses} onCreate={(body) => runMutation(() => api.createEvent(body))} onReverse={(id, reason) => runMutation(() => api.reverseEvent(id, reason))} onCorrect={(id, body) => runMutation(() => api.correctEvent(id, body))} onLoadMore={loadMoreEvents} hasMore={Boolean(eventsCursor)} />}
      {page === "finance" && <FinanceView finance={finance} />}
      {page === "equity" && <EquityView finance={finance} />}
      {page === "charts" && <ChartsView chart={chart} loading={chartLoading} farms={farms} houses={houses} flocks={flocks} caretakers={caretakers} metric={chartMetric} setMetric={setChartMetric} range={chartRange} setRange={setChartRange} granularity={chartGranularity} setGranularity={setChartGranularity} farmId={chartFarmId} setFarmId={(value) => { setChartFarmId(value); setChartHouseId(""); setChartFlockId(""); }} houseId={chartHouseId} setHouseId={(value) => { setChartHouseId(value); setChartFlockId(""); }} flockId={chartFlockId} setFlockId={setChartFlockId} environment={chartEnvironment} setEnvironment={setChartEnvironment} caretakerId={chartCaretakerId} setCaretakerId={setChartCaretakerId} />}
      {page === "reminders" && <RemindersView flocks={flocks} />}
      {page === "aliases" && <AliasesView aliases={aliases} />}
      {page === "audit" && <AuditView audit={audit} onLoadMore={loadMoreAudit} hasMore={Boolean(auditCursor)} />}
      {page === "health" && <HealthView health={health} />}
      {page === "settings" && <SettingsView farms={farms} organization={organization} />}
    </main>
    {authOpen && <AdminAuthModal onSubmit={submitAuthorization} onClose={closeAuthorization} error={authError} />}
  </div>;
}

function DashboardView({ dashboard, farms, flocks, onNavigate }: { dashboard: Dashboard | null; farms: Farm[]; flocks: Flock[]; onNavigate: Navigate }) {
  if (!dashboard) return <Loading />;
  const activeFlocks = flocks.filter((flock) => flock.status === "active").slice(0, 8);
  return <section className="page"><div className="hero"><div><span className="hero-kicker">截至 {dashboard.asOf}</span><h2>今天，讓每一筆雞場資料都清楚可追溯。</h2><p>營運資料由 LINE 與 Web 共用；正式財務統計自動排除測試場。</p></div><button className="primary" onClick={() => onNavigate("events")}>記錄營運事件 ＋</button></div><div className="metric-grid"><Metric title="有效雞場" value={dashboard.counts.farms} detail={`正式 ${dashboard.counts.productionFarms} ／ 測試 ${dashboard.counts.testFarms}`} /><Metric title="目前存欄" value={`${quantity(dashboard.stock)} 隻`} detail={`${dashboard.counts.activeFlocks} 個進行中批次`} /><Metric title="今日死亡" value={`${quantity(dashboard.today.mortality)} 隻`} detail={`淘汰 ${quantity(dashboard.today.cull)} 隻`} tone={dashboard.today.mortality > 0 ? "warn" : "good"} /><Metric title="歷史淨收入" value={`$${money(dashboard.finance.net)}`} detail="僅正式雞場財務" /></div><div className="two-col"><section className="panel"><PanelTitle title="雞場概覽" action="查看全部" onClick={() => onNavigate("farms")} /><div className="farm-list">{farms.filter((farm) => farm.active).map((farm) => <div className="farm-row" key={farm.id}><div className="farm-avatar">{farm.environment === "test" ? "🧪" : "🐔"}</div><div className="grow"><strong>{farm.name}</strong><span>{farm.siteName || (farm.structureMode === "multi_house" ? "多舍管理" : "全場管理")}</span></div><StatusPill tone={farm.environment === "test" ? "warn" : "good"}>{farm.environment === "test" ? "TEST" : "PRODUCTION"}</StatusPill></div>)}</div></section><section className="panel"><PanelTitle title="資料健康度" action="檢視健康檢查" onClick={() => onNavigate("health")} />{dashboard.dataHealth.warnings.length ? <div className="warning-list">{dashboard.dataHealth.warnings.map((warning) => <p key={warning}>⚠️ {warning}</p>)}</div> : <div className="healthy"><span>✓</span><div><strong>目前沒有阻塞性警告</strong><p>主檔、批次與財務資料可正常使用。</p></div></div>}<div className="mini-summary"><span>預計 7 日內出雞</span><strong>{dashboard.upcomingShipments} 批</strong></div></section></div><section className="panel"><PanelTitle title="進行中批次" action="管理批次" onClick={() => onNavigate("flocks")} /><DataTable headers={["批次", "雞場", "入雛日", "日齡", "預計出雞", "狀態"]}>{activeFlocks.map((flock) => <tr key={flock.id}><td><strong>{flock.batchCode}</strong></td><td>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}</td><td>{flock.chickInDate}</td><td>{flock.ageDays ?? 0} 日</td><td>{flock.expectedShipmentDate ?? "未設定"}</td><td><StatusPill tone="good">進行中</StatusPill></td></tr>)}</DataTable><div className="mobile-card-list">{activeFlocks.map((flock) => <MobileCard key={flock.id}><div className="mobile-card-head"><strong>{flock.batchCode}</strong><StatusPill tone="good">進行中</StatusPill></div><dl className="mobile-fields"><div><dt>雞場</dt><dd>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}</dd></div><div><dt>入雛／日齡</dt><dd>{flock.chickInDate} · {flock.ageDays ?? 0} 日</dd></div><div><dt>預計出雞</dt><dd>{flock.expectedShipmentDate ?? "未設定"}</dd></div></dl></MobileCard>)}</div></section></section>;
}

function OrganizationView({ organization, farms }: { organization: { id: string; name: string; active: boolean } | null; farms: Farm[] }) { return <section className="page"><div className="panel"><PanelTitle title="Organization / Portfolio" /><div className="setting-row"><span>名稱</span><strong>{organization?.name ?? "—"}</strong></div><div className="setting-row"><span>Organization ID</span><code>{organization?.id ?? "—"}</code></div><div className="setting-row"><span>狀態</span><StatusPill tone={organization?.active ? "good" : "neutral"}>{organization?.active ? "啟用" : "停用"}</StatusPill></div><div className="setting-row"><span>雞場範圍</span><strong>{farms.length} 個（含 Test Farm）</strong></div><p className="notice">LINE 群組綁定 Organization／Portfolio；同一群組可管理多個 farm，營運事件再由 farm／house／flock 定位。</p></div></section>; }

function FarmsView({ farms, onCreate, onUpdate }: { farms: Farm[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => MutationResult }) {
  const [filter, setFilter] = useState<"all" | "production" | "test">("all"); const [show, setShow] = useState(false); const [noteId, setNoteId] = useState(""); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false); const [savedId, setSavedId] = useState(""); const visible = farms.filter((farm) => filter === "all" || farm.environment === filter);
  async function saveNote(farm: Farm) { setSaving(true); const result = await onUpdate(farm.id, { version: farm.version, note }, false); setSaving(false); if (result !== false) { setNoteId(""); setSavedId(farm.id); window.setTimeout(() => setSavedId(""), 2800); } }
  return <section className="page"><div className="page-actions"><div className="segmented" role="tablist" aria-label="雞場環境篩選">{([ ["all", "全部"], ["production", "正式"], ["test", "測試"] ] as const).map(([key, label]) => <button role="tab" aria-selected={filter === key} className={filter === key ? "selected" : ""} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div><button className="primary" onClick={() => setShow((value) => !value)}>新增雞場 ＋</button></div>{show && <FarmForm onSubmit={(body) => { void onCreate(body); setShow(false); }} />}<div className="farm-cards">{visible.map((farm) => <article className={`farm-card ${farm.environment === "test" ? "test" : ""}`} key={farm.id}><div className="farm-card-head"><div className="farm-avatar large">{farm.environment === "test" ? "🧪" : "🐔"}</div><div className="grow"><span className="eyebrow">{farm.environment === "test" ? "TEST FARM" : "PRODUCTION FARM"}</span><h3>{farm.name}</h3></div><StatusPill tone={farm.active ? "good" : "neutral"}>{farm.active ? "啟用" : "已封存"}</StatusPill></div><div className="farm-meta"><div><span>場址</span><strong>{farm.siteName || "尚未設定"}</strong></div><div><span>結構</span><strong>{farm.structureMode === "multi_house" ? "多舍" : "全場"}</strong></div><div><span>版本</span><strong>v{farm.version}</strong></div></div><div className="farm-note"><span>備註</span><p className={farm.note ? "note-summary" : "note-empty"}>{farm.note || "尚無備註"}</p>{farm.note && farm.note.length > 90 && <details><summary>展開全文</summary><p>{farm.note}</p></details>}</div><div className="card-actions"><button onClick={() => void onUpdate(farm.id, { version: farm.version, active: !farm.active }, true)}>{farm.active ? "封存" : "重新啟用"}</button><button onClick={() => { setNoteId(noteId === farm.id ? "" : farm.id); setNote(farm.note ?? ""); }}>{noteId === farm.id ? "收起備註" : "編輯備註"}</button></div>{savedId === farm.id && <p className="success-text" role="status">✅ 備註已儲存</p>}{noteId === farm.id && <form className="mini-form" onSubmit={(event) => { event.preventDefault(); void saveNote(farm); }}><label>場務備註<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="primary" disabled={saving}>{saving ? "儲存中…" : "儲存備註"}</button></form>}</article>)}</div></section>;
}

function FarmForm({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => void }) { const [name, setName] = useState(""); const [environment, setEnvironment] = useState("test"); const [structureMode, setStructureMode] = useState("whole_farm"); return <form className="panel inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), environment, structureMode }); }}><label>名稱<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：新測試場" /></label><label>環境<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="test">TEST</option><option value="production">PRODUCTION</option></select></label><label>結構<select value={structureMode} onChange={(event) => setStructureMode(event.target.value)}><option value="whole_farm">全場</option><option value="multi_house">多舍</option></select></label><button className="primary">送出</button></form>; }

function CaretakersView({ caretakers, farms, onCreate, onUpdate, onAssign }: { caretakers: Caretaker[]; farms: Farm[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => MutationResult; onAssign: (farmId: string, body: Record<string, unknown>) => MutationResult }) { const [name, setName] = useState(""); const [farmId, setFarmId] = useState(""); return <section className="page"><div className="panel"><PanelTitle title="飼養者與場務責任" /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { void onCreate({ name: name.trim() }); setName(""); } }}><label>新增飼養者<input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名或稱呼" /></label><button className="primary">新增</button></form></div><div className="card-grid">{caretakers.map((caretaker) => <article className="panel" key={caretaker.id}><div className="panel-title"><h3>{caretaker.name}</h3><StatusPill tone={caretaker.active ? "good" : "neutral"}>{caretaker.active ? "啟用" : "封存"}</StatusPill></div><p className="muted">目前與歷史指派共 {caretaker.assignments?.length ?? 0} 筆</p><div className="tag-list">{(caretaker.assignments ?? []).map((assignment, index) => <span className="tag" key={`${assignment.farmId}-${assignment.effectiveFrom}-${index}`}>{assignment.farmName} · {assignment.effectiveFrom}～{assignment.effectiveTo ?? "現在"}{assignment.isPrimary ? " · 主要" : ""}</span>)}</div><div className="card-actions"><select value={farmId} onChange={(event) => setFarmId(event.target.value)}><option value="">選擇要指派的雞場</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select><button disabled={!farmId} onClick={() => { void onAssign(farmId, { caretakerId: caretaker.id, effectiveFrom: new Date().toISOString().slice(0, 10), isPrimary: true }); setFarmId(""); }}>指派主要飼養者</button><button onClick={() => void onUpdate(caretaker.id, { version: caretaker.version, active: !caretaker.active }, true)}>{caretaker.active ? "封存" : "啟用"}</button></div></article>)}</div></section>; }

function HousesView({ houses, farms, onCreate, onUpdate }: { houses: House[]; farms: Farm[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => MutationResult }) { const [farmId, setFarmId] = useState(""); const [name, setName] = useState(""); const [capacity, setCapacity] = useState(""); return <section className="page"><div className="panel"><PanelTitle title="雞舍主檔" /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (farmId && name.trim()) { void onCreate({ farmId, name: name.trim(), capacity: capacity ? Number(capacity) : null }); setName(""); setCapacity(""); } }}><label>所屬雞場<select value={farmId} onChange={(event) => setFarmId(event.target.value)}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍名稱<input value={name} onChange={(event) => setName(event.target.value)} placeholder="測試1舍" /></label><label>容量（可選）<input type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><button className="primary">建立雞舍</button></form></div><DataTable headers={["雞場", "雞舍", "容量", "版本", "狀態", "操作"]}>{houses.map((house) => <tr key={house.id}><td>{house.farmName ?? farms.find((farm) => farm.id === house.farmId)?.name ?? "—"}</td><td><strong>{house.name}</strong></td><td>{house.capacity ? quantity(house.capacity) : "未設定"}</td><td>v{house.version}</td><td><StatusPill tone={house.active ? "good" : "neutral"}>{house.active ? "啟用" : "封存"}</StatusPill></td><td><button className="table-button" onClick={() => void onUpdate(house.id, { version: house.version, active: !house.active }, true)}>{house.active ? "封存" : "啟用"}</button></td></tr>)}</DataTable><div className="mobile-card-list">{houses.map((house) => <MobileCard key={house.id}><div className="mobile-card-head"><strong>{house.name}</strong><StatusPill tone={house.active ? "good" : "neutral"}>{house.active ? "啟用" : "封存"}</StatusPill></div><dl className="mobile-fields"><div><dt>雞場</dt><dd>{house.farmName ?? farms.find((farm) => farm.id === house.farmId)?.name ?? "—"}</dd></div><div><dt>容量／版本</dt><dd>{house.capacity ? quantity(house.capacity) : "未設定"} · v{house.version}</dd></div></dl><button className="table-button" onClick={() => void onUpdate(house.id, { version: house.version, active: !house.active }, true)}>{house.active ? "封存" : "啟用"}</button></MobileCard>)}</div></section>; }

function FlocksView({ flocks, farms, houses, onCreate, onUpdate }: { flocks: Flock[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => MutationResult; onUpdate: (id: string, body: Record<string, unknown>) => MutationResult }) { const [farmId, setFarmId] = useState(""); const [houseId, setHouseId] = useState(""); const [batchCode, setBatchCode] = useState(""); const [date, setDate] = useState(""); const [count, setCount] = useState(""); const [expected, setExpected] = useState(""); const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); return <section className="page"><div className="panel"><PanelTitle title="批次／入雛主檔" /><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (farmId && houseId && batchCode && date && count) { void onCreate({ farmId, houseId, batchCode, chickInDate: date, initialCount: Number(count), expectedShipmentDate: expected || null }); setBatchCode(""); } }}><label>雞場<select value={farmId} onChange={(event) => { setFarmId(event.target.value); setHouseId(""); }}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">請選擇</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>批次代碼<input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder="TEST-BATCH-002" /></label><label>入雛日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>初始數量<input type="number" min="1" value={count} onChange={(event) => setCount(event.target.value)} /></label><label>預計出雞<input type="date" value={expected} onChange={(event) => setExpected(event.target.value)} /></label><button className="primary">建立批次</button></form></div><DataTable headers={["批次", "雞場／雞舍", "入雛", "日齡", "初始數", "預計出雞", "狀態", "操作"]}>{flocks.map((flock) => <tr key={flock.id}><td><strong>{flock.batchCode}</strong></td><td>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}<br /><span className="muted">{flock.houseName ?? houses.find((house) => house.id === flock.houseId)?.name ?? "—"}</span></td><td>{flock.chickInDate}</td><td>{flock.ageDays ?? "—"} 日</td><td>{quantity(flock.initialCount)}</td><td>{flock.expectedShipmentDate ?? "未設定"}</td><td><StatusPill tone={flock.status === "active" ? "good" : "neutral"}>{flock.status === "active" ? "進行中" : flock.status}</StatusPill></td><td>{flock.status === "active" && <button className="table-button" onClick={() => void onUpdate(flock.id, { version: flock.version, status: "closed" })}>結束批次</button>}</td></tr>)}</DataTable><div className="mobile-card-list">{flocks.map((flock) => <MobileCard key={flock.id}><div className="mobile-card-head"><strong>{flock.batchCode}</strong><StatusPill tone={flock.status === "active" ? "good" : "neutral"}>{flock.status === "active" ? "進行中" : flock.status}</StatusPill></div><dl className="mobile-fields"><div><dt>雞場／雞舍</dt><dd>{flock.farmName ?? farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"} · {flock.houseName ?? houses.find((house) => house.id === flock.houseId)?.name ?? "—"}</dd></div><div><dt>入雛／日齡</dt><dd>{flock.chickInDate} · {flock.ageDays ?? "—"} 日</dd></div><div><dt>初始數量／預計出雞</dt><dd>{quantity(flock.initialCount)} 隻 · {flock.expectedShipmentDate ?? "未設定"}</dd></div></dl>{flock.status === "active" && <button className="table-button" onClick={() => void onUpdate(flock.id, { version: flock.version, status: "closed" })}>結束批次</button>}</MobileCard>)}</div></section>; }

function EventsView({ events, farms, houses, onCreate, onReverse, onCorrect, onLoadMore, hasMore }: { events: OperationalEvent[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => MutationResult; onReverse: (id: string, reason: string) => MutationResult; onCorrect: (id: string, body: Record<string, unknown>) => MutationResult; onLoadMore: () => Promise<void>; hasMore: boolean }) { const [farmId, setFarmId] = useState(""); const [houseId, setHouseId] = useState(""); const [intent, setIntent] = useState("mortality"); const [quantityValue, setQuantityValue] = useState(""); const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10)); const [modal, setModal] = useState<{ kind: "reverse" | "correct"; event: OperationalEvent } | null>(null); const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); function status(event: OperationalEvent) { return event.reversedAt ? <StatusPill>已反轉</StatusPill> : <StatusPill tone="good">有效</StatusPill>; } function eventCard(event: OperationalEvent) { return <MobileCard key={event.id} className={event.reversedAt ? "muted-row" : ""}><div className="mobile-card-head"><strong>{eventLabel(event.intent)}</strong>{status(event)}</div><dl className="mobile-fields"><div><dt>雞場／雞舍</dt><dd>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })} · {event.house ?? "場級"}</dd></div><div><dt>數量／日期</dt><dd>{quantity(event.quantity)} {event.unit} · {event.eventDate}</dd></div><div><dt>批次</dt><dd>{event.flockId ?? "—"}</dd></div></dl>{!event.reversedAt && <div className="card-actions"><button className="table-button danger" onClick={() => setModal({ kind: "reverse", event })}>反轉</button><button className="table-button" onClick={() => setModal({ kind: "correct", event })}>修正</button></div>}</MobileCard>; } return <section className="page"><div className="panel"><PanelTitle title="新增營運事件" /><p className="muted">直接寫入共用 operational_events；修正使用反轉／新事件，不覆寫歷史數量。</p><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (farmId && quantityValue) { const unit = intent === "feed" ? "kg" : intent === "water" ? "L" : "隻"; void onCreate({ farmId, houseId: houseId || null, intent, quantity: Number(quantityValue), unit, eventDate }); setQuantityValue(""); } }}><label>雞場<select value={farmId} onChange={(event) => { setFarmId(event.target.value); setHouseId(""); }}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">場級／請選擇</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>事件<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="mortality">死亡</option><option value="cull">淘汰</option><option value="feed">飼料</option><option value="water">飲水</option><option value="shipment">出雞</option></select></label><label>數量<input type="number" min="0.01" step="0.01" value={quantityValue} onChange={(event) => setQuantityValue(event.target.value)} /></label><label>日期<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label><button className="primary">寫入事件</button></form></div><DataTable headers={["日期", "雞場／雞舍", "事件", "數量", "批次", "狀態", "操作"]}>{events.map((event) => <tr key={event.id} className={event.reversedAt ? "muted-row" : ""}><td>{event.eventDate}</td><td>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })}<br /><span className="muted">{event.house ?? "場級"}</span></td><td>{eventLabel(event.intent)}</td><td><strong>{quantity(event.quantity)} {event.unit}</strong></td><td>{event.flockId ?? "—"}</td><td>{status(event)}</td><td className="button-row">{!event.reversedAt && <><button className="table-button danger" onClick={() => setModal({ kind: "reverse", event })}>反轉</button><button className="table-button" onClick={() => setModal({ kind: "correct", event })}>修正</button></>}</td></tr>)}</DataTable><div className="mobile-card-list">{events.map(eventCard)}</div>{hasMore && <div className="load-more"><button onClick={() => void onLoadMore()}>載入更多</button></div>}{modal?.kind === "reverse" && <ReasonModal title="反轉營運事件" onClose={() => setModal(null)} onSubmit={async (reason) => { await onReverse(modal.event.id, reason); setModal(null); }} />}{modal?.kind === "correct" && <ReasonModal title="修正營運事件" correction quantityValue={modal.event.quantity} onClose={() => setModal(null)} onSubmit={async (reason, nextQuantity) => { await onCorrect(modal.event.id, { quantity: nextQuantity, reason }); setModal(null); }} />}</section>; }

function FinanceView({ finance }: { finance: FinanceData | null }) { if (!finance) return <Loading />; return <section className="page"><div className="metric-grid"><Metric title="玩家分配盈虧" value={`$${money(finance.totals.allocated)}`} detail="正式雞場歷史" /><Metric title="支出" value={`$${money(finance.totals.expense)}`} detail="正式雞場歷史" tone="warn" /><Metric title="玩家淨收入" value={`$${money(finance.totals.net)}`} detail="D1 ledger 計算" tone="good" /></div><div className="two-col"><section className="panel"><PanelTitle title="投資人累計" />{finance.investors.map((investor) => <div className="finance-row" key={String(investor.id)}><span>{String(investor.name)}</span><strong>${money(investor.amount)}</strong></div>)}</section><section className="panel"><PanelTitle title="各場淨收入" />{finance.farms.map((farm) => <div className="finance-row" key={String(farm.id)}><span>{String(farm.name)} <small>{Number(farm.playerGroupEquityFraction) * 100}%</small></span><strong>${money(farm.net)}</strong></div>)}</section></div><section className="panel"><PanelTitle title="Profit distributions / expenses" /><DataTable className="dense-table" headers={["日期", "雞場", "Gross", "玩家分配", "支出", "Net", "來源"]}>{finance.distributions.map((row) => <tr key={String(row.id)}><td>{String(row.distributionDate)}</td><td>{String(row.farmName)}</td><td>${money(row.grossProfitLoss)}</td><td>${money(row.allocatedProfitLoss)}</td><td>${money(row.expense)}</td><td>${money(row.netIncome)}</td><td><small>{String(row.sourceDataset ?? "—")}</small></td></tr>)}</DataTable></section><section className="panel"><PanelTitle title="Profit allocations" /><DataTable className="dense-table" headers={["分配日期", "投資人", "金額"]}>{finance.allocations.map((row) => <tr key={String(row.id)}><td>{String(finance.distributions.find((distribution) => distribution.id === row.distributionId)?.distributionDate ?? "—")}</td><td>{String(row.investorName)}</td><td>${money(row.amount)}</td></tr>)}</DataTable></section><div className="notice">財務頁面只讀取 Production environment；測試雞場不會進入投資／盈虧總計。</div></section>; }

function ChartsView({ chart, loading, farms, houses, flocks, caretakers, metric, setMetric, range, setRange, granularity, setGranularity, farmId, setFarmId, houseId, setHouseId, flockId, setFlockId, environment, setEnvironment, caretakerId, setCaretakerId }: { chart: ChartResponse | null; loading: boolean; farms: Farm[]; houses: House[]; flocks: Flock[]; caretakers: Caretaker[]; metric: string; setMetric: (value: string) => void; range: string; setRange: (value: string) => void; granularity: "daily" | "weekly" | "monthly"; setGranularity: (value: "daily" | "weekly" | "monthly") => void; farmId: string; setFarmId: (value: string) => void; houseId: string; setHouseId: (value: string) => void; flockId: string; setFlockId: (value: string) => void; environment: string; setEnvironment: (value: string) => void; caretakerId: string; setCaretakerId: (value: string) => void }) { const financeMetric = metric.includes("profit") || metric === "portfolio-net"; const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); const availableFlocks = flocks.filter((flock) => (!farmId || flock.farmId === farmId) && (!houseId || flock.houseId === houseId)); return <section className="page"><section className="panel"><PanelTitle title="D1 趨勢分析" /><div className="filter-grid"><label>指標<select value={metric} onChange={(event) => setMetric(event.target.value)}>{chartOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><fieldset className="range-filter"><legend>日期範圍</legend><div className="range-chips">{rangeOptions.map(([key, label]) => <button type="button" className={range === key ? "selected" : ""} aria-pressed={range === key} key={key} onClick={() => setRange(key)}>{label}</button>)}</div></fieldset><label className="granularity-filter">粒度<select value={granularity} onChange={(event) => setGranularity(event.target.value as "daily" | "weekly" | "monthly")}><option value="daily">每日</option><option value="weekly">每週</option><option value="monthly">每月</option></select></label><label>環境<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="">全部</option><option value="production">PRODUCTION</option><option value="test">TEST</option></select></label><label>雞場<select value={farmId} onChange={(event) => setFarmId(event.target.value)}><option value="">全部雞場</option>{farms.filter((farm) => !environment || farm.environment === environment).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>{!financeMetric && <><label>雞舍<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">全部雞舍</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>批次<select value={flockId} onChange={(event) => setFlockId(event.target.value)}><option value="">全部批次</option>{availableFlocks.map((flock) => <option key={flock.id} value={flock.id}>{flock.batchCode}</option>)}</select></label><label>飼養者<select value={caretakerId} onChange={(event) => setCaretakerId(event.target.value)}><option value="">全部飼養者</option>{caretakers.filter((caretaker) => caretaker.active).map((caretaker) => <option key={caretaker.id} value={caretaker.id}>{caretaker.name}</option>)}</select></label></>}</div>{metric === "farm-profit" && !farmId && <p className="notice">各場盈虧需先指定雞場；Portfolio 淨收入可直接查看整體。</p>}</section><section className="panel chart-panel"><div className="chart-heading"><div><h3>{chartOptions.find(([key]) => key === metric)?.[1] ?? metric}</h3><p className="muted">{chart?.definition ?? "資料由 D1 aggregation endpoint 提供。"}</p></div>{chart && <StatusPill tone={chart.status === "ok" ? "good" : "warn"}>{chart.unit}</StatusPill>}</div>{loading ? <div className="loading">查詢 D1 聚合資料…</div> : <SimpleChart chart={chart} />}</section></section>; }

function RemindersView({ flocks }: { flocks: Flock[] }) { const reminders = flocks.filter((flock) => flock.status === "active" && flock.shipmentReminder); return <section className="page"><div className="panel"><PanelTitle title="出雞提醒" /><p className="muted">由批次預計出雞日期與台北時區計算。</p>{reminders.length ? reminders.map((flock) => <div className="reminder-row" key={flock.id}><span>📅</span><div className="grow"><strong>{flock.batchCode}</strong><small>{flock.expectedShipmentDate} · 日齡 {flock.ageDays} 日</small></div><StatusPill tone="warn">{flock.shipmentReminder === "overdue" ? "已逾期" : flock.shipmentReminder === "today" ? "今天" : "7 日內"}</StatusPill></div>) : <div className="empty">目前沒有 7 日內的出雞提醒。</div>}</div></section>; }

function AliasesView({ aliases }: { aliases: Alias[] }) { return <section className="page"><div className="panel"><PanelTitle title="Farm aliases（唯讀）" /><p className="muted">正式名稱由 D1 farms 提供；候選／同音 alias 不會繞過 FarmResolver 直接寫入。</p><DataTable className="dense-table" headers={["正式雞場", "Alias", "類型", "狀態", "確認次數", "最後確認"]}>{aliases.map((alias) => <tr key={alias.id}><td>{alias.farmName}</td><td><strong>{alias.alias}</strong><br /><small>{alias.normalizedAlias}</small></td><td>{alias.aliasType}</td><td><StatusPill tone={alias.status === "trusted" ? "good" : alias.status === "disabled" ? "neutral" : "warn"}>{alias.status}</StatusPill></td><td>{alias.confirmationCount}</td><td>{alias.lastConfirmedAt ?? "—"}</td></tr>)}</DataTable></div></section>; }

function HealthView({ health }: { health: DataHealth | null }) { if (!health) return <Loading />; return <section className="page"><div className="panel"><PanelTitle title="資料健康檢查" /><p className="muted">只讀檢查，不會自動修正資料。檢查時間：{health.checkedAt}</p><DataTable headers={["檢查", "結果", "狀態"]}>{(health.checks ?? []).map((check) => <tr key={check.code}><td>{check.label}</td><td>{check.count}</td><td><StatusPill tone={check.count ? "warn" : "good"}>{check.count ? "需檢視" : "正常"}</StatusPill></td></tr>)}</DataTable>{health.warnings.length ? <div className="warning-list">{health.warnings.map((warning) => <p key={warning}>⚠️ {warning}</p>)}</div> : <div className="healthy"><span>✓</span><strong>所有目前檢查正常</strong></div>}</div></section>; }

function AuditDiff({ row }: { row: AuditRow }) { const fields = row.changedFields.length ? row.changedFields : Array.from(new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})])); return <details className="audit-detail"><summary>查看 before / after diff</summary><div className="diff-grid"><div><strong>修改前</strong>{fields.map((field) => <div className="diff-row" key={`before-${field}`}><span>{fieldLabel(field)}</span><code>{formatValue(row.before?.[field])}</code></div>)}</div><div><strong>修改後</strong>{fields.map((field) => <div className="diff-row" key={`after-${field}`}><span>{fieldLabel(field)}</span><code>{formatValue(row.after?.[field])}</code></div>)}</div></div><p className="muted">變更欄位：{fields.length ? fields.map(fieldLabel).join("、") : "—"}</p><details><summary>技術診斷 raw JSON</summary><pre>{JSON.stringify({ before: row.before, after: row.after, changedFields: row.changedFields }, null, 2)}</pre></details></details>; }

function AuditCard({ row }: { row: AuditRow }) { return <MobileCard><div className="mobile-card-head"><strong>{row.action}</strong><StatusPill>{sourceLabel(row.source)}</StatusPill></div><dl className="mobile-fields"><div><dt>時間／實體</dt><dd>{row.createdAt} · {row.entityType}</dd></div><div><dt>操作者</dt><dd>{row.actorType} · {row.actorId ?? "—"}</dd></div><div><dt>原因</dt><dd>{row.reason ?? "—"}</dd></div></dl><AuditDiff row={row} /></MobileCard>; }

function AuditView({ audit, onLoadMore, hasMore }: { audit: AuditRow[]; onLoadMore: () => Promise<void>; hasMore: boolean }) { return <section className="page"><div className="panel"><PanelTitle title="Append-only 變更紀錄" /><p className="muted">LINE、WEB、SYSTEM、MIGRATION 來源清楚分開；每筆 mutation 可展開 before／after／changed fields。</p><DataTable headers={["時間", "來源", "操作", "實體", "操作者", "原因", "Diff"]}>{audit.map((row) => <tr key={row.id}><td>{row.createdAt}</td><td><StatusPill>{sourceLabel(row.source)}</StatusPill></td><td>{row.action}</td><td>{row.entityType}<br /><small>{row.entityId}</small></td><td>{row.actorType}<br /><small>{row.actorId ?? "—"}</small></td><td>{row.reason ?? "—"}</td><td><AuditDiff row={row} /></td></tr>)}</DataTable><div className="mobile-card-list">{audit.map((row) => <AuditCard key={row.id} row={row} />)}</div>{hasMore && <div className="load-more"><button onClick={() => void onLoadMore()}>載入更多 Audit</button></div>}</div></section>; }

function SettingsView({ farms, organization }: { farms: Farm[]; organization: { id: string; name: string; active: boolean } | null }) { return <section className="page"><div className="panel settings"><PanelTitle title="系統設定" /><div className="setting-row"><span>LINE Bot</span><strong>金雞協會助理Ai / @550rsdwc</strong></div><div className="setting-row"><span>Worker</span><strong>chicken-line-production</strong></div><div className="setting-row"><span>資料庫</span><strong>chicken-line-production · 共用 D1</strong></div><div className="setting-row"><span>AI 模型</span><strong>@cf/meta/llama-3.2-3b-instruct</strong></div><div className="setting-row"><span>Organization</span><strong>{organization?.name ?? "—"}</strong></div><div className="setting-row"><span>Farm scope</span><strong>{farms.length} 個雞場（含測試）</strong></div><div className="notice">結構性操作使用 Web modal 進行 fresh authorization；session token 只存在本次頁面記憶體。管理密碼不會出現在前端 source、D1 或回覆。</div></div></section>; }

function EquityView({ finance }: { finance: FinanceData | null }) { if (!finance) return <Loading />; return <section className="page"><div className="panel"><PanelTitle title="Farm equity / investor equity" /><p className="muted">Production farm 的實際投資人持股，來源為 D1 farm_investor_equity；測試場與財務歷史排除。</p><DataTable className="dense-table" headers={["雞場", "投資人", "實際持股", "來源", "生效日"]}>{finance.farmInvestorEquity.map((row) => <tr key={String(row.id)}><td>{String(row.farmName)}</td><td>{String(row.investorName)}</td><td>{(Number(row.equityFraction) * 100).toFixed(4)}%</td><td>{String(row.source ?? "—")}</td><td>{String(row.effectiveDate ?? "—")}</td></tr>)}</DataTable></div></section>; }
