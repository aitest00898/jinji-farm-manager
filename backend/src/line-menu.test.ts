import { describe, expect, it } from "vitest";
import {
  AI_PRESETS,
  MENU_ACTIONS,
  buildAiQuickReply,
  buildCorrectionQuickReplies,
  buildCorrectionQuantityReplies,
  buildCorrectionTargetReplies,
  buildFarmQuickReply,
  buildFlockQuickReply,
  buildPendingHouseQuickReply,
  buildHouseQuickReply,
  buildMainMenuFlex,
  buildMoreMenuFlex,
  buildManagementMenuFlex,
  buildManagementWebLinkFlex,
  buildDeveloperMenuFlex,
  buildMessageDiagnosticsMenuFlex,
  buildPendingDiagnosticsMenuFlex,
  buildTestToolsMenuFlex,
  buildSettingsMenuFlex,
  buildReliabilityStatusReplies,
  buildReliabilityRecoveryConfirmationReplies,
  buildPostRecordActions,
  buildQuickRecordAbnormalReplies,
  buildQuickRecordCategoryReplies,
  buildQuickRecordCountReplies,
  buildWholeCancelConfirmationReplies,
  parseLinePostback,
  type MenuFarm,
} from "./line-menu";

function collectPostbackData(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectPostbackData);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const own = record.action && typeof record.action === "object" && record.action !== null
    ? (record.action as Record<string, unknown>).data
    : undefined;
  const current = typeof own === "string" ? [own] : [];
  return [...current, ...Object.values(record).flatMap(collectPostbackData)];
}

function collectActions(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(collectActions);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const current = record.action && typeof record.action === "object" && record.action !== null
    ? [record.action as Record<string, unknown>]
    : [];
  return [...current, ...Object.values(record).flatMap(collectActions)];
}

const farms: MenuFarm[] = [
  { id: "farm-1", name: "林志騰二林場", environment: "production" },
  { id: "farm-test", name: "金雞測試場", environment: "test" },
];

