import { expect, test, type Page, type Route } from "@playwright/test";
import { NAV_GROUPS, NAV_ITEMS } from "../src/navigation";

type MockState = { note: string | null; acknowledged: boolean; resolution: "unresolved" | "manually_resolved" | "manually_recorded" | "force_closed" };

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
const flock = { id: "test-flock", farmId: farm.id, houseId: house.id, batchCode: "TEST-BATCH-001", breed: null, chickInDate: "2026-08-19", initialCount: 1000, expectedShipmentDate: "2026-11-19", actualShipmentDate: null, status: "active", note: null, version: 1, ageDays: 1, shipmentReminder: "upcoming", farmName: farm.name, houseName: house.name };
const operationalEvent = { id: "event-1", organizationId: "org-test", farmId: farm.id, farmName: farm.name, environment: "test", houseId: house.id, house: house.name, flockId: flock.id, intent: "mortality", quantity: 5, unit: "隻", eventDate: "2026-08-20", note: null, source: "web", sourceEventId: "fixture-event", pendingActionId: null, reversalOfEventId: null, correctionGroupId: null, reversedAt: null, createdAt: "2026-08-20T01:00:00Z" };
const auditRow = { id: "audit-1", organizationId: "org-test", source: "web", action: "farm_note_updated", entityType: "farm", entityId: farm.id, actorType: "web_admin", actorId: "fixture-user", reason: "行動版測試", before: { note: null }, after: { note: "巡場完成" }, changedFields: ["note"], createdAt: "2026-08-20T01:10:00Z" };
const retainedBase = { eventId: "event-retained", eventIdShort: "tained01", correlationIdShort: "rel-0001", lifecycleStatus: "retained", businessStatus: "failed", replyStatus: "failed", receivedAt: "2026-08-20T02:00:00Z", queuedAt: "2026-08-20T02:00:01Z", processingStartedAt: "2026-08-20T02:00:02Z", businessCompletedAt: null, replyCompletedAt: null, queueAttempts: 3, processingAttempts: 3, replyAttempts: 0, lastErrorStage: "processing", lastErrorClass: "temporary_failure", lastErrorAt: "2026-08-20T02:01:00Z", nextRetryAt: null, resolutionStatus: "unresolved", retainedAcknowledgedAt: null, retainedAcknowledgedBy: null, resolvedAt: null, resolvedBy: null, resolutionReason: null, resolutionNote: null, manualRecordReference: null, payloadAvailable: false, payloadExpiresAt: "2026-08-20T02:05:00Z" };

function reliabilityStatusFixture(state: MockState) {
  const unresolved = state.resolution === "unresolved";
  return { level: unresolved ? "attention" : "normal", label: unresolved ? "需要處理" : "正常", message: unresolved ? "目前有 1 筆訊息尚未完成，需要管理者處理。" : "系統目前運作正常。", unfinishedCount: unresolved ? 1 : 0, stalledCount: 0, retryingCount: 0, retainedCount: 1, retainedUnacknowledgedCount: unresolved && !state.acknowledged ? 1 : 0, retainedAcknowledgedCount: unresolved && state.acknowledged ? 1 : 0, retainedOpenCount: unresolved ? 1 : 0, retainedResolvedCount: unresolved ? 0 : 1, actionableUnfinishedCount: 0, deliveryUncertainCount: 0, replyFailureCount: 0, lastCompletedAt: "2026-08-20T02:00:00Z", lastProblemAt: unresolved ? "2026-08-20T02:01:00Z" : null, checkedAt: "2026-08-20T03:00:00Z", checks: { receive: "需處理", process: "正常", storage: "正常", reply: "正常" } };
}

function reliabilityEventsFixture(state: MockState) {
  return [{ ...retainedBase, resolutionStatus: state.resolution, retainedAcknowledgedAt: state.acknowledged ? "2026-08-20T03:00:00Z" : null, retainedAcknowledgedBy: state.acknowledged ? "fixture-admin" : null, resolvedAt: state.resolution === "unresolved" ? null : "2026-08-20T03:10:00Z", resolvedBy: state.resolution === "unresolved" ? null : "fixture-admin", resolutionReason: state.resolution === "unresolved" ? null : "測試結案", resolutionNote: null, manualRecordReference: state.resolution === "manually_recorded" ? "operational:event-2" : null }];
}

