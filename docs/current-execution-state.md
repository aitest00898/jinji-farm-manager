# Current Execution State

> TRANSIENT DOCUMENT — NOT ARCHITECTURE SOURCE OF TRUTH

Last reviewed: 2026-08-28 20:24 (Asia/Taipei)

This file records the latest evidence-backed execution state. It is separate
from the non-executing target architecture and must not be read as permission
to continue a paused gate.

## Current status

### DONE

- Wrangler OAuth exposure response is complete: the previously exposed OAuth
  credential was invalidated, the two confirmed persistent Wrangler logs were
  removed, Wrangler was reauthenticated with keyring-backed storage, and the
  developer REST auth bridge was changed to keep credential handling in memory.
  See `forensics/wrangler-oauth-credential-exposure-forensic-2026-08-27.md`.
- Ambient Extraction V2 exists as a developer-only additive path. It is not
  imported by the Production Worker path.
- V2 frozen Ground Truth is version `1.0.1`: DEV-SMOKE-8 expects six semantic
  events and one relation; case-level expectations were not changed by the
  aggregate correction; Fresh Unseen contains 13 frozen cases.
- Local V2 fixture, routing, structural diagnostics, evaluator, REST adapter,
  runner reliability, and side-effect tests have passed in the recorded
  reports. The latest completed local full-Vitest evidence is recorded in the
  corresponding V2 reports.
- Relation-only routing conformance is locally fixed and tested: the frozen
  D06-shaped message routes to local relation resolution and does not require
  a main event-extraction AI call. The current DEV-SMOKE-8 plan is three AI
  extraction calls per complete run (D03, D04, D07); the historical RUN-1
  plan used four calls and remains historical evidence.
- The developer-only structured-output execution wiring is integrated into the
  V2 normal path: the shared structured request builder and object/text
  response boundary are selected by the explicit V2 structured execution mode.
  Bounded per-event semantic telemetry is available without persisting detail
  values. TypeScript and the full local Vitest gate passed.
- The human-restored Wrangler OAuth session was safely revalidated: `whoami`
  succeeded, keyring-backed encrypted storage was reported, and the
  memory-only developer REST auth bridge returned an available status. No
  credential value was printed or persisted.
- The resumed structured-output capability gate completed its one allowed model
  schema query and one D03 inference. The model schema query returned bounded
  support evidence; D03 reached HTTP 200, provider confirmation, an object
  response, and V2 structural validation. Semantic evaluation observed two
  `abnormal`/null-quantity events instead of the frozen single D03 event; no
  raw detail or completion was retained.
- The wrapper false-negative policy was exercised after authentication was
  restored: one D04 structured Direct REST call reached HTTP 200 with provider
  confirmation, a complete durable terminal record, zero orphan attempts, and
  normal process exit. A missing human-readable marker was correctly treated
  as non-fatal. No raw provider content was retained.
- The single D04 semantic gate reached the V2.1 structural boundary, but the
  bounded result had one event item rather than the two frozen expected events
  and failed validation at the `detail` field with
  `EVENT_DETAIL_NOT_ALLOWED`. The D04 acceptance result is `FAIL`; the frozen
  Ground Truth and prior historical results remain unchanged.
- The follow-up V2.1 event-fusion diagnostic added exactly one general
  multi-event canonical example to the developer-only prompt. The prompt
  fingerprint changed from `fnv1a32-3316f7ac` to
  `fnv1a32-bf751097`; the canonical example count is now two and no
  D04-specific example or old contract marker was added.
- After the local gate passed (`638 passed / 7 skipped`), exactly one D04
  structured call was executed. It reached HTTP 200, provider confirmation,
  structural PASS, and wrapper PASS with a complete durable ledger, but still
  produced one event item. The first bounded validation failure remained
  `EVENT_DETAIL_NOT_ALLOWED`; the D04 event-fusion gate is FAIL and the
  frozen Ground Truth was not changed.

### ACTIVE

- Production remains on the historical Ambient batch/`decisions[]` contract,
  Candidate/Reconcile/Buffer lifecycle, existing Queue, Cron, Daily Review,
  Web, Fast Path, correction, finance, and master-data architecture.
- V2 remains an active development path only. Its strict `events[]` contract,
  message-level boundary, context separation, relation routing, and evaluator
  are available for controlled future work. Structured output is now
  developer-integrated only; Production V1 remains unchanged.
- The user-frozen model policy remains active for Production and general
  development: `@cf/meta/llama-3.2-3b-instruct`. A separately authorized,
  bounded D04 cross-model screening was completed on 2026-08-28; one candidate
  reached semantic evaluation, no candidate passed D04, and no candidate model
  was selected or deployed.

### PAUSED / BLOCKED BY GATE

- Ambient V2 semantic acceptance remains paused after the explicitly authorized
  D04 cross-model screening. No further real-model call, Dev Rerun, Full Flow,
  human LINE acceptance, or Fresh Unseen run is authorized by this turn.
- The historical V2 real smoke RUN-1 remains `FAIL`: four provider responses
  reached HTTP 200 but failed the former structural boundary; it is not model
  semantic-capability evidence. After relation-only routing was corrected, the
  one D03 diagnostic call reached HTTP 200 but was `INVALID_JSON`; semantic
  evaluation was not reached. These results are not rewritten.
- V2 Production activation, Production semantic changes, migration, and
  deployment remain unauthorized.
- The prior auth/tooling block is resolved. The current D04 structured result
  for the historical Llama comparator is semantic, not transport,
  structured-boundary, or wrapper evidence:
  structural validation passed, but the bounded event count was one and the
  first validator failure was `EVENT_DETAIL_NOT_ALLOWED`. This result does not
  authorize a Prompt, model, schema, heuristic, or Ground Truth change.
- The latest event-fusion result is also paused: one general multi-event
  example did not produce the frozen two-event D04 result. The bounded class
  is `MULTI_EVENT_BOUNDARY`; no dedupe or attribution heuristic was added, and
  no further provider call is authorized by this gate.

### NEXT — only after a separate explicit gate

1. Analyze the bounded cross-model D04 results without another provider call in
   this gate; keep the frozen Ground Truth, Prompt, and V2.1 contract unchanged.
2. Treat the Qwen3-30B-A3B-FP8 result as one semantic screening observation,
   not as model validation, replacement approval, or Production evidence.
3. Consider any next semantic diagnostic, architecture decision, D07, Full V2
   Smoke, Fresh Unseen, or Production action only under a separate explicit gate.

## Evidence boundary

Reviewed for this snapshot:

- `forensics/ambient-extraction-v2-ground-truth-2026-08-27.json`
- `forensics/ambient-extraction-v2-real-smoke-2026-08-27.md`
- `forensics/ambient-extraction-v2-structural-boundary-forensic-2026-08-27.md`
- `forensics/ambient-extraction-v2-relation-routing-and-d03-diagnostic-2026-08-27.md`
- `forensics/ambient-real-model-schema-micro-diagnostic-2026-08-27.md`
- `forensics/ambient-kind-contract-fix-2026-08-27.md`
- `forensics/wrangler-oauth-credential-exposure-forensic-2026-08-27.md`
- current V2 source/tests, `src/ambient.ts`, `src/index.ts`, `src/reliability.ts`,
  `src/daily-review.ts`, `src/farm-resolver.ts`, `wrangler.jsonc`, and existing
  architecture/reliability documents.

## Deferred evidence items

These remain recorded as pending and were not changed here:

- `SCHEDULED_AMBIENT_FAILURE_VISIBILITY_GAP = CONFIRMED`
- `DAILY_REVIEW_DETAIL_ROUTE_FUNCTIONALLY_REDUNDANT = CONFIRMED`
- `DEV_FULL_FLOW = PENDING`
- `PREFILTER_FALSE_NEGATIVE_RISK = PENDING`
- `REAL_GROUP_OPERATION_STRESS = PENDING`
- `LINE_CARETAKER_MASTER_FLOW = INCOMPLETE`
- `REAL_WEB_FINAL_REVIEW = PENDING`
- `OPERATIONAL_TEST_DATA_SCOPE_REVIEW = PENDING`
- `REAL_02 = PENDING`

