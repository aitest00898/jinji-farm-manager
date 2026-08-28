# USER REQUIREMENT CONTRACT

以下是這個系統真正要達成的需求。

## R1 — NATURAL LANGUAGE FIRST

使用者的目標是：

使用自然語言操作 AI 助理。

使用者不應需要知道：

Candidate、Goal、Resolver、Repair、State、Workflow、Command vocabulary 等內部概念。

## R2 — ORDINARY CHAT VS EXPLICIT @AI

普通群組聊天維持：Quiet Group Mode → Ambient Buffer。

但 true LINE @AI mention + 非 exact deterministic system command 必須：AI INTENT UNDERSTANDING FIRST，然後才 DETERMINISTIC SAFE EXECUTION。

不是：deterministic phrase parser first → AI only as fallback。

如果 actual code 對 explicit @AI natural language 仍是 deterministic goal/repair routing first，直接標 FAIL。

## R3 — CANDIDATE IS CONTEXT, NOT MODAL MODE

有 Open Candidate 只代表 AI 可以把它當成目前工作上下文。

不能推導使用者下一句一定是修改 Candidate。

「為什麼？」「哪裡怪怪的？」「這會影響死亡紀錄嗎？」「有哪些選擇？」「取消會怎樣？」都不應因 Candidate exists 被強制送入 REPAIR、SHOW_STATE 或 Candidate edit menu。

## R4 — EXPLAIN MUST ACTUALLY EXPLAIN

如果使用者問為什麼、哪裡怪、什麼衝突、會造成什麼影響、真正卡住的是什麼，EXPLAIN 必須使用 actual evidence、current Candidate、DB relations、business rules、consequence 形成自然語言回答。

「飼養者線索有不同說法」不是 explanation，只是 conflict label。真正 explanation 至少要回答原始 evidence、衝突資料、判定原因、是否 blocking、是否影響死亡紀錄、使用者可以怎麼處理。

## R5 — SHOW_STATE

「你目前知道這筆什麼？」應回答目前已知、已確認、推論、clue、blocking field、non-blocking warning、reconciliation state。

不能把其他問題全部導到 SHOW_STATE renderer。

## R6 — ADVISE IS NOT ACTION

「如果我不想處理它，有哪些選擇？」「取消的話會怎樣？」是 ADVISE，必須解釋選項與結果，Candidate 不得因此 cancel、edit 或 confirm。

只有「那就取消」「不要記了」「這筆不要」等 explicit action 才是 CANCEL。

## R7 — MULTI-TURN REFERENCE

AI 必須理解「為什麼？」「那現在呢？」「那個衝突」「這會影響嗎？」「照你說的做」「那個人的線索」等上一輪指涉，使用 Dialogue State、last topic、last explained issue、active Candidate，而不是把每一句當成孤立 command。

## R8 — UNKNOWN LANGUAGE

沒有預先設計過的自然語言，AI 應努力理解；如果無法確定，只問真正最小的澄清問題。不能默認進 Candidate edit menu，也不能無限重複同一個 fallback。

## R9 — SAFE BOUNDARY

AI 可以理解、解釋、查詢、建議、Candidate draft repair，但不能直接寫 official D1。正式 mutation 必須走 Resolver → Validator → Existing Business Logic → Audit。

## R10 — TEST FARM ROLLOUT

Conversation V2 目前只允許 Test Farm「金雞測試場」；正式 Production Farms 保持 V1。但如果 real Candidate 明確是金雞測試場，V2 eligibility 必須真的成立；如果沒有成立，標 FAIL。

## R11 — REAL LINE IS SOURCE OF TRUTH

Automated tests 不能覆蓋真人結果。目前真人 LINE FAIL，所以 V2 acceptance = FAIL，直到真人再次驗證。

---

# 1. REAL LINE FAILURE TABLE

Incident date: 2026-08-21 Asia/Taipei, 19:07–19:10. Production D1 event timestamps are UTC; `11:07:56Z` = 19:07:56 Taiwan.

