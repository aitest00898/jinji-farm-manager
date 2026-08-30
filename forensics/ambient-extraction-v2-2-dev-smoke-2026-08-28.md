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

## Test-group Shadow deployment review — 2026-08-29

This section is a read-only deployment review. It does not deploy the Worker,
set the Shadow allowlist, send LINE, call Workers AI, change source/config, or
mutate Production. Earlier transport failures, parity evidence, and the
Shadow implementation result above remain historical evidence.

```text
TEST_GROUP_SHADOW_IMPLEMENTATION = PASS
TEST_GROUP_SHADOW_DEPLOYMENT_REVIEW = FAIL
TEST_GROUP_SHADOW_DEPLOYED = NO
REAL_LINE_SHADOW_OBSERVED = NO
WORKER_ROOT_HEAD = 7e19587c6eb93cb7953a8f361adbe338d8315af0
RUNTIME_SOURCE_DIRTY = NO
UNRELATED_SOURCE_CHANGES_IN_DEPLOYMENT = NO
STRUCTURED_OUTPUT_BINDING_PARITY = PASS
REAL_AI_CALLS = 0
PROVIDER_ATTEMPTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The Production manifest remains `wrangler.jsonc`, with Worker
`chicken-line-production`, entry `src/index.ts`, D1 `DB`, Queue `EVENTS`, AI
`AI`, three existing cron expressions, and no Shadow allowlist value. The
canonical command is `npm run deploy` (`wrangler deploy`); the parity manifest
is not a Production deployment input. Commit `7e19587` adds the intentional
Shadow runtime seam. `5084568` leaves a guarded parity validator import in the
main bundle; `b02d62e` and `146d453` are dedicated parity-worker/config changes
and are not selected by `wrangler.jsonc`.

The Shadow configuration source is the Worker environment variable
`AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST`. Missing or empty values disable it, and
the parser performs exact fail-closed token matching; the current parser also
accepts multiple exact tokens, so a one-entry deployment value is not enforced
by source. No confirmed Shadow-designated LINE group ID is present. The
developer-command group value is not reused as proof of Shadow authorization.
The kill switch is a redeployment with this variable unset/empty. The local
deployment record identifies pre-Shadow Worker version
`62b51851-ac9a-49f3-93c2-44e76341d05d`; its source-commit binding is not proven.
Installed Wrangler supports rollback to an existing version without uploading
new code, but live target verification was intentionally not performed.

Installed Wrangler supports the bounded live query
`wrangler tail chicken-line-production --format json --search ambient_v2_2_shadow`.
The current Shadow console event safely exposes route, bounded counts,
AI-required/attempted, structural/semantic status, and safe failure class.
However it has no exact Ambient-run/correlation identifier and does not itself
prove the corresponding V1 terminal result. Therefore live observability is
not release-ready even though no persistent Shadow storage is required for a
short tail window. The next gate is
`SHADOW_OBSERVABILITY_IMPLEMENTATION_REVIEW`; test-group selection remains a
separate required decision after that gap is closed.

```text
SHADOW_GATE_CONFIGURATION_METHOD_PROVEN = YES
SHADOW_GATE_CHANGE_REQUIRES_DEPLOYMENT = YES
SHADOW_GATE_CHANGE_CREATES_NEW_WORKER_VERSION = YES
CONFIRMED_TEST_GROUP_ID_AVAILABLE = NO
TEST_GROUP_SELECTION_REQUIRED = YES
SHADOW_KILL_SWITCH_READY = YES
FULL_WORKER_ROLLBACK_READY = YES_WITH_SOURCE_COMMIT_PROVENANCE_GAP
LIVE_SHADOW_TELEMETRY_QUERY_METHOD_PROVEN = YES
PERSISTENT_LOG_STORAGE_REQUIRED = NO
OBSERVABILITY_READY = NO
SHADOW_BUSINESS_WRITES = 0
SHADOW_FAILURE_QUEUE_RETRY = 0
MIGRATION_REQUIRED = NO
PRODUCTION_D1_SCHEMA_CHANGE = NO
PRODUCTION_QUEUE_CHANGE = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = SHADOW_OBSERVABILITY_IMPLEMENTATION_REVIEW
```

The local gate did not perform a Workers AI request. No source, completion,
credential, or provider prose was persisted.

## Shadow observability implementation review — 2026-08-29 (latest)

This gate added only bounded correlation telemetry. It did not deploy, send
LINE, call Workers AI, add persistent storage, or change V2.2 semantics. The
historical transport failure and all earlier V2.2 outcomes remain preserved.

```text
SHADOW_RUN_START_POINT = src/index.ts:runProductionAmbientExtraction
SHADOW_TERMINAL_POINT = src/ambient-extraction-v2-2-shadow.ts:runAmbientV2_2Shadow
V1_TERMINAL_SUCCESS_POINT = src/ambient.ts:runAmbientDigest:finishRun/onGroupTerminal
V1_TERMINAL_FAILURE_POINT = src/ambient.ts:runAmbientDigest:finishRun failed status
ONE_SHARED_SCOPE_CAN_SEE_BOTH_SHADOW_AND_V1 = YES
CORRELATION_MECHANISM = crypto.randomUUID() after exact allowlist match; reused for bounded phases
OPAQUE_CORRELATION_ID_IMPLEMENTED = YES
CORRELATION_DERIVED_FROM_USER_DATA = NO
NON_SHADOW_GROUP_CORRELATION_CREATED = NO
SHADOW_DISABLED_CORRELATION_CREATED = NO
SHADOW_AND_V1_SAME_RUN_CORRELATION = PASS
DIFFERENT_RUN_CORRELATION_UNIQUENESS = PASS
V1_TERMINAL_COMPLETION_OBSERVABLE = YES
SHADOW_FAILURE_V1_COMPLETION_TEST = PASS
STRUCTURAL_FAILURE_V1_COMPLETION_TEST = PASS
DETERMINISTIC_CORRELATION_TEST = PASS
RELATION_ONLY_CORRELATION_TEST = PASS
AI_REQUIRED_MOCK_CORRELATION_TEST = PASS
LIVE_CORRELATION_QUERY_POSSIBLE = YES
LIVE_OBSERVATION_TRIGGER_MODEL = ordinary buffer selection followed by configured Ambient digest
EARLIEST_SAFE_OBSERVATION_TRIGGER = next configured Ambient digest boundary plus completion drain
MAX_EXPECTED_WAIT = up to 12 hours from arbitrary deployment timing
NEW_PERSISTENT_STORAGE_REQUIRED = NO
PERSISTENT_LOG_STORAGE_REQUIRED = NO
RAW_TEXT_IN_TELEMETRY = NO
ABNORMAL_DETAIL_IN_TELEMETRY = NO
GROUP_ID_IN_TELEMETRY = NO
USER_ID_IN_TELEMETRY = NO
PRODUCTION_BOUNDED_TELEMETRY_CHANGED = YES
PRODUCTION_BUSINESS_LOGIC_CHANGED = NO
PRODUCTION_USER_VISIBLE_BEHAVIOR_CHANGED = NO
PRODUCTION_WRITE_BEHAVIOR_CHANGED = NO
```

The existing `ambient_v2_2_shadow` console event now carries bounded
`phase`, opaque `correlation_id`, and terminal status. Eligible runs emit
`SHADOW_ENTERED`, `SHADOW_TERMINAL`, and then `V1_TERMINAL`; the V1 result and
error propagation remain unchanged. Telemetry emission is best effort and
cannot become a V1 or Queue failure boundary.

```text
TARGETED_OBSERVABILITY_TESTS = PASS (20)
EXISTING_SHADOW_TESTS = PASS
ORDINARY_PRODUCTION_PATH_TEST = PASS
TELEMETRY_PRIVACY_TEST = PASS
SIDE_EFFECT_GUARD_TEST = PASS
V1_GOLDEN_BEHAVIOR_TEST = PASS
V2_2_REGRESSION = PASS
PROVIDER_PARITY_REGRESSION = PASS
FULL_VITEST = PASS (741 passed / 11 skipped)
TYPESCRIPT = PASS
GIT_DIFF_CHECK = PASS
REAL_AI_CALLS = 0
PROVIDER_ATTEMPTS = 0
LINE_SEND = 0
OFFICIAL_WRITE = 0
CANDIDATE_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
STALE_DEV_SMOKE_FINAL_CONCLUSION = CORRECTED
OBSERVABILITY_READY = YES
OBSERVABILITY_CONFIDENCE = HIGH
SHADOW_DEPLOYMENT_REVIEW = PASS_WITH_TEST_GROUP_SELECTION_REQUIRED
TEST_GROUP_SHADOW_DEPLOYED = NO
REAL_LINE_SHADOW_OBSERVED = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = TEST_GROUP_ID_SELECTION
```

The live tail query remains the existing bounded mechanism:
`wrangler tail chicken-line-production --format json --search ambient_v2_2_shadow`.
No persistent log store or new D1 table was introduced.

## Shadow-off Production deployment — 2026-08-29 (latest)

The reviewed Shadow-capable source was deployed once with the canonical
`npm run deploy` command. The Shadow-specific allowlist was absent, so the
selected test group was not activated and all groups remained V1-controlled.
Post-deploy `/health` and `/ready` both returned HTTP 200; no real LINE or
Workers AI stimulus was sent. The deployment changed the Worker version only;
there was no migration, schema change, or business-data side effect.

```text
PRE_DEPLOY_WORKER_VERSION = 8fc4382f-e1e9-4b4b-ad2a-64585ae78c9c
POST_DEPLOY_WORKER_VERSION = fe6e3652-50d4-4945-81b2-eeaabc1d4e59
PRODUCTION_DEPLOY_ATTEMPTS = 1
DEPLOY_RESULT = PASS
SHADOW_CODE_DEPLOYED = YES
SHADOW_EFFECTIVE_STATE = OFF
SHADOW_ALLOWLIST_EFFECTIVE_ENTRY_COUNT = 0
SELECTED_TEST_GROUP_ACTIVATED = NO
ALL_GROUPS_EFFECTIVE_PATH = V1
HEALTH = HTTP_200
READY = HTTP_200_NORMAL
ROUTES_UNCHANGED = YES
D1_BINDING_UNCHANGED = YES
QUEUE_BINDING_UNCHANGED = YES
AI_BINDING_UNCHANGED = YES
CRON_UNCHANGED = YES
LINE_BINDINGS_UNCHANGED = YES
SHADOW_PROVIDER_ATTEMPTS = 0
SHADOW_REAL_AI_CALLS = 0
REAL_LINE_TEST_MESSAGES = 0
LINE_SEND_BY_GATE = 0
MIGRATION = NONE
BUSINESS_DATA_SIDE_EFFECT = NONE
AUTO_ROLLBACK_EXECUTED = NO
SHADOW_OFF_DEPLOYMENT = PASS
TEST_GROUP_SHADOW_DEPLOYED = YES
TEST_GROUP_SHADOW_ACTIVE = NO
REAL_LINE_SHADOW_OBSERVED = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = TEST_GROUP_SHADOW_ACTIVATION_AND_LIVE_OBSERVATION
```

## V2.2 Shadow activation and bounded live observation — 2026-08-29 (latest)

One authorized Production deployment supplied the selected test-group value
through the existing `AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST` Worker runtime
variable. The full LINE group identifier is intentionally omitted. No source,
repository configuration, Prompt, schema, model, Ground Truth, or Git commit
changed. Shadow is active only for the one exact selected group; V1 remains
the user-visible and business-controlling path.

```text
PRE_ACTIVATION_WORKER_VERSION = fe6e3652-50d4-4945-81b2-eeaabc1d4e59
ROLLBACK_TARGET = fe6e3652-50d4-4945-81b2-eeaabc1d4e59
ROLLBACK_TARGET_TYPE = VERIFIED_SHADOW_OFF_VERSION
TEST_GROUP_HUMAN_LABEL = ++開發++金雞協會Ai助手測試頻道++
TEST_GROUP_HUMAN_LABEL_CONFIRMED = YES
TEST_GROUP_HUMAN_LABEL_SOURCE = USER_SCREENSHOT
CONFIRMED_TEST_GROUP_ID_AVAILABLE = YES
TEST_GROUP_COUNT_SELECTED = 1
TEST_GROUP_ID_FULL_VALUE_LOGGED = NO
ALLOWLIST_ENTRY_COUNT = 1
ALLOWLIST_MATCH = EXACT
ALLOWLIST_WILDCARD = NO
SOURCE_CHANGED = NO
CONFIG_SOURCE_CHANGED = NO
PRODUCTION_RUNTIME_CONFIG_CHANGED = YES
ACTIVATION_DEPLOY_ATTEMPTS = 1
ACTIVATION_DEPLOY_RESULT = PASS
ACTIVATED_WORKER_VERSION = 54211f90-c0ec-4f0c-aa3a-cdf5ebc2c836
HEALTH = HTTP_200
READY = HTTP_200_NORMAL
SHADOW_EFFECTIVE_STATE = ON_FOR_ONE_TEST_GROUP
TEST_GROUP_SHADOW_ACTIVE = YES
NON_TEST_GROUP_SHADOW_ACTIVE = NO
NON_TEST_GROUP_EFFECTIVE_PATH = V1
TEST_GROUP_USER_VISIBLE_PATH = V1
ROUTES_UNCHANGED = YES
D1_BINDING_UNCHANGED = YES
QUEUE_BINDING_UNCHANGED = YES
QUEUE_CONSUMER_SETTINGS_UNCHANGED = YES
AI_BINDING_UNCHANGED = YES
LINE_BINDINGS_UNCHANGED = YES
CRON_UNCHANGED = YES
MIGRATION = NONE
D1_SCHEMA_CHANGE = NO
QUEUE_SCHEMA_CHANGE = NO
LIVE_TAIL_STARTED = YES
AMBIENT_DIGEST_BOUNDARY_OBSERVED = NO
ELIGIBLE_TEST_GROUP_UNITS = NOT_OBSERVED
SHADOW_ENTERED = NOT_OBSERVED
SHADOW_TERMINAL_SEEN = NOT_OBSERVED
V1_TERMINAL_SEEN = NOT_OBSERVED
SAME_RUN_CORRELATION = NOT_OBSERVED
AI_REQUIRED = NOT_OBSERVED
AI_ATTEMPTED = NOT_OBSERVED
SHADOW_PROVIDER_ATTEMPTS = 0
SHADOW_AI_RETRIES = 0
STRUCTURAL_STATUS = NOT_OBSERVED
V1_COMPLETED = NOT_OBSERVED
SHADOW_ISOLATION = NOT_OBSERVED
SHADOW_LINE_SEND = 0
SHADOW_CANDIDATE_WRITE = 0
SHADOW_OFFICIAL_OPERATION_WRITE = 0
SHADOW_OFFICIAL_ABNORMAL_WRITE = 0
SHADOW_FINANCE_WRITE = 0
SHADOW_MASTER_DATA_WRITE = 0
SHADOW_CORRECTION_WRITE = 0
SHADOW_QUEUE_BUSINESS_WRITE = 0
SHADOW_BUFFER_CONSUME = 0
SHADOW_FAILURE_QUEUE_RETRY = 0
AUTO_ROLLBACK_EXECUTED = NO
ROLLBACK_RESULT = NOT_RUN
SHADOW_ACTIVATION = PASS
TEST_GROUP_SHADOW_LIVE_OBSERVATION = PENDING_NEXT_AMBIENT_DIGEST
SHADOW_RELEASE_PATH = NOT_PROVEN
READY_FOR_ACTIVE_ROUTE_IMPLEMENTATION_REVIEW = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = RESUME_TEST_GROUP_SHADOW_LIVE_OBSERVATION
```

## Manual 09:00 Shadow live observation — 2026-08-30 (latest)

The user-authorized manual observation reused the existing Wrangler OAuth
session. Non-interactive Wrangler metadata access, Production health/readiness,
and the bounded live-tail connection all passed. The tail started before the
09:00 Asia/Taipei Ambient boundary and was kept until 09:10, then stopped
normally. No user stimulus, deployment, source/config change, AI probe, or
business write occurred.

```text
MANUAL_OBSERVATION_TARGET = 09:00_ASIA_TAIPEI_AMBIENT_DIGEST
HUMAN_PERMISSION_AVAILABLE = YES
WRANGLER_EXISTING_AUTH = PASS
HOST_NETWORK_ACCESS = PASS
LIVE_TAIL_CONNECTION_PREFLIGHT = PASS
CURRENT_PRODUCTION_VERSION = 54211f90-c0ec-4f0c-aa3a-cdf5ebc2c836
EXPECTED_PRODUCTION_VERSION = 54211f90-c0ec-4f0c-aa3a-cdf5ebc2c836
PRODUCTION_BASELINE_DRIFT = NO
HEALTH = HTTP_200
READY = HTTP_200_NORMAL
TEST_GROUP_SHADOW_ACTIVE = YES
NON_TEST_GROUP_SHADOW_ACTIVE = NO
LIVE_TAIL_STARTED = YES
TAIL_STARTED_BEFORE_09_00 = YES
LIVE_TAIL_STOPPED = YES
OBSERVATION_WINDOW = 08:55-09:10_ASIA_TAIPEI
DIGEST_EXECUTION_CONFIRMED = NO
ELIGIBLE_TEST_GROUP_UNITS = UNKNOWN
SHADOW_ENTERED = NOT_OBSERVED
SHADOW_TERMINAL_SEEN = NOT_OBSERVED
V1_TERMINAL_SEEN = NOT_OBSERVED
SAME_RUN_CORRELATION = NOT_OBSERVED
AI_REQUIRED = NOT_OBSERVED
AI_ATTEMPTED = NOT_OBSERVED
SHADOW_PROVIDER_CALLS = 0
SHADOW_AI_RETRIES = 0
STRUCTURAL_STATUS = NOT_OBSERVED
V1_COMPLETED = NOT_OBSERVED
SHADOW_ISOLATION = NOT_OBSERVED
SHADOW_BUSINESS_WRITES = 0
SHADOW_LINE_SEND = 0
SHADOW_CANDIDATE_WRITE = 0
SHADOW_OFFICIAL_OPERATION_WRITE = 0
SHADOW_OFFICIAL_ABNORMAL_WRITE = 0
SHADOW_FINANCE_WRITE = 0
SHADOW_MASTER_DATA_WRITE = 0
SHADOW_CORRECTION_WRITE = 0
SHADOW_QUEUE_BUSINESS_WRITE = 0
SHADOW_BUFFER_CONSUME = 0
SHADOW_FAILURE_QUEUE_RETRY = 0
SOURCE_CHANGED = NO
CONFIG_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
AUTO_ROLLBACK_EXECUTED = NO
TEST_GROUP_SHADOW_LIVE_OBSERVATION = INCONCLUSIVE_DIGEST_NOT_OBSERVED
SHADOW_RELEASE_PATH = NOT_PROVEN
READY_FOR_ACTIVE_ROUTE_IMPLEMENTATION_REVIEW = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = AMBIENT_DIGEST_EXECUTION_OBSERVATION_REVIEW
```

No matching `ambient_v2_2_shadow` event appeared during the bounded window,
and the filtered stream did not provide source-backed proof of the digest
execution. This remains an observation-evidence gap, not a conclusion that
the digest, Shadow, or V1 path failed. The prior 06:00 result remains intact.

The short bounded `wrangler tail` window started and stopped normally but
observed no matching Shadow event. The next Ambient digest boundary had not
occurred, so this is pending observation rather than a live PASS or failure.
No second deployment, LINE stimulus, Workers AI inference, or business write
was performed.

## V2.2 test-group Shadow 06:00 live observation — 2026-08-30 (latest)

The one-shot automation began at 05:55:36 Asia/Taipei, before the intended
06:00 Ambient boundary, and retained a bounded drain through 06:03:23. Live
Cloudflare evidence was unavailable in the automation environment: Wrangler
could not use the existing OAuth session, host DNS was blocked, and browser
access to Cloudflare and the public Worker endpoint was denied. An interactive
Wrangler metadata check automatically opened an OAuth flow but failed before
the callback could start; no login completed and no token inspection occurred.
No alternate authentication, credential access, or permission bypass was used.

```text
AUTOMATION_TARGET = 06:00_ASIA_TAIPEI_AMBIENT_DIGEST
AUTOMATION_STARTED_BEFORE_TARGET = YES
CURRENT_PRODUCTION_VERSION = UNKNOWN_CURRENT
LAST_VERIFIED_PRODUCTION_VERSION = 54211f90-c0ec-4f0c-aa3a-cdf5ebc2c836
EXPECTED_PRODUCTION_VERSION = 54211f90-c0ec-4f0c-aa3a-cdf5ebc2c836
PRODUCTION_BASELINE_DRIFT = UNKNOWN
TEST_GROUP_HUMAN_LABEL = ++開發++金雞協會Ai助手測試頻道++
TEST_GROUP_ID_FULL_VALUE_LOGGED = NO
TEST_GROUP_SHADOW_ACTIVE = UNKNOWN_CURRENT (LAST_VERIFIED=YES)
NON_TEST_GROUP_SHADOW_ACTIVE = UNKNOWN_CURRENT (LAST_VERIFIED=NO)
HEALTH = NOT_OBSERVED
READY = NOT_OBSERVED
LIVE_TAIL_STARTED = NO
TAIL_STARTED_BEFORE_06_00 = NO
AMBIENT_DIGEST_BOUNDARY_OBSERVED = YES
DIGEST_EXECUTION_CONFIRMED = NO
ELIGIBLE_TEST_GROUP_UNITS = UNKNOWN
SHADOW_ENTERED = NOT_OBSERVED
SHADOW_TERMINAL_SEEN = NOT_OBSERVED
V1_TERMINAL_SEEN = NOT_OBSERVED
SAME_RUN_CORRELATION = NOT_OBSERVED
ROUTE_CLASS = NOT_OBSERVED
AI_REQUIRED = NOT_OBSERVED
AI_ATTEMPTED = NOT_OBSERVED
SHADOW_PROVIDER_CALLS = UNKNOWN
SHADOW_AI_RETRIES = 0_CONFIGURED; ACTUAL_NOT_OBSERVED
STRUCTURAL_STATUS = NOT_OBSERVED
V1_COMPLETED = NOT_OBSERVED
SHADOW_ISOLATION = NOT_OBSERVED
SHADOW_LINE_SEND = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_CANDIDATE_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_OFFICIAL_OPERATION_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_OFFICIAL_ABNORMAL_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_FINANCE_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_MASTER_DATA_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_CORRECTION_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_QUEUE_BUSINESS_WRITE = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_BUFFER_CONSUME = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SHADOW_FAILURE_QUEUE_RETRY = UNKNOWN_LIVE_RUN; AUTOMATION_ACTION=0
SOURCE_CHANGED = NO
CONFIG_CHANGED = NO
GIT_COMMIT_CREATED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
AUTO_ROLLBACK_EXECUTED = NO
ROLLBACK_RESULT = NOT_RUN
TEST_GROUP_SHADOW_LIVE_OBSERVATION = INCONCLUSIVE_DIGEST_NOT_OBSERVED
SHADOW_RELEASE_PATH = NOT_PROVEN
READY_FOR_ACTIVE_ROUTE_IMPLEMENTATION_REVIEW = NO
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = AMBIENT_DIGEST_EXECUTION_OBSERVATION_REVIEW
```

The wall-clock boundary alone is not evidence that the Ambient digest ran, so
this result is not `INCONCLUSIVE_NO_ELIGIBLE_TRAFFIC` and is neither a Shadow
PASS nor a functional failure. No observation-initiated LINE traffic, provider
probe, business write, deployment, or rollback occurred. Actual live-run write
counters remain unknown because the digest itself was not observed.