async function fulfill(route: Route, payload: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
}

async function installMockApi(page: Page): Promise<MockState> {
  const state: MockState = { note: null, acknowledged: false, resolution: "unresolved" };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/api/web/auth/login")) return fulfill(route, { authenticated: true, token: "test-session", expiresAt: "2099-01-01T00:00:00Z", organization: { id: "org-test", name: "測試組合" } });
    if (path.endsWith("/api/web/auth/session")) return fulfill(route, { authenticated: true, privileged: true, expiresAt: "2099-01-01T00:00:00Z" });
    if (path.endsWith("/api/web/auth/authorize")) return fulfill(route, { authorized: true, privilegedExpiresAt: "2099-01-01T00:05:00Z" });
    if (path.endsWith("/api/web/auth/logout")) return fulfill(route, { authenticated: false });
    if (path.endsWith("/api/system-status")) return fulfill(route, { status: reliabilityStatusFixture(state) });
    if (path.endsWith("/api/reliability/events")) return fulfill(route, { events: reliabilityEventsFixture(state) });
    if (path.endsWith("/api/reliability/acknowledge") && request.method() === "POST") { state.acknowledged = true; return fulfill(route, { ok: true, acknowledged: 1, message: "已記下查看結果；尚待決定的訊息仍會保留。" }); }
    if (path.endsWith("/api/reliability/recover") && request.method() === "POST") return fulfill(route, { ok: true, message: "目前沒有可以重新處理的未完成訊息。", result: { requeued: 0 } });
    if (path.endsWith("/api/reliability/events/event-retained/resolve") && request.method() === "POST") { const body = JSON.parse(request.postData() ?? "{}"); state.resolution = body.action === "force_close" ? "force_closed" : "manually_resolved"; return fulfill(route, { ok: true, changed: true, message: "這筆訊息已結案。" }); }
    if (path.endsWith("/api/reliability/events/event-retained/record") && request.method() === "POST") { state.resolution = "manually_recorded"; return fulfill(route, { ok: true, changed: true, message: "已補登正式紀錄，這筆訊息已結案。", record: { kind: "operational", id: "event-2" } }); }
    if (path.endsWith("/api/reliability/events/event-retained/recover") && request.method() === "POST") return fulfill(route, { ok: true, message: "這筆訊息沒有重新安排。", result: { requeued: 0 } });
    if (path.endsWith("/api/ambient/preview")) return fulfill(route, { cutoffAt: "2026-08-20T03:00:00Z", page: 0, pageSize: 10, total: 0, totalPages: 1, candidateLikeCount: 0, excludedCount: 0, openCandidateCount: 0, processed24hCount: 0, expiredDiagnosticCount: 0, expiredDiagnostics: [], rows: [], truncated: false, readOnly: true });
    if (path.endsWith("/api/pending-candidates")) return fulfill(route, { page: 0, pageSize: 10, total: 0, totalPages: 1, candidates: [], invalidCount: 0, truncated: false, readOnly: true });
    if (path.endsWith("/api/test-tools")) return fulfill(route, { farms: [], houses: [], flocks: [], warning: "只讀測試資料。", readOnly: true });
    if (path.endsWith("/api/technical-info")) return fulfill(route, { service: "fixture", accountName: "金雞協會助理Ai", conversationMode: "test_farm", conversationModel: "fixture", ambientModel: "fixture", queue: { name: "fixture", batchSize: 10, timeoutSeconds: 0, maxRetries: 3 }, schedules: [], migration: "0029", secretsIncluded: false, rawPayloadIncluded: false, note: "安全技術資料。" });
    if (path.endsWith("/api/dashboard")) return fulfill(route, { asOf: "2026-08-20", counts: { farms: 1, productionFarms: 0, testFarms: 1, caretakers: 0, activeFlocks: 1 }, stock: 995, today: { mortality: 5, cull: 0 }, upcomingShipments: 1, finance: { net: 0 }, dataHealth: { warnings: [] } });
    if (path.endsWith("/api/organizations")) return fulfill(route, { organizations: [{ id: "org-test", name: "測試組合", active: true }] });
    if (path.endsWith("/api/farms/test-farm") && request.method() === "PATCH") { const body = JSON.parse(request.postData() ?? "{}"); state.note = typeof body.note === "string" ? body.note : state.note; return fulfill(route, { farm: { ...farm, note: state.note, version: farm.version + 1 } }); }
    if (path.endsWith("/api/farms")) return fulfill(route, { farms: [{ ...farm, note: state.note }] });
    if (path.endsWith("/api/caretakers")) return fulfill(route, { caretakers: [], history: true });
    if (path.endsWith("/api/houses")) return fulfill(route, { houses: [house] });
    if (path.endsWith("/api/flocks")) return fulfill(route, { flocks: [flock] });
    if (path.endsWith("/api/operational-events")) return fulfill(route, { events: [operationalEvent], nextCursor: null });
    if (path.endsWith("/api/abnormal-events")) return fulfill(route, { abnormalEvents: [], nextCursor: null });
    if (path.endsWith("/api/weather")) return fulfill(route, { weather: [] });
    if (path.endsWith("/api/timeline")) return fulfill(route, { timeline: [], nextCursor: null });
    if (path.endsWith("/api/finance")) return fulfill(route, { totals: { allocated: 0, expense: 0, net: 0 }, investors: [], farms: [], distributions: [], allocations: [], farmInvestorEquity: [] });
    if (path.endsWith("/api/farm-aliases")) return fulfill(route, { aliases: [] });
    if (path.endsWith("/api/data-health")) return fulfill(route, { warnings: [], checks: [], checkedAt: "2026-08-20T00:00:00Z" });
    if (path.endsWith("/api/audit")) return fulfill(route, { auditLogs: [auditRow], nextCursor: null });
    if (path.includes("/api/charts/")) return fulfill(route, { metric: "mortality", from: "2026-07-21", to: "2026-08-20", granularity: "daily", unit: "隻", definition: "每日死亡事件數。", status: "ok", series: [{ date: "2026-08-19", value: 2 }, { date: "2026-08-20", value: 5 }] });
    return fulfill(route, {});
  });
  return state;
}