| Taiwan time | Actual input | `mention.isSelf` evidence | User-observed result |
|---|---|---:|---|
| 19:08:17 | `目前有幾筆待確認資料？` with true mention | 1 | Correct count; PASS |
| 19:08:45 | `你目前知道這筆什麼？` with true mention | 1 | Candidate state; partial |
| 19:09:13 | `哪裡怪怪的？` with true mention | 1 | Same Candidate state; FAIL |
| 19:09:27 | `為什麼？` with true mention | 1 | Same Candidate state; FAIL |
| 19:09:52 | `那這會影響死亡紀錄嗎？` with true mention | 1 | Same Candidate state; FAIL |
| 19:10:06 | `所以現在真正卡住的是什麼？` with true mention | 1 | Same Candidate state; FAIL |
| 19:10:21 | `那現在呢？` with true mention | 1 | Same Candidate state; FAIL |
| 19:10:33 | `如果我不想處理它，有哪些選擇？` with true mention | 1 | Same Candidate state; FAIL |
| 19:10:45 | `那取消的話會怎樣？` with true mention | 1 | Same Candidate state; FAIL |

The user-provided final replies are the Production behavioral evidence. Outbound reply bodies are not stored in D1, so exact response bytes are not independently recoverable from the current database.

There is also a separate 19:07:56 event whose D1 evidence says it was buffered as ordinary chat: the current `ambient_chat_buffer` row has text `目前有幾筆待確認資料？`, `digest_status=buffered`, and the corresponding `line_events.payload_json` was redacted to `[ambient-buffered]`. The original mention metadata for that quiet event is therefore NOT OBSERVABLE after redaction; it is not treated as the explicit @AI event above.

# 2. DEPLOYED VERSION AND ROLLOUT

`wrangler deployments list` shows Worker version `4890c1de-bbf9-43df-89f1-c5c40a65796e` at 100% traffic.

`wrangler versions view 4890c1de-bbf9-43df-89f1-c5c40a65796e --name chicken-line-production --json` reports:

- `CONVERSATION_V2_MODE = test_farm`
- `CONVERSATION_MODEL = @cf/meta/llama-3.2-3b-instruct`
- AI binding `AI` present
- D1 binding `DB` = `chicken-line-production`
- Queue binding `EVENTS` = `chicken-line-events`
- Worker handlers: `fetch`, `queue`, `scheduled`

This proves the deployed version and bindings; it does not by itself prove each AI invocation result.

# 3. PRODUCTION D1 CANDIDATE AND V2 ELIGIBILITY

Remote read-only query of the sole open Candidate returned:

| Field | Value |
|---|---|
| Candidate | safe suffix `ambi…7870` |
| Status | `pending` |
| Organization | `org-mafu-investment` |
| Group | safe scope `Ce9685…17b2` |
| Resolved Farm ID | `test-farm-test-farm-action-…` |
| Farm name | `金雞測試場` |
| Farm environment | `test` |
| Farm active | `1` |
| Farm organization | `org-mafu-investment` |

The live Candidate JSON contains `farmText=金雞測試場`, `houseText=測試1舍`, `flockText=TEST-BATCH-001`, mortality quantity `2`, `state=conflict`, `conflictText=飼養者線索有不同說法`, and `conflicts=["multiple_caretaker_clues"]`. It has no `caretakerText` value in the current stored Candidate JSON.

Actual V2 eligibility expression in `src/index.ts`:

```text
CONVERSATION_V2_MODE === "test_farm"
AND
conversationV2FarmEnvironment(candidate) === "test"
```

`conversationV2FarmEnvironment()` reads the Candidate resolved Farm from D1 and requires `organization_id` match and `active=1`. The remote result is `test`, so:

`V2 ELIGIBILITY = TRUE`.

This is not a rollout miss.

# 4. ACTUAL PRODUCTION EVENT TRACE

Remote D1 `line_events` query covered `2026-08-21T11:07:30Z`–`11:11:00Z`. All queries reported `rows_written=0`.

