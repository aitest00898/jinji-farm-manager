import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClient, type Caretaker, type ChartPoint, type Dashboard, type Farm, type Flock, type House, type OperationalEvent } from "./api";

const api = new ApiClient();
const NAV = [
  ["dashboard", "總覽"], ["farms", "雞場"], ["caretakers", "飼養者"], ["houses", "雞舍"],
  ["flocks", "批次"], ["events", "營運紀錄"], ["finance", "財務"], ["charts", "趨勢分析"],
  ["reminders", "提醒"], ["audit", "變更紀錄"], ["settings", "設定"],
] as const;

function money(value: unknown): string { return Number(value ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 }); }
function number(value: unknown): string { return Number(value ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 0 }); }
function farmLabel(farm: Pick<Farm, "name" | "environment">): string { return `${farm.environment === "test" ? "🧪 " : "🐔 "}${farm.name}`; }
function eventLabel(intent: string): string { return ({ mortality: "死亡", cull: "淘汰", feed: "飼料", water: "飲水", shipment: "出雞" } as Record<string, string>)[intent] ?? intent; }

function Login({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onLogin(password); setPassword(""); } catch (err) { setError(err instanceof Error ? err.message : "登入失敗。"); setPassword(""); }
    finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">🐔</div><p className="eyebrow">金雞協會助理Ai</p><h1>雞場管理中心</h1>
    <p className="muted">使用現有管理密碼登入。密碼只送往 Worker 驗證，不會保存在瀏覽器。</p>
    <form onSubmit={submit}><label>管理密碼<input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label><button className="primary full" disabled={busy || !password}>{busy ? "驗證中…" : "登入管理中心"}</button></form>
    {error && <p className="error-text">{error}</p>}
  </section></main>;
}

