const workerUrl = process.env.RUNTIME_WORKER_URL ?? "https://chicken-line-production.jinji-assistant.workers.dev";
const runtimeToken = process.env.RUNTIME_TEST_TOKEN;
const runPrefix = process.env.RUNTIME_RUN_ID ?? `codex-runtime-${Date.now().toString(36)}`;
const userId = `${runPrefix}-user`;
const aiModel = "@cf/meta/llama-3.2-3b-instruct";

if (!runtimeToken) {
  console.error("RUNTIME_TEST_TOKEN is required");
  process.exit(2);
}

const checks = [];
let sequence = 0;
const successReply = (text) => text.includes("✅ 紀錄成功") || text.includes("✅ 已紀錄至");

function event(label, text) {
  const eventId = `${runPrefix}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    source: { type: "group", userId },
    message: { id: `${eventId}-message`, type: "text", text },
  };
}

async function responseJson(response) {
  const body = await response.text();
  try {
    return { status: response.status, body: JSON.parse(body) };
  } catch {
    return { status: response.status, body: { raw: body } };
  }
}

async function runtimeRequest(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-codex-runtime-token", runtimeToken);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return responseJson(await fetch(`${workerUrl}${path}`, { ...init, headers }));
}

async function dispatch(eventValue) {
  const result = await runtimeRequest("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(eventValue),
  });
  if (result.status !== 200 || !result.body.ok) throw new Error(`dispatch failed: HTTP ${result.status}`);
  return result.body;
}

async function aiSmoke(input) {
  const result = await runtimeRequest("/__codex/runtime/ai", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
  if (result.status !== 200) throw new Error(`AI smoke HTTP ${result.status}`);
  return result.body;
}

async function signedWebhook(eventValue) {
  const signed = await runtimeRequest("/__codex/runtime/sign", {
    method: "POST",
    body: JSON.stringify({ destination: "codex-test", events: [eventValue] }),
  });
  if (signed.status !== 200 || !signed.body.body || !signed.body.signature) {
    throw new Error(`signing helper failed: HTTP ${signed.status}`);
  }
  return responseJson(await fetch(`${workerUrl}/webhook/line`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signed.body.signature,
    },
    body: signed.body.body,
  }));
}

async function runtimeState() {
  const result = await runtimeRequest(`/__codex/runtime/state?prefix=${encodeURIComponent(runPrefix)}`, { method: "GET" });
  if (result.status !== 200 || !result.body.ok) throw new Error(`state failed: HTTP ${result.status}`);
  return result.body;
}

async function waitForEvent(eventId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await runtimeState();
    if (state.events.some((row) => row.sourceEventId === eventId)) return state;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return runtimeState();
}

function textOf(result) {
  return result?.reply?.messages?.[0]?.text ?? "";
}

function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const badSignature = await responseJson(await fetch(`${workerUrl}/webhook/line`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "invalid" },
    body: JSON.stringify({ destination: "codex-test", events: [] }),
  }));
  check("LINE-SIGNATURE-REJECTION", badSignature.status === 401, `HTTP ${badSignature.status}`);

  const signedEvent = event("signed-webhook", "金雞測試場死亡1");
  const signedResult = await signedWebhook(signedEvent);
  check("DEPLOYED-WORKER-SIGNED-WEBHOOK", signedResult.status === 200 && signedResult.body?.queued === 1, `HTTP ${signedResult.status}`);
  const signedState = await waitForEvent(signedEvent.webhookEventId);
  check("SIGNED-WEBHOOK-D1-READBACK", signedState.events.some((row) => row.sourceEventId === signedEvent.webhookEventId && row.quantity === 1), "queue event reached D1");

  const deterministic = await dispatch(event("deterministic", "金雞測試場死亡5"));
  check(
    "DETERMINISTIC-RUNTIME",
    deterministic.trace?.ai_invoked === false && deterministic.trace?.intent === "record_mortality" && successReply(textOf(deterministic)) && textOf(deterministic).includes("金雞測試場") && textOf(deterministic).includes("死亡") && textOf(deterministic).includes("5隻"),
    `ai_invoked=${deterministic.trace?.ai_invoked} reply=${textOf(deterministic)}`,
  );

  const semantic = await aiSmoke("金雞測試場今天死了3隻");
  check(
    "REAL-WORKERS-AI-SMOKE-MORTALITY",
    semantic.ok && semantic.model === aiModel && semantic.trace?.ai_invoked === true && semantic.trace?.validation_result === "schema_valid" && semantic.intent?.intent === "record_mortality" && semantic.intent?.farmText === "金雞測試場" && semantic.intent?.quantity === 3,
    `model=${semantic.model} validation=${semantic.trace?.validation_result}`,
  );

  const semanticEvent = await dispatch(event("semantic-mortality", "金雞測試場今天死了3隻"));
  check(
    "SEMANTIC-RUNTIME-MORTALITY",
    semanticEvent.trace?.ai_invoked === true && semanticEvent.trace?.intent === "record_mortality" && successReply(textOf(semanticEvent)) && textOf(semanticEvent).includes("金雞測試場") && textOf(semanticEvent).includes("死亡") && textOf(semanticEvent).includes("3隻"),
    `validation=${semanticEvent.trace?.validation_result} reply=${textOf(semanticEvent)}`,
  );

  const semanticCulling = await aiSmoke("金雞測試場今天又掛了2隻");
  check(
    "REAL-WORKERS-AI-SMOKE-SECOND-NATURAL-EVENT",
    semanticCulling.ok && semanticCulling.model === aiModel && semanticCulling.trace?.ai_invoked === true && semanticCulling.trace?.validation_result === "schema_valid" && ["record_mortality", "record_cull"].includes(semanticCulling.intent?.intent) && semanticCulling.intent?.quantity === 2,
    `intent=${semanticCulling.intent?.intent} validation=${semanticCulling.trace?.validation_result}`,
  );

  const cullingEvent = await dispatch(event("semantic-culling", "金雞測試場今天又掛了2隻"));
  check(
    "SEMANTIC-RUNTIME-SECOND-NATURAL-EVENT",
    cullingEvent.trace?.ai_invoked === true && ["record_mortality", "record_cull"].includes(cullingEvent.trace?.intent) && textOf(cullingEvent).includes("｜2隻"),
    `intent=${cullingEvent.trace?.intent} reply=${textOf(cullingEvent)}`,
  );

  const fuzzy = await dispatch(event("fuzzy", "金雞側市場今天死1隻"));
  check(
    "FUZZY-RUNTIME",
    !successReply(textOf(fuzzy)) && textOf(fuzzy).includes("金雞測試場"),
    `reply=${textOf(fuzzy)}`,
  );
  const fuzzyState = await runtimeState();
  check("FUZZY-PENDING-D1", fuzzyState.pending.some((row) => row.sourceEventId === `${runPrefix}-fuzzy` && row.status === "waiting_confirmation"), "waiting confirmation persisted");

  const confirmed = await dispatch(event("fuzzy-confirm", "確認"));
  check("FUZZY-CONFIRMATION-RUNTIME", successReply(textOf(confirmed)) && textOf(confirmed).includes("金雞測試場"), `reply=${textOf(confirmed)}`);

  const noFarm = await dispatch(event("pending-no-farm", "死亡2"));
  check("PENDING-RUNTIME-WAITING-FARM", textOf(noFarm).includes("記錄在哪一個雞場"), `reply=${textOf(noFarm)}`);
  const superseding = await dispatch(event("pending-superseding", "金雞測試場死亡5"));
  check("PENDING-SUPERSEDED-BY-COMPLETE-EVENT", successReply(textOf(superseding)) && textOf(superseding).includes("金雞測試場") && textOf(superseding).includes("5隻"), `reply=${textOf(superseding)}`);
  const staleNumber = await dispatch(event("stale-number", "9"));
  check("PENDING-REPLAY-CANNOT-RESURRECT", textOf(staleNumber).includes("目前沒有待確認"), `reply=${textOf(staleNumber)}`);

  const queryAi = await aiSmoke("今天哪場死最多");
  check(
    "REAL-WORKERS-AI-SMOKE-QUERY",
    queryAi.ok && queryAi.model === aiModel && queryAi.trace?.ai_invoked === true && queryAi.trace?.validation_result === "schema_valid" && queryAi.intent?.intent === "query_today_mortality_top",
    `intent=${queryAi.intent?.intent} validation=${queryAi.trace?.validation_result}`,
  );
  const query = await dispatch(event("query-top", "今天哪場死最多"));
  check(
    "QUERY-RUNTIME-D1-AGGREGATION",
    query.trace?.ai_invoked === true && query.trace?.intent === "query_today_mortality_top" && /死亡最多|尚無死亡紀錄/u.test(textOf(query)),
    `reply=${textOf(query)}`,
  );

  const replayEvent = event("replay", "金雞測試場死亡1");
  const firstReplay = await dispatch(replayEvent);
  const secondReplay = await dispatch(replayEvent);
  const replayState = await runtimeState();
  check("IDEMPOTENT-DISPATCH", firstReplay.trace?.intent === "record_mortality" && secondReplay.alreadyProcessed === true && replayState.events.filter((row) => row.sourceEventId === replayEvent.webhookEventId).length === 1, "same webhookEventId writes once");

  const replyPayloadsValid = [deterministic, semanticEvent, fuzzy, confirmed, query].every((result) => result.reply?.messages?.every((message) => message.type === "text" && typeof message.text === "string"));
  check("LINE-REPLY-PAYLOAD", replyPayloadsValid, "captured deployed reply payloads are valid LINE text messages");
}

try {
  await run();
} catch (error) {
  check("RUNTIME-HARNESS-UNEXPECTED-ERROR", false, error instanceof Error ? error.message : "unknown error");
}

console.log(`RUNTIME_RUN_ID=${runPrefix}`);
console.log(`AUTOMATED_RUNTIME_RESULT=${checks.every((item) => item.pass) ? "PASS" : "FAIL"}`);
if (checks.some((item) => !item.pass)) process.exitCode = 1;
