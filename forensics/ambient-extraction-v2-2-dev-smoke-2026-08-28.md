# Ambient Extraction V2.2 DEV-SMOKE-8 Report

Date: 2026-08-28
Scope: one authorized developer-only V2.2 DEV-SMOKE-8 gate after local secret readiness
Status: `FAIL — transport boundary`
Production activation: not authorized and not performed

## Local preflight

All required local gates passed before the single smoke execution:

```text
TYPESCRIPT = PASS
TARGETED_V2_2_TESTS = PASS (44 passed / 3 skipped)
FULL_VITEST = PASS (697 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
LOCAL_PROVIDER_CALLS = 0
```

The local gate did not perform a Workers AI request. No source, completion,
credential, or provider prose was persisted.

## Execution policy

```text
AUTH_SOURCE = DEV_SECRETS_LOCAL
WIRE_CONTRACT_VERSION = 2.2
MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
EXECUTION_MODE = SERIAL
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
```

The current planner selected two residual AI extraction calls: D03 and D04.
D01 and D08 used the no-event fast path; D02 and D05 were deterministic;
D06 used relation-only local routing; D07 used the deterministic local route.

## Bounded smoke result

```text
REAL_AI_CALLS = 2
DEV_SMOKE_8 = FAIL
DEV_SMOKE_PASS_COUNT = 6
DEV_SMOKE_TOTAL = 8
DEV_SMOKE_FAILED_CASE = D03
DEV_SMOKE_FAILURE_LAYER = TRANSPORT
TRANSPORT_ERROR_CLASS = NETWORK_FAILURE
```

Both residual attempts reached an attempt start and terminal failure record,
but neither reached an HTTP response or provider confirmation:

```text
D03_PROVIDER_CALLS = 1
D03_HTTP = NOT_REACHED
D03_PROVIDER_RESPONSE = NOT_CONFIRMED
D03_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION_PASS = NOT_EVALUATED

D04_PROVIDER_CALLS = 1
D04_HTTP = NOT_REACHED
D04_PROVIDER_RESPONSE = NOT_CONFIRMED
D04_STRUCTURAL_STATUS = NOT_RUN
D04_FACT_EXTRACTION_PASS = NOT_EVALUATED
D04_QUANTITY_ATTRIBUTION_STATUS = NOT_EVALUATED
```

The failure is not semantic, structural, or model evidence. The first failed
case is D03 at the transport layer. Per the gate, no retry and no second smoke
run were performed.

The locally handled cases remained bounded as follows:

```text
D06_PROVIDER_CALLS = 0
D06_RELATION_ONLY_PASS = YES
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION_PASS = YES
FACT_COLLECTION_SUBSTITUTION_COUNT = 0
EXTRA_FACT_COUNT = 0
CHAT_CONTAMINATION_COUNT = 0
UNSAFE_QUANTITY_PROPAGATION = 0
RELATION_FALSE_NEW_EVENT = 0
```

## Attempt and side-effect evidence

```text
ATTEMPT_START_COUNT = 2
ATTEMPT_TERMINAL_COUNT = 2
ORPHAN_ATTEMPTS = 0
MARKER_SEEN = YES
PROCESS_EXIT = NORMAL
WRAPPER_STATUS = FAIL (DEV_SMOKE_ACCEPTANCE_FAILURE)

PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The durable bounded ledger was complete and had no orphan attempts. The
wrapper marker was present; the wrapper failure reflects the smoke acceptance
failure, not a marker false negative. No raw source, raw completion, detail
value, credential, authorization header, or provider prose was retained.

## Acceptance boundary and next gate

```text
GROUND_TRUTH_CHANGED = NO
PROMPT_CHANGED = NO
SCHEMA_CHANGED = NO
MODEL_CHANGED = NO
RETRIES = 0
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

## Transport observability follow-up — 2026-08-28

The historical transport failure above is preserved unchanged. A separate
developer-only change then added bounded transport subtype classification at
the existing REST fetch catch boundary. It did not change provider behavior,
the 30000 ms timeout, retries, Auth, Prompt, schema, model, or the ledger
record shape. The change was committed as:

