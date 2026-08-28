import { describe, expect, it } from "vitest";
import { classifyInput, parseCommand } from "./core";

describe("pending action priority routing", () => {
  it.each([
    ["金雞測試場死亡5", "COMPLETE_OPERATIONAL_EVENT"],
    ["金雞側市場死亡1", "COMPLETE_OPERATIONAL_EVENT"],
    ["洪秀美場飼料800kg", "COMPLETE_OPERATIONAL_EVENT"],
  ])("treats %s as a new complete event before pending selection", (input, expected) => {
    expect(classifyInput(input)).toBe(expected);
  });

  it("treats a new query as an interrupting query", () => {
    expect(classifyInput("今天死亡")).toBe("QUERY");
  });

  it.each([
    "新增測試場 金雞測試場",
    "新增測試場",
    "建立測試雞場 金雞測試場",
    "封存測試場 金雞測試場",
    "封存測試場",
    "刪除測試場 金雞測試場",
    "測試場列表",
  ])("treats %s as an admin command before pending selection", (input) => {
    expect(classifyInput(input)).toBe("ADMIN");
  });

  it("leaves bare number, confirmation, and bare farm name for pending response handling", () => {
    expect(classifyInput("9")).toBe("PENDING_RESPONSE");
    expect(classifyInput("確認")).toBe("PENDING_RESPONSE");
    expect(classifyInput("金雞測試場")).toBe("UNKNOWN");
  });

  it("keeps parser contracts for the two bare admin prefixes", () => {
    expect(parseCommand("新增測試場").kind).toBe("create_test_farm_usage");
    expect(parseCommand("封存測試場").kind).toBe("archive_test_farm_usage");
  });
});
