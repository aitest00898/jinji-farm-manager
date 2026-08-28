import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9520 + Math.floor(Math.random() * 30);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-conversation-preview-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-preview-${Date.now().toString(36)}`;
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
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.parse(timestamp) + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: mention ? `${botMention} ${text}` : text,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] } } : {}),
    },
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

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (!result.response.ok || !result.body.ok) throw new Error(`state failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

function sqlEscape(value) { return value.replaceAll("'", "''"); }
function executeSql(sql) { run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]); }

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

async function cleanup() {
  executeSql([
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${sqlEscape(prefix)}%' OR text LIKE '%${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_expiry_diagnostics WHERE line_group_id = '${sqlEscape(groupId)}';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${sqlEscape(groupId)}';`,
    `DELETE FROM admin_sessions WHERE line_group_id = '${sqlEscape(groupId)}' AND line_user_id = '${sqlEscape(userId)}';`,
  ].join("\n"));
}

function stateFingerprint(value) {
  return JSON.stringify({
    events: value.events,
    abnormal: value.abnormal,
    pending: value.pending,
    ambient: value.ambient,
    candidates: value.candidates,
    audits: value.audits,
  });
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
    await dispatch(messageEvent("death", "死亡5", baseTime));
    await dispatch(messageEvent("caretaker", "林志騰", "2035-01-01T00:00:01.000Z"));
    const unauthorizedPreview = await dispatch(messageEvent("preview-unauthorized", "顯示待摘要訊息", "2035-01-01T00:00:30.000Z"));
    const unauthorizedText = unauthorizedPreview.reply.messages.map((message) => message.text ?? "").join("\n");
    check("PREVIEW-ADMIN-AUTHORIZATION", unauthorizedText.includes("只有管理者") && !unauthorizedText.includes("尚待整理訊息"), unauthorizedText);
    executeSql(`INSERT OR REPLACE INTO admin_sessions (id, line_group_id, line_user_id, expires_at) VALUES ('${sqlEscape(prefix)}-admin-session', '${sqlEscape(groupId)}', '${sqlEscape(userId)}', '2099-01-01T00:00:00.000Z');`);
    const beforePreview = await state();

    const preview = await dispatch(messageEvent("preview-bare", "顯示待摘要訊息", "2035-01-01T00:01:00.000Z"));
    const previewText = preview.reply.messages.map((message) => message.text ?? "").join("\n");
    const afterPreview = await state();
    check("PREVIEW-BUFFERED-SOURCES-VISIBLE", /尚待整理訊息：2/u.test(previewText) && previewText.includes("死亡5") && previewText.includes("林志騰"), previewText);
    check("PREVIEW-NO-AI-OR-D1-STATE-CHANGE", stateFingerprint(beforePreview) === stateFingerprint(afterPreview));
    check("PREVIEW-COMMAND-NOT-BUFFERED", !afterPreview.ambient.some((row) => row.lineMessageId.includes("preview-bare-message")));

    const mentionPreview = await dispatch(messageEvent("preview-mention", "顯示待摘要訊息", "2035-01-01T00:02:00.000Z", true));
    const mentionText = mentionPreview.reply.messages.map((message) => message.text ?? "").join("\n");
    check("PREVIEW-MENTION-SAME-READ-ONLY-RESULT", /尚待整理訊息：2/u.test(mentionText) && stateFingerprint(afterPreview) === stateFingerprint(await state()));

    const pageRows = Array.from({ length: 11 }, (_, index) => dispatch(messageEvent(
      `page-${index + 1}`,
      `金雞測試場好像有咳嗽 ${prefix}-${index + 1}`,
      `2035-01-01T00:${String(3 + index).padStart(2, "0")}:00.000Z`,
    )));
    await Promise.all(pageRows);
    const paged = await dispatch(messageEvent("preview-paged", "顯示待摘要訊息", "2035-01-01T00:20:00.000Z"));
    const pagedText = paged.reply.messages.map((message) => message.text ?? "").join("\n");
    const hasNext = paged.reply.messages.flatMap((message) => message.quickReply?.items ?? [])
      .some((item) => item.action?.data?.includes("ambient_preview_page") && item.action?.data?.includes("page=1"));
    check("PREVIEW-OLD-BUFFERED-AND-PAGINATED", /第 1\/2 頁/u.test(pagedText) && hasNext, pagedText);

    await dispatch(messageEvent("expired-source", `codex-expired-ambient-${prefix}`, "2034-12-31T00:00:00.000Z"));

    const digest = await request("/__codex/runtime/ambient", {
      method: "POST",
      body: JSON.stringify({
        groupId,
        trigger: "manual",
        now: "2035-01-01T00:21:00.000Z",
        cutoffAt: "2035-01-01T00:21:00.000Z",
        candidate: {
          candidates: [{
            farmText: null,
            caretakerText: "林志騰",
            eventType: "mortality",
            quantity: 5,
            quantityConfidence: "high",
            rawTexts: ["死亡5", "林志騰"],
            sourceMessageIds: [`${prefix}-death-message`, `${prefix}-caretaker-message`],
            sourceTimestamps: [baseTime, "2035-01-01T00:00:01.000Z"],
            sourceUsers: [userId],
            conflict: false,
            items: [{ type: "mortality", quantity: 5, raw: "死亡5", confidence: "high" }],
          }],
        },
      }),
    });
    check("PREVIEW-FIXTURE-DIGEST-SUCCESS", digest.response.ok && digest.body.ok, JSON.stringify(digest.body));
    const afterDigestPreview = await dispatch(messageEvent("preview-after-digest", "顯示待摘要訊息", "2035-01-01T00:22:00.000Z"));
    const afterDigestText = afterDigestPreview.reply.messages.map((message) => message.text ?? "").join("\n");
    const afterDigestState = await state();
    check("PROCESSED-SOURCE-NOT-PENDING", !afterDigestState.ambient.some((row) => row.digestStatus === "buffered" && (row.lineMessageId.includes(`${prefix}-death-message`) || row.lineMessageId.includes(`${prefix}-caretaker-message`))), afterDigestText);
    check("OPEN-CANDIDATE-COUNT-REMAINS-READABLE", /Open Candidate：1/u.test(afterDigestText) || afterDigestState.candidates.length > 0, JSON.stringify(afterDigestState.candidates));
    check("PREVIEW-EXPIRED-DIAGNOSTIC", afterDigestText.includes("已過期但未成功完成摘要")
      && /已過期但未完成：\d+ 筆/u.test(afterDigestText)
      && !afterDigestText.includes(`codex-expired-ambient-${prefix}`), afterDigestText);

    const repeatedPreview = await dispatch(messageEvent("preview-repeat", "顯示待摘要訊息", "2035-01-01T00:23:00.000Z"));
    const repeatedText = repeatedPreview.reply.messages.map((message) => message.text ?? "").join("\n");
    check("PREVIEW-REPEAT-NO-REEXTRACTION", !/摘要尚未完成/u.test(repeatedText) && (await state()).candidates.length === afterDigestState.candidates.length);

    console.log(`LOCAL_CONVERSATIONAL_PREVIEW_RUNTIME_CHECKS=${checks.filter(Boolean).length}/${checks.length}`);
    console.log(`LOCAL_CONVERSATIONAL_PREVIEW_RUNTIME_RESULT=${checks.every(Boolean) ? "PASS" : "FAIL"}`);
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