## Latest event-fusion gate update

The latest developer-only V2.1 attempt is recorded in
`forensics/ambient-extraction-v2-1-d04-event-fusion-fix-2026-08-28.md`.
The general multi-event prompt example is the only change in that attempt.
The one real D04 call reached the structured boundary but observed one event
item, so the multi-event canonical fix is `FAIL` with
`FAILURE_CLASS = MULTI_EVENT_BOUNDARY`. The result is insufficient to judge
cross-event quantity attribution and did not authorize another prompt patch,
model comparison, D07, full V2 smoke, Fresh Unseen, or Production flow at that
stage. The later separately authorized screening is recorded below.

## This turn's safety boundary

```text
WORKERS_AI_CALLS = 3
REAL_AI_CALLS = 3
PRODUCTION_D1_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE

PRODUCTION_FUNCTIONAL_CODE_CHANGED = NO
DEVELOPER_ONLY_V2_TOOLING_CHANGED = YES
D03_STRUCTURED_DIAGNOSTIC = COMPLETED_SEMANTIC_FAIL
D04_STRUCTURED_SEMANTIC_GATE = COMPLETED_SEMANTIC_FAIL
D04_EVENT_FUSION_FIX = COMPLETED_MULTI_EVENT_BOUNDARY_FAIL
```

## D04 cross-model screening — 2026-08-28

This separately authorized developer-only screening used the exact candidate
order `@cf/qwen/qwen3.8-27b`, `@cf/zai-org/glm-4.7-flash`, then
`@cf/qwen/qwen3-30b-a3b-fp8`. The previous bounded catalog/schema evidence was
reused, and the current official Workers AI Free-plan policy was sufficient for
one controlled attempt per candidate; no hidden entitlement API was queried.
The three calls were serial, one per candidate, with no retry.

Bounded report:
`forensics/ambient-extraction-v2-1-d04-cross-model-screening-2026-08-28.md`

Results:

- `@cf/qwen/qwen3.8-27b`: HTTP 200/provider confirmed, structural failure;
  semantic evidence unavailable; bounded subtype `UNKNOWN`.
- `@cf/zai-org/glm-4.7-flash`: HTTP 200/provider confirmed, structural failure;
  semantic evidence unavailable; bounded subtype `UNKNOWN`.
- `@cf/qwen/qwen3-30b-a3b-fp8`: HTTP 200/provider confirmed, structural PASS;
  semantic evidence available, but D04 observed one event instead of two;
  result `MULTI_EVENT_BOUNDARY`.

```text
SCREENING_REAL_AI_CALLS = 3
SCREENING_MAX_CONCURRENT_AI_CALLS = 1
SCREENING_RETRIES = 0
SEMANTICALLY_EVALUATED_MODEL_COUNT = 1
NON_SEMANTICALLY_EVALUATED_MODEL_COUNT = 2
SCREENING_D07_OR_FULL_SMOKE = NOT_RUN
SCREENING_PRODUCTION_DEPLOYMENT = NOT_DONE
```

Only Qwen3-30B-A3B-FP8 entered the semantic ranking; no candidate passed D04,
no replacement was selected, and the historical Llama D04 result was not
rewritten. This screening does not authorize D07, Full V2 Smoke, Fresh Unseen,
human LINE acceptance, Production activation, or deployment.

These values describe the resumed cross-model screening turn; they are not a
claim that the entire historical project has never performed those actions.
All three screening calls were developer-only and used no Production side
effects.

## V2.2 orthogonal fact prototype — 2026-08-28

The developer-only V2.2 local prototype is complete. A new frozen Ground Truth
version `2.2.0` separates operation facts from abnormality facts; the prior V2
Ground Truth remains unchanged. The V2.2 wire requires top-level
`operations` and `abnormalities` arrays, keeps positive-or-null quantities,
requires abnormality detail, and does not propagate an operation quantity to an
abnormality.

Local evidence passed: strict structural validation, semantic partial-success
boundary, Unicode detail validation, D02/D03/D04/D05/D06/D07 fixture coverage,
FRESH-13 mixed routing, local relation/context/idempotency checks, and the
existing regression suite. Full Vitest completed with `671 passed / 8 skipped`.
No Workers AI call or Production side effect occurred. V2.2 is not imported by
the Production entrypoint.

The V2.2 D04 local fact extraction result is PASS for cull quantity 2 and
abnormal detail with unknown quantity; cross-fact quantity attribution remains
`UNRESOLVED` by design. The next possible gate is one explicitly authorized
real V2.2 D04 fact-extraction call. Full V2 smoke, Fresh Unseen, model
replacement, human LINE acceptance, Dev Full Flow, and Production activation
remain not authorized.

## Wrangler auth root-cause forensic — 2026-08-28

The read-only forensic in
`forensics/wrangler-auth-fast-expiry-root-cause-2026-08-28.md` supersedes the
previously broad “OAuth expired” wording as the current diagnosis. Two bounded
probe rounds were stable: project-local `wrangler whoami` did not produce an
authenticated state, memory-only `wrangler auth token` retrieval failed, and
the parent and sanitized child auth-discovery paths had matching unavailable
results. Wrangler keyring preference was enabled and the encrypted default
store existed, but the corresponding macOS Keychain metadata item was not
found; no credential value was read.

Therefore the current evidence-backed state is:

```text
AUTH_RETRIEVAL_FAILURE_CONFIRMED = YES
OAUTH_EXPIRED_CONFIRMED = NO
AUTH_STATE_NOW = INVALID
AUTH_ROOT_CAUSE = ACTUALLY_LOGGED_OUT_OR_STORE_MISSING
HUMAN_LOGIN_REQUIRED = YES
AUTH_CODE_CHANGED = NO
REAL_D04_THIS_ROUND = NOT_RUN
WORKERS_AI_CALLS = 0
PROVIDER_REQUESTS = 0
```

No login, logout, auth-code fix, provider request, Production write, or
deployment was performed in this forensic gate. The earlier V2.2 real-D04
`NOT_RUN_AUTH_BLOCKED` result remains historical and is not rewritten.

## V2.2 fact/attribution boundary correction — 2026-08-28

The V2.2 local evaluator now separates abnormality fact identity from
cross-fact quantity attribution. Operation identity includes its own type and
quantity; abnormality identity uses detail and multiplicity, while abnormality
quantity is an optional separate attribution comparison. The two V2.2 prompt
alignment rules were added without examples or D04-specific wording.

Local tests cover null, correct, and incorrect abnormality attribution without
copying quantities, plus missing/wrong abnormality facts and repeated
abnormalities. TypeScript and the V2.2 targeted suite pass. No Workers AI call,
Production write, migration, or deployment occurred. The next possible gate
remains one explicitly authorized real V2.2 D04 fact-extraction call; no model
replacement or full smoke is authorized by this state update.

## V2.2 real D04 fact gate — 2026-08-28

The developer-only V2.2 one-call runner and bounded ledger projection were
added without changing the Prompt, V2.2 wire schema, model settings, or
Production path. The local gate passed: the V2.2/runner suite completed with
`37 passed / 1 skipped`, the combined targeted regression with `125 passed / 3
skipped`, and full Vitest with `680 passed / 9 skipped`. Mock evidence confirms
that D04 fact extraction and cross-fact quantity attribution are separate
results.

The authorized real D04 attempt did not reach the provider. The safe Wrangler
check reported that the OAuth token had expired in the non-interactive
environment; the memory-only auth bridge was unavailable and account ID
discovery stopped the wrapper before child execution. Therefore:

```text
V2_2_REAL_D04_PROVIDER_REQUEST = NOT_SENT
V2_2_REAL_D04_AI_CALLS = 0
V2_2_REAL_D04_RESULT = NOT_RUN_AUTH_BLOCKED
```