function SimpleChart({ points }: { points: ChartPoint[] }) {
  if (!points.length) return <div className="empty">目前期間沒有資料。</div>;
  const max = Math.max(...points.map((point) => Number(point.value)), 1);
  const min = Math.min(...points.map((point) => Number(point.value)), 0);
  const span = Math.max(max - min, 1);
  const coords = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${100 - ((Number(point.value) - min) / span) * 88 - 6}`).join(" ");
  return <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="趨勢圖"><line x1="0" y1="94" x2="100" y2="94" className="chart-axis" /><polyline points={coords} className="chart-line" /></svg><div className="chart-labels"><span>{points[0].date}</span><strong>{money(points[points.length - 1].value)}</strong><span>{points[points.length - 1].date}</span></div></div>;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "neutral" }) { return <span className={`pill ${tone}`}>{children}</span>; }

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [finance, setFinance] = useState<{ totals: Record<string, number>; investors: Array<Record<string, unknown>>; farms: Array<Record<string, unknown>> } | null>(null);
  const [chart, setChart] = useState<{ metric: string; series: ChartPoint[] } | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);

  async function loadAll() {
    setBusy(true); setError("");
    try {
      const [dash, farmData, caretakerData, houseData, flockData, eventData, financeData, auditData] = await Promise.all([
        api.dashboard(), api.farms(), api.caretakers(), api.houses(), api.flocks(), api.events("?limit=100"), api.finance(), api.audit(),
      ]);
      setDashboard({ ...dash, dataHealth: dash.dataHealth ?? { warnings: [] } }); setFarms(farmData.farms); setCaretakers(caretakerData.caretakers); setHouses(houseData.houses); setFlocks(flockData.flocks); setEvents(eventData.events); setFinance(financeData); setAudit(auditData.auditLogs);
    } catch (err) { if ((err as { status?: number }).status === 401) { api.setToken(null); setAuthenticated(false); } setError(err instanceof Error ? err.message : "資料載入失敗。"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (authenticated) void loadAll(); }, [authenticated]);
  useEffect(() => { if (!authenticated || page !== "charts") return; api.chart("mortality").then(setChart).catch((err) => setError(err instanceof Error ? err.message : "圖表載入失敗。")); }, [authenticated, page]);

  async function login(password: string) { const result = await api.login(password); api.setToken(result.token); setAuthenticated(true); }
  async function logout() { try { await api.logout(); } finally { api.setToken(null); setAuthenticated(false); } }
  async function authorize(): Promise<boolean> {
    const password = window.prompt("此操作需要重新驗證管理密碼。密碼不會被保存。");
    if (!password) return false;
    try { await api.authorize(password); return true; } catch (err) { setError(err instanceof Error ? err.message : "管理權限驗證失敗。"); return false; }
  }
  async function runMutation(work: () => Promise<unknown>, needsAuth = false) {
    setError(""); if (needsAuth && !(await authorize())) return;
    try { await work(); await loadAll(); } catch (err) { setError(err instanceof Error ? err.message : "操作失敗。"); }
  }

  if (!authenticated) return <Login onLogin={login} />;
  const current = NAV.find(([key]) => key === page)?.[1] ?? "總覽";
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span>🐔</span><div><strong>金雞協會助理Ai</strong><small>農場管理中心</small></div></div><nav>{NAV.map(([key, label]) => <button key={key} className={key === page ? "active" : ""} onClick={() => setPage(key)}><span className={`nav-icon nav-${key}`} />{label}</button>)}</nav><div className="sidebar-foot"><span>共用 Production D1</span><button onClick={() => void logout()}>登出</button></div></aside>
    <main className="content"><header className="topbar"><div><p className="eyebrow">管理工作台 / {current}</p><h1>{current}</h1></div><div className="top-actions"><StatusPill tone="good">Worker 線上</StatusPill><button className="icon-button" title="重新整理" onClick={() => void loadAll()} disabled={busy}>↻</button></div></header>
      {error && <div className="alert error-text">{error}<button onClick={() => setError("")}>×</button></div>}
      {page === "dashboard" && <DashboardView dashboard={dashboard} farms={farms} flocks={flocks} onNavigate={setPage} />}
      {page === "farms" && <FarmsView farms={farms} onCreate={(body) => void runMutation(() => api.createFarm(body), true)} onUpdate={(id, body, structural) => void runMutation(() => api.updateFarm(id, body), structural)} />}
      {page === "caretakers" && <CaretakersView caretakers={caretakers} farms={farms} onCreate={(body) => void runMutation(() => api.createCaretaker(body), true)} onUpdate={(id, body, structural) => void runMutation(() => api.updateCaretaker(id, body), structural)} onAssign={(farmId, body) => void runMutation(() => api.assignCaretaker(farmId, body), true)} />}
      {page === "houses" && <HousesView houses={houses} farms={farms} onCreate={(body) => void runMutation(() => api.createHouse(body), true)} onUpdate={(id, body, structural) => void runMutation(() => api.updateHouse(id, body), structural)} />}
      {page === "flocks" && <FlocksView flocks={flocks} farms={farms} houses={houses} onCreate={(body) => void runMutation(() => api.createFlock(body), true)} onUpdate={(id, body) => void runMutation(() => api.updateFlock(id, body))} />}
      {page === "events" && <EventsView events={events} farms={farms} houses={houses} onCreate={(body) => void runMutation(() => api.createEvent(body))} onReverse={(id) => void runMutation(() => api.reverseEvent(id, "web-console-reversal"))} />}
      {page === "finance" && <FinanceView finance={finance} />}
      {page === "charts" && <ChartsView chart={chart} />}
      {page === "reminders" && <RemindersView flocks={flocks} />}
      {page === "audit" && <AuditView audit={audit} />}
      {page === "settings" && <SettingsView farms={farms} />}
    </main>
  </div>;
}

function DashboardView({ dashboard, farms, flocks, onNavigate }: { dashboard: Dashboard | null; farms: Farm[]; flocks: Flock[]; onNavigate: (page: string) => void }) {
  if (!dashboard) return <Loading />;
  return <section className="page"><div className="hero"><div><span className="hero-kicker">截至 {dashboard.asOf}</span><h2>今天，讓每一筆雞場資料都清楚可追溯。</h2><p>營運資料由 LINE 與 Web 共用；正式財務統計自動排除測試場。</p></div><button className="primary" onClick={() => onNavigate("events")}>記錄營運事件 ＋</button></div>
    <div className="metric-grid"><Metric title="有效雞場" value={dashboard.counts.farms} detail={`正式 ${dashboard.counts.productionFarms} ／ 測試 ${dashboard.counts.testFarms}`} /><Metric title="目前存欄" value={`${number(dashboard.stock)} 隻`} detail={`${dashboard.counts.activeFlocks} 個進行中批次`} /><Metric title="今日死亡" value={`${number(dashboard.today.mortality)} 隻`} detail={`淘汰 ${number(dashboard.today.cull)} 隻`} tone={dashboard.today.mortality > 0 ? "warn" : "good"} /><Metric title="歷史淨收入" value={`$${money(dashboard.finance.net)}`} detail="僅正式雞場財務" /></div>
    <div className="two-col"><section className="panel"><PanelTitle title="雞場概覽" action="查看全部" onClick={() => onNavigate("farms")} /><div className="farm-list">{farms.filter((farm) => farm.active).slice(0, 8).map((farm) => <div className="farm-row" key={farm.id}><div className="farm-avatar">{farm.environment === "test" ? "🧪" : "🐔"}</div><div className="grow"><strong>{farm.name}</strong><span>{farm.siteName || (farm.structureMode === "multi_house" ? "多舍管理" : "全場管理")}</span></div><StatusPill tone={farm.environment === "test" ? "warn" : "good"}>{farm.environment === "test" ? "TEST" : "PRODUCTION"}</StatusPill></div>)}</div></section><section className="panel"><PanelTitle title="資料健康度" action="查看變更紀錄" onClick={() => onNavigate("audit")} />{dashboard.dataHealth.warnings.length ? <div className="warning-list">{dashboard.dataHealth.warnings.map((warning) => <p key={warning}>⚠️ {warning}</p>)}</div> : <div className="healthy"><span>✓</span><div><strong>目前沒有阻塞性警告</strong><p>主檔、批次與財務資料可正常使用。</p></div></div>}<div className="mini-summary"><span>預計 7 日內出雞</span><strong>{dashboard.upcomingShipments} 批</strong></div></section></div>
    <section className="panel"><PanelTitle title="進行中批次" action="管理批次" onClick={() => onNavigate("flocks")} /><div className="table-wrap"><table><thead><tr><th>批次</th><th>雞場</th><th>入雛日</th><th>日齡</th><th>預計出雞</th><th>狀態</th></tr></thead><tbody>{flocks.filter((flock) => flock.status === "active").slice(0, 6).map((flock) => <tr key={flock.id}><td><strong>{flock.batchCode}</strong></td><td>{farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}</td><td>{flock.chickInDate}</td><td>{flock.ageDays ?? 0} 日</td><td>{flock.expectedShipmentDate ?? "未設定"}</td><td><StatusPill tone="good">進行中</StatusPill></td></tr>)}</tbody></table></div></section>
  </section>;
}

function Metric({ title, value, detail, tone = "neutral" }: { title: string; value: string | number; detail: string; tone?: "good" | "warn" | "neutral" }) { return <div className={`metric-card ${tone}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>; }
function PanelTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) { return <div className="panel-title"><h3>{title}</h3>{action && <button className="text-button" onClick={onClick}>{action} →</button>}</div>; }
function Loading() { return <section className="page"><div className="loading">載入共用 D1 資料…</div></section>; }

