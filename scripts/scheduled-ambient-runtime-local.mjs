import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9340 + Math.floor(Math.random() * 40);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-scheduled-ambient-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-scheduled-${Date.now().toString(36)}`;
const userId = `${prefix}-user`;
// Keep this isolated runtime invocation newer than any historical local
// fixtures so the bounded state endpoint (which returns the newest 50 rows)
// can deterministically expose it. The source event uses the same synthetic
// clock and therefore is not removed by expiry cleanup.
const scheduledAt = new Date(Date.UTC(2300, 0, 1, 1, 2, 3, 400));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

function messageEvent() {
  return {
      type: "message",
      webhookEventId: `${prefix}-ordinary`,
      timestamp: scheduledAt.getTime() - 1000,
    replyToken: `${prefix}-reply`,
    source: { type: "group", groupId, userId },
    message: {
      id: `${prefix}-message`,
      type: "text",
      text: `收到 ${prefix}`,
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

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`state failed: ${JSON.stringify(result.body)}`);
  return result.body;
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
  executeSql([
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${sqlEscape(groupId)}';`,
    `DELETE FROM ambient_digest_runs WHERE line_group_id = '${sqlEscape(groupId)}';`,
  ].join("\n"));
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
    const dispatch = await request("/__codex/runtime/dispatch", {
      method: "POST",
      body: JSON.stringify(messageEvent()),
    });
    check("SCHEDULED-SOURCE-BUFFERED", dispatch.response.status === 200 && dispatch.body.reply?.messages?.length === 0);
    let current = await state();
    const buffered = current.ambient.find((row) => row.lineMessageId === `${prefix}-message`);
    check("SCHEDULED-SOURCE-INSERTED", buffered?.digestStatus === "buffered");

    const scheduledAtIso = scheduledAt.toISOString();
    const scheduled = await request("/__codex/runtime/scheduled", {
      method: "POST",
      body: JSON.stringify({ cron: "0 1,4,7,10,22 * * *", now: scheduledAtIso }),
    });
    check("SCHEDULED-HANDLER-HTTP", scheduled.response.status === 200 && scheduled.body.ok && scheduled.body.job === "ambient_digest", JSON.stringify(scheduled.body));

    current = await state();
    const processed = current.ambient.find((row) => row.lineMessageId === `${prefix}-message`);
    check("SCHEDULED-HANDLER-CONSUMES-NO-CANDIDATE", processed?.digestStatus === "processed");
    check("SCHEDULED-HANDLER-NO-OFFICIAL-WRITE", !current.events.some((row) => row.sourceEventId.includes(prefix)) && !current.abnormal.some((row) => row.sourceEventId.includes(prefix)));
    const run = current.ambientDigestRuns.find((row) => row.lineGroupId === groupId && row.scheduledFor === scheduledAtIso);
    check("OBS-A01-RUN-COMPLETED", run?.runStatus === "completed" && run?.leaseStatus === "released");
    check("OBS-A03-PREFILTER-ZERO-COMPLETES", run?.sourceStatus === "success" && run?.sourceCount === 1 && run?.prefilterStatus === "zero" && run?.bufferConsumeStatus === "success");
    const invocation = current.ambientDigestInvocations.find((row) => row.scheduledFor === scheduledAtIso && row.triggerType === "cron");
    check("INV-A01-INVOCATION-COMPLETED", invocation?.invocationStatus === "completed" && invocation?.triggerType === "cron");
    check("INV-A02-GROUP-RELATION", invocation?.groupsBeforeCleanup === 1 && invocation?.groupsAfterCleanup === 1 && invocation?.perGroupRunsCreated === 1);
    console.log("LOCAL_SCHEDULED_AMBIENT_RUNTIME_CHECKS=9/9");
    console.log(`LOCAL_SCHEDULED_AMBIENT_RUNTIME_RESULT=${process.exitCode ? "FAIL" : "PASS"}`);
  } finally {
    await cleanup();
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
