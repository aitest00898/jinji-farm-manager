import { describe, expect, it } from "vitest";
import { parseQuickItemsForTest, parseQuickSegmentsForTest, quickRecordLooksRelevant, type QuickFarm } from "./quick-record";

const receivedAt = "2026-08-20T05:00:00.000Z";

describe("quick record parser", () => {
  it("parses one message into operational and abnormal items", () => {
    const parsed = parseQuickItemsForTest("死亡32 咳嗽 臭腳", receivedAt);
    expect(parsed.items.map((item) => [item.itemType, item.intent, item.quantity, item.rawText])).toEqual([
      ["operational", "mortality", 32, "死亡 32"],
      ["abnormal", null, null, "咳嗽"],
      ["abnormal", null, null, "臭腳"],
    ]);
    expect(parsed.items.every((item) => item.timing.reportedAt === receivedAt)).toBe(true);
  });

  it("converts water tons but preserves feed bags", () => {
    const water = parseQuickItemsForTest("飲水2.3噸", receivedAt).items[0];
    const feed = parseQuickItemsForTest("飼料20包", receivedAt).items[0];
    expect(water).toMatchObject({ intent: "water", quantity: 2300, unit: "L" });
    expect(feed).toMatchObject({ intent: "feed", quantity: 20, unit: "包" });
  });

  it("does not turn a negated mortality phrase into a write", () => {
    expect(parseQuickItemsForTest("洪秀美今天沒有死亡5隻", receivedAt).items).toEqual([]);
  });

  it("recognizes only bounded operational or observation language", () => {
    expect(quickRecordLooksRelevant("死亡5")).toBe(true);
    expect(quickRecordLooksRelevant("氣溫太高")).toBe(true);
    expect(quickRecordLooksRelevant("晚餐吃什麼")).toBe(false);
  });

  it("treats a farm after unresolved items as a suffix boundary", () => {
    const farms: QuickFarm[] = [
      { id: "aaa", name: "AAA場", environment: "test", structureMode: "whole_farm", active: 1 },
      { id: "bbb", name: "BBB場", environment: "test", structureMode: "whole_farm", active: 1 },
    ];
    const parsed = parseQuickSegmentsForTest("死亡3 AAA場 咳嗽 白冠 BBB場", receivedAt, farms);
    expect(parsed.segments.filter((segment) => segment.items.length).map((segment) => [segment.farmId, segment.items.map((item) => item.rawText)])).toEqual([
      ["aaa", ["死亡 3"]],
      ["bbb", ["咳嗽", "白冠"]],
    ]);
  });

  it("keeps a longer canonical farm name ahead of a shorter substring", () => {
    const farms: QuickFarm[] = [
      { id: "a", name: "金雞測試場", environment: "test", structureMode: "whole_farm", active: 1 },
      { id: "b", name: "金雞測試場B", environment: "test", structureMode: "whole_farm", active: 1 },
    ];
    const parsed = parseQuickSegmentsForTest("金雞測試場B死亡5", receivedAt, farms);
    expect(parsed.farmOnly).toBeNull();
    expect(parsed.segments[0]).toMatchObject({ farmId: "b" });
    expect(parsed.segments[0].items[0]).toMatchObject({ intent: "mortality", quantity: 5 });
  });
});
