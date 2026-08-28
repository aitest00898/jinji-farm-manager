import { describe, expect, it } from "vitest";
import { classifyInput, parseCommand } from "./core";

describe("farm admin command classification", () => {
  it.each([
    ["新增養雞場 大仁新場", "create_farm"],
    ["建立雞場 大仁新場", "create_farm"],
    ["封存養雞場 大仁新場", "archive_farm"],
    ["刪除雞場 大仁新場", "archive_farm"],
    ["新增測試場 新測試場", "create_test_farm"],
    ["封存測試場 新測試場", "archive_test_farm"],
  ])("parses %s as %s", (input, kind) => {
    expect(parseCommand(input).kind).toBe(kind);
    expect(classifyInput(input)).toBe("ADMIN");
  });

  it("returns usage for bare production admin prefixes", () => {
    expect(parseCommand("新增養雞場").kind).toBe("create_farm_usage");
    expect(parseCommand("封存養雞場").kind).toBe("archive_farm_usage");
  });
});
