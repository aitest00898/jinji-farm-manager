import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiClient, queryString } from "./api";
import { NAV_GROUPS, NAV_ITEMS } from "./navigation";

describe("mobile navigation information architecture", () => {
  it("gives every page a concise Traditional Chinese label and explanation", () => {
    expect(NAV_ITEMS.map(({ label, description }) => `${label}（${description}）`)).toEqual([
      "總覽（今日重點）",
      "雞場（場區管理）",
      "批次（入雛與出雞）",
      "營運紀錄（死亡／淘汰／飼料等）",
      "異常紀錄（只記發生了什麼）",
      "趨勢分析（數據圖表）",
      "提醒（出雞提醒）",
      "AI 助理（詢答與分析）",
      "待確認資料（待確認營運資訊）",
      "組織（協會資料）",
      "飼養者（人員管理）",
      "雞舍（舍別管理）",
      "財務（盈虧與收支）",
      "股權（投資人與持股）",
      "名稱解析（別名／錯字／同音）",
      "變更紀錄（修改追蹤）",
      "資料檢查（資料異常檢查）",
      "系統狀態（訊息處理狀態）",
      "訊息診斷（尚未整理與問題訊息）",
      "待確認資料診斷（來源與不一致原因）",
      "測試工具（測試雞場資料）",
      "系統設定（服務設定摘要）",
      "技術資訊（進階技術資料）",
    ]);
    expect(NAV_ITEMS.every((item) => item.pageDescription.length > 0)).toBe(true);
  });

  it("groups all routes exactly once without changing route keys", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["一般場務", "資料管理", "系統維護"]);
    expect(new Set(NAV_ITEMS.map((item) => item.key)).size).toBe(NAV_ITEMS.length);
    expect(NAV_ITEMS.every((item) => NAV_GROUPS.some((group) => group.key === item.group))).toBe(true);
  });

  it("assigns a distinct semantic icon to every navigation item", () => {
    expect(new Set(NAV_ITEMS.map((item) => item.icon)).size).toBe(NAV_ITEMS.length);
  });
});

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

  it("編修沿用登入狀態，不再要求再次輸入管理密碼", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    client.setToken("a".repeat(43));
    await client.reverseEvent("event-1", "現場回報誤登");
    await client.correctEvent("event-1", { quantity: 3, reason: "現場回報修正" });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const bodies = calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { reason: "現場回報誤登" },
      { quantity: 3, reason: "現場回報修正" },
    ]);
    expect(calls.map(([input]) => String(input)).some((url) => url.includes("/api/web/auth/authorize"))).toBe(false);
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

  it("maps management parity pages to dedicated read-only and protected endpoints", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: {}, events: [], rows: [], candidates: [], farms: [], houses: [], flocks: [], queue: {}, schedules: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient();
    await client.systemStatus();
    await client.reliabilityEvents();
    await client.ambientPreview();
    await client.pendingCandidates();
    await client.testTools();
    await client.technicalInfo();
    await client.recoverUnfinished();
    await client.acknowledgeRetained();
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(calls.map(([input]) => String(input))).toEqual([
      `${API_BASE}/api/system-status`,
      `${API_BASE}/api/reliability/events`,
      `${API_BASE}/api/ambient/preview`,
      `${API_BASE}/api/pending-candidates`,
      `${API_BASE}/api/test-tools`,
      `${API_BASE}/api/technical-info`,
      `${API_BASE}/api/reliability/recover`,
      `${API_BASE}/api/reliability/acknowledge`,
    ]);
    expect(calls[6][1]?.method).toBe("POST");
    expect(calls[7][1]?.method).toBe("POST");
  });

  afterEach(() => vi.unstubAllGlobals());
});
