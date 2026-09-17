import { describe, expect, it } from "vitest";
import {
  captureProductionD1Backup,
  runProductionD1Backup,
  verifyProductionD1Backup,
} from "./production-d1-backup";

function fakeDb(): D1Database {
  return {
    prepare(sql: string) {
      return {
        all: async <T>() => sql.includes("sqlite_master")
          ? { results: [{ name: "farms", sql: "CREATE TABLE farms (id TEXT)" }] as T[] }
          : { results: [{ id: "farm-1", name: "金雞測試場" }] as T[] },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("Production D1 backup", () => {
  it("captures canonical read-only tables and detects payload tampering", async () => {
    const payload = await captureProductionD1Backup({ DB: fakeDb() }, new Date("2026-09-17T08:00:00.000Z"));
    expect(payload.format).toBe("jinji.production-d1-backup.v1");
    expect(payload.tables).toHaveLength(1);
    expect(payload.tables[0]?.rows).toEqual([{ id: "farm-1", name: "金雞測試場" }]);
    await expect(verifyProductionD1Backup(payload)).resolves.toBe(true);
    payload.tables[0]!.rows[0]!.name = "tampered";
    await expect(verifyProductionD1Backup(payload)).resolves.toBe(false);
  });

  it("writes a dated immutable object and a latest pointer with the same hash metadata", async () => {
    const writes: Array<{ key: string; body: string; options: KVNamespacePutOptions }> = [];
    const backupKv = {
      put: async (key: string, body: string, options: KVNamespacePutOptions) => {
        writes.push({ key, body, options });
        return undefined;
      },
    } as unknown as KVNamespace;
    const result = await runProductionD1Backup(
      { DB: fakeDb(), BACKUP_KV: backupKv },
      new Date("2026-09-17T08:00:00.000Z"),
    );
    expect(writes).toHaveLength(2);
    expect(writes[0]?.key).toMatch(/^production-d1\/2026-09-17\/20260917T080000Z\.json$/);
    expect(writes[1]?.key).toBe("production-d1/latest.json");
    expect(writes[0]?.body).toBe(writes[1]?.body);
    expect(writes[0]?.options.metadata?.canonicalPayloadSha256).toBe(result.sha256);
    expect(writes[0]?.options.expirationTtl).toBe(365 * 24 * 60 * 60);
    expect(result.tableCount).toBe(1);
    expect(result.rowCount).toBe(1);
  });
});
