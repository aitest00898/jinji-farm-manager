import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9140 + Math.floor(Math.random() * 50);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-ambient-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-ambient-${Date.now().toString(36)}`;
const botMention = "@金雞協會助理Ai";
const ordinaryUser = `${prefix}-ordinary-user`;
const activeUser = `${prefix}-active-user`;
const otherUser = `${prefix}-other-user`;
const candidateUser = `${prefix}-candidate-user`;
const confirmUser = `${prefix}-confirm-user`;
const snoozeUser = `${prefix}-snooze-user`;
const conflictUser = `${prefix}-conflict-user`;
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

function messageEvent(label, text, user, timestamp, { mention = false, group = groupId } = {}) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const timestampMs = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  const visibleText = mention ? `${botMention} ${text}` : text;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: timestampMs + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId: group, userId: user },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: visibleText,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] } } : {}),
    },
  };
}

function postbackEvent(label, data, user, timestamp, group = groupId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const timestampMs = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return {
    type: "postback",
    webhookEventId: eventId,
    timestamp: timestampMs + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId: group, userId: user },
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
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`dispatch failed: ${event.webhookEventId} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error("runtime state failed");
  return result.body;
}

async function runDigest(body) {
  const result = await request("/__codex/runtime/ambient", { method: "POST", body: JSON.stringify(body) });
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`ambient digest failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

function firstText(result) {
  return result.reply?.messages?.[0]?.text ?? "";
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
    `UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'local_ambient_cleanup') WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE abnormal_events SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, reason = COALESCE(reason, 'local_ambient_cleanup'), updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_items SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_bundles SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id LIKE 'quick-bundle-${prefix}%';`,
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${prefix}%' OR text LIKE '%${prefix}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${prefix}%';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${groupId}';`,
    `UPDATE quick_record_sessions SET pending_status = 'closed', pending_items_json = '[]', pending_farm_candidates_json = '[]', active_farm_id = NULL, active_house_id = NULL, active_flock_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE line_user_id IN ('${ordinaryUser}', '${activeUser}', '${otherUser}', '${candidateUser}', '${confirmUser}', '${snoozeUser}', '${conflictUser}');`,
  ].join("\n");
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", cleanupSql]);
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  await cleanup();
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  const hourNow = "2026-08-20T13:00:00.000Z";
  const previous = "2026-08-20T12:20:00.000Z";
  const previousMs = Date.parse(previous);
  const hourNowMs = Date.parse(hourNow);
  try {
    await waitForHealth();

    const quiet = await dispatch(messageEvent("ordinary-foot", "臭腳", ordinaryUser, previous));
    let current = await state();
    check("QUIET-ORDINARY-TEXT-SILENT", quiet.reply.messages.length === 0, JSON.stringify(quiet.reply));
    check("QUIET-ORDINARY-NO-OFFICIAL-WRITE", current.events.filter((row) => row.sourceEventId.includes(prefix)).length === 0 && current.abnormal.filter((row) => row.sourceEventId.includes(prefix)).length === 0);
    check("QUIET-AMBIENT-BUFFER", current.ambient.some((row) => row.lineMessageId === `${prefix}-ordinary-foot-message` && row.digestStatus === "buffered"));

    const quickPostback = await dispatch(postbackEvent("quick-foot", "action=quick_record_abnormal&type=health&key=foot", ordinaryUser, previous));
    current = await state();
    check("POSTBACK-WAKES-IMMEDIATELY", quickPostback.reply.messages.length > 0 && !current.ambient.some((row) => row.lineMessageId === `${prefix}-quick-foot-message`));

    const mention = await dispatch(messageEvent("mention-death", "金雞測試場死亡1", activeUser, previous, { mention: true }));
    const activeFollowup = await dispatch(messageEvent("active-cough", "咳嗽", activeUser, previousMs + 2000));
    current = await state();
    check("MENTION-WAKE-AND-STRIP", firstText(mention).includes("死亡 1") && mention.trace?.mention_stripped === true, firstText(mention));
    check("ACTIVE-SESSION-CONTINUITY", firstText(activeFollowup).includes("咳嗽") && current.abnormal.some((row) => row.sourceEventId.includes(`${prefix}-active-cough`)), `${firstText(activeFollowup)} / ${JSON.stringify(activeFollowup.trace)}`);

    const otherQuiet = await dispatch(messageEvent("other-user-quiet", "臭腳", otherUser, previousMs + 3000));
    check("USER-SESSION-ISOLATION", otherQuiet.reply.messages.length === 0 && !(await state()).abnormal.some((row) => row.sourceEventId.includes(`${prefix}-other-user-quiet`)));

    const system = await dispatch(messageEvent("system-menu", "選單", otherUser, previousMs + 4000));
    check("EXACT-SYSTEM-COMMAND-WAKES", system.reply.messages[0]?.type === "flex");

    const candidateMessages = [
      messageEvent("ambient-context", "金雞測試場B好像有咳嗽", candidateUser, previousMs + 5000),
      messageEvent("ambient-mortality", "剛剛似乎死1隻", candidateUser, previousMs + 6000),
    ];
    const candidateReplies = [];
    for (const event of candidateMessages) candidateReplies.push(await dispatch(event));
    current = await state();
    check("AMBIENT-CONTEXT-NO-IMMEDIATE-REPLY", candidateReplies.every((result) => result.reply.messages.length === 0));
    check("AMBIENT-CONTEXT-NO-OFFICIAL-WRITE", !current.events.some((row) => row.sourceEventId.includes(`${prefix}-ambient-`)) && !current.abnormal.some((row) => row.sourceEventId.includes(`${prefix}-ambient-`)));
    check("AMBIENT-CONTEXT-BUFFERED", current.ambient.filter((row) => row.lineMessageId.includes(`${prefix}-ambient-`)).length === 2);

    const digest = await runDigest({
      groupId,
      now: hourNow,
      candidate: {
        candidates: [{
          farmText: "金雞測試場B",
          houseText: null,
          flockText: null,
          conflict: false,
          items: [
            { type: "mortality", quantity: 1, raw: "剛剛似乎死1隻", confidence: "medium" },
            { type: "abnormal", quantity: null, raw: "咳嗽", confidence: "high" },
          ],
        }],
      },
    });
    const candidateId = digest.pushes?.[0]?.candidateId;
    current = await state();
    check("HOURLY-DIGEST-ONE-CANDIDATE", digest.result.aiCalls === 1 && digest.result.candidatesCreated === 1 && digest.pushes.length === 1);
    const duplicateDigest = await runDigest({ groupId, now: hourNow });
    check("AMBIENT-DIGEST-IDEMPOTENCY", duplicateDigest.result.aiCalls === 0 && duplicateDigest.result.candidatesCreated === 0 && duplicateDigest.pushes.length === 0);
    check("HUMAN-CONFIRM-BEFORE-WRITE", current.events.filter((row) => row.sourceEventId.includes(`${prefix}:ambient`)).length === 0 && current.candidates.some((row) => row.status === "pending"));
    const digestQuickReplyItems = digest.pushes[0]?.messages[0]?.quickReply?.items ?? [];
    check("DIGEST-USES-QUICK-REPLY", digestQuickReplyItems.length >= 3 && digestQuickReplyItems.some((item) => item.action?.data?.includes("ambient_confirm_all")) && digest.pushes[0]?.messages[0]?.text.includes("待確認"));

    const confirmed = await dispatch(postbackEvent("ambient-confirm", `action=ambient_confirm_all&candidate=${encodeURIComponent(candidateId)}`, confirmUser, hourNow));
    current = await state();
    check("CONFIRM-REUSES-EXISTING-WRITE", firstText(confirmed).includes("已紀錄") && current.events.some((row) => row.sourceEventId.includes(`${prefix}-ambient`)) && current.abnormal.some((row) => row.sourceEventId.includes(`${prefix}-ambient`)));
    check("CANDIDATE-CONFIRMED-ONCE", current.candidates.some((row) => row.status === "confirmed" && row.source === "ambient_digest"));
    const duplicateConfirm = await dispatch(postbackEvent("ambient-confirm-retry", `action=ambient_confirm_all&candidate=${encodeURIComponent(candidateId)}`, confirmUser, hourNowMs + 1000));
    const staleState = await state();
    const staleAmbientEvents = staleState.events.filter((row) => row.sourceEventId.includes(`${prefix}-ambient`));
    check("STALE-CANDIDATE-SAFE", /已處理或已失效|沒有重複寫入/u.test(firstText(duplicateConfirm)) && staleAmbientEvents.length === 1, `${firstText(duplicateConfirm)} / ${JSON.stringify(staleAmbientEvents)}`);

    const snoozeMessage = await dispatch(messageEvent("ambient-snooze-chat", "金雞測試場好像有咳嗽", snoozeUser, hourNowMs + 20000));
    const snoozeDigest = await runDigest({
      groupId,
      now: "2026-08-20T14:00:00.000Z",
      candidate: {
        candidates: [{
          farmText: "金雞測試場",
          houseText: "測試1舍",
          flockText: null,
          conflict: false,
          items: [{ type: "abnormal", quantity: null, raw: "咳嗽", confidence: "high" }],
        }],
      },
    });
    const snoozeCandidateId = snoozeDigest.pushes?.[0]?.candidateId;
    const snoozed = await dispatch(postbackEvent("ambient-snooze", `action=ambient_snooze&candidate=${encodeURIComponent(snoozeCandidateId)}`, snoozeUser, "2026-08-20T14:00:00.000Z"));
    const requeued = await runDigest({ groupId, now: "2026-08-20T15:01:00.000Z" });
    check("AMBIENT-SNOOZE-REQUEUES-NEXT-HOUR", snoozeMessage.reply.messages.length === 0 && firstText(snoozed).includes("暫緩") && requeued.result.snoozedCandidatesRequeued === 1 && requeued.pushes.some((push) => push.candidateId === snoozeCandidateId), JSON.stringify({ snoozeDigest: snoozeDigest.result, snoozeCandidateId, snoozed: firstText(snoozed), requeued: requeued.result, pushes: requeued.pushes }));

    const conflictBefore = await state();
    const conflictMessage = await dispatch(messageEvent("ambient-conflict-chat", "金雞測試場死亡32", conflictUser, "2026-08-20T15:20:00.000Z"));
    const conflictDigest = await runDigest({
      groupId,
      now: "2026-08-20T16:00:00.000Z",
      candidate: {
        candidates: [{
          farmText: "金雞測試場",
          houseText: "測試1舍",
          flockText: null,
          conflict: true,
          conflictText: "可能是32隻，也可能是20多隻",
          items: [{ type: "mortality", quantity: 32, raw: "東勢場死亡32，但有人說20多隻", confidence: "low" }],
        }],
      },
    });
    const conflictCandidateId = conflictDigest.pushes?.[0]?.candidateId;
    const conflictConfirm = await dispatch(postbackEvent("ambient-conflict-confirm", `action=ambient_confirm_all&candidate=${encodeURIComponent(conflictCandidateId)}`, conflictUser, "2026-08-20T16:00:00.000Z"));
    const conflictState = await state();
    const conflictQuickReplyItems = conflictConfirm.reply.messages[0]?.quickReply?.items ?? [];
    check("AMBIENT-CANDIDATE-CONFLICT-SAFE", conflictMessage.reply.messages.length === 0 && conflictDigest.pushes.length === 1 && /互相矛盾|衝突/u.test(firstText(conflictConfirm)) && conflictQuickReplyItems.length >= 2 && conflictQuickReplyItems.some((item) => item.action?.data?.includes("ambient_conflict_quantity")) && conflictQuickReplyItems.some((item) => item.action?.data?.includes("ambient_candidate_cancel")) && conflictState.events.length === conflictBefore.events.length && conflictState.abnormal.length === conflictBefore.abnormal.length, JSON.stringify({ digest: conflictDigest.result, candidateId: conflictCandidateId, reply: firstText(conflictConfirm), quickReplyItems: conflictQuickReplyItems, beforeEvents: conflictBefore.events.length, afterEvents: conflictState.events.length, beforeAbnormal: conflictBefore.abnormal.length, afterAbnormal: conflictState.abnormal.length }));
    const conflictPrompt = await dispatch(postbackEvent("ambient-conflict-edit", `action=ambient_conflict_quantity&candidate=${encodeURIComponent(conflictCandidateId)}`, conflictUser, "2026-08-20T16:00:00.000Z"));
    const conflictCorrection = await dispatch(messageEvent("ambient-conflict-correction", "不是32，是20", conflictUser, "2026-08-20T16:00:01.000Z"));
    const correctedCandidateState = await state();
    const correctedCandidate = correctedCandidateState.candidates.find((row) => row.id === conflictCandidateId);
    const correctedBundle = correctedCandidate ? JSON.parse(correctedCandidate.candidateJson) : null;
    const correctedItem = correctedBundle?.candidates?.[0]?.items?.[0];
    const conflictIgnored = await dispatch(postbackEvent("ambient-conflict-ignore", `action=ambient_ignore&candidate=${encodeURIComponent(conflictCandidateId)}`, conflictUser, "2026-08-20T16:00:02.000Z"));
    const ignoredState = await state();
    check("AMBIENT-CANDIDATE-NATURAL-CORRECTION", firstText(conflictPrompt).includes("死亡20") && /待確認內容已更新|更新待確認資料/u.test(firstText(conflictCorrection)) && correctedItem?.quantity === 20 && correctedBundle?.candidates?.[0]?.conflict === false && correctedCandidateState.events.length === conflictBefore.events.length && correctedCandidateState.abnormal.length === conflictBefore.abnormal.length && firstText(conflictIgnored).includes("已忽略") && ignoredState.candidates.some((row) => row.id === conflictCandidateId && row.status === "ignored"), JSON.stringify({ prompt: firstText(conflictPrompt), correction: firstText(conflictCorrection), item: correctedItem, bundleCandidate: correctedBundle?.candidates?.[0], ignored: firstText(conflictIgnored), ignoredRow: ignoredState.candidates.find((row) => row.id === conflictCandidateId) }));
    const ignoredRecheck = await runDigest({ groupId, now: "2026-08-20T17:00:00.000Z" });
    check("AMBIENT-IGNORE-NO-REEXTRACTION", ignoredRecheck.result.aiCalls === 0 && ignoredRecheck.result.candidatesCreated === 0 && ignoredRecheck.result.groupsScanned === 0);

    const unrelatedReplies = [];
    for (let index = 0; index < 20; index += 1) {
      unrelatedReplies.push(await dispatch(messageEvent(`unrelated-chat-${index}`, index % 2 ? "晚點吃什麼" : "明天幾點集合", `${prefix}-unrelated-user-${index}`, previousMs + 7000 + index)));
    }
    const quietDigest = await runDigest({ groupId, now: "2026-08-20T14:00:00.000Z" });
    check("NO-CANDIDATE-COMPLETE-SILENCE", unrelatedReplies.every((result) => result.reply.messages.length === 0) && quietDigest.result.aiCalls === 0 && quietDigest.pushes.length === 0);

    const expired = await dispatch(messageEvent("expired-chat", "金雞測試場好像有咳嗽", `${prefix}-expired-user`, "2026-08-18T12:00:00.000Z"));
    const expiredRun = await runDigest({ groupId, now: "2026-08-20T14:00:00.000Z" });
    current = await state();
    check("AMBIENT-24H-CLEANUP", expired.reply.messages.length === 0 && expiredRun.result.expiredBuffers >= 1 && !current.ambient.some((row) => row.lineMessageId.includes(`${prefix}-expired-chat`)));

    console.log(`LOCAL_AMBIENT_RUNTIME_CHECKS=${checks.filter((item) => item.pass).length}/${checks.length}`);
    console.log(`LOCAL_AMBIENT_RUNTIME_RESULT=${checks.every((item) => item.pass) ? "PASS" : "FAIL"}`);
    if (!checks.every((item) => item.pass)) process.exitCode = 1;
  } finally {
    await cleanup();
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
