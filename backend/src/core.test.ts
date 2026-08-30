import { describe, expect, it } from "vitest";
import {
  botName,
  classifyCommand,
  classifyInput,
  joinReply,
  parseAiIntent,
  parseCommand,
  safeRejectionReply,
  unboundReply,
} from "./core";

describe("LINE command parser", () => {
  it("parses the production mortality example", () => {
    expect(parseCommand("死亡 3舍 5")).toEqual({
      kind: "mortality",
      house: "3舍",
      amount: 5,
    });
  });

  it("accepts full-width punctuation and count suffixes", () => {
    expect(parseCommand("死亡：３舍　５隻")).toEqual({
      kind: "mortality",
      house: "3舍",
      amount: 5,
    });
  });

  it("parses inventory, binding, summary, and ping", () => {
    expect(parseCommand("存欄 3舍 11859隻")).toEqual({
      kind: "inventory",
      house: "3舍",
      amount: 11859,
    });
    expect(parseCommand("綁定 金雞示範場")).toEqual({
      kind: "bind",
      farmName: "金雞示範場",
    });
    expect(parseCommand("今日 3舍")).toEqual({
      kind: "summary",
      house: "3舍",
    });
    expect(parseCommand("ping")).toEqual({ kind: "ping" });
  });

  it("parses test-farm management commands deterministically", () => {
    expect(parseCommand("新增測試場 金雞測試場")).toEqual({ kind: "create_test_farm", farmName: "金雞測試場" });
    expect(parseCommand("建立測試雞場 金雞測試場")).toEqual({ kind: "create_test_farm", farmName: "金雞測試場" });
    expect(parseCommand("封存測試場 金雞測試場")).toEqual({ kind: "archive_test_farm", farmName: "金雞測試場" });
    expect(parseCommand("刪除測試場 金雞測試場")).toEqual({ kind: "archive_test_farm", farmName: "金雞測試場" });
    expect(parseCommand("測試場列表")).toEqual({ kind: "test_farm_list" });
    expect(parseCommand("新增測試場")).toEqual({ kind: "create_test_farm_usage" });
    expect(parseCommand("封存測試場")).toEqual({ kind: "archive_test_farm_usage" });
  });

  it("parses confirmation-gated Phase 2 master-data commands", () => {
    expect(parseCommand("新增雞舍 金雞測試場 測試1舍")).toEqual({
      kind: "create_house",
      farmName: "金雞測試場",
      houseName: "測試1舍",
    });
    expect(parseCommand("新增批次 金雞測試場 測試1舍 TEST-BATCH 入雛 2026-08-20 12000 出雞 2026-11-20")).toEqual({
      kind: "create_flock",
      farmName: "金雞測試場",
      houseName: "測試1舍",
      batchCode: "TEST-BATCH",
      chickInDate: "2026-08-20",
      initialCount: 12000,
      expectedShipmentDate: "2026-11-20",
    });
    expect(parseCommand("新增雞舍").kind).toBe("create_house_usage");
    expect(parseCommand("新增批次").kind).toBe("create_flock_usage");
    expect(classifyInput("新增雞舍 金雞測試場 測試1舍")).toBe("ADMIN");
    expect(classifyInput("新增批次 金雞測試場 測試1舍 TEST-BATCH 入雛 2026-08-20 12000")).toBe("ADMIN");
  });

  it("classifies control commands separately from pending responses", () => {
    expect(classifyCommand(parseCommand("取消"))).toBe("CONTROL");
    expect(classifyInput("確認")).toBe("PENDING_RESPONSE");
    expect(classifyInput("9")).toBe("PENDING_RESPONSE");
    expect(classifyInput("金雞測試場")).toBe("UNKNOWN");
  });

  it("keeps mortality lookups deterministic and out of AI", () => {
    const cases = [
      "今天死亡",
      "今日死亡",
      "今天死亡數",
      "今日死亡數",
      "3舍死亡",
      "3舍今日死亡",
      "3舍今天死亡",
    ];
    for (const input of cases) {
      expect(parseCommand(input)).toEqual({ kind: "query_today_mortality", house: input.startsWith("3舍") ? "3舍" : undefined });
    }
  });

  it("parses the required deterministic operational queries", () => {
    expect(parseCommand("目前存欄")).toEqual({ kind: "query_inventory", house: undefined });
    expect(parseCommand("現在存欄")).toEqual({ kind: "query_inventory", house: undefined });
    expect(parseCommand("3舍存欄")).toEqual({ kind: "query_inventory", house: "3舍" });
    expect(parseCommand("3舍日齡")).toEqual({ kind: "query_flock_age", house: "3舍" });
    expect(parseCommand("金雞測試場 測試1舍 目前存欄")).toEqual({
      kind: "query_inventory",
      farmName: "金雞測試場",
      house: "測試1舍",
    });
    expect(parseCommand("金雞測試場 測試1舍 日齡")).toEqual({
      kind: "query_flock_age",
      farmName: "金雞測試場",
      house: "測試1舍",
    });
    expect(parseCommand("下週出雞")).toEqual({ kind: "query_upcoming_shipments" });
    expect(parseCommand("近期出雞")).toEqual({ kind: "query_upcoming_shipments" });
  });

  it("parses deterministic finance query aliases", () => {
    expect(parseCommand("雞場列表")).toEqual({ kind: "query_farm_list" });
    expect(parseCommand("各場持股")).toEqual({ kind: "query_equity" });
    expect(parseCommand("我的持股")).toEqual({ kind: "query_my_equity" });
    expect(parseCommand("洪秀美場盈虧")).toEqual({ kind: "query_farm_profit", farmName: "洪秀美場" });
    expect(parseCommand("各場盈虧")).toEqual({ kind: "query_farm_profit_list" });
    expect(parseCommand("大富翁盈虧")).toEqual({ kind: "query_portfolio_profit" });
    expect(parseCommand("我的累計盈虧")).toEqual({ kind: "query_investor_profit" });
  });

  it("recognizes the exact interactive menu command without matching surrounding text", () => {
    expect(parseCommand("選單")).toEqual({ kind: "menu" });
    expect(parseCommand("功能選單")).toEqual({ kind: "menu" });
    expect(parseCommand("選單為什麼沒有資料").kind).toBe("unknown");
    expect(classifyCommand(parseCommand("選單"))).toBe("CONTROL");
  });

  it("maps Message Action text to exact deterministic menu commands", () => {
    const cases: Array<[string, string]> = [
      ["快速紀錄", "menu_quick_record"],
      ["今日營運", "menu_today_summary"],
      ["場次／批次", "menu_farms"],
      ["最近異常", "menu_recent_abnormal"],
      ["更正紀錄", "menu_correction_help"],
      ["雲林天氣", "menu_weather"],
      ["AI營運分析", "menu_ai"],
      ["財務摘要", "menu_finance"],
      ["歷史紀錄", "menu_audit"],
      ["變更紀錄", "menu_audit"],
      ["使用說明", "menu_help"],
    ];
    for (const [input, kind] of cases) {
      expect(parseCommand(input)).toEqual({ kind });
      expect(classifyInput(input)).toBe("CONTROL");
    }
    expect(parseCommand("管理功能")).toEqual({ kind: "menu_management" });
    expect(parseCommand("開發選單")).toEqual({ kind: "menu_developer" });
    expect(classifyInput("管理功能")).toBe("CONTROL");
    expect(classifyInput("開發選單")).toBe("CONTROL");
    expect(parseCommand("今日營運為什麼沒有資料").kind).toBe("unknown");
    expect(parseCommand("最近異常有哪些").kind).toBe("unknown");
  });

  it("accepts the plain-Chinese labels used by the layered menus", () => {
    expect(parseCommand("今日狀況")).toEqual({ kind: "menu_today_summary" });
    expect(parseCommand("雞場與批次")).toEqual({ kind: "menu_farms" });
    expect(parseCommand("修改紀錄")).toEqual({ kind: "menu_correction_help" });
    expect(parseCommand("AI分析")).toEqual({ kind: "menu_ai" });
    expect(parseCommand("待確認資料")).toEqual({ kind: "menu_pending_candidates" });
  });

  it("recognizes manual ambient digest only as a mention-gated command kind", () => {
    expect(parseCommand("摘要")).toEqual({ kind: "ambient_digest_now" });
    expect(parseCommand("摘要")).toSatisfy((command) => classifyCommand(command) === "UNKNOWN");
    expect(parseCommand("摘要給我").kind).toBe("unknown");
  });

  it("recognizes the exact read-only pending Ambient preview command", () => {
    expect(parseCommand("顯示待摘要訊息")).toEqual({ kind: "pending_ambient_preview" });
    expect(classifyInput("顯示待摘要訊息")).toBe("CONTROL");
    expect(parseCommand("顯示待摘要訊息喔").kind).toBe("unknown");
    expect(parseCommand("待摘要訊息").kind).toBe("unknown");
  });

  it("accepts only the structured AI intent contract", () => {
    expect(parseAiIntent('{"intent":"query_today_mortality"}')).toEqual({
      kind: "query_today_mortality",
      house: undefined,
    });
    expect(parseAiIntent('{"intent":"query_farm_profit","farm":"洪秀美場"}')).toEqual({
      kind: "query_farm_profit",
      farmName: "洪秀美場",
    });
    expect(parseAiIntent('{"intent":"chat","response":"餐廳在哪裡？"}')).toBeNull();
    expect(parseAiIntent("我不知道")).toBeNull();
  });

  it("fails closed for unknown text", () => {
    expect(parseCommand("請幫我看一下")).toEqual({
      kind: "unknown",
      text: "請幫我看一下",
    });
  });
});

describe("production replies", () => {
  it("uses the production identity without printing the account id", () => {
    expect(botName()).toBe("🐔 金雞協會助理Ai");
    expect(botName()).not.toContain("@550rsdwc");
  });

  it("uses the official welcome and explains the unbound state", () => {
    expect(joinReply()).toContain("🐔 金雞協會助理Ai");
    expect(joinReply()).toContain("雞場列表");
    expect(joinReply()).toContain("⚠️ 本群目前尚未完成資料綁定。");
    expect(joinReply()).not.toContain("查找雞場位置");
    expect(unboundReply()).toContain("尚未綁定雞場資料");
    expect(safeRejectionReply()).toContain("沒有改動資料");
  });
});
