/**
 * LINE message primitives and the small interactive-menu builders.
 *
 * This module is intentionally pure: it never reads D1, calls Workers AI, or
 * decides whether a postback is authorized. Those decisions stay in the
 * Worker router and existing domain services.
 *
 * Interaction standard:
 * - Flex Menu is the durable entry point.
 * - Message Actions are the visible primary commands and query entries.
 * - Postback + displayText is used for every user-visible structured action.
 * - Quick Replies shorten frequent next steps without replacing free text.
 * - There are no silent user-initiated Postbacks. Navigation is visible too.
 */

import { normalize } from "./core";

export type LinePostbackAction = {
  type: "postback";
  label: string;
  data: string;
  displayText: string;
};

export type LineUriAction = {
  type: "uri";
  label: string;
  uri: string;
};

export type LineMessageAction = {
  type: "message";
  label: string;
  text: string;
};

export type LineQuickReplyItem = {
  type: "action";
  action: LinePostbackAction | LineMessageAction;
};

export type LineQuickReply = {
  items: LineQuickReplyItem[];
};

export type LineTextMessage = {
  type: "text";
  text: string;
  quickReply?: LineQuickReply;
};

export type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
  quickReply?: LineQuickReply;
};

export type LineReplyMessage = LineTextMessage | LineFlexMessage;

export interface MenuFarm {
  id: string;
  name: string;
  environment?: "production" | "test";
}

export interface MenuHouse {
  id: string;
  name: string;
}

export interface MenuFlock {
  id: string;
  batchCode: string;
  houseName?: string;
}

export const MENU_ACTIONS = new Set([
  "menu_home",
  "menu_quick_record",
  "menu_today_summary",
  "menu_farms",
  "menu_recent_abnormal",
  "menu_correction_help",
  "menu_weather",
  "menu_ai",
  "menu_more",
  "menu_pending_candidates",
  "menu_management",
  "menu_developer",
  "menu_system_status",
  "menu_message_diagnostics",
  "menu_pending_diagnostics",
  "menu_pending_ambient_preview",
  "menu_test_tools",
  "menu_settings",
  "menu_technical_info",
  "menu_line_receive_settings",
  "menu_unfinished_messages",
  "reliability_acknowledge",
  "reliability_recover",
  "reliability_recover_confirm",
  "menu_finance",
  "menu_audit",
  "menu_web",
  "menu_help",
  "menu_farm_summary",
  "menu_house_summary",
  "menu_flock_summary",
  "menu_current_farm_summary",
  "menu_today_mortality",
  "menu_recent_abnormal_range",
  "pending_select_farm",
  "pending_select_house",
  "quick_record_category",
  "quick_record_count",
  "quick_record_abnormal",
  "quick_record_custom",
  "quick_record_next",
  "correction_action",
  "correction_target",
  "correction_quantity",
  "correction_confirm",
  "ai_preset",
  "ai_custom",
  "ai_followup",
  "ambient_confirm_all",
  "ambient_review",
  "ambient_ignore",
  "ambient_snooze",
  "ambient_select_farm",
  "ambient_select_house",
  "ambient_select_flock",
  "ambient_item_record",
  "ambient_item_modify",
  "ambient_item_ignore",
  "ambient_conflict_quantity",
  "ambient_reconcile_already",
  "ambient_reconcile_new",
  "ambient_reconcile_view",
  "ambient_candidate_edit",
  "ambient_candidate_cancel",
  "ambient_candidate_select",
  "ambient_candidate_field",
  "ambient_preview_page",
  "ambient_preview_digest",
  "daily_review_correction",
  "daily_review_candidates",
  "daily_review_detail",
  "reliability_redisplay",
]);

export const AI_PRESETS = new Set([
  "recent_attention",
  "recent_abnormal",
  "compare_farms",
  "batch_performance",
]);

export function parseLinePostback(data: string): { action: string; params: URLSearchParams } | null {
  if (!data || data.length > 300) return null;
  const params = new URLSearchParams(data);
  const action = params.get("action");
  if (!action || !MENU_ACTIONS.has(action)) return null;
  return { action, params };
}

function postback(label: string, action: string, values: Record<string, string> = {}, displayText?: string): LinePostbackAction {
  const params = new URLSearchParams({ action, ...values });
  // LINE renders `displayText` as the user's visible chat bubble.  Keeping
  // the default at the human label makes the invariant hold for menu
  // navigation as well as the dynamic candidate/record choices, while the
  // routing key remains private in `data`.
  return { type: "postback", label, data: params.toString(), displayText: displayText?.trim() || label.trim() };
}

