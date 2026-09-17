import { describe, expect, it } from "vitest";
import { hasScopedPendingState, type Env } from "./index";

describe("Production D1 pending-state compatibility", () => {
  it("avoids the compound SELECT term limit while preserving every pending source", async () => {
    const queries: string[] = [];
    const db = {
      prepare(sql: string) {
        queries.push(sql);
        return {
          bind: (..._args: unknown[]) => ({
            first: async <T>() => ({ present: 0 } as T),
          }),
        };
      },
    } as unknown as D1Database;

    await hasScopedPendingState({ DB: db } as Env, "group-test", "user-test", "2035-01-01T00:00:00.000Z");

    expect(queries[0]).not.toContain("UNION ALL");
    expect(queries[0]?.match(/EXISTS\s*\(/gu)).toHaveLength(7);
    for (const table of [
      "pending_actions",
      "abnormal_pending_actions",
      "farm_admin_actions",
      "operational_admin_actions",
      "finance_admin_actions",
      "master_admin_actions",
      "ambient_digest_candidates",
    ]) {
      expect(queries[0]).toContain(`FROM ${table}`);
    }
  });
});
