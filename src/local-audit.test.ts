import { afterEach, describe, expect, it } from "vitest";
import type { TimelineItem, WeatherDaily } from "./api";
import { auditToday, getLocalAuditStateSnapshot, localAuditRequest, LOCAL_AUDIT_PASSWORD, resetLocalAuditState, validateFixtureGraphs, validateSyntheticFinance } from "./local-audit";

describe("local external audit fixture", () => {
  afterEach(() => resetLocalAuditState());

  it("has five distinct synthetic farms, six caretakers, and no production identifiers", () => {
    const state = getLocalAuditStateSnapshot();
    expect(state.farms).toHaveLength(5);
    expect(new Set(state.farms.map((farm) => farm.id)).size).toBe(5);
    expect(state.caretakers).toHaveLength(6);
    expect(state.events).toHaveLength(30);
    expect(state.abnormalEvents).toHaveLength(11);
    expect(state.weather).toHaveLength(5);
    expect(state.weather.every((row) => row.weatherScope === "area" && row.farmId === null)).toBe(true);
    expect(state.caretakers.every((caretaker) => caretaker.active)).toBe(true);
    const currentPrimaryAssignments = state.caretakers.flatMap((caretaker) => caretaker.assignments ?? []).filter((assignment) => assignment.isPrimary && !assignment.effectiveTo);
    expect(currentPrimaryAssignments).toHaveLength(5);
    expect(new Set(currentPrimaryAssignments.map((assignment) => assignment.farmId)).size).toBe(5);
    expect(state.farms.every((farm) => currentPrimaryAssignments.some((assignment) => assignment.farmId === farm.id))).toBe(true);
    expect(new Set(state.farms.map((farm) => state.flocks.find((flock) => flock.farmId === farm.id)?.breed)).size).toBe(5);
    expect(new Set(state.flocks.map((flock) => flock.initialCount)).size).toBe(state.flocks.length);
    expect(state.events.every((event) => event.source === "local_audit")).toBe(true);
    expect(new Set(state.abnormalEvents.map((event) => event.category)).size).toBeGreaterThanOrEqual(5);
    expect([...state.farms, ...state.houses, ...state.flocks, ...state.caretakers].every((item) => item.id.startsWith("synthetic-audit-"))).toBe(true);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("workers.dev");
    expect(serialized).not.toContain("remote-production-farm-marker");
    expect(serialized).not.toContain("remote-production-batch-marker");
  });

  it("keeps stock and finance arithmetic deterministic at the fixed anchor", () => {
    const state = getLocalAuditStateSnapshot();
    const corrected = new Set(state.events.flatMap((event) => event.correctionOfEventId ? [event.correctionOfEventId] : []));
    const effective = state.events.filter((event) => !event.reversedAt && !corrected.has(event.id));
    const expectedStock = state.flocks.filter((flock) => flock.status === "active").reduce((total, flock) => total + Math.max(0, flock.initialCount - effective.filter((event) => event.flockId === flock.id && ["mortality", "cull", "shipment"].includes(event.intent)).reduce((sum, event) => sum + event.quantity, 0)), 0);
    expect(expectedStock).toBe(5846);
    expect(state.finance.totals.allocated).toBe(state.finance.distributions.reduce((sum, row) => sum + Number(row.allocatedProfitLoss), 0));
    expect(state.finance.totals.expense).toBe(state.finance.distributions.reduce((sum, row) => sum + Number(row.expense), 0));
    expect(state.finance.totals.net).toBe(state.finance.distributions.reduce((sum, row) => sum + Number(row.netIncome), 0));
    expect(validateSyntheticFinance(state)).toMatchObject({ arithmetic: true, domain: true, pass: true });
    expect(validateFixtureGraphs(state).pass).toBe(true);
  });

  it("requires only the virtual login and returns deterministic read data", async () => {
    await expect(localAuditRequest("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: "wrong" }) })).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    const login = await localAuditRequest<{ authenticated: boolean; token: string }>("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: LOCAL_AUDIT_PASSWORD }) });
    expect(login.authenticated).toBe(true);
    expect(login.token).toBe("synthetic-audit-session");
    const dashboard = await localAuditRequest<{ asOf: string; stock: number; counts: { farms: number; activeFlocks: number } }>("/api/dashboard");
    expect(dashboard).toMatchObject({ asOf: auditToday(), stock: 5846, counts: { farms: 5, activeFlocks: 6 } });
    const ai = await localAuditRequest<{ result: { model: string; report: { limitations: string[] } }; readOnly: boolean }>("/api/ai/analyze", { method: "POST", body: JSON.stringify({ question: "這一批最近有哪些異常？" }) });
    expect(ai.readOnly).toBe(true);
    expect(ai.result.model).toBe("synthetic-audit-fixture");
    expect(ai.result.report.limitations.join(" ")).toContain("沒有呼叫 Workers AI");
  });

  it("supports memory-only mutation, audit transition, and reset", async () => {
    await localAuditRequest("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: LOCAL_AUDIT_PASSWORD }) });
    const before = await localAuditRequest<{ caretakers: Array<{ id: string }> }>("/api/caretakers?history=1");
    const created = await localAuditRequest<{ caretaker: { id: string; name: string } }>("/api/caretakers", { method: "POST", body: JSON.stringify({ name: "本地新增飼養者" }) });
    const after = await localAuditRequest<{ caretakers: Array<{ id: string; name: string }> }>("/api/caretakers?history=1");
    const audit = await localAuditRequest<{ auditLogs: Array<{ action: string }> }>("/api/audit");
    expect(after.caretakers).toHaveLength(before.caretakers.length + 1);
    expect(after.caretakers.some((caretaker) => caretaker.id === created.caretaker.id && caretaker.name === "本地新增飼養者")).toBe(true);
    expect(audit.auditLogs.some((row) => row.action === "caretaker_created")).toBe(true);
    resetLocalAuditState();
    expect(getLocalAuditStateSnapshot().caretakers).toHaveLength(6);
  });

  it("matches Production chart ranges, granularity, filters, and historical stock semantics", async () => {
    await localAuditRequest("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: LOCAL_AUDIT_PASSWORD }) });
    const requestChart = (metric: string, params: Record<string, string>) => localAuditRequest<{ series: Array<{ date: string; value: number }>; status: string; denominator?: number }>(`/api/charts/${metric}?${new URLSearchParams(params)}`);
    await expect(requestChart("mortality", { from: "2026-08-25", to: "2026-08-31", granularity: "daily" })).resolves.toMatchObject({ series: expect.arrayContaining([expect.objectContaining({ date: "2026-08-31", value: 4 })]) });
    const seven = await requestChart("mortality", { from: "2026-08-25", to: auditToday(), granularity: "daily" });
    const thirty = await requestChart("mortality", { from: "2026-08-02", to: auditToday(), granularity: "daily" });
    const ninety = await requestChart("mortality", { from: "2026-06-03", to: auditToday(), granularity: "daily" });
    const all = await requestChart("mortality", { from: "2020-01-01", to: auditToday(), granularity: "daily" });
    expect(seven.series).toHaveLength(7);
    expect(thirty.series).toHaveLength(30);
    expect(ninety.series).toHaveLength(90);
    expect(all.series.length).toBeGreaterThan(1000);
    expect(all.series.length).toBeLessThanOrEqual(2000);
    expect((await requestChart("mortality", { from: "2026-08-25", to: auditToday(), granularity: "weekly" })).series).toHaveLength(2);
    expect((await requestChart("mortality", { from: "2026-08-25", to: auditToday(), granularity: "monthly" })).series).toHaveLength(1);
    const caretaker = await requestChart("mortality", { from: "2026-08-25", to: auditToday(), granularity: "daily", caretakerId: "synthetic-audit-caretaker-a" });
    const unfiltered = await requestChart("mortality", { from: "2026-08-25", to: auditToday(), granularity: "daily" });
    expect(caretaker.series.reduce((sum, point) => sum + point.value, 0)).toBeLessThan(unfiltered.series.reduce((sum, point) => sum + point.value, 0));
    const stock = await requestChart("stock", { from: "2026-07-01", to: auditToday(), granularity: "daily" });
    expect(stock.series[0].value).not.toBe(stock.series[stock.series.length - 1].value);
    expect(stock.series.at(-1)?.value).toBe(5846);
  });

  it("matches area weather, finance date ranges, and strict failure behavior", async () => {
    await localAuditRequest("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: LOCAL_AUDIT_PASSWORD }) });
    const weather = await localAuditRequest<{ weather: WeatherDaily[] }>("/api/weather?farmId=synthetic-audit-farm-red-01");
    expect(weather.weather).toHaveLength(5);
    expect(weather.weather.every((row) => row.farmId === null && row.weatherScope === "area")).toBe(true);
    const timeline = await localAuditRequest<{ timeline: TimelineItem[] }>("/api/timeline?limit=100");
    expect(timeline.timeline.filter((row) => row.occurredDate === "2026-08-29").every((row) => row.weatherStatus === "captured" || row.weatherStatus === "backfilled")).toBe(true);
    const finance = await localAuditRequest<{ series: Array<{ date: string; value: number }> }>("/api/charts/portfolio-net?from=2026-08-01&to=2026-08-31&granularity=daily");
    expect(finance.series.filter((point) => point.value !== 0)).toHaveLength(3);
    await expect(localAuditRequest("/api/charts/farm-profit?from=2026-08-01&to=2026-08-31")).rejects.toMatchObject({ status: 400, code: "farm_required" });
  });

  it("keeps operational and abnormal correction/reversal graphs valid after memory-only mutations", async () => {
    await localAuditRequest("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: LOCAL_AUDIT_PASSWORD }) });
    await localAuditRequest("/api/operational-events/synthetic-audit-event-003/correct", { method: "POST", body: JSON.stringify({ quantity: 250, reason: "本地圖結構測試" }) });
    await localAuditRequest("/api/abnormal-events/synthetic-audit-abnormal-001/reverse", { method: "POST", body: JSON.stringify({ reason: "本地反轉圖測試" }) });
    const graph = validateFixtureGraphs(getLocalAuditStateSnapshot());
    expect(graph.pass).toBe(true);
    expect(graph.operational.correctionsChecked).toBeGreaterThan(1);
    expect(graph.abnormal.reversalsChecked).toBeGreaterThan(1);
  });

  it("covers the 33 semantic Web operations without leaving memory-only state behind", async () => {
    const completed: string[] = [];
    const json = (value: Record<string, unknown>): RequestInit => ({ method: "POST", body: JSON.stringify(value) });
    const call = async <T>(operation: string, path: string, init?: RequestInit): Promise<T> => {
      const result = await localAuditRequest<T>(path, init);
      completed.push(operation);
      return result;
    };

    await call("W01", "/api/web/auth/login", json({ password: LOCAL_AUDIT_PASSWORD }));
    await call("W02", "/api/dashboard");
    await call("W03", "/api/charts/mortality?from=2026-08-25&to=2026-08-31&granularity=daily&farmId=synthetic-audit-farm-red-01");
    await call("W04", "/api/operational-events?limit=1");
    await call("W05", "/api/audit?limit=1");
    await call("W06", "/api/abnormal-events?limit=1");
    await call("W07", "/api/pending-candidates?page=0&pageSize=1");
    await call("W08", "/api/ambient/preview?page=0&pageSize=1");
    await call("W09", "/api/ai/analyze", json({ question: "這一批最近有哪些異常？" }));

    const farm = await call<{ farm: { id: string } }>("W11", "/api/farms", json({ name: "操作覆蓋虛擬場", environment: "test", structureMode: "multi_house" }));
    await call("W12", `/api/farms/${farm.farm.id}`, { method: "PATCH", body: JSON.stringify({ note: "操作覆蓋備註" }) });
    await call("W13", `/api/farms/${farm.farm.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    await call("W13", `/api/farms/${farm.farm.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });

    const caretaker = await call<{ caretaker: { id: string } }>("W14", "/api/caretakers", json({ name: "操作覆蓋虛擬飼養者" }));
    await call("W15", `/api/caretakers/${caretaker.caretaker.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    await call("W15", `/api/caretakers/${caretaker.caretaker.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
    await call("W16", `/api/farms/${farm.farm.id}/caretakers`, json({ caretakerId: caretaker.caretaker.id, effectiveFrom: auditToday(), isPrimary: true }));

    const house = await call<{ house: { id: string } }>("W17", "/api/houses", json({ farmId: farm.farm.id, name: "操作覆蓋主舍", capacity: 500 }));
    await call("W18", `/api/houses/${house.house.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    await call("W18", `/api/houses/${house.house.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });

    const flock = await call<{ flock: { id: string } }>("W19", "/api/flocks", json({ farmId: farm.farm.id, houseId: house.house.id, batchCode: "AUDIT-OPERATION-BATCH", chickInDate: "2026-08-30", initialCount: 500 }));
    await call("W20", `/api/flocks/${flock.flock.id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });

    const createdEvent = await call<{ event: { id: string } }>("W21", "/api/operational-events", json({ farmId: farm.farm.id, houseId: house.house.id, flockId: flock.flock.id, intent: "mortality", quantity: 2, unit: "隻", eventDate: auditToday() }));
    const reversedEvent = await call<{ event: { id: string } }>("W21", "/api/operational-events", json({ farmId: farm.farm.id, houseId: house.house.id, flockId: flock.flock.id, intent: "cull", quantity: 1, unit: "隻", eventDate: auditToday() }));
    await call("W22", `/api/operational-events/${reversedEvent.event.id}/reverse`, json({ reason: "覆蓋測試反轉" }));
    await call("W23", `/api/operational-events/${createdEvent.event.id}/correct`, json({ quantity: 3, reason: "覆蓋測試修正" }));

    const createdAbnormal = await call<{ id: string }>("W24", "/api/abnormal-events", json({ farmId: farm.farm.id, houseId: house.house.id, flockId: flock.flock.id, rawText: "操作覆蓋設備異常" }));
    const reversedAbnormal = await call<{ id: string }>("W24", "/api/abnormal-events", json({ farmId: farm.farm.id, houseId: house.house.id, flockId: flock.flock.id, rawText: "操作覆蓋反轉異常" }));
    await call("W25", `/api/abnormal-events/${reversedAbnormal.id}/reverse`, json({ reason: "覆蓋測試反轉異常" }));
    await call("W26", `/api/abnormal-events/${createdAbnormal.id}/correct`, json({ rawText: "操作覆蓋修正異常", reason: "覆蓋測試修正異常" }));

    const reliability = await call<{ events: Array<{ eventId: string }> }>("W08", "/api/reliability/events");
    expect(reliability.events).toHaveLength(4);
    await call("W29", `/api/reliability/events/${reliability.events[0].eventId}/recover`, json({}));
    await call("W27", "/api/reliability/recover", json({}));
    await call("W28", "/api/reliability/acknowledge", json({}));
    await call("W30", `/api/reliability/events/${reliability.events[1].eventId}/resolve`, json({ action: "manual_resolve", reason: "覆蓋測試人工結案", confirm: false }));
    await call("W31", `/api/reliability/events/${reliability.events[2].eventId}/resolve`, json({ action: "force_close", reason: "覆蓋測試強制結案", confirm: false }));
    await call("W32", `/api/reliability/events/${reliability.events[3].eventId}/record`, json({ farmId: farm.farm.id, intent: "mortality", quantity: 1, reason: "覆蓋測試補登" }));

    const groups = await call<{ groups: Array<{ groupId: string; status: string; conversationV2Enabled: boolean }> }>("W33", "/api/line-groups");
    const activeGroup = groups.groups.find((group) => group.status === "active");
    expect(activeGroup).toBeDefined();
    await call("W33", `/api/line-groups/${activeGroup?.groupId}/ai-conversation`, { method: "PATCH", body: JSON.stringify({ enabled: false }) });
    await call("W33", `/api/line-groups/${activeGroup?.groupId}/ai-conversation`, { method: "PATCH", body: JSON.stringify({ enabled: true }) });

    await call("W10", "/api/web/auth/logout", json({}));
    expect(new Set(completed)).toEqual(new Set(Array.from({ length: 33 }, (_, index) => `W${String(index + 1).padStart(2, "0")}`)));
    expect(completed).toHaveLength(41);
  });
});
