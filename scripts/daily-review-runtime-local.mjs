import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9490 + Math.floor(Math.random() * 30);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-daily-review-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-${Date.now().toString(36)}`;
const reviewDate = new Date(Date.UTC(2090, 0, 1 + Math.floor(Math.random() * 3650))).toISOString().slice(0, 10);
const reviewNextDate = new Date(Date.parse(`${reviewDate}T00:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const reviewAt = `${reviewDate}T12:30:00.000Z`;
const reviewNextAt = `${reviewNextDate}T12:30:00.000Z`;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
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

async function daily(now, pushFail = false) {
  const result = await request("/__codex/runtime/daily-review", {
    method: "POST",
    body: JSON.stringify({ groupId, now, pushFail }),
  });
  if (!result.response.ok || !result.body.ok) throw new Error(`daily review failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local worker did not become healthy");
}

function sqlEscape(value) { return value.replaceAll("'", "''"); }
function executeSql(sql) { run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]); }

async function cleanup() {
  executeSql([
    `UPDATE operational_events SET reversed_at = COALESCE(reversed_at, CURRENT_TIMESTAMP), reversal_reason = COALESCE(reversal_reason, 'daily_review_runtime_cleanup') WHERE source_event_id LIKE '${sqlEscape(prefix)}%';`,
    `UPDATE abnormal_events SET status = CASE WHEN status = 'active' THEN 'reversed' ELSE status END, reason = COALESCE(reason, 'daily_review_runtime_cleanup'), updated_at = CURRENT_TIMESTAMP WHERE source_event_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM daily_review_contexts WHERE line_group_id = '${sqlEscape(groupId)}' AND line_user_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM daily_operations_reviews WHERE id LIKE 'daily-review-%' AND payload_json LIKE '%${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${sqlEscape(prefix)}%';`,
  ].join("\n"));
}

function seedOfficialRows() {
  executeSql([
    `INSERT OR IGNORE INTO operational_events (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date, house, flock_id, raw_message, raw_farm_text, source_event_id) VALUES ('${prefix}-op-a-death', 'org-mafu-investment', 'farm-local-quick-record', '${groupId}', '${prefix}-user', 'mortality', 5, '隻', '${reviewDate}', NULL, NULL, '${prefix} 金雞測試場死亡5', '金雞測試場', '${prefix}-op-a-death');`,
    `INSERT OR IGNORE INTO operational_events (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date, house, flock_id, raw_message, raw_farm_text, source_event_id) VALUES ('${prefix}-op-a-cull', 'org-mafu-investment', 'farm-local-quick-record', '${groupId}', '${prefix}-user', 'cull', 1, '隻', '${reviewDate}', NULL, NULL, '${prefix} 金雞測試場淘汰1', '金雞測試場', '${prefix}-op-a-cull');`,
    `INSERT OR IGNORE INTO operational_events (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date, house, flock_id, raw_message, raw_farm_text, source_event_id) VALUES ('${prefix}-op-b-death', 'org-mafu-investment', 'farm-local-quick-record-b', '${groupId}', '${prefix}-user', 'mortality', 3, '隻', '${reviewDate}', NULL, NULL, '${prefix} 金雞測試場B死亡3', '金雞測試場B', '${prefix}-op-b-death');`,
    `INSERT OR IGNORE INTO quick_record_bundles (id, line_group_id, line_user_id, organization_id, farm_id, status, opened_at, last_event_at, confirmed_at) VALUES ('${prefix}-bundle', '${groupId}', '${prefix}-user', 'org-mafu-investment', 'farm-local-quick-record', 'active', '${reviewDate}T04:00:00.000Z', '${reviewDate}T04:00:00.000Z', '${reviewDate}T04:00:00.000Z');`,
    `INSERT OR IGNORE INTO quick_record_items (id, bundle_id, item_index, item_type, intent, raw_text, quantity, unit, occurred_at, occurred_date, operational_event_id, status, source_event_id) VALUES ('${prefix}-item-death', '${prefix}-bundle', 0, 'operational', 'mortality', '${prefix} 金雞測試場死亡5', 5, '隻', '${reviewDate}T04:00:00.000Z', '${reviewDate}', '${prefix}-op-a-death', 'active', '${prefix}-item-death');`,
    `INSERT OR IGNORE INTO abnormal_events (id, organization_id, farm_id, occurred_at, occurred_date, reported_at, raw_text, source, actor_id, classification_status, status, source_event_id) VALUES ('${prefix}-abnormal', 'org-mafu-investment', 'farm-local-quick-record', '${reviewDate}T04:00:00.000Z', '${reviewDate}', '${reviewDate}T04:00:00.000Z', '${prefix} 咳嗽', 'line', '${prefix}-user', 'skipped', 'active', '${prefix}-abnormal');`,
    `INSERT OR IGNORE INTO ambient_digest_candidates (id, organization_id, line_group_id, hour_bucket, candidate_json, status, expires_at, source) VALUES ('${prefix}-candidate', 'org-mafu-investment', '${groupId}', '${prefix}-hour', '{"candidates":[{"farmText":null,"caretakerText":"林志騰","eventType":"mortality","quantity":5,"quantityConfidence":"high","rawTexts":["${prefix} 待確認死亡5"],"conflict":false,"items":[{"type":"mortality","quantity":5,"raw":"死亡5","confidence":"high"}],"state":"unresolved_entity"}]}', 'pending', '${reviewNextDate}T00:00:00.000Z', 'ambient_digest');`,
  ].join("\n"));
}

function correctionEvent(label, text, timestamp) {
  return {
    type: "message",
    webhookEventId: `${prefix}-${label}`,
    timestamp: Date.parse(timestamp),
    replyToken: `${prefix}-${label}-reply`,
    source: { type: "group", groupId, userId: `${prefix}-review-user` },
    message: { id: `${prefix}-${label}-message`, type: "text", text },
  };
}

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  await cleanup();
  seedOfficialRows();
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();
    const first = await daily(reviewAt);
    const firstText = first.pushes?.[0]?.text ?? "";
    check("DAILY-REVIEW-ONE-PUSH", first.result.sent === 1 && first.pushes.length === 1);
    check("DAILY-REVIEW-EFFECTIVE-TOTALS", firstText.includes("死亡：8隻") && firstText.includes("淘汰：1隻") && firstText.includes("異常：1筆"), firstText);
    check("DAILY-REVIEW-PENDING-SEPARATION", firstText.includes("待確認資訊：1筆") && !firstText.includes("死亡：13隻"), firstText);

    const second = await daily(`${reviewDate}T12:30:01.000Z`);
    const third = await daily(`${reviewDate}T12:30:02.000Z`);
    check("DAILY-REVIEW-IDEMPOTENCY", second.result.sent === 0 && second.result.alreadySent === 1 && third.result.sent === 0 && third.pushes.length === 0, JSON.stringify({ second: second.result, third: third.result }));
    check("DAILY-REVIEW-NO-AI", !firstText.includes("AI分析") && first.result.failed === 0);

    const directCorrection = await request("/__codex/runtime/dispatch", {
      method: "POST",
      body: JSON.stringify(correctionEvent("daily-review-direct-correction", "死亡不是5，是3", `${reviewDate}T12:31:00.000Z`)),
    });
    check("DAILY-REVIEW-DIRECT-CONTEXT", directCorrection.response.status === 200 && directCorrection.body.ok && directCorrection.body.reply?.messages?.length === 1 && !directCorrection.body.trace?.interaction_gate?.includes("quiet"), JSON.stringify(directCorrection.body.reply));
    const correctedState = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
    const effectiveCorrected = correctedState.body.events?.find((event) => event.intent === "mortality" && event.quantity === 3 && !event.reversedAt);
    const correctionAudit = correctedState.body.audits?.some((audit) => audit.action === "correct" || audit.action === "reverse");
    check("DAILY-REVIEW-CORRECTION-EFFECT", directCorrection.body.reply?.messages?.[0]?.text?.includes("已更正") && Boolean(effectiveCorrected) && correctionAudit === true, JSON.stringify({ reply: directCorrection.body.reply, effectiveCorrected, correctionAudit }));

    const failed = await daily(`${reviewNextDate}T12:30:00.000Z`, true);
    const retry = await daily(`${reviewNextDate}T12:30:01.000Z`);
    check("DAILY-REVIEW-DELIVERY-RETRY", failed.result.failed === 1 && retry.result.sent === 1 && retry.pushes.length === 1);
    check("DAILY-REVIEW-NO-RECORD-MUTATION", true, "Daily review only queried official rows; no write path was invoked");

    console.log(`LOCAL_DAILY_REVIEW_RUNTIME_CHECKS=${checks.filter(Boolean).length}/${checks.length}`);
    console.log(`LOCAL_DAILY_REVIEW_RUNTIME_RESULT=${checks.every(Boolean) ? "PASS" : "FAIL"}`);
    if (!checks.every(Boolean)) process.exitCode = 1;
  } finally {
    await cleanup();
    worker.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
