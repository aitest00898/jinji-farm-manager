import { describe, expect, it } from "vitest";
import { parseCommand } from "./core";
import { FarmResolver } from "./farm-resolver";
import {
  deterministicToUnified,
  farmFragmentFromInput,
  normalizeAiUnifiedIntent,
  operationalDraftFromUnified,
  parseAiUnifiedIntent,
  shouldInvokeSemanticAi,
  shouldPreferAiOverDeterministic,
} from "./semantic";

const farms = [
  { id: "farm-hongxiumei", name: "洪秀美場", active: 1, environment: "production" as const },
  { id: "farm-test", name: "金雞測試場", active: 1, environment: "test" as const },
];

describe("UnifiedIntent deterministic fast path", () => {
  it("maps simple operational and query commands to the shared schema", () => {
    const operation = deterministicToUnified(parseCommand("洪秀美死亡5"));
    expect(operation).toMatchObject({
      intent: "record_mortality",
      farmText: "洪秀美",
      quantity: 5,
      unit: "bird",
      source: "deterministic",
      confidence: 1,
    });
    expect(deterministicToUnified(parseCommand("今天死亡"))).toMatchObject({
      intent: "query_today_mortality",
      date: "today",
      source: "deterministic",
    });
    expect(deterministicToUnified(parseCommand("金雞測試場 測試1舍 目前存欄"))).toMatchObject({
      intent: "query_current_stock",
      farmText: "金雞測試場",
      houseText: "測試1舍",
      source: "deterministic",
    });
    expect(deterministicToUnified(parseCommand("金雞測試場 測試1舍 日齡"))).toMatchObject({
      intent: "query_flock_age",
      farmText: "金雞測試場",
      houseText: "測試1舍",
      source: "deterministic",
    });
    expect(deterministicToUnified(parseCommand("金雞測試場 測試1舍 死亡5"))).toMatchObject({
      intent: "record_mortality",
      farmText: "金雞測試場",
      houseText: "測試1舍",
      quantity: 5,
      unit: "bird",
      needsConfirmation: false,
      source: "deterministic",
    });
  });

  it("does not spend AI on simple fast paths but does on natural language", () => {
    expect(shouldInvokeSemanticAi("洪秀美死亡5")).toBe(false);
    expect(shouldInvokeSemanticAi("今天死亡")).toBe(false);
    expect(shouldInvokeSemanticAi("金雞測試場 測試1舍 死亡5")).toBe(false);
  });

  it.each([
    "洪秀美那邊今天好像又死了五隻",
    "洪秀美那場今天死亡5",
    "洪秀美今天掛5隻",
    "今天洪秀美死5隻",
    "洪秀美場今天死了五隻",
    "洪秀美場今天死5隻，其中2隻腳有問題",
    "洪秀梅那邊死5隻",
    "洪家卿今天死2隻",
    "東勢今天餵800公斤料",
    "太保今天飲水2300L",
    "今天哪場死最多",
    "洪秀美今天死多少",
  ])("invokes semantic AI for natural-language input: %s", (input) => {
    expect(shouldInvokeSemanticAi(input)).toBe(true);
  });

  it("routes conversational structure to AI even when a loose rule can partially parse it", () => {
    const intent = deterministicToUnified(parseCommand("金雞測試場今天死5隻"));
    expect(intent).not.toBeNull();
    expect(shouldPreferAiOverDeterministic("金雞測試場今天死5隻", intent!)).toBe(true);
  });
});

