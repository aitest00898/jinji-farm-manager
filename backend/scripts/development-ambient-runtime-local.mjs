import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9360 + Math.floor(Math.random() * 30);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-dev-ambient-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-dev-${Date.now().toString(36)}`;
const actorId = `${prefix}-developer`;
const botMention = "@金雞協會助理Ai";
// Keep each local run's logical clock ahead of any lease left by an aborted
// prior harness process. This is test isolation only; Production uses real
// event timestamps and never receives this value.
const scenarioStart = Date.UTC(2300, 0, 1, 0, 0, 0, 0) + Date.now();
const developmentAiStubJson = JSON.stringify({
  decisions: [
    { ref: "m2", kind: "event", type: "mortality", quantity: 2, quantityConfidence: "high", raw: "死2隻", confidence: "high", farmText: "金雞測試場" },
    { ref: "m3", kind: "event", type: "abnormal", quantity: null, quantityConfidence: "unknown", raw: "一直咳", confidence: "low", farmText: "金雞測試場" },
    { ref: "m4", kind: "event", type: "cull", quantity: 2, quantityConfidence: "high", raw: "淘汰2隻", confidence: "high", farmText: "金雞測試場" },
    { ref: "m5", kind: "event", type: "mortality", quantity: 3, quantityConfidence: "high", raw: "死3隻", confidence: "high", farmText: "金雞測試場" },
    { ref: "m6", kind: "support", targetRef: "m5" },
    { ref: "m7", kind: "event", type: "mortality", quantity: 1, quantityConfidence: "high", raw: "死1隻", confidence: "high", farmText: "金雞測試場" },
  ],
});
const observabilityOnly = process.env.DEV_AMBIENT_LOCAL_OBSERVABILITY_ONLY === "1";
const skipDevCommit = observabilityOnly || process.env.DEV_AMBIENT_LOCAL_SKIP_COMMIT === "1";
let sequence = 0;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass) });
  const safeDetail = detail.length > 800 ? `${detail.slice(0, 800)}…` : detail;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${safeDetail ? ` — ${safeDetail}` : ""}`);
}

