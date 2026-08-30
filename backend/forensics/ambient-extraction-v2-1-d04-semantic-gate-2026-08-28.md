# Ambient Extraction V2.1 Wrapper Fix + D04 Semantic Gate — 2026-08-28

## Scope and stop boundary

This developer-only round authorized the wrapper false-negative correction and
at most one structured Direct REST D04 call. No Prompt, model, temperature,
max-token setting, wire contract, Ground Truth, Production path, or semantic
heuristic was changed. No provider inference call was completed.

## Wrapper correction

The source and the prior bounded V2.1 ledger confirmed that the wrapper's
false-negative branch was `marker missing -> exit 2`. The ledger already had a
complete terminal record and a normal child process exit. The wrapper now treats
the marker as human-readable convenience output only.

The durable success decision requires complete ledger accounting and still
fails closed for orphan attempts, missing terminal records, abnormal child
termination, spawn failure, ledger failure/corruption, and provider-call limit
overflow. A missing marker is reported as `MISSING_NON_FATAL` and is not alone
a failure.

The wrapper also supports the developer-only `--d04-only` child path. It uses
the existing structured V2 execution mode and a one-call limit; it does not add
a second inference implementation.

```text
WRAPPER_MARKER_FALSE_NEGATIVE_ROOT_CAUSE = CONFIRMED
MARKER_REQUIRED_FOR_SUCCESS = NO
DURABLE_LEDGER_AUTHORITATIVE = YES
```

## Local gate

The local gate completed before the D04 attempt:

```text
TypeScript = PASS
Wrapper reliability tests = PASS
V2.1 schema tests = PASS
D03 regression = PASS
D04 frozen fixture = PASS
D06 relation-only = PASS
FRESH-13 mixed relation = PASS
Structured response boundary = PASS
Full Vitest = 638 passed / 7 skipped
ALL_LOCAL_TESTS = PASS
```

No test enabled a Workers AI inference path.

## D04 execution result

The developer wrapper was started with the explicit D04-only real-model mode,
but safe Wrangler authentication discovery stopped before constructing or
sending the provider request. `wrangler whoami --json` reported that the
authentication token had expired in the non-interactive process.

This is an authentication precondition failure, not a D04 model, structural,
or semantic result. No retry or fallback was made.

```text
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 0
D04_HTTP = NOT_RUN
D04_STRUCTURAL_STATUS = NOT_RUN
D04_SEMANTIC_PASS = NOT_RUN
AUTH_BLOCKED = YES
```

The D04 frozen expectation remains unchanged: two events, cull quantity 2
with null detail, and abnormal quantity 2 with the frozen short detail. The
cross-event quantity attribution risk remains unmeasured in this round.

## Safety gates

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```

Historical D03 Prompt-only `INVALID_JSON`, D03 structured semantic failure,
canonical-example partial result, and V2.1 D03 pass remain unchanged in their
original reports.

## Next decision

Do not interpret this round as D04 semantic evidence. After the user restores
Wrangler authentication without providing a credential to Codex, a separate
explicit gate may resume the one unused D04 call. Do not run D07, the full V2
smoke, Fresh Unseen, model comparison, or Production flow from this report.

```text
READY_FOR_D07_SEMANTIC_GATE = NO
READY_FOR_ARCHITECTURAL_ATTRIBUTION_DECISION = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```

## Final bounded gates

```text
WRAPPER_MARKER_FALSE_NEGATIVE_ROOT_CAUSE = CONFIRMED
MARKER_REQUIRED_FOR_SUCCESS = NO
DURABLE_LEDGER_AUTHORITATIVE = YES
WRAPPER_LOCAL_TESTS = PASS

WIRE_CONTRACT_VERSION = 2.1
D03_REGRESSION = PASS
ALL_LOCAL_TESTS = PASS

REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 0

D04_HTTP = NOT_RUN
D04_STRUCTURAL_STATUS = NOT_RUN
D04_EVENT_COUNT = NOT_RUN
D04_EVENT_COUNT_PASS = NOT_RUN
D04_CULL_EVENT_TYPE_PASS = NOT_RUN
D04_CULL_QUANTITY_PASS = NOT_RUN
D04_CULL_DETAIL_NULL_PASS = NOT_RUN
D04_ABNORMAL_EVENT_TYPE_PASS = NOT_RUN
D04_ABNORMAL_QUANTITY_PASS = NOT_RUN
D04_ABNORMAL_DETAIL_PASS = NOT_RUN
D04_CULL_PASS = NOT_RUN
D04_ABNORMAL_EVENT_PASS = NOT_RUN
D04_SEMANTIC_PASS = NOT_RUN
FAILURE_CLASS = NOT_RUN

