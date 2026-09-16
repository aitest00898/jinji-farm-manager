import { describe, expect, it, vi } from "vitest";
import {
  addOperationalEnvironmentFilter,
  claimLineGroupOrganization,
  DEFAULT_OPERATIONAL_ENVIRONMENT,
  isAllowedWebOrigin,
  lineGroupClaimCandidates,
  operationalEnvironmentFor,
  publicFarmPayload,
  sessionAccessClass,
  setLineGroupOperationalAuthorization,
} from "./web-api";
import { auditVisibilityFor } from "./audit-recovery-core";

function authorizationDb(input: {
  organizationId: string | null;
  status: string;
  operationalAuthorized: number;
}) {
  const state = { ...input, auditCount: 0, updateCount: 0, cleanupCount: 0 };
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            sql,
            values,
            async first<T>() {
              if (sql.includes("organization_id AS organizationId")) {
                if (values[0] !== "group-1") return null;
                return {
                  groupId: "group-1",
                  organizationId: state.organizationId,
                  status: state.status,
                  operationalAuthorized: state.operationalAuthorized,
                } as T;
              }
              if (sql.includes("COALESCE(operational_authorized, 0) AS operationalAuthorized")) {
                if (values[0] !== "group-1" || values[1] !== "org-1") return null;
                return {
                  groupId: "group-1",
                  operationalAuthorized: state.operationalAuthorized,
                } as T;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO audit_logs")) state.auditCount += 1;
              if (sql.includes("UPDATE line_groups")) {
                state.operationalAuthorized = Number(values[0]);
                state.updateCount += 1;
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
        async all() {
          return { results: [] };
        },
      };
    },
    async batch(statements: Array<{ sql?: string; values?: unknown[]; run?: () => Promise<unknown> }>) {
      for (const statement of statements) {
        if (statement.sql?.includes("UPDATE line_groups")) {
          state.operationalAuthorized = Number(statement.values?.[0] ?? 0);
          state.updateCount += 1;
        }
        if (statement.sql?.includes("UPDATE pending_actions")
          || statement.sql?.includes("UPDATE test_farm_actions")
          || statement.sql?.includes("UPDATE farm_admin_actions")
          || statement.sql?.includes("UPDATE operational_admin_actions")
          || statement.sql?.includes("UPDATE abnormal_pending_actions")
          || statement.sql?.includes("UPDATE quick_record_sessions")
          || statement.sql?.includes("UPDATE conversation_v2_sessions")) state.cleanupCount += 1;
        if (statement.sql?.includes("INSERT INTO audit_logs")) state.auditCount += 1;
      }
      return [];
    },
    state,
  };
  return db as unknown as D1Database & { state: typeof state };
}

function organizationClaimDb(input: {
  organizationId: string | null;
  status: string;
  exists?: boolean;
}) {
  const state = { ...input, exists: input.exists ?? true, auditCount: 0, updateCount: 0 };
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("SELECT group_id AS groupId, organization_id AS organizationId, status")) {
                if (!state.exists || values[0] !== "group-1") return null;
                return {
                  groupId: "group-1",
                  organizationId: state.organizationId,
                  status: state.status,
                  hasLineEvidence: 1,
                } as T;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO audit_logs")) state.auditCount += 1;
              if (sql.includes("UPDATE line_groups")) {
                const canClaim = state.exists
                  && state.organizationId === null
                  && state.status === "unbound"
                  && values[1] === "group-1";
                if (canClaim) {
                  state.organizationId = String(values[0]);
                  state.updateCount += 1;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
        async all() {
          return { results: [] };
        },
      };
    },
    state,
  };
  return db as unknown as D1Database & { state: typeof state };
}

const adminSession = {
  id: "web-session-1",
  organizationId: "org-1",
  expiresAt: "2099-01-01T00:00:00.000Z",
  revokedAt: null,
};

