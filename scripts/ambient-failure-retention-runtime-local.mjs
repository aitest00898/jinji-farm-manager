import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9560 + Math.floor(Math.random() * 20);
const baseUrl = "http://127.0.0.1:" + port;
const token = "local-ambient-retention-" + randomBytes(18).toString("hex");
const groupId = "local-quick-record-group";
const prefix = "codex-runtime-retention-" + Date.now().toString(36);
const checks = [];
const fail = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(command + " failed");
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
  console.log((pass ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
  if (!pass) fail.push(name);
}

function sqlEscape(value) {
  return value.replaceAll("'", "''");
}

function executeSql(sql) {
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]);
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-codex-runtime-token", token);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { raw }; }
  return { response, body };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(baseUrl + "/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

async function state() {
  const result = await request("/__codex/runtime/state?prefix=" + encodeURIComponent(prefix));
  if (!result.response.ok || !result.body.ok) throw new Error("state failed");
  return result.body;
}

function messageEvent(label, text, timestamp) {
  return {
    type: "message",
    webhookEventId: prefix + "-" + label,
    timestamp: Date.parse(timestamp),
    replyToken: prefix + "-" + label + "-reply",
    source: { type: "group", groupId, userId: prefix + "-user" },
    message: { id: prefix + "-" + label + "-message", type: "text", text },
  };
}

async function dispatch(label, text, timestamp) {
  const result = await request("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(messageEvent(label, text, timestamp)),
  });
  if (!result.response.ok || !result.body.ok) throw new Error("dispatch failed");
}

async function failedAmbient(now) {
  const result = await request("/__codex/runtime/ambient", {
    method: "POST",
    body: JSON.stringify({
      groupId,
      now,
      cutoffAt: now,
      trigger: "manual",
      failure: "validation",
    }),
  });
  if (!result.response.ok || !result.body.ok) throw new Error("ambient failed");
  return result.body;
}