export type NavigationAction =
  | "menu_home"
  | "menu_more"
  | "menu_management"
  | "menu_developer";

/**
 * Exact, deterministic navigation vocabulary.  This is deliberately a
 * semantic navigation layer rather than a Conversation V2 phrase fallback:
 * a user asking to go back must never be interpreted as a farm question just
 * because an open candidate happens to exist.
 */
export function navigationActionForText(value: string): NavigationAction | null {
  const text = normalize(value);
  if (!text) return null;
  if (["主選單", "選單", "功能選單", "返回主選單", "返回主菜单"].includes(text)) return "menu_home";
  if (["更多功能", "返回更多功能"].includes(text)) return "menu_more";
  if (text === "管理功能") return "menu_management";
  if (["開發選單", "返回開發選單"].includes(text)) return "menu_developer";
  // There is no durable navigation stack in the LINE session schema.  The
  // safe, deterministic fallback for an unqualified back action is the main
  // menu; explicit parent-menu labels above still retain their exact target.
  if (["返回", "返回上一頁", "返回上一層"].includes(text)) return "menu_home";
  return null;
}

function message(label: string, text: string): LineMessageAction {
  return { type: "message", label, text };
}

function button(label: string, action: LinePostbackAction | LineMessageAction | LineUriAction): Record<string, unknown> {
  return {
    type: "button",
    style: "secondary",
    height: "sm",
    flex: 1,
    margin: "sm",
    action,
  };
}

function menuRow(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [left, right],
  };
}

function menuBubble(title: string, subtitle: string, rows: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "bubble",
    size: "giga",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      backgroundColor: "#FFF7ED",
      contents: [
        { type: "text", text: title, weight: "bold", size: "xl", color: "#6B3F20" },
        { type: "text", text: subtitle, size: "sm", color: "#8F7662", margin: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: rows,
    },
  };
}

export function buildMainMenuFlex(): LineFlexMessage {
  const items: Array<[string, LinePostbackAction | LineMessageAction]> = [
    ["✍️ 快速紀錄", message("✍️ 快速紀錄", "快速紀錄")],
    ["📋 今日狀況", message("📋 今日狀況", "今日狀況")],
    ["🐔 雞場與批次", message("🐔 雞場與批次", "雞場與批次")],
    ["⚠️ 最近異常", message("⚠️ 最近異常", "最近異常")],
    ["✏️ 修改紀錄", message("✏️ 修改紀錄", "修改紀錄")],
    ["🌤️ 雲林天氣", message("🌤️ 雲林天氣", "雲林天氣")],
    ["🤖 AI 分析", message("🤖 AI 分析", "AI分析")],
    ["⋯ 更多功能", postback("⋯ 更多功能", "menu_more")],
  ] as const;
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(menuRow(
      button(items[index][0], items[index][1]),
      button(items[index + 1][0], items[index + 1][1]),
    ));
  }
  return {
    type: "flex",
    altText: "金雞協會助理 AI 操作選單",
    contents: menuBubble("金雞協會助理 AI", "快速記錄、查詢與分析", rows),
  };
}

export function buildMoreMenuFlex(): LineFlexMessage {
  const rows = [
    menuRow(
      button("📌 待確認資料", message("📌 待確認資料", "待確認資料")),
      button("📚 歷史紀錄", message("📚 歷史紀錄", "歷史紀錄")),
    ),
    menuRow(
      button("❓ 使用說明", message("❓ 使用說明", "使用說明")),
      button("↩️ 返回主選單", postback("↩️ 返回主選單", "menu_home")),
    ),
  ];
  return {
    type: "flex",
    altText: "金雞協會助理 AI 更多功能",
    contents: menuBubble("更多功能", "查看資料與使用說明", rows),
  };
}

function menuFlex(title: string, subtitle: string, rows: Record<string, unknown>[], altText: string): LineFlexMessage {
  return { type: "flex", altText, contents: menuBubble(title, subtitle, rows) };
}

