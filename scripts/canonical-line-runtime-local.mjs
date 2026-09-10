import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9580 + Math.floor(Math.random() * 20);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-canonical-line-${randomBytes(18).toString("hex")}`;
const prefix = `codex-runtime-canonical-line-${Date.now().toString(36)}`;
const groupId = "local-quick-record-group";
const userId = `${prefix}-user`;
const otherUserId = `${prefix}-other-user`;
let sequence = 0;
const checks = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || "unknown error"}`);
  return result.stdout ?? "";
}

function sqlEscape(value) {
  return String(value).replaceAll("'", "''");
}

function executeSql(sql) {
  const raw = run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql, "--json"]);
  const parsed = JSON.parse(raw);
  return parsed?.[0]?.results ?? [];
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function makeEvent(label, text, user = userId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId: user },
    message: { id: `${eventId}-message`, type: "text", text },
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

async function dispatch(label, text, user = userId) {
  const result = await request("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(makeEvent(label, text, user)),
  });
  if (!result.response.ok || !result.body.ok) throw new Error(`dispatch failed: ${label} HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  return { ...result.body, text: result.body.reply?.messages?.[0]?.text ?? "" };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

function counts() {
  const like = `%${sqlEscape(prefix)}%`;
  return {
    actions: Number(executeSql(`SELECT COUNT(*) AS count FROM operational_actions WHERE client_operation_id LIKE '${like}';`)[0]?.count ?? 0),
    abnormalities: Number(executeSql(`SELECT COUNT(*) AS count FROM abnormal_events WHERE source_event_id LIKE '${like}';`)[0]?.count ?? 0),
  };
}

function cleanup() {
  const like = sqlEscape(prefix);
  executeSql([
    `UPDATE operational_actions SET lifecycle_status = 'reversed' WHERE client_operation_id LIKE '%${like}%';`,
    `UPDATE abnormal_events SET status = 'reversed', reason = COALESCE(reason, 'local_canonical_line_cleanup'), updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '%${like}%';`,
    `DELETE FROM conversation_v2_sessions WHERE line_group_id = '${sqlEscape(groupId)}' AND line_user_id LIKE '${like}%';`,
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

    const o2 = await dispatch("o2-candidate", "金雞測試場 測試1舍 批次QUICK-RECORD-001 疫苗 新城雞瘟");
    const beforeO2 = counts();
    check("O2-CANDIDATE-REPLY", /疫苗|補充品/u.test(o2.text) && /確認/u.test(o2.text) && o2.trace?.interaction_gate === "explicit", o2.text);
    check("O2-NO-WRITE-BEFORE-CONFIRM", beforeO2.actions === 0, JSON.stringify(beforeO2));
    check("O2-NO-AI", o2.trace?.ai_invoked !== true, JSON.stringify(o2.trace));

    const otherConfirm = await dispatch("o2-wrong-user-confirm", "確認", otherUserId);
    check("PENDING-USER-ISOLATION", !/紀錄成功|已完成，沒有重複寫入/u.test(otherConfirm.text) && counts().actions === 0, otherConfirm.text);

    const o2Confirm = await dispatch("o2-confirm", "確認");
    const afterO2 = counts();
    check("O2-CONFIRM-SHARED-WRITE", /紀錄成功/u.test(o2Confirm.text) && afterO2.actions === 1, `${o2Confirm.text} ${JSON.stringify(afterO2)}`);
    const o2Replay = await dispatch("o2-confirm-replay", "確認");
    check("O2-CONFIRM-REPLAY-NO-DUPLICATE", counts().actions === 1 && !/紀錄成功/u.test(o2Replay.text), o2Replay.text);

    const o2Missing = await dispatch("o2-missing-content", "金雞測試場 測試1舍 疫苗");
    check("O2-MISSING-FIELD-CLARIFICATION", /補充疫苗/u.test(o2Missing.text) && counts().actions === 1, o2Missing.text);
    const o2Cancel = await dispatch("o2-cancel", "取消");
    check("O2-CANCEL-NO-WRITE", /已取消/u.test(o2Cancel.text) && counts().actions === 1, o2Cancel.text);

    const a8Missing = await dispatch("a8-missing-extent", "金雞測試場 測試1舍 臭腳");
    check("A8-MISSING-FIELD-CLARIFICATION", /小範圍、中範圍或大範圍/u.test(a8Missing.text) && counts().abnormalities === 0, a8Missing.text);
    const a8Completed = await dispatch("a8-complete-after-clarification", "小範圍");
    check("A8-CANDIDATE-AFTER-CLARIFICATION", /確認/u.test(a8Completed.text) && counts().abnormalities === 0, a8Completed.text);
    const a8Cancel = await dispatch("a8-cancel", "取消");
    check("A8-CANCEL-NO-WRITE", /已取消/u.test(a8Cancel.text) && counts().abnormalities === 0, a8Cancel.text);

    const a8Complete = await dispatch("a8-complete", "金雞測試場 測試1舍 臭腳 小範圍");
    check("A8-COMPLETE-CANDIDATE", /臭腳|確認/u.test(a8Complete.text) && counts().abnormalities === 0, a8Complete.text);
    const a8Confirm = await dispatch("a8-confirm", "確認");
    check("A8-CONFIRM-ABNORMAL-WRITE", /紀錄成功/u.test(a8Confirm.text) && counts().abnormalities === 1, `${a8Confirm.text} ${JSON.stringify(counts())}`);

    const help = await dispatch("help", "使用說明");
    check("LEGACY-HELP-REGRESSION", /常用方式|紀錄：死亡5/u.test(help.text), help.text);
    const legacy = await dispatch("legacy-safe-fail", "紀錄：死亡");
    check("LEGACY-DEATH-REGRESSION", /沒有改動資料|請補充|待確認/u.test(legacy.text), legacy.text);
  } finally {
    worker.kill("SIGTERM");
    try { cleanup(); } catch (error) { console.error(`LOCAL_CLEANUP_FAILED=${error instanceof Error ? error.message : String(error)}`); }
  }
  const passed = checks.filter(Boolean).length;
  console.log(`CANONICAL_LINE_TARGETED_CHECKS=${passed}/${checks.length}`);
  console.log(`CANONICAL_LINE_TARGETED_RESULT=${passed === checks.length ? "PASS" : "FAIL"}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`CANONICAL_LINE_RUNTIME_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
