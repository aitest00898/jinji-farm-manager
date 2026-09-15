import { describe, expect, it } from "vitest";
import { handlePhaseApi, type PhaseApiEnv, type PhaseSession } from "./phase-api";

function analysisDb() {
  const restrictedQueries: string[] = [];
  const db = {
    prepare(sql: string) {
      if (sql.includes("profit_distributions") || sql.includes("audit_logs")) restrictedQueries.push(sql);
      return {
        bind(..._values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("SELECT id, name FROM organizations")) return { id: "org-1", name: "金雞協會", active: 1 } as T;
              if (sql.includes("todayMortality")) return { todayMortality: 0, todayCull: 0, todayFeed: 0, todayWater: 0 } as T;
              if (sql.includes("profit_distributions")) return { allocated: 100, expense: 10, net: 90 } as T;
              return null;
            },
            async all<T>() {
              if (sql.includes("SELECT k.id, k.batch_code")) {
                return { results: [{ id: "flock-1", batchCode: "B-001", farmId: "farm-1", houseId: "house-1", status: "active", currentStock: 963 }] } as { results: T[] };
              }
              if (sql.includes("audit_logs")) return { results: [{ action: "read", entityType: "operational_event", count: 1 }] } as { results: T[] };
              return { results: [] } as { results: T[] };
            },
          };
        },
      };
    },
    restrictedQueries,
  };
  return db as unknown as D1Database & { restrictedQueries: string[] };
}

async function readLiveStatus(session: PhaseSession, db: D1Database) {
  const response = await handlePhaseApi(
    new Request("https://example.test/api/ai/live-status?scopeType=organization&scopeId=organization"),
    { DB: db } as PhaseApiEnv,
    session,
    (body, status = 200) => new Response(JSON.stringify(body), { status }),
    (status, code, message) => new Response(JSON.stringify({ code, message }), { status }),
  );
  expect(response).not.toBeNull();
  return response!.json() as Promise<Record<string, any>>;
}

describe("live status response boundary", () => {
  it("projects only operational data for a public request and skips restricted queries", async () => {
    const db = analysisDb();
    const payload = await readLiveStatus({ id: "public-read", organizationId: "org-1", accessClass: "PUBLIC" }, db);
    expect(payload.context).not.toHaveProperty("finance");
    expect(payload.context).not.toHaveProperty("audit");
    expect(payload.context.toolsUsed).not.toContain("get_finance_summary");
    expect(payload.context.toolsUsed).not.toContain("get_audit_summary");
    expect(db.restrictedQueries).toEqual([]);
  });

  it("keeps the complete context for a protected request", async () => {
    const db = analysisDb();
    const payload = await readLiveStatus({ id: "admin-session", organizationId: "org-1", accessClass: "ADMIN" }, db);
    expect(payload.context.finance).toEqual({ allocated: 100, expense: 10, net: 90 });
    expect(payload.context.audit).toEqual([{ action: "read", entityType: "operational_event", count: 1 }]);
    expect(db.restrictedQueries).toHaveLength(2);
  });
});