export function buildManagementMenuFlex(): LineFlexMessage {
  return menuFlex(
    "管理功能",
    "需要管理權限的資料查看入口",
    [
      menuRow(
        button("💰 財務摘要", message("💰 財務摘要", "財務摘要")),
        button("🌐 管理網頁", postback("🌐 管理網頁", "menu_web", {}, "管理網頁")),
      ),
      menuRow(
        button("↩️ 返回更多功能", postback("↩️ 返回更多功能", "menu_more")),
        button("🏠 返回主選單", postback("🏠 返回主選單", "menu_home")),
      ),
    ],
    "金雞協會助理 AI 管理功能",
  );
}

/**
 * Second step for the management web link.  The first Postback leaves the
 * visible `管理網頁` user action in chat; this message then offers the URI
 * as an explicit external-navigation step.
 */
export function buildManagementWebLinkFlex(): LineFlexMessage {
  return menuFlex(
    "管理網頁",
    "請點下面按鈕開啟管理網頁",
    [
      {
        type: "box",
        layout: "horizontal",
        contents: [button("🌐 開啟管理網頁", {
          type: "uri",
          label: "🌐 開啟管理網頁",
          uri: "https://aitest00898.github.io/jinji-farm-manager/",
        })],
      },
    ],
    "金雞協會助理 AI 管理網頁",
  );
}

export function buildDeveloperMenuFlex(): LineFlexMessage {
  return menuFlex(
    "🛠 開發選單",
    "系統診斷與維護入口",
    [
      menuRow(
        button("✅ 系統狀態", postback("✅ 系統狀態", "menu_system_status")),
        button("🔍 訊息診斷", postback("🔍 訊息診斷", "menu_message_diagnostics")),
      ),
      menuRow(
        button("📌 待確認資料診斷", postback("📌 待確認資料診斷", "menu_pending_diagnostics")),
        button("🧪 測試工具", postback("🧪 測試工具", "menu_test_tools")),
      ),
      menuRow(
        button("⚙️ 系統設定", postback("⚙️ 系統設定", "menu_settings")),
        button("🔧 技術資訊", postback("🔧 技術資訊", "menu_technical_info")),
      ),
      menuRow(
        button("↩️ 返回更多功能", postback("↩️ 返回更多功能", "menu_more")),
        button("🏠 返回主選單", postback("🏠 返回主選單", "menu_home")),
      ),
    ],
    "金雞協會助理 AI 開發選單",
  );
}

export function buildMessageDiagnosticsMenuFlex(): LineFlexMessage {
  return menuFlex(
    "🔍 訊息診斷",
    "只查看處理情況，不會修改資料",
    [
      menuRow(
        button("查看尚未整理訊息", postback("查看尚未整理訊息", "menu_pending_ambient_preview")),
        button("查看未完成訊息", postback("查看未完成訊息", "menu_unfinished_messages")),
      ),
      menuRow(
        button("↩️ 返回開發選單", postback("↩️ 返回開發選單", "menu_developer")),
        button("🏠 返回主選單", postback("🏠 返回主選單", "menu_home")),
      ),
    ],
    "金雞協會助理 AI 訊息診斷",
  );
}

export function buildPendingDiagnosticsMenuFlex(): LineFlexMessage {
  return menuFlex(
    "📌 待確認資料診斷",
    "查看待確認資料的目前狀態",
    [
      menuRow(
        button("查看待確認資料", postback("查看待確認資料", "menu_pending_candidates")),
        button("查看訊息來源", postback("查看訊息來源", "menu_pending_ambient_preview")),
      ),
      menuRow(
        button("↩️ 返回開發選單", postback("↩️ 返回開發選單", "menu_developer")),
        button("🏠 返回主選單", postback("🏠 返回主選單", "menu_home")),
      ),
    ],
    "金雞協會助理 AI 待確認資料診斷",
  );
}

export function buildTestToolsMenuFlex(): LineFlexMessage {
  return menuFlex(
    "🧪 測試工具",
    "只查看測試資料，不會直接建立正式紀錄",
    [
      menuRow(
        button("查看測試場資料", message("查看測試場資料", "測試場列表")),
        button("↩️ 返回開發選單", postback("↩️ 返回開發選單", "menu_developer")),
      ),
      menuRow(
        button("🏠 返回主選單", postback("🏠 返回主選單", "menu_home")),
        button("↩️ 返回更多功能", postback("↩️ 返回更多功能", "menu_more")),
      ),
    ],
    "金雞協會助理 AI 測試工具",
  );
}

