const workerUrl = process.env.RUNTIME_WORKER_URL ?? "https://chicken-line-production.jinji-assistant.workers.dev";
const runtimeToken = process.env.RUNTIME_TEST_TOKEN;
const runPrefix = process.env.RUNTIME_RUN_ID ?? `codex-runtime-farm-house-${Date.now().toString(36)}`;
const groupUser = `${runPrefix}-user`;
const checks = [];
let sequence = 0;

const successReply = (text) => text.includes("✅ 紀錄成功") || text.includes("✅ 已紀錄至");

if (!runtimeToken) throw new Error("RUNTIME_TEST_TOKEN is required");

function event(label, text, user = groupUser) {
  const eventId = `${runPrefix}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    source: { type: "group", userId: user },
    message: { id: `${eventId}-message`, type: "text", text },
  };
}

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function runtimeRequest(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-codex-runtime-token", runtimeToken);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${workerUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { response, body };
}

async function dispatch(label, text, user = groupUser) {
  const result = await runtimeRequest("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(event(label, text, user)),
  });
  if (result.response.status !== 200 || !result.body.ok) throw new Error(`dispatch failed: ${label}`);
  return { ...result.body, text: result.body.reply?.messages?.[0]?.text ?? "" };
}

async function state() {
  const result = await runtimeRequest(`/__codex/runtime/state?prefix=${encodeURIComponent(runPrefix)}`);
  if (result.response.status !== 200 || !result.body.ok) throw new Error("runtime state failed");
  return result.body;
}

async function run() {
  const badSignature = await fetch(`${workerUrl}/webhook/line`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "invalid" },
    body: JSON.stringify({ destination: "codex-test", events: [] }),
  });
  check("SIGNED-WEBHOOK-INVALID-SIGNATURE", badSignature.status === 401, `HTTP ${badSignature.status}`);

  const signedPayload = { destination: "codex-test", events: [event("signed-ping", "ping")] };
  const signedHelper = await runtimeRequest("/__codex/runtime/sign", {
    method: "POST",
    body: JSON.stringify(signedPayload),
  });
  const signedResponse = await fetch(`${workerUrl}/webhook/line`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signedHelper.body.signature },
    body: signedHelper.body.body,
  });
  check("SIGNED-WEBHOOK-QUEUE", signedHelper.response.status === 200 && signedResponse.status === 200, `HTTP ${signedResponse.status}`);

  const direct = await dispatch("direct", "金雞測試場 測試1舍 死亡5", `${runPrefix}-direct-user`);
  check(
    "EXACT-FARM-HOUSE-DIRECT-WRITE",
    direct.trace?.ai_invoked === false &&
      direct.trace?.intent === "record_mortality" &&
      successReply(direct.text) &&
      direct.text.includes("金雞測試場") && direct.text.includes("測試1舍") && direct.text.includes("死亡") && direct.text.includes("5隻"),
    direct.text,
  );

  const stock = await dispatch("stock", "金雞測試場 測試1舍 目前存欄", `${runPrefix}-query-user`);
  check("EXACT-FARM-HOUSE-STOCK-995", stock.text.includes("測試1舍：995隻"), stock.text);

  const age = await dispatch("age", "金雞測試場 測試1舍 日齡", `${runPrefix}-query-user`);
  check("EXACT-FARM-HOUSE-AGE", age.text.includes("TEST-BATCH-001") && age.text.includes("日齡 1日"), age.text);

  const fuzzy = await dispatch("fuzzy", "金雞側市場 測試1舍 死亡1", `${runPrefix}-fuzzy-user`);
  const afterFuzzy = await state();
  check(
    "FUZZY-FARM-REQUIRES-CONFIRMATION",
    !successReply(fuzzy.text) && fuzzy.text.includes("金雞測試場") &&
      afterFuzzy.pending.some((row) => row.sourceEventId === `${runPrefix}-fuzzy` && row.status === "waiting_confirmation"),
    fuzzy.text,
  );
  const fuzzyCancel = await dispatch("fuzzy-cancel", "取消", `${runPrefix}-fuzzy-user`);
  check("FUZZY-CANCEL-AUDIT-SAFE", fuzzyCancel.text.includes("已取消"), fuzzyCancel.text);

  const noFarm = await dispatch("no-farm", "死亡2", `${runPrefix}-no-farm-user`);
  const afterNoFarm = await state();
  check(
    "NO-FARM-WAITS-FOR-FARM",
    noFarm.text.includes("記錄在哪一個雞場") &&
      afterNoFarm.pending.some((row) => row.sourceEventId === `${runPrefix}-no-farm` && row.status === "waiting_farm"),
    noFarm.text,
  );
  const noFarmCancel = await dispatch("no-farm-cancel", "取消", `${runPrefix}-no-farm-user`);
  check("NO-FARM-CANCEL-AUDIT-SAFE", noFarmCancel.text.includes("已取消"), noFarmCancel.text);

  const invalidHouse = await dispatch("invalid-house", "金雞測試場 測試99舍 死亡5", `${runPrefix}-invalid-house-user`);
  check(
    "INVALID-HOUSE-NO-FALLBACK-WRITE",
    !successReply(invalidHouse.text) && invalidHouse.text.includes("尚未建立 測試99舍") &&
      !(await state()).events.some((row) => row.sourceEventId === `${runPrefix}-invalid-house`),
    invalidHouse.text,
  );

  const finalState = await state();
  check(
    "NO-ACTIVE-PENDING-AFTER-SAFE-CANCEL",
    !finalState.pending.some((row) => ["waiting_farm", "waiting_confirmation"].includes(row.status)),
    JSON.stringify(finalState.pending),
  );
  check(
    "DIRECT-EVENT-READBACK-ONE",
    finalState.events.filter((row) => row.sourceEventId === `${runPrefix}-direct`).length === 1,
    JSON.stringify(finalState.events),
  );

  const passed = checks.filter((item) => item.pass).length;
  console.log(`RUNTIME_RUN_ID=${runPrefix}`);
  console.log(`FARM_HOUSE_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  console.log(`FARM_HOUSE_RUNTIME_CHECKS=${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`FARM_HOUSE_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