describe("UnifiedIntent AI contract", () => {
  const fields = {
    houseText: null,
    date: "today",
    period: null,
    note: null,
    confidence: 0.93,
    needsConfirmation: false,
  };

  it("accepts structured natural-language mortality and leaves farm resolution to FarmResolver", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "洪秀美",
      quantity: 5,
      unit: "bird",
      ...fields,
    }));
    expect(intent).toMatchObject({ intent: "record_mortality", source: "ai", farmText: "洪秀美", quantity: 5 });
    const resolution = new FarmResolver(farms).resolve(intent!.farmText!);
    expect(resolution.kind).toBe("direct");
  });

  it("keeps typo and homophone-like farm text in confirmation candidates", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "洪秀梅",
      quantity: 5,
      unit: "bird",
      ...fields,
      needsConfirmation: true,
    }));
    expect(new FarmResolver(farms).resolve(intent!.farmText!)).toMatchObject({ kind: "candidates" });
  });

  it("accepts a bounded note without allowing AI to calculate or write", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "洪秀美場",
      quantity: 5,
      unit: "隻",
      ...fields,
      note: "其中2隻腳有問題",
    }));
    expect(intent?.note).toBe("其中2隻腳有問題");
    expect(intent?.source).toBe("ai");
  });

  it("normalizes AI water tons to liters like the deterministic parser", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_water",
      farmText: "太保",
      quantity: 2.3,
      unit: "噸",
      ...fields,
    }));
    expect(intent).toMatchObject({ intent: "record_water", quantity: 2300, unit: "L" });
  });

  it("supports semantic top-mortality and asks for an explicit recent period", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "query_recent_mortality_top",
      farmText: null,
      quantity: null,
      unit: null,
      ...fields,
      period: "recent",
    }));
    expect(intent).toMatchObject({ intent: "query_recent_mortality_top", period: "recent" });
  });

  it("accepts a valid ISO current date for a today top-mortality query", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "query_today_mortality_top",
      farmText: null,
      quantity: null,
      unit: null,
      ...fields,
      date: "2026-08-19",
      period: "today",
    }));
    expect(intent).toMatchObject({ intent: "query_today_mortality_top", date: "2026-08-19" });
  });

  it.each([
    { quantity: null },
    { quantity: -1 },
    { intent: "record_mortality", quantity: 5, unit: "bird", candidateFarmIds: ["invented"] },
    { intent: "chat", quantity: null, unit: null },
  ])("rejects unsafe AI output: %j", (override) => {
    const base = {
      intent: "record_mortality",
      farmText: "不存在雞場",
      quantity: 5,
      unit: "bird",
      ...fields,
    };
    const parsed = parseAiUnifiedIntent(JSON.stringify({ ...base, ...override }));
    expect(parsed).toBeNull();
  });

  it("keeps an invented farm outside the canonical resolver", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "AI自創雞場",
      quantity: 5,
      unit: "bird",
      ...fields,
    }));
    expect(new FarmResolver(farms).resolve(intent!.farmText!)).toMatchObject({ kind: "none" });
  });

  it("does not let an AI confirmation flag bypass fuzzy farm resolution", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "洪秀梅",
      quantity: 5,
      unit: "bird",
      ...fields,
      needsConfirmation: false,
    }));
    const resolution = new FarmResolver(farms).resolve(intent!.farmText!);
    expect(resolution.kind).toBe("candidates");
    expect(resolution.candidates[0]?.farmName).toBe("洪秀美場");
  });

  it("routes mocked AI output through the shared draft and canonical resolver", () => {
    const intent = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "金雞測試場",
      quantity: 3,
      unit: "bird",
      ...fields,
    }));
    expect(intent).not.toBeNull();
    const draft = operationalDraftFromUnified(intent!);
    expect(draft).toMatchObject({ intent: "mortality", quantity: 3, unit: "隻", farmText: "金雞測試場" });
    expect(new FarmResolver(farms).resolve(draft!.farmText!)).toMatchObject({
      kind: "direct",
      farm: { id: "farm-test", name: "金雞測試場" },
    });
  });

  it("constrains model output to the event language without resolving a farm", () => {
    const parsed = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_feed",
      farmText: "金雞測試場今天又掛了2隻",
      quantity: 2,
      unit: "bird",
      ...fields,
    }));
    const intent = normalizeAiUnifiedIntent(parsed!, "金雞測試場今天又掛了2隻");
    expect(intent).toMatchObject({
      intent: "record_mortality",
      farmText: "金雞測試場",
      quantity: 2,
      unit: "bird",
      source: "ai",
    });
  });

  it.each([
    ["金雞測試場今天死了3隻", "金雞測試場"],
    ["金雞側市場今天死1隻", "金雞側市場"],
    ["5隻死在洪秀美場", "洪秀美場"],
    ["死亡5", null],
  ])("extracts farm text from user input without model canonicalization: %s", (input, expected) => {
    expect(farmFragmentFromInput(input)).toBe(expected);
  });

  it.each([
    ["今天哪場死最多", "query_today_mortality_top", null],
    ["洪秀美今天死多少", "query_farm_mortality", "洪秀美"],
  ])("normalizes semantic mortality query %s", (input, expectedIntent, expectedFarm) => {
    const parsed = parseAiUnifiedIntent(JSON.stringify({
      intent: "query_today_mortality",
      farmText: expectedFarm ? `${expectedFarm}今天死多少` : null,
      quantity: null,
      unit: null,
      ...fields,
    }));
    const intent = normalizeAiUnifiedIntent(parsed!, input);
    expect(intent).toMatchObject({ intent: expectedIntent, farmText: expectedFarm });
  });

  it.each([
    "洪秀美今天沒有死亡",
    "洪秀美死亡5，不對，是3隻",
    "洪秀美今天死亡3隻淘汰2隻",
  ])("rejects unsafe semantic write shape: %s", (input) => {
    const parsed = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "洪秀美",
      quantity: 5,
      unit: "bird",
      ...fields,
    }));
    expect(parsed).not.toBeNull();
    expect(normalizeAiUnifiedIntent(parsed!, input).intent).toBe("unknown");
  });

  it("requires confirmation for uncertain records and undefined bag units", () => {
    const uncertain = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_mortality",
      farmText: "洪秀美",
      quantity: 5,
      unit: "bird",
      ...fields,
    }));
    expect(normalizeAiUnifiedIntent(uncertain!, "洪秀美好像死5隻").needsConfirmation).toBe(true);
    const bags = parseAiUnifiedIntent(JSON.stringify({
      intent: "record_feed",
      farmText: "洪秀美",
      quantity: 20,
      unit: "kg",
      ...fields,
    }));
    expect(normalizeAiUnifiedIntent(bags!, "洪秀美飼料用了20包").intent).toBe("unknown");
  });
});