export function buildSettingsMenuFlex(): LineFlexMessage {
  return menuFlex(
    "⚙️ 系統設定",
    "只顯示目前可確認的設定",
    [
      menuRow(
        button("LINE 接收設定", postback("LINE 接收設定", "menu_line_receive_settings")),
        button("↩️ 返回開發選單", postback("↩️ 返回開發選單", "menu_developer")),
      ),
      menuRow(
        button("🏠 返回主選單", postback("🏠 返回主選單", "menu_home")),
        button("↩️ 返回更多功能", postback("↩️ 返回更多功能", "menu_more")),
      ),
    ],
    "金雞協會助理 AI 系統設定",
  );
}

export function buildReliabilityStatusReplies(status: { actionableUnfinishedCount: number; retainedUnacknowledgedCount: number }): LineQuickReply {
  const items: LineQuickReplyItem[] = [
    { type: "action", action: postback("查看未完成訊息", "menu_unfinished_messages", {}, "查看未完成訊息") },
  ];
  if (status.actionableUnfinishedCount > 0) {
    items.push({ type: "action", action: postback("重新處理", "reliability_recover", {}, "重新處理未完成訊息") });
  }
  if (status.retainedUnacknowledgedCount > 0) {
    items.push({ type: "action", action: postback("我已查看", "reliability_acknowledge", {}, "我已查看") });
  }
  items.push({ type: "action", action: postback("返回開發選單", "menu_developer", {}, "返回開發選單") });
  return { items };
}

export function buildReliabilityRecoveryConfirmationReplies(): LineQuickReply {
  return {
    items: [
      { type: "action", action: postback("確認重新處理", "reliability_recover_confirm", { decision: "confirm" }, "確認重新處理") },
      { type: "action", action: postback("先不要", "reliability_recover_confirm", { decision: "cancel" }, "先不要") },
    ],
  };
}

export function farmLabel(farm: MenuFarm): string {
  return `${farm.environment === "test" ? "🧪 " : "🐔 "}${farm.name}`;
}

export function buildFarmQuickReply(
  farms: MenuFarm[],
  action: "menu_farm_summary" | "pending_select_farm" | "ambient_select_farm",
  extraValues: Record<string, string> = {},
): LineQuickReply | null {
  if (farms.length === 0 || farms.length > 13) return null;
  return {
    items: farms.map((farm) => ({
      type: "action" as const,
      action: postback(farmLabel(farm), action, { ...extraValues, farm: farm.id }, farm.name),
    })),
  };
}

export function buildAmbientDigestReplies(candidateId: string): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("✅ 全部紀錄", "ambient_confirm_all", { candidate: candidateId }, "全部紀錄") },
      { type: "action" as const, action: postback("🔍 逐項確認", "ambient_review", { candidate: candidateId }, "逐項確認") },
      { type: "action" as const, action: postback("✏️ 修改", "ambient_candidate_edit", { candidate: candidateId }, "修改") },
      { type: "action" as const, action: postback("❌ 取消這筆", "ambient_candidate_cancel", { candidate: candidateId }, "取消這筆") },
      { type: "action" as const, action: postback("❌ 忽略這次", "ambient_ignore", { candidate: candidateId }, "忽略這次") },
      { type: "action" as const, action: postback("⏰ 稍後處理", "ambient_snooze", { candidate: candidateId }, "稍後處理") },
    ],
  };
}

export function buildAmbientConfirmationReplies(candidateId: string): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("✅ 確認紀錄", "ambient_confirm_all", { candidate: candidateId }, "確認紀錄") },
      { type: "action" as const, action: postback("✏️ 修改", "ambient_candidate_edit", { candidate: candidateId }, "修改") },
      { type: "action" as const, action: postback("❌ 取消這筆", "ambient_candidate_cancel", { candidate: candidateId }, "取消這筆") },
      { type: "action" as const, action: postback("忽略", "ambient_ignore", { candidate: candidateId }, "忽略") },
    ],
  };
}

export function buildAmbientEntityQuickReply(
  action: "ambient_select_house" | "ambient_select_flock",
  candidateId: string,
  itemIndex: number,
  choices: Array<{ id: string; label: string; displayText?: string }>,
): LineQuickReply | null {
  if (!choices.length || choices.length > 13) return null;
  return {
    items: choices.map((choice) => ({
      type: "action" as const,
      action: postback(
        choice.label,
        action,
        { candidate: candidateId, item: String(itemIndex), [action === "ambient_select_house" ? "house" : "flock"]: choice.id },
        choice.displayText ?? choice.label,
      ),
    })),
  };
}

