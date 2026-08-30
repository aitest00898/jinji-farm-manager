import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9460 + Math.floor(Math.random() * 30);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-candidate-repair-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-${Date.now().toString(36)}`;
const botMention = "@金雞協會助理Ai";
const userId = `${prefix}-user`;
let sequence = 0;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function messageEvent(label, text, timestamp, mention = false) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const visibleText = mention ? `${botMention} ${text}` : text;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.parse(timestamp) + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: visibleText,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] } } : {}),
    },
  };
}

function postbackEvent(label, data, timestamp) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "postback",
    webhookEventId: eventId,
    timestamp: Date.parse(timestamp) + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId },
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
  if (!result.response.ok || !result.body.ok) throw new Error(`dispatch failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function digest(now, raw) {
  const result = await request("/__codex/runtime/ambient", {
    method: "POST",
    body: JSON.stringify({
      groupId,
      trigger: "manual",
      now,
      cutoffAt: now,
      candidate: {
        candidates: [{
          farmText: null,
          caretakerText: "林志騰",
          eventType: "mortality",
          quantity: 5,
          quantityConfidence: "high",
          rawTexts: [raw],
          conflict: false,
          items: [{ type: "mortality", quantity: 5, raw, confidence: "high" }],
        }],
      },
    }),
  });
  if (!result.response.ok || !result.body.ok) throw new Error(`digest failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (!result.response.ok || !result.body.ok) throw new Error(`state failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

function businessState(value) {
  return {
    events: value.events,
    pending: value.pending,
    quickItems: value.quickItems,
    abnormal: value.abnormal,
    bundles: value.bundles,
    audits: value.audits,
    ambient: value.ambient,
    candidates: value.candidates,
  };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

function sqlEscape(value) { return value.replaceAll("'", "''"); }
function executeSql(sql) { run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]); }

async function cleanup() {
  executeSql([
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${sqlEscape(groupId)}';`,
  ].join("\n"));
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
  const baseTime = "2035-01-01T00:00:00.000Z";
  try {
    await waitForHealth();
    const source = await dispatch(messageEvent("source-one", "死亡5", baseTime));
    const firstDigest = await digest("2035-01-01T00:05:00.000Z", `${prefix}-死亡5`);
    const firstCandidateId = firstDigest.pushes?.[0]?.candidateId;
    const inbox = await dispatch(messageEvent("open-inbox", "摘要", "2035-01-01T00:06:00.000Z", true));
    const inboxText = inbox.reply.messages.map((message) => message.text ?? "").join("\n");
    const inboxActions = inbox.reply.messages.flatMap((message) => message.quickReply?.items ?? []);
    check("CANDIDATE-INBOX-OPEN", source.reply.messages.length === 0 && /待確認/u.test(inboxText) && inboxActions.some((item) => item.action?.data?.includes("ambient_candidate_edit")), JSON.stringify(inbox.reply));

    const edited = await dispatch(messageEvent("edit-farm", "改成金雞測試場", "2035-01-01T00:07:00.000Z", true));
    const editedState = await state();
    const editedCandidate = editedState.candidates.find((row) => row.id === firstCandidateId);
    const editedBundle = editedCandidate ? JSON.parse(editedCandidate.candidateJson) : null;
    check("CANDIDATE-EDIT-PRESERVES-KNOWN-FIELDS", editedBundle?.candidates?.[0]?.items?.[0]?.quantity === 5 && editedBundle?.candidates?.[0]?.resolution?.resolvedFarmId && !editedState.events.some((row) => row.sourceEventId.includes(prefix)));
    check("CANDIDATE-EDIT-REPLIES-NEXT-STEP", (edited.reply.messages[0]?.quickReply?.items ?? []).some((item) => item.action?.data?.includes("ambient_confirm_all")));

    const clearedQuantity = await dispatch(messageEvent("clear-known-quantity", "清除數量", "2035-01-01T00:07:30.000Z", true));
    const clearedState = await state();
    const clearedCandidate = clearedState.candidates.find((row) => row.id === firstCandidateId);
    const clearedBundle = clearedCandidate ? JSON.parse(clearedCandidate.candidateJson) : null;
    check("CANDIDATE-CLEAR-FIELD", clearedBundle?.candidates?.[0]?.items?.[0]?.quantity === null && clearedBundle?.candidates?.[0]?.quantityConfidence === "unknown" && /數量|確認/u.test(clearedQuantity.reply.messages[0]?.text ?? ""));
    const restoredQuantity = await dispatch(messageEvent("restore-known-quantity", "數量改成5", "2035-01-01T00:07:45.000Z", true));
    const restoredState = await state();
    const restoredCandidate = restoredState.candidates.find((row) => row.id === firstCandidateId);
    const restoredBundle = restoredCandidate ? JSON.parse(restoredCandidate.candidateJson) : null;
    check("CANDIDATE-SET-FIELD-AFTER-CLEAR", restoredBundle?.candidates?.[0]?.items?.[0]?.quantity === 5 && /確認紀錄|確認下一步/u.test(restoredQuantity.reply.messages[0]?.text ?? ""), JSON.stringify({ reply: restoredQuantity.reply, bundle: restoredBundle }));

    const beforeExplain = await state();
    const explanation = await dispatch(messageEvent("explain-clue", "飼養者線索有什麼不同", "2035-01-01T00:07:50.000Z", true));
    const explanationText = explanation.reply.messages.map((message) => message.text ?? "").join("\n");
    const afterExplain = await state();
    check("CONVERSATIONAL-EXPLAIN-READ-ONLY", /林志騰/u.test(explanationText) && /雞場|線索|不一致/u.test(explanationText) && JSON.stringify(businessState(beforeExplain)) === JSON.stringify(businessState(afterExplain)), explanationText);

    const explicitFarm = await dispatch(messageEvent("explicit-farm-override", "就用金雞測試場", "2035-01-01T00:07:55.000Z", true));
    const explicitFarmState = await state();
    const explicitFarmCandidate = explicitFarmState.candidates.find((row) => row.id === firstCandidateId);
    const explicitFarmBundle = explicitFarmCandidate ? JSON.parse(explicitFarmCandidate.candidateJson) : null;
    check("CONVERSATIONAL-EXPLICIT-FARM-OVERRIDES-CLUE", explicitFarmBundle?.candidates?.[0]?.items?.[0]?.quantity === 5
      && explicitFarmBundle?.candidates?.[0]?.userOverrides?.farm?.status === "selected"
      && !/無法|不一致/u.test(explicitFarm.reply.messages[0]?.text ?? ""), explicitFarm.reply.messages[0]?.text ?? "");

    const dismissed = await dispatch(messageEvent("dismiss-caretaker-clue", "那不要管林志騰", "2035-01-01T00:07:58.000Z", true));
    const dismissedState = await state();
    const dismissedCandidate = dismissedState.candidates.find((row) => row.id === firstCandidateId);
    const dismissedBundle = dismissedCandidate ? JSON.parse(dismissedCandidate.candidateJson) : null;
    check("CONVERSATIONAL-DISMISS-NONBLOCKING-CLUE", dismissedBundle?.candidates?.[0]?.items?.[0]?.quantity === 5
      && dismissedBundle?.candidates?.[0]?.userOverrides?.caretaker?.status === "dismissed"
      && dismissedState.events.filter((row) => row.sourceEventId.includes(prefix)).length === 0, dismissed.reply.messages[0]?.text ?? "");

    const cancelled = await dispatch(messageEvent("cancel-command", "取消", "2035-01-01T00:08:00.000Z", true));
    const afterCancel = await state();
    check("CANDIDATE-CANCEL-COMMAND", /已取消/u.test(cancelled.reply.messages[0]?.text ?? "") && afterCancel.candidates.some((row) => row.id === firstCandidateId && row.status === "ignored"));
    const reopened = await dispatch(messageEvent("reopen-after-cancel", "摘要", "2035-01-01T00:09:00.000Z", true));
    check("CANCEL-SOURCE-NO-REDIGEST", !reopened.reply.messages.some((message) => message.text?.includes("死亡5")) && afterCancel.ambient.every((row) => row.digestStatus !== "buffered"));

    await dispatch(messageEvent("source-two", "死亡5", "2035-01-01T00:10:00.000Z"));
    const second = await digest("2035-01-01T00:11:00.000Z", `${prefix}-second`);
    check("CANCEL-DOES-NOT-SUPPRESS-NEW-EVENT", second.result.candidatesCreated === 1);

    await dispatch(messageEvent("source-three", "死亡5", "2035-01-01T00:12:00.000Z"));
    await digest("2035-01-01T00:13:00.000Z", `${prefix}-third`);
    const multipleCancel = await dispatch(messageEvent("cancel-multiple", "取消", "2035-01-01T00:14:00.000Z", true));
    const multipleActions = multipleCancel.reply.messages.flatMap((message) => message.quickReply?.items ?? []);
    check("CANDIDATE-CANCEL-MULTIPLE-SELECTION", /多筆/u.test(multipleCancel.reply.messages[0]?.text ?? "") && multipleActions.filter((item) => item.action?.data?.includes("ambient_candidate_select")).length >= 2, JSON.stringify(multipleCancel.reply));

    const selection = multipleActions.find((item) => item.action?.data?.includes("ambient_candidate_select"))?.action?.data;
    const selected = selection ? await dispatch(postbackEvent("select-for-cancel", selection, "2035-01-01T00:15:00.000Z")) : null;
    const cancelAction = selected?.reply?.messages?.flatMap((message) => message.quickReply?.items ?? []).find((item) => item.action?.data?.includes("ambient_candidate_cancel"))?.action?.data;
    const cancelledByQuickReply = cancelAction ? await dispatch(postbackEvent("cancel-by-quick-reply", cancelAction, "2035-01-01T00:16:00.000Z")) : null;
    check("CANDIDATE-CANCEL-QUICK-REPLY", Boolean(cancelAction) && /已取消|處理完成/u.test(cancelledByQuickReply?.reply?.messages?.[0]?.text ?? ""));

    const fallback = await dispatch(messageEvent("generic-edit", "這筆不對", "2035-01-01T00:17:00.000Z", true));
    const fallbackActions = fallback.reply.messages.flatMap((message) => message.quickReply?.items ?? []);
    check("CANDIDATE-UNKNOWN-FALLBACK", /修改哪一項|待確認/u.test(fallback.reply.messages[0]?.text ?? "") && fallbackActions.some((item) => item.action?.data?.includes("ambient_candidate_field")), JSON.stringify(fallback.reply));
    check("CANDIDATE-RECONCILE-AFTER-EDIT", editedState.candidates.some((row) => row.candidateJson.includes("resolvedFarmId")));
    console.log(`LOCAL_CANDIDATE_REPAIR_RUNTIME_CHECKS=${checks.filter(Boolean).length}/${checks.length}`);
    console.log(`LOCAL_CANDIDATE_REPAIR_RUNTIME_RESULT=${checks.every(Boolean) ? "PASS" : "FAIL"}`);
    if (!checks.every(Boolean)) process.exitCode = 1;
  } finally {
    await cleanup();
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