function event(label, text, { mention = false, group = groupId, user = actorId, offset = sequence + 1 } = {}) {
  sequence += 1;
  const eventId = `${prefix}-${label}`;
  const timestamp = scenarioStart + offset * 1000;
  const visibleText = mention ? `${botMention} ${text}` : text;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp,
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

async function dispatch(label, text, options = {}) {
  const result = await request("/__codex/runtime/dispatch", { method: "POST", body: JSON.stringify(event(label, text, options)) });
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`dispatch failed: ${label}`);
  return result.body;
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`state failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

function replyText(result) {
  return result.reply?.messages?.map((message) => message.text ?? "").join("\n") ?? "";
}

function latestRun(rows) {
  return [...rows].sort((left, right) => String(left.scheduledFor).localeCompare(String(right.scheduledFor))).at(-1);
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
  const safePrefix = sqlEscape(prefix);
  executeSql([
    `DELETE FROM ambient_dev_cohort_sources WHERE session_id IN (SELECT session_id FROM ambient_dev_sessions WHERE authorized_actor_id LIKE '${safePrefix}%');`,
    `DELETE FROM ambient_digest_runs WHERE dev_session_id IN (SELECT session_id FROM ambient_dev_sessions WHERE authorized_actor_id LIKE '${safePrefix}%');`,
    `DELETE FROM ambient_digest_invocations WHERE dev_session_id IN (SELECT session_id FROM ambient_dev_sessions WHERE authorized_actor_id LIKE '${safePrefix}%');`,
    `DELETE FROM ambient_dev_sessions WHERE authorized_actor_id LIKE '${safePrefix}%';`,
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${safePrefix}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${safePrefix}%';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${sqlEscape(groupId)}' AND owner_id LIKE '%${safePrefix}%';`,
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
    "--var", "DEV_COMMANDS_ENABLED:true",
    "--var", `DEV_AMBIENT_GROUP_ALLOWLIST:${groupId}`,
    "--var", `DEV_AMBIENT_ACTOR_ALLOWLIST:${actorId}`,
    "--var", `RUNTIME_DEV_AMBIENT_AI_STUB_JSON:${developmentAiStubJson}`,
  ], { stdio: "ignore" });

  try {
    await waitForHealth();
    const before = await state();
    const beforeEvents = before.events.length;
    const beforeAbnormal = before.abnormal.length;

    const bare = await dispatch("bare-dev-command", "開發摘要 試跑", { mention: false, user: `${prefix}-bare` });
    let current = await state();
    check("DEV-ROUTE-BARE-QUIET", bare.reply.messages.length === 0 && !current.ambient.some((row) => row.lineMessageId.includes("bare-dev-command")));

    const unauthorized = await dispatch("unauthorized-dev-command", "開發指令", { mention: true, user: `${prefix}-unauthorized` });
    current = await state();
    check("DEV-AUTH-UNAUTHORIZED-SILENT", unauthorized.reply.messages.length === 0 && !current.ambient.some((row) => row.lineMessageId.includes("unauthorized-dev-command")));

    const help = await dispatch("dev-help", "開發指令", { mention: true });
    check("DEV-AUTHORIZED-HELP", replyText(help).includes("開發摘要 試跑") && replyText(help).includes("確認開發摘要全流程"));

    const start = await dispatch("dev-start", "開發摘要 開始", { mention: true, offset: 10 });
    check("DEV-COHORT-START", /開發摘要測試已開始/u.test(replyText(start)) && start.reply.messages.length === 1);

    const smokeMessages = [
      ["D01", "今天雞排一份85元"],
      ["D02", "金雞測試場剛剛死2隻"],
      ["D03", "金雞測試場有幾隻一直咳，數量還不確定"],
      ["D04", "金雞測試場今天淘汰2隻，腳傷"],
      ["D05", "金雞測試場今天早上死3隻"],
      ["D06", "那個死亡3隻先記著，不是新增一筆"],
      ["D07", "我晚點去吃飯，金雞測試場剛剛又死1隻"],
      ["D08", "4個人"],
    ];
    for (const [index, [label, text]] of smokeMessages.entries()) {
      await dispatch(label, text, { mention: false, offset: 20 + index });
    }
    current = await state();
    check("DEV-COHORT-CAPTURE", current.ambient.filter((row) => row.digestStatus === "buffered").length === 8);

    const lock = await dispatch("dev-lock", "開發摘要 鎖定", { mention: true, offset: 40 });
    check("DEV-COHORT-LOCK", /已鎖定 8 則/u.test(replyText(lock)), replyText(lock));

    // A locked Dev cohort is intentionally invisible to the normal Cron and
    // ordinary Manual source selectors. This call uses no AI stub because the
    // selector should discover no normal source group at all.
    const isolationNow = new Date(scenarioStart + 45 * 1000).toISOString();
    const scheduled = await request("/__codex/runtime/scheduled", {
      method: "POST",
      body: JSON.stringify({ cron: "0 1,4,7,10,22 * * *", now: isolationNow }),
    });
    current = await state();
    check("DEV-ISO-SCHEDULED-EXCLUDES-LOCKED-COHORT", scheduled.response.status === 200 && scheduled.body.ok && current.ambient.filter((row) => row.lineMessageId.includes(prefix) && row.digestStatus === "buffered").length === 8, JSON.stringify(scheduled.body));

    const ordinaryManual = await request("/__codex/runtime/ambient", {
      method: "POST",
      body: JSON.stringify({ groupId, trigger: "manual", now: isolationNow, cutoffAt: isolationNow }),
    });
    current = await state();
    check("DEV-ISO-MANUAL-EXCLUDES-LOCKED-COHORT", ordinaryManual.response.status === 200 && ordinaryManual.body.ok && current.ambient.filter((row) => row.lineMessageId.includes(prefix) && row.digestStatus === "buffered").length === 8, JSON.stringify(ordinaryManual.body));

    const status = await dispatch("dev-status", "開發摘要 狀態", { mention: true, offset: 41 });
    check("DEV-STATUS-READ-ONLY", /已鎖定來源：8/u.test(replyText(status)) && /尚無試跑/u.test(replyText(status)));

    const candidatesBeforeDryRun = current.candidates.length;
    const dryRun = await dispatch("dev-dry-run", "開發摘要 試跑", { mention: true, offset: 42 });
    current = await state();
    const dryRunRows = current.ambientDigestRuns.filter((row) => row.devSessionId && row.executionMode === "dev_dry_run");
    const dryRunRow = latestRun(dryRunRows);
    const dryRunSnapshot = dryRunRow?.devSemanticSummaryJson ? JSON.parse(dryRunRow.devSemanticSummaryJson) : null;
    const devSession = current.ambientDevSessions.find((row) => row.status === "locked");
    check("DEV-DRY-RUN-REACHES-RESULT", /Normalization：/u.test(replyText(dryRun)) && /Reconcile：/u.test(replyText(dryRun)) && dryRunRow?.runStatus === "completed", JSON.stringify(dryRunRow));
    check("DEV-DRY-RUN-NO-CANDIDATE-OR-CONSUME", current.candidates.length === candidatesBeforeDryRun && current.ambient.filter((row) => row.digestStatus === "buffered").length === 8);
    check("DEV-DRY-RUN-STATUS-BOUNDARY", dryRunRow?.candidateWriteStatus === "none_required" && dryRunRow?.bufferConsumeStatus === "not_reached" && dryRunRow?.processedCount === 0);
    check("DEV-SEMANTIC-SNAPSHOT-BOUNDED", dryRunSnapshot?.version === 1 && dryRunSnapshot.itemCount > 0 && dryRunSnapshot.committedCandidateCount === 0 && !dryRunRow?.devSemanticSummaryJson?.includes("raw") && !dryRunRow?.devSemanticSummaryJson?.includes("今天雞排"), dryRunRow?.devSemanticSummaryJson ?? "missing");
    check("DEV-ID-CANONICAL-RUN", Boolean(dryRunRow?.runId) && devSession?.latestRunId === dryRunRow?.runId, JSON.stringify({ runId: dryRunRow?.runId, latestRunId: devSession?.latestRunId }));

    if (!observabilityOnly) {
      const rerun = await dispatch("dev-rerun", "開發摘要 重跑", { mention: true, offset: 43 });
      current = await state();
      const dryRuns = current.ambientDigestRuns.filter((row) => row.executionMode === "dev_dry_run" && row.devSessionId);
      const latestRerunRow = latestRun(dryRuns);
      const sessionAfterRerun = current.ambientDevSessions.find((row) => row.status === "locked");
      check("DEV-RERUN-SAME-COHORT", dryRuns.length >= 2 && current.ambient.filter((row) => row.digestStatus === "buffered").length === 8 && /開發摘要重跑完成/u.test(replyText(rerun)) && /查看完整診斷：@Bot 開發摘要 結果/u.test(replyText(rerun)) && !replyText(rerun).includes("【辨識內容】"));
      check("DEV-ID-RERUN-NEW-CANONICAL-RUN", dryRunRow?.runId !== latestRerunRow?.runId && sessionAfterRerun?.latestRunId === latestRerunRow?.runId, JSON.stringify({ first: dryRunRow?.runId, second: latestRerunRow?.runId, latestRunId: sessionAfterRerun?.latestRunId }));
    } else {
      check("DEV-RERUN-SKIPPED-SAFE-MODE", true);
    }

    const result = await dispatch("dev-result", "開發摘要 結果", { mention: true, offset: 44 });
    check("DEV-RESULT-NO-AI-REPLAY", /輸出量：/u.test(replyText(result)) && /AI候選：/u.test(replyText(result)) && /辨識項目：/u.test(replyText(result)) && !replyText(result).includes("raw") && !replyText(result).split("\n").some((line) => line.startsWith("候選：")), replyText(result));

    if (!skipDevCommit) {
      const arm = await dispatch("dev-arm-commit", "開發摘要 全流程", { mention: true, offset: 45 });
      check("DEV-COMMIT-SECOND-CONFIRMATION", /確認開發摘要全流程/u.test(replyText(arm)) && /不會建立正式營運紀錄/u.test(replyText(arm)));
      const commit = await dispatch("dev-confirm-commit", "確認開發摘要全流程", { mention: true, offset: 46 });
      current = await state();
      const commitRows = current.ambientDigestRuns.filter((row) => row.executionMode === "dev_commit" && row.devSessionId);
      const commitRow = latestRun(commitRows);
      check("DEV-COMMIT-SHARED-PIPELINE", commitRow?.runStatus === "completed" && commitRow?.candidateWriteStatus === "success" && commitRow?.bufferConsumeStatus === "success", JSON.stringify(commitRow));
      check("DEV-COMMIT-CANDIDATE-AND-CONSUME", current.candidates.length === candidatesBeforeDryRun + 1 && current.ambient.filter((row) => row.digestStatus === "processed").length === 8 && /開發摘要結果/u.test(replyText(commit)));
      check("DEV-COMMIT-NO-OFFICIAL-WRITE", current.events.length === beforeEvents && current.abnormal.length === beforeAbnormal);

      const duplicateConfirm = await dispatch("dev-duplicate-confirm", "確認開發摘要全流程", { mention: true, offset: 47 });
      current = await state();
      const duplicateCommits = current.ambientDigestRuns.filter((row) => row.executionMode === "dev_commit" && row.devSessionId);
      check("DEV-COMMIT-DOUBLE-CONFIRM-BLOCKED", duplicateCommits.length === 1 && /沒有可確認|逾時|重新完成/u.test(replyText(duplicateConfirm)), replyText(duplicateConfirm));
    } else {
      check("DEV-COMMIT-SKIPPED-SAFE-MODE", true);
    }
    const end = await dispatch("dev-end", "開發摘要 結束", { mention: true, offset: 48 });
    check("DEV-COHORT-END", /測試已結束/u.test(replyText(end)));
  } finally {
    worker.kill("SIGTERM");
    try { await cleanup(); } catch (error) { console.error(`LOCAL_DEV_CLEANUP_FAILED=${error instanceof Error ? error.message : String(error)}`); }
  }

  const passed = checks.filter((item) => item.pass).length;
  console.log(`LOCAL_DEV_AMBIENT_RUNTIME_CHECKS=${passed}/${checks.length}`);
  console.log(`LOCAL_DEV_AMBIENT_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`LOCAL_DEV_AMBIENT_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