export function buildAmbientItemReplies(candidateId: string, itemIndex: number): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("紀錄", "ambient_item_record", { candidate: candidateId, item: String(itemIndex) }, "紀錄") },
      { type: "action" as const, action: postback("修改", "ambient_item_modify", { candidate: candidateId, item: String(itemIndex) }, "修改") },
      { type: "action" as const, action: postback("忽略", "ambient_item_ignore", { candidate: candidateId, item: String(itemIndex) }, "忽略") },
    ],
  };
}

export function buildAmbientConflictReplies(candidateId: string): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("確認數量", "ambient_conflict_quantity", { candidate: candidateId }, "確認數量") },
      { type: "action" as const, action: postback("✏️ 修改", "ambient_candidate_edit", { candidate: candidateId }, "修改") },
      { type: "action" as const, action: postback("❌ 取消這筆", "ambient_candidate_cancel", { candidate: candidateId }, "取消這筆") },
      { type: "action" as const, action: postback("忽略", "ambient_ignore", { candidate: candidateId }, "忽略") },
    ],
  };
}

export function buildAmbientReconciliationReplies(candidateId: string): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("是，已紀錄", "ambient_reconcile_already", { candidate: candidateId }, "是，已紀錄") },
      { type: "action" as const, action: postback("不是，新增", "ambient_reconcile_new", { candidate: candidateId }, "不是，新增") },
      { type: "action" as const, action: postback("查看紀錄", "ambient_reconcile_view", { candidate: candidateId }, "查看紀錄") },
      { type: "action" as const, action: postback("❌ 取消這筆", "ambient_candidate_cancel", { candidate: candidateId }, "取消這筆") },
      { type: "action" as const, action: postback("忽略", "ambient_ignore", { candidate: candidateId }, "忽略") },
    ],
  };
}

export function buildAmbientCandidateEditReplies(
  candidateId: string,
  fields: Array<"farm" | "house" | "flock" | "quantity" | "event">,
): LineQuickReply | null {
  const labels: Record<typeof fields[number], string> = {
    farm: "改雞場",
    house: "改舍別",
    flock: "改批次",
    quantity: "改數量",
    event: "改事件內容",
  };
  const uniqueFields = [...new Set(fields)];
  if (!uniqueFields.length || uniqueFields.length + 1 > 13) return null;
  return {
    items: [
      ...uniqueFields.map((field) => ({
        type: "action" as const,
        action: postback(labels[field], "ambient_candidate_field", { candidate: candidateId, field }, labels[field]),
      })),
      { type: "action" as const, action: postback("❌ 取消這筆", "ambient_candidate_cancel", { candidate: candidateId }, "取消這筆") },
    ],
  };
}

export function buildAmbientCandidateSelectReplies(
  candidates: Array<{ id: string; label: string }>,
): LineQuickReply | null {
  if (!candidates.length || candidates.length > 13) return null;
  return {
    items: candidates.map((candidate) => ({
      type: "action" as const,
      action: postback(candidate.label, "ambient_candidate_select", { candidate: candidate.id }, candidate.label),
    })),
  };
}

export function addAmbientCandidateCancelReply(
  quickReply: LineQuickReply | null,
  candidateId: string,
): LineQuickReply | null {
  if (!quickReply || quickReply.items.length >= 13) return quickReply;
  return {
    items: [
      ...quickReply.items,
      { type: "action" as const, action: postback("❌ 取消這筆", "ambient_candidate_cancel", { candidate: candidateId }, "取消這筆") },
    ],
  };
}

export function addAmbientCandidateEditReply(
  quickReply: LineQuickReply | null,
  candidateId: string,
): LineQuickReply | null {
  if (!quickReply || quickReply.items.length >= 13) return quickReply;
  return {
    items: [
      ...quickReply.items,
      { type: "action" as const, action: postback("✏️ 修改", "ambient_candidate_edit", { candidate: candidateId }, "修改") },
    ],
  };
}

export function buildDailyReviewFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("✏️ 更正紀錄", "daily_review_correction", {}, "更正紀錄") },
      { type: "action" as const, action: postback("📋 查看待確認", "daily_review_candidates", {}, "查看待確認") },
      { type: "action" as const, action: postback("🔍 查看詳細", "daily_review_detail", {}, "查看詳細") },
    ],
  };
}

