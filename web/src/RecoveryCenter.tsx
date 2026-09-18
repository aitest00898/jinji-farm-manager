import { useEffect, useMemo, useState } from "react";
import { type ApiClient, type OperationalEnvironment } from "./api";

type AnyRecord = Record<string, unknown>;

interface DomainCandidate {
  auditId: string;
  action: string;
  entityType: string;
  targetId: string;
  createdAt: string;
  before?: AnyRecord | null;
  after?: AnyRecord | null;
  groupId?: string;
  disposition?: "REVERT" | "PRESERVE" | "NOT_RECOVERABLE";
}

interface FinanceCandidate {
  auditId: string;
  targetType: "farm_investor_equity" | "profit_distribution";
  targetId: string;
  createdAt: string;
  action: string;
  recoverable: boolean;
}

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}
function records(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}
function text(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
function json(value: unknown): string {
  try { return JSON.stringify(value ?? null, null, 2); } catch { return String(value); }
}
function clientOperationId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
function recovery(payload: AnyRecord): AnyRecord {
  return record(payload.recovery);
}
function statusTone(value: unknown): string {
  const normalized = String(value ?? "");
  if (["ELIGIBLE","APPLIED","PRESERVED"].includes(normalized)) return "good";
  if (["DENIED","BLOCKED","FAILED","STALE_STATE"].includes(normalized)) return "warn";
  return "neutral";
}

export function RecoveryCenter({ client }: { client: ApiClient }) {
  const [environment, setEnvironment] = useState<OperationalEnvironment>("test");
  const [tab, setTab] = useState<"single" | "batch" | "pit" | "finance">("single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [candidates, setCandidates] = useState<DomainCandidate[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const selectedCandidate = useMemo(() => candidates.find((candidate) => candidate.auditId === selectedAuditId) ?? null, [candidates, selectedAuditId]);
  const [reason, setReason] = useState("");
  const [singleRequest, setSingleRequest] = useState<AnyRecord | null>(null);
  const [singlePlan, setSinglePlan] = useState<AnyRecord | null>(null);
  const [singleApply, setSingleApply] = useState<AnyRecord | null>(null);
  const [singleConfirm, setSingleConfirm] = useState(false);

  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchRequests, setBatchRequests] = useState<AnyRecord[]>([]);
  const [batchPlan, setBatchPlan] = useState<AnyRecord | null>(null);
  const [batchApply, setBatchApply] = useState<AnyRecord | null>(null);
  const [batchConfirm, setBatchConfirm] = useState(false);

  const [pitTargetTime, setPitTargetTime] = useState("");
  const [pitCandidates, setPitCandidates] = useState<DomainCandidate[]>([]);
  const [pitDecisions, setPitDecisions] = useState<Record<string, "REVERT" | "PRESERVE">>({});
  const [pitPlan, setPitPlan] = useState<AnyRecord | null>(null);
  const [pitApply, setPitApply] = useState<AnyRecord | null>(null);
  const [pitConfirm, setPitConfirm] = useState(false);

  const [financeCandidates, setFinanceCandidates] = useState<FinanceCandidate[]>([]);
  const [financeAuditId, setFinanceAuditId] = useState("");
  const selectedFinance = useMemo(() => financeCandidates.find((candidate) => candidate.auditId === financeAuditId) ?? null, [financeCandidates, financeAuditId]);
  const [financeReason, setFinanceReason] = useState("");
  const [financeRequest, setFinanceRequest] = useState<AnyRecord | null>(null);
  const [financePlan, setFinancePlan] = useState<AnyRecord | null>(null);
  const [financeApply, setFinanceApply] = useState<AnyRecord | null>(null);
  const [financeConfirm, setFinanceConfirm] = useState(false);

  async function execute<T>(work: () => Promise<T>): Promise<T | null> {
    setBusy(true); setError(""); setNotice("");
    try { return await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Recovery 操作失敗。"); return null; }
    finally { setBusy(false); }
  }

  async function discoverDomain() {
    const payload = await execute(() => client.discoverDomainRecovery({ limit: 50 }, environment));
    if (!payload) return;
    const result = recovery(payload);
    const values = records(result.candidates) as unknown as DomainCandidate[];
    setCandidates(values);
    setSelectedAuditId(values[0]?.auditId ?? "");
    setBatchSelected([]);
    setSingleRequest(null); setSinglePlan(null); setSingleApply(null); setSingleConfirm(false);
    setBatchRequests([]); setBatchPlan(null); setBatchApply(null); setBatchConfirm(false);
    setNotice(`已由 server 讀回 ${values.length} 個 ${environment} recovery candidates。`);
  }

  useEffect(() => {
    setCandidates([]); setSelectedAuditId(""); setBatchSelected([]);
    setSingleRequest(null); setSinglePlan(null); setSingleApply(null); setSingleConfirm(false);
    setBatchRequests([]); setBatchPlan(null); setBatchApply(null); setBatchConfirm(false);
    setPitCandidates([]); setPitDecisions({}); setPitPlan(null); setPitApply(null); setPitConfirm(false);
    setFinanceCandidates([]); setFinanceAuditId(""); setFinanceRequest(null); setFinancePlan(null); setFinanceApply(null); setFinanceConfirm(false);
    setReason(""); setFinanceReason(""); setError(""); setNotice("");
  }, [environment]);

  async function dryRunSingle() {
    if (!selectedCandidate || !reason.trim()) return;
    const request = {
      auditId: selectedCandidate.auditId,
      entityType: selectedCandidate.entityType,
      targetId: selectedCandidate.targetId,
      clientOperationId: clientOperationId("web-domain-recovery"),
      reason: reason.trim(),
    };
    const payload = await execute(() => client.dryRunDomainRecovery(request, environment));
    if (!payload) return;
    setSingleRequest(request);
    setSinglePlan(recovery(payload));
    setSingleApply(null);
    setSingleConfirm(false);
  }

  async function applySingle() {
    if (!singleRequest || !singlePlan || !singleConfirm) return;
    const stateFingerprint = text(singlePlan.stateFingerprint, "");
    const dryRunToken = text(singlePlan.dryRunToken, "");
    if (!stateFingerprint || !dryRunToken) { setError("Dry Run 缺少 server fingerprint/token，沒有套用。"); return; }
    const payload = await execute(() => client.applyDomainRecovery({
      ...singleRequest,
      stateFingerprint,
      dryRunToken,
      confirm: true,
      previewAcknowledged: true,
    }, environment));
    if (!payload) return;
    setSingleApply(recovery(payload));
    setSingleConfirm(false);
    setNotice("單筆 Recovery 已完成 server authoritative readback。");
    await discoverDomain();
  }

  function toggleBatch(auditId: string) {
    setBatchSelected((current) => current.includes(auditId) ? current.filter((id) => id !== auditId) : current.length >= 20 ? current : [...current, auditId]);
    setBatchPlan(null); setBatchApply(null); setBatchConfirm(false);
  }

  async function dryRunBatch() {
    if (!reason.trim() || !batchSelected.length) return;
    const requests = batchSelected.map((auditId) => {
      const candidate = candidates.find((item) => item.auditId === auditId);
      if (!candidate) return null;
      return {
        auditId: candidate.auditId,
        entityType: candidate.entityType,
        targetId: candidate.targetId,
        clientOperationId: clientOperationId("web-domain-batch"),
        reason: reason.trim(),
      };
    }).filter((value): value is AnyRecord => Boolean(value));
    const payload = await execute(() => client.dryRunDomainRecoveryBatch({ targets: requests }, environment));
    if (!payload) return;
    setBatchRequests(requests);
    setBatchPlan(recovery(payload));
    setBatchApply(null); setBatchConfirm(false);
  }

  async function applyBatch() {
    if (!batchPlan || !batchConfirm) return;
    const groups = records(batchPlan.groups).map((group) => {
      const targetPlans = records(group.targets);
      const targets = targetPlans.map((plan) => {
        const audit = record(plan.audit);
        const base = batchRequests.find((request) => request.auditId === audit.id);
        if (!base) return null;
        return {
          ...base,
          stateFingerprint: text(plan.stateFingerprint, ""),
          dryRunToken: text(plan.dryRunToken, ""),
          confirm: true,
          previewAcknowledged: true,
        };
      }).filter((value): value is AnyRecord => Boolean(value));
      return {
        groupId: text(group.groupId, ""),
        stateFingerprint: text(group.stateFingerprint, ""),
        dryRunToken: text(group.dryRunToken, ""),
        targets,
      };
    }).filter((group) => group.groupId && group.stateFingerprint && group.dryRunToken && group.targets.length);
    if (!groups.length) { setError("Batch Dry Run 沒有可套用的 dependency group。"); return; }
    const payload = await execute(() => client.applyDomainRecoveryBatch({ groups }, environment));
    if (!payload) return;
    setBatchApply(recovery(payload)); setBatchConfirm(false);
    setNotice("Batch Recovery 已完成；結果以下方 authoritative readback 為準。");
    await discoverDomain();
  }

  async function discoverPit() {
    if (!pitTargetTime) return;
    const targetTime = new Date(pitTargetTime).toISOString();
    const payload = await execute(() => client.discoverDomainPointInTimeRecovery({ targetTime }, environment));
    if (!payload) return;
    const result = recovery(payload);
    const values = records(result.candidates) as unknown as DomainCandidate[];
    const initial: Record<string, "REVERT" | "PRESERVE"> = {};
    values.forEach((candidate) => { initial[candidate.auditId] = candidate.disposition === "REVERT" ? "REVERT" : "PRESERVE"; });
    setPitCandidates(values); setPitDecisions(initial); setPitPlan(null); setPitApply(null); setPitConfirm(false);
  }

  async function dryRunPit() {
    if (!pitTargetTime || !pitCandidates.length) return;
    const targetTime = new Date(pitTargetTime).toISOString();
    const selections = pitCandidates.map((candidate) => ({ auditId: candidate.auditId, decision: pitDecisions[candidate.auditId] ?? "PRESERVE" }));
    const payload = await execute(() => client.dryRunDomainPointInTimeRecovery({ targetTime, selections }, environment));
    if (!payload) return;
    setPitPlan(recovery(payload)); setPitApply(null); setPitConfirm(false);
  }

  async function applyPit() {
    if (!pitPlan || !pitConfirm) return;
    const targetTime = text(pitPlan.targetTime, new Date(pitTargetTime).toISOString());
    const planGroups = records(pitPlan.groups);
    const groups = planGroups.map((group) => {
      const candidateIds = Array.isArray(group.candidateIds) ? group.candidateIds.map(String) : [];
      const selections = candidateIds.map((auditId) => ({ auditId, decision: pitDecisions[auditId] ?? "PRESERVE" }));
      return {
        groupId: text(group.groupId, ""),
        targetTime,
        selections,
        stateFingerprint: text(group.stateFingerprint, ""),
        dryRunToken: text(group.dryRunToken, ""),
        clientOperationId: clientOperationId("web-pit-recovery"),
      };
    }).filter((group) => group.groupId && group.stateFingerprint && group.dryRunToken);
    const payload = await execute(() => client.applyDomainPointInTimeRecovery({ groups }, environment));
    if (!payload) return;
    setPitApply(recovery(payload)); setPitConfirm(false);
    setNotice("Selective PIT Recovery 已完成；結果以下方 server readback 為準。");
    await discoverDomain();
  }

  async function discoverFinance() {
    const payload = await execute(() => client.discoverFinanceRecovery({}, environment));
    if (!payload) return;
    const result = recovery(payload);
    const values = records(result.candidates) as unknown as FinanceCandidate[];
    setFinanceCandidates(values);
    setFinanceAuditId(values.find((candidate) => candidate.recoverable)?.auditId ?? values[0]?.auditId ?? "");
    setFinanceRequest(null); setFinancePlan(null); setFinanceApply(null); setFinanceConfirm(false);
  }

  async function dryRunFinance() {
    if (!selectedFinance || !selectedFinance.recoverable || !financeReason.trim()) return;
    const request = {
      auditId: selectedFinance.auditId,
      targetType: selectedFinance.targetType,
      targetId: selectedFinance.targetId,
      clientOperationId: clientOperationId("web-finance-recovery"),
      reason: financeReason.trim(),
    };
    const payload = await execute(() => client.dryRunFinanceRecovery(request, environment));
    if (!payload) return;
    setFinanceRequest(request); setFinancePlan(recovery(payload)); setFinanceApply(null); setFinanceConfirm(false);
  }

  async function applyFinancePlan() {
    if (!financeRequest || !financePlan || !financeConfirm) return;
    const payload = await execute(() => client.applyFinanceRecovery({
      ...financeRequest,
      stateFingerprint: text(financePlan.stateFingerprint, ""),
      dryRunToken: text(financePlan.dryRunToken, ""),
    }, environment));
    if (!payload) return;
    setFinanceApply(recovery(payload)); setFinanceConfirm(false);
    setNotice("Finance Recovery 已完成 authoritative readback。");
    await discoverFinance();
  }

  const renderPlan = (plan: AnyRecord | null, applyResult: AnyRecord | null) => {
    if (!plan && !applyResult) return null;
    return <div className="two-col">
      {plan && <section className="panel">
        <div className="panel-title"><h3>Server Dry Run</h3><span className={`pill ${statusTone(plan.applyEligibility)}`}>{text(plan.applyEligibility)}</span></div>
        <div className="setting-row"><span>Dependency impact</span><strong>{text(plan.dependencyImpact)}</strong></div>
        <div className="setting-row"><span>State fingerprint</span><code>{text(plan.stateFingerprint).slice(0, 16)}…</code></div>
        <div className="setting-row"><span>Conflicts</span><strong>{Array.isArray(plan.conflicts) ? plan.conflicts.length : 0}</strong></div>
        <details><summary>查看 current / proposedAfter</summary><pre>{json({ current: plan.current, proposedAfter: plan.proposedAfter, dependencies: plan.dependencies, conflicts: plan.conflicts })}</pre></details>
      </section>}
      {applyResult && <section className="panel">
        <div className="panel-title"><h3>Authoritative readback</h3><span className={`pill ${statusTone(applyResult.status ?? (applyResult.applied ? "APPLIED" : "BLOCKED"))}`}>{text(applyResult.status ?? (applyResult.applied ? "APPLIED" : "NOT_APPLIED"))}</span></div>
        <pre>{json(applyResult.authoritativeReadback ?? applyResult.groups ?? applyResult)}</pre>
      </section>}
    </div>;
  };

  return <section className="page">
    <div className="hero"><div><span className="hero-kicker">ADMIN · Canonical recovery</span><h2>Recovery 中心</h2><p>所有變更都先 Discover / Dry Run，再二次確認 Apply；不以 client 推算結果取代 server readback。</p></div></div>
    <div className="notice"><strong>安全邊界</strong><p>Recovery 不刪除原 Audit。Batch 與 PIT 依 dependency group 原子處理；任何 stale state、conflict 或 server denial 都必須停止套用。</p></div>

    <div className="filter-grid">
      <label>資料 scope<select value={environment} onChange={(event) => setEnvironment(event.target.value as OperationalEnvironment)}><option value="test">Test</option><option value="production">Production</option></select></label>
      <label>模式<select value={tab} onChange={(event) => setTab(event.target.value as typeof tab)}><option value="single">單筆 Domain</option><option value="batch">批次 Domain</option><option value="pit">Selective PIT</option><option value="finance">Finance</option></select></label>
    </div>

    {(tab === "single" || tab === "batch") && <section className="panel">
      <div className="panel-title"><h3>Domain candidates</h3><button disabled={busy} onClick={() => void discoverDomain()}>重新 Discover</button></div>
      <label>Recovery 原因<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="必填；會進入 Audit" /></label>
      {!candidates.length ? <p className="muted">先執行 Discover。</p> :
        <div className="sheet-item-list">{candidates.map((candidate) => <label className="recovery-candidate-row" key={candidate.auditId}>
          {tab === "batch"
            ? <input type="checkbox" checked={batchSelected.includes(candidate.auditId)} onChange={() => toggleBatch(candidate.auditId)} />
            : <input type="radio" name="domain-recovery" checked={selectedAuditId === candidate.auditId} onChange={() => { setSelectedAuditId(candidate.auditId); setSinglePlan(null); setSingleApply(null); }} />}
          <span><strong>{candidate.entityType} · {candidate.action}</strong><br /><small>{candidate.createdAt} · target {candidate.targetId}</small></span>
        </label>)}</div>}
    </section>}

    {tab === "single" && <>
      <div className="button-row"><button className="primary" disabled={busy || !selectedCandidate || !reason.trim()} onClick={() => void dryRunSingle()}>執行 Dry Run</button></div>
      {singlePlan && <section className="panel">
        <label className="checkbox-row"><input type="checkbox" checked={singleConfirm} onChange={(event) => setSingleConfirm(event.target.checked)} />我已檢查 Dry Run、dependency impact、conflicts 與 proposedAfter。</label>
        <button className="danger-action" disabled={busy || !singleConfirm || singlePlan.applyEligibility !== "ELIGIBLE"} onClick={() => void applySingle()}>確認套用並讀回</button>
      </section>}
      {renderPlan(singlePlan, singleApply)}
    </>}

    {tab === "batch" && <>
      <div className="button-row"><button className="primary" disabled={busy || !batchSelected.length || !reason.trim()} onClick={() => void dryRunBatch()}>Batch Dry Run（{batchSelected.length}/20）</button></div>
      {batchPlan && <section className="panel">
        <div className="setting-row"><span>dependency groups</span><strong>{text(batchPlan.groupCount)}</strong></div>
        <div className="setting-row"><span>targets</span><strong>{text(batchPlan.targetCount)}</strong></div>
        <details><summary>查看所有 group 計畫</summary><pre>{json(batchPlan.groups)}</pre></details>
        <label className="checkbox-row"><input type="checkbox" checked={batchConfirm} onChange={(event) => setBatchConfirm(event.target.checked)} />我已檢查所有 dependency group 與 blocked/conflict 狀態。</label>
        <button className="danger-action" disabled={busy || !batchConfirm || records(batchPlan.groups).some((group) => group.applyEligibility !== "ELIGIBLE")} onClick={() => void applyBatch()}>確認批次套用並讀回</button>
      </section>}
      {batchApply && <section className="panel"><PanelTitle title="Batch authoritative readback" /><pre>{json(batchApply)}</pre></section>}
    </>}

    {tab === "pit" && <>
      <section className="panel">
        <PanelTitle title="Selective Point-in-Time Recovery" />
        <label>Target time<input type="datetime-local" value={pitTargetTime} onChange={(event) => setPitTargetTime(event.target.value)} /></label>
        <button disabled={busy || !pitTargetTime} onClick={() => void discoverPit()}>Discover target time 之後的 candidates</button>
        {pitCandidates.map((candidate) => <div className="setting-row" key={candidate.auditId}>
          <span><strong>{candidate.entityType}</strong><br /><small>{candidate.createdAt} · {candidate.action}</small></span>
          <select value={pitDecisions[candidate.auditId] ?? "PRESERVE"} disabled={candidate.disposition === "NOT_RECOVERABLE"} onChange={(event) => setPitDecisions((current) => ({ ...current, [candidate.auditId]: event.target.value as "REVERT" | "PRESERVE" }))}>
            <option value="PRESERVE">PRESERVE</option><option value="REVERT">REVERT</option>
          </select>
        </div>)}
        <button className="primary" disabled={busy || !pitCandidates.length} onClick={() => void dryRunPit()}>PIT Dry Run</button>
      </section>
      {pitPlan && <section className="panel">
        <div className="setting-row"><span>groups</span><strong>{text(pitPlan.groupCount)}</strong></div>
        <details><summary>查看 PIT group plans</summary><pre>{json(pitPlan.groups)}</pre></details>
        <label className="checkbox-row"><input type="checkbox" checked={pitConfirm} onChange={(event) => setPitConfirm(event.target.checked)} />我已逐組檢查 REVERT/PRESERVE、stale-state fingerprint 與 conflicts。</label>
        <button className="danger-action" disabled={busy || !pitConfirm || records(pitPlan.groups).some((group) => group.applyEligibility !== "ELIGIBLE")} onClick={() => void applyPit()}>確認 PIT 套用並讀回</button>
      </section>}
      {pitApply && <section className="panel"><PanelTitle title="PIT authoritative readback" /><pre>{json(pitApply)}</pre></section>}
    </>}

    {tab === "finance" && <>
      <section className="panel">
        <div className="panel-title"><h3>Finance Recovery</h3><button disabled={busy} onClick={() => void discoverFinance()}>Discover</button></div>
        <label>候選<select value={financeAuditId} onChange={(event) => { setFinanceAuditId(event.target.value); setFinancePlan(null); setFinanceApply(null); }}>
          <option value="">請選擇</option>{financeCandidates.map((candidate) => <option key={candidate.auditId} value={candidate.auditId}>{candidate.targetType} · {candidate.action} · {candidate.targetId}{candidate.recoverable ? "" : "（不可恢復）"}</option>)}
        </select></label>
        <label>Recovery 原因<input value={financeReason} onChange={(event) => setFinanceReason(event.target.value)} /></label>
        <button className="primary" disabled={busy || !selectedFinance?.recoverable || !financeReason.trim()} onClick={() => void dryRunFinance()}>Finance Dry Run</button>
      </section>
      {financePlan && <section className="panel">
        <div className="setting-row"><span>Eligibility</span><strong>{text(financePlan.applyEligibility)}</strong></div>
        <div className="setting-row"><span>Dependency impact</span><strong>{text(record(financePlan.dependencyImpact).kind)}</strong></div>
        <details><summary>查看 before / current / proposed / derived</summary><pre>{json({ before: financePlan.before, current: financePlan.current, proposedAfter: financePlan.proposedAfter, derivedBefore: financePlan.derivedBefore, derivedAfter: financePlan.derivedAfter, conflicts: financePlan.conflicts })}</pre></details>
        <label className="checkbox-row"><input type="checkbox" checked={financeConfirm} onChange={(event) => setFinanceConfirm(event.target.checked)} />我已確認財務 before/after、dependency 與 derived totals。</label>
        <button className="danger-action" disabled={busy || !financeConfirm || financePlan.applyEligibility !== "ELIGIBLE"} onClick={() => void applyFinancePlan()}>確認 Finance 套用並讀回</button>
      </section>}
      {financeApply && <section className="panel"><PanelTitle title="Finance authoritative readback" /><pre>{json(financeApply.authoritativeReadback ?? financeApply)}</pre></section>}
    </>}

    {notice && <p className="success-text" role="status">{notice}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}

function PanelTitle({ title }: { title: string }) {
  return <div className="panel-title"><h3>{title}</h3></div>;
}
