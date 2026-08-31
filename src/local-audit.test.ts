import { afterEach, describe, expect, it } from "vitest";
import { getLocalAuditStateSnapshot, localAuditRequest, LOCAL_AUDIT_PASSWORD, resetLocalAuditState } from "./local-audit";

describe("local external audit fixture", () => {
  afterEach(() => resetLocalAuditState());

  it("has five distinct synthetic farms, six caretakers, and no production identifiers", () => {
    const state = getLocalAuditStateSnapshot();
    expect(state.farms).toHaveLength(5);
    expect(new Set(state.farms.map((farm) => farm.id)).size).toBe(5);
    expect(state.caretakers).toHaveLength(6);
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
    expect(serialized).not.toContain("chicken-line-production.jinji-assistant.workers.dev");
    expect(serialized).not.toContain("金雞測試場");
    expect(serialized).not.toContain("TEST-BATCH-001");
  });

  it("keeps stock and finance arithmetic deterministic at the fixed anchor", () => {
    const state = getLocalAuditStateSnapshot();
    const corrected = new Set(state.events.flatMap((event) => event.correctionOfEventId ? [event.correctionOfEventId] : []));
    const effective = state.events.filter((event) => !event.reversedAt && !corrected.has(event.id));
    const expectedStock = state.flocks.filter((flock) => flock.status === "active").reduce((total, flock) => total + Math.max(0, flock.initialCount - effective.filter((event) => event.flockId === flock.id && ["mortality", "cull", "shipment"].includes(event.intent)).reduce((sum, event) => sum + event.quantity, 0)), 0);
    expect(expectedStock).toBe(5954);
    expect(state.finance.totals.allocated).toBe(state.finance.distributions.reduce((sum, row) => sum + Number(row.allocatedProfitLoss), 0));
    expect(state.finance.totals.expense).toBe(state.finance.distributions.reduce((sum, row) => sum + Number(row.expense), 0));
    expect(state.finance.totals.net).toBe(state.finance.distributions.reduce((sum, row) => sum + Number(row.netIncome), 0));
  });

  it("requires only the virtual login and returns deterministic read data", async () => {
    await expect(localAuditRequest("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: "wrong" }) })).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    const login = await localAuditRequest<{ authenticated: boolean; token: string }>("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password: LOCAL_AUDIT_PASSWORD }) });
    expect(login.authenticated).toBe(true);
    expect(login.token).toBe("synthetic-audit-session");
    const dashboard = await localAuditRequest<{ asOf: string; stock: number; counts: { farms: number; activeFlocks: number } }>("/api/dashboard");
    expect(dashboard).toMatchObject({ asOf: "2026-08-31", stock: 5954, counts: { farms: 5, activeFlocks: 6 } });
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
});