export function buildAmbientPreviewReplies(page: number, totalPages: number): LineQuickReply | undefined {
  const items: LineQuickReplyItem[] = [];
  if (page > 0) {
    items.push({
      type: "action",
      action: postback("上一頁", "ambient_preview_page", { page: String(page - 1) }, "上一頁"),
    });
  }
  if (page + 1 < totalPages) {
    items.push({
      type: "action",
      action: postback("下一頁", "ambient_preview_page", { page: String(page + 1) }, "下一頁"),
    });
  }
  items.push({
    type: "action",
    action: postback("摘要", "ambient_preview_digest", {}, "摘要"),
  });
  return items.length ? { items } : undefined;
}

export function buildHouseQuickReply(farm: MenuFarm, houses: MenuHouse[]): LineQuickReply | null {
  if (houses.length === 0 || houses.length > 13) return null;
  return {
    items: houses.map((house) => ({
      type: "action" as const,
      action: postback(house.name, "menu_house_summary", { farm: farm.id, house: house.id }, house.name),
    })),
  };
}

export function buildFlockQuickReply(farm: MenuFarm, flocks: MenuFlock[]): LineQuickReply | null {
  if (flocks.length === 0 || flocks.length > 13) return null;
  return {
    items: flocks.map((flock) => ({
      type: "action" as const,
      action: postback(
        flock.houseName ? `🐣 ${flock.batchCode}｜${flock.houseName}` : `🐣 ${flock.batchCode}`,
        "menu_flock_summary",
        { farm: farm.id, flock: flock.id },
        flock.batchCode,
      ),
    })),
  };
}

export function buildAiQuickReply(): LineQuickReply {
  const presets: Array<[string, string]> = [
    ["最近哪一場需要注意？", "recent_attention"],
    ["最近有哪些異常？", "recent_abnormal"],
    ["比較各場營運狀況", "compare_farms"],
    ["為什麼這一批表現較差？", "batch_performance"],
    ["自行提問", "custom"],
  ];
  return {
    items: presets.map(([label, preset]) => ({
      type: "action" as const,
      action: preset === "custom"
        ? postback(label, "ai_custom", {}, label)
        : postback(label, "ai_preset", { preset }, label),
    })),
  };
}

export type QuickRecordCategory = "mortality" | "cull" | "health" | "equipment" | "environment" | "disaster" | "custom";

type Shortcut = { key: string; label: string; text: string };

const QUICK_RECORD_CATEGORIES: Array<{ type: QuickRecordCategory; label: string; displayText: string }> = [
  { type: "mortality", label: "死亡", displayText: "死亡" },
  { type: "cull", label: "淘汰", displayText: "淘汰" },
  { type: "health", label: "健康異常", displayText: "健康異常" },
  { type: "equipment", label: "設備異常", displayText: "設備異常" },
  { type: "environment", label: "環境異常", displayText: "環境異常" },
  { type: "disaster", label: "災損", displayText: "災損" },
  { type: "custom", label: "其他紀錄", displayText: "其他紀錄" },
];

const QUICK_ABNORMAL_SHORTCUTS: Record<Exclude<QuickRecordCategory, "mortality" | "cull" | "custom">, Shortcut[]> = {
  health: [
    { key: "cough", label: "咳嗽", text: "咳嗽" },
    { key: "foot", label: "臭腳", text: "臭腳" },
    { key: "white_crown", label: "白冠", text: "白冠" },
    { key: "diarrhea", label: "拉肚子", text: "拉肚子" },
    { key: "weak", label: "精神差", text: "精神差" },
    { key: "low_feed", label: "採食下降", text: "採食下降" },
    { key: "water_abnormal", label: "飲水異常", text: "飲水異常" },
    { key: "lameness", label: "跛腳", text: "跛腳" },
    { key: "other", label: "其他", text: "" },
  ],
  equipment: [
    { key: "power_outage", label: "停電", text: "停電" },
    { key: "fan", label: "風扇異常", text: "風扇異常" },
    { key: "cooling_pad", label: "水簾異常", text: "水簾異常" },
    { key: "water_line", label: "飲水線異常", text: "飲水線異常" },
    { key: "feed_line", label: "飼料線異常", text: "飼料線異常" },
    { key: "generator", label: "發電機異常", text: "發電機異常" },
    { key: "lighting", label: "照明異常", text: "照明異常" },
    { key: "other", label: "其他", text: "" },
  ],
  environment: [
    { key: "hot", label: "氣溫太高", text: "氣溫太高" },
    { key: "cold", label: "氣溫太低", text: "氣溫太低" },
    { key: "ventilation", label: "通風不良", text: "通風不良" },
    { key: "odor", label: "異味", text: "異味" },
    { key: "flooding", label: "積水", text: "積水" },
    { key: "other", label: "其他", text: "" },
  ],
  disaster: [
    { key: "wind", label: "風災", text: "風災" },
    { key: "flood", label: "淹水", text: "淹水" },
    { key: "roof", label: "屋頂受損", text: "屋頂受損" },
    { key: "facility", label: "設施受損", text: "設施受損" },
    { key: "power_outage", label: "停電", text: "停電" },
    { key: "other", label: "其他", text: "" },
  ],
};