Safe event suffixes are used below. Full LINE user IDs and full message IDs are intentionally omitted.

| Time | Event suffix | Text after mention stripping | `isSelf` | Gate / source behavior | V2 / V1 |
|---|---|---|---:|---|---|
| 19:07:56 | `…4JRX` | `目前有幾筆待確認資料？` | NOT OBSERVABLE after redaction | `line_events` became `[ambient-buffered]`; matching Ambient row remains `buffered` | V2 not entered / V1 not entered |
| 19:08:17 | `…HARJR` | `目前有幾筆待確認資料？` | 1 | explicit mention, `command.kind=unknown` | V2 entered; V1 not reached |
| 19:08:45 | `…K7CZ` | `你目前知道這筆什麼？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:09:13 | `…3CCY` | `哪裡怪怪的？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:09:27 | `…ZJZW` | `為什麼？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:09:52 | `…FD1V` | `那這會影響死亡紀錄嗎？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:10:06 | `…CXJ2` | `所以現在真正卡住的是什麼？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:10:21 | `…26P` | `那現在呢？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:10:33 | `…PE55` | `如果我不想處理它，有哪些選擇？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |
| 19:10:45 | `…FV2` | `那取消的話會怎樣？` | 1 | explicit mention, non-exact command | V2 entered; V1 not reached |

Scoped Production state supports the V2 route rather than a competing active workflow:

- `quick_record_sessions`: one `closed` row; no active session.
- `pending_actions`: only `cancelled`, `completed`, and `expired`; no active pending row.
- `abnormal_pending_actions`: no rows for the group.
- `daily_review_contexts`: zero active contexts.
- Candidate `review_kind`: `NULL`; no field-specific Candidate review preempted these messages.

The V2 handler returns before the V1 fallback when it produces a reply. The current session `turn_count=9` and the nine true-mention events above provide Production evidence that the explicit conversation sequence reached V2 and persisted a result on each turn.

# 5. CONVERSATION V2 SESSION TRACE

Remote read-only query after the incident:

| Field | Value |
|---|---|
| Rows | 1 |
| User | safe suffix `U4be…7e03` |
| Group | `Ce96852f54b6751ca9954ce977e3c17b2` |
| Active object type | `candidate` |
| Active object | safe suffix `ambi…7870` |
| `last_goal` | `EXPLAIN` |
| `last_topic` | `open_candidates` |
| `last_action` | `explain` |
| `last_tool` | `get_candidate_details` |
| `last_tool_result_summary` | `conflict` |
| `last_explained_issue` | `conflict` |
| `last_referenced_field` | `NULL` |
| `turn_count` | `9` |
| `updated_at` | `2026-08-21 11:10:50` UTC |
| `expires_at` | `2026-08-21T11:40:45.310Z` |

Conclusion: Dialogue state was written and the active Candidate pointer was retained. However, the persisted topic remained `open_candidates` through the sequence. The session did not capture a useful transition from “open candidate count” to “Candidate conflict explanation”; this stale topic contributed to the collapse.

# 6. AI CALL TRACE

Historical `console.log` records for this window are NOT OBSERVABLE through the available authenticated Wrangler interface. `wrangler tail` supports live tailing only and was not started; the current in-app Cloudflare tab was not available to claim. Therefore raw model responses, per-turn `ai_validation`, and exact selected plans are not fabricated.

The following is proven by deployed code plus remote state:

1. `handleCommand()` calls `handleConversationOrchestratorV2Input()` before the legacy V1 conversational fallback for `command.kind === "unknown"`.
2. `handleConversationOrchestratorV2Input()` calls `routeConversationV2Deterministic()` first.
3. Unless the deterministic goal is `RECORD`, it then calls `classifyConversationV2WithAi()`.
4. The deployed version has an AI binding and all nine explicit messages are non-`RECORD` conversation inputs.
5. The handler then calls `chooseSafeConversationV2Plan()` and persists the selected result.
6. The nine-turn persisted session and final response behavior prove the handler completed; the raw AI result is not persisted.

| Input class | AI call status | Deterministic pre-plan | Persisted/observed response path |
|---|---|---|---|
| Pending-count query | YES by code path; raw invocation log unavailable | `QUERY → open_candidates` | `queryOpenCandidateInbox()`; user result PASS |
| State question | YES by code path; raw invocation log unavailable | `EXPLAIN → open_candidates` because prior `lastTopic` suppresses SHOW_STATE branch | `explainAmbientCandidate()` state template |
| Where/why/impact/blocker/current follow-ups | YES by code path; raw invocation log unavailable | `EXPLAIN → open_candidates` | same `explainAmbientCandidate()` renderer |
| Advice question | YES by code path; raw invocation log unavailable | `EXPLAIN → open_candidates` via `question && context.lastTopic` | same state renderer; ADVISE path not selected in observed result |

The important fact is not that AI was absent. The deployed code does invoke AI after a deterministic plan, but the architecture still makes deterministic classification the first authority and permits the final response to remain the deterministic EXPLAIN/state path.

# 7. DETERMINISTIC ROUTING EVIDENCE

`src/conversation-v2.ts:269` defines `routeConversationV2Deterministic()`.

After the first pending-count query, the session topic is `open_candidates`. For the reported follow-ups:

- `你目前知道這筆什麼？`: the SHOW_STATE branch is explicitly suppressed when `context.lastTopic && question` and the text does not match the narrow state exception; it falls through to `question && context.lastTopic` → `EXPLAIN`.
- `哪裡怪怪的？`: `issue=true` → `EXPLAIN`.
- `為什麼？`: `issue=true` → `EXPLAIN`.
- `那這會影響死亡紀錄嗎？`: `question && context.lastTopic` → `EXPLAIN`.
- `所以現在真正卡住的是什麼？`: the same context-follow-up branch → `EXPLAIN`.
- `那現在呢？`: referential follow-up → `EXPLAIN`.
- `如果我不想處理它，有哪些選擇？`: no cancellation-domain match for `處理`, then `question && context.lastTopic` → `EXPLAIN`.
- `那取消的話會怎樣？`: it is a question, so the explicit CANCEL branch is not eligible; `question && context.lastTopic` → `EXPLAIN`.

This is the exact semantic collapse. It is not a missing literal phrase branch.

# 8. FINAL RENDERER TRACE

`src/index.ts:4587–4590` performs deterministic routing first, AI classification second, and `chooseSafeConversationV2Plan()` merge.

`src/index.ts:4637–4640` has one combined branch:

```text
if (selected.goal === "EXPLAIN" || selected.goal === "SHOW_STATE") {
  const reply = await explainAmbientCandidate(...);
  return reply;
}
```

`explainAmbientCandidate()` at `src/index.ts:4224` begins every response with `這筆候選目前的狀態` and renders event, Farm, House, Flock, status, and conflict label. It does not produce a separate evidence/reason/consequence explanation strategy.

`conversationV2AdviceReply()` exists at `src/index.ts:4549`, but it is reached only when the selected plan is `ADVISE`. The actual deterministic route for the reported advice questions is `EXPLAIN`, so the ADVISE renderer is bypassed.

The final renderer therefore collapses:

```text
SHOW_STATE → explainAmbientCandidate()
EXPLAIN    → explainAmbientCandidate()
ADVISE     → conversationV2AdviceReply() only if selected
```

Production observed all non-count replies as the first renderer.

# 9. TOOL QUALITY TRACE

The allowlist names tools such as `get_candidate_details`, `get_candidate_evidence`, and `get_candidate_conflicts`, but the V2 handler does not execute a generic typed tool plan. It directly calls `explainAmbientCandidate()` and that renderer directly loads the Candidate bundle plus `loadCandidateCaretakerRelations()`.

The live Candidate JSON contains:

- `conflictText = 飼養者線索有不同說法`
- `conflicts = ["multiple_caretaker_clues"]`
- `caretakerText = null`
- `reconciliation.status = not_recorded`
- `state = conflict`

It does not contain the actual caretaker name/evidence needed to answer “哪裡怪” or “為什麼”. The renderer can repeat the conflict label but cannot derive the source clue, conflicting relation, business rule, blocking consequence, or safe options from this Candidate JSON.

`TOOL_CONTEXT_INSUFFICIENT = TRUE`.

This is independent of the routing defect: even a correctly selected EXPLAIN plan currently has insufficient structured conflict evidence and no goal-specific response generator.

# 10. ROOT CAUSE CLASSIFICATION

| Classification | Status | Evidence |
|---|---|---|
| A. `V2_ROLLOUT_NOT_HIT` | NOT SELECTED | Deployed mode is `test_farm`; live Farm environment is `test`; session turn count is 9 |
| B. `V1_HANDLER_STEALS_EVENT` | NOT SELECTED | V2 handler runs before V1 and session persists; V1 fallback is after V2 reply return |
| C. `DETERMINISTIC_ROUTER_PREEMPTS_AI` | SELECTED | `routeConversationV2Deterministic()` runs before AI and maps the real follow-ups to EXPLAIN; this violates R2’s AI-first contract |
| D. `AI_GOAL_CLASSIFICATION_COLLAPSE` | NOT PROVEN | Historical AI result/log is unavailable; do not blame the model |
| E. `CONVERSATION_PLAN_VALIDATION_FALLBACK` | NOT PROVEN | Per-turn validation result is not persisted |
| F. `DIALOGUE_SESSION_NOT_WRITTEN` | NOT SELECTED | Production session exists with `turn_count=9` |
| G. `DIALOGUE_SESSION_NOT_READ` | NOT PROVEN | Code reads the session; per-turn historical logs are unavailable |
| H. `MULTITURN_REFERENCE_NOT_PASSED_TO_AI` | NOT SELECTED | Context includes `lastTopic` and `lastExplainedIssue` in the AI prompt; selection quality remains defective |
| I. `TOOL_CONTEXT_INSUFFICIENT` | SELECTED | Live Candidate has only conflict code/label and no caretaker evidence; no conflict-evidence tool is executed |
| J. `RESPONSE_STRATEGY_COLLAPSE` | SELECTED | EXPLAIN and SHOW_STATE share one renderer; ADVISE was not selected for actual advice questions |
| K. `FINAL_RENDERER_COLLAPSE` | SELECTED | `src/index.ts:4637–4640` sends both EXPLAIN and SHOW_STATE to `explainAmbientCandidate()` |
| L. `MODEL_CAPABILITY_LIMIT` | NOT SELECTED | AI result is not observable; architecture fails before a fair model-capability conclusion |
| M. `OTHER` | NOT SELECTED | No additional proven root cause required |

## Root cause statement

The V2 rollout was hit, but the conversation control plane remained deterministic-first. Once the first query set `lastTopic=open_candidates`, the deterministic router mapped the subsequent state, explanation, consequence, blocker, follow-up, advice, and cancellation-question inputs to `EXPLAIN`. The selected EXPLAIN and SHOW_STATE plans then shared `explainAmbientCandidate()`, which only rendered Candidate state and conflict labels. The Candidate’s stored conflict evidence was also insufficient for a real explanation. This produced the same state template for semantically different user goals.

# 11. REQUIREMENT → ACTUAL CONFORMANCE

| Requirement | Expected | Actual code / Production evidence | Status |
|---|---|---|---|
| R1 | Natural language without internal vocabulary | Real questions collapse to a state template; user goal not completed | FAIL |
| R2 | Explicit @AI non-command is AI intent-first | `routeConversationV2Deterministic()` runs before `classifyConversationV2WithAi()` and controls the safety merge | FAIL |
| R3 | Candidate is context, not modal mode | V2 avoids V1 modal in this trace, but context topic causes all follow-ups to one EXPLAIN path | PARTIAL |
| R4 | Explain evidence, reason, consequence | Renderer repeats `conflictText`; live JSON lacks caretaker evidence | FAIL |
| R5 | SHOW_STATE is distinct | State query was routed to EXPLAIN and uses the same renderer | PARTIAL |
| R6 | Advice is not action and has advice response | Safe mutation boundary exists, but real advice questions route to EXPLAIN/state | FAIL |
| R7 | Multi-turn references use prior topic meaningfully | Session persists, but topic remains `open_candidates` and does not track the explained issue correctly | PARTIAL |
| R8 | Unknown language gets minimum clarification, not generic edit menu | Current fallback still can use generic edit renderer; real advice questions did not clarify or advise | PARTIAL |
| R9 | AI cannot directly mutate official D1 | No official tools; Candidate remained pending; workflow history 0; official writes 0 | PASS |
| R10 | Test Farm eligibility truly works | Live Farm environment is `test`; deployed mode is `test_farm`; eligibility expression evaluates TRUE | PASS |
| R11 | Real LINE is source of truth | Real Production behavior fails despite automated PASS | FAIL |

# 12. WHY AUTOMATED TESTS MISSED THIS

## 207/207 Vitest

The V2 additions primarily test deterministic classifier output, plan schema safety, allowlist shape, and selected local helper behavior. They do not replay the exact Production event envelope plus D1 session lifecycle plus final response diversity.

## 66/66 goal benchmark

This is a deterministic classifier-only harness. It calls `routeConversationV2Deterministic()` directly with hand-selected contexts. It does not call `processEvent()`, `Interaction Gate`, the deployed AI binding, D1 session persistence, tool execution, or the final LINE renderer.

## 34/34 multi-turn benchmark

The test injects `lastTopic` and `lastGoal` directly into an in-memory context for each turn. It does not persist a first turn to `conversation_v2_sessions`, reload it on the next turn, or assert the final text.

## 11/11 local V2 runtime

This is closer to E2E and includes a true-mention envelope, but it uses a local D1 fixture and asserts broad substrings. Its dialogue uses a direct `飼養者線索有什麼不同 → 什麼衝突 → SHOW_STATE → advice → explicit cancel` sequence; it does not reproduce the Production `open_candidates` topic followed by the reported paraphrase sequence. It does not assert that EXPLAIN, SHOW_STATE, ADVISE, and QUERY use distinct final response strategies or that the raw conflict evidence is sufficient.

## False-confidence source

The test suite proved that isolated classifier examples can pass and that a local happy-path runtime can execute. It did not prove the product invariant:

```text
different user goals → different validated plans → different evidence-backed final renderers
```

# 13. PHASE 1 CONCLUSION

The root cause is proven with code and Production D1/session evidence. Phase 2 may now repair the architecture, but the repair must address:

1. AI-first planning for explicit non-command @AI messages, with deterministic rules limited to exact commands and hard safety boundaries.
2. Separate goal-specific response strategies for SHOW_STATE, EXPLAIN, QUERY, and ADVISE.
3. A real read-only conflict-evidence tool/result containing source evidence, DB relationships, business rule, blocking status, consequence, and safe options.
4. Correct persistence and retrieval of the last explained topic/issue for follow-ups.
5. A Production-equivalent E2E harness that asserts final response diversity and no mutation for read/advice turns.

No source, migration, test, or Production data was modified during Phase 1. No deployment was performed during Phase 1. Remote D1 queries reported `rows_written=0`.

## Phase 2 repair addendum — source and local E2E evidence

The preceding sections are the read-only trace of the pre-repair Worker `4890c1de-bbf9-43df-89f1-c5c40a65796e`. They intentionally record the incident as a failure. This section records the source repair performed only after that root cause was proven; it does not rewrite the historical Production result.

### Architectural repair

The explicit true-mention path in `src/index.ts` now calls `handleConversationOrchestratorV2Input()` before the V1 Candidate handlers. Inside that function the order is:

```text
load scoped Candidate + dialogue context
  -> classifyConversationV2WithAi()
  -> routeConversationV2Deterministic() as local safety/fallback policy
  -> chooseSafeConversationV2Plan()
  -> allowlisted read / Candidate-draft action
  -> goal-specific renderer
  -> persist bounded dialogue state
