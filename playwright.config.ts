import { defineConfig, devices } from "@playwright/test";

const auditPort = process.env.AUDIT_PORT ?? "5173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${auditPort}/jinji-farm-manager/`,
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${auditPort}`,
    url: `http://127.0.0.1:${auditPort}/jinji-farm-manager/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