export function buildQuickRecordCategoryReplies(): LineQuickReply {
  return {
    items: QUICK_RECORD_CATEGORIES.map((category) => ({
      type: "action" as const,
      action: postback(category.label, "quick_record_category", { type: category.type }, category.displayText),
    })),
  };
}

export function buildQuickRecordCountReplies(type: "mortality" | "cull"): LineQuickReply {
  const label = type === "mortality" ? "死亡" : "淘汰";
  const counts = [1, 2, 3, 5, 10, 20];
  return {
    items: [
      ...counts.map((count) => ({
        type: "action" as const,
        action: postback(String(count), "quick_record_count", { type, count: String(count) }, `${label}${count}`),
      })),
      { type: "action" as const, action: postback("其他數量", "quick_record_count", { type, count: "other" }, "其他數量") },
    ],
  };
}

export function buildQuickRecordAbnormalReplies(type: Exclude<QuickRecordCategory, "mortality" | "cull" | "custom">): LineQuickReply {
  return {
    items: QUICK_ABNORMAL_SHORTCUTS[type].map((shortcut) => ({
      type: "action" as const,
      action: shortcut.key === "other"
        ? postback(shortcut.label, "quick_record_custom", { type }, shortcut.label)
        : postback(shortcut.label, "quick_record_abnormal", { type, key: shortcut.key }, shortcut.text),
    })),
  };
}

export function quickAbnormalShortcutText(type: Exclude<QuickRecordCategory, "mortality" | "cull" | "custom">, key: string): string | null {
  return QUICK_ABNORMAL_SHORTCUTS[type].find((shortcut) => shortcut.key === key)?.text || null;
}

export function buildPendingHouseQuickReply(farm: MenuFarm, houses: MenuHouse[]): LineQuickReply | null {
  if (houses.length === 0 || houses.length > 13) return null;
  return {
    items: houses.map((house) => ({
      type: "action" as const,
      action: postback(house.name, "pending_select_house", { farm: farm.id, house: house.id }, house.name),
    })),
  };
}

export function buildPostRecordActions(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("＋死亡", "quick_record_category", { type: "mortality" }, "死亡") },
      { type: "action" as const, action: postback("＋健康異常", "quick_record_category", { type: "health" }, "健康異常") },
      { type: "action" as const, action: postback("＋設備異常", "quick_record_category", { type: "equipment" }, "設備異常") },
      { type: "action" as const, action: postback("＋其他紀錄", "quick_record_category", { type: "custom" }, "其他紀錄") },
      { type: "action" as const, action: postback("✏️ 更正剛才", "menu_correction_help", {}, "更正剛才") },
      { type: "action" as const, action: postback("📊 查看本場", "menu_current_farm_summary", {}, "查看本場") },
    ],
  };
}

export function buildFarmSummaryFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("快速紀錄", "menu_quick_record", {}, "快速紀錄") },
      { type: "action" as const, action: postback("今日營運", "menu_today_summary", {}, "今日營運") },
      { type: "action" as const, action: postback("最近異常", "menu_recent_abnormal", {}, "最近異常") },
      { type: "action" as const, action: postback("AI分析", "menu_ai", {}, "AI營運分析") },
    ],
  };
}