```

Exact system commands, Postback/Quick Reply, active Quick Record, Pending, Daily Review correction, and ordinary non-mention chat remain deterministic paths. The V2 change does not send ordinary group chat to the conversational model.

`src/conversation-v2.ts` now keeps Candidate context separate from conversational mode. It structurally distinguishes EXPLAIN, SHOW_STATE, ADVISE, QUERY, REPAIR, and CANCEL; advice is checked before cancellation/repair actions, and a conditional question cannot mutate Candidate state. `issueTopic()` tracks conflict, caretaker conflict, consequence, blocker, and referential follow-up topics without using the observed full sentences as production routing literals.

`src/index.ts` now has separate `renderAmbientCandidateStateV2()`, `renderAmbientCandidateExplanationV2()`, `conversationV2AdviceReply()`, query renderers, and Candidate mutation handlers. EXPLAIN no longer uses the SHOW_STATE renderer. The explanation path consumes bounded Candidate source evidence, resolved facts, caretaker/Farm database relations when available, the formal business rule, blocking status, consequence, and safe options.

If the stored Candidate does not retain an identifiable caretaker text, the explanation explicitly reports that limitation instead of inventing a name. This is the correct behavior for the live incident Candidate, whose current JSON has a caretaker conflict code/label but `caretakerText=null`.

### Production trace interpretation after the repair

The pre-repair evidence proves V2 was reached and a session was written, but the old deployed code used deterministic routing before AI and collapsed the final response. It does not prove the historical raw AI response because Cloudflare historical logs were unavailable. The repaired source records `conversation_v2_ai_first`, `conversation_v2_ai_invoked`, validation, deterministic and AI goals, selected goal, topic, mutation level, renderer, and session persistence in the local runtime trace; server logs use safe group/user suffixes and no secrets or full private chat.

### Required end-to-end gate

`scripts/conversation-v2-runtime-local.mjs` replays a realistic LINE message envelope with `message.mention.mentionees[].isSelf=true`, passes through the local event path, interaction gate, mention stripping, Test Farm eligibility, context load, AI call boundary, policy, tool/evidence path, renderer, and reply payload. It covers SHOW_STATE, evidence-backed EXPLAIN, conflict/why/consequence/blocker/current-context follow-ups, ADVISE with zero mutation, explicit CANCEL, no source re-digest, and a later independent same-value source.

The gate result is `LOCAL_CONVERSATION_V2_RUNTIME_CHECKS=18/18` and `LOCAL_CONVERSATION_V2_RUNTIME_RESULT=PASS`. It is a local D1/Test Farm runtime gate, not evidence that the real LINE device has passed.

### Post-repair regression evidence

| Gate | Result |
|---|---:|
| TypeScript + Vitest | 209/209 PASS |
| Menu runtime | 48/48 PASS |
| Quick Record runtime | 25/25 PASS |
| Quiet / Ambient runtime | 24/24 PASS |
| Manual Ambient runtime | 28/28 PASS |
| Scheduled Ambient runtime | 5/5 PASS |
| Digest V2 runtime | 16/16 PASS |
| Candidate Repair runtime | 15/15 PASS |
| Daily Review runtime | 9/9 PASS |
| Conversational Preview runtime | 9/9 PASS |
| Conversation V2 production-equivalent local E2E | 18/18 PASS |
| AI call-site compatibility tests | PASS; no executable `response_format`, `json_schema`, or `json_object` request field |

The Web/Farm remote-style runtime validator was not counted as an application failure in this run because it stopped before making a request with `RUNTIME_TEST_TOKEN is required`; no token was available and no remote synthetic write was attempted. Production Web verification remains read-only.

### Current conformance status before deployment

The source repair is ready for dry-run/deployment only after the above local gates. Real-LINE statuses remain:

```text
REAL-LINE-V2-EXPLAIN: PENDING_REAL_REVIEW
REAL-LINE-V2-MULTITURN: PENDING_REAL_REVIEW
REAL-LINE-V2-ADVISE: PENDING_REAL_REVIEW
REAL-LINE-V2-REPAIR: PENDING_REAL_REVIEW
REAL-LINE-V2-CANCEL: PENDING_REAL_REVIEW
```

## Phase 3 deployment and Production read-only verification

This is the latest deployment snapshot and supersedes the earlier pre-repair deployment snapshot in this document.

| Check | Evidence |
|---|---|
| Wrangler dry-run | PASS; D1 `chicken-line-production`, Queue `chicken-line-events`, AI, `CONVERSATION_V2_MODE=test_farm`, and pinned `CONVERSATION_MODEL` resolved |
| Deployed Worker | `b1d4dda8-0f56-438f-9d5d-578ea5a4fdff`, 100% traffic; Wrangler version number 106 |
| Health | `https://chicken-line-production.jinji-assistant.workers.dev/health` → HTTP 200, `{"ok":true,"service":"chicken-line-production","account":"@550rsdwc"}` |
| Actual attached Cron | `0 * * * *` and `30 12 * * *` (reported by deployment output) |
| Queue | `chicken-line-events`, consumer retained, `max_batch_timeout=0` in source configuration |
| AI | binding present; `@cf/meta/llama-3.2-3b-instruct` unchanged |
| Migration | Production `d1_migrations` contains 0001–0025; no new migration in this repair |