function FarmsView({ farms, onCreate, onUpdate }: { farms: Farm[]; onCreate: (body: Record<string, unknown>) => void; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => void }) {
  const [show, setShow] = useState(false); const [filter, setFilter] = useState<"all" | "production" | "test">("all");
  const visible = farms.filter((farm) => filter === "all" || farm.environment === filter);
  return <section className="page"><div className="page-actions"><div className="segmented">{([["all", "全部"], ["production", "正式"], ["test", "測試"]] as const).map(([key, label]) => <button className={filter === key ? "selected" : ""} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div><button className="primary" onClick={() => setShow(!show)}>新增雞場 ＋</button></div>{show && <FarmForm onSubmit={(body) => { onCreate(body); setShow(false); }} />}
    <div className="farm-cards">{visible.map((farm) => <article className={`farm-card ${farm.environment === "test" ? "test" : ""}`} key={farm.id}><div className="farm-card-head"><div className="farm-avatar large">{farm.environment === "test" ? "🧪" : "🐔"}</div><div className="grow"><span className="eyebrow">{farm.environment === "test" ? "TEST FARM" : "PRODUCTION FARM"}</span><h3>{farm.name}</h3></div><StatusPill tone={farm.active ? "good" : "neutral"}>{farm.active ? "啟用" : "已封存"}</StatusPill></div><div className="farm-meta"><div><span>場址</span><strong>{farm.siteName || "尚未設定"}</strong></div><div><span>結構</span><strong>{farm.structureMode === "multi_house" ? "多舍" : "全場"}</strong></div><div><span>版本</span><strong>v{farm.version}</strong></div></div><div className="card-actions"><button onClick={() => onUpdate(farm.id, { version: farm.version, active: !farm.active }, true)}>{farm.active ? "封存" : "重新啟用"}</button><button onClick={() => { const note = window.prompt("更新場務備註", farm.note ?? ""); if (note !== null) onUpdate(farm.id, { version: farm.version, note }, false); }}>編輯備註</button></div></article>)}</div></section>;
}

function FarmForm({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => void }) { const [name, setName] = useState(""); const [environment, setEnvironment] = useState("test"); const [structureMode, setStructureMode] = useState("whole_farm"); return <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (name) onSubmit({ name, environment, structureMode }); }}><label>名稱<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：新測試場" /></label><label>環境<select value={environment} onChange={(e) => setEnvironment(e.target.value)}><option value="test">TEST</option><option value="production">PRODUCTION</option></select></label><label>結構<select value={structureMode} onChange={(e) => setStructureMode(e.target.value)}><option value="whole_farm">全場</option><option value="multi_house">多舍</option></select></label><button className="primary">送出</button></form>; }

function CaretakersView({ caretakers, farms, onCreate, onUpdate, onAssign }: { caretakers: Caretaker[]; farms: Farm[]; onCreate: (body: Record<string, unknown>) => void; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => void; onAssign: (farmId: string, body: Record<string, unknown>) => void }) { const [name, setName] = useState(""); const [farmId, setFarmId] = useState(""); return <section className="page"><div className="panel"><PanelTitle title="飼養者與場務責任" /><form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (name) { onCreate({ name }); setName(""); } }}><label>新增飼養者<input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名或稱呼" /></label><button className="primary">新增</button></form></div><div className="card-grid">{caretakers.map((caretaker) => <article className="panel" key={caretaker.id}><div className="panel-title"><h3>{caretaker.name}</h3><StatusPill tone={caretaker.active ? "good" : "neutral"}>{caretaker.active ? "啟用" : "封存"}</StatusPill></div><p className="muted">目前負責 {caretaker.assignments?.length ?? 0} 個雞場</p><div className="tag-list">{(caretaker.assignments ?? []).map((assignment) => <span className="tag" key={`${assignment.farmId}-${assignment.effectiveFrom}`}>{assignment.farmName}{assignment.isPrimary ? " · 主要" : ""}</span>)}</div><div className="card-actions"><select value={farmId} onChange={(e) => setFarmId(e.target.value)}><option value="">選擇要指派的雞場</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select><button disabled={!farmId} onClick={() => { onAssign(farmId, { caretakerId: caretaker.id, effectiveFrom: new Date().toISOString().slice(0, 10), isPrimary: true }); setFarmId(""); }}>指派主要飼養者</button><button onClick={() => onUpdate(caretaker.id, { version: caretaker.version, active: !caretaker.active }, true)}>{caretaker.active ? "封存" : "啟用"}</button></div></article>)}</div></section>; }