describe("LINE interactive menu payloads", () => {
  it("builds a mobile-friendly Flex main menu with message actions for query and entry buttons", () => {
    const message = buildMainMenuFlex();
    const actions = collectActions(message.contents);
    expect(message.type).toBe("flex");
    expect(message.altText).toBe("金雞協會助理 AI 操作選單");
    const messageTexts = actions.filter((action) => action.type === "message").map((action) => action.text);
    expect(messageTexts).toEqual(expect.arrayContaining([
      "快速紀錄",
      "今日狀況",
      "雞場與批次",
      "最近異常",
      "修改紀錄",
      "雲林天氣",
      "AI分析",
    ]));
    expect(messageTexts).toHaveLength(7);
    const postbacks = actions.filter((action) => action.type === "postback").map((action) => parseLinePostback(String(action.data))?.action);
    expect(postbacks).toEqual(["menu_more"]);
  });

  it("keeps the More menu limited to daily work and safe navigation", () => {
    const message = buildMoreMenuFlex();
    const serialized = JSON.stringify(message.contents);
    expect(serialized).not.toContain("aitest00898.github.io/jinji-farm-manager/");
    const actions = collectActions(message.contents);
    expect(actions.filter((action) => action.type === "message").map((action) => action.text)).toEqual(expect.arrayContaining([
      "待確認資料",
      "歷史紀錄",
      "使用說明",
    ]));
    const historyAction = actions.find((action) => action.type === "message" && action.text === "歷史紀錄");
    expect(historyAction).toMatchObject({ text: "歷史紀錄" });
    expect(actions.filter((action) => action.type === "postback").map((action) => parseLinePostback(String(action.data))?.action)).toEqual([
      "menu_home",
    ]);
    expect(actions.filter((action) => action.type === "uri")).toHaveLength(0);
    expect(collectPostbackData(message.contents).map((data) => parseLinePostback(data)?.action)).toEqual([
      "menu_home",
    ]);
  });

  it("keeps management and developer navigation in separate postback menus", () => {
    const management = collectActions(buildManagementMenuFlex().contents);
    expect(management.filter((action) => action.type === "message").map((action) => action.text)).toContain("財務摘要");
    expect(management.filter((action) => action.type === "postback").map((action) => parseLinePostback(String(action.data))?.action)).toContain("menu_web");
    expect(management.filter((action) => action.type === "uri")).toHaveLength(0);
    expect(collectActions(buildManagementWebLinkFlex().contents).filter((action) => action.type === "uri")).toHaveLength(1);

    const developer = collectActions(buildDeveloperMenuFlex().contents);
    const developerActions = developer.filter((action) => action.type === "postback").map((action) => parseLinePostback(String(action.data))?.action);
    expect(developerActions).toEqual(expect.arrayContaining([
      "menu_system_status", "menu_message_diagnostics", "menu_pending_diagnostics",
      "menu_test_tools", "menu_settings", "menu_technical_info", "menu_more", "menu_home",
    ]));
  });

  it("provides read-only diagnostic submenus and bounded reliability actions", () => {
    for (const menu of [buildMessageDiagnosticsMenuFlex(), buildPendingDiagnosticsMenuFlex(), buildTestToolsMenuFlex(), buildSettingsMenuFlex()]) {
      const actions = collectActions(menu.contents).filter((action) => action.type === "postback");
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every((action) => parseLinePostback(String(action.data)))).toBe(true);
    }
    const status = buildReliabilityStatusReplies({ actionableUnfinishedCount: 0, retainedUnacknowledgedCount: 2 });
    const statusActions = status.items.map((item) => item.action.type === "postback" ? parseLinePostback(item.action.data)?.action : null);
    expect(statusActions).toContain("reliability_acknowledge");
    expect(statusActions).not.toContain("reliability_recover");
    expect(buildReliabilityRecoveryConfirmationReplies().items).toHaveLength(2);
  });

  it("renders every eligible Farm as a Quick Reply up to LINE's 13-item limit", () => {
    const reply = buildFarmQuickReply(farms, "pending_select_farm");
    expect(reply?.items).toHaveLength(2);
    const first = reply?.items[0]?.action;
    expect(first).toMatchObject({ type: "postback" });
    expect(parseLinePostback((first as { data: string }).data)).toMatchObject({ action: "pending_select_farm" });
    expect((first as { data: string }).data).toContain("farm=farm-1");
  });

  it("does not silently truncate a Farm list over 13 choices", () => {
    const many = Array.from({ length: 14 }, (_, index) => ({ id: `farm-${index}`, name: `第${index}場`, environment: "production" as const }));
    expect(buildFarmQuickReply(many, "menu_farm_summary")).toBeNull();
  });

  it("can render scoped House choices without exposing database details", () => {
    const reply = buildHouseQuickReply(farms[0], [
      { id: "house-1", name: "一舍" },
      { id: "house-2", name: "二舍" },
    ]);
    expect(reply?.items).toHaveLength(2);
    expect(parseLinePostback((reply?.items[0]?.action as { data: string }).data)).toMatchObject({ action: "menu_house_summary" });
    const flockReply = buildFlockQuickReply(farms[0], [{ id: "flock-1", batchCode: "TEST-BATCH-001", houseName: "一舍" }]);
    const flockAction = flockReply?.items[0]?.action as { data: string; displayText?: string };
    expect(parseLinePostback(flockAction.data)).toMatchObject({ action: "menu_flock_summary" });
    expect(flockAction.displayText).toBe("TEST-BATCH-001");
    const pendingReply = buildPendingHouseQuickReply(farms[0], [
      { id: "house-1", name: "一舍" },
      { id: "house-2", name: "二舍" },
    ]);
    const pendingAction = pendingReply?.items[0]?.action as { data: string; displayText?: string };
    expect(parseLinePostback(pendingAction.data)).toMatchObject({ action: "pending_select_house" });
    expect(pendingAction.displayText).toBe("一舍");
  });

  it("provides seven quick-record categories and keeps the free-text path", () => {
    const reply = buildQuickRecordCategoryReplies();
    expect(reply.items).toHaveLength(7);
    expect(reply.items.every((item) => item.action.type === "postback")).toBe(true);
    const data = reply.items.map((item) => item.action.type === "postback" ? parseLinePostback(item.action.data)?.action : null);
    expect(data).toEqual(Array(7).fill("quick_record_category"));
    expect(reply.items.map((item) => item.action.type === "postback" ? item.action.displayText : undefined)).toEqual([
      "死亡", "淘汰", "健康異常", "設備異常", "環境異常", "災損", "其他紀錄",
    ]);
  });

  it("uses structured mortality/cull counts with natural display text", () => {
    for (const type of ["mortality", "cull"] as const) {
      const reply = buildQuickRecordCountReplies(type);
      expect(reply.items).toHaveLength(7);
      const selected = reply.items.find((item) => item.action.type === "postback" && item.action.data.includes("count=5"));
      expect(selected?.action).toMatchObject({ type: "postback", displayText: type === "mortality" ? "死亡5" : "淘汰5" });
      expect(parseLinePostback(selected?.action.type === "postback" ? selected.action.data : "")).toMatchObject({ action: "quick_record_count" });
    }
  });

  it("provides health, equipment, environment and disaster shortcuts", () => {
    const expected: Array<["health" | "equipment" | "environment" | "disaster", number, string]> = [
      ["health", 9, "臭腳"],
      ["equipment", 8, "風扇異常"],
      ["environment", 6, "氣溫太高"],
      ["disaster", 6, "風災"],
    ];
    for (const [type, count, displayText] of expected) {
      const reply = buildQuickRecordAbnormalReplies(type);
      expect(reply.items).toHaveLength(count);
      expect(reply.items.some((item) => item.action.type === "postback" && item.action.displayText === displayText)).toBe(true);
    }
  });

  it("keeps post-record, correction and AI choices structured and human-readable", () => {
    const postRecord = buildPostRecordActions();
    expect(postRecord.items).toHaveLength(6);
    expect(postRecord.items.every((item) => item.action.type === "postback")).toBe(true);
    const correction = buildCorrectionQuickReplies();
    expect(correction.items).toHaveLength(6);
    expect(correction.items.some((item) => item.action.type === "postback" && item.action.displayText === "剛才全部取消")).toBe(true);
    expect(buildWholeCancelConfirmationReplies().items).toHaveLength(2);
    const quantity = buildCorrectionQuantityReplies("item-123");
    const targetAction = quantity.items.find((item) => item.action.type === "postback" && item.action.data.includes("item=item-123"))?.action;
    expect(targetAction?.type).toBe("postback");
    expect((targetAction as { displayText?: string } | undefined)?.displayText).toBe("改成1");
    expect(quantity.items.every((item) => !(item.action.type === "postback" && item.action.displayText?.includes("item-123")))).toBe(true);
    const targets = buildCorrectionTargetReplies([{ itemId: "item-123", label: "金雞測試場｜死亡 5" }], "quantity");
    expect(targets?.items[0]?.action).toMatchObject({ type: "postback", displayText: "金雞測試場｜死亡 5" });
    expect(parseLinePostback((targets?.items[0]?.action as { data: string }).data)).toMatchObject({ action: "correction_target" });
  });

  it("rejects non-whitelisted postbacks and accepts only known AI presets", () => {
    expect(parseLinePostback("action=drop_table")).toBeNull();
    expect(MENU_ACTIONS.has("drop_table")).toBe(false);
    expect(AI_PRESETS.has("recent_attention")).toBe(true);
    expect(AI_PRESETS.has("arbitrary_prompt")).toBe(false);
  });
});
