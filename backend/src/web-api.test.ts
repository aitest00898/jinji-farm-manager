import { describe, expect, it } from "vitest";
import { isAllowedWebOrigin } from "./web-api";

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
});
