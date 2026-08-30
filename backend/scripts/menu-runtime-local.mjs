import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9050 + Math.floor(Math.random() * 60);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-menu-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-menu-${Date.now().toString(36)}`;
const userId = `${prefix}-user`;
const otherUserId = `${prefix}-other`;
const dedupeOtherUserId = `${prefix}-dedupe-other`;
const shortcutUser = `${prefix}-shortcut-user`;
const navigationUser = `${prefix}-navigation-user`;
const firstUseGroupId = `${prefix}-first-use-group`;
const botMention = "@金雞協會助理Ai";
let sequence = 0;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function messageEvent(label, text, user = userId, timestamp = Date.now(), group = groupId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const visibleText = `${botMention} ${text}`;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: timestamp + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId: group, userId: user },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: visibleText,
      mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] },
    },
  };
}

function postbackEvent(label, data, user = userId, timestamp = Date.now()) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "postback",
    webhookEventId: eventId,
    timestamp: timestamp + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId: user },
    postback: { data },
  };
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-codex-runtime-token", token);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { raw }; }
  return { response, body };
}

async function dispatch(event) {
  const result = await request("/__codex/runtime/dispatch", { method: "POST", body: JSON.stringify(event) });
  if (result.response.status !== 200 || !result.body.ok) {
    throw new Error(`dispatch failed: ${event.webhookEventId} status=${result.response.status} body=${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error("state failed");
  return result.body;
}