There is no real-model semantic or attribution evidence from this gate, and no
retry was performed. The bounded report is
`forensics/ambient-extraction-v2-2-real-d04-fact-gate-2026-08-28.md`. The next
single gate requires safe keyring-backed Wrangler reauthentication; D04 is not
automatically retried, and D07/full smoke/Fresh Unseen/model comparison/
Production activation remain unauthorized.

## Developer auth durability fix — 2026-08-28

The repeated-login issue was addressed in developer-only evaluation tooling.
The previous evidence showed an unusable Wrangler OAuth/keyring state, but did
not prove natural OAuth expiry. The real-runner auth path now prefers a
dedicated macOS Keychain API-token item, keeps its value in process memory, and
never passes it through a child environment or writes it to a ledger/report.
Wrangler OAuth is retained only as a captured-in-memory compatibility fallback.

When no explicit account id is available, the wrapper uses a bounded
authenticated account lookup rather than requiring Wrangler `whoami`. Account
ambiguity and missing auth fail closed; there is no automatic login, logout,
rotation, or retry.

The developer-only stdin provisioning helper is
`scripts/store-ambient-semantic-eval-keychain.swift`; its safe procedure is in
`docs/developer-auth.md`. At the time this entry was recorded, a one-time user
action was still required to place a least-privilege API token in that
dedicated Keychain item. That historical state is superseded by the
provisioning update below.

```text
AUTH_DURABILITY_FIX = IMPLEMENTED_PENDING_KEYCHAIN_PROVISIONING
CHILD_CREDENTIAL_ENV_INJECTION = REMOVED
WORKERS_AI_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Dedicated Workers AI API token provisioned — 2026-08-28

The user-created Cloudflare API Token was provisioned through the Cloudflare
dashboard using the Workers AI template. Its scope is limited to the current
Cloudflare account with Workers AI Read and Edit permissions. The TTL was
configured from August 28, 2026 through November 26, 2026 (90 days using
Cloudflare's UTC date-boundary semantics).

The one-time secret was transferred only in process memory through a temporary
FIFO to the compiled developer-only Keychain helper and stored under the
dedicated service/account defined by `docs/developer-auth.md`. The token value,
hash, clipboard contents, and authorization header were not written to the
repository, reports, ledger, environment, command arguments, or Codex output.
The temporary FIFO and helper binary were removed. A metadata-only Keychain
check confirmed the dedicated item exists.

```text
AUTH_DURABILITY_FIX = PROVISIONED
DEDICATED_KEYCHAIN_ITEM = PRESENT
WORKERS_AI_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Dedicated Workers AI Keychain auth validation gate — 2026-08-28

The read-only validation of the new developer auth path confirmed the
dedicated Keychain item is present and that the current auth bridge retrieved
the credential into process memory from the dedicated Keychain source. The
credential was not printed, persisted, or passed through a child environment;
the Wrangler OAuth fallback was not used.

The bounded authenticated account lookup did not resolve one usable account
(`ACCOUNT_NOT_FOUND`), so the dedicated auth gate failed closed before any
Workers AI request. No login, token creation, rotation, D04 run, Production
write, or deployment occurred. Local auth/wrapper and full Vitest checks
remained green (`682 passed / 9 skipped`).

```text
DEDICATED_KEYCHAIN_ITEM = PRESENT
DEDICATED_AUTH_RETRIEVAL = PASS
AUTH_SOURCE = DEDICATED_KEYCHAIN
ACCOUNT_LOOKUP = FAIL
ACCOUNT_COUNT_CLASS = ZERO
EXPECTED_ACCOUNT_RESOLVED = NO
CHILD_ENV_CONTAINS_CREDENTIAL = NO
OAUTH_FALLBACK_USED = NO
DEDICATED_AUTH_GATE = FAIL
WORKERS_AI_CALLS = 0
PROVIDER_REQUESTS = 0
REAL_D04 = NOT_RUN
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The bounded report is
`forensics/dedicated-workers-ai-keychain-auth-validation-2026-08-28.md`.

## Developer Account ID resolution repair — 2026-08-28

The prior dedicated-auth validation correctly proved that the Keychain token
was available, but its `/accounts` enumeration returned an empty result and
the resolver stopped with `ACCOUNT_NOT_FOUND`. This did not prove that the
Cloudflare account was absent. The current non-secret account identifier was
confirmed from the signed-in Cloudflare dashboard and is now stored separately
for the developer-only harness in
`config/ambient-semantic-eval-account.json`.

The shared TypeScript/JavaScript auth bridges now resolve account identity from
explicit environment configuration, then the developer-only account config,
then the bounded account list fallback. The Keychain credential remains
memory-only and is never placed in the child environment, ledger, report, or
terminal output. The LINE account id and D1 database id remain separate and
are not used as Cloudflare account identity.

The repair was locally verified with TypeScript and full Vitest (`683 passed /
9 skipped`). A live, account-scoped model-schema request returned HTTP 200 with
Cloudflare success, confirming that the configured account id and Keychain
credential work together. This request was not inference; Workers AI
inference calls remain zero.

```text
ACCOUNT_RESOLUTION_REPAIR = PASS
KEYCHAIN_AUTH = PASS
ACCOUNT_RESOLUTION = PASS
ACCOUNT_RESOLUTION_SOURCE = DEVELOPER_CONFIG
ACCOUNT_SCOPED_MODEL_SCHEMA = PASS
WORKERS_AI_INFERENCE_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The historical account-resolution failure remains unchanged. This repair
removes only that blocker; the next V2.2/D04 or other real-model gate still
requires a separate explicit authorization.

## Final local authentication persistence verification — 2026-08-28

After the user completed the Wrangler and GitHub web authorizations, each
credential path was verified from fresh child processes. Wrangler was started
with `--use-keyring`; a new `wrangler whoami --json` process returned an
authenticated state. GitHub CLI authentication status and a fresh `gh api
user` request both succeeded, and the GitHub hosts configuration contained no
plaintext OAuth token field; the system keyring path was detected.

The developer Cloudflare REST bridge independently retrieved the dedicated
Keychain item in memory and resolved the configured account. The Keychain item
metadata check succeeded. No credential value was printed, persisted, passed
through a child environment, or written to this document. No Workers AI
inference or Production operation was performed.

```text
WRANGLER_OAUTH = PASS
WRANGLER_STORAGE = KEYRING_BACKED
GITHUB_CLI = PASS
GITHUB_STORAGE = KEYRING_BACKED
CLOUDFLARE_DEVELOPER_REST = PASS
CLOUDFLARE_DEVELOPER_KEYCHAIN_ITEM = PRESENT
KNOWN_LOCAL_AUTH_BLOCKERS = NONE
WORKERS_AI_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

This proves persistence across independent local invocations, not immunity
from future external revocation, account policy changes, or deliberate
credential expiry. The earlier authentication blocker records remain
historical evidence and are not rewritten.

## V2.2 real D04 fact gate resumed — 2026-08-28

The dedicated Keychain API-token path and explicit developer account
configuration were verified again, so the previously unused single V2.2 D04
attempt was executed once. The provider returned HTTP 200 with a confirmed
structured object. V2.2 extracted one operation fact and one abnormality fact;
both fact checks passed and the separately evaluated quantity attribution also
passed. The historical auth-blocked attempt remains unchanged.

```text
AUTH_SOURCE = DEDICATED_KEYCHAIN
DEDICATED_AUTH_RETRIEVAL = PASS
ACCOUNT_RESOLUTION = PASS
V2_2_REAL_D04_PROVIDER_REQUEST = SENT
V2_2_REAL_D04_AI_CALLS = 1
D04_HTTP = 200
D04_STRUCTURAL_STATUS = PASS
D04_OPERATION_ITEM_COUNT = 1
D04_ABNORMALITY_ITEM_COUNT = 1
D04_TOTAL_FACT_COUNT = 2
D04_FACT_EXTRACTION = PASS
D04_QUANTITY_ATTRIBUTION = PASS
ATTEMPT_START_COUNT = 1
ATTEMPT_TERMINAL_COUNT = 1
ORPHAN_ATTEMPTS = 0
```

This is one controlled developer-only observation, not Production, model, or
architecture validation. The V2.2 repeated mini-suite remains the next
separately authorized gate; D03, D07, Full V2 Smoke, Fresh Unseen, human LINE
acceptance, Production activation, and deployment remain unexecuted.

```text
WORKERS_AI_CALLS = 1
PRODUCTION_D1_WRITE = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## V2.2 repeated mini-suite — 2026-08-28