async function login(page: Page) {
  await page.goto("./");
  await page.getByLabel("管理密碼").fill("test-only-fixture");
  await page.getByRole("button", { name: "登入管理中心" }).click();
  await expect(page.getByRole("heading", { name: "總覽", exact: true })).toBeVisible();
}

async function openDrawer(page: Page) {
  await page.getByRole("button", { name: "開啟導覽選單" }).click();
  await expect(page.locator("#primary-navigation")).toHaveClass(/drawer-open/);
}

async function navigateByDrawer(page: Page, label: string) {
  await openDrawer(page);
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  await expect(page.locator("#primary-navigation")).not.toHaveClass(/drawer-open/);
}

async function fakeSwipe(page: Page, options: { startX?: number; startY: number; endX?: number; endY: number; duration?: number; target?: string }) {
  await page.evaluate(async ({ startX = 180, startY, endX = 180, endY, duration = 0, target = "main" }) => {
    const element = document.querySelector(target);
    if (!element) throw new Error(`Missing swipe target: ${target}`);
    const touch = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", { value: type === "touchstart" ? [{ clientX: x, clientY: y }] : [] });
      Object.defineProperty(event, "changedTouches", { value: [{ clientX: x, clientY: y }] });
      element.dispatchEvent(event);
    };
    touch("touchstart", startX, startY);
    if (duration) await new Promise((resolve) => window.setTimeout(resolve, duration));
    touch("touchend", endX, endY);
  }, options);
}

async function expectNoBodyOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.client);
}

