import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9130 + Math.floor(Math.random() * 40);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-fast-path-${randomBytes(18).toString("hex")}`;
const prefix = `codex-runtime-fast-path-${Date.now().toString(36)}`;
const groupId = "local-quick-record-group";
const userId = `${prefix}-user`;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
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

function event(label, text, data = null) {
  const eventId = `${prefix}-${label}`;
  if (data) {
    return {
      type: "postback",
      webhookEventId: eventId,
      timestamp: Date.now(),
      replyToken: `${eventId}-reply`,
      source: { type: "group", groupId, userId },
      postback: { data },
    };
  }
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now(),
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId },
    message: { id: `${eventId}-message`, type: "text", text },
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

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();

    const first = await request("/__codex/runtime/fast-path", { method: "POST", body: JSON.stringify(event("menu", "選單")) });
    const firstReceipt = first.body.receipt;
    check("FAST-PATH-MENU", first.response.status === 200 && first.body.ok && first.body.decision.action === "menu_home", JSON.stringify(first.body.decision));
    check("FAST-PATH-DURABLE-RECEIPT", Boolean(firstReceipt?.eventId) && Boolean(firstReceipt?.correlationId), JSON.stringify(firstReceipt));
    check("FAST-PATH-NO-QUEUE", firstReceipt?.queuedAt === null && firstReceipt?.queueAttempts === 0, JSON.stringify({ queuedAt: firstReceipt?.queuedAt, queueAttempts: firstReceipt?.queueAttempts }));
    check("FAST-PATH-BUSINESS-COMPLETE", firstReceipt?.businessStatus === "completed" && Boolean(firstReceipt?.businessCompletedAt), JSON.stringify(firstReceipt));
    check("FAST-PATH-REPLY-COMPLETE", firstReceipt?.replyOutcome === "sent" && Boolean(firstReceipt?.replyCompletedAt), JSON.stringify(firstReceipt));
    check("FAST-PATH-REPLY-PAYLOAD", first.body.reply?.messages?.[0]?.type === "flex", JSON.stringify(first.body.reply?.messages?.[0]));

    const duplicate = await request("/__codex/runtime/fast-path", { method: "POST", body: JSON.stringify(event("menu", "選單")) });
    check("FAST-PATH-DUPLICATE-NO-SECOND-REPLY", duplicate.response.status === 200 && duplicate.body.reply?.messages?.length === 0, JSON.stringify(duplicate.body.reply));
    check("FAST-PATH-DUPLICATE-STAYS-COMPLETE", duplicate.body.receipt?.replyOutcome === "sent" && duplicate.body.receipt?.replyAttempts === firstReceipt.replyAttempts, JSON.stringify(duplicate.body.receipt));

    const more = await request("/__codex/runtime/fast-path", { method: "POST", body: JSON.stringify(event("more", "更多功能")) });
    check("FAST-PATH-MORE", more.response.status === 200 && more.body.decision.action === "menu_more" && more.body.receipt?.queuedAt === null, JSON.stringify(more.body.decision));

    const back = await request("/__codex/runtime/fast-path", { method: "POST", body: JSON.stringify(event("home", "", "action=menu_home")) });
    check("FAST-PATH-POSTBACK-HOME", back.response.status === 200 && back.body.decision.action === "menu_home" && back.body.receipt?.queuedAt === null, JSON.stringify(back.body.decision));

    const queued = await request("/__codex/runtime/fast-path", { method: "POST", body: JSON.stringify(event("stateful", "今日狀況")) });
    check("STATEFUL-ACTION-DENIED", queued.response.status === 409 && queued.body.decision?.eligible === false, JSON.stringify(queued.body.decision));

    const receipts = [first.body.receipt, more.body.receipt, back.body.receipt];
    check("FAST-PATH-EVENTS-PERSISTED", receipts.every((receipt) => receipt?.lifecycleStatus === "reply_completed" && receipt?.queuedAt === null && receipt?.correlationId), JSON.stringify(receipts.map((receipt) => ({ eventId: receipt?.eventId, status: receipt?.lifecycleStatus, queuedAt: receipt?.queuedAt, correlationId: receipt?.correlationId }))));
  } finally {
    worker.kill("SIGTERM");
  }
  const failed = checks.filter((item) => !item.pass);
  console.log(`FAST_PATH_LOCAL_SUMMARY ${JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed: failed.length })}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
