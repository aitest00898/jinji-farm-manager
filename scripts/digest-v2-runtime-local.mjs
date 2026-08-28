import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9250 + Math.floor(Math.random() * 40);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-digest-v2-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-digest-v2-${Date.now().toString(36)}`;
const botMention = "@金雞協會助理Ai";
const checks = [];
let sequence = 0;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function messageEvent(label, text, user, timestamp, { mention = false } = {}) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const timestampMs = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: timestampMs + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId: user },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: mention ? `${botMention} ${text}` : text,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] } } : {}),
    },
  };
}

function postbackEvent(label, data, user, timestamp) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const timestampMs = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return {
    type: "postback",
    webhookEventId: eventId,
    timestamp: timestampMs + sequence,
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
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`dispatch failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function runDigest(body) {
  const result = await request("/__codex/runtime/ambient", { method: "POST", body: JSON.stringify(body) });
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`digest failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error("state failed");
  return result.body;
}

function candidate({ farmText = null, caretakerText = null, eventType = "mortality", quantity = null, raw, sourceMessageIds = [], sourceTimestamps = [], conflict = false, conflictText = null } = {}) {
  return {
    candidates: [{
      eventType,
      quantity,
      quantityConfidence: quantity === null ? "unknown" : "high",
      farmText,
      caretakerText,
      houseText: null,
      flockText: null,
      rawTexts: [raw],
      sourceMessageIds,
      sourceTimestamps,
      uncertainties: [],
      conflicts: conflict ? [conflictText ?? "quantity_conflict"] : [],
      conflict,
      conflictText,
      items: [{ type: eventType, quantity: eventType === "abnormal" ? null : quantity, raw, confidence: quantity === null ? "low" : "high" }],
    }],
  };
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

function cleanup() {
  const sql = [
    `UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'local_digest_v2_cleanup') WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE abnormal_events SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, reason = COALESCE(reason, 'local_digest_v2_cleanup'), updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_items SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${prefix}%';`,
    `UPDATE quick_record_bundles SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id LIKE 'quick-bundle-${prefix}%';`,
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${prefix}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${prefix}%';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${groupId}';`,
  ].join("\n");
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]);
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  cleanup();
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();

    const caretakerUser = `${prefix}-caretaker-user`;
    await dispatch(messageEvent("caretaker-death", "死亡5", caretakerUser, "2026-08-19T01:00:00.000Z"));
    await dispatch(messageEvent("caretaker-clue", "林志騰", caretakerUser, "2026-08-19T01:00:05.000Z"));
    const caretakerRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T01:10:00.000Z", cutoffAt: "2026-08-19T01:10:00.000Z",
      candidate: candidate({ caretakerText: "林志騰", quantity: 5, raw: "死亡5", sourceTimestamps: ["2026-08-19T01:00:00.001Z", "2026-08-19T01:00:05.002Z"] }),
    });
    const caretakerOutcome = caretakerRun.result.outcomes[0];
    const caretakerCandidate = caretakerOutcome?.bundle?.candidates?.[0];
    check("V2-CARETAKER-CLUE", caretakerOutcome?.status === "candidate" && caretakerCandidate?.caretakerText === "林志騰");
    check("V2-CARETAKER-AMBIGUOUS-FARM", caretakerCandidate?.state === "unresolved_entity" && (caretakerCandidate.resolution?.candidateFarmNames?.length ?? 0) >= 2, JSON.stringify(caretakerCandidate?.resolution));
    check("V2-UNCERTAINTY-CONSUMED", (await state()).ambient.filter((row) => row.lineMessageId.includes(`${prefix}-caretaker-`)).every((row) => row.digestStatus === "processed"));

    const unknownUser = `${prefix}-unknown-user`;
    await dispatch(messageEvent("unknown-farm", "死亡5", unknownUser, "2026-08-19T02:00:00.000Z"));
    const unknownRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T02:10:00.000Z", cutoffAt: "2026-08-19T02:10:00.000Z",
      candidate: candidate({ quantity: 5, raw: "死亡5", sourceTimestamps: ["2026-08-19T02:00:00.001Z"] }),
    });
    check("V2-UNKNOWN-FARM-NOT-FAILURE", unknownRun.result.outcomes[0]?.status === "candidate" && unknownRun.result.outcomes[0]?.bundle?.candidates?.[0]?.state === "unresolved_entity");

    const sameUser = `${prefix}-same-user`;
    await dispatch(messageEvent("explicit-source", "金雞測試場死亡1", sameUser, "2026-08-19T03:00:00.000Z"));
    const explicit = await dispatch(messageEvent("explicit-record", "金雞測試場死亡1", sameUser, "2026-08-19T03:05:00.000Z", { mention: true }));
    const beforeReconcile = (await state()).events.filter((row) => row.sourceEventId.includes(`${prefix}-explicit-record`)).length;
    const alreadyRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T03:10:00.000Z", cutoffAt: "2026-08-19T03:10:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", quantity: 1, raw: "金雞測試場死亡1", sourceTimestamps: ["2026-08-19T03:00:00.001Z"], sourceMessageIds: [`${prefix}-explicit-source-message`] }),
    });
    check("V2-EXPLICIT-RECONCILIATION", explicit.reply.messages.length > 0 && alreadyRun.result.outcomes[0]?.status === "already_recorded" && alreadyRun.result.candidatesCreated === 0);
    check("V2-ALREADY-NO-DUPLICATE-WRITE", (await state()).events.filter((row) => row.sourceEventId.includes(`${prefix}-explicit-record`)).length === beforeReconcile);

    const webUser = `${prefix}-web-user`;
    await dispatch(messageEvent("web-source", "金雞測試場死亡4", webUser, "2026-08-19T03:30:00.000Z"));
    run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", [
      "INSERT INTO operational_events (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date, raw_message, source_event_id, created_at)",
      `VALUES ('${prefix}-web-official', 'org-mafu-investment', 'farm-local-quick-record', '${groupId}', '${webUser}', 'mortality', 4, '隻', '2026-08-19', '金雞測試場死亡4', '${prefix}-web-official-source', '2026-08-19T03:35:00.000Z');`,
    ].join(" ")]);
    const webRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T03:40:00.000Z", cutoffAt: "2026-08-19T03:40:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", quantity: 4, raw: "金雞測試場死亡4", sourceTimestamps: ["2026-08-19T03:30:00.001Z"] }),
    });
    check("V2-WEB-RECONCILIATION", webRun.result.outcomes[0]?.status === "already_recorded" && webRun.result.candidatesCreated === 0);

    const quickReplyUser = `${prefix}-quick-reply-user`;
    await dispatch(messageEvent("quick-reply-source", "金雞測試場死亡5", quickReplyUser, "2026-08-19T03:50:00.000Z"));
    await dispatch(postbackEvent("quick-reply-category", "action=quick_record_category&type=mortality", quickReplyUser, "2026-08-19T03:51:00.000Z"));
    await dispatch(postbackEvent("quick-reply-count", "action=quick_record_count&type=mortality&count=5", quickReplyUser, "2026-08-19T03:52:00.000Z"));
    const quickReplyFarm = await dispatch(postbackEvent("quick-reply-farm", "action=pending_select_farm&farm=farm-local-quick-record", quickReplyUser, "2026-08-19T03:53:00.000Z"));
    const quickReplyRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T04:00:00.000Z", cutoffAt: "2026-08-19T04:00:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", quantity: 5, raw: "金雞測試場死亡5", sourceTimestamps: ["2026-08-19T03:50:00.001Z"] }),
    });
    check("V2-QUICK-REPLY-RECONCILIATION", /已紀錄/u.test(quickReplyFarm.reply?.messages?.[0]?.text ?? "") && quickReplyRun.result.outcomes[0]?.status === "already_recorded");

    const differentFarmUser = `${prefix}-different-farm-user`;
    await dispatch(messageEvent("different-farm-source", "金雞測試場死亡2", differentFarmUser, "2026-08-19T04:30:00.000Z"));
    await dispatch(messageEvent("different-farm-official", "金雞測試場B死亡2", differentFarmUser, "2026-08-19T04:35:00.000Z", { mention: true }));
    const differentFarmRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T04:40:00.000Z", cutoffAt: "2026-08-19T04:40:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", quantity: 2, raw: "金雞測試場死亡2", sourceTimestamps: ["2026-08-19T04:30:00.001Z"] }),
    });
    check("V2-DIFFERENT-FARM-NO-DEDUPE", differentFarmRun.result.outcomes[0]?.bundle?.candidates?.[0]?.state === "new", JSON.stringify({ candidate: differentFarmRun.result.outcomes[0]?.bundle?.candidates?.[0], events: (await state()).events.filter((row) => row.sourceEventId.includes(`${prefix}-different-farm`)) }));

    const quantityUser = `${prefix}-quantity-user`;
    await dispatch(messageEvent("quantity-source", "金雞測試場死亡5", quantityUser, "2026-08-19T05:00:00.000Z"));
    await dispatch(messageEvent("quantity-official", "金雞測試場死亡3", quantityUser, "2026-08-19T05:05:00.000Z", { mention: true }));
    const quantityRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T05:10:00.000Z", cutoffAt: "2026-08-19T05:10:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", quantity: 5, raw: "金雞測試場死亡5", sourceTimestamps: ["2026-08-19T05:00:00.001Z"] }),
    });
    check("V2-DIFFERENT-QUANTITY-POSSIBLE", quantityRun.result.outcomes[0]?.bundle?.candidates?.[0]?.state === "possibly_recorded");
    const quantityCandidateId = quantityRun.result.outcomes[0]?.candidateId;
    const beforePossibleCommit = (await state()).events.filter((row) => row.sourceEventId.includes(prefix)).length;
    const blockedPossibleCommit = await dispatch(postbackEvent("possible-duplicate-blocked", `action=ambient_confirm_all&candidate=${encodeURIComponent(quantityCandidateId)}`, quantityUser, "2026-08-19T05:10:30.000Z"));
    check("V2-POSSIBLE-DUPLICATE-BLOCKED", /可能已經紀錄|先確認/u.test(blockedPossibleCommit.reply?.messages?.[0]?.text ?? "") && (await state()).events.filter((row) => row.sourceEventId.includes(prefix)).length === beforePossibleCommit);
    const possibleCommit = await dispatch(postbackEvent("possible-duplicate-new", `action=ambient_reconcile_new&candidate=${encodeURIComponent(quantityCandidateId)}`, quantityUser, "2026-08-19T05:11:00.000Z"));
    const afterPossibleCommit = await state();
    check("V2-ASK-BEFORE-COMMIT", /已紀錄/u.test(possibleCommit.reply?.messages?.[0]?.text ?? "") && afterPossibleCommit.events.length > beforePossibleCommit);

    const conflictUser = `${prefix}-conflict-user`;
    await dispatch(messageEvent("conflict-source", "金雞測試場好像死20多隻", conflictUser, "2026-08-19T05:30:00.000Z"));
    const conflictRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T05:40:00.000Z", cutoffAt: "2026-08-19T05:40:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", quantity: null, raw: "好像20多 / 大概30", conflict: true, conflictText: "群組提到約20多與約30", sourceTimestamps: ["2026-08-19T05:30:00.001Z"] }),
    });
    const conflictCandidateId = conflictRun.result.outcomes[0]?.candidateId;
    const conflictPrompt = await dispatch(postbackEvent("conflict-quantity-prompt", `action=ambient_conflict_quantity&candidate=${encodeURIComponent(conflictCandidateId)}`, conflictUser, "2026-08-19T05:41:00.000Z"));
    const conflictQuantity = await dispatch(messageEvent("conflict-plain-quantity", "20", conflictUser, "2026-08-19T05:42:00.000Z"));
    check("V2-CONFLICT-ASK-NOT-FAILURE", conflictRun.result.outcomes[0]?.status === "candidate" && /尚未寫入|彼此不一致/u.test(conflictPrompt.reply?.messages?.[0]?.text ?? ""));
    check("V2-CONFLICT-PLAIN-QUANTITY", /待確認內容已更新/u.test(conflictQuantity.reply?.messages?.[0]?.text ?? ""));

    const continuationUser = `${prefix}-continuation-user`;
    await dispatch(messageEvent("continuation-source", "金雞測試場咳嗽", continuationUser, "2026-08-19T06:00:00.000Z"));
    await dispatch(messageEvent("continuation-official", "金雞測試場咳嗽", continuationUser, "2026-08-19T06:05:00.000Z", { mention: true }));
    await dispatch(messageEvent("continuation-followup", "金雞測試場還在咳", continuationUser, "2026-08-19T07:00:00.000Z"));
    const continuationRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T07:10:00.000Z", cutoffAt: "2026-08-19T07:10:00.000Z",
      candidate: candidate({ farmText: "金雞測試場", eventType: "abnormal", quantity: null, raw: "金雞測試場還在咳", sourceTimestamps: ["2026-08-19T07:00:00.001Z"] }),
    });
    check("V2-ABNORMAL-CONTINUATION-POSSIBLE", continuationRun.result.outcomes[0]?.bundle?.candidates?.[0]?.state === "possibly_recorded");

    const unrelatedUser = `${prefix}-unrelated-user`;
    await dispatch(messageEvent("no-candidate", "晚點吃什麼", unrelatedUser, "2026-08-19T09:00:00.000Z"));
    const noCandidateRun = await runDigest({
      groupId, trigger: "manual", now: "2026-08-19T09:10:00.000Z", cutoffAt: "2026-08-19T09:10:00.000Z",
      candidate: { candidates: [] },
    });
    check("V2-NO-CANDIDATE-CONSUMES", noCandidateRun.result.outcomes[0]?.status === "no_candidate" && (await state()).ambient.filter((row) => row.lineMessageId.includes(`${prefix}-no-candidate`)).every((row) => row.digestStatus === "processed"));

    console.log(`LOCAL_DIGEST_V2_RUNTIME_CHECKS=${checks.filter((item) => item.pass).length}/${checks.length}`);
    console.log(`LOCAL_DIGEST_V2_RUNTIME_RESULT=${checks.every((item) => item.pass) ? "PASS" : "FAIL"}`);
    if (!checks.every((item) => item.pass)) process.exitCode = 1;
  } finally {
    cleanup();
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