describe("Web API boundary", () => {
  it("keeps the audit visibility boundary inclusive at 120 days", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    const cutoff = new Date(now.getTime() - 120 * 86_400_000);
    expect(auditVisibilityFor(cutoff.toISOString(), now)).toEqual({ archived: false, visibility: "current" });
    expect(auditVisibilityFor(new Date(cutoff.getTime() - 1).toISOString(), now)).toEqual({ archived: true, visibility: "archived" });
    expect(auditVisibilityFor(new Date(cutoff.getTime() + 1).toISOString(), now)).toEqual({ archived: false, visibility: "current" });
  });

  it("allows only the Pages origin and local Vite origins", () => {
    expect(isAllowedWebOrigin("https://aitest00898.github.io")).toBe(true);
    expect(isAllowedWebOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedWebOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedWebOrigin("https://example.com")).toBe(false);
    expect(isAllowedWebOrigin(null)).toBe(false);
  });

  it("does not permit wildcard origin semantics", () => {
    expect(isAllowedWebOrigin("*")).toBe(false);
    expect(isAllowedWebOrigin("https://aitest00898.github.io.evil.example")).toBe(false);
  });

  it("defaults operational reads to Production and rejects unknown environments", () => {
    expect(DEFAULT_OPERATIONAL_ENVIRONMENT).toBe("production");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events"))).toBe("production");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events?environment=test"))).toBe("test");
    expect(() => operationalEnvironmentFor(new URL("https://example.test/api/events?environment=all"))).toThrow("invalid_operational_environment");
    expect(() => operationalEnvironmentFor(new URL("https://example.test/api/events?environment=staging"))).toThrow("invalid_operational_environment");
  });

  it("adds a bounded farm environment predicate without accepting a free-form SQL value", () => {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    expect(addOperationalEnvironmentFilter(new URL("https://example.test/api/events"), clauses, bindings, "farm")).toBe("production");
    expect(clauses).toEqual(["farm.environment = ?"]);
    expect(bindings).toEqual(["production"]);
  });

  it("preserves the public access class for the unauthenticated read session", () => {
    expect(sessionAccessClass({ accessClass: "PUBLIC" })).toBe("PUBLIC");
    expect(sessionAccessClass({ accessClass: "SHARED_EDIT" })).toBe("SHARED_EDIT");
    expect(sessionAccessClass({ accessClass: undefined })).toBe("ADMIN");
  });

  it("removes finance-derived equity fields from the public farm projection", () => {
    const payload = publicFarmPayload({
      id: "farm-1",
      organizationId: "org-1",
      name: "Production farm",
      siteName: null,
      latitude: null,
      longitude: null,
      active: 1,
      environment: "production",
      structureMode: "whole_farm",
      note: null,
      version: 1,
      playerGroupEquityFraction: 0.25,
      createdAt: "2026-09-15T00:00:00Z",
      updatedAt: "2026-09-15T00:00:00Z",
    });
    expect(payload).not.toHaveProperty("playerGroupEquityFraction");
    expect(payload).not.toHaveProperty("organizationId");
    expect(payload).toMatchObject({ id: "farm-1", environment: "production", active: true });
  });

  it("authorizes one explicit organization-owned group with audit and readback", async () => {
    const db = authorizationDb({ organizationId: "org-1", status: "unbound", operationalAuthorized: 0 });
    const result = await setLineGroupOperationalAuthorization(
      new Request("https://example.test/api/line-groups/group-1/operational-authorization", {
        method: "PATCH",
        body: JSON.stringify({ authorized: true, confirm: true, reason: "approved production group" }),
        headers: { "content-type": "application/json" },
      }),
      { DB: db },
      adminSession,
      "group-1",
    );
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ ok: true, changed: true, operationalAuthorized: true });
    expect(db.state.updateCount).toBe(1);
    expect(db.state.auditCount).toBe(1);
  });

  it("fails closed for a group outside the admin organization or without explicit confirmation", async () => {
    const foreignDb = authorizationDb({ organizationId: "org-other", status: "unbound", operationalAuthorized: 0 });
    const foreignResult = await setLineGroupOperationalAuthorization(
      new Request("https://example.test/api/line-groups/group-1/operational-authorization", { method: "PATCH" }),
      { DB: foreignDb },
      adminSession,
      "group-1",
    );
    expect(foreignResult.status).toBe(404);
    expect(foreignDb.state.updateCount).toBe(0);

    const confirmationDb = authorizationDb({ organizationId: "org-1", status: "unbound", operationalAuthorized: 0 });
    const confirmationResult = await setLineGroupOperationalAuthorization(
      new Request("https://example.test/api/line-groups/group-1/operational-authorization", {
        method: "PATCH",
        body: JSON.stringify({ authorized: true, reason: "missing confirm" }),
        headers: { "content-type": "application/json" },
      }),
      { DB: confirmationDb },
      adminSession,
      "group-1",
    );
    expect(confirmationResult.status).toBe(400);
    expect(confirmationDb.state.updateCount).toBe(0);
  });

  it("returns unavailable rather than falling back when the authorization column is unavailable", async () => {
    const db = {
      prepare() {
        throw new Error("missing_column");
      },
    } as unknown as D1Database;
    const result = await setLineGroupOperationalAuthorization(
      new Request("https://example.test/api/line-groups/group-1/operational-authorization", { method: "PATCH" }),
      { DB: db },
      adminSession,
      "group-1",
    );
    expect(result.status).toBe(503);
  });

  it("supports an explicit revoke and keeps a repeated state change idempotent", async () => {
    const db = authorizationDb({ organizationId: "org-1", status: "bound", operationalAuthorized: 1 });
    const request = () => new Request("https://example.test/api/line-groups/group-1/operational-authorization", {
      method: "PATCH",
      body: JSON.stringify({ authorized: false, confirm: true, reason: "pilot closed" }),
      headers: { "content-type": "application/json" },
    });
    const revoked = await setLineGroupOperationalAuthorization(request(), { DB: db }, adminSession, "group-1");
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toMatchObject({ changed: true, operationalAuthorized: false });
    const repeated = await setLineGroupOperationalAuthorization(request(), { DB: db }, adminSession, "group-1");
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ changed: false, operationalAuthorized: false });
    expect(db.state.updateCount).toBe(1);
    expect(db.state.auditCount).toBe(2);
    expect(db.state.cleanupCount).toBeGreaterThan(0);
  });

  it("lists only unbound groups with observed LINE events as read-only claim candidates", async () => {
    let sql = "";
    const db = {
      prepare(statement: string) {
        sql = statement;
        return {
          bind() {
            return {
              async all<T>() {
                return { results: [{ groupId: "group-1", groupIdShort: "grou…up-1", status: "unbound", farmName: null, joinedAt: "2026-09-14T00:00:00Z", lastObservedAt: "2026-09-14T00:01:00Z", observedEventCount: 2 }] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const result = await lineGroupClaimCandidates(new Request("https://example.test/api/line-groups/claim-candidates"), { DB: db }, adminSession);
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ readOnly: true, claimCandidates: [{ groupId: "group-1", observedEventCount: 2 }] });
    expect(sql).toContain("JOIN line_events");
    expect(sql).toContain("g.organization_id IS NULL");
    expect(sql).toContain("g.status = 'unbound'");
  });

  it("enriches a verified candidate with the LINE provider group name without making it durable", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.line.me/v2/bot/group/group-1/summary");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer unit-test-token");
      return new Response(JSON.stringify({ groupId: "group-1", groupName: "真正 Production 群組" }), { status: 200 });
    });
    const db = {
      prepare(statement: string) {
        return {
          bind() {
            return {
              async all<T>() {
                return { results: [{ groupId: "group-1", groupIdShort: "grou…up-1", status: "unbound", farmName: null, joinedAt: "2026-09-14T00:00:00Z", lastObservedAt: "2026-09-14T00:01:00Z", observedEventCount: 2 }] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    try {
      const result = await lineGroupClaimCandidates(
        new Request("https://example.test/api/line-groups/claim-candidates"),
        { DB: db, LINE_CHANNEL_ACCESS_TOKEN: "unit-test-token" },
        adminSession,
      );
      const payload = await result.json() as { claimCandidates: Array<{ groupName: string | null; groupNameStatus: string }> };
      expect(payload.claimCandidates[0]?.groupName).toBe("真正 Production 群組");
      expect(payload.claimCandidates[0]?.groupNameStatus).toBe("available");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("exposes a safe reason when LINE cannot provide a group name", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }));
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async all<T>() {
                return { results: [{ groupId: "group-1", groupIdShort: "grou…up-1", status: "unbound", farmName: null, joinedAt: null, lastObservedAt: null, observedEventCount: 1 }] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    try {
      const result = await lineGroupClaimCandidates(
        new Request("https://example.test/api/line-groups/claim-candidates"),
        { DB: db, LINE_CHANNEL_ACCESS_TOKEN: "unit-test-token" },
        adminSession,
      );
      const payload = await result.json() as { claimCandidates: Array<{ groupName: string | null; groupNameStatus: string }> };
      expect(payload.claimCandidates[0]?.groupName).toBeNull();
      expect(payload.claimCandidates[0]?.groupNameStatus).toBe("provider_not_found");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("claims one existing unbound group for the authenticated organization with audit and readback", async () => {
    const db = organizationClaimDb({ organizationId: null, status: "unbound" });
    const result = await claimLineGroupOrganization(
      new Request("https://example.test/api/line-groups/group-1/organization-claim", {
        method: "POST",
        body: JSON.stringify({ confirm: true, reason: "verified real Production group" }),
        headers: { "content-type": "application/json" },
      }),
      { DB: db },
      adminSession,
      "group-1",
    );
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ ok: true, changed: true, claimed: true, organizationId: "org-1" });
    expect(db.state.organizationId).toBe("org-1");
    expect(db.state.updateCount).toBe(1);
    expect(db.state.auditCount).toBe(1);
  });

  it("is idempotent for the same organization and never claims foreign, left, or bound groups", async () => {
    const claimed = organizationClaimDb({ organizationId: "org-1", status: "unbound" });
    const request = () => new Request("https://example.test/api/line-groups/group-1/organization-claim", {
      method: "POST",
      body: JSON.stringify({ confirm: true, reason: "repeat verified claim" }),
      headers: { "content-type": "application/json" },
    });
    const repeated = await claimLineGroupOrganization(request(), { DB: claimed }, adminSession, "group-1");
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({ changed: false, claimed: true, organizationId: "org-1" });
    expect(claimed.state.updateCount).toBe(0);
    expect(claimed.state.auditCount).toBe(1);

    for (const [input, expectedStatus] of [
      [{ organizationId: "org-other", status: "unbound" }, 404],
      [{ organizationId: null, status: "left" }, 409],
      [{ organizationId: null, status: "bound" }, 409],
    ] as const) {
      const db = organizationClaimDb(input);
      const rejected = await claimLineGroupOrganization(request(), { DB: db }, adminSession, "group-1");
      expect(rejected.status).toBe(expectedStatus);
      expect(db.state.updateCount).toBe(0);
    }
  });

  it("fails closed for unknown targets or missing explicit confirmation", async () => {
    const unknown = organizationClaimDb({ organizationId: null, status: "unbound", exists: false });
    const unknownResult = await claimLineGroupOrganization(
      new Request("https://example.test/api/line-groups/group-1/organization-claim", {
        method: "POST",
        body: JSON.stringify({ confirm: true, reason: "verified real Production group" }),
        headers: { "content-type": "application/json" },
      }),
      { DB: unknown },
      adminSession,
      "group-1",
    );
    expect(unknownResult.status).toBe(404);

    const missingConfirmation = organizationClaimDb({ organizationId: null, status: "unbound" });
    const confirmationResult = await claimLineGroupOrganization(
      new Request("https://example.test/api/line-groups/group-1/organization-claim", {
        method: "POST",
        body: JSON.stringify({ reason: "missing confirmation" }),
        headers: { "content-type": "application/json" },
      }),
      { DB: missingConfirmation },
      adminSession,
      "group-1",
    );
    expect(confirmationResult.status).toBe(400);
    expect(missingConfirmation.state.updateCount).toBe(0);
  });
});
