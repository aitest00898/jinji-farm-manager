import { describe, expect, it } from "vitest";
import {
  addIsoDays,
  deriveCurrentStock,
  differenceInDays,
  flockAgeDays,
  isIsoDate,
  normalizedHouseName,
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

  it("returns shipment reminder windows", () => {
    expect(shipmentReminder("2026-08-18", "2026-08-19")).toBe("overdue");
    expect(shipmentReminder("2026-08-19", "2026-08-19")).toBe("today");
    expect(shipmentReminder("2026-08-20", "2026-08-19")).toBe("one_day");
    expect(shipmentReminder("2026-08-26", "2026-08-19")).toBe("seven_days");
    expect(shipmentReminder("2026-08-27", "2026-08-19")).toBeNull();
  });

  it("normalizes house names without changing original message text", () => {
    expect(normalizedHouseName(" ０３ 舍 ")).toBe("3舍");
    expect(normalizedHouseName("雞舍A")).toBe("雞舍A");
  });
});