```text
COMMIT = e18ef8d
COMMIT_MESSAGE = fix: preserve bounded provider transport subtype
```

The local gate passed before the single follow-up smoke:

```text
TYPESCRIPT = PASS
TARGETED_REST_AND_V2_2_TESTS = PASS (70 passed / 3 skipped)
FULL_VITEST = PASS (710 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
```

Exactly one current V2.2 DEV-SMOKE-8 was then executed serially with zero
retries. The planner again selected only D03 and D04 for provider calls;
D06 remained relation-only and D07 remained deterministic:

```text
AUTH_SOURCE = DEV_SECRETS_LOCAL
WIRE_CONTRACT_VERSION = 2.2
MODEL = @cf/meta/llama-3.2-3b-instruct
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
PROVIDER_ATTEMPTS = 2
HTTP_RESPONSES = 2
PROVIDER_CONFIRMATIONS = 2
CONFIRMED_INFERENCE_CALLS = 2
TRANSPORT_FAILURES = 0

D03_HTTP = 200
D03_PROVIDER_RESPONSE = CONFIRMED
D03_STRUCTURAL_STATUS = PASS
D03_FACT_EXTRACTION_PASS = YES
D04_HTTP = 200
D04_PROVIDER_RESPONSE = CONFIRMED
D04_STRUCTURAL_STATUS = PASS
D04_FACT_EXTRACTION_PASS = YES
D04_QUANTITY_ATTRIBUTION_STATUS = UNRESOLVED
D06_PROVIDER_CALLS = 0
D06_RELATION_ONLY_PASS = YES
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION_PASS = YES

DEV_SMOKE_8 = PASS
DEV_SMOKE_PASS_COUNT = 8
DEV_SMOKE_TOTAL = 8
DEV_SMOKE_FAILED_CASE = NONE
ATTEMPT_START_COUNT = 2
ATTEMPT_TERMINAL_COUNT = 2
ORPHAN_ATTEMPTS = 0
WRAPPER_STATUS = PASS
```

No retry or additional provider call was performed. No raw source,
completion, provider prose, credential, Authorization header, error message,
or error stack was retained. Production side effects remained zero and
deployment remained not done.

This single smoke gate is `FAIL` because the first residual case, D03, had a
bounded transport failure. The failure does not authorize an Auth change,
Prompt change, schema change, model change, retry, or Production action. The
next step requires a separate explicit gate; this report does not authorize
another provider call.

## Provider parity gate — 2026-08-28

The developer-only Worker-binding request boundary was added in commit
`5084568` after the local parity source audit. The pinned V2.2 structured
request is now accepted only when its model, request keys, settings, messages,
and response format match the existing V2.2 contract. The input object is
forwarded unchanged through `runAmbientAiRequestInput` to `env.AI.run`.
Production Ambient V1 still uses its existing request and extraction path.

The local gate passed before the remote decision:

```text
TYPESCRIPT = PASS
TARGETED_PROVIDER_PARITY_AND_V2_2_TESTS = PASS (37 passed)
FULL_VITEST = PASS (715 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
PARITY_COMMIT = 5084568
```

Direct REST versus Worker-binding parity remains unproven. The source audit
found the historical ephemeral `wrangler dev --remote` route, but the current
project has no dedicated non-Production environment or launcher. The current
Wrangler configuration includes remote Production resources, and the local
Wrangler help describes remote mode as having access to Production resources.
The project security policy also does not permit passing the developer secret
through a child environment or using an unapproved Wrangler credential path.
No remote Worker-binding request was therefore sent, and no Production Worker
was deployed.

## Test-group Shadow implementation — 2026-08-29

This section records the implementation gate only. It does not represent a
deployment, a real LINE observation, a real provider call, or Production
activation. Historical transport failures and earlier developer-only results
above are preserved unchanged.