The fixed developer-only V2.2 mini-suite completed its authorized matrix in
serial order D03, D04, D07 repeated for three rounds. The dedicated Keychain
API-token source and developer account configuration passed before the child
runner started. No Wrangler fallback, retry, Prompt change, schema change,
model change, or Production path was used.

```text
AUTH_SOURCE = DEDICATED_KEYCHAIN
ACCOUNT_RESOLUTION = PASS
WIRE_CONTRACT_VERSION = 2.2
MODEL = @cf/meta/llama-3.2-3b-instruct
REAL_AI_CALL_LIMIT = 9
REAL_AI_CALLS = 9
RETRIES = 0
MAX_CONCURRENT_AI_CALLS = 1
HTTP_200_COUNT = 9
STRUCTURAL_PASS_COUNT = 9
FACT_EXTRACTION_PASS_COUNT = 6
FACT_EXTRACTION_FAIL_COUNT = 3
TECHNICAL_FAILURE_COUNT = 0
EXTRA_FACT_CONTAMINATION_COUNT = 0
ATTEMPT_START_COUNT = 9
ATTEMPT_TERMINAL_COUNT = 9
ORPHAN_ATTEMPTS = 0
```

D03 fact extraction passed 3/3. D04 fact extraction passed 3/3 and its
separate quantity-attribution check passed 3/3. D07 was structurally valid
3/3 but fact extraction failed 3/3: the bounded collection counts were zero
operation facts and one abnormality fact against the frozen one-mortality
operation expectation. No raw source, completion, actual detail, Prompt, or
credential was persisted.

The strict repeated mini-suite result is `FAIL_STABILITY`; the orthogonal
fact representation is not considered repeatable across this fixed case set.
The historical V2/V2.1/V2.2 results remain unchanged. Full V2.2 smoke, Fresh
Unseen, model replacement, Production activation, and deployment are not
authorized by this gate.

The bounded report is
`forensics/ambient-extraction-v2-2-repeated-mini-suite-2026-08-28.md`.

```text
V2_2_REPEATED_MINI_SUITE = FAIL_STABILITY
D03_FACT_PASS_COUNT = 3
D04_FACT_PASS_COUNT = 3
D04_ATTRIBUTION_PASS_COUNT = 3
D07_FACT_PASS_COUNT = 0
D07_FAILURE_LAYER = FACT_OPERATION
READY_FOR_FULL_V2_2_DEV_SMOKE = NO
READY_FOR_QUANTITY_ATTRIBUTION_DESIGN = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_MODEL_REPLACEMENT = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## V2.2 D07 ontology convergence gate — 2026-08-28

The authorized V2.2 convergence change was limited to one generic developer
prompt ontology-alignment block. The model, wire contract, evaluator,
deterministic parser, relation flow, and Production path were not changed.
Local TypeScript, targeted tests, and full Vitest passed.

Three serial real D07 calls were completed with the dedicated Keychain auth
path. All three were HTTP 200, provider-confirmed, structurally valid, and
free of technical failure. The expected operation fact was present in every
attempt, but every attempt also contained one extra abnormality fact. This
means the bounded ontology substitution metric was zero while the extra-fact
metric was three.

```text
V2_2_D07_ONTOLOGY_FIX = FAIL
D07_REAL_RUNS = 3
D07_PROVIDER_CALLS = 3
D07_STRUCTURAL_PASS_COUNT = 3
D07_FACT_PASS_COUNT = 0
D07_OPERATION_FACT_COUNT_PER_RUN = 1
D07_ABNORMALITY_FACT_COUNT_PER_RUN = 1
D07_WRONG_COLLECTION_FACT_COUNT = 0
D07_FACT_COLLECTION_SUBSTITUTION_COUNT = 0
D07_EXTRA_FACT_COUNT = 3
D07_TECHNICAL_FAILURE_COUNT = 0
D07_MINIMAL_ONTOLOGY_FIX_EXHAUSTED = YES
DEV_SMOKE_8 = NOT_RUN
TOTAL_REAL_AI_CALLS = 3
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
READY_FOR_FULL_V2_2_DEV_SMOKE = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The historical V2.2 repeated mini-suite and all earlier failures remain
unchanged. No further real call, prompt patch, model comparison, D04/D07
rerun, Fresh Unseen test, or Production action was authorized by this gate.

## V2.2 clause-level deterministic convergence — 2026-08-28 (latest)

The V2.2 developer-only clause-level deterministic claiming implementation
and its four read-only post-change audits passed. The implementation reuses
the existing Quick Record parser; D07 is now proven locally as one
deterministic mortality fact with zero provider calls. D06 remains
relation-only, D04 keeps a deterministic cull plus an AI residual, and the
current DEV-SMOKE-8 provider plan is two serial residual calls.

The single authorized DEV-SMOKE-8 ran with dedicated Keychain auth, serial
execution, and retry count zero. It made two provider calls. Both were HTTP
200, provider-confirmed structured objects with structural pass. D04
residual fact extraction passed. D03 was the first failed case at bounded
fact extraction: one actual abnormality fact was present, but its bounded
abnormality identity comparison failed. The actual detail value was not
persisted. The overall smoke remains FAIL; no retry or additional provider
call was made.

```text
CLAUSE_LEVEL_DETERMINISTIC_CLAIMING = PASS (local D07 scope)
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION = PASS
D04_FACT_EXTRACTION = PASS
D06_RELATION_ONLY = PASS
CURRENT_V2_2_EXPECTED_PROVIDER_CALLS_PER_RUN = 2
DEV_SMOKE_8 = FAIL
DEV_SMOKE_PROVIDER_CALLS = 2
DEV_SMOKE_FAILED_CASE = D03
DEV_SMOKE_FAILURE_LAYER = FACT_EXTRACTION
STRUCTURED_BOUNDARY_FAILURE = NO
PROVIDER_TRANSPORT_FAILURE = NO
PROMPT_CHANGED = NO
SCHEMA_CHANGED = NO
MODEL_CHANGED = NO
REAL_AI_RETRY = 0
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
READY_FOR_FRESH_UNSEEN = NO
```

Current blocker: D03 frozen semantic/fact extraction mismatch. The next
authorized step is a separate semantic decision; do not infer or rewrite the
missing detail, add another Prompt patch, rerun D03/D04/D07, run Fresh Unseen,
or activate Production from this result.

## V2.2 D03 request-equivalence gate — 2026-08-28 (latest)

The Worker root Git baseline is now established. Before that baseline there
was no recoverable Worker-root source history; the nested `web/` repository
remains independent and unchanged. The baseline and result metadata are
recorded in the two 2026-08-28 forensic artifacts.

The current-source D03 trace proved a zero-claim clause-input regression:
clause splitting and residual reconstruction changed the model-visible input
even though the deterministic layer claimed no operation. The developer-only
V2.2 path now preserves the original full `message.text` whenever the claim
count is zero. The change is generic and does not alter Prompt, schema, model,
Ground Truth, evaluator semantics, relation behavior, or the Production
entrypoint.

