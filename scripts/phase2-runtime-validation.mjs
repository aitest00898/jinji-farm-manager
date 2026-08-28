const baseUrl = process.env.PHASE2_RUNTIME_URL ?? "http://127.0.0.1:8787";
const runtimeToken = process.env.PHASE2_RUNTIME_TOKEN ?? "phase2-local";
const groupId = "local-operational-group";
const userId = "phase2-runtime-user";
const runId = `phase2-runtime-${Date.now().toString(36)}`;

const checks = [];
let sequence = 0;

function event(label, text) {
  const eventId = `${runId}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    source: { type: "group", groupId, userId },
    message: { id: `${eventId}-message`, type: "text", text },
  };
}

function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
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
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`invalid JSON response for ${label}: ${bodyText.slice(0, 200)}`);
  }
  if (response.status !== 200 || !body.ok) throw new Error(`dispatch ${label} failed: HTTP ${response.status}`);
  const textReply = body.reply?.messages?.[0]?.text ?? "";
  return { body, text: textReply };
}

async function run() {
  const inventory = await dispatch("inventory-before", "洪秀美場 1舍 目前存欄");
  check(
    "DERIVED-CURRENT-STOCK",
    inventory.text.includes("洪秀美場｜1舍：893隻") && !inventory.text.includes("洪秀美場｜2舍：500隻"),
    inventory.text,
  );

  const age = await dispatch("age-before", "洪秀美場 1舍 日齡");
  check("FLOCK-AGE-CALCULATION", age.text.includes("PHASE2-1") && age.text.includes("日齡"), age.text);

  const shipments = await dispatch("shipments-before", "近期出雞");
  check("SHIPMENT-REMINDER", shipments.text.includes("PHASE2-1") && shipments.text.includes("近期出雞"), shipments.text);

  const multiHouse = await dispatch("multi-house", "洪秀美場死亡5");
  check(
    "MULTI-HOUSE-REQUIRES-SELECTION",
    multiHouse.text.includes("多個進行中雞舍") && multiHouse.text.includes("1. 1舍") && multiHouse.text.includes("2. 2舍"),
    multiHouse.text,
  );

  const selectedHouse = await dispatch("select-house", "2");
  check("HOUSE-SELECTION-WRITES", selectedHouse.text.includes("洪秀美場｜2舍｜死亡｜5隻"), selectedHouse.text);

  const explicitHouse = await dispatch("explicit-house", "洪秀美場1舍死亡5");
  check("HOUSE-LEVEL-EVENT-WRITES", explicitHouse.text.includes("洪秀美場｜1舍｜死亡｜5隻"), explicitHouse.text);

  const createHouse = await dispatch("create-house", "新增雞舍 洪秀美場 3舍");
  check("HOUSE-CREATE-REQUIRES-CONFIRMATION", createHouse.text.includes("即將建立雞舍") && createHouse.text.includes("3舍"), createHouse.text);

  const confirmHouse = await dispatch("confirm-house", "確認");
  check("HOUSE-CREATE-COMPLETES", confirmHouse.text.includes("雞舍建立成功") && confirmHouse.text.includes("3舍"), confirmHouse.text);

  const duplicateHouse = await dispatch("duplicate-house", "新增雞舍 洪秀美場 3舍");
  check("HOUSE-DUPLICATE-BLOCKED", duplicateHouse.text.includes("不建立 duplicate") || duplicateHouse.text.includes("已存在舍別"), duplicateHouse.text);

  const createFlock = await dispatch(
    "create-flock",
    "新增批次 洪秀美場 3舍 TEST-BATCH 入雛 2026-08-20 12000 出雞 2026-11-20",
  );
  check("FLOCK-CREATE-REQUIRES-CONFIRMATION", createFlock.text.includes("即將建立新批次") && createFlock.text.includes("TEST-BATCH"), createFlock.text);

  const confirmFlock = await dispatch("confirm-flock", "確認");
  check("FLOCK-CREATE-COMPLETES", confirmFlock.text.includes("批次建立成功") && confirmFlock.text.includes("TEST-BATCH"), confirmFlock.text);

  const duplicateFlock = await dispatch(
    "duplicate-flock",
    "新增批次 洪秀美場 3舍 TEST-BATCH 入雛 2026-08-20 12000 出雞 2026-11-20",
  );
  check("FLOCK-DUPLICATE-BLOCKED", duplicateFlock.text.includes("不建立 duplicate") || duplicateFlock.text.includes("已存在批次"), duplicateFlock.text);

  const newBatchAge = await dispatch("new-batch-age", "3舍日齡");
  check("NEW-FLOCK-AGE-READBACK", newBatchAge.text.includes("TEST-BATCH") && newBatchAge.text.includes("日齡"), newBatchAge.text);

  const finalInventory = await dispatch("inventory-after", "洪秀美場 3舍 目前存欄");
  check("DERIVED-STOCK-INCLUDES-NEW-HOUSE", finalInventory.text.includes("3舍") && finalInventory.text.includes("12,000隻"), finalInventory.text);

  const passed = checks.filter((item) => item.pass).length;
  console.log(`PHASE2_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  console.log(`PHASE2_RUNTIME_CHECKS=${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`PHASE2_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
