import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";

const port = 9580 + Math.floor(Math.random() * 20);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-canonical-line-${randomBytes(18).toString("hex")}`;
const prefix = `codex-runtime-canonical-line-${Date.now().toString(36)}`;
const groupId = "local-quick-record-group";
const unauthorizedGroupId = "local-unauthorized-group";
const localPersistDir = mkdtempSync(`${tmpdir()}/jinji-canonical-line-`);
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
  const raw = run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", localPersistDir, "--command", sql, "--json"]);
  const parsed = JSON.parse(raw);
  return parsed?.[0]?.results ?? [];
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function makeEvent(label, text, user = userId, targetGroup = groupId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId: targetGroup, userId: user },
    message: { id: `${eventId}-message`, type: "text", text },
  };
}

function makeDirectEvent(label, text, user = userId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.now() + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "user", userId: user },
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

async function dispatchToGroup(label, text, targetGroup = groupId, user = userId) {
  const result = await request("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(makeEvent(label, text, user, targetGroup)),
  });
  if (!result.response.ok || !result.body.ok) throw new Error(`dispatch failed: ${label} HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  return { ...result.body, text: result.body.reply?.messages?.[0]?.text ?? "" };
}

async function dispatch(label, text, user = userId) {
  return dispatchToGroup(label, text, groupId, user);
}

async function dispatchDirect(label, text, user = userId) {
  const result = await request("/__codex/runtime/dispatch", {
    method: "POST",
    body: JSON.stringify(makeDirectEvent(label, text, user)),
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
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", localPersistDir]);
  executeSql("INSERT OR IGNORE INTO organizations (id, name, active) VALUES ('org-mafu-investment', 'local canonical LINE organization', 1);");
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", localPersistDir, "--file=scripts/quick-record-fixture.sql"]);
  executeSql([
    `INSERT OR IGNORE INTO line_groups (group_id, status, organization_id, farm_id) VALUES ('${unauthorizedGroupId}', 'bound', 'org-mafu-investment', 'farm-local-quick-record');`,
    "INSERT OR IGNORE INTO farm_aliases (id, farm_id, alias, normalized_alias, alias_type, status) VALUES ('local-farm-b-alias', 'farm-local-quick-record-b', '金雞測試B場', '金雞測試B場', 'manual', 'trusted');",
    "INSERT OR IGNORE INTO operator_identities (id, organization_id, identity_type, identity_key, display_name) VALUES ('local-old-operator', 'org-mafu-investment', 'line_user', 'U-old-provisioned', 'old operator');",
    "INSERT OR IGNORE INTO operator_scope_bindings (id, operator_id, organization_id, environment, farm_id, house_id, flock_id) VALUES ('local-old-scope', 'local-old-operator', 'org-mafu-investment', 'test', 'farm-local-quick-record', 'house-local-quick-record-1', 'flock-local-quick-record-1');",
    `INSERT OR IGNORE INTO line_group_operator_bindings (id, organization_id, line_group_id, operator_id, scope_binding_id) VALUES ('local-old-binding', 'org-mafu-investment', '${unauthorizedGroupId}', 'local-old-operator', 'local-old-scope');`,
  ].join("\n"));
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--persist-to", localPersistDir, "--port", String(port),
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

    const farmBO2 = await dispatch("o2-farm-b-candidate", "金雞測試B場 測試B舍 批次QUICK-RECORD-B-001 疫苗 新城雞瘟");
    const farmBO2Confirm = await dispatch("o2-farm-b-confirm", "確認");
    const farmBRows = executeSql(`SELECT COUNT(*) AS count FROM operational_actions WHERE client_operation_id LIKE '%${sqlEscape(prefix)}%' AND farm_id = 'farm-local-quick-record-b';`);
    check("AUTHORIZED-ORDINARY-MEMBER-MULTI-FARM", /確認/u.test(farmBO2.text) && /紀錄成功/u.test(farmBO2Confirm.text) && Number(farmBRows[0]?.count ?? 0) === 1 && counts().actions === 2, `${farmBO2.text}\n${farmBO2Confirm.text}`);

    const unauthorized = await dispatchToGroup(
      "unauthorized-old-scope",
      "金雞測試場 測試1舍 批次QUICK-RECORD-001 疫苗 新城雞瘟",
      unauthorizedGroupId,
      "U-old-provisioned",
    );
    check("UNAUTHORIZED_GROUP_DENIED_DESPITE_LEGACY_SCOPE", /尚未獲授權/u.test(unauthorized.text) && counts().actions === 2, unauthorized.text);

    const dm = await dispatchDirect("dm-formal-operation", "金雞測試場 測試1舍 批次QUICK-RECORD-001 疫苗 新城雞瘟");
    check("DM_FORMAL_OPERATION_DENIED", /私人群組|群組/u.test(dm.text) && counts().actions === 2, dm.text);

    const o2Replay = await dispatch("o2-confirm-replay", "確認");
    check("O2-CONFIRM-REPLAY-NO-DUPLICATE", counts().actions === 2 && !/紀錄成功/u.test(o2Replay.text), o2Replay.text);

    const o2Missing = await dispatch("o2-missing-content", "金雞測試場 測試1舍 疫苗");
    check("O2-MISSING-FIELD-CLARIFICATION", /補充疫苗/u.test(o2Missing.text) && counts().actions === 2, o2Missing.text);
    const o2Cancel = await dispatch("o2-cancel", "取消");
    check("O2-CANCEL-NO-WRITE", /已取消/u.test(o2Cancel.text) && counts().actions === 2, o2Cancel.text);

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
    rmSync(localPersistDir, { recursive: true, force: true });
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
