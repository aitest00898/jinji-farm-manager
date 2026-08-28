import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9580 + Math.floor(Math.random() * 20);
const baseUrl = "http://127.0.0.1:" + port;
const token = "local-daily-warning-" + randomBytes(18).toString("hex");
const groupId = "local-quick-record-group";
const organizationId = "org-mafu-investment";
const farmId = "farm-local-quick-record";
const prefix = "codex-runtime-daily-warning-" + Date.now().toString(36);
const dates = ["2093-01-01", "2093-01-02", "2093-01-03", "2093-01-04", "2093-01-05"];
const reviewIds = dates.map((localDate) => `daily-review-${organizationId}-${groupId}-${localDate}`.replace(/[^A-Za-z0-9_-]/gu, "_"));
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(command + " failed");
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
  console.log((pass ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
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

async function daily(localDate) {
  const result = await request("/__codex/runtime/daily-review", {
    method: "POST",
    body: JSON.stringify({ groupId, now: localDate + "T13:00:00.000Z" }),
  });
  if (!result.response.ok || !result.body.ok) throw new Error("daily review failed");
  return result.body.pushes?.[0]?.text ?? "";
}

async function state() {
  const result = await request("/__codex/runtime/state?prefix=" + encodeURIComponent(prefix));
  if (!result.response.ok || !result.body.ok) throw new Error("state failed: " + JSON.stringify(result.body));
  return result.body;
}

function seedAmbientFailure(localDate, withOfficial = false) {
  const scheduledFor = localDate + "T10:00:00.000Z";
  const eventTimestamp = localDate + "T11:00:00.000Z";
  const failureUntil = localDate + "T23:00:00.000Z";
  const statements = [
    "INSERT OR REPLACE INTO ambient_digest_invocations (invocation_id, trigger_type, scheduled_for, run_started_at, invocation_status, error_stage, error_class, completed_at, expires_at) VALUES ('" + prefix + "-invocation-" + localDate + "', 'cron', '" + scheduledFor + "', '" + scheduledFor + "', 'failed', 'validation', 'schema_invalid', '" + scheduledFor + "', '" + localDate + "T23:00:00.000Z');",
    "INSERT OR REPLACE INTO ambient_chat_buffer (id, organization_id, line_group_id, line_user_id, line_message_id, event_timestamp, text, expires_at, digest_hour, digest_status, processing_failure_count, last_processing_failure_stage, last_processing_failure_at, last_processing_failure_invocation_id, failure_retained_until) VALUES ('" + prefix + "-buffer-" + localDate + "', '" + organizationId + "', '" + groupId + "', '" + prefix + "-user', '" + prefix + "-message-" + localDate + "', '" + eventTimestamp + "', '" + prefix + " 金雞測試場死亡2隻', '" + localDate + "T23:30:00.000Z', '" + localDate + "T19:00:00+08:00', 'buffered', 1, 'validation', '" + scheduledFor + "', '" + prefix + "-invocation-" + localDate + "', '" + failureUntil + "');",
  ];
  if (withOfficial) {
    statements.push("INSERT OR REPLACE INTO operational_events (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date, raw_message, raw_farm_text, source_event_id) VALUES ('" + prefix + "-official-" + localDate + "', '" + organizationId + "', '" + farmId + "', '" + groupId + "', '" + prefix + "-user', 'mortality', 2, '隻', '" + localDate + "', '" + prefix + "正式測試', '金雞測試場', '" + prefix + "-official-" + localDate + "');");
  }
  executeSql(statements.join("\n"));
}

function seedOrdinaryBuffer(localDate) {
  executeSql("INSERT OR REPLACE INTO ambient_chat_buffer (id, organization_id, line_group_id, line_user_id, line_message_id, event_timestamp, text, expires_at, digest_hour, digest_status) VALUES ('" + prefix + "-ordinary-" + localDate + "', '" + organizationId + "', '" + groupId + "', '" + prefix + "-user', '" + prefix + "-ordinary-" + localDate + "', '" + localDate + "T11:00:00.000Z', '" + prefix + " 我買5杯飲料', '" + localDate + "T23:30:00.000Z', '" + localDate + "T19:00:00+08:00', 'buffered');");
}

function cleanup() {
  executeSql([
    "DELETE FROM ambient_digest_invocations WHERE invocation_id LIKE '" + sqlEscape(prefix) + "%';",
    "DELETE FROM ambient_digest_runs WHERE run_id LIKE '" + sqlEscape(prefix) + "%';",
    "DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '" + sqlEscape(prefix) + "%';",
    "DELETE FROM ambient_expiry_diagnostics WHERE id LIKE '%" + sqlEscape(prefix) + "%';",
    "UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'daily_warning_runtime_cleanup') WHERE source_event_id LIKE '" + sqlEscape(prefix) + "%';",
    "DELETE FROM daily_operations_reviews WHERE id IN ('" + reviewIds.join("','") + "');",
  ].join("\n"));
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  cleanup();
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", "RUNTIME_TEST_TOKEN:" + token,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();
    const plain = await daily(dates[0]);
    check("DR-01-NO-FAILURE-KEEPS-NORMAL", !plain.includes("尚未完成整理"));
    seedAmbientFailure(dates[1]);
    const warning = await daily(dates[1]);
    check("DR-02-FAILURE-RETAINED-WARNS", warning.includes("部分群組訊息尚未完成整理"));
    seedAmbientFailure(dates[2], true);
    const warningWithOfficial = await daily(dates[2]);
    check("DR-03-OFFICIAL-TOTALS-PLUS-WARNING", warningWithOfficial.includes("死亡：2隻") && warningWithOfficial.includes("尚未完成整理"));
    seedOrdinaryBuffer(dates[3]);
    const ordinaryOnly = await daily(dates[3]);
    check("DR-04-ORDINARY-BUFFER-NO-WARNING", !ordinaryOnly.includes("尚未完成整理"));
    const before = await state();
    seedAmbientFailure(dates[4]);
    const beforeWarning = await state();
    const safeWarning = await daily(dates[4]);
    const after = await state();
    check("DR-05-WARNING-READ-ONLY", safeWarning.includes("尚未完成整理") && after.events.length === before.events.length && after.abnormal.length === before.abnormal.length && beforeWarning.events.length === before.events.length);
    console.log("LOCAL_DAILY_REVIEW_AMBIENT_WARNING_CHECKS=" + checks.filter(Boolean).length + "/" + checks.length);
    console.log("LOCAL_DAILY_REVIEW_AMBIENT_WARNING_RESULT=" + (checks.every(Boolean) ? "PASS" : "FAIL"));
    if (!checks.every(Boolean)) process.exitCode = 1;
  } finally {
    cleanup();
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
