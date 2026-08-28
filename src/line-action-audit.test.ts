import { describe, expect, it } from "vitest";
import {
  actionTypeCounts,
  collectLineActions,
  hasInternalVisibleTextLeak,
} from "./line-action-audit";
import {
  MENU_ACTIONS,
  buildAiFollowupReplies,
  buildAiQuickReply,
  buildAmbientCandidateEditReplies,
  buildAmbientCandidateSelectReplies,
  buildAmbientConfirmationReplies,
  buildAmbientConflictReplies,
  buildAmbientDigestReplies,
  buildAmbientEntityQuickReply,
  buildAmbientItemReplies,
  buildAmbientPreviewReplies,
  buildAmbientReconciliationReplies,
  buildBatchSummaryFollowupReplies,
  buildCorrectionQuantityReplies,
  buildCorrectionQuickReplies,
  buildCorrectionTargetReplies,
  buildDailyReviewFollowupReplies,
  buildDeveloperMenuFlex,
  buildFarmQuickReply,
  buildFarmSummaryFollowupReplies,
  buildFlockQuickReply,
  buildHouseQuickReply,
  buildMainMenuFlex,
  buildManagementMenuFlex,
  buildManagementWebLinkFlex,
  buildMessageDiagnosticsMenuFlex,
  buildMoreMenuFlex,
  buildPendingDiagnosticsMenuFlex,
  buildPendingHouseQuickReply,
  buildPostRecordActions,
  buildQuickRecordAbnormalReplies,
  buildQuickRecordCategoryReplies,
  buildQuickRecordCountReplies,
  buildRecentAbnormalFollowupReplies,
  buildReliabilityRecoveryConfirmationReplies,
  buildReliabilityStatusReplies,
  buildSettingsMenuFlex,
  buildTestToolsMenuFlex,
  buildTodaySummaryFollowupReplies,
  buildWeatherFollowupReplies,
  buildWholeCancelConfirmationReplies,
  navigationActionForText,
} from "./line-menu";

const farms = [
  { id: "farm-1", name: "林志騰二林場", environment: "production" as const },
  { id: "farm-test", name: "金雞測試場", environment: "test" as const },
];
const houses = [{ id: "house-1", name: "測試1舍" }, { id: "house-2", name: "測試2舍" }];
const flocks = [{ id: "flock-1", batchCode: "TEST-BATCH-001", houseName: "測試1舍" }];

function fixturePayloads(): unknown[] {
  return [
    buildMainMenuFlex(),
    buildMoreMenuFlex(),
    buildManagementMenuFlex(),
    buildManagementWebLinkFlex(),
    buildDeveloperMenuFlex(),
    buildMessageDiagnosticsMenuFlex(),
    buildPendingDiagnosticsMenuFlex(),
    buildTestToolsMenuFlex(),
    buildSettingsMenuFlex(),
    buildReliabilityStatusReplies({ actionableUnfinishedCount: 2, retainedUnacknowledgedCount: 2 }),
    buildReliabilityRecoveryConfirmationReplies(),
    buildFarmQuickReply(farms, "pending_select_farm"),
    buildHouseQuickReply(farms[0], houses),
    buildFlockQuickReply(farms[0], flocks),
    buildPendingHouseQuickReply(farms[0], houses),
    buildAmbientDigestReplies("candidate-1"),
    buildAmbientConfirmationReplies("candidate-1"),
    buildAmbientEntityQuickReply("ambient_select_house", "candidate-1", 0, houses.map((house) => ({ id: house.id, label: house.name }))),
    buildAmbientEntityQuickReply("ambient_select_flock", "candidate-1", 0, [{ id: "flock-1", label: "TEST-BATCH-001" }]),
    buildAmbientItemReplies("candidate-1", 0),
    buildAmbientConflictReplies("candidate-1"),
    buildAmbientReconciliationReplies("candidate-1"),
    buildAmbientCandidateEditReplies("candidate-1", ["farm", "house", "flock", "quantity", "event"]),
    buildAmbientCandidateSelectReplies([{ id: "candidate-1", label: "金雞測試場｜死亡2" }]),
    buildDailyReviewFollowupReplies(),
    buildAmbientPreviewReplies(1, 3),
    buildAiQuickReply(),
    buildQuickRecordCategoryReplies(),
    buildQuickRecordCountReplies("mortality"),
    buildQuickRecordCountReplies("cull"),
    buildQuickRecordAbnormalReplies("health"),
    buildQuickRecordAbnormalReplies("equipment"),
    buildQuickRecordAbnormalReplies("environment"),
    buildQuickRecordAbnormalReplies("disaster"),
    buildPostRecordActions(),
    buildFarmSummaryFollowupReplies(),
    buildBatchSummaryFollowupReplies(),
    buildTodaySummaryFollowupReplies(),
    buildRecentAbnormalFollowupReplies(),
    buildWeatherFollowupReplies(),
    buildCorrectionQuickReplies(),
    buildWholeCancelConfirmationReplies(),
    buildCorrectionQuantityReplies("item-1"),
    buildCorrectionTargetReplies([{ itemId: "item-1", label: "金雞測試場｜死亡 5" }], "quantity"),
    buildAiFollowupReplies(),
  ];
}

