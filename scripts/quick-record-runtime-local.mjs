import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 8788 + Math.floor(Math.random() * 80);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-runtime-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-quick-${Date.now().toString(36)}`;
const userId = `${prefix}-user`;
const boundaryUser = `${prefix}-boundary-user`;
const pendingCorrectionUser = `${prefix}-pending-correction-user`;
const effectiveUser = `${prefix}-effective-user`;
const moveUser = `${prefix}-move-user`;
const multiCorrectionUser = `${prefix}-multi-correction-user`;
const rollingUser = `${prefix}-rolling-user`;
const gapUser = `${prefix}-gap-user`;
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

function makeEvent(label, text, user = userId, timestamp = Date.now()) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const visibleText = `${botMention} ${text}`;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: timestamp + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId: user },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: visibleText,
      mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] },
    },
  };
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-codex-runtime-token", token);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { response, body };
}

async function dispatch(label, text, user = userId, timestamp = Date.now()) {
  const result = await request("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(makeEvent(label, text, user, timestamp)),
  });
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`dispatch failed: ${label}`);
  return { ...result.body, text: result.body.reply?.messages?.[0]?.text ?? "" };
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error("runtime state failed");
  return result.body;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await fetch(`${baseUrl}/health`);
      if (result.ok) return;
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

async function cleanup() {
  const cleanupSql = [
    `UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'local_runtime_cleanup') WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE abnormal_events SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, reason = COALESCE(reason, 'local_runtime_cleanup'), updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_items SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_bundles SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id LIKE 'quick-bundle-${prefix}%';`,
    `UPDATE quick_record_sessions SET pending_status = 'closed', pending_items_json = '[]', pending_farm_candidates_json = '[]', pending_correction_json = NULL, active_farm_id = NULL, active_house_id = NULL, active_flock_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE line_user_id IN ('${userId}', '${userId}-other', '${boundaryUser}', '${pendingCorrectionUser}', '${effectiveUser}', '${moveUser}', '${multiCorrectionUser}', '${rollingUser}', '${gapUser}');`,
    "UPDATE flocks SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = 'flock-local-quick-record-1';",
    "UPDATE houses SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 'house-local-quick-record-1';",
    "UPDATE farms SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 'farm-local-quick-record';",
    "UPDATE farms SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 'farm-local-quick-record-b';",
  ].join("\n");
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", cleanupSql]);
}

async function main() {
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();
    const badSignature = await fetch(`${baseUrl}/webhook/line`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": "invalid" },
      body: JSON.stringify({ destination: "local", events: [] }),
    });
    check("SIGNED-WEBHOOK-INVALID-SIGNATURE", badSignature.status === 401, `HTTP ${badSignature.status}`);

    const direct = await dispatch("direct", "金雞測試場 測試1舍 死亡5");
    check("QUICK-EXACT-FARM-HOUSE-DIRECT", direct.text.includes("🧪 金雞測試場｜測試1舍") && direct.text.includes("死亡 5隻"), direct.text);

    const abnormalOne = await dispatch("abnormal-one", "臭腳");
    const abnormalTwo = await dispatch("abnormal-two", "咳嗽");
    const abnormalThree = await dispatch("abnormal-three", "氣溫太高");
    check("QUICK-CONTEXT-CARRIES-FARM-HOUSE", [abnormalOne, abnormalTwo, abnormalThree].every((result) => result.text.includes("🧪 金雞測試場｜測試1舍")), "same group/user context");

    const beforeCorrection = await state();
    check("QUICK-MULTI-EVENT-D1", beforeCorrection.quickItems.filter((row) => row.sourceEventId.includes(prefix)).length >= 4 && beforeCorrection.abnormal.filter((row) => row.status === "active").length >= 3, "operational + abnormal rows read back");
    check("QUICK-GROUPED-ITEM-PRESERVATION", beforeCorrection.bundles.length >= 1 && beforeCorrection.quickItems.filter((row) => row.bundleId === beforeCorrection.bundles[0]?.id).length >= 4, "items retain bundle linkage");

    const suffixBoundary = await dispatch("suffix-boundary", "死亡3 金雞測試場 咳嗽 白冠 金雞測試場B", boundaryUser);
    const suffixState = await state();
    const suffixEvents = suffixState.events.filter((row) => row.sourceEventId.includes(`${prefix}-suffix-boundary`));
    const suffixAbnormal = suffixState.abnormal.filter((row) => row.sourceEventId.includes(`${prefix}-suffix-boundary`) && row.status === "active");
    check("QUICK-FARM-SUFFIX-BOUNDARY", suffixEvents.some((row) => row.farmName === "金雞測試場" && row.intent === "mortality" && Number(row.quantity) === 3 && !row.reversedAt) && suffixAbnormal.filter((row) => row.farmName === "金雞測試場B").map((row) => row.rawText).sort().join(",") === "咳嗽,白冠", suffixBoundary.text);

    const pendingCorrectionStart = await dispatch("pending-correction-start", "死亡7", pendingCorrectionUser);
    const pendingCorrection = await dispatch("pending-correction", "死亡不是7，是4", pendingCorrectionUser);
    const pendingCorrectionSelected = await dispatch("pending-correction-select", "金雞測試場", pendingCorrectionUser);
    const pendingCorrectionState = await state();
    check("QUICK-PENDING-CORRECTION", pendingCorrectionStart.text.includes("記在哪個場次") && pendingCorrection.text.includes("死亡：7 → 4") && pendingCorrectionSelected.text.includes("死亡 4隻") && pendingCorrectionState.events.some((row) => row.sourceEventId.includes(`${prefix}-pending-correction-select`) && Number(row.quantity) === 4 && !row.reversedAt), `${pendingCorrection.text}\n${pendingCorrectionSelected.text}\ntrace=${JSON.stringify(pendingCorrection.trace)}`);
    check("QUICK-PENDING-CORRECTION-AUDIT", pendingCorrectionState.audits.some((row) => row.action === "pending_correction"), "pending correction audit exists");

    // Keep this legacy effective-data assertion stable across the Asia/Taipei
    // midnight boundary: the production write path uses Taipei dates while
    // the older query helper still derives its "today" key from UTC.
    const effectiveRuntimeTimestamp = Date.now() - 8 * 60 * 60 * 1000;
    const effectiveStart = await dispatch("effective-start", "金雞測試場B死亡5", effectiveUser, effectiveRuntimeTimestamp);
    const effectiveCorrection = await dispatch("effective-correction", "死亡不是5，是3", effectiveUser, effectiveRuntimeTimestamp + 1000);
    const effectiveQuery = await dispatch("effective-query", "金雞測試場B今天死亡", effectiveUser, effectiveRuntimeTimestamp + 2000);
    check("QUICK-AI-EFFECTIVE-DATA", effectiveStart.text.includes("死亡 5隻") && effectiveCorrection.text.includes("死亡：5 → 3") && /3隻/u.test(effectiveQuery.text) && !/今日死亡：5隻|今天死亡：5隻/u.test(effectiveQuery.text), JSON.stringify({ start: effectiveStart.text, correction: effectiveCorrection.text, query: effectiveQuery.text }));

    const rollingStart = Date.parse("2026-08-20T05:00:00.000Z");
    await dispatch("rolling-1", "金雞測試場死亡1", rollingUser, rollingStart);
    await dispatch("rolling-2", "臭腳", rollingUser, rollingStart + 4 * 60 * 1000);
    await dispatch("rolling-3", "咳嗽", rollingUser, rollingStart + 8 * 60 * 1000);
    const rollingState = await state();
    const rollingItems = rollingState.quickItems.filter((row) => row.sourceEventId.includes(`${prefix}-rolling-`));
    check("QUICK-ROLLING-5-MINUTE", rollingItems.length === 3 && new Set(rollingItems.map((row) => row.bundleId)).size === 1, "0→4→8 minutes share one bundle");

    await dispatch("gap-1", "金雞測試場死亡1", gapUser, rollingStart);
    const gapSecond = await dispatch("gap-2", "咳嗽", gapUser, rollingStart + 6 * 60 * 1000);
    const gapState = await state();
    check("QUICK-GAP-OPENS-NEW-SESSION", gapSecond.text.includes("記在哪個場次") && gapState.sessions.some((row) => row.lineUserId === gapUser && row.pendingStatus === "waiting_farm"), `${gapSecond.text}\ntrace=${JSON.stringify(gapSecond.trace)}`);
    await dispatch("gap-select", "金雞測試場", gapUser, rollingStart + 7 * 60 * 1000);

    const correction = await dispatch("correction", "死亡不是5，是3");
    const afterCorrection = await state();
    check("QUICK-NATURAL-CORRECTION", correction.text.includes("死亡：5 → 3") && afterCorrection.events.some((row) => row.sourceEventId.includes(`${prefix}-correction:correction`) && row.intent === "mortality" && Number(row.quantity) === 3 && !row.reversedAt), correction.text);
    check("QUICK-CORRECTION-AUDIT", afterCorrection.audits.some((row) => row.action === "correct" && row.entityType === "operational_event"), "append-only correction audit");

    const split = await dispatch("partial-split", "死亡3是金雞測試場B，咳嗽臭腳才是金雞測試場");
    const afterSplit = await state();
    check("QUICK-PARTIAL-MOVE", split.text.includes("金雞測試場B") && split.text.includes("咳嗽") && split.text.includes("臭腳") && afterSplit.events.some((row) => row.farmName === "金雞測試場B" && !row.reversedAt && row.intent === "mortality" && Number(row.quantity) === 3), split.text);
    check("QUICK-MOVE-AUDIT-LINK", afterSplit.audits.some((row) => row.action === "move"), "move audit exists");

    const wholeMoveStart = await dispatch("whole-move-start", "金雞測試場B死亡4臭腳", moveUser);
    const wholeMove = await dispatch("whole-move", "剛剛全部是金雞測試場", moveUser);
    const wholeMoveState = await state();
    check("QUICK-WHOLE-BUNDLE-MOVE", wholeMoveStart.text.includes("金雞測試場B") && wholeMove.text.includes("金雞測試場") && wholeMoveState.events.some((row) => row.sourceEventId.includes(`${prefix}-whole-move:move`) && row.farmName === "金雞測試場" && row.intent === "mortality" && Number(row.quantity) === 4 && !row.reversedAt), wholeMove.text);
    check("QUICK-WHOLE-MOVE-AUDIT", wholeMoveState.audits.some((row) => row.action === "move" && row.reason === "剛剛全部是金雞測試場"), "whole move audit exists");

    const multiCorrectionStart = await dispatch("multi-correction-start", "金雞測試場死亡6咳嗽臭腳", multiCorrectionUser);
    const multiCorrection = await dispatch("multi-correction", "死亡不是6是4，咳嗽不要，臭腳改白冠", multiCorrectionUser);
    const multiCorrectionState = await state();
    check("QUICK-MULTI-CORRECTION", multiCorrectionStart.text.includes("死亡 6隻") && multiCorrection.text.includes("死亡：6 → 4") && multiCorrection.text.includes("咳嗽：已取消") && multiCorrection.text.includes("臭腳 → 白冠") && multiCorrectionState.events.some((row) => row.sourceEventId.includes(`${prefix}-multi-correction`) && row.intent === "mortality" && Number(row.quantity) === 4 && !row.reversedAt) && multiCorrectionState.abnormal.some((row) => row.sourceEventId.includes(`${prefix}-multi-correction`) && row.rawText === "白冠" && row.status === "active"), multiCorrection.text);
    check("QUICK-MULTI-CORRECTION-AUDIT", multiCorrectionState.audits.filter((row) => ["correct", "reverse"].includes(row.action)).length >= 3, "multi-correction audit chain exists");

    const otherUser = await dispatch("other-user", "死亡2", `${userId}-other`);
    check("QUICK-USER-SESSION-ISOLATION", otherUser.text.includes("記在哪個場次") && !otherUser.text.includes("測試1舍｜死亡"), otherUser.text);
    const otherState = await state();
    check("QUICK-PENDING-APPEND", otherState.sessions.some((row) => row.lineUserId === `${userId}-other` && row.pendingStatus === "waiting_farm"), "pending is scoped to the second user");
    const selected = await dispatch("other-select", "金雞測試場", `${userId}-other`);
    check("QUICK-PENDING-FARM-SELECTION", selected.text.includes("🧪 金雞測試場") && selected.text.includes("死亡 2隻"), `${selected.text}\ntrace=${JSON.stringify(selected.trace)}`);

    const finalState = await state();
    check("QUICK-NO-ACTIVE-PENDING", !finalState.sessions.some((row) => ["waiting_farm", "waiting_house"].includes(row.pendingStatus)), JSON.stringify(finalState.sessions));
    check("QUICK-DIRECT-IDEMPOTENCY", finalState.events.filter((row) => row.sourceEventId === `${prefix}-direct:quick:0:0`).length === 1, "one source event row");
    check("QUICK-RAW-ABNORMAL-PRESERVED", finalState.abnormal.some((row) => row.rawText === "臭腳") && finalState.abnormal.some((row) => row.rawText === "咳嗽"), "raw text retained");
  } finally {
    worker.kill("SIGTERM");
    try { await cleanup(); } catch (error) { console.error(`LOCAL_CLEANUP_FAILED=${error instanceof Error ? error.message : String(error)}`); }
  }
  const passed = checks.filter((item) => item.pass).length;
  console.log(`LOCAL_QUICK_RUNTIME_CHECKS=${passed}/${checks.length}`);
  console.log(`LOCAL_QUICK_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`LOCAL_QUICK_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
