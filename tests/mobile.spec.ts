import { expect, test, type Page, type Route } from "@playwright/test";

type MockState = { note: string | null };

const farm = {
  id: "test-farm",
  name: "金雞測試場",
  siteName: "測試區",
  active: true,
  environment: "test",
  structureMode: "multi_house",
  note: null as string | null,
  version: 1,
  playerGroupEquityFraction: 0,
  createdAt: "2026-08-19T00:00:00Z",
  updatedAt: "2026-08-19T00:00:00Z",
};

const house = { id: "test-house", farmId: farm.id, name: "測試1舍", normalizedName: "測試1舍", capacity: 1200, active: true, note: null, version: 1, createdAt: "2026-08-19T00:00:00Z", updatedAt: "2026-08-19T00:00:00Z", farmName: farm.name, farmEnvironment: "test" };
const flock = { id: "test-flock", farmId: farm.id, houseId: house.id, batchCode: "TEST-BATCH-001", breed: null, chickInDate: "2026-08-19", initialCount: 1000, expectedShipmentDate: "2026-11-19", actualShipmentDate: null, status: "active", note: null, version: 1, ageDays: 1, shipmentReminder: null, farmName: farm.name, houseName: house.name };

async function fulfill(route: Route, payload: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
}

async function installMockApi(page: Page): Promise<MockState> {
  const state: MockState = { note: null };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/api/web/auth/login")) return fulfill(route, { authenticated: true, token: "test-session", expiresAt: "2099-01-01T00:00:00Z", organization: { id: "org-test", name: "測試組合" } });
    if (path.endsWith("/api/web/auth/session")) return fulfill(route, { authenticated: true, privileged: true, expiresAt: "2099-01-01T00:00:00Z" });
    if (path.endsWith("/api/web/auth/authorize")) return fulfill(route, { authorized: true, privilegedExpiresAt: "2099-01-01T00:05:00Z" });
    if (path.endsWith("/api/web/auth/logout")) return fulfill(route, { authenticated: false });
    if (path.endsWith("/api/dashboard")) return fulfill(route, { asOf: "2026-08-20", counts: { farms: 1, productionFarms: 0, testFarms: 1, caretakers: 0, activeFlocks: 1 }, stock: 1000, today: { mortality: 0, cull: 0 }, upcomingShipments: 1, finance: { net: 0 }, dataHealth: { warnings: [] } });
    if (path.endsWith("/api/organizations")) return fulfill(route, { organizations: [{ id: "org-test", name: "測試組合", active: true }] });
    if (path.endsWith("/api/farms/test-farm") && request.method() === "PATCH") { const body = JSON.parse(request.postData() ?? "{}"); state.note = typeof body.note === "string" ? body.note : state.note; return fulfill(route, { farm: { ...farm, note: state.note, version: farm.version + 1 } }); }
    if (path.endsWith("/api/farms")) return fulfill(route, { farms: [{ ...farm, note: state.note }] });
    if (path.endsWith("/api/caretakers")) return fulfill(route, { caretakers: [], history: true });
    if (path.endsWith("/api/houses")) return fulfill(route, { houses: [house] });
    if (path.endsWith("/api/flocks")) return fulfill(route, { flocks: [flock] });
    if (path.endsWith("/api/operational-events")) return fulfill(route, { events: [], nextCursor: null });
    if (path.endsWith("/api/finance")) return fulfill(route, { totals: { allocated: 0, expense: 0, net: 0 }, investors: [], farms: [], distributions: [], allocations: [], farmInvestorEquity: [] });
    if (path.endsWith("/api/farm-aliases")) return fulfill(route, { aliases: [] });
    if (path.endsWith("/api/data-health")) return fulfill(route, { warnings: [], checks: [], checkedAt: "2026-08-20T00:00:00Z" });
    if (path.endsWith("/api/audit")) return fulfill(route, { auditLogs: [], nextCursor: null });
    if (path.includes("/api/charts/")) return fulfill(route, { metric: "mortality", from: "2026-07-21", to: "2026-08-20", granularity: "daily", unit: "隻", definition: "每日死亡事件數。", status: "ok", series: [{ date: "2026-08-19", value: 2 }, { date: "2026-08-20", value: 5 }] });
    return fulfill(route, {});
  });
  return state;
}

