import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiClient, queryString } from "./api";

describe("Web management safety contract", () => {
  it("uses the existing Worker API by default", () => {
    expect(API_BASE).toBe("https://chicken-line-production.jinji-assistant.workers.dev");
  });
  it("does not put an admin password or token in the public API base", () => {
    expect(API_BASE).not.toMatch(/FARM_ADMIN_PASSWORD_HASH|Bearer/iu);
  });

  it("keeps cursors opaque while serializing chart filters", () => {
    expect(queryString({ cursor: "opaque/token==", farmId: "farm-1", houseId: null })).toBe("?cursor=opaque%2Ftoken%3D%3D&farmId=farm-1");
  });

  it("uses D1 chart and pagination endpoints without calculating data in the browser", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify({ metric: "stock", series: [], nextCursor: "next" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    await client.chart("stock", { from: "2026-08-01", to: "2026-08-20", granularity: "daily", farmId: "farm-1" });
    await client.events({ limit: 50, cursor: "opaque-event-cursor" });
    await client.audit({ cursor: "opaque-audit-cursor" });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls[0]).toContain("/api/charts/stock?from=2026-08-01");
    expect(urls[0]).toContain("farmId=farm-1");
    expect(urls[1]).toContain("cursor=opaque-event-cursor");
    expect(urls[2]).toContain("cursor=opaque-audit-cursor");
  });

  afterEach(() => vi.unstubAllGlobals());
});