```text
SOURCE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
BASELINE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
RESULT_COMMIT = 19d4462fbd297ae8a25ef667abcdd2f1fd983094
PRE_BASELINE_SOURCE_HISTORY = NOT_AVAILABLE
D03_ROOT_CAUSE = CLAUSE_INPUT_REGRESSION (CURRENT_PATH)
D03_DETERMINISTIC_CLAIM_COUNT = 0
D03_CURRENT_AI_USER_CONTENT_EQUALS_ORIGINAL_BEFORE_FIX = NO
ZERO_CLAIM_INPUT_PRESERVATION = IMPLEMENTED
PROMPT_CHANGED = NO
SCHEMA_CHANGED = NO
GROUND_TRUTH_CHANGED = NO
MODEL_CHANGED = NO
LOCAL_VALIDATION = PASS
TYPESCRIPT = PASS
FULL_VITEST = 691 passed / 11 skipped
```

The four read-only post-change validations passed. The conditional real
DEV-SMOKE-8 could not start because the dedicated Keychain API token was not
available before the provider boundary; it made zero Workers AI calls. This
is an authentication blocker, not a semantic or provider result.

```text
DEV_SMOKE_8 = NOT_RUN
DEV_SMOKE_PROVIDER_CALLS = 0
CURRENT_BLOCKER = DEDICATED_KEYCHAIN_AUTH_UNAVAILABLE
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The next gate, if separately authorized after dedicated Keychain auth is
restored, is one complete serial DEV-SMOKE-8 using the unchanged model and
retry count zero. Do not infer a smoke PASS, run Fresh Unseen, change Prompt or
semantic policy, or activate Production from this state.

## Dedicated Keychain auth access recovery gate — 2026-08-28 (latest)

The read-only dedicated-auth recovery gate confirmed that the expected
developer Keychain item is missing at the configured service/account. Parent
and fresh sanitized child checks had the same bounded result; the auth bridge
source, child-environment scrubber, and developer account configuration passed
static/status checks. No token value was accessed or exposed, and no credential
storage or auth code was changed.

```text
DEDICATED_KEYCHAIN_ITEM = MISSING
KEYCHAIN_LOOKUP_ERROR_CLASS = ITEM_NOT_FOUND
PARENT_DEDICATED_AUTH_AVAILABLE = NO
CHILD_DEDICATED_AUTH_AVAILABLE = NO
PARENT_CHILD_AUTH_PARITY = PASS
AUTH_ROOT_CAUSE = KEYCHAIN_ITEM_MISSING
TOKEN_STATE = UNKNOWN
ACCOUNT_RESOLUTION = PASS
ACCOUNT_RESOLUTION_SOURCE = DEVELOPER_CONFIG
DEDICATED_AUTH_GATE = FAIL
HUMAN_ACTION_REQUIRED = YES
```

The conditional smoke therefore stopped before provider execution. The
previously implemented zero-claim input-preservation change remains committed
and locally validated; this gate produced no new AI evidence.

```text
DEV_SMOKE_8 = NOT_RUN
DEV_SMOKE_PROVIDER_CALLS = 0
CURRENT_BLOCKER = KEYCHAIN_ITEM_MISSING
ROOT_CAUSE_LOCATED = YES
HUMAN_LINE_ACCEPTANCE = BLOCKED
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
READY_FOR_FRESH_UNSEEN = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

No new token, Wrangler login/logout, rotation, revocation, provider retry,
D03 diagnosis, semantic change, or Production action is authorized by this
state. See `forensics/dedicated-keychain-auth-access-recovery-2026-08-28.md`.

## Critical developer Keychain persistence regression and repair — 2026-08-28 (latest)

The historical record shows that the dedicated developer credential was
provisioned, retrieved from fresh processes, and used successfully earlier on
this date. A later metadata-only lookup returned item-not-found. The
read-only domain, helper, cleanup, process, and timeline reviews found no
project deletion path and did not prove physical deletion, keychain reset, or
ACL failure. The original helper did not explicitly select the user's login
Keychain; it relied on the process's implicit/default domain. Therefore the
current bounded classification is:

```text
AUTH_PROVISIONING = HISTORICAL_PASS
AUTH_SHORT_TERM_RETRIEVAL = HISTORICAL_PASS
AUTH_PERSISTENCE = FAIL
AUTH_DURABILITY = NOT_PROVEN
AUTH_INCIDENT = KEYCHAIN_ITEM_DISAPPEARANCE
ROOT_CAUSE = PERSISTENCE_DOMAIN_NOT_STRONGLY_CONTROLLED
ROOT_CAUSE_CERTAINTY = MEDIUM
PREVIOUS_DURABILITY_CLAIM_OVERSTATED = YES
```

The developer-only repair now explicitly opens the current user's
`~/Library/Keychains/login.keychain-db`: the Swift stdin provisioning helper
uses Security.framework with an explicit login-keychain reference, the
metadata checker performs a password-free Security.framework lookup, and the
TypeScript/JavaScript readers pass the same login keychain path to the
`security` CLI. The upsert remains update-in-place or add-if-missing and has
no delete-before-add path. Production authentication and behavior are
unchanged.

No replacement token has been entered in this gate, so the stronger
independent-process and cleanup-survival durability matrix has not run. The
current blocker is a human-created replacement least-privilege Workers AI API
token entered through the documented hidden stdin flow; it must not be pasted
into Codex or chat. Until that occurs, no Cloudflare request or Workers AI
inference is authorized.

```text
EXPLICIT_LOGIN_KEYCHAIN_TARGET = IMPLEMENTED_NOT_YET_PROVISIONED
HUMAN_NEW_TOKEN_REQUIRED = YES
AUTH_DURABILITY = NOT_PROVEN
TYPESCRIPT = PASS
FULL_VITEST = PASS (692 passed / 11 skipped)
WORKERS_AI_INFERENCE_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Developer auth simplification — 2026-08-28 (latest current state)

The active developer-only Direct REST authentication path is now intentionally
small: it reads the ignored project-root `.dev.secrets.local` file into the
current evaluating process's memory and enforces the local POSIX 0600 policy.
The custom Swift Keychain provisioning/checking path and Wrangler OAuth
fallback are retired from active developer evaluation; the historical sections
above remain historical evidence and are not rewritten. The loader rejects
malformed, duplicate, unsupported, empty, or whitespace-bearing values and
never passes the credential through argv, a child environment, a ledger, a
report, or a repository file.

The real secret file was deliberately not created or requested in this task;
tests use temporary synthetic files. This confirms the mechanism, not current
Cloudflare authentication or provider readiness.

```text
CUSTOM_KEYCHAIN_ACTIVE_PATH = NO
DEV_AUTH_SOURCE = DEV_SECRETS_LOCAL
AUTH_FILE_MECHANISM_READY = YES
REAL_SECRET_PROVISIONED = NO
WRANGLER_FALLBACK_FOR_V2_2 = NO
WORKERS_AI_CALLS = 0
CLOUDFLARE_AUTH_REQUESTS = 0
DEV_SMOKE_8 = NOT_RUN
TYPESCRIPT = PASS
TARGETED_AUTH_AND_V2_TESTS = PASS (140 passed / 6 skipped)
FULL_VITEST = PASS (697 passed / 11 skipped)
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The local auth mechanism is ready for a future user-provisioned existing
token. No token creation, login, rotation, Cloudflare request, Workers AI
request, Production write, or deployment was performed in this task.

## V2.2 DEV-SMOKE-8 single gate after auth pass — 2026-08-28 (latest)

The required local gate passed before the one authorized smoke execution:
TypeScript, V2.2 targeted tests (`44 passed / 3 skipped`), Full Vitest
(`697 passed / 11 skipped`), and `git diff --check`. The run used the existing
developer-only `.dev.secrets.local` loader, V2.2, the frozen Llama 3.2 3B
model, serial execution, concurrency one, and zero retries. No Auth test or
Auth modification was performed in this gate.

The current V2.2 planner selected two residual provider calls: D03 and D04.
D01/D08 used the no-event fast path, D02/D05 were deterministic, D06 was
relation-only local, and D07 was deterministic local. The two residual calls
both terminated with bounded `NETWORK_FAILURE` before an HTTP response or
provider confirmation. D03 is the first failed case; D04 was also not
semantically evaluated. This is transport evidence only, not model semantic
evidence.