function firstMessage(result) {
  return result.reply?.messages?.[0] ?? null;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

async function cleanup() {
  const cleanupSql = [
    `UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'local_menu_cleanup') WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE abnormal_events SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, reason = COALESCE(reason, 'local_menu_cleanup'), updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_items SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_bundles SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id LIKE 'quick-bundle-${prefix}%';`,
    `UPDATE quick_record_sessions SET pending_status = 'closed', pending_items_json = '[]', pending_farm_candidates_json = '[]', active_farm_id = NULL, active_house_id = NULL, active_flock_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE line_user_id IN ('${userId}', '${otherUserId}', '${dedupeOtherUserId}', '${shortcutUser}', '${navigationUser}');`,
    `DELETE FROM line_semantic_action_locks WHERE line_user_id IN ('${userId}', '${otherUserId}', '${dedupeOtherUserId}', '${shortcutUser}', '${navigationUser}');`,
    `DELETE FROM admin_sessions WHERE line_group_id IN ('${groupId}', '${firstUseGroupId}') AND line_user_id IN ('${userId}', '${otherUserId}');`,
  ].join("\n");
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", cleanupSql]);
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();

    const menu = await dispatch(messageEvent("menu", "選單"));
    const menuMessage = firstMessage(menu);
    const menuActions = JSON.stringify(menuMessage?.contents ?? "");
    check("MENU-EXACT-FLEX", menuMessage?.type === "flex" && menuMessage?.altText === "金雞協會助理 AI 操作選單", menuMessage?.altText);
    check("MENU-MESSAGE-ACTIONS", [
      '"type":"message"', '"text":"快速紀錄"', '"text":"今日狀況"',
      '"text":"雞場與批次"', '"text":"最近異常"', '"text":"修改紀錄"',
      '"text":"雲林天氣"', '"text":"AI分析"',
    ].every((marker) => menuActions.includes(marker)), menuActions);
    check("MENU-MORE-REMAINS-POSTBACK", menuActions.includes("action=menu_more"), menuActions);
    check("MENU-MORE-HAS-VISIBLE-DISPLAYTEXT", menuActions.includes('"displayText":"⋯ 更多功能"'), menuActions);

    const pending = await dispatch(messageEvent("pending", "死亡2"));
    const pendingMessage = firstMessage(pending);
    check("PENDING-FARM-QUICK-REPLY", pendingMessage?.type === "text" && pendingMessage.quickReply?.items?.some((item) => JSON.stringify(item).includes("pending_select_farm")), JSON.stringify(pendingMessage?.quickReply));

    const menuWhilePending = await dispatch(messageEvent("menu-while-pending", "選單"));
    const pendingState = await state();
    check("MENU-PRESERVES-PENDING", firstMessage(menuWhilePending)?.type === "flex" && pendingState.sessions.some((row) => row.lineUserId === userId && row.pendingStatus === "waiting_farm"), JSON.stringify(pendingState.sessions));
    check("MENU-DOES-NOT-CREATE-ABNORMAL", !pendingState.abnormal.some((row) => row.sourceEventId === `${prefix}-menu` || row.sourceEventId === `${prefix}-menu-while-pending`), "no menu source abnormal rows");
    const firstUseMenu = await dispatch(messageEvent("first-use-menu", "今日營運", `${prefix}-first-use-user`, Date.now(), firstUseGroupId));
    check("FIRST-USE-GROUP-LOCK-ORDER", firstMessage(firstUseMenu)?.type === "text" && firstMessage(firstUseMenu).text.includes("尚未完成") && firstUseMenu.trace?.semantic_dedupe === "acquired", firstMessage(firstUseMenu)?.text);

    const todayRuns = await Promise.all([
      dispatch(messageEvent("today-message-1", "今日營運")),
      dispatch(messageEvent("today-message-2", "今日營運")),
      dispatch(messageEvent("today-message-3", "今日營運")),
      dispatch(messageEvent("today-message-4", "今日營運")),
    ]);
    const todayWinner = todayRuns.find((result) => firstMessage(result)?.type === "text") ?? todayRuns[0];
    const todayFormalCount = todayRuns.filter((result) => Boolean(firstMessage(result))).length;
    const todayAcquiredCount = todayRuns.filter((result) => result.trace?.semantic_dedupe === "acquired").length;
    check("MESSAGE-ACTION-ROUTES-DETERMINISTIC", todayFormalCount === 1 && firstMessage(todayWinner)?.text.includes("今日營運") && todayWinner.trace?.ai_invoked !== true, firstMessage(todayWinner)?.text);
    check("SEMANTIC-DUPLICATE-SUPPRESS", todayFormalCount === 1 && todayAcquiredCount === 1 && todayRuns.filter((result) => result.trace?.semantic_dedupe === "suppressed").length === 3, JSON.stringify(todayRuns.map((result) => result.trace)));
    check("TODAY-TIMING-INSTRUMENTED", [
      "webhook_received_ms", "command_resolved_ms", "d1_query_start_ms",
      "d1_query_complete_ms", "summary_build_complete_ms", "line_reply_start_ms",
      "line_reply_complete_ms", "total_ms",
    ].every((key) => typeof todayWinner.trace?.timing?.[key] === "number"), JSON.stringify(todayWinner.trace?.timing));
    const differentAction = await dispatch(messageEvent("recent-message", "最近異常"));
    check("DIFFERENT-ACTION-CONCURRENCY", firstMessage(differentAction)?.type === "text" && differentAction.trace?.semantic_dedupe === "acquired", firstMessage(differentAction)?.text);
    const differentUser = await dispatch(messageEvent("today-message-other-user", "今日營運", dedupeOtherUserId));
    check("DIFFERENT-USER-ISOLATION", firstMessage(differentUser)?.type === "text" && differentUser.trace?.semantic_dedupe === "acquired", firstMessage(differentUser)?.text);
    const aiEntry = await dispatch(messageEvent("ai-entry-message", "AI營運分析"));
    check("AI-ENTRY-NO-AUTO-CALL", firstMessage(aiEntry)?.type === "text" && firstMessage(aiEntry).quickReply?.items?.length === 5 && aiEntry.trace?.ai_invoked !== true, JSON.stringify(aiEntry.trace));
    const pendingAfterMessageAction = await state();
    check("MESSAGE-ACTION-PRESERVES-PENDING", pendingAfterMessageAction.sessions.some((row) => row.lineUserId === userId && row.pendingStatus === "waiting_farm"), JSON.stringify(pendingAfterMessageAction.sessions));
    await new Promise((resolve) => setTimeout(resolve, 10_500));
    const afterTtl = await dispatch(messageEvent("today-message-after-ttl", "今日營運"));
    check("SEMANTIC-TTL-REOPENS", firstMessage(afterTtl)?.type === "text" && afterTtl.trace?.semantic_dedupe === "acquired", firstMessage(afterTtl)?.text);

    const farms = await dispatch(postbackEvent("farm-list", "action=menu_farms"));
    const farmsMessage = firstMessage(farms);
    check("MENU-FARM-LIST-DYNAMIC", farmsMessage?.type === "text" && farmsMessage.text.includes("金雞測試場"), farmsMessage?.text);
    const farmSummary = await dispatch(postbackEvent("farm-summary", "action=menu_farm_summary&farm=farm-local-quick-record"));
    const farmSummaryMessage = firstMessage(farmSummary);
    const flockAction = farmSummaryMessage?.quickReply?.items?.find((item) => JSON.stringify(item).includes("menu_flock_summary"))?.action?.data;
    check("MENU-FARM-SUMMARY-D1", farmSummaryMessage?.type === "text" && farmSummaryMessage.text.includes("QUICK-RECORD-001") && typeof flockAction === "string", farmSummaryMessage?.text);
    if (typeof flockAction === "string") {
      const flockSummary = await dispatch(postbackEvent("flock-summary", flockAction));
      check("MENU-BATCH-FOLLOWUP-D1", firstMessage(flockSummary)?.type === "text" && firstMessage(flockSummary).text.includes("QUICK-RECORD-001") && firstMessage(flockSummary).quickReply?.items?.some((item) => JSON.stringify(item).includes("menu_weather")), firstMessage(flockSummary)?.text);
    }

    const selected = await dispatch(postbackEvent("pending-select", "action=pending_select_farm&farm=farm-local-quick-record"));
    check("PENDING-FARM-POSTBACK-COMMITS", firstMessage(selected)?.type === "text" && firstMessage(selected).text.includes("🧪 金雞測試場") && firstMessage(selected).text.includes("死亡 2隻"), firstMessage(selected)?.text);
    const afterSelect = await state();
    check("PENDING-FARM-POSTBACK-CLOSES", !afterSelect.sessions.some((row) => row.lineUserId === userId && ["waiting_farm", "waiting_house"].includes(row.pendingStatus)), JSON.stringify(afterSelect.sessions));

    const stale = await dispatch(postbackEvent("stale-select", "action=pending_select_farm&farm=farm-local-quick-record"));
    check("STALE-FARM-POSTBACK-SAFE", firstMessage(stale)?.type === "text" && firstMessage(stale).text.includes("已完成或已逾時"), firstMessage(stale)?.text);

    const otherPending = await dispatch(messageEvent("other-pending", "死亡1", otherUserId));
    const wrongOwner = await dispatch(postbackEvent("wrong-owner", "action=pending_select_farm&farm=farm-local-quick-record", userId));
    check("POSTBACK-OWNER-SCOPE", firstMessage(otherPending)?.text.includes("記在哪個場次") && firstMessage(wrongOwner)?.text.includes("已完成或已逾時"), firstMessage(wrongOwner)?.text);
    await dispatch(postbackEvent("other-select", "action=pending_select_farm&farm=farm-local-quick-record", otherUserId));

    const today = await dispatch(postbackEvent("today", "action=menu_today_summary"));
    check("MENU-TODAY-DETERMINISTIC", firstMessage(today)?.type === "text" && firstMessage(today).text.includes("今日營運"), firstMessage(today)?.text);
    const quickHelp = await dispatch(postbackEvent("quick-help", "action=menu_quick_record"));
    check("MENU-QUICK-RECORD-HELP", firstMessage(quickHelp)?.type === "text" && firstMessage(quickHelp).text.includes("直接告訴我發生什麼"), firstMessage(quickHelp)?.text);
    const shortcutEntry = await dispatch(messageEvent("shortcut-entry", "快速紀錄", shortcutUser));
    check("QUICK-RECORD-CATEGORY-REPLIES", firstMessage(shortcutEntry)?.type === "text" && firstMessage(shortcutEntry).quickReply?.items?.length === 7, JSON.stringify(firstMessage(shortcutEntry)?.quickReply));
    const mortalityCategory = await dispatch(postbackEvent("shortcut-mortality-category", "action=quick_record_category&type=mortality", shortcutUser));
    check("MORTALITY-SHORTCUT-PROMPT", firstMessage(mortalityCategory)?.type === "text" && firstMessage(mortalityCategory).quickReply?.items?.length === 7, JSON.stringify(firstMessage(mortalityCategory)?.quickReply));
    const mortalityFive = await dispatch(postbackEvent("shortcut-mortality-five", "action=quick_record_count&type=mortality&count=5", shortcutUser));
    check("MORTALITY-SHORTCUT-PENDING", firstMessage(mortalityFive)?.type === "text" && firstMessage(mortalityFive).text.includes("記在哪個場次") && firstMessage(mortalityFive).quickReply?.items?.some((item) => JSON.stringify(item).includes("pending_select_farm")), firstMessage(mortalityFive)?.text);
    const shortcutFarm = await dispatch(postbackEvent("shortcut-select-farm", "action=pending_select_farm&farm=farm-local-quick-record", shortcutUser));
    check("SHORTCUT-FARM-COMMITS-ONCE", firstMessage(shortcutFarm)?.type === "text" && firstMessage(shortcutFarm).text.includes("死亡 5隻") && firstMessage(shortcutFarm).quickReply?.items?.some((item) => JSON.stringify(item).includes("＋死亡")), firstMessage(shortcutFarm)?.text);
    const cullCategory = await dispatch(postbackEvent("shortcut-cull-category", "action=quick_record_category&type=cull", shortcutUser));
    const cullTwo = await dispatch(postbackEvent("shortcut-cull-two", "action=quick_record_count&type=cull&count=2", shortcutUser));
    check("CULL-SHORTCUT-WRITES-THROUGH-SHARED-FLOW", firstMessage(cullCategory)?.type === "text" && firstMessage(cullCategory).quickReply?.items?.length === 7 && firstMessage(cullTwo)?.text.includes("淘汰 2隻"), firstMessage(cullTwo)?.text);
    const healthCategory = await dispatch(postbackEvent("shortcut-health-category", "action=quick_record_category&type=health", shortcutUser));
    check("HEALTH-SHORTCUT-REPLIES", firstMessage(healthCategory)?.type === "text" && firstMessage(healthCategory).quickReply?.items?.length === 9, JSON.stringify(firstMessage(healthCategory)?.quickReply));
    const healthFoot = await dispatch(postbackEvent("shortcut-health-foot", "action=quick_record_abnormal&type=health&key=foot", shortcutUser));
    check("HEALTH-SHORTCUT-USES-SAME-CONTEXT", firstMessage(healthFoot)?.type === "text" && firstMessage(healthFoot).text.includes("臭腳") && firstMessage(healthFoot).quickReply?.items?.some((item) => JSON.stringify(item).includes("＋健康異常")), firstMessage(healthFoot)?.text);
    const correctionAction = await dispatch(postbackEvent("shortcut-correction-action", "action=correction_action&type=quantity", shortcutUser));
    const correctionState = await state();
    const targetData = firstMessage(correctionAction)?.quickReply?.items?.[0]?.action?.data;
    const correctionItemId = typeof targetData === "string" ? new URLSearchParams(targetData).get("item") : null;
    const correctionItem = correctionItemId ? correctionState.quickItems.find((item) => item.id === correctionItemId) : null;
    check("CORRECTION-TARGET-QUICK-REPLY", firstMessage(correctionAction)?.type === "text" && Boolean(correctionItem) && firstMessage(correctionAction).quickReply?.items?.some((item) => JSON.stringify(item).includes("correction_target")), JSON.stringify(firstMessage(correctionAction)?.quickReply));
    if (correctionItemId) {
      const target = await dispatch(postbackEvent("shortcut-correction-target", `action=correction_target&type=quantity&item=${encodeURIComponent(correctionItemId)}`, shortcutUser));
      const corrected = await dispatch(postbackEvent("shortcut-correction-quantity", `action=correction_quantity&item=${encodeURIComponent(correctionItemId)}&count=3`, shortcutUser));
      const correctionAfter = await state();
      check("CORRECTION-TARGET-USES-EXISTING-AUDIT", firstMessage(target)?.type === "text" && firstMessage(target).quickReply?.items?.length === 6 && firstMessage(corrected)?.text.includes("死亡：5 → 3") && correctionAfter.audits.some((row) => row.action === "correct"), `target=${firstMessage(target)?.text} corrected=${firstMessage(corrected)?.text} item=${correctionItemId}`);
    }
    for (const [label, type, expected, key, text] of [[
      "equipment", "equipment", 8, "fan", "風扇異常",
    ], [
      "environment", "environment", 6, "hot", "氣溫太高",
    ], [
      "disaster", "disaster", 6, "wind", "風災",
    ]]) {
      const category = await dispatch(postbackEvent(`shortcut-${label}-category`, `action=quick_record_category&type=${type}`, shortcutUser));
      check(`${String(label).toUpperCase()}-SHORTCUT-REPLIES`, firstMessage(category)?.type === "text" && firstMessage(category).quickReply?.items?.length === expected, JSON.stringify(firstMessage(category)?.quickReply));
      const shortcut = await dispatch(postbackEvent(`shortcut-${label}-event`, `action=quick_record_abnormal&type=${type}&key=${key}`, shortcutUser));
      check(`${String(label).toUpperCase()}-SHORTCUT-RECORDS`, firstMessage(shortcut)?.type === "text" && firstMessage(shortcut).text.includes(String(text)), firstMessage(shortcut)?.text);
    }
    const recent = await dispatch(postbackEvent("recent", "action=menu_recent_abnormal"));
    check("MENU-RECENT-ABNORMAL-D1", firstMessage(recent)?.type === "text" && !firstMessage(recent).text.includes("無法辨識"), firstMessage(recent)?.text);
    const correction = await dispatch(postbackEvent("correction-help", "action=menu_correction_help"));
    check("MENU-CORRECTION-HELP", firstMessage(correction)?.type === "text" && firstMessage(correction).text.includes("死亡不是5"), firstMessage(correction)?.text);
    const weather = await dispatch(postbackEvent("weather", "action=menu_weather"));
    check("MENU-WEATHER-DETERMINISTIC", firstMessage(weather)?.type === "text" && !firstMessage(weather).text.includes("無法辨識"), firstMessage(weather)?.text);
    const aiMenu = await dispatch(postbackEvent("ai-menu", "action=menu_ai"));
    check("MENU-AI-DISPLAYS-OPTIONS-WITHOUT-RUN", firstMessage(aiMenu)?.type === "text" && firstMessage(aiMenu).quickReply?.items?.length === 5, JSON.stringify(firstMessage(aiMenu)?.quickReply));
    const more = await dispatch(postbackEvent("more", "action=menu_more"));
    check("MENU-MORE-FLEX", firstMessage(more)?.type === "flex" && firstMessage(more).altText.includes("更多功能"), firstMessage(more)?.altText);
    const moreActions = JSON.stringify(firstMessage(more)?.contents ?? "");
    check("MENU-MORE-LAYERED", ["待確認資料", "歷史紀錄", "使用說明", "管理功能", "開發選單"].every((marker) => marker === "管理功能" || marker === "開發選單" ? !moreActions.includes(marker) : moreActions.includes(marker)), moreActions);
    const historyText = await dispatch(messageEvent("history-text", "歷史紀錄"));
    const legacyHistoryText = await dispatch(messageEvent("legacy-history-text", "變更紀錄", otherUserId));
    check("MENU-HISTORY-DIRECT-COMMAND", firstMessage(historyText)?.type === "text" && !firstMessage(historyText).text.includes("無法辨識"), firstMessage(historyText)?.text);
    check("MENU-HISTORY-LEGACY-ALIAS", firstMessage(legacyHistoryText)?.type === "text" && !firstMessage(legacyHistoryText).text.includes("無法辨識"), firstMessage(legacyHistoryText)?.text);
    const help = await dispatch(messageEvent("help-copy", "使用說明", otherUserId));
    check("USER-HELP-NO-DEV-COMMANDS", firstMessage(help)?.type === "text" && firstMessage(help).text.includes("紀錄") && !firstMessage(help).text.includes("新增測試場") && !firstMessage(help).text.includes("Migration"), firstMessage(help)?.text);
    const unauthorizedDeveloper = await dispatch(postbackEvent("developer-unauthorized", "action=menu_developer", otherUserId));
    check("DEVELOPER-MENU-UNAUTHORIZED", firstMessage(unauthorizedDeveloper)?.type === "text" && firstMessage(unauthorizedDeveloper).text.includes("只有管理者") && !firstMessage(unauthorizedDeveloper).text.includes("AI 模型"), firstMessage(unauthorizedDeveloper)?.text);
    const unauthorizedTypedDeveloper = await dispatch(messageEvent("developer-typed-unauthorized", "開發選單", otherUserId));
    check("DEVELOPER-TYPED-UNAUTHORIZED", firstMessage(unauthorizedTypedDeveloper)?.type === "text" && firstMessage(unauthorizedTypedDeveloper).text.includes("只有管理者") && !firstMessage(unauthorizedTypedDeveloper).text.includes("系統診斷"), firstMessage(unauthorizedTypedDeveloper)?.text);
    const unauthorizedStatus = await dispatch(messageEvent("status-unauthorized", "系統狀態", otherUserId));
    check("SYSTEM-STATUS-UNAUTHORIZED", firstMessage(unauthorizedStatus)?.type === "text" && firstMessage(unauthorizedStatus).text.includes("只有管理者"), firstMessage(unauthorizedStatus)?.text);
    run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", `INSERT OR REPLACE INTO admin_sessions (id, line_group_id, line_user_id, expires_at) VALUES ('${prefix}-admin-session', '${groupId}', '${userId}', '2099-01-01T00:00:00.000Z');`]);
    const typedManagement = await dispatch(messageEvent("management-typed-authorized", "管理功能", userId));
    check("MANAGEMENT-TYPED-AUTHORIZED", firstMessage(typedManagement)?.type === "flex" && firstMessage(typedManagement).altText.includes("管理功能"), firstMessage(typedManagement)?.altText);
    const managementWeb = await dispatch(postbackEvent("management-web", "action=menu_web", userId));
    check("MANAGEMENT-WEB-VISIBLE-FIRST-STEP", firstMessage(managementWeb)?.type === "text" && firstMessage(managementWeb).text.includes("管理網頁") && managementWeb.reply?.messages?.[1]?.type === "flex", JSON.stringify(managementWeb.reply?.messages));
    check("MANAGEMENT-WEB-URI-SECOND-STEP", JSON.stringify(managementWeb.reply?.messages?.[1] ?? "").includes("aitest00898.github.io/jinji-farm-manager/"), JSON.stringify(managementWeb.reply?.messages?.[1] ?? ""));
    const typedDeveloper = await dispatch(messageEvent("developer-typed-authorized", "開發選單", userId));
    check("DEVELOPER-TYPED-AUTHORIZED", firstMessage(typedDeveloper)?.type === "flex" && firstMessage(typedDeveloper).altText.includes("開發選單"), firstMessage(typedDeveloper)?.altText);
    const developer = await dispatch(postbackEvent("developer-authorized", "action=menu_developer", userId));
    check("DEVELOPER-MENU-AUTHORIZED", firstMessage(developer)?.type === "flex" && firstMessage(developer).altText.includes("開發選單"), firstMessage(developer)?.altText);
    const diagnostics = await dispatch(postbackEvent("developer-diagnostics", "action=menu_message_diagnostics", userId));
    check("DEVELOPER-DIAGNOSTICS-NAVIGATION", firstMessage(diagnostics)?.type === "flex" && firstMessage(diagnostics).altText.includes("訊息診斷"), firstMessage(diagnostics)?.altText);
    const testTools = await dispatch(postbackEvent("developer-test-tools", "action=menu_test_tools", userId));
    check("DEVELOPER-TEST-TOOLS-NAVIGATION", firstMessage(testTools)?.type === "flex" && firstMessage(testTools).altText.includes("測試工具"), firstMessage(testTools)?.altText);
    const testFarmList = await dispatch(messageEvent("developer-test-farm-list", "測試場列表", userId));
    check("DEVELOPER-TEST-TOOLS-READONLY", firstMessage(testFarmList)?.type === "text" && firstMessage(testFarmList).text.includes("金雞測試場"), firstMessage(testFarmList)?.text);
    const navigationPending = await dispatch(messageEvent("navigation-pending", "死亡2", navigationUser));
    const navigationBefore = await state();
    const navigationReturn = await dispatch(messageEvent("navigation-return", "返回", navigationUser));
    const navigationAfter = await state();
    const pendingBefore = navigationBefore.sessions.find((row) => row.lineUserId === navigationUser)?.pendingStatus;
    const pendingAfter = navigationAfter.sessions.find((row) => row.lineUserId === navigationUser)?.pendingStatus;
    check("LINE-RETURN-NAVIGATION-PRIORITY", firstMessage(navigationReturn)?.type === "flex" && firstMessage(navigationReturn).altText.includes("操作選單") && pendingBefore === pendingAfter && navigationReturn.trace?.conversation_v2_ai_invoked !== true, JSON.stringify({ pendingBefore, pendingAfter, trace: navigationReturn.trace, navigationPending: firstMessage(navigationPending)?.text }));
    const home = await dispatch(postbackEvent("home", "action=menu_home"));
    check("MENU-HOME-FLEX", firstMessage(home)?.type === "flex" && firstMessage(home).altText.includes("操作選單"), firstMessage(home)?.altText);
    const finance = await dispatch(postbackEvent("finance", "action=menu_finance"));
    check("MENU-FINANCE-READONLY", firstMessage(finance)?.type === "text" && firstMessage(finance).text.includes("玩家分配盈虧"), firstMessage(finance)?.text);
    const audit = await dispatch(postbackEvent("audit", "action=menu_audit"));
    check("MENU-AUDIT-READONLY", firstMessage(audit)?.type === "text" && !firstMessage(audit).text.includes("無法辨識"), firstMessage(audit)?.text);
    const invalid = await dispatch(postbackEvent("invalid", "action=not_allowed"));
    check("POSTBACK-WHITELIST", firstMessage(invalid)?.type === "text" && firstMessage(invalid).text.includes("無法辨識"), firstMessage(invalid)?.text);
  } finally {
    worker.kill("SIGTERM");
    try { await cleanup(); } catch (error) { console.error(`LOCAL_CLEANUP_FAILED=${error instanceof Error ? error.message : String(error)}`); }
  }
  const passed = checks.filter((item) => item.pass).length;
  console.log(`LOCAL_MENU_RUNTIME_CHECKS=${passed}/${checks.length}`);
  console.log(`LOCAL_MENU_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`LOCAL_MENU_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