export function buildBatchSummaryFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("今日死亡", "menu_today_mortality", {}, "今日死亡") },
      { type: "action" as const, action: postback("最近異常", "menu_recent_abnormal", {}, "最近異常") },
      { type: "action" as const, action: postback("雲林天氣", "menu_weather", {}, "雲林天氣") },
      { type: "action" as const, action: postback("AI分析", "menu_ai", {}, "AI營運分析") },
    ],
  };
}

export function buildTodaySummaryFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("選場查看", "menu_farms", {}, "選場查看") },
      { type: "action" as const, action: postback("最近異常", "menu_recent_abnormal", {}, "最近異常") },
      { type: "action" as const, action: postback("今日死亡", "menu_today_mortality", {}, "今日死亡") },
      { type: "action" as const, action: postback("雲林天氣", "menu_weather", {}, "雲林天氣") },
      { type: "action" as const, action: postback("AI分析", "menu_ai", {}, "AI營運分析") },
    ],
  };
}

export function buildRecentAbnormalFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("今天", "menu_recent_abnormal_range", { days: "1" }, "今天") },
      { type: "action" as const, action: postback("最近7天", "menu_recent_abnormal_range", { days: "7" }, "最近7天") },
      { type: "action" as const, action: postback("最近30天", "menu_recent_abnormal_range", { days: "30" }, "最近30天") },
      { type: "action" as const, action: postback("選雞場", "menu_farms", {}, "選雞場") },
      { type: "action" as const, action: postback("AI分析", "menu_ai", {}, "AI營運分析") },
    ],
  };
}

export function buildWeatherFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("今日營運", "menu_today_summary", {}, "今日營運") },
      { type: "action" as const, action: postback("最近異常", "menu_recent_abnormal", {}, "最近異常") },
      { type: "action" as const, action: postback("AI分析", "menu_ai", {}, "AI營運分析") },
    ],
  };
}

export function buildCorrectionQuickReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("改死亡數", "correction_action", { type: "quantity" }, "改死亡數") },
      { type: "action" as const, action: postback("取消一筆", "correction_action", { type: "cancel" }, "取消一筆") },
      { type: "action" as const, action: postback("改場次", "correction_action", { type: "move" }, "改場次") },
      { type: "action" as const, action: postback("剛才全部取消", "correction_action", { type: "whole_cancel" }, "剛才全部取消") },
      { type: "action" as const, action: postback("查看最近紀錄", "menu_audit", {}, "查看最近紀錄") },
      { type: "action" as const, action: postback("自行更正", "quick_record_custom", { type: "correction" }, "自行更正") },
    ],
  };
}

export function buildWholeCancelConfirmationReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("確認全部取消", "correction_confirm", { decision: "confirm" }, "確認全部取消") },
      { type: "action" as const, action: postback("返回", "correction_confirm", { decision: "cancel" }, "返回") },
    ],
  };
}

export function buildCorrectionQuantityReplies(itemId: string): LineQuickReply {
  return {
    items: [1, 2, 3, 5, 10].map((count) => ({
      type: "action" as const,
      action: postback(String(count), "correction_quantity", { item: itemId, count: String(count) }, `改成${count}`),
    })).concat({ type: "action" as const, action: postback("其他", "quick_record_custom", { type: "correction_quantity" }, "其他") }),
  };
}

export function buildCorrectionTargetReplies(
  targets: Array<{ itemId: string; label: string }>,
  kind: "quantity" | "cancel",
): LineQuickReply | null {
  if (targets.length === 0 || targets.length > 13) return null;
  return {
    items: targets.map((target) => ({
      type: "action" as const,
      action: postback(target.label, "correction_target", { item: target.itemId, type: kind }, target.label),
    })),
  };
}

export function buildAiFollowupReplies(): LineQuickReply {
  return {
    items: [
      { type: "action" as const, action: postback("比較上一批", "ai_followup", { type: "previous_batch" }, "比較上一批") },
      { type: "action" as const, action: postback("查看原始異常", "menu_recent_abnormal", {}, "查看原始異常") },
      { type: "action" as const, action: postback("查看營運紀錄", "menu_today_summary", {}, "查看營運紀錄") },
      { type: "action" as const, action: postback("查看天氣", "menu_weather", {}, "查看天氣") },
      { type: "action" as const, action: postback("繼續追問", "ai_custom", {}, "繼續追問") },
    ],
  };
}

export function buildTextMessage(text: string, quickReply?: LineQuickReply): LineTextMessage {
  return quickReply ? { type: "text", text, quickReply } : { type: "text", text };
}