function HousesView({ houses, farms, onCreate, onUpdate }: { houses: House[]; farms: Farm[]; onCreate: (body: Record<string, unknown>) => void; onUpdate: (id: string, body: Record<string, unknown>, structural: boolean) => void }) { const [farmId, setFarmId] = useState(""); const [name, setName] = useState(""); return <section className="page"><div className="panel"><PanelTitle title="雞舍主檔" /><form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (farmId && name) { onCreate({ farmId, name }); setName(""); } }}><label>所屬雞場<select value={farmId} onChange={(e) => setFarmId(e.target.value)}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍名稱<input value={name} onChange={(e) => setName(e.target.value)} placeholder="測試1舍" /></label><button className="primary">建立雞舍</button></form></div><DataTable headers={["雞場", "雞舍", "容量", "版本", "狀態", "操作"]}>{houses.map((house) => <tr key={house.id}><td>{farms.find((farm) => farm.id === house.farmId)?.name ?? "—"}</td><td><strong>{house.name}</strong></td><td>{house.capacity ? number(house.capacity) : "未設定"}</td><td>v{house.version}</td><td><StatusPill tone={house.active ? "good" : "neutral"}>{house.active ? "啟用" : "封存"}</StatusPill></td><td><button className="table-button" onClick={() => onUpdate(house.id, { version: house.version, active: !house.active }, true)}>{house.active ? "封存" : "啟用"}</button></td></tr>)}</DataTable></section>; }

