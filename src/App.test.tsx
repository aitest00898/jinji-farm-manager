import { describe, expect, it } from "vitest";
import { API_BASE } from "./api";

describe("Web management safety contract", () => {
  it("uses the existing Worker API by default", () => {
    expect(API_BASE).toBe("https://chicken-line-production.jinji-assistant.workers.dev");
  });
  it("does not put an admin password or token in the public API base", () => {
    expect(API_BASE).not.toMatch(/FARM_ADMIN_PASSWORD_HASH|Bearer/iu);
  });
});
