# Conversation Production Trace

## Scope

Trace only explicit `@AI` conversation turns. Ordinary Ambient chat remains governed by its existing 24-hour source retention and is not copied into a permanent transcript. The trace never stores LINE tokens, secrets, admin credentials, chain-of-thought, or full user utterances.

## Durable metadata

Migration `0026_conversation_evidence_observability.sql` adds `conversation_v2_traces` with:

```text
trace_id
event_ref / safe event fingerprint
organization_id
safe group hash / safe user hash
conversation session id
active object and V2 eligibility
planner invoked / source / model / plan validity
goal / topic / requested tools / executed tools
tool result status / policy level
response strategy / renderer / mutation level
Candidate, official, and Audit mutation counts
duration / error class
created_at / expires_at
```

`writeConversationV2Trace()` in `src/index.ts` writes metadata best-effort after the response path. It also removes expired rows. Retention is seven days. A trace-write failure cannot turn a successful user response into a data mutation or a retryable official write.

The test-only authorized runtime state endpoint exposes bounded trace metadata for local assertions; it does not expose a production user menu.

## Semantic working memory

The same migration adds `semantic_memory_json` to `conversation_v2_sessions`. The session remains scoped to:

```text
organization_id + line_group_id + line_user_id
```

and uses a rolling 30-minute TTL. The bounded memory stores:

```text
active object
last goal / topic
last referenced object / field
last explained issue
last conclusion
evidence refs
blocking status
recommended options
action proposal
explicit user decision
assistant response summary
updated_at
```

`loadConversationV2Session()` parses this JSON with local bounds. `saveConversationV2Session()` stores the grounded response summary, not only a conflict label. This allows a follow-up such as `為什麼？` to inherit the previous evidence-backed explanation while keeping User A isolated from User B.

## Trace interpretation

For each explicit non-command mention, reviewers can distinguish:

```text
planner_invoked = 1
planner_source = ai | deterministic_policy | fallback
goal / topic
requested_tools / executed_tools
response_strategy / renderer
mutation_level = read | candidate | official_handoff
official_mutation_count
```

V2 has no direct official mutation tool. Official writes remain in the existing Resolver → Validator → Business Logic → D1 → Audit path.

## Local evidence

`scripts/conversation-v2-runtime-local.mjs` starts with a realistic LINE envelope containing `mention.isSelf = true`, traverses the local Worker path, and checks final response semantics plus persisted working-memory/trace metadata. The runtime is local D1 evidence; it is not a substitute for real LINE review.

## Production release verification

Worker `d642aa43-eaae-4f7b-aa1b-76f1f034c3db` is active at 100% traffic. Migration 0026 is applied. At verification time, `conversation_v2_traces` contained zero rows because no new explicit V2 Production turn had occurred after deployment; this is an observed empty state, not a claim that tracing is disabled. The next eligible Test Farm @AI turn will create a seven-day metadata trace.

The trace table stores no full ordinary transcript, token, secret, or chain-of-thought. Production verification used SELECT-only queries and did not create a synthetic conversation, Candidate mutation, or official event.

## CURRENT TRACE SCHEMA AND RELEASE VERIFICATION — 2026-08-22

Migration 0030_conversation_safety_trace.sql adds speech_act, object_type, and goal_guard to conversation_v2_traces, plus an index on the goal guard. The trace remains metadata-only and seven-day bounded. src/index.ts writes these fields from the actual V2 speech analysis and final write guard; it does not store model chain-of-thought or full ordinary group text.

The local production-equivalent harness now starts from a true LINE mention envelope and traverses interaction gate, mention stripping, exact-command gate, Test Farm eligibility, context load, V2 planner, typed tools, policy, grounded response, and final reply payload. It asserts that Query/Explain/Advice/Meta/Compare/Analyze read turns have zero Candidate, official, and Audit mutations, and that only an explicit record assertion can reach the official gate. The harness result is 26/26 PASS; the adversarial no-write set is 100/100.

The current Production Worker is 6b5091a1-580f-4969-864a-05e8dd2be193 at 100% traffic. /health is HTTP 200. /ready is HTTP 503 because seven retained rows are still unresolved; this is the known administrator-resolution state, not a V2 planner failure. Remote conversation_v2_traces currently returns zero rows after deployment because no new explicit V2 Production turn occurred during verification. Existing conversation_v2_sessions contains only the prior bounded session state. Production verification was SELECT-only and returned no D1 writes.

The next real Test Farm interaction should verify that a new trace row contains planner_invoked, goal, speech_act, object_type, goal_guard, tools, renderer, mutation level, and zero read-turn mutation counts. Until that is observed on LINE, all real conversational acceptance labels remain PENDING_REAL_REVIEW.

## Instruction-following metadata — 2026-08-24

The existing `conversation_routing_json` now also records the bounded response
contract and read/memory decisions for each explicit V2 turn:

```text
answer_contract_mode
requested_count / example_count / capability_count / limitation_count
wants_examples / wants_capabilities / wants_limitations
wants_summary / wants_reasons / wants_consequences / wants_options
read_only_explicit
broad_read_plan
broad_read_tools_requested / broad_read_tools_executed
memory_used_for_routing / memory_used_in_response
consequence_vs_advice
renderer_variant
```

`today_attention` is a bounded read plan, not a model-supplied SQL plan. Its
tool names describe allowlisted aggregate/read helpers, and its trace records
the requested and executed sets separately. The metadata contains no prompt,
hidden reasoning, full ordinary transcript, secret, token, or password.

This is an additive metadata change using the existing JSON column; migration
status remains unchanged. The next mobile true-mention smoke turn should be
checked for these fields as well as the existing dispatch, eligibility,
planner, session, renderer, reply, and zero-mutation fields.

Post-deploy verification for this pass: Worker
`0d876d84-cc4c-4f81-852c-11cb65a8dde3` is active at 100% traffic, `/health` is
HTTP 200, and `/ready` remains HTTP 503 for the known six unresolved retained
messages while actionable unfinished count is zero. Remote D1 reports no new
line event or V2 trace after deployment, so the instruction metadata has not
yet had a real mobile turn to populate. The next phone smoke is therefore
required before any real-line instruction-following gate can be marked PASS.