function FlocksView({ flocks, farms, houses, onCreate, onUpdate }: { flocks: Flock[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => void; onUpdate: (id: string, body: Record<string, unknown>) => void }) { const [farmId, setFarmId] = useState(""); const [houseId, setHouseId] = useState(""); const [batchCode, setBatchCode] = useState(""); const [date, setDate] = useState(""); const [count, setCount] = useState(""); const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); return <section className="page"><div className="panel"><PanelTitle title="批次／入雛主檔" /><form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (farmId && houseId && batchCode && date && count) { onCreate({ farmId, houseId, batchCode, chickInDate: date, initialCount: Number(count) }); setBatchCode(""); } }}><label>雞場<select value={farmId} onChange={(e) => { setFarmId(e.target.value); setHouseId(""); }}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍<select value={houseId} onChange={(e) => setHouseId(e.target.value)}><option value="">請選擇</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>批次代碼<input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="TEST-BATCH-002" /></label><label>入雛日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>初始數量<input type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} /></label><button className="primary">建立批次</button></form></div><DataTable headers={["批次", "雞場／雞舍", "入雛", "日齡", "初始數", "預計出雞", "狀態", "操作"]}>{flocks.map((flock) => <tr key={flock.id}><td><strong>{flock.batchCode}</strong></td><td>{farms.find((farm) => farm.id === flock.farmId)?.name ?? "—"}<br /><span className="muted">{houses.find((house) => house.id === flock.houseId)?.name ?? "—"}</span></td><td>{flock.chickInDate}</td><td>{flock.ageDays ?? "—"} 日</td><td>{number(flock.initialCount)}</td><td>{flock.expectedShipmentDate ?? "未設定"}</td><td><StatusPill tone={flock.status === "active" ? "good" : "neutral"}>{flock.status === "active" ? "進行中" : flock.status}</StatusPill></td><td>{flock.status === "active" && <button className="table-button" onClick={() => onUpdate(flock.id, { version: flock.version, status: "closed" })}>結束批次</button>}</td></tr>)}</DataTable></section>; }

function EventsView({ events, farms, houses, onCreate, onReverse }: { events: OperationalEvent[]; farms: Farm[]; houses: House[]; onCreate: (body: Record<string, unknown>) => void; onReverse: (id: string) => void }) { const [farmId, setFarmId] = useState(""); const [houseId, setHouseId] = useState(""); const [intent, setIntent] = useState("mortality"); const [quantity, setQuantity] = useState(""); const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10)); const availableHouses = houses.filter((house) => house.farmId === farmId && house.active); return <section className="page"><div className="panel"><PanelTitle title="新增營運事件" /><p className="muted">直接寫入共用 operational_events；修正使用反轉／新事件，不覆寫歷史數量。</p><form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (farmId && quantity) { const unit = intent === "feed" ? "kg" : intent === "water" ? "L" : "隻"; onCreate({ farmId, houseId: houseId || null, intent, quantity: Number(quantity), unit, eventDate }); setQuantity(""); } }}><label>雞場<select value={farmId} onChange={(e) => { setFarmId(e.target.value); setHouseId(""); }}><option value="">請選擇</option>{farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farmLabel(farm)}</option>)}</select></label><label>雞舍<select value={houseId} onChange={(e) => setHouseId(e.target.value)}><option value="">場級／請選擇</option>{availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><label>事件<select value={intent} onChange={(e) => setIntent(e.target.value)}><option value="mortality">死亡</option><option value="cull">淘汰</option><option value="feed">飼料</option><option value="water">飲水</option><option value="shipment">出雞</option></select></label><label>數量<input type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><label>日期<input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label><button className="primary">寫入事件</button></form></div><DataTable headers={["日期", "雞場／雞舍", "事件", "數量", "批次", "狀態", "操作"]}>{events.map((event) => <tr key={event.id} className={event.reversedAt ? "muted-row" : ""}><td>{event.eventDate}</td><td>{farmLabel({ name: event.farmName, environment: event.environment as "production" | "test" })}<br /><span className="muted">{event.house ?? "場級"}</span></td><td>{eventLabel(event.intent)}</td><td><strong>{number(event.quantity)} {event.unit}</strong></td><td>{event.flockId ?? "—"}</td><td>{event.reversedAt ? <StatusPill>已反轉</StatusPill> : <StatusPill tone="good">有效</StatusPill>}</td><td>{!event.reversedAt && <button className="table-button danger" onClick={() => onReverse(event.id)}>反轉</button>}</td></tr>)}</DataTable></section>; }

