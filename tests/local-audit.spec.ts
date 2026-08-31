import { expect, test } from "@playwright/test";
import { NAV_ITEMS } from "../src/navigation";

// LOCAL_ADAPTER_E2E: exercises the in-memory audit adapter; it must not contact a remote origin.
const LOCAL_URL = "./?audit=local#/dashboard";
const LOCAL_ORIGIN = `http://127.0.0.1:${process.env.AUDIT_PORT ?? "5173"}`;

async function loginLocal(
  page: import("@playwright/test").Page,
  hash = "#/dashboard",
  expectedHeading = "總覽",
) {
  await page.goto(`./?audit=local${hash}`);
  await expect(page.getByRole("status").filter({ hasText: "本地稽核模式 / 100% 虛擬資料 / 不連正式環境" })).toBeVisible();
  const password = page.getByLabel("本地稽核密碼");
  if (await password.isVisible()) {
    await password.fill("audit-local-only");
    await page.getByRole("button", { name: "登入本地稽核環境" }).click();
  }
  await expect(page.locator(".topbar h1")).toHaveText(expectedHeading);
}

test.describe("local external audit environment", () => {
  test("logs in with the virtual password and blocks non-local HTTP requests", async ({ page }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== LOCAL_ORIGIN) externalRequests.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await loginLocal(page);
    await expect(page.locator(".local-audit-banner")).toHaveText("本地稽核模式 / 100% 虛擬資料 / 不連正式環境");
    await expect(page.locator(".top-actions")).toContainText("本地稽核");
    await expect(page.locator(".farm-row")).toHaveCount(5);
    await expect(page.locator("body")).not.toContainText("https://");
    await expect(externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("renders every existing route key against the same synthetic adapter", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== LOCAL_ORIGIN) externalRequests.push(request.url());
    });
    for (const item of NAV_ITEMS) {
      await loginLocal(page, `#/${item.key}`, item.label);
      await expect(page.locator(".page-purpose")).toHaveText(item.pageDescription);
    }
    expect(externalRequests).toEqual([]);
  });

  test("keeps local mutations stateful, auditable, and resettable", async ({ page }) => {
    await loginLocal(page, "#/farms", "雞場");
    await page.getByRole("button", { name: "編輯備註" }).first().click();
    await page.locator(".farm-card").first().locator("textarea").fill("本地稽核操作備註");
    await page.getByRole("button", { name: "儲存備註" }).click();
    await expect(page.locator(".farm-card").first()).toContainText("本地稽核操作備註");

    await loginLocal(page, "#/caretakers", "飼養者");
    await page.getByLabel("新增飼養者").fill("本地新增飼養者");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await expect(page.locator(".card-grid")).toContainText("本地新增飼養者");

    await loginLocal(page, "#/ai", "AI 助理");
    await page.getByLabel("請輸入問題").fill("這一批最近有哪些異常？");
    await page.getByRole("button", { name: "開始分析" }).click();
    await expect(page.getByText("模擬分析結果", { exact: true })).toBeVisible();
    await expect(page.locator(".analysis-report")).toContainText("synthetic-audit-fixture");
    await expect(page.locator(".analysis-report")).toContainText("沒有呼叫 Workers AI");

    await page.reload();
    await loginLocal(page, "#/ai", "AI 助理");
    await expect(page.locator(".analysis-report")).not.toBeVisible();

    await loginLocal(page, "#/audit", "變更紀錄");
    await expect(page.locator(".mobile-card-list").last()).toContainText("local_fixture_loaded");
    await expect(page.locator(".mobile-card-list").last()).toContainText("synthetic-audit-");
  });
});