The read-only source audits identified the ordinary Ambient path at
`src/index.ts:processEvent`, with buffering in the existing quiet interaction
branch and V1 extraction in `runProductionAmbientDigest`. The Shadow fork is
the extractor seam `runProductionAmbientDigest` →
`runProductionAmbientExtraction`, after ordinary eligibility, buffering, group
selection, and prefilter, and before the existing V1 extractor callback.

```text
SUBAGENT_A = PASS
SUBAGENT_B = PASS
SUBAGENT_C = PASS
ORDINARY_PASSIVE_GROUP_TRAFFIC_COVERED = YES (implementation reachability only)
DEVELOPER_COMMAND_PATH_USED = NO
EXISTING_SHADOW_GATE_REUSABLE = NO
SHADOW_GATE_NAME = AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST
SHADOW_DEFAULT_OFF = YES
SHADOW_GROUP_MATCH_EXACT = YES
REAL_GROUP_ID_HARDCODED = NO
V1_INPUT_MUTATED_BY_SHADOW = NO
V1_OUTPUT_MUTATED_BY_SHADOW = NO
QUEUE_RETRY_CAN_BE_TRIGGERED_BY_SHADOW_FAILURE = NO
SHADOW_CAN_LINE_REPLY = NO
SHADOW_CAN_WRITE_CANDIDATE = NO
SHADOW_CAN_WRITE_OFFICIAL_OPERATION = NO
SHADOW_CAN_WRITE_OFFICIAL_ABNORMAL = NO
SHADOW_CAN_WRITE_FINANCE = NO
SHADOW_CAN_WRITE_MASTER_DATA = NO
SHADOW_CAN_TRIGGER_CORRECTION = NO
NEW_PERSISTENT_STORAGE_REQUIRED = NO
TELEMETRY_MODE = BOUNDED_VALUE_FREE_BEST_EFFORT_CONSOLE
RAW_TEXT_IN_SHADOW_TELEMETRY = NO
ABNORMAL_DETAIL_IN_SHADOW_TELEMETRY = NO
SHADOW_DISABLE_REQUIRES_CODE_ROLLBACK = NO
PRODUCTION_SOURCE_CHANGED = YES
PRODUCTION_BEHAVIOR_CHANGED_WHEN_SHADOW_DISABLED = NO
STRUCTURED_OUTPUT_BINDING_PARITY = PASS
REAL_AI_CALLS = 0
PROVIDER_ATTEMPTS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The new gate is absent/empty by default, accepts exact bounded group tokens,
and fails closed for malformed values. It does not reuse the developer command
allowlist. Shadow uses the existing V2.2 deterministic claim, structured
request, response boundary, and validator; its bounded telemetry contains no
raw source, prompt, completion, detail, group ID, credential, or provider
prose. V1 remains the returned extraction result and controlling lifecycle.

```text
TYPESCRIPT = PASS
TARGETED_SHADOW_AND_V2_2_TESTS = PASS (58 passed)
RELATED_AMBIENT_PROVIDER_PARITY_RELIABILITY_TESTS = PASS (207 passed)
FULL_VITEST = PASS (733 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
ORDINARY_PRODUCTION_PATH_SHADOW_TEST = PASS
TELEMETRY_PRIVACY_TEST = PASS
SIDE_EFFECT_GUARD_TEST = PASS
V1_GOLDEN_BEHAVIOR_TEST = PASS
TEST_GROUP_SHADOW_IMPLEMENTATION = PASS
TEST_GROUP_SHADOW_DEPLOYED = NO
REAL_LINE_SHADOW_OBSERVED = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = TEST_GROUP_SHADOW_DEPLOYMENT_REVIEW
```

```text
PROVIDER_ATTEMPTS = 0
HTTP_RESPONSES = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
PARITY_EXECUTION_BLOCKER = SAFE_NON_PRODUCTION_REMOTE_LAUNCHER_NOT_PROVEN
HISTORICAL_TRANSPORT_FAIL = PRESERVED
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_WRITE = 0
QUEUE_BUSINESS_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```
