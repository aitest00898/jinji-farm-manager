import { describe, expect, it } from "vitest";
import { webSessionIsActive } from "./domain";

describe("web session lifetime", () => {
  it("requires login again after the session expiry instant", () => {
    expect(webSessionIsActive("2026-08-22T00:30:00.000Z", "2026-08-22T00:29:59.999Z")).toBe(true);
    expect(webSessionIsActive("2026-08-22T00:30:00.000Z", "2026-08-22T00:30:00.000Z")).toBe(false);
    expect(webSessionIsActive("2026-08-22T00:30:00.000Z", "2026-08-22T00:30:00.001Z")).toBe(false);
  });
});