```text
AUTH_SOURCE = DEV_SECRETS_LOCAL
WIRE_CONTRACT_VERSION = 2.2
MODEL = @cf/meta/llama-3.2-3b-instruct
REAL_AI_CALLS = 2
RETRIES = 0
MAX_CONCURRENT_AI_CALLS = 1
D03_PROVIDER_CALLS = 1
D03_HTTP = NOT_REACHED
D03_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION_PASS = NOT_EVALUATED
D04_PROVIDER_CALLS = 1
D04_HTTP = NOT_REACHED
D04_STRUCTURAL_STATUS = NOT_RUN
D04_FACT_EXTRACTION_PASS = NOT_EVALUATED
D04_QUANTITY_ATTRIBUTION_STATUS = NOT_EVALUATED
D06_PROVIDER_CALLS = 0
D06_RELATION_ONLY_PASS = YES
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION_PASS = YES
DEV_SMOKE_8 = FAIL
DEV_SMOKE_PASS_COUNT = 6
DEV_SMOKE_TOTAL = 8
DEV_SMOKE_FAILED_CASE = D03
DEV_SMOKE_FAILURE_LAYER = TRANSPORT
FACT_COLLECTION_SUBSTITUTION_COUNT = 0
EXTRA_FACT_COUNT = 0
CHAT_CONTAMINATION_COUNT = 0
UNSAFE_QUANTITY_PROPAGATION = 0
RELATION_FALSE_NEW_EVENT = 0
ATTEMPT_START_COUNT = 2
ATTEMPT_TERMINAL_COUNT = 2
ORPHAN_ATTEMPTS = 0
```

The smoke wrapper marker was present, the durable ledger had two terminal
records and zero orphan attempts, and the wrapper stopped on acceptance
failure. No retry or second smoke run was made. No raw source, completion,
credential, or provider prose was retained.

The smoke gate remains blocked at the transport boundary. No semantic patch,
Auth work, model change, Prompt change, Ground Truth change, Fresh Unseen
run, human LINE acceptance, Production write, or deployment is authorized by
this result. The next action requires a separate explicit gate.

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

## V2.2 bounded transport observability follow-up — 2026-08-28 (latest)

The generic `NETWORK_FAILURE` catch boundary now preserves only bounded
transport subtypes and safe runtime error fields. The internal timeout remains
30000 ms and is still classified as `PROVIDER_TIMEOUT`; retries, Auth,
Prompt, schema, model, and Production paths were unchanged. Local validation
passed and the change was committed as `e18ef8d` (`fix: preserve bounded
provider transport subtype`).

The one authorized follow-up V2.2 DEV-SMOKE-8 ran serially with zero retries.
It used `.dev.secrets.local`, the frozen Llama 3.2 3B model, and the existing
V2.2 planner. D03 and D04 were the only provider attempts; both returned HTTP
200 with provider confirmation, structural pass, and fact extraction pass.
D06 remained relation-only with zero provider calls, and D07 remained local
deterministic with zero provider calls. D04 attribution remains the frozen
bounded `UNRESOLVED` status and was not changed.

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
D03_STRUCTURAL_STATUS = PASS
D03_FACT_EXTRACTION_PASS = YES
D04_HTTP = 200
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

No additional provider call, retry, raw completion/source retention, or
Production side effect occurred. The V2.2 DEV-SMOKE-8 gate is complete and
stops here. Current next authorized gate: human LINE acceptance; Production
activation remains not authorized and not done.

```text
READY_FOR_HUMAN_LINE_ACCEPTANCE = YES
READY_FOR_PRODUCTION_ACTIVATION = NO
WORKERS_AI_INFERENCE_CALLS = 2
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## V2.2 provider parity gate — 2026-08-28 (latest)

The developer-only V2.2 Worker-binding request boundary was implemented in
commit `5084568`. It accepts only the pinned V2.2 structured request and
forwards the validated request unchanged through `runAmbientAiRequestInput` to
`env.AI.run`; Production Ambient V1 request construction and processing remain
unchanged.

The local gate passed: TypeScript, 37 targeted Provider Parity/V2.2 tests,
full Vitest (`715 passed / 11 skipped`), and `git diff --check`.

The one real Worker-binding request was not sent. The repository has a
historical ephemeral `wrangler dev --remote` route, but no current dedicated
non-Production environment or launcher. The current Wrangler configuration
exposes remote Production resources, and the project security policy does not
permit passing the developer credential through a child environment or using
an unapproved Wrangler credential path. Consequently Worker-binding parity
remains `NOT_PROVEN`; no Production Worker deployment occurred.

```text
PROVIDER_PARITY_IMPLEMENTATION = COMPLETE_DEVELOPER_ONLY
PROVIDER_PARITY_COMMIT = 5084568
WORKER_BINDING_REQUEST_SENT = NO
PROVIDER_ATTEMPTS = 0
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
PARITY_EXECUTION_BLOCKER = SAFE_NON_PRODUCTION_REMOTE_LAUNCHER_NOT_PROVEN
DEV_SMOKE_8 = PASS
DEV_SMOKE_PASS_COUNT = 8/8
PRODUCTION_D1_WRITE = 0
QUEUE_BUSINESS_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

The next single gate is an explicitly approved, genuinely isolated
non-Production Worker-binding execution mechanism. This state does not
authorize another provider request, Shadow, Active Route, human LINE
acceptance, or Production activation.

## V2.2 local Worker + remote AI-only parity attempt — 2026-08-28 (latest)

The dedicated parity configuration and AI-only entrypoint are committed in
`b02d62e2bc9e1c2033dbff81792cfed79474c7b9`. Read-only isolation audits and
local tests passed. Wrangler loaded `wrangler.parity.jsonc` with a local
Worker and only the explicit remote `AI` binding; the listener was confirmed
on `127.0.0.1:8787`, with no public tunnel. No Production D1, Queue, LINE,
Candidate, official-write, finance, or cron binding was available in the
parity config.

The single localhost D03 route request was issued. Remote AI proxy
initialization stopped at the bounded `REMOTE_BINDING_AUTH` boundary while
waiting for authorization-code completion. `env.AI.run` was not reached, so
there were zero provider attempts, zero HTTP responses, zero confirmations,
and zero Workers AI usage. Direct REST versus Worker-binding parity remains
`NOT_PROVEN`; the current effective DEV-SMOKE-8 remains the historical
`PASS` 8/8 result.

