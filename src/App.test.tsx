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

  it("maps login failures without retaining a token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_credentials", message: "驗證失敗" }), { status: 401 })));
    const client = new ApiClient();
    await expect(client.login("test-only-fixture")).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    expect(client.hasToken()).toBe(false);
  });

  it("sends fresh authorization and correction reasons as explicit request fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ authorized: true, privilegedExpiresAt: "2026-08-20T00:05:00Z" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    await client.authorize("test-only-fixture");
    await client.reverseEvent("event-1", "現場回報誤登");
    await client.correctEvent("event-1", { quantity: 3, reason: "現場回報修正" });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const bodies = calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { password: "test-only-fixture" },
      { reason: "現場回報誤登" },
      { quantity: 3, reason: "現場回報修正" },
    ]);
  });

  it("keeps read-only aliases and health data on dedicated endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("farm-aliases") ? { aliases: [] } : { warnings: [], checks: [], checkedAt: "2026-08-20T00:00:00Z" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    await client.aliases();
    await client.dataHealth();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      `${API_BASE}/api/farm-aliases`,
      `${API_BASE}/api/data-health`,
    ]);
  });

  afterEach(() => vi.unstubAllGlobals());
});
