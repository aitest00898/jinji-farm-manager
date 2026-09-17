import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  addIsoDays,
  canonicalEntityKey,
  canonicalHouseName,
  deriveCurrentStock,
  differenceInDays,
  effectiveOperationalEventPredicate,
  flockAgeDays,
  isIsoDate,
  normalizedHouseName,
  resolveNamedMasterRecord,
  shipmentReminder,
} from "./master-data";

describe("Operational Phase 2 master-data calculations", () => {
  it("validates ISO dates and preserves calendar-day arithmetic", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(addIsoDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(differenceInDays("2026-08-19", "2026-08-26")).toBe(7);
  });

  it("calculates flock age from chick-in date", () => {
    expect(flockAgeDays("2026-08-01", "2026-08-19")).toBe(18);
    expect(flockAgeDays("2026-08-20", "2026-08-19")).toBe(0);
  });

  it("derives current stock without mutating the initial count", () => {
    expect(deriveCurrentStock(1000, [
      { intent: "mortality", quantity: 5 },
      { intent: "cull", quantity: 2 },
      { intent: "shipment", quantity: 100 },
    ])).toBe(893);
    expect(deriveCurrentStock(10, [{ intent: "mortality", quantity: 20 }])).toBe(0);
  });

  it("selects effective operational facts without counting append-only relation rows twice", () => {
    const predicate = effectiveOperationalEventPredicate("oe");
    expect(predicate).toContain("oe.reversed_at IS NULL");
    expect(predicate).toContain("oe.reversal_of_event_id IS NULL");
    expect(predicate).toContain("reversal_of_event_id = oe.id");
    expect(predicate).toContain("correction_of_event_id = oe.id");
  });

  it("applies the effective predicate to reversal and correction rows", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE operational_events (
          id TEXT PRIMARY KEY,
          reversed_at TEXT,
          reversal_of_event_id TEXT,
          correction_of_event_id TEXT,
          intent TEXT NOT NULL
        );
      `);
      const insert = sqlite.prepare(`
        INSERT INTO operational_events
          (id, reversed_at, reversal_of_event_id, correction_of_event_id, intent)
        VALUES (?, ?, ?, ?, ?)
      `);
      insert.run("active-base", null, null, null, "shipment");
      insert.run("reversal-parent", null, null, null, "shipment");
      insert.run("reversal-child", null, "reversal-parent", null, "shipment");
      insert.run("correction-parent", null, null, null, "shipment");
      insert.run("correction-child", null, null, "correction-parent", "shipment");
      insert.run("explicitly-reversed", "2026-09-10T00:00:00.000Z", null, null, "shipment");

      const rows = sqlite.prepare(`
        SELECT e.id
          FROM operational_events e
         WHERE ${effectiveOperationalEventPredicate("e")}
         ORDER BY e.id
      `).all() as Array<{ id: string }>;
      expect(rows.map((row) => row.id)).toEqual(["active-base", "correction-child"]);
    } finally {
      sqlite.close();
    }
  });

  it("rejects non-source-controlled SQL aliases", () => {
    expect(() => effectiveOperationalEventPredicate("e; DROP TABLE operational_events;--")).toThrow("invalid_operational_event_sql_alias");
  });

  it("returns shipment reminder windows", () => {
    expect(shipmentReminder("2026-08-18", "2026-08-19")).toBe("overdue");
    expect(shipmentReminder("2026-08-19", "2026-08-19")).toBe("today");
    expect(shipmentReminder("2026-08-20", "2026-08-19")).toBe("one_day");
    expect(shipmentReminder("2026-08-26", "2026-08-19")).toBe("seven_days");
    expect(shipmentReminder("2026-08-27", "2026-08-19")).toBeNull();
  });

  it("normalizes house names without changing original message text", () => {
    expect(normalizedHouseName(" ０３ 舍 ")).toBe("3舍");
    expect(normalizedHouseName("測試一舍")).toBe("測試1舍");
    expect(normalizedHouseName("測試 １ 舍")).toBe("測試1舍");
    expect(canonicalHouseName("測試一舍")).toBe("測試1舍");
    expect(normalizedHouseName("雞舍A")).toBe("雞舍A");
  });

  it("normalizes entity punctuation and resolves one bounded near-match", () => {
    expect(canonicalEntityKey("金雞-測試場")).toBe(canonicalEntityKey("金雞測試場"));
    const result = resolveNamedMasterRecord([
      { id: "house-1", name: "測試1舍" },
      { id: "house-2", name: "測試2舍" },
    ], "測試一舍");
    expect(result).toMatchObject({ kind: "direct", record: { id: "house-1", name: "測試1舍" } });
  });

  it("keeps collisions and marginal near-matches from becoming writes", () => {
    const collision = resolveNamedMasterRecord([
      { id: "house-a", name: "測試1舍" },
      { id: "house-b", name: "測試１舍" },
    ], "測試一舍");
    expect(collision.kind).toBe("candidates");
    expect(resolveNamedMasterRecord([{ id: "house-1", name: "測試1舍" }], "測試2舍").kind).toBe("candidates");
    expect(resolveNamedMasterRecord([{ id: "house-1", name: "測試1舍" }], "完全不存在").kind).toBe("none");
  });
});