```text
LOCAL_REMOTE_AI_PARITY_ISOLATION = NOT_PROVEN
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = 127.0.0.1
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
PROVIDER_ATTEMPTS = 0
HTTP_RESPONSES = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
PARITY_FAILURE_LAYER = REMOTE_BINDING_AUTH
EXPECTED_PARITY_SIDE_EFFECT = NONE
RETRIES = 0
HISTORICAL_TRANSPORT_FAIL_PRESERVED = YES
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
NEXT_SINGLE_GATE = WRANGLER_AUTH_DECISION
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

This state does not authorize another provider request, Auth modification,
Shadow, Active Route, human LINE acceptance, or Production activation.

## V2.2 Wrangler device-login parity attempt — 2026-08-29 (latest)

The project-local Wrangler version is `4.124.0`. The single authorized device
login attempt failed before producing a device URL or user code because the
current environment could not resolve Cloudflare's API hostname. No OAuth
session was created or changed. No fallback login, token operation, Worker
startup, localhost request, or provider request was performed.

```text
WRANGLER_DEVICE_LOGIN = FAIL
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
WRANGLER_REMOTE_BINDING_AUTH = NOT_RUN
WRANGLER_OAUTH_SESSION_CHANGE = NO
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
FAILURE_LAYER = WRANGLER_DEVICE_LOGIN
RETRIES = 0
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
NEXT_SINGLE_GATE = WRANGLER_DEVICE_LOGIN_FAILURE_ANALYSIS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CODE_CHANGED = NO
CONFIG_CHANGED = NO
```

This state does not authorize a second login, fallback auth path, another
provider request, Shadow, Active Route, human LINE acceptance, or Production
activation.

## V2.2 pre-auth DNS resolution analysis — 2026-08-29 (latest)

The previous Wrangler device-flow failure occurred before authentication. The
installed Wrangler path identifies its default device-flow auth domain as
`dash.cloudflare.com`; no auth-domain override was present in the checked
process. Read-only system resolution failed for the Cloudflare candidates,
`www.cloudflare.com`, and `example.com`. Direct public DNS resolution through
`1.1.1.1` and `8.8.8.8` also failed for the device-flow hostname.

`scutil --dns` was unavailable in this environment, so resolver count and
VPN-scoped resolver state are `UNKNOWN`. No enabled proxy/PAC or Cloudflare
hosts override was found. No login, credential, API, Workers AI, or
Production operation was performed.

```text
FAILED_HOSTNAME = dash.cloudflare.com
FAILED_RESOLUTION_ERROR = DNS_RESOLUTION_FAILURE
AUTHENTICATION_REACHED = NO
CREDENTIAL_EVALUATED = NO
OAUTH_SESSION_CHANGED = NO
ACTIVE_DNS_RESOLVER_COUNT = UNKNOWN
VPN_SCOPED_RESOLVER_PRESENT = UNKNOWN
PROXY_ENABLED = NO
PAC_ENABLED = NO
HOSTS_OVERRIDE_PRESENT = NO
FAILED_HOST_SYSTEM_RESOLUTION = FAIL
CLOUDFLARE_DASH_RESOLUTION = FAIL
CLOUDFLARE_WWW_RESOLUTION = FAIL
GENERAL_CONTROL_RESOLUTION = FAIL
CLOUDFLARE_PUBLIC_DNS = FAIL
GOOGLE_PUBLIC_DNS = FAIL
CURRENT_DNS_STATE = FAIL
PREVIOUS_FAILURE_CLASS = GENERAL_DNS_FAILURE
ROOT_CAUSE_CLASS = BROADER_NETWORK_OR_DNS_REACHABILITY
CODE_CHANGED = NO
CONFIG_CHANGED = NO
AUTH_CHANGED = NO
NETWORK_CONFIGURATION_CHANGED = NO
WRANGLER_LOGIN_ATTEMPTS = 0
PROVIDER_ATTEMPTS = 0
WORKERS_AI_CALLS = 0
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
NEXT_SINGLE_GATE = LOCAL_NETWORK_RESOLUTION_REPAIR_DECISION
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

This state does not authorize DNS/network repair, another login attempt,
provider parity, Shadow, Active Route, human LINE acceptance, or Production
activation.

## V2.2 one-time network-enabled Worker-AI parity execution — 2026-08-29 (latest)

The host/network boundary was used after the DNS differential was confirmed.
The single Wrangler device login completed successfully. The existing
`wrangler.parity.jsonc` loaded with local Worker execution and only the
explicit remote `AI` binding; no Production D1, Queue, LINE, route, or cron
binding was loaded.

The Worker failed during local runtime startup before opening a listener.
workerd rejected the dedicated entrypoint because named constant exports were
interpreted as service entries rather than handlers. This is an
implementation issue requiring review. No source/config change, second login,
second Worker start, localhost D03 request, or provider request was made.

```text
ROOT_CAUSE_PREVIOUS_NETWORK_FAILURE = CODEX_EXECUTION_NETWORK_BOUNDARY
MAC_HOST_DNS = PASS
HOST_NETWORK_ENABLED_EXECUTION_USED = YES
DEVICE_FLOW_CODE_ISSUED = YES
HUMAN_DEVICE_AUTH_COMPLETED = YES
WRANGLER_DEVICE_LOGIN = PASS
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
DEV_SECRETS_LOCAL_USED_THIS_GATE = NO
DIRECT_REST_AUTH_EVALUATED_THIS_GATE = NO
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = NOT_RUN
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
FAILURE_LAYER = LOCAL_WRANGLER_LAUNCH
UNEXPECTED_IMPLEMENTATION_CHANGE_REQUIRED = YES
RETRIES = 0
WRANGLER_OAUTH_SESSION_CHANGE = YES
WORKERS_AI_USAGE = 0
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CODE_CHANGED = NO
CONFIG_CHANGED = NO
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
NEXT_SINGLE_GATE = PARITY_IMPLEMENTATION_REVIEW
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

This state does not authorize the required source fix, a retry, another
login, provider execution, Shadow, Active Route, LINE testing, or deployment.

## V2.2 host vs Codex network-boundary confirmation — 2026-08-29 (latest)

The earlier DNS failure was measured inside the restricted Codex command
environment. One approved host-level read-only execution resolved both
`example.com` and `dash.cloudflare.com` and confirmed available host resolver
metadata. The host/sandbox differential confirms the failure is at the Codex
execution network boundary, not a demonstrated macOS DNS failure.

```text
CODEX_SANDBOX_ACTIVE = YES
CODEX_NETWORK_ACCESS = RESTRICTED
CODEX_CAN_REQUEST_ONE_TIME_UNSANDBOXED_COMMAND = YES
CODEX_SANDBOX_DNS = FAIL
HOST_CONTROL_EXECUTED = YES
HOST_CONTROL_EXECUTION_MODE = ONE_TIME_UNSANDBOXED
HOST_EXAMPLE_COM_RESOLUTION = PASS
HOST_DASH_CLOUDFLARE_COM_RESOLUTION = PASS
HOST_DNS_RESOLVER_AVAILABLE = YES
MAC_HOST_DNS = PASS
NETWORK_BOUNDARY_DIFFERENTIAL = CONFIRMED
ROOT_CAUSE_CLASS = CODEX_EXECUTION_NETWORK_BOUNDARY
LOCAL_NETWORK_REPAIR_REQUIRED = NO
AUTH_CHANGED = NO
NETWORK_CONFIGURATION_CHANGED = NO
WRANGLER_LOGIN_ATTEMPTS = 0
PROVIDER_ATTEMPTS = 0
WORKERS_AI_CALLS = 0
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
NEXT_SINGLE_GATE = ONE_TIME_NETWORK_ENABLED_PARITY_EXECUTION
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

No DNS, network, VPN, proxy, hosts, Auth, source, config, or Production state
was changed. This state does not authorize another login, parity request,
provider call, Shadow, Active Route, or deployment.

## Wrangler local filesystem EPERM analysis — 2026-08-29 (latest)

Read-only evidence identifies the first launch failure as `open` on the
Wrangler debug-log file under `/Users/joe/Library/Preferences/.wrangler/logs`.
The same launch later attempted an `open` in the dev-registry directory under
`/Users/joe/Library/Preferences/.wrangler/registry` and was denied as well.
The target files were absent; both parent directories existed with owner
`joe`, mode `0755`, and no ACL marker. The project workspace is writable, but
the Wrangler home directory is outside the Codex managed writable roots.

Installed Wrangler 4.124.0 recognizes `WRANGLER_LOG_PATH` and
`WRANGLER_REGISTRY_PATH`; the CLI's programmatic `disableDevRegistry` API
exists, but no CLI flag or config disable switch was found. The parity config
contains only the remote `AI` binding and no service binding, so cross-worker
discovery is not required; the current CLI nevertheless attempted its registry
write. The evidence supports `ROOT_CAUSE_CLASS =
CODEX_FILESYSTEM_SANDBOX_BOUNDARY`, not host permission corruption.

