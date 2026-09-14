import { describe, expect, it } from "vitest";
import {
  addOperationalEnvironmentFilter,
  DEFAULT_OPERATIONAL_ENVIRONMENT,
  isAllowedWebOrigin,
  operationalEnvironmentFor,
  setLineGroupOperationalAuthorization,
} from "./web-api";

function authorizationDb(input: {
  organizationId: string | null;
  status: string;
  operationalAuthorized: number;
}) {
  const state = { ...input, auditCount: 0, updateCount: 0 };
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
        if (statement.sql?.includes("INSERT INTO audit_logs")) state.auditCount += 1;
      }
      return [];
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

  it("defaults operational reads to Production and only exposes Test explicitly", () => {
    expect(DEFAULT_OPERATIONAL_ENVIRONMENT).toBe("production");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events"))).toBe("production");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events?environment=test"))).toBe("test");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events?environment=all"))).toBe("production");
  });

  it("adds a bounded farm environment predicate without accepting a free-form SQL value", () => {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    expect(addOperationalEnvironmentFilter(new URL("https://example.test/api/events"), clauses, bindings, "farm")).toBe("production");
    expect(clauses).toEqual(["farm.environment = ?"]);
    expect(bindings).toEqual(["production"]);
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
  });
});
