import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9230 + Math.floor(Math.random() * 50);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-manual-ambient-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const candidateGroupId = `${groupId}-candidate-inbox`;
const prefix = `codex-runtime-${Date.now().toString(36)}`;
const botMention = "@金雞協會助理Ai";
const noDataUser = `${prefix}-no-data-user`;
const bareUser = `${prefix}-bare-user`;
const candidateUser = `${prefix}-candidate-user`;
const retentionUser = `${prefix}-retention-user`;
const cutoffUser = `${prefix}-cutoff-user`;
const raceUser = `${prefix}-race-user`;
const leaseUser = `${prefix}-lease-user`;
// Keep this isolated from prior local runtime official rows with a synthetic
// date that cannot collide with persistent local fixture records.
// Keep the local scenario outside the historical fixture horizon so an old
// effective-record row cannot be mistaken for the candidate under test.
const candidateScenarioBase = Date.UTC(2199, 0, 1) + Math.floor(Math.random() * 24 * 60 * 60 * 1000);
const candidateScenarioTime = (offsetMs) => new Date(candidateScenarioBase + offsetMs).toISOString();
let sequence = 0;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass) });
  const printableDetail = detail.length > 800 ? `${detail.slice(0, 800)}…` : detail;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${printableDetail ? ` — ${printableDetail}` : ""}`);
}

function messageEvent(label, text, user, timestamp, { mention = false, eventGroupId = groupId } = {}) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  const timestampMs = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  const visibleText = mention ? `${botMention} ${text}` : text;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: timestampMs + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId: eventGroupId, userId: user },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: visibleText,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] } } : {}),
    },
  };
}

function postbackEvent(label, data, user, timestamp, eventGroupId = groupId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "postback",
    webhookEventId: eventId,
    timestamp: Date.parse(timestamp) + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId: eventGroupId, userId: user },
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

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`runtime state failed: ${result.response.status} ${JSON.stringify(result.body)}`);
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

function candidate(raw = "咳嗽") {
  return {
    candidates: [{
      farmText: "金雞測試場",
      houseText: "測試1舍",
      flockText: null,
      conflict: false,
      items: [{ type: "abnormal", quantity: null, raw, confidence: "high" }],
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

function sqlEscape(value) {
  return value.replaceAll("'", "''");
}

function executeSql(sql) {
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]);
}

async function cleanup() {
  const cleanupSql = [
    // This runtime confirms one synthetic Candidate to exercise the existing
    // Quick Record path.  Keep the local D1 reusable between runs without
    // deleting append-only audit history: old synthetic official rows must be
    // made ineffective before the reconciliation fixture starts again.
    `UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'local_manual_ambient_cleanup') WHERE line_group_id = '${sqlEscape(candidateGroupId)}' AND source_event_id LIKE 'codex-runtime-%-candidate-confirm:ambient:%';`,
    `UPDATE quick_record_items SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE 'codex-runtime-%-candidate-confirm:ambient:%';`,
    `UPDATE quick_record_bundles SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE line_group_id = '${sqlEscape(candidateGroupId)}' AND id LIKE 'quick-bundle-codex-runtime-%';`,
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${sqlEscape(prefix)}%' OR line_group_id IN ('${sqlEscape(groupId)}', '${sqlEscape(candidateGroupId)}');`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id IN ('${sqlEscape(groupId)}', '${sqlEscape(candidateGroupId)}');`,
  ].join("\n");
  executeSql(cleanupSql);
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  await cleanup();
  executeSql("DELETE FROM ambient_chat_buffer; DELETE FROM ambient_digest_candidates; DELETE FROM ambient_digest_leases;");
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });

  try {
    await waitForHealth();
    executeSql(`INSERT INTO line_groups (group_id, status, organization_id)
      SELECT '${sqlEscape(candidateGroupId)}', 'unbound', id
        FROM organizations
       WHERE active = 1
       ORDER BY id
       LIMIT 1
      ON CONFLICT(group_id) DO UPDATE SET organization_id = excluded.organization_id;`);

    const noData = await dispatch(messageEvent("manual-no-data", "摘要", noDataUser, "2026-08-20T12:00:00.000Z", { mention: true }));
    check("MANUAL-DIGEST-MENTION-ONLY", /目前沒有新的待摘要或待確認資訊/u.test(firstText(noData)) && noData.reply.messages.length === 1, JSON.stringify(noData.reply));
    check("MANUAL-DIGEST-IMMEDIATE", noData.trace?.interaction_gate === "explicit" && noData.trace?.mention_stripped === true);
    check("MANUAL-DIGEST-EXCLUDES-COMMAND", !(await state()).ambient.some((row) => row.lineMessageId.includes("manual-no-data-message")));

    const bare = await dispatch(messageEvent("bare-summary", "摘要", bareUser, "2026-08-20T12:01:00.000Z"));
    let current = await state();
    check("BARE-SUMMARY-REMAINS-QUIET", bare.reply.messages.length === 0 && bare.trace?.interaction_gate === "quiet");
    check("BARE-SUMMARY-BUFFERED-NOT-EXECUTED", current.ambient.some((row) => row.lineMessageId === `${prefix}-bare-summary-message` && row.digestStatus === "buffered") && !current.candidates.some((row) => row.candidateJson.includes(`${prefix}-bare-summary`)));

    await dispatch(messageEvent("manual-no-candidate-source", "收到", noDataUser, "2026-08-20T12:02:00.000Z"));
    const manualNoCandidate = await dispatch(messageEvent("manual-no-candidate", "摘要", noDataUser, "2026-08-20T12:03:00.000Z", { mention: true }));
    current = await state();
    const noCandidateCommandRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-manual-no-candidate-source-message`);
    check("MANUAL-NO-CANDIDATE-REPLY", /目前沒有發現需要確認的營運紀錄/u.test(firstText(manualNoCandidate)) && noCandidateCommandRow?.digestStatus === "processed");

    const firstSource = await dispatch(messageEvent("manual-source-a", "金雞測試場好像有咳嗽", candidateUser, "2026-08-20T12:05:00.000Z"));
    const secondSource = await dispatch(messageEvent("manual-source-b", "剛剛似乎死1隻", candidateUser, "2026-08-20T12:20:00.000Z"));
    const manualCandidate = await runDigest({
      groupId,
      trigger: "manual",
      now: "2026-08-20T12:37:00.000Z",
      cutoffAt: "2026-08-20T12:37:00.000Z",
      candidate: candidate("咳嗽"),
    });
    current = await state();
    const manualOutcome = manualCandidate.result.outcomes.find((entry) => entry.groupId === groupId);
    check("MANUAL-SHARED-PIPELINE-CANDIDATE", manualCandidate.result.trigger === "manual" && manualCandidate.result.candidatesCreated === 1 && manualOutcome?.status === "candidate" && manualCandidate.pushes.length === 1);
    check("MANUAL-SOURCE-CONSUMPTION", current.ambient.filter((row) => row.lineMessageId.includes(`${prefix}-manual-source-`)).every((row) => row.digestStatus === "processed"), JSON.stringify(manualOutcome));
    const candidateQuickReplyItems = manualCandidate.pushes[0]?.messages[0]?.quickReply?.items ?? [];
    check("MANUAL-CANDIDATE-QUICK-REPLY", candidateQuickReplyItems.length >= 3 && candidateQuickReplyItems.some((item) => item.action?.data?.includes("ambient_confirm_all")));
    check("MANUAL-NO-OFFICIAL-WRITE", !current.events.some((row) => row.sourceEventId.includes(`${prefix}-manual-source-`)) && !current.abnormal.some((row) => row.sourceEventId.includes(`${prefix}-manual-source-`)));

    const reopenedInbox = await dispatch(messageEvent("candidate-inbox-reopen", "摘要", candidateUser, "2026-08-20T12:45:30.000Z", { mention: true }));
    const reopenedTexts = reopenedInbox.reply.messages.map((message) => message.text ?? "").join("\n");
    check("MANUAL-OPEN-CANDIDATE-INBOX", /目前有 1 筆待確認營運資訊/u.test(reopenedTexts) && reopenedTexts.includes("咳嗽") && reopenedInbox.reply.messages.length === 1, JSON.stringify(reopenedInbox.reply));
    check("MANUAL-INBOX-DOES-NOT-REEXTRACT", reopenedInbox.reply.messages[0]?.quickReply?.items?.some((item) => item.action?.data?.includes("ambient_confirm_all")) && !/目前沒有新的待摘要/u.test(reopenedTexts));

    await dispatch(messageEvent("manual-new-with-open", "金雞測試場好像有白冠", candidateUser, "2026-08-20T12:48:00.000Z"));
    const mergedRun = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T12:50:00.000Z", cutoffAt: "2026-08-20T12:50:00.000Z", candidate: candidate("白冠") });
    const mergedInbox = await dispatch(messageEvent("manual-merged-inbox", "摘要", candidateUser, "2026-08-20T12:51:00.000Z", { mention: true }));
    const mergedTexts = mergedInbox.reply.messages.map((message) => message.text ?? "").join("\n");
    check("MANUAL-DIGEST-MERGES-NEW-AND-OPEN", mergedRun.result.candidatesCreated === 1 && /目前有 2 筆待確認營運資訊/u.test(mergedTexts) && mergedTexts.includes("咳嗽") && mergedTexts.includes("白冠"), JSON.stringify({ run: mergedRun.result, reply: mergedInbox.reply }));

    await dispatch(messageEvent("known-quantity-unknown-farm", "死亡5", candidateUser, candidateScenarioTime(0), { eventGroupId: candidateGroupId }));
    const unknownFarmCandidate = await runDigest({
      groupId: candidateGroupId,
      trigger: "manual",
      now: candidateScenarioTime(60_000),
      cutoffAt: candidateScenarioTime(60_000),
      candidate: {
        candidates: [{
          farmText: null,
          caretakerText: "林志騰",
          eventType: "mortality",
          quantity: 5,
          quantityConfidence: "high",
          conflict: false,
          items: [{ type: "mortality", quantity: 5, raw: "死亡5", confidence: "high" }],
        }],
      },
    });
    const unknownFarmCandidateId = unknownFarmCandidate.pushes[0]?.candidateId;
    const unknownFarmInbox = await dispatch(messageEvent("known-quantity-inbox", "摘要", candidateUser, candidateScenarioTime(120_000), { mention: true, eventGroupId: candidateGroupId }));
    const unknownFarmMessage = unknownFarmInbox.reply.messages.find((message) => message.text?.includes("死亡 5"));
    const unknownFarmActions = unknownFarmMessage?.quickReply?.items ?? [];
    check("KNOWN-QUANTITY-ASKS-FARM", Boolean(unknownFarmCandidateId) && Boolean(unknownFarmMessage) && unknownFarmActions.some((item) => item.action?.data?.includes("ambient_select_farm")) && !unknownFarmActions.some((item) => item.action?.data?.includes("ambient_conflict_quantity")), JSON.stringify(unknownFarmInbox.reply));
    const farmChoiceData = unknownFarmActions.find((item) => item.action?.data?.includes("ambient_select_farm"))?.action?.data;
    const farmChoice = farmChoiceData ? await dispatch(postbackEvent("candidate-farm-choice", farmChoiceData, candidateUser, candidateScenarioTime(180_000), candidateGroupId)) : null;
    const afterFarmChoice = await state();
    const updatedUnknownFarm = afterFarmChoice.candidates.find((row) => row.id === unknownFarmCandidateId);
    const updatedUnknownBundle = updatedUnknownFarm ? JSON.parse(updatedUnknownFarm.candidateJson) : null;
    const updatedUnknownCandidate = updatedUnknownBundle?.candidates?.[0];
    const updatedQuickReply = farmChoice?.reply?.messages?.[0]?.quickReply?.items ?? [];
    check("CANDIDATE-PARTIAL-FARM-UPDATE", Boolean(updatedUnknownCandidate?.resolution?.resolvedFarmId) && updatedUnknownCandidate?.items?.[0]?.quantity === 5 && updatedQuickReply.some((item) => item.action?.data?.includes("ambient_confirm_all")), JSON.stringify(farmChoice?.reply));
    const confirmData = updatedQuickReply.find((item) => item.action?.data?.includes("ambient_confirm_all"))?.action?.data;
    const confirmedUnknownFarm = confirmData ? await dispatch(postbackEvent("candidate-confirm", confirmData, candidateUser, candidateScenarioTime(240_000), candidateGroupId)) : null;
    const afterCandidateConfirm = await state();
    check("CANDIDATE-FINAL-CONFIRM-USES-QUICK-FLOW", Boolean(confirmedUnknownFarm) && firstText(confirmedUnknownFarm).includes("已紀錄") && afterCandidateConfirm.candidates.some((row) => row.id === unknownFarmCandidateId && row.status === "confirmed") && afterCandidateConfirm.events.some((row) => row.sourceEventId.includes(`${prefix}-candidate-confirm:ambient`)), JSON.stringify({ reply: confirmedUnknownFarm?.reply, candidate: afterCandidateConfirm.candidates.find((row) => row.id === unknownFarmCandidateId) }));

    const noSecondExtraction = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T12:45:00.000Z", cutoffAt: "2026-08-20T12:45:00.000Z", candidate: candidate("不應再次提取") });
    check("MANUAL-SECOND-RUN-NO-DATA-NO-AI", noSecondExtraction.result.aiCalls === 0 && noSecondExtraction.result.candidatesCreated === 0 && noSecondExtraction.result.outcomes.some((entry) => entry.status === "no_pending"));
    const pendingManualCandidateId = manualCandidate.pushes[0]?.candidateId;
    const nextCron = await runDigest({ groupId, now: "2026-08-20T13:00:00.000Z", candidate: candidate("不應重複候選") });
    check("CANDIDATE-PENDING-NO-REEXTRACTION", nextCron.result.aiCalls === 0 && nextCron.result.candidatesCreated === 0 && current.candidates.some((row) => row.id === pendingManualCandidateId && row.status === "pending"));

    await dispatch(messageEvent("cutoff-before", "金雞測試場好像有咳嗽", cutoffUser, "2026-08-20T14:01:00.000Z"));
    await dispatch(messageEvent("cutoff-after", "金雞測試場好像有白冠", cutoffUser, "2026-08-20T14:03:00.000Z"));
    const cutoffRun = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T14:02:00.000Z", cutoffAt: "2026-08-20T14:02:00.000Z", candidate: candidate("截止前") });
    current = await state();
    const beforeRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-cutoff-before-message`);
    const afterRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-cutoff-after-message`);
    check("MANUAL-CUTOFF", cutoffRun.result.candidatesCreated === 1 && beforeRow?.digestStatus === "processed" && afterRow?.digestStatus === "buffered");

    await dispatch(messageEvent("cron-new-source", "金雞測試場好像有白冠", cutoffUser, "2026-08-20T15:05:00.000Z"));
    const cronNew = await runDigest({ groupId, now: "2026-08-20T16:00:00.000Z", candidate: { candidates: [] } });
    current = await state();
    const cutoffAfterRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-cutoff-after-message`);
    const cronNewRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-cron-new-source-message`);
    check("MANUAL-THEN-CRON-CONSUMES-OLD-BUFFERED", cronNew.result.candidatesCreated === 0 && cronNew.result.aiCalls === 1 && cutoffAfterRow?.digestStatus === "processed" && cronNewRow?.digestStatus === "processed");

    await dispatch(messageEvent("cron-first-source", "金雞測試場好像有咳嗽", `${prefix}-cron-first-user`, "2026-08-20T16:05:00.000Z"));
    const cronFirst = await runDigest({ groupId, now: "2026-08-20T17:00:00.000Z", candidate: candidate("Cron先處理") });
    const manualAfterCron = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T17:20:00.000Z", cutoffAt: "2026-08-20T17:20:00.000Z", candidate: candidate("不應重新提取") });
    current = await state();
    const cronFirstRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-cron-first-source-message`);
    check("CRON-THEN-MANUAL-NO-DUPLICATE", cronFirst.result.candidatesCreated === 1 && manualAfterCron.result.aiCalls === 0 && manualAfterCron.result.candidatesCreated === 0 && manualAfterCron.result.outcomes.some((entry) => entry.status === "no_pending") && cronFirstRow?.digestStatus === "processed");

    await dispatch(messageEvent("race-source", "金雞測試場好像有咳嗽", raceUser, "2026-08-20T17:05:00.000Z"));
    const raceResults = await Promise.all([
      runDigest({ groupId, trigger: "manual", now: "2026-08-20T17:20:00.000Z", cutoffAt: "2026-08-20T17:20:00.000Z", candidate: candidate("競態候選") }),
      runDigest({ groupId, trigger: "manual", now: "2026-08-20T17:20:00.000Z", cutoffAt: "2026-08-20T17:20:00.000Z", candidate: candidate("競態候選") }),
    ]);
    const raceCreated = raceResults.reduce((sum, result) => sum + result.result.candidatesCreated, 0);
    const raceAi = raceResults.reduce((sum, result) => sum + result.result.aiCalls, 0);
    check("MANUAL-CRON-RACE-NO-DUPLICATE", raceCreated === 1 && raceAi <= 1 && raceResults.some((result) => result.result.busyGroups === 1 || result.result.outcomes.some((entry) => entry.status === "no_pending")));

    await dispatch(messageEvent("lease-source", "金雞測試場好像有咳嗽", leaseUser, "2026-08-20T18:05:00.000Z"));
    executeSql(`INSERT INTO ambient_digest_leases (organization_id, line_group_id, owner_id, lease_until) SELECT id, '${sqlEscape(groupId)}', 'stuck-owner', '2026-08-20T18:30:00.000Z' FROM organizations WHERE active = 1 ON CONFLICT(organization_id, line_group_id) DO UPDATE SET owner_id = 'stuck-owner', lease_until = '2026-08-20T18:30:00.000Z';`);
    const busy = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T18:20:00.000Z", cutoffAt: "2026-08-20T18:20:00.000Z", candidate: candidate("不應在 lease 中執行") });
    const recovered = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T18:31:00.000Z", cutoffAt: "2026-08-20T18:31:00.000Z", candidate: candidate("lease recovery") });
    check("DIGEST-LEASE-BUSY-AND-RECOVERY", busy.result.busyGroups === 1 && recovered.result.candidatesCreated === 1 && recovered.result.failedGroups === 0, JSON.stringify({ busy: busy.result, recovered: recovered.result }));

    await dispatch(messageEvent("retry-source", "金雞測試場好像有咳嗽", `${prefix}-retry-user`, "2026-08-20T19:05:00.000Z"));
    const failed = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T19:20:00.000Z", cutoffAt: "2026-08-20T19:20:00.000Z" });
    current = await state();
    const retryRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-retry-source-message`);
    check("FAILED-DIGEST-RETRYABLE", failed.result.failedGroups === 1 && failed.result.outcomes.some((entry) => entry.status === "failed" && entry.failureStage === "ai") && retryRow?.digestStatus === "buffered");
    const retrySuccess = await runDigest({ groupId, now: "2026-08-20T20:00:00.000Z", candidate: candidate("retry success") });
    current = await state();
    const retrySuccessRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-retry-source-message`);
    check("OLD-BUFFERED-ROW-RETRIES-NEXT-CRON", retrySuccess.result.candidatesCreated === 1 && retrySuccess.result.aiCalls === 1 && retrySuccessRow?.digestStatus === "processed");

    await dispatch(messageEvent("delivery-failure-source", "金雞測試場好像有咳嗽", `${prefix}-delivery-user`, "2026-08-20T20:05:00.000Z"));
    const deliveryFailure = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T20:20:00.000Z", cutoffAt: "2026-08-20T20:20:00.000Z", candidate: candidate("delivery failure"), pushFail: true });
    current = await state();
    const deliveryFailureRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-delivery-failure-source-message`);
    const deliveryRetry = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T20:21:00.000Z", cutoffAt: "2026-08-20T20:21:00.000Z", candidate: candidate("must not re-extract") });
    check("DELIVERY-FAILURE-DOES-NOT-REEXTRACT", deliveryFailure.result.candidatesCreated === 1 && deliveryFailure.result.deliveryFailures === 1 && deliveryFailureRow?.digestStatus === "processed" && deliveryRetry.result.aiCalls === 0 && deliveryRetry.result.candidatesCreated === 0);

    const noCandidateSource = await dispatch(messageEvent("no-candidate-source", "晚點吃什麼", `${prefix}-no-candidate-user`, "2026-08-20T20:05:00.000Z"));
    const noCandidate = await runDigest({ groupId, trigger: "manual", now: "2026-08-20T20:20:00.000Z", cutoffAt: "2026-08-20T20:20:00.000Z" });
    current = await state();
    const noCandidateRow = current.ambient.find((row) => row.lineMessageId === `${prefix}-no-candidate-source-message`);
    check("NO-CANDIDATE-CONSUMES-SOURCE", noCandidate.result.aiCalls === 0 && noCandidate.result.outcomes.some((entry) => entry.status === "no_candidate") && noCandidateRow?.digestStatus === "processed");

    await dispatch(messageEvent("retention-open-source", "死亡7", retentionUser, candidateScenarioTime(300_000), { eventGroupId: candidateGroupId }));
    const retentionCandidate = await runDigest({
      groupId: candidateGroupId,
      trigger: "manual",
      now: candidateScenarioTime(360_000),
      cutoffAt: candidateScenarioTime(360_000),
      candidate: {
        candidates: [{
          farmText: null,
          caretakerText: "林志騰",
          eventType: "mortality",
          quantity: 7,
          quantityConfidence: "high",
          conflict: false,
          items: [{ type: "mortality", quantity: 7, raw: "死亡7", confidence: "high" }],
        }],
      },
    });
    const retentionCandidateId = retentionCandidate.pushes[0]?.candidateId;
    const retentionTime = candidateScenarioTime(4 * 24 * 60 * 60 * 1000);
    const retentionRun = await runDigest({ groupId: candidateGroupId, trigger: "manual", now: retentionTime, cutoffAt: retentionTime });
    const retentionState = await state();
    const retainedOpenCandidate = retentionState.candidates.find((row) => row.id === retentionCandidateId);
    const retentionInbox = await dispatch(messageEvent("candidate-after-source-expiry", "摘要", candidateUser, candidateScenarioTime(4 * 24 * 60 * 60 * 1000 + 60_000), { mention: true, eventGroupId: candidateGroupId }));
    check("OPEN-CANDIDATE-SURVIVES-SOURCE-CLEANUP", retentionCandidate.result.candidatesCreated === 1 && retentionRun.result.aiCalls === 0 && retainedOpenCandidate?.status === "pending" && /目前有 .*待確認營運資訊/u.test(retentionInbox.reply.messages.map((message) => message.text ?? "").join("\n")), JSON.stringify({ created: retentionCandidate.result.candidatesCreated, pushed: retentionCandidate.pushes.map((item) => item.candidateId), retention: retentionRun.result.aiCalls, id: retentionCandidateId, retained: retainedOpenCandidate?.status ?? null, inbox: retentionInbox.reply.messages.map((message) => message.text ?? "") }));

    console.log(`LOCAL_MANUAL_AMBIENT_RUNTIME_CHECKS=${checks.filter((item) => item.pass).length}/${checks.length}`);
    console.log(`LOCAL_MANUAL_AMBIENT_RUNTIME_RESULT=${checks.every((item) => item.pass) ? "PASS" : "FAIL"}`);
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
