import readline from "node:readline";

const baseUrl = process.env.TESTFARM_RUNTIME_URL ?? "https://chicken-line-production.jinji-assistant.workers.dev";
const runtimeToken = process.env.TESTFARM_RUNTIME_TOKEN;
const userId = process.env.TESTFARM_RUNTIME_USER_ID ?? `codex-testfarm-admin-${Date.now().toString(36)}`;
const runId = `codex-testfarm-master-${Date.now().toString(36)}`;
const resumeExisting = process.env.TESTFARM_RESUME === "1";
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
  return {
    body,
    text: body.reply?.messages?.[0]?.text ?? "",
  };
}

async function readPassword() {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    return new Promise((resolve) => {
      let value = "";
      const onData = (chunk) => {
        for (const character of chunk) {
          if (character === "\n" || character === "\r") {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.off("data", onData);
            resolve(value);
            return;
          }
          if (character === "\u0003") process.exit(130);
          if (character === "\u007f") value = value.slice(0, -1);
          else value += character;
        }
      };
      process.stdin.on("data", onData);
    });
  }
  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  return new Promise((resolve) => {
    reader.once("line", (line) => {
      reader.close();
      resolve(line);
    });
  });
}

async function run() {
  if (!resumeExisting) {
    const houseRequest = await dispatch("house-request", "新增雞舍 金雞測試場 測試1舍");
    check(
      "ADMIN_PASSWORD_REQUIRED",
      houseRequest.text.includes("此操作需要管理權限") && !houseRequest.text.includes("雞舍建立成功"),
    );
  } else {
    check("RESUME_EXISTING_ADMIN_PENDING", true);
  }

  const password = await readPassword();
  const passwordReply = await dispatch("admin-password", password);
  check(
    "ADMIN_PASSWORD_ACCEPTED",
    passwordReply.text.includes("管理身份驗證成功") && passwordReply.text.includes("測試1舍"),
  );

  const houseConfirmation = await dispatch("house-confirmation", "確認");
  check(
    "TEST_HOUSE_CREATED_THROUGH_CONFIRMATION",
    houseConfirmation.text.includes("雞舍建立成功") && houseConfirmation.text.includes("測試1舍"),
  );

  const flockRequest = await dispatch(
    "flock-request",
    "新增批次 金雞測試場 測試1舍 TEST-BATCH-001 入雛 2026-08-19 1000 出雞 2026-11-19",
  );
  check(
    "FLOCK_CONFIRMATION_REQUIRED",
    flockRequest.text.includes("即將建立新批次") && flockRequest.text.includes("TEST-BATCH-001"),
  );

  const flockConfirmation = await dispatch("flock-confirmation", "確認");
  check(
    "TEST_FLOCK_CREATED_THROUGH_CONFIRMATION",
    flockConfirmation.text.includes("批次建立成功") && flockConfirmation.text.includes("TEST-BATCH-001"),
  );

  const passed = checks.filter((item) => item.pass).length;
  console.log(`TESTFARM_ADMIN_RUNTIME_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  console.log(`TESTFARM_ADMIN_RUNTIME_CHECKS=${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`TESTFARM_ADMIN_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