function FinanceView({ finance }: { finance: { totals: Record<string, number>; investors: Array<Record<string, unknown>>; farms: Array<Record<string, unknown>> } | null }) { if (!finance) return <Loading />; return <section className="page"><div className="metric-grid"><Metric title="玩家分配盈虧" value={`$${money(finance.totals.allocated)}`} detail="正式雞場歷史" /><Metric title="支出" value={`$${money(finance.totals.expense)}`} detail="正式雞場歷史" tone="warn" /><Metric title="玩家淨收入" value={`$${money(finance.totals.net)}`} detail="D1 ledger 計算" tone="good" /></div><div className="two-col"><section className="panel"><PanelTitle title="投資人累計" />{finance.investors.map((investor) => <div className="finance-row" key={String(investor.id)}><span>{String(investor.name)}</span><strong>${money(investor.amount)}</strong></div>)}</section><section className="panel"><PanelTitle title="各場淨收入" />{finance.farms.map((farm) => <div className="finance-row" key={String(farm.id)}><span>{String(farm.name)} <small>{Number(farm.playerGroupEquityFraction) * 100}%</small></span><strong>${money(farm.net)}</strong></div>)}</section></div><div className="notice">財務頁面只讀取 Production environment；測試雞場不會進入投資／盈虧總計。</div></section>; }

function ChartsView({ chart }: { chart: { metric: string; series: ChartPoint[] } | null }) { return <section className="page"><div className="panel"><PanelTitle title="營運趨勢" /><div className="chart-tabs"><button className="selected">今日死亡</button><span>資料由 D1 GROUP BY event_date 聚合</span></div><SimpleChart points={chart?.series ?? []} /></div></section>; }
function RemindersView({ flocks }: { flocks: Flock[] }) { const reminders = flocks.filter((flock) => flock.status === "active" && flock.shipmentReminder); return <section className="page"><div className="panel"><PanelTitle title="出雞提醒" /><p className="muted">由批次預計出雞日期與台北時區計算。</p>{reminders.length ? reminders.map((flock) => <div className="reminder-row" key={flock.id}><span>📅</span><div className="grow"><strong>{flock.batchCode}</strong><small>{flock.expectedShipmentDate} · 日齡 {flock.ageDays} 日</small></div><StatusPill tone="warn">{flock.shipmentReminder === "overdue" ? "已逾期" : flock.shipmentReminder === "today" ? "今天" : "7 日內"}</StatusPill></div>) : <div className="empty">目前沒有 7 日內的出雞提醒。</div>}</div></section>; }
function AuditView({ audit }: { audit: Array<Record<string, unknown>> }) { return <section className="page"><div className="panel"><PanelTitle title="Append-only 變更紀錄" /><p className="muted">LINE、Web、系統與 migration mutation 都保留來源、操作者、前後資料與 request id。</p><DataTable headers={["時間", "來源", "操作", "實體", "操作者", "原因"]}>{audit.map((row) => <tr key={String(row.id)}><td>{String(row.createdAt ?? "")}</td><td><StatusPill>{String(row.source)}</StatusPill></td><td>{String(row.action)}</td><td>{String(row.entityType)}<br /><small>{String(row.entityId)}</small></td><td>{String(row.actorType)}<br /><small>{String(row.actorId ?? "")}</small></td><td>{String(row.reason ?? "—")}</td></tr>)}</DataTable></div></section>; }
function SettingsView({ farms }: { farms: Farm[] }) { return <section className="page"><div className="panel settings"><PanelTitle title="系統設定" /><div className="setting-row"><span>LINE Bot</span><strong>金雞協會助理Ai / @550rsdwc</strong></div><div className="setting-row"><span>Worker</span><strong>chicken-line-production</strong></div><div className="setting-row"><span>資料庫</span><strong>chicken-line-production · 共用 D1</strong></div><div className="setting-row"><span>AI 模型</span><strong>@cf/meta/llama-3.2-3b-instruct</strong></div><div className="setting-row"><span>Farm scope</span><strong>{farms.length} 個雞場（含測試）</strong></div><div className="notice">結構性操作會要求 5 分鐘 fresh authorization；session token 只存在本次頁面記憶體。</div></div></section>; }

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
