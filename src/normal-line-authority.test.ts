import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");

function sourceBlock(startMarker: string, endMarker: string): string {
  const start = indexSource.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = indexSource.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return indexSource.slice(start, end);
}

describe("normal LINE authority boundary", () => {
  it("does not let the legacy bind command mutate group farm state", () => {
    const bindBlock = sourceBlock(
      "if (command.kind === \"bind\") {",
      "if (!unifiedIntent || unifiedIntent.intent === \"unknown\")",
    );
    expect(bindBlock).not.toContain("UPDATE line_groups");
    expect(bindBlock).toContain("本次沒有變更群組或正式資料");
  });

  it("protects reliability redisplay with the authorized-group trust seam", () => {
    const redisplayBlock = sourceBlock(
      "if (action === \"reliability_redisplay\") {",
      "if (action === \"ambient_preview_page\"",
    );
    expect(redisplayBlock).toContain("state.organizationId");
    expect(redisplayBlock).toContain("requireLineGroupOperationalTrust");
  });
});
