import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = 9580 + Math.floor(Math.random() * 20);
const baseUrl = `http://127.0.0.1:${port}`;
const token = `local-conversation-v2-${randomBytes(18).toString("hex")}`;
const groupId = "local-quick-record-group";
const prefix = `codex-runtime-v2-${Date.now().toString(36)}`;
const botMention = "@金雞協會助理Ai";
const userId = `${prefix}-user`;
let sequence = 0;
const checks = [];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function check(name, pass, detail = "") {
  checks.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function messageEvent(label, text, timestamp, mention = false, sourceUserId = userId) {
  const eventId = `${prefix}-${label}`;
  sequence += 1;
  return {
    type: "message",
    webhookEventId: eventId,
    timestamp: Date.parse(timestamp) + sequence,
    replyToken: `${eventId}-reply`,
    source: { type: "group", groupId, userId: sourceUserId },
    message: {
      id: `${eventId}-message`,
      type: "text",
      text: mention ? `${botMention} ${text}` : text,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: botMention.length, isSelf: true }] } } : {}),
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

async function dispatch(event) {
  const result = await request("/__codex/runtime/dispatch", { method: "POST", body: JSON.stringify(event) });
  if (!result.response.ok || !result.body.ok) throw new Error(`dispatch failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function state() {
  const result = await request(`/__codex/runtime/state?prefix=${encodeURIComponent(prefix)}`);
  if (!result.response.ok || !result.body.ok) throw new Error(`state failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function digest(now, raw) {
  const result = await request("/__codex/runtime/ambient", {
    method: "POST",
    body: JSON.stringify({
      groupId,
      trigger: "manual",
      now,
      cutoffAt: now,
      candidate: {
        candidates: [{
          farmText: "金雞測試場",
          houseText: "測試1舍",
          flockText: "TEST-BATCH-001",
          caretakerText: "林志騰",
          eventType: "mortality",
          quantity: 5,
          quantityConfidence: "high",
          rawTexts: [raw],
          sourceMessageIds: [`${prefix}-source-message`],
          sourceTimestamps: ["2035-01-01T00:00:00.000Z"],
          sourceUsers: [userId],
          conflict: true,
          conflictText: "飼養者線索與目前雞場關聯不同",
          evidence: [
            { evidenceType: "source_fact", field: "mortality", normalizedValue: 5, sourceRef: `${prefix}-source-message`, sourceTimestamp: "2035-01-01T00:00:00.000Z", confidence: "high", extractionSource: "deterministic" },
            { evidenceType: "caretaker_clue", field: "caretaker", normalizedValue: "林志騰", sourceRef: `${prefix}-source-message`, sourceTimestamp: "2035-01-01T00:00:00.000Z", confidence: "medium", extractionSource: "deterministic" },
          ],
          items: [{ type: "mortality", quantity: 5, raw: raw, confidence: "high" }],
        }],
      },
    }),
  });
  if (!result.response.ok || !result.body.ok) throw new Error(`digest failed: ${JSON.stringify(result.body)}`);
  return result.body;
}

function textOf(result) {
  return result?.reply?.messages?.map((message) => message.text ?? "").join("\n") ?? "";
}

function candidateRows(value) {
  return value.candidates ?? [];
}

function fingerprint(value) {
  return JSON.stringify({
    events: value.events,
    abnormal: value.abnormal,
    pending: value.pending,
    ambient: value.ambient,
    candidates: value.candidates,
    audits: value.audits,
  });
}

function sqlEscape(value) { return value.replaceAll("'", "''"); }
function executeSql(sql) { run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", sql]); }

async function cleanup() {
  executeSql([
    `DELETE FROM conversation_v2_sessions WHERE line_user_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM conversation_v2_traces WHERE event_ref LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_chat_buffer WHERE line_message_id LIKE '${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_candidates WHERE candidate_json LIKE '%${sqlEscape(prefix)}%';`,
    `DELETE FROM ambient_digest_leases WHERE line_group_id = '${sqlEscape(groupId)}';`,
  ].join("\n"));
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

async function main() {
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/quick-record-fixture.sql"]);
  await cleanup();
  // The local D1 database is persistent between runs.  Always start this
  // rollout test with the group explicitly OFF so OBS-02 is meaningful.
  executeSql(`UPDATE line_groups SET conversation_v2_enabled = 0 WHERE group_id = '${sqlEscape(groupId)}';`);
  const worker = spawn("npx", [
    "wrangler", "dev", "--local", "--port", String(port),
    "--var", `RUNTIME_TEST_TOKEN:${token}`,
    "--var", "CONVERSATION_V2_MODE:test_farm",
    "--var", "CONVERSATION_MODEL:@cf/meta/llama-3.2-3b-instruct",
    "--var", "LINE_CHANNEL_SECRET:local-only-secret",
    "--var", "LINE_CHANNEL_ACCESS_TOKEN:local-only-token",
  ], { stdio: "ignore" });
  try {
    await waitForHealth();
    const disabled = await dispatch(messageEvent("v2-off", "你可以幫我做什麼", "2035-01-01T00:00:00.000Z", true));
    const disabledState = await state();
    const disabledRouting = disabledState.conversationRouting?.find((row) => row.eventId === `${prefix}-v2-off`);
    const disabledRoutingJson = disabledRouting?.conversationRoutingJson ? JSON.parse(disabledRouting.conversationRoutingJson) : null;
    check("OBS-02-V2-OFF-DURABLE", disabledRoutingJson?.v2_eligible === false
      && disabledRoutingJson?.v2_skip_reason === "group_v2_disabled"
      && disabledRoutingJson?.planner_invoked === false
      && disabledRoutingJson?.trace_save_status === "success", JSON.stringify(disabledRoutingJson));
    check("OBS-05-FALLBACK-ORIGIN-DURABLE", disabledRoutingJson?.fallback_origin === "conversation_read_only_fallback", JSON.stringify(disabledRoutingJson));
    executeSql(`UPDATE line_groups SET conversation_v2_enabled = 1 WHERE group_id = '${sqlEscape(groupId)}';`);

    // Eligible first turns must be owned by V2 even when there is no Candidate
    // or prior session.  This reproduces the production smoke shape that used
    // to fall through to the legacy read-only sentence.
    const beforeCapability = await state();
    const capability = await dispatch(messageEvent("capability", "你能幫我查詢或分析哪些事情？", "2035-01-01T00:01:00.000Z", true));
    const capabilityText = textOf(capability);
    const capabilityState = await state();
    const capabilityRouting = capabilityState.conversationRouting?.find((row) => row.eventId === `${prefix}-capability`);
    const capabilityRoutingJson = capabilityRouting?.conversationRoutingJson ? JSON.parse(capabilityRouting.conversationRoutingJson) : null;
    check("V2-CAPABILITY-NO-CANDIDATE-RENDERED", capability.trace?.conversation_v2_selected_goal === "HELP"
      && capability.trace?.conversation_v2_renderer === "renderConversationV2Capability"
      && capability.trace?.conversation_v2_outcome_kind === "rendered"
      && /協助|查詢|分析/u.test(capabilityText)
      && !/我先把這句當成查詢或說明問題/u.test(capabilityText), capabilityText);
    check("V2-CAPABILITY-SESSION-AND-TRACE", capabilityRoutingJson?.v2_eligible === true
      && capabilityRoutingJson?.planner_invoked === true
      && capabilityRoutingJson?.session_write_status === "success"
      && capabilityRoutingJson?.renderer === "renderConversationV2Capability"
      && capabilityRoutingJson?.v2_outcome_kind === "rendered"
      && capabilityRoutingJson?.trace_save_status === "success", JSON.stringify(capabilityRoutingJson));
    check("V2-AI-INVALID-SAFE-OUTCOME", capability.trace?.conversation_v2_ai_validation === "ai_error"
      && capability.trace?.conversation_v2_renderer === "renderConversationV2Capability"
      && capability.trace?.conversation_v2_outcome_kind === "rendered"
      && capability.trace?.conversation_v2_fallback_origin !== "legacy_conversation_fallback", JSON.stringify(capability.trace));
    check("V2-CAPABILITY-NO-MUTATION", fingerprint(beforeCapability) === fingerprint(capabilityState), "capability turn left official/candidate/audit state unchanged");

    const examples = await dispatch(messageEvent("instruction-examples", "請直接舉 3 個我現在可以問你的實際問題，不要只列功能。", "2035-01-01T00:01:10.000Z", true));
    const exampleText = textOf(examples);
    check("ANSWER-CONTRACT-EXAMPLES", examples.trace?.conversation_v2_answer_contract_mode === "examples"
      && examples.trace?.conversation_v2_example_count === 3
      && examples.trace?.conversation_v2_renderer_variant === "capability_examples"
      && (exampleText.match(/^\d+\.「/gmu) ?? []).length === 3
      && !/上一輪提到的是/u.test(exampleText), `${exampleText}\ntrace=${JSON.stringify(examples.trace)}`);

    const limits = await dispatch(messageEvent("instruction-limits", "請告訴我 2 件你可以幫我做的事，和 2 件你不會直接替我做的事。", "2035-01-01T00:01:20.000Z", true));
    const limitText = textOf(limits);
    const capabilitySection = limitText.split("不會直接替你做")[0] ?? "";
    const limitationSection = limitText.split("不會直接替你做")[1] ?? "";
    check("ANSWER-CONTRACT-CAPABILITY-LIMITS", limits.trace?.conversation_v2_answer_contract_mode === "capability_limits"
      && limits.trace?.conversation_v2_capability_count === 2
      && limits.trace?.conversation_v2_limitation_count === 2
      && limits.trace?.conversation_v2_renderer_variant === "capability_limits"
      && (capabilitySection.match(/^\d+\. /gmu) ?? []).length === 2
      && (limitationSection.match(/^\d+\. /gmu) ?? []).length === 2, `${limitText}\ntrace=${JSON.stringify(limits.trace)}`);

    const broadAttention = await dispatch(messageEvent("broad-attention", "請根據目前資料，簡單告訴我今天有沒有需要優先注意的事，不要修改資料。", "2035-01-01T00:01:30.000Z", true));
    check("BROAD-READ-EXECUTION", broadAttention.trace?.conversation_v2_selected_goal === "ANALYZE"
      && broadAttention.trace?.conversation_v2_topic === "today_attention"
      && broadAttention.trace?.conversation_v2_renderer === "renderTodayAttentionSummary"
      && broadAttention.trace?.conversation_v2_broad_read_plan === "today_attention"
      && broadAttention.trace?.conversation_v2_broad_read_tools_executed?.includes("get_today_mortality")
      && broadAttention.trace?.conversation_v2_broad_read_tools_executed?.includes("get_today_abnormal")
      && broadAttention.trace?.conversation_v2_mutation_level === "read"
      && /目前資料|正式|待確認/u.test(textOf(broadAttention)), `${textOf(broadAttention)}\ntrace=${JSON.stringify(broadAttention.trace)}`);

    const classConsequence = await dispatch(messageEvent("class-consequence", "待確認資料一直不處理通常會怎樣？只說明，不要修改。", "2035-01-01T00:01:40.000Z", true));
    check("REFERENCE-CLASS-CONSEQUENCE", classConsequence.trace?.conversation_v2_selected_goal === "EXPLAIN"
      && classConsequence.trace?.conversation_v2_topic === "candidate_consequence"
      && classConsequence.trace?.conversation_v2_reference_scope === "class"
      && classConsequence.trace?.conversation_v2_referent_required === false
      && classConsequence.trace?.conversation_v2_generic_rule_used === true
      && classConsequence.trace?.conversation_v2_renderer_variant === "class_consequence"
      && /不會因為放著就自動變成正式紀錄|待確認狀態|正式營運紀錄/u.test(textOf(classConsequence)), `${textOf(classConsequence)}\ntrace=${JSON.stringify(classConsequence.trace)}`);

    const classAdvice = await dispatch(messageEvent("class-advice", "如果之後有一筆待確認資料，我有哪些處理方式？", "2035-01-01T00:01:50.000Z", true));
    check("REFERENCE-CLASS-ADVICE-NO-SUBJECT", classAdvice.trace?.conversation_v2_selected_goal === "ADVISE"
      && classAdvice.trace?.conversation_v2_answer_contract_mode === "options"
      && classAdvice.trace?.conversation_v2_reference_scope === "class"
      && classAdvice.trace?.conversation_v2_advice_subject_exists === false
      && classAdvice.trace?.conversation_v2_renderer_variant === "class_options_no_subject"
      && /如果之後有一筆待確認資料|目前沒有待確認資料|只是說明選項/u.test(textOf(classAdvice))
      && !/取消這筆/u.test(textOf(classAdvice)), `${textOf(classAdvice)}\ntrace=${JSON.stringify(classAdvice.trace)}`);

    const instanceWithoutReferent = await dispatch(messageEvent("instance-without-referent", "這筆如果一直不處理會怎樣？", "2035-01-01T00:02:00.000Z", true));
    check("REFERENCE-INSTANCE-CLARIFICATION", instanceWithoutReferent.trace?.conversation_v2_selected_goal === "EXPLAIN"
      && instanceWithoutReferent.trace?.conversation_v2_reference_scope === "instance"
      && instanceWithoutReferent.trace?.conversation_v2_referent_required === true
      && instanceWithoutReferent.trace?.conversation_v2_referent_resolved === false
      && instanceWithoutReferent.trace?.conversation_v2_renderer_variant === "instance_reference_missing"
      && /沒有可可靠對應|不會自行猜最近一筆/u.test(textOf(instanceWithoutReferent)), `${textOf(instanceWithoutReferent)}\ntrace=${JSON.stringify(instanceWithoutReferent.trace)}`);

    const unknownRead = await dispatch(messageEvent("unknown-read", "這個天氣", "2035-01-01T00:01:30.000Z", true, `${userId}-unknown`));
    check("V2-UNKNOWN-READ-OWNED-SAFELY", unknownRead.trace?.conversation_v2_renderer?.startsWith("renderConversationV2") === true
      && unknownRead.trace?.conversation_v2_fallback_origin === "v2_unknown_read_only_fallback"
      && unknownRead.trace?.conversation_v2_session_write_status === "success"
      && !/我先把這句當成查詢或說明問題/u.test(textOf(unknownRead)), `${textOf(unknownRead)}\ntrace=${JSON.stringify(unknownRead.trace)}`);

    await dispatch(messageEvent("source", "死亡5", "2035-01-01T00:00:00.000Z"));
    const digestResult = await digest("2035-01-01T00:05:00.000Z", `${prefix}-死亡5`);
    const firstCandidateId = digestResult.pushes?.[0]?.candidateId;
    const afterDigest = await state();
    check("V2-TEST-FARM-CANDIDATE-CREATED", Boolean(firstCandidateId) && candidateRows(afterDigest).some((row) => row.id === firstCandidateId));

    const explicitFarm = await dispatch(messageEvent("explicit-farm", "就用金雞測試場", "2035-01-01T00:05:30.000Z", true));
    const afterFarm = await state();
    const selectedCandidate = afterFarm.candidates.find((row) => row.id === firstCandidateId);
    const selectedBundle = selectedCandidate ? JSON.parse(selectedCandidate.candidateJson) : null;
    check("V2-USER-FARM-OVERRIDE", selectedBundle?.candidates?.[0]?.items?.[0]?.quantity === 5
      && selectedBundle?.candidates?.[0]?.userOverrides?.farm?.status === "selected"
      && !/無法|沒有/u.test(textOf(explicitFarm)), textOf(explicitFarm));
    check("V2-EVIDENCE-PERSISTED", selectedBundle?.candidates?.[0]?.evidence?.some((item) => item.evidenceType === "caretaker_clue" && item.normalizedValue === "林志騰")
      && selectedBundle?.candidates?.[0]?.conflictEvidence?.some((item) => item.type === "caretaker_farm_mismatch" && item.businessRule?.caretakerRequiredForMortality === false), JSON.stringify(selectedBundle?.candidates?.[0]));

    const beforeConversation = await state();
    const showState = await dispatch(messageEvent("show-state", "你現在知道這筆哪些資料", "2035-01-01T00:06:00.000Z", true));
    const showStateText = textOf(showState);
    check("V2-E2E-TRUE-MENTION-AI-FIRST", showState.trace?.conversation_v2_ai_first === true && showState.trace?.conversation_v2_ai_invoked === true, JSON.stringify(showState.trace));
    check("V2-E2E-SHOW-STATE-RENDERER", showState.trace?.conversation_v2_selected_goal === "SHOW_STATE" && showState.trace?.conversation_v2_renderer === "renderAmbientCandidateStateV2" && /死亡|金雞測試場|測試1舍|TEST-BATCH-001/u.test(showStateText), showStateText);
    const showStateRouting = (await state()).conversationRouting?.find((row) => row.eventId === `${prefix}-show-state`);
    const showStateRoutingJson = showStateRouting?.conversationRoutingJson ? JSON.parse(showStateRouting.conversationRoutingJson) : null;
    check("OBS-01-V2-ROUTING-DURABLE", showStateRoutingJson?.explicit_self_mention === true
      && showStateRoutingJson?.v2_dispatch_entered === true
      && showStateRoutingJson?.v2_eligible === true
      && showStateRoutingJson?.planner_invoked === true
      && showStateRoutingJson?.trace_save_status === "success", JSON.stringify(showStateRoutingJson));
    check("OBS-03-PLANNER-AI-DURABLE", showStateRoutingJson?.planner_invoked === true
      && showStateRoutingJson?.ai_attempted === true, JSON.stringify(showStateRoutingJson));
    check("OBS-04-SESSION-STATUS-DURABLE", ["found", "not_found"].includes(showStateRoutingJson?.session_read_status)
      && showStateRoutingJson?.session_write_status === "success", JSON.stringify(showStateRoutingJson));

    const explain = await dispatch(messageEvent("explain", "飼養者線索有什麼不同", "2035-01-01T00:06:30.000Z", true));
    const explainText = textOf(explain);
    check("V2-EXPLAIN-USES-EVIDENCE", explain.trace?.conversation_v2_selected_goal === "EXPLAIN" && explain.trace?.conversation_v2_renderer === "renderAmbientCandidateExplanationV2" && /evidence|來源|資料庫|原因|影響/u.test(explainText), explainText);
    check("V2-EXPLAIN-DIFFERS-FROM-STATE", explainText !== showStateText && !/^.*目前這筆我知道的資料/m.test(explainText), explainText);

    const conflictFollowup = await dispatch(messageEvent("conflict-followup", "什麼衝突", "2035-01-01T00:07:00.000Z", true));
    check("V2-MULTITURN-CONFLICT-ANTECEDENT", conflictFollowup.trace?.conversation_v2_selected_goal === "EXPLAIN" && /衝突|飼養者|雞場|原因/u.test(textOf(conflictFollowup)) && !/你想修改哪一項/u.test(textOf(conflictFollowup)), textOf(conflictFollowup));

    const why = await dispatch(messageEvent("why", "為什麼", "2035-01-01T00:07:30.000Z", true));
    check("V2-MULTITURN-WHY-EXPLAINS", why.trace?.conversation_v2_selected_goal === "EXPLAIN" && /來源|原因|影響|資料庫/u.test(textOf(why)) && !/你想修改哪一項/u.test(textOf(why)), textOf(why));
    const afterWhy = await state();
    const primarySession = afterWhy.conversationSessions?.find((row) => row.id.endsWith(`-${userId}`));
    const workingMemory = primarySession?.semanticMemoryJson
      ? JSON.parse(primarySession.semanticMemoryJson)
      : null;
    check("V2-SEMANTIC-WORKING-MEMORY-PERSISTED", primarySession?.lastGoal === "EXPLAIN"
      && primarySession?.lastTopic === "caretaker_conflict"
      && typeof workingMemory?.lastConclusion === "string"
      && /原始聊天|資料庫|不會阻止/u.test(workingMemory.lastConclusion), JSON.stringify({ session: primarySession, workingMemory }));
    const readTraces = (afterWhy.conversationTraces ?? []).filter((row) => row.mutationLevel === "read"
      && row.eventRef !== `${prefix}-v2-off`);
    check("V2-PRODUCTION-TRACE-METADATA", readTraces.length >= 4
      && readTraces.every((row) => row.plannerInvoked === 1
        && row.officialMutationCount === 0
        && typeof row.speechAct === "string"
        && (row.objectType === null || typeof row.objectType === "string")
        && typeof row.goalGuard === "string"), JSON.stringify(readTraces));

    const independentExamples = await dispatch(messageEvent("independent-examples", "給我三個例子。", "2035-01-01T00:07:45.000Z", true));
    check("MEMORY-RELEVANCE-INDEPENDENT", independentExamples.trace?.conversation_v2_renderer_variant === "capability_examples"
      && independentExamples.trace?.conversation_v2_memory_used_for_routing === false
      && independentExamples.trace?.conversation_v2_memory_used_in_response === false
      && !/上一輪提到的是/u.test(textOf(independentExamples)), `${textOf(independentExamples)}\ntrace=${JSON.stringify(independentExamples.trace)}`);

    const impact = await dispatch(messageEvent("impact", "那這會影響死亡紀錄嗎", "2035-01-01T00:08:00.000Z", true));
    check("V2-EXPLAIN-CONSEQUENCE", impact.trace?.conversation_v2_selected_goal === "EXPLAIN" && impact.trace?.conversation_v2_topic === "candidate_consequence"
      && impact.trace?.conversation_v2_answer_contract_mode === "consequence"
      && impact.trace?.conversation_v2_consequence_vs_advice === "consequence"
      && /影響|正式|紀錄|新增|修改/u.test(textOf(impact)), textOf(impact));

    const blocker = await dispatch(messageEvent("blocker", "所以現在真正卡住的是什麼", "2035-01-01T00:08:30.000Z", true));
    check("V2-EXPLAIN-BLOCKER", blocker.trace?.conversation_v2_selected_goal === "EXPLAIN" && blocker.trace?.conversation_v2_topic === "candidate_blockers" && /blocking|卡住|必要|確認/u.test(textOf(blocker)), textOf(blocker));

    const now = await dispatch(messageEvent("now", "那現在呢", "2035-01-01T00:09:00.000Z", true));
    check("V2-MULTITURN-CURRENT-CONTEXT", now.trace?.conversation_v2_selected_goal === "EXPLAIN" && /目前|現在|需要|blocking|正式/u.test(textOf(now)), textOf(now));

    const advice = await dispatch(messageEvent("advice", "如果我不想處理它，有哪些選擇", "2035-01-01T00:09:30.000Z", true));
    const adviceText = textOf(advice);
    check("V2-ADVISE-NOT-STATE-RENDER", advice.trace?.conversation_v2_selected_goal === "ADVISE" && advice.trace?.conversation_v2_renderer === "conversationV2AdviceReply"
      && advice.trace?.conversation_v2_answer_contract_mode === "options"
      && advice.trace?.conversation_v2_consequence_vs_advice === "advice"
      && /取消|稍後|保留|正式資料/u.test(adviceText) && adviceText !== showStateText, adviceText);

    const cancellationConsequence = await dispatch(messageEvent("cancellation-consequence", "那取消的話會怎樣", "2035-01-01T00:10:00.000Z", true));
    check("V2-EXPLAIN-CANCELLATION-CONSEQUENCE", cancellationConsequence.trace?.conversation_v2_selected_goal === "EXPLAIN"
      && cancellationConsequence.trace?.conversation_v2_topic === "candidate_consequence"
      && cancellationConsequence.trace?.conversation_v2_answer_contract_mode === "consequence"
      && /取消|正式資料|原始聊天/u.test(textOf(cancellationConsequence))
      && textOf(cancellationConsequence) !== showStateText, textOf(cancellationConsequence));

    const afterConversation = await state();
    check("V2-E2E-READ-AND-ADVICE-NO-MUTATION", fingerprint(beforeConversation) === fingerprint(afterConversation), "official/candidate/audit state unchanged");

    // Production-equivalent read questions must stay read-only even while an
    // open Candidate is present.  These are intentionally different goals;
    // the assertions cover the final reply and the durable D1 snapshot, not
    // only the classifier label.
    const beforeOperationalQueries = await state();
    const mortalityQuery = await dispatch(messageEvent("query-mortality", "今天總共記了幾隻死亡？", "2035-01-01T00:10:15.000Z", true));
    const abnormalQuery = await dispatch(messageEvent("query-abnormal", "今天有哪些異常？", "2035-01-01T00:10:30.000Z", true));
    const pendingQuery = await dispatch(messageEvent("query-pending", "現在有幾筆待確認資料？", "2035-01-01T00:10:45.000Z", true));
    const afterOperationalQueries = await state();
    check("V2-E2E-QUERY-MORTALITY-NO-WRITE", mortalityQuery.trace?.conversation_v2_selected_goal === "QUERY"
      && mortalityQuery.trace?.conversation_v2_renderer === "todayMortalityReply"
      && /死亡|今天|沒有/u.test(textOf(mortalityQuery)), `${textOf(mortalityQuery)}\ntrace=${JSON.stringify(mortalityQuery.trace)}`);
    check("V2-E2E-QUERY-ABNORMAL-NO-WRITE", abnormalQuery.trace?.conversation_v2_selected_goal === "QUERY"
      && abnormalQuery.trace?.conversation_v2_renderer === "conversationTodayAbnormalReply"
      && /異常|今天/u.test(textOf(abnormalQuery)), textOf(abnormalQuery));
    check("V2-E2E-QUERY-PENDING-NO-WRITE", pendingQuery.trace?.conversation_v2_selected_goal === "QUERY"
      && /待確認/u.test(textOf(pendingQuery)), textOf(pendingQuery));
    check("V2-E2E-QUERY-DISTINCT-READ-REPLIES", new Set([textOf(mortalityQuery), textOf(abnormalQuery), textOf(pendingQuery)]).size === 3);
    check("V2-E2E-QUERY-NO-MUTATION", fingerprint(beforeOperationalQueries) === fingerprint(afterOperationalQueries), "query turns left official/candidate/audit state unchanged");

    const cancelled = await dispatch(messageEvent("cancel", "那就不要記了", "2035-01-01T00:10:00.000Z", true));
    const afterCancel = await state();
    check("V2-EXPLICIT-CANCEL", /取消|完成/u.test(textOf(cancelled)) && afterCancel.candidates.some((row) => row.id === firstCandidateId && ["ignored", "cancelled"].includes(row.status)), JSON.stringify(afterCancel.candidates));

    const afterCancelExplain = await dispatch(messageEvent("after-cancel", "摘要", "2035-01-01T00:11:00.000Z", true));
    check("V2-CANCELLED-CANDIDATE-NOT-INBOX", !textOf(afterCancelExplain).includes("死亡5") && !textOf(afterCancelExplain).includes("待確認營運資訊"), textOf(afterCancelExplain));

    const secondSource = await dispatch(messageEvent("source-two", "死亡5", "2035-01-01T00:12:00.000Z"));
    const secondDigest = await digest("2035-01-01T00:13:00.000Z", `${prefix}-second-death5`);
    check("V2-CANCEL-NOT-PERMANENT-SUPPRESSION", secondSource.reply.messages.length === 0 && secondDigest.result.candidatesCreated === 1, JSON.stringify(secondDigest.result));

    const generic = await dispatch(messageEvent("generic", "這筆哪裡有問題", "2035-01-01T00:14:00.000Z", true));
    check("V2-REFERENTIAL-ISSUE-READ", generic.trace?.conversation_v2_selected_goal === "EXPLAIN"
      && /原因|來源|資料庫|影響|不會/u.test(textOf(generic))
      && !/無法安全判斷|你想修改哪一項/u.test(textOf(generic)), textOf(generic));

    console.log(`LOCAL_CONVERSATION_V2_RUNTIME_CHECKS=${checks.filter(Boolean).length}/${checks.length}`);
    console.log(`LOCAL_CONVERSATION_V2_RUNTIME_RESULT=${checks.every(Boolean) ? "PASS" : "FAIL"}`);
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
