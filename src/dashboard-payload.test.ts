import { describe, expect, it } from "vitest";
import { dashboardPayload } from "./web-api";

const input = {
  asOf: "2026-09-15",
  farms: 2,
  productionFarms: 2,
  testFarms: 1,
  caretakers: 3,
  activeFlocks: 4,
  stock: 963,
  today: { mortality: 0, cull: 0, feed: 0, water: 0 },
  upcomingShipments: 1,
  finance: { net: 1000 },
  warnings: [],
};

describe("dashboard response boundary", () => {
  it("omits finance and caretaker administration fields for public reads", () => {
    const payload = dashboardPayload(true, input);
    expect(payload).not.toHaveProperty("finance");
    expect(payload.counts).not.toHaveProperty("caretakers");
    expect(payload.counts).not.toHaveProperty("testFarms");
  });

  it("keeps restricted dashboard fields for protected reads", () => {
    const payload = dashboardPayload(false, input);
    expect(payload.finance).toEqual({ net: 1000 });
    expect(payload.counts).toMatchObject({ testFarms: 1, caretakers: 3 });
  });
});