function handlerEvidence(action: string): boolean {
  if (action.startsWith("ambient_")) return true; // handleLinePostback -> handleAmbientPostback
  if (["quick_record_next", "quick_record_category", "quick_record_count", "quick_record_abnormal", "quick_record_custom"].includes(action)) return true;
  if (["correction_action", "correction_target", "correction_quantity", "correction_confirm"].includes(action)) return true;
  if (["daily_review_correction", "daily_review_candidates", "daily_review_detail"].includes(action)) return true;
  if (["pending_select_farm", "pending_select_house"].includes(action)) return true;
  if (action === "reliability_redisplay" || action === "ai_followup" || action === "ai_custom") return true;
  return [
    "menu_home", "menu_quick_record", "menu_today_summary", "menu_today_mortality", "menu_farms",
    "menu_recent_abnormal", "menu_recent_abnormal_range", "menu_correction_help", "menu_weather",
    "menu_ai", "menu_more", "menu_pending_candidates", "menu_help", "menu_management", "menu_web",
    "menu_developer", "menu_system_status", "menu_message_diagnostics", "menu_pending_diagnostics",
    "menu_pending_ambient_preview", "menu_unfinished_messages", "menu_test_tools", "menu_settings",
    "menu_line_receive_settings", "menu_technical_info", "menu_finance", "menu_audit",
    "menu_farm_summary", "menu_house_summary", "menu_flock_summary", "menu_current_farm_summary",
    "reliability_acknowledge", "reliability_recover", "reliability_recover_confirm", "ai_preset",
  ].includes(action);
}

describe("LINE complete clickable-action audit", () => {
  it("collects every static Flex/Quick Reply action and enforces visible feedback", () => {
    const staticPayloads = fixturePayloads();
    const runtimeAction = {
      type: "postback",
      label: "重新顯示",
      data: "action=reliability_redisplay&notice=notice-1",
      displayText: "重新顯示",
    };
    const entries = [...collectLineActions(staticPayloads), ...collectLineActions(runtimeAction)];
    const counts = actionTypeCounts(entries);
    expect(entries.length).toBeGreaterThan(100);
    expect(counts.datetimepicker).toBe(0);
    expect(entries.filter((entry) => entry.type === "postback").every((entry) => entry.visibleFeedback)).toBe(true);
    expect(entries.filter((entry) => entry.type === "message").every((entry) => entry.visibleFeedback)).toBe(true);
    expect(entries.filter((entry) => entry.type === "postback").every((entry) => MENU_ACTIONS.has(entry.routingAction ?? ""))).toBe(true);
    expect(entries.filter((entry) => entry.type === "postback").every((entry) => handlerEvidence(entry.routingAction ?? ""))).toBe(true);
    expect([...MENU_ACTIONS].filter((action) => !handlerEvidence(action))).toEqual([]);

    const visibleText = entries.flatMap((entry) => [entry.label, entry.text ?? "", entry.displayText ?? ""]);
    expect(visibleText.some((text) => hasInternalVisibleTextLeak(text))).toBe(false);

    // URI cannot create a user bubble by itself.  It is only present in the
    // second-step web-link card, after the `menu_web` Postback above.
    const uriEntries = entries.filter((entry) => entry.type === "uri");
    expect(uriEntries).toHaveLength(1);
    expect(uriEntries[0]?.feedbackMode).toBe("alternate_flow_required");
    expect(entries.some((entry) => entry.routingAction === "menu_web" && entry.displayText === "管理網頁")).toBe(true);

    const flexCounts = actionTypeCounts(collectLineActions(staticPayloads.slice(0, 9)));
    const quickReplyCounts = actionTypeCounts(collectLineActions(staticPayloads.slice(9).map((quickReply) => ({ quickReply }))));
    console.log(`LINE_ACTION_INVENTORY ${JSON.stringify({ total: entries.length, counts, flexCounts, quickReplyCounts })}`);
  });

  it("keeps navigation exact and deterministic before conversational interpretation", () => {
    expect(navigationActionForText("返回")).toBe("menu_home");
    expect(navigationActionForText("返回上一頁")).toBe("menu_home");
    expect(navigationActionForText("返回主選單")).toBe("menu_home");
    expect(navigationActionForText("更多功能")).toBe("menu_more");
    expect(navigationActionForText("管理功能")).toBe("menu_management");
    expect(navigationActionForText("開發選單")).toBe("menu_developer");
    expect(navigationActionForText("這筆哪裡怪")).toBeNull();
  });
});