async function login(page: Page) {
  await page.goto("./");
  await page.getByLabel("管理密碼").fill("test-only-fixture");
  await page.getByRole("button", { name: "登入管理中心" }).click();
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
}

async function fakeSwipe(page: Page, startY: number, endY: number, target = "main") {
  await page.evaluate(({ startY: firstY, endY: lastY, targetSelector }) => {
    const element = document.querySelector(targetSelector);
    if (!element) throw new Error(`Missing swipe target: ${targetSelector}`);
    const touch = (type: string, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", { value: type === "touchstart" ? [{ clientX: 180, clientY: y }] : [] });
      Object.defineProperty(event, "changedTouches", { value: [{ clientX: 180, clientY: y }] });
      element.dispatchEvent(event);
    };
    touch("touchstart", firstY);
    touch("touchend", lastY);
  }, { startY, endY, targetSelector: target });
}

test.describe("mobile-first responsive management UI", () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
  });

  test("drawer, hash navigation, and safe swipe navigation share one state", async ({ page }) => {
    await page.getByRole("button", { name: "開啟導覽選單" }).click();
    await expect(page.locator("#primary-navigation")).toHaveClass(/drawer-open/);
    await page.getByRole("button", { name: "雞場" }).click();
    await expect(page).toHaveURL(/#\/farms$/);
    await expect(page.getByRole("heading", { name: "雞場" })).toBeVisible();
    await expect(page.locator("#primary-navigation")).not.toHaveClass(/drawer-open/);

    await page.goto("./#/dashboard");
    await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await fakeSwipe(page, 420, 220);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await fakeSwipe(page, 420, 220);
    await expect(page).toHaveURL(/#\/organization$/);
  });

  test("mobile cards and note state remain usable without body overflow", async ({ page }) => {
    await page.getByRole("button", { name: "開啟導覽選單" }).click();
    await page.getByRole("button", { name: "雞場" }).click();
    await expect(page.locator(".farm-card")).toBeVisible();
    await expect(page.locator(".farm-card")).toContainText("尚無備註");
    await page.getByRole("button", { name: "編輯備註" }).click();
    await page.locator("textarea").fill("測試場 mobile note");
    await page.getByRole("button", { name: "儲存備註" }).click();
    await expect(page.getByText("✅ 備註已儲存")).toBeVisible();
    await expect(page.locator(".farm-card")).toContainText("測試場 mobile note");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.client);
    await page.getByRole("button", { name: "開啟導覽選單" }).click();
    await page.getByRole("button", { name: "營運紀錄" }).click();
    await expect(page.locator(".mobile-card-list").first()).toHaveCSS("display", "grid");
  });

  test("chart filters and touch tooltip render on a narrow viewport", async ({ page }) => {
    await page.getByRole("button", { name: "開啟導覽選單" }).click();
    await page.getByRole("button", { name: "趨勢分析" }).click();
    await expect(page.locator(".range-chips")).toBeVisible();
    await page.getByRole("button", { name: "7 日" }).click();
    await expect(page.locator(".chart-point").first()).toBeVisible();
    await page.locator(".chart-point").first().click();
    await expect(page.locator(".chart-tooltip")).toBeVisible();
    await expect(page.locator(".chart-tooltip")).toContainText("2026-08-19");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.client);
  });
});

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`viewport ${viewport.width}x${viewport.height} has no document overflow`, async ({ page }) => {
    await installMockApi(page);
    await page.setViewportSize(viewport);
    await login(page);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.client);
  });
}
