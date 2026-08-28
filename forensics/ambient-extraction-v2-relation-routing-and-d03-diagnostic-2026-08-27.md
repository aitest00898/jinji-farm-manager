# Ambient Extraction V2 Relation Routing + D03 Diagnostic — 2026-08-27

## Scope and stop boundary

This was a developer-only V2 conformance change followed by one bounded real
model diagnostic. The Production Ambient path, Prompt, model, schema,
temperature, max tokens, D1, Queue, Candidate, Buffer, Cron, LINE, and
business-write behavior were not changed. No migration or deployment was
performed.

```text
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
EXECUTION_MODE = SERIAL
MAX_CONCURRENT_AI_CALLS = 1
```

## A. Relation routing correction

The previous V2 implementation correctly used a local relation resolver, but
it still sent the frozen D06 relation-only message through the main
`events[]` AI extraction call before resolving the relation. That was a
spec-conformance failure, not a relation-resolver schema failure.

The developer-only router now distinguishes:

```text
RELATION_ONLY
MIXED_EVENT_AND_RELATION
EVENT_ONLY
NONE
ROUTING_UNRESOLVED
```

The relation-only recognition is intentionally narrow: it uses the existing
relation cue detector plus the frozen explicit relation lead. A relation cue
without deterministic evidence of an independent new event is not guessed as
mixed or relation-only; it remains `ROUTING_UNRESOLVED` and can use the safe
fallback route.

The frozen D06 route is now:

```text
D06_ROUTE = RELATION_ONLY
D06_EVENT_AI_CALLS = 0
D06_RELATION_RESOLVER = LOCAL
D06_RELATION_COUNT = 1
D06_NEW_EVENT_COUNT = 0
D06_RELATION_TARGET = D05
```

FRESH-13 remains mixed. Its new event is not skipped merely because the same
message also has an explicit relation cue.

## B. Historical and current call plans

The old RUN-1 evidence is preserved exactly as historical evidence:

```text
HISTORICAL_RUN_1_AI_CALLS = 4
HISTORICAL_CALL_SLOTS = D03, D04, D06, D07
HISTORICAL_RESULT_REWRITE = ABSENT
```

The corrected current plan is:

```text
CURRENT_V2_EXPECTED_AI_CALLS_PER_RUN = 3
CURRENT_V2_CALL_SLOTS = D03, D04, D07
CALL_PLAN_CORRECTION_REASON = D06_RELATION_ONLY_ROUTING_FIXED
```

## C. Local conformance gate

The following passed before the real diagnostic call:

```text
TYPESCRIPT = PASS
V2_ROUTING_TESTS = PASS
RELATION_TESTS = PASS
FRESH_13_MIXED_TEST = PASS
DEV_SMOKE_8_FIXTURE_TEST = PASS
STRUCTURAL_DIAGNOSTICS = PASS
DIRECT_REST_ADAPTER_TESTS = PASS
RUNNER_RELIABILITY_TESTS = PASS
FULL_V2_TARGETED = PASS
FULL_VITEST = 607 passed / 5 skipped
REAL_MODE_DEFAULT_GUARD = PASS
```

The local fixture execution of DEV-SMOKE-8 made three provider-shaped calls,
not four; D06 was resolved locally. No local test called Workers AI.

## D. One D03 real diagnostic

The only provider call in this round was D03 alone. The Direct REST wrapper
used the existing V2 request builder and the existing durable attempt ledger.
The bounded ledger is:

```text
MATRIX_RUN_ID = 102951de-f07b-4933-b6dd-321eb525697a
ATTEMPT_COUNT = 1
TERMINAL_COUNT = 1
ORPHAN_COUNT = 0
SAFE_REF = D03
HTTP_STATUS = 200
PROVIDER_RESPONSE_CONFIRMED = YES
TRANSPORT_STATUS = success
JSON_PARSE_STATUS = fail
STRUCTURAL_STATUS = fail
STRUCTURAL_SUBTYPE = INVALID_JSON
TOP_LEVEL_TYPE = unknown
TOP_LEVEL_SAFE_KEYS = []
EVENTS_KEY_PRESENT = false
EVENTS_VALUE_TYPE = missing
EVENT_ITEM_COUNT = null
FIRST_INVALID_EVENT_INDEX = null
FIRST_INVALID_FIELD = null
UNKNOWN_SAFE_KEY_NAMES = []
DETAIL_CODEPOINT_COUNT = null
```

The response therefore produced an exact bounded structural cause. Semantic
evaluation was not attempted because the response was not legal JSON. This is
not evidence that the D03 semantic capability is low; it is evidence that the
current V2 real output is structurally incompatible for this call.

The child completed normally and the ledger has one terminal failure record.
The wrapper did not observe its stdout marker, so the marker path itself is
not treated as evidence; the durable ledger remains complete and sufficient.
No retry was made.

## E. Safety

```text
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_OFFICIAL_WRITE = PASS
NO_LINE_SEND = PASS
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
DEV_SMOKE_8_SOURCE_MUTATION = NONE
```

The call used a safe developer fixture. The Production DEV-SMOKE-8 cohort was
not read, replayed, consumed, extended, or mutated.

## F. Final gates

```text
RELATION_RESOLVER_WIRING = PASS
RELATION_ONLY_ROUTING_BEFORE_FIX = FAIL
RELATION_ONLY_ROUTING_AFTER_FIX = PASS
FRESH_13_MIXED_ROUTE = PASS
MIXED_EVENT_RELATION_REGRESSION = PASS
CURRENT_V2_EXPECTED_AI_CALLS_PER_RUN = 3

D03_HTTP = 200
D03_PROVIDER_RESPONSE = CONFIRMED
D03_JSON_PARSE = FAIL
D03_STRUCTURAL_STATUS = FAIL
D03_STRUCTURAL_SUBTYPE = INVALID_JSON
D03_SEMANTIC_EVALUABLE = NO
STRUCTURAL_DIAGNOSTIC_SUFFICIENCY = PASS

READY_FOR_MINIMAL_STRUCTURAL_FIX = YES
READY_FOR_D04_DIAGNOSTIC = NO
READY_FOR_REAL_V2_DEV_SMOKE_RERUN = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```

The next action is a separate decision about the structural incompatibility;
this round does not authorize a Prompt fix, model change, full V2 rerun, or
Production deployment.
