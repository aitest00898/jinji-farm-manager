import { describe, expect, it } from "vitest";
import { classifyWebRoute, webAccessClassAllows } from "./web-access-policy";

describe("Web access policy", () => {
  it("classifies public reads and rejects unclassified detail routes", () => {
    for (const path of [
      "/api/organizations",
      "/api/dashboard",
      "/api/farms",
      "/api/farms/farm-1",
      "/api/houses",
      "/api/flocks",
      "/api/lifecycle",
      "/api/records",
      "/api/operational-events",
      "/api/abnormal-events",
      "/api/timeline",
      "/api/weather",
      "/api/ai/live-status",
      "/api/charts/stock",
    ]) {
      expect(classifyWebRoute(path, "GET")).toBe("PUBLIC");
    }
    expect(classifyWebRoute("/api/houses/house-1", "GET")).toBeNull();
    expect(classifyWebRoute("/api/flocks/flock-1", "GET")).toBeNull();
    expect(classifyWebRoute("/api/not-a-route", "GET")).toBeNull();
  });

  it("classifies shared operational reads, writes, and finance reads", () => {
    for (const [method, path] of [
      ["GET", "/api/finance"],
      ["GET", "/api/ai/brief"],
      ["GET", "/api/ai/reports"],
      ["GET", "/api/charts/finance"],
      ["POST", "/api/records"],
      ["POST", "/api/records/record-1/correct"],
      ["POST", "/api/records/record-1/reverse"],
      ["POST", "/api/operational-events"],
      ["POST", "/api/abnormal-events"],
      ["POST", "/api/flocks"],
    ] as const) {
      expect(classifyWebRoute(path, method)).toBe("SHARED_EDIT");
    }
    expect(classifyWebRoute("/api/finance", "POST")).toBe("ADMIN");
  });

  it("classifies administration and enforces the access rank", () => {
    for (const [method, path] of [
      ["GET", "/api/data-health"],
      ["GET", "/api/line-groups"],
      ["GET", "/api/audit"],
      ["POST", "/api/farms"],
      ["POST", "/api/operators/operator-1/scopes"],
      ["POST", "/api/line-groups/group-1/organization-claim"],
      ["PATCH", "/api/line-groups/group-1/operational-authorization"],
      ["PATCH", "/api/farms/farm-1"],
    ] as const) {
      expect(classifyWebRoute(path, method)).toBe("ADMIN");
    }
    expect(webAccessClassAllows("PUBLIC", "PUBLIC")).toBe(true);
    expect(webAccessClassAllows("SHARED_EDIT", "PUBLIC")).toBe(true);
    expect(webAccessClassAllows("ADMIN", "SHARED_EDIT")).toBe(true);
    expect(webAccessClassAllows("PUBLIC", "SHARED_EDIT")).toBe(false);
    expect(webAccessClassAllows("SHARED_EDIT", "ADMIN")).toBe(false);
  });
});
