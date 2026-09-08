import { describe, expect, it } from "vitest";
import { addOperationalEnvironmentFilter, DEFAULT_OPERATIONAL_ENVIRONMENT, isAllowedWebOrigin, operationalEnvironmentFor } from "./web-api";

describe("Web API boundary", () => {
  it("allows only the Pages origin and local Vite origins", () => {
    expect(isAllowedWebOrigin("https://aitest00898.github.io")).toBe(true);
    expect(isAllowedWebOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedWebOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedWebOrigin("https://example.com")).toBe(false);
    expect(isAllowedWebOrigin(null)).toBe(false);
  });

  it("does not permit wildcard origin semantics", () => {
    expect(isAllowedWebOrigin("*")).toBe(false);
    expect(isAllowedWebOrigin("https://aitest00898.github.io.evil.example")).toBe(false);
  });

  it("defaults operational reads to Production and only exposes Test explicitly", () => {
    expect(DEFAULT_OPERATIONAL_ENVIRONMENT).toBe("production");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events"))).toBe("production");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events?environment=test"))).toBe("test");
    expect(operationalEnvironmentFor(new URL("https://example.test/api/events?environment=all"))).toBe("production");
  });

  it("adds a bounded farm environment predicate without accepting a free-form SQL value", () => {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    expect(addOperationalEnvironmentFilter(new URL("https://example.test/api/events"), clauses, bindings, "farm")).toBe("production");
    expect(clauses).toEqual(["farm.environment = ?"]);
    expect(bindings).toEqual(["production"]);
  });
});