### Production D1 SELECT-only evidence

Every query below returned `rows_written=0`; no Production mutation was used for verification.

| Metric | Current value |
|---|---:|
| Active organizations | 1 |
| Active Production Farms | 8 |
| Active Test Farms | 1 |
| Active Houses | 1 |
| Active Flocks | 1 |
| Operational events | 52 |
| Abnormal events | 3 |
| Audit logs | 27 |
| Ambient buffered | 1 |
| Ambient processed | 7 |
| Ambient expired | 0 |
| Open Candidates | 1 |
| Conversation V2 session rows | 1 (the historical incident session row; it is expired by its own TTL and was not deleted) |
| Daily Review rows | 0 |
| Running semantic locks | 0 |
| Finance allocated / expense / net | `434838.6 / 5500 / 429338.6` |

The one buffered source is safe-preview text `目前有幾筆待確認資料？`, timestamp `2026-08-21T11:07:56.281Z`, status `buffered`, expiry `2026-08-22T11:07:56.281Z`. It was not consumed by deployment verification. The open Candidate is safe suffix `ambi…7870`, status `pending`, Farm `金雞測試場`, environment `test`, state `conflict`, and remains unchanged. No Candidate was cancelled, confirmed, edited, or deleted.

The lease table has one row for the authorized group; read-only `julianday(lease_until) <= julianday('now')` reports `expired_leases=1` and `active_leases=0`. This is a pre-existing stale/expired lease state observed during verification; no cleanup mutation was performed in this turn. It is separate from the Conversation V2 repair and remains an operational follow-up.

Production official synthetic writes: `0`. No remote runtime token was guessed, no synthetic operational/abnormal event was created, and no user Candidate action was simulated.

### AI inventory correction

The complete source scan contains **six** Workers AI invocation sites, not five: `src/ambient.ts:extractAmbientCandidates`, `src/analysis.ts:invokeAnalysisAi`, `src/analysis.ts:classifyAbnormalWithAi`, `src/index.ts:parseSemanticWithAiModel`, `src/conversational-agent.ts:classifyConversationalGoalWithAi`, and `src/conversation-v2.ts:classifyConversationV2WithAi`. The compatibility scan found no executable `response_format`, `json_schema`, or `json_object` field. `classifyAbnormalWithAi` only proposes abnormal-event metadata; the surrounding deterministic application path performs the validated classification-status update and does not expose an official-write tool to AI.