```text
EPERM_SYSCALL = open
EPERM_PATH_CLASS = WRANGLER_LOG
SECONDARY_EPERM_PATH_CLASS = WRANGLER_DEV_REGISTRY
WRANGLER_LOG_PATH_SUPPORTED = YES
DEV_REGISTRY_ENABLED = YES
DEV_REGISTRY_WRITE_REQUIRED_BY_CURRENT_CLI = YES
PARITY_WORKER_HAS_SERVICE_BINDINGS = NO
PARITY_WORKER_NEEDS_CROSS_WORKER_DISCOVERY = NO
DISABLE_DEV_REGISTRY_API_EXISTS = YES
CLI_DISABLE_DEV_REGISTRY_OPTION_EXISTS = NO
CONFIG_DISABLE_DEV_REGISTRY_OPTION_EXISTS = NO
OWNER_IS_CURRENT_USER = YES
CURRENT_USER_POSIX_WRITE_BIT = YES
ACL_PRESENT = NO
PROJECT_WORKSPACE_WRITE_ALLOWED = YES
EPERM_PARENT_INSIDE_ALLOWED_WRITE_ROOT = NO
CODEX_FILESYSTEM_RESTRICTION_CAN_EXPLAIN_EPERM = YES
MULTIPLE_WRANGLER_HOME_WRITE_PATHS_AT_RISK = YES
PROJECT_LOCAL_LOG_REDIRECT_FEASIBLE = YES
SUPPORTED_REGISTRY_PATH_OVERRIDE = YES
ROOT_CAUSE_CLASS = CODEX_FILESYSTEM_SANDBOX_BOUNDARY
SOURCE_CHANGED = NO
CONFIG_CHANGED = NO
FILESYSTEM_CHANGED = NO
AUTH_CHANGED = NO
NETWORK_REQUESTS = 0
WRANGLER_WORKER_START_ATTEMPTS = 0
PROVIDER_ATTEMPTS = 0
WORKERS_AI_CALLS = 0
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = PROJECT_LOCAL_WRANGLER_LOG_PARITY_EXECUTION
```

No override, permission change, cleanup, Worker restart, provider request,
Auth operation, source/config change, or Production operation was performed.

## V2.2 post-fix Worker-AI parity execution — 2026-08-29 (latest)

The approved one-time host/network execution used the existing `146d453` fix.
Preflight found no new source or Wrangler config change. The dedicated parity
configuration loaded with local Worker execution and only the explicit remote
`AI` binding. The Worker exited during local Wrangler startup because the
environment denied Wrangler's local log/registry writes, before a listener was
created. The prior named-export runtime error did not recur. No localhost D03
request and no `env.AI.run` call occurred; the process exited and no background
Worker remains.

```text
PARITY_FIX_PRESENT = YES
WORKTREE_HAS_NEW_SOURCE_OR_CONFIG_CHANGE = NO
EXECUTION_APPROVAL = APPROVED
HOST_NETWORK_ENABLED_EXECUTION_USED = YES
WRANGLER_DEVICE_LOGIN_REPEATED = NO
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
PARITY_WORKER_START_ATTEMPTS = 1
PARITY_WORKER_STARTUP = FAIL
PARITY_ENTRYPOINT_NAMED_EXPORT_RUNTIME_ERROR = NO
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = NOT_RUN
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
REMOTE_OTHER_WRITE_BINDING = NO
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
FAILURE_LAYER = LOCAL_WRANGLER_LAUNCH
RETRIES = 0
WORKERS_AI_USAGE = 0
PARITY_WORKER_STOPPED = YES
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CODE_CHANGED = NO
CONFIG_CHANGED = NO
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = PARITY_LOCAL_RUNTIME_FAILURE_ANALYSIS
```

Current blocker: local Wrangler runtime write permission. This does not prove
or disprove Worker-binding structured-output parity. No second Worker start,
provider request, Shadow, Active Route, LINE test, or deployment is authorized
by this result.

## V2.2 bounded Wrangler filesystem + network parity execution — 2026-08-29 (latest)

The authorized recursive Wrangler-home write access and host network access
were used for exactly one parity Worker start. The existing `146d453` fix was
used without source/config changes. Wrangler loaded the dedicated parity config
with only the remote `AI` binding, created its expected local state, and opened
the local listener. Exactly one frozen D03 request reached `env.AI.run`; the
Worker returned a structured object, reached the V2.2 response boundary, passed
structural validation and bounded D03 fact extraction, and then shut down.

```text
FILESYSTEM_APPROVAL = APPROVED
WRANGLER_HOME_WRITE_ACCESS = READ_WRITE_RECURSIVE
HOST_NETWORK_ENABLED_EXECUTION_USED = YES
EXPECTED_WRANGLER_LOCAL_STATE_WRITE = YES
LOCAL_TEST_EVIDENCE_REUSED = YES
CODE_CHANGED_THIS_GATE = NO
CONFIG_CHANGED_THIS_GATE = NO
WRANGLER_DEVICE_LOGIN_REPEATED = NO
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
PARITY_WORKER_START_ATTEMPTS = 1
PARITY_WORKER_STARTUP = PASS
PARITY_ENTRYPOINT_NAMED_EXPORT_RUNTIME_ERROR = NO
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = LOCALHOST
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
REMOTE_OTHER_WRITE_BINDING = NO
LOCAL_PARITY_ROUTE_REQUESTS = 1
PROVIDER_ATTEMPTS = 1
PROVIDER_CONFIRMATIONS = 1
CONFIRMED_INFERENCE_CALLS = 1
WORKER_BINDING_REQUEST_SENT = YES
PROVIDER_RESPONSE_CONFIRMED = YES
REQUEST_RESPONSE_FORMAT_PRESENT = YES
REQUEST_RESPONSE_FORMAT_PRESERVED = YES
WORKER_BINDING_RESPONSE_VALUE_TYPE = OBJECT
V2_2_RESPONSE_BOUNDARY_REACHED = YES
V2_2_RESPONSE_CLASS = STRUCTURED_OBJECT_RESPONSE
V2_2_STRUCTURAL_STATUS = PASS
D03_FACT_EXTRACTION = PASS
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = PASS
FAILURE_LAYER = NONE
RETRIES = 0
WORKERS_AI_USAGE = 1
PARITY_WORKER_STOPPED = YES
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = YES
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = IMPLEMENT_TEST_GROUP_SHADOW
```

Current effective parity result: PASS. This does not authorize Shadow
implementation, Active Route, LINE acceptance, or Production activation.

## V2.2 test-group Shadow implementation — 2026-08-29 (latest)

The V2.2 ordinary-line Shadow implementation gate completed locally. The
ordinary Production path remains V1-controlled: after the existing quiet
interaction gate, Ambient buffer selection, group selection, and prefilter,
`runProductionAmbientDigest` invokes the explicit Shadow side observation
before returning to the existing V1 extractor result. The Shadow branch is
default-off and only matches the exact value of
`AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST`; no real group value was configured.

```text
STRUCTURED_OUTPUT_BINDING_PARITY = PASS
TEST_GROUP_SHADOW_IMPLEMENTATION = PASS
TEST_GROUP_SHADOW_DEPLOYED = NO
REAL_LINE_SHADOW_OBSERVED = NO
PRODUCTION_SOURCE_CHANGED = YES
PRODUCTION_BEHAVIOR_CHANGED_WHEN_SHADOW_DISABLED = NO
NEW_PERSISTENT_STORAGE_REQUIRED = NO
SHADOW_FAILURE_REACHES_V1 = NO
SHADOW_BUSINESS_WRITES = 0
REAL_AI_CALLS = 0
PROVIDER_ATTEMPTS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
TYPESCRIPT = PASS
TARGETED_SHADOW_TESTS = PASS
V2_2_REGRESSION = PASS
PROVIDER_PARITY_REGRESSION = PASS
FULL_VITEST = PASS (733 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = TEST_GROUP_SHADOW_DEPLOYMENT_REVIEW
```

This is implementation and automated validation only. No Worker deployment,
real LINE message, real Workers AI request, Production D1/Queue access,
Candidate mutation, official write, or activation occurred. The next gate must
review the exact test-group value, effective deployment diff, bounded shadow
side-effect boundary, observability, and rollback before any deployment.