function cleanup(times, eventTimestamp) {
  executeSql([
    "DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '" + sqlEscape(prefix) + "%';",
    "DELETE FROM line_events WHERE event_id LIKE '" + sqlEscape(prefix) + "%';",
    "DELETE FROM ambient_expiry_diagnostics WHERE original_event_timestamp = '" + sqlEscape(eventTimestamp) + "';",
    "DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%" + sqlEscape(prefix) + "%';",
    "DELETE FROM ambient_digest_leases WHERE line_group_id = '" + sqlEscape(groupId) + "';",
    "DELETE FROM ambient_digest_runs WHERE line_group_id = '" + sqlEscape(groupId) + "' AND scheduled_for IN (" + times.map((time) => "'" + sqlEscape(time) + "'").join(",") + ");",
    "DELETE FROM ambient_digest_invocations WHERE trigger_type = 'manual' AND scheduled_for IN (" + times.map((time) => "'" + sqlEscape(time) + "'").join(",") + ");",
  ].join("\n"));
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  const base = new Date();
  const firstAt = new Date(base.getTime());
  const eventAt = new Date(firstAt.getTime() - (23 * 60 + 50) * 60 * 1000);
  const secondAt = new Date(firstAt.getTime() + 20 * 60 * 1000);
  const capAt = new Date(Date.parse(eventAt.toISOString()) + 72 * 60 * 60 * 1000 + 1000);
  const times = [firstAt.toISOString(), secondAt.toISOString(), capAt.toISOString()];
  cleanup(times, eventAt.toISOString());
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", "RUNTIME_TEST_TOKEN:" + token,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();
    await dispatch("candidate", "金雞測試場死亡2隻 " + prefix, eventAt.toISOString());
    await dispatch("ordinary", "我買 5 杯飲料 " + prefix, eventAt.toISOString());
    const firstResult = await failedAmbient(firstAt.toISOString());
    let current = await state();
    let candidate = current.ambient.find((row) => row.lineMessageId === prefix + "-candidate-message");
    let ordinary = current.ambient.find((row) => row.lineMessageId === prefix + "-ordinary-message");
    let invocation = current.ambientDigestInvocations.find((row) => row.scheduledFor === firstAt.toISOString() && row.triggerType === "manual");
    check("INV-01-INVOCATION-CREATED", Boolean(invocation));
    check("INV-04-GROUP-RUN-FAILED", invocation?.invocationStatus === "completed" && invocation?.perGroupRunsCreated === 1, JSON.stringify(firstResult.result));
    check("RET-02-CANDIDATE-LIKE-GUARDED", candidate?.digestStatus === "buffered" && candidate?.processingFailureCount === 1 && Boolean(candidate?.failureRetainedUntil), JSON.stringify(candidate));
    check("RET-01-ORDINARY-NOT-GUARDED", ordinary?.digestStatus === "buffered" && Number(ordinary?.processingFailureCount ?? 0) === 0 && ordinary?.failureRetainedUntil == null);
    check("RET-10-ONLY-CANDIDATE-EXTENDED", invocation?.failureRetentionRowsExtended === 1 && invocation?.failureRetentionCandidatesConsidered === 1, JSON.stringify(invocation));

    await failedAmbient(firstAt.toISOString());
    current = await state();
    candidate = current.ambient.find((row) => row.lineMessageId === prefix + "-candidate-message");
    invocation = current.ambientDigestInvocations.find((row) => row.scheduledFor === firstAt.toISOString() && row.triggerType === "manual");
    check("RET-09-SAME-INVOCATION-IDEMPOTENT", candidate?.processingFailureCount === 1 && invocation?.attemptCount === 2 && invocation?.invocationId && invocation?.invocationStatus === "completed");

    await failedAmbient(secondAt.toISOString());
    current = await state();
    candidate = current.ambient.find((row) => row.lineMessageId === prefix + "-candidate-message");
    ordinary = current.ambient.find((row) => row.lineMessageId === prefix + "-ordinary-message");
    invocation = current.ambientDigestInvocations.find((row) => row.scheduledFor === secondAt.toISOString() && row.triggerType === "manual");
    check("RET-07-FAILURE-GUARD-SURVIVES-NEXT-RUN", candidate?.digestStatus === "buffered" && !ordinary);
    check("INV-02-EXPIRY-DIAGNOSTICS", invocation?.expiryRowsScanned === 2 && invocation?.expiryRowsDeleted === 1 && invocation?.expiryFailureRetainedSkippedCount === 1);

    await failedAmbient(capAt.toISOString());
    current = await state();
    candidate = current.ambient.find((row) => row.lineMessageId === prefix + "-candidate-message");
    const expiry = current.ambientExpiryDiagnostics.find((row) => row.originalEventTimestamp === eventAt.toISOString() && row.prefilterResult === "candidate_like");
    check("RET-11-72H-RAW-EXPIRES", !candidate);
    check("RET-12-BOUNDED-DIAGNOSTIC-REMAINS", expiry?.prefilterResult === "candidate_like" && expiry?.finalExpiryReason === "failure_retention_expired" && expiry?.processingFailureCount === 2, JSON.stringify(expiry));
    const zeroInvocation = current.ambientDigestInvocations.find((row) => row.scheduledFor === capAt.toISOString() && row.triggerType === "manual");
    check("INV-01-ZERO-GROUP-INVOCATION", zeroInvocation?.invocationStatus === "completed" && zeroInvocation?.groupsAfterCleanup === 0 && zeroInvocation?.perGroupRunsCreated === 0);
    check("RET-13-NO-BUSINESS-WRITE", !current.candidates.some((row) => String(row.candidateJson || "").includes(prefix)) && !current.events.some((row) => String(row.sourceEventId || "").includes(prefix)));
    console.log("LOCAL_AMBIENT_FAILURE_RETENTION_CHECKS=" + checks.filter(Boolean).length + "/" + checks.length);
    console.log("LOCAL_AMBIENT_FAILURE_RETENTION_RESULT=" + (checks.every(Boolean) ? "PASS" : "FAIL"));
    if (fail.length) process.exitCode = 1;
  } finally {
    cleanup(times, eventAt.toISOString());
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