PRODUCTION_D1_WRITE = 0
LINE_SEND = 0
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Re-execution after authentication was restored

This is an appended result. The earlier authentication-blocked result above
remains historical evidence and is not rewritten.

The local gate was rerun successfully with no inference-enabled test path. The
developer wrapper then executed exactly one D04 structured Direct REST call.
The provider response was confirmed at HTTP 200. The wrapper observed no
human-readable marker, but the durable ledger was complete, had one terminal
record, had no orphan attempt, had a normal child exit, and stayed within the
one-call limit. The wrapper therefore returned `PASS` with
`MISSING_NON_FATAL` marker status.

Only bounded ledger fields are recorded here. No raw prompt, source text,
completion, credential, or actual detail string was persisted or added to this
report.

```text
LOCAL_GATE = PASS
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
D04_HTTP = 200
D04_PROVIDER_RESPONSE = CONFIRMED
WRAPPER_STATUS = PASS
MARKER_STATUS = MISSING_NON_FATAL
ORPHAN_ATTEMPTS = 0
TERMINAL_RECORDS = COMPLETE
CHILD_PROCESS_EXIT = 0

D04_STRUCTURAL_STATUS = PASS
D04_STRUCTURAL_SUBTYPE = NONE
D04_TOP_LEVEL_TYPE = object
D04_TOP_LEVEL_SAFE_KEYS = events
D04_EVENTS_KEY_PRESENT = YES
D04_EVENTS_VALUE_TYPE = array
D04_EVENT_ITEM_COUNT = 1
D04_FIRST_INVALID_EVENT_INDEX = 1
D04_FIRST_INVALID_FIELD = detail
D04_VALIDATION_FAILURE = EVENT_DETAIL_NOT_ALLOWED

D04_ACCEPTANCE_EVENT_COUNT_PASS = NO
D04_ACCEPTANCE_CLASSIFICATION = MULTI_EVENT_BOUNDARY
D04_SEMANTIC_PASS = NO
```

The response reached the V2.1 wire boundary, but the bounded semantic
projection could not establish the frozen cull/abnormal pair after validation
closed on the first invalid detail field. The exact provider-side bounded
failure is `EVENT_DETAIL_NOT_ALLOWED`; the D04 gate classification is
`MULTI_EVENT_BOUNDARY` because only one event item was observed instead of the
two frozen expected events. This is semantic evidence, not a transport,
structured-output, or wrapper failure. No quantity attribution heuristic,
Prompt patch, model change, retry, or second call was made.

Safe ledger file:
`forensics/runtime/ambient-extraction-v2-d04-diagnostic-8ac56168-3273-4b98-86ef-618b935a767d.jsonl`

## Re-execution final bounded gates

```text
WRAPPER_MARKER_FALSE_NEGATIVE_ROOT_CAUSE = CONFIRMED
MARKER_REQUIRED_FOR_SUCCESS = NO
DURABLE_LEDGER_AUTHORITATIVE = YES
WRAPPER_LOCAL_TESTS = PASS

WIRE_CONTRACT_VERSION = 2.1
D03_REGRESSION = PASS
ALL_LOCAL_TESTS = PASS

REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
D04_HTTP = 200
D04_STRUCTURAL_STATUS = PASS
D04_EVENT_COUNT = 1
D04_EVENT_COUNT_PASS = NO
D04_CULL_EVENT_TYPE_PASS = NO
D04_CULL_QUANTITY_PASS = NO
D04_CULL_DETAIL_NULL_PASS = NO
D04_ABNORMAL_EVENT_TYPE_PASS = NO
D04_ABNORMAL_QUANTITY_PASS = NO
D04_ABNORMAL_DETAIL_PASS = NO
D04_CULL_PASS = NO
D04_ABNORMAL_EVENT_PASS = NO
D04_SEMANTIC_PASS = NO
FAILURE_CLASS = MULTI_EVENT_BOUNDARY
VALIDATION_FIRST_FAILURE = EVENT_DETAIL_NOT_ALLOWED

PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE

READY_FOR_D07_SEMANTIC_GATE = NO
READY_FOR_ARCHITECTURAL_ATTRIBUTION_DECISION = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```

The next action requires a separate explicit gate. Do not run D07, full V2
smoke, Fresh Unseen, model comparison, or Production flow from this result.