test.describe("mobile navigation information architecture", () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
  });

  test("drawer renders grouped hints, semantic SVG icons, and a primary-only topbar title", async ({ page }) => {
    await openDrawer(page);
    await expect(page.locator(".nav-group-title")).toHaveCount(NAV_GROUPS.length);
    for (const group of NAV_GROUPS) {
      await expect(page.getByText(group.label, { exact: true })).toBeAttached();
      await expect(page.getByRole("button", { name: group.label, exact: true })).toHaveCount(0);
    }
    await expect(page.locator(".sidebar-nav button[data-nav-key]")).toHaveCount(NAV_ITEMS.length);
    await expect(page.locator(".sidebar-nav svg.nav-icon[data-icon]")).toHaveCount(NAV_ITEMS.length);
    for (const item of NAV_ITEMS) {
      const button = page.locator(`[data-nav-key="${item.key}"]`);
      await expect(button.locator(".nav-label")).toHaveText(item.label);
      await expect(button.locator(".nav-hint")).toHaveText(`（${item.description}）`);
      await expect(button.locator("svg[data-icon]")).toHaveAttribute("data-icon", item.icon);
    }
    await expect(page.locator(".topbar h1")).toHaveText("總覽");
    await expect(page.locator(".topbar")).not.toContainText("今日重點");
  });

  test("drawer focus, close controls, active route, and browser history stay synchronized", async ({ page }) => {
    await openDrawer(page);
    await expect(page.locator('[data-nav-key="dashboard"]')).toBeFocused();
    await page.locator(".drawer-close").click();
    await expect(page.getByRole("button", { name: "開啟導覽選單" })).toBeFocused();
    await navigateByDrawer(page, "雞場");
    await expect(page).toHaveURL(/#\/farms$/);
    await expect(page.getByRole("heading", { name: "雞場", exact: true })).toBeVisible();
    await navigateByDrawer(page, "趨勢分析");
    await page.goBack();
    await expect(page).toHaveURL(/#\/farms$/);
    await openDrawer(page);
    await expect(page.locator('[data-nav-key="farms"]')).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(page.locator("#primary-navigation")).not.toHaveClass(/drawer-open/);
    await openDrawer(page);
    await page.locator(".drawer-backdrop").click({ position: { x: 385, y: 400 } });
    await expect(page.locator("#primary-navigation")).not.toHaveClass(/drawer-open/);
  });

  test("boundary swipe changes pages while normal, slow, horizontal, input, and chart gestures remain safe", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 120));
    await fakeSwipe(page, { startY: 430, endY: 210 });
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await fakeSwipe(page, { startY: 430, endY: 340, duration: 520 });
    await expect(page).toHaveURL(/#\/dashboard$/);
    await fakeSwipe(page, { startX: 40, startY: 340, endX: 260, endY: 315 });
    await expect(page).toHaveURL(/#\/dashboard$/);
    await fakeSwipe(page, { startY: 430, endY: 210 });
    await expect(page).toHaveURL(/#\/farms$/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await fakeSwipe(page, { startY: 210, endY: 430 });
    await expect(page).toHaveURL(/#\/dashboard$/);
    await navigateByDrawer(page, "雞場");
    await page.getByRole("button", { name: "編輯備註" }).click();
    await fakeSwipe(page, { startY: 400, endY: 180, target: "textarea" });
    await expect(page).toHaveURL(/#\/farms$/);
    await navigateByDrawer(page, "趨勢分析");
    await fakeSwipe(page, { startY: 400, endY: 180, target: ".chart-wrap" });
    await expect(page).toHaveURL(/#\/charts$/);
  });

  test("all pages expose a concise purpose and remain free of body-level overflow", async ({ page }) => {
    for (const item of NAV_ITEMS) {
      await page.evaluate((key) => { window.location.hash = `#/${key}`; }, item.key);
      await expect(page.locator(".topbar h1")).toHaveText(item.label);
      await expect(page.locator(".page-purpose")).toHaveText(item.pageDescription);
      await expectNoBodyOverflow(page);
    }
  });

  test("mobile cards, audit summary, and note state remain usable", async ({ page }) => {
    await navigateByDrawer(page, "雞場");
    await expect(page.locator(".farm-card")).toBeVisible();
    await expect(page.locator(".farm-card")).toContainText("測試雞場");
    await expect(page.locator(".farm-card")).toContainText("尚無備註");
    await page.getByRole("button", { name: "編輯備註" }).click();
    await page.locator("textarea").fill("測試場 mobile note");
    await page.getByRole("button", { name: "儲存備註" }).click();
    await expect(page.getByText("✅ 備註已儲存")).toBeVisible();
    await expect(page.locator(".farm-card")).toContainText("測試場 mobile note");
    await navigateByDrawer(page, "營運紀錄");
    await expect(page.locator(".mobile-card-list").last()).toHaveCSS("display", "grid");
    await expect(page.locator(".mobile-card").last()).toContainText("有效");
    await navigateByDrawer(page, "變更紀錄");
    await expect(page.locator(".mobile-card").last()).toContainText("farm_note_updated");
    await expect(page.locator(".mobile-card").last().getByText("查看修改差異")).toBeVisible();
    await expectNoBodyOverflow(page);
  });

  test("chart filters and touch tooltip render without clipping", async ({ page }) => {
    await navigateByDrawer(page, "趨勢分析");
    await expect(page.locator(".range-chips")).toBeVisible();
    await page.getByRole("button", { name: "7 日" }).click();
    await expect(page.locator(".chart-point").first()).toBeVisible();
    await page.locator(".chart-point").first().click();
    await expect(page.locator(".chart-tooltip")).toBeVisible();
    await expect(page.locator(".chart-tooltip")).toContainText("2026-08-19");
    const chartBox = await page.locator(".chart-wrap").boundingBox();
    expect(chartBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((chartBox?.x ?? 0) + (chartBox?.width ?? 0)).toBeLessThanOrEqual(390);
    await expectNoBodyOverflow(page);
  });
});

test.describe("保留訊息管理介面", () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.setViewportSize({ width: 1024, height: 900 });
    await login(page);
    await navigateByDrawer(page, "系統狀態");
  });

  test("列表可開啟查看／處理，過期訊息不顯示重新處理", async ({ page }) => {
    await page.getByRole("button", { name: /查看未完成訊息/ }).click();
    await expect(page.getByRole("button", { name: "查看／處理", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "查看／處理", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "這筆訊息尚未完成" })).toBeVisible();
    await expect(dialog).toContainText("原始訊息已超過保存時間，現在無法自動重新處理");
    await expect(dialog.getByRole("button", { name: "重新處理", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "補登資料", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "確認不用處理", exact: true })).toBeVisible();
    await dialog.locator("summary").filter({ hasText: "其他處理方式" }).click();
    await expect(dialog.getByRole("button", { name: "強制結案", exact: true })).toBeVisible();
  });

  test("我已查看會顯示已查看但尚待決定", async ({ page }) => {
    await page.getByRole("button", { name: "我已查看", exact: true }).click();
    const authorization = page.getByRole("dialog").filter({ hasText: "重新驗證管理權限" });
    await authorization.getByLabel("管理密碼").fill("test-only-fixture");
    await authorization.getByRole("button", { name: "驗證", exact: true }).click();
    await expect(page.getByText("已查看，但仍有 1 筆需要決定如何處理。", { exact: true })).toBeVisible();
    await expect(page.getByText("已查看待決定", { exact: true })).toBeVisible();
  });

  test("確認不用處理後會移出未完成並出現在已結案歷史", async ({ page }) => {
    await page.getByRole("button", { name: /查看未完成訊息/ }).click();
    await page.getByRole("button", { name: "查看／處理", exact: true }).click();
    const detail = page.getByRole("dialog");
    await detail.getByRole("button", { name: "確認不用處理", exact: true }).click();
    const resolution = page.getByRole("dialog").filter({ hasText: "訊息短編號" });
    await resolution.locator("textarea").first().fill("確認不需要建立正式紀錄");
    await resolution.getByRole("button", { name: "確認不用處理", exact: true }).click();
    const authorization = page.getByRole("dialog").filter({ hasText: "重新驗證管理權限" });
    await authorization.getByLabel("管理密碼").fill("test-only-fixture");
    await authorization.getByRole("button", { name: "驗證", exact: true }).click();
    await expect(page.getByText("已結案。", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("目前沒有未完成訊息。", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /查看已結案訊息/ }).click();
    await expect(page.getByText("確認不用處理", { exact: true })).toBeVisible();
  });

  test("強制結案需要原因與第二次確認", async ({ page }) => {
    await page.getByRole("button", { name: /查看未完成訊息/ }).click();
    await page.getByRole("button", { name: "查看／處理", exact: true }).click();
    const detail = page.getByRole("dialog");
    await detail.locator("summary").filter({ hasText: "其他處理方式" }).click();
    await detail.getByRole("button", { name: "強制結案", exact: true }).click();
    const forceDialog = page.getByRole("dialog").filter({ hasText: "強制結案" });
    await expect(forceDialog.getByRole("checkbox", { name: /我已確認/ })).toBeVisible();
    await forceDialog.getByRole("button", { name: "確認強制結案", exact: true }).click();
    await expect(forceDialog).toContainText("請填寫原因");
    await forceDialog.locator("textarea").first().fill("原始內容已遺失，確認不再追查");
    await forceDialog.getByRole("button", { name: "確認強制結案", exact: true }).click();
    await expect(forceDialog).toContainText("請再次確認");
  });
});

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`viewport ${viewport.width}x${viewport.height} keeps the grouped drawer readable and contained`, async ({ page }, testInfo) => {
    await installMockApi(page);
    await page.setViewportSize(viewport);
    await login(page);
    if (viewport.width < 1024) await openDrawer(page);
    const sidebar = page.locator("#primary-navigation");
    await expect(sidebar).toBeVisible();
    await expect.poll(async () => (await sidebar.boundingBox())?.x ?? -999).toBeGreaterThanOrEqual(-1);
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.width ?? 0).toBeGreaterThanOrEqual(viewport.width < 1024 ? Math.min(viewport.width * .72, 300) : 239);
    expect(sidebarBox?.width ?? 0).toBeLessThanOrEqual(viewport.width < 1024 ? Math.min(viewport.width * .78, 320) + 1 : 241);
    const nav = page.locator(".sidebar-nav");
    const navMetrics = await nav.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
    expect(navMetrics.clientHeight).toBeGreaterThan(0);
    expect(navMetrics.scrollHeight).toBeGreaterThan(navMetrics.clientHeight);
    await nav.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const settingsButton = page.locator('[data-nav-key="settings"]');
    await expect(settingsButton).toBeVisible();
    const navBox = await nav.boundingBox();
    const settingsBox = await settingsButton.boundingBox();
    expect(settingsBox?.y ?? -1).toBeGreaterThanOrEqual((navBox?.y ?? 0) - 1);
    expect((settingsBox?.y ?? 0) + (settingsBox?.height ?? 0)).toBeLessThanOrEqual((navBox?.y ?? 0) + (navBox?.height ?? 0) + 1);
    await expect(page.locator(".logout-button")).toBeVisible();
    const footerBox = await page.locator(".sidebar-foot").boundingBox();
    expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 1);
    const touchTargets = await page.locator(".sidebar-nav button, .logout-button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(touchTargets.every((height) => height >= 44)).toBe(true);
    const clipped = await page.locator(".sidebar-nav button").evaluateAll((buttons) => buttons.some((button) => button.scrollWidth > button.clientWidth + 1));
    expect(clipped).toBe(false);
    await expectNoBodyOverflow(page);
    const screenshotPath = testInfo.outputPath(`drawer-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(`drawer-${viewport.width}x${viewport.height}`, { path: screenshotPath, contentType: "image/png" });
  });
}
