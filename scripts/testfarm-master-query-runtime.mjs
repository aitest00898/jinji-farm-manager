const baseUrl = process.env.TESTFARM_RUNTIME_URL ?? "https://chicken-line-production.jinji-assistant.workers.dev";
const runtimeToken = process.env.TESTFARM_RUNTIME_TOKEN;
const userId = `codex-testfarm-query-${Date.now().toString(36)}`;
const runId = `codex-testfarm-query-${Date.now().toString(36)}`;
let sequence = 0;
const checks = [];

if (!runtimeToken) throw new Error("TESTFARM_RUNTIME_TOKEN is required");

function event(label, text) {
  const eventId = `${runId}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    source: { type: "group", userId },
    message: { id: `${eventId}-message`, type: "text", text },
  };
}

function check(name, pass) {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

async function dispatch(label, text) {
  const response = await fetch(`${baseUrl}/__codex/runtime/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-codex-runtime-token": runtimeToken,
    },
    body: JSON.stringify(event(label, text)),
  });
  const body = await response.json();
  if (response.status !== 200 || !body.ok) throw new Error(`dispatch failed: ${label} HTTP ${response.status}`);
  return { body, text: body.reply?.messages?.[0]?.text ?? "" };
}

async function run() {
  const stock = await dispatch("stock", "金雞測試場 測試1舍 目前存欄");
  check(
    "TEST_FARM_STOCK_QUERY_RUNTIME",
    stock.body.trace?.ai_invoked === false && stock.text.includes("測試1舍：1,000隻"),
  );

  const age = await dispatch("age", "金雞測試場 測試1舍 日齡");
  check(
    "TEST_FARM_AGE_QUERY_RUNTIME",
    age.body.trace?.ai_invoked === false && age.text.includes("TEST-BATCH-001") && age.text.includes("日齡 0日"),
  );

  const passed = checks.filter((item) => item.pass).length;
  console.log(`TESTFARM_QUERY_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  console.log(`TESTFARM_QUERY_RUNTIME_CHECKS=${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`TESTFARM_QUERY_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
