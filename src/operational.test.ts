import { describe, expect, it } from "vitest";
import {
  parseAiOperationalIntent,
  parseCommand,
  type OperationalDraft,
} from "./core";
import { FarmResolver } from "./farm-resolver";

const farms = [
  { id: "farm-erlin", name: "林志騰二林場", active: 1 },
  { id: "farm-dongshi", name: "林志騰東勢場", active: 1 },
  { id: "farm-liao", name: "廖纔藝場", active: 1 },
  { id: "farm-longtan", name: "陳駿榜龍潭場", active: 1 },
  { id: "farm-hongxiumei", name: "洪秀美場", active: 1 },
  { id: "farm-taibao", name: "黃惠玲太保場", active: 1 },
  { id: "farm-linkaiwei", name: "林楷威場", active: 1 },
  { id: "farm-hongjiaqing", name: "洪嘉卿場", active: 1 },
];

const aliases = [
  { farmId: "farm-erlin", alias: "二林場", normalizedAlias: "二林", aliasType: "short_name" as const, status: "trusted" as const },
  { farmId: "farm-dongshi", alias: "東勢場", normalizedAlias: "東勢", aliasType: "short_name" as const, status: "trusted" as const },
  { farmId: "farm-hongxiumei", alias: "洪秀梅", normalizedAlias: "洪秀梅", aliasType: "homophone" as const, status: "candidate" as const },
];

const resolver = new FarmResolver(farms, aliases);

describe("Operational V1 deterministic parser", () => {
  it.each([
    ["洪秀美場死亡5", "mortality", 5, "隻", "洪秀美場"],
    ["洪秀美場1舍死亡5", "mortality", 5, "隻", "洪秀美場"],
    ["金雞測試場 測試1舍 死亡5", "mortality", 5, "隻", "金雞測試場"],
    ["金雞測試場 測試99舍 死亡5", "mortality", 5, "隻", "金雞測試場"],
    ["洪秀美今天死5隻", "mortality", 5, "隻", "洪秀美"],
    ["東勢場飼料800公斤", "feed", 800, "kg", "東勢場"],
    ["黃惠玲太保場飲水2.3噸", "water", 2300, "L", "黃惠玲太保場"],
    ["飼料 3舍 800kg", "feed", 800, "kg", null],
    ["死亡5", "mortality", 5, "隻", null],
  ])("parses %s without AI", (input, intent, quantity, unit, farmText) => {
    const parsed = parseCommand(input);
    expect(parsed.kind).toBe("record_operational");
    const draft = (parsed as { kind: "record_operational"; draft: OperationalDraft }).draft;
    expect(draft.intent).toBe(intent);
    expect(draft.quantity).toBe(quantity);
    expect(draft.unit).toBe(unit);
    expect(draft.farmText).toBe(farmText);
    if (input === "飼料 3舍 800kg") expect(draft.house).toBe("3舍");
    if (input === "洪秀美場1舍死亡5") expect(draft.house).toBe("1舍");
    if (input === "金雞測試場 測試1舍 死亡5") expect(draft.house).toBe("測試1舍");
    if (input === "金雞測試場 測試99舍 死亡5") expect(draft.house).toBe("測試99舍");
  });

  it("keeps today mortality deterministic and supports farm-specific lookup", () => {
    expect(parseCommand("今天死亡")).toEqual({ kind: "query_today_mortality", house: undefined });
    expect(parseCommand("洪秀美場今天死亡")).toEqual({ kind: "query_farm_today_mortality", farmName: "洪秀美場" });
    expect(parseCommand("洪秀美死亡")).toEqual({ kind: "query_farm_today_mortality", farmName: "洪秀美" });
  });
});

describe("FarmResolver safety boundary", () => {
  it("directly resolves canonical names and trusted short aliases", () => {
    expect(resolver.resolve("林志騰二林場").kind).toBe("direct");
    expect(resolver.resolve("二林").farm?.name).toBe("林志騰二林場");
    expect(resolver.resolve("東勢場").farm?.name).toBe("林志騰東勢場");
  });

  it("does not choose between two farms sharing a name fragment", () => {
    const result = resolver.resolve("林志騰");
    expect(result.kind).toBe("candidates");
    expect(result.candidates.map((candidate) => candidate.farmName)).toEqual([
      "林志騰二林場",
      "林志騰東勢場",
    ]);
  });

  it("keeps a first typo/homophone match as a candidate", () => {
    const result = resolver.resolve("洪秀梅");
    expect(result.kind).toBe("candidates");
    expect(result.candidates[0].farmName).toBe("洪秀美場");
    expect(["alias_candidate", "fuzzy", "substring"]).toContain(result.candidates[0].reason);
    expect(resolver.resolve("不存在的雞場").kind).toBe("none");
  });

  it("resolves an explicitly mapped site name without changing the canonical farm name", () => {
    const siteResolver = new FarmResolver([
      { id: "farm-site", name: "新莊合作場", siteName: "新莊" },
    ]);
    expect(siteResolver.resolve("新莊")).toMatchObject({ kind: "direct", farm: { id: "farm-site", name: "新莊合作場" } });
  });
});

describe("Operational AI contract", () => {
  const knownIds = new Set(farms.map((farm) => farm.id));

  it("accepts only known farm IDs and forces human confirmation", () => {
    const parsed = parseAiOperationalIntent(
      JSON.stringify({
        intent: "record_mortality",
        quantity: 5,
        unit: "隻",
        farmText: "洪家卿",
        candidateFarmIds: ["farm-hongjiaqing"],
        confidence: 0.81,
        needsConfirmation: false,
      }),
      knownIds,
    );
    expect(parsed?.candidateFarmIds).toEqual(["farm-hongjiaqing"]);
    expect(parsed?.needsConfirmation).toBe(true);
    expect(parseAiOperationalIntent(
      JSON.stringify({ intent: "record_mortality", quantity: 5, unit: "隻", farmText: "新雞場", candidateFarmIds: ["invented"], confidence: 1, needsConfirmation: false }),
      knownIds,
    )).toBeNull();
  });
});
