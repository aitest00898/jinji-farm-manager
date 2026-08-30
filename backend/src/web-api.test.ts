import { describe, expect, it } from "vitest";
import { isAllowedWebOrigin, normalizeAuditChangedFields } from "./web-api";

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

  it("normalizes current and legacy audit changed-field shapes", () => {
    expect(normalizeAuditChangedFields('["note"]')).toEqual(["note"]);
    expect(normalizeAuditChangedFields('[{"field":"conversationV2Enabled","from":false,"to":true}]')).toEqual(["conversationV2Enabled"]);
    expect(normalizeAuditChangedFields('[{"field":" note "},{"field":"note"},null,3]')).toEqual(["note"]);
    expect(normalizeAuditChangedFields("not-json")).toEqual([]);
    expect(normalizeAuditChangedFields({ field: "note" })).toEqual([]);
  });
});
