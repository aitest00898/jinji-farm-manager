# Ambient V2.2 D03 Request Equivalence and Conditional Fix — 2026-08-28

## Gate metadata

```text
SOURCE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
BASELINE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
RESULT_COMMIT = 19d4462fbd297ae8a25ef667abcdd2f1fd983094
WORKTREE_CLEAN_AT_GATE_START = YES
WORKTREE_CLEAN_AT_GATE_END = YES
PRE_BASELINE_SOURCE_HISTORY = NOT_AVAILABLE
```

## Evidence boundary

This report does not reconstruct Worker source history before the root Git
baseline. Historical conclusions use only persisted bounded artifacts. The
current-path diagnosis and the historical-equivalence diagnosis are kept
separate.

## D03 current-path diagnosis

The read-only current-source trace established:

```text
D03_ORIGINAL_MESSAGE_PRESENT = YES
D03_CLAUSE_SPLIT_OCCURRED = YES
D03_CLAUSE_COUNT = 2
D03_DETERMINISTIC_CLAIM_COUNT = 0
D03_RESIDUAL_CREATED = YES
D03_RESIDUAL_RECONSTRUCTION_OCCURRED = YES
D03_CURRENT_AI_USER_CONTENT_EQUALS_ORIGINAL = NO
DIFFERENCE_CLASSES = PUNCTUATION_CHANGED, WHITESPACE_CHANGED
D03_ROUTE = EVENT_ONLY
D03_ROOT_CAUSE = CLAUSE_INPUT_REGRESSION
ROOT_CAUSE_LOCATED = YES (current path)
```

The prior path did not mutate the original message object, but it rebuilt the
AI residual after clause splitting. Because no deterministic operation was
claimed, that reconstruction was an invalid change to the model-visible
source. The authorized generic invariant is now: zero deterministic claims
must pass the original `message.text` unchanged to the AI fallback. The
invariant does not alter the path where a real deterministic operation was
claimed.

## Historical equivalence limits

```text
HISTORICAL_D03_USED_FULL_SOURCE_MESSAGE = INCONCLUSIVE
HISTORICAL_D03_AI_USER_CONTENT_CAN_BE_RECONSTRUCTED = INCONCLUSIVE
CURRENT_D03_AI_USER_CONTENT_EQUALS_HISTORICAL = INCONCLUSIVE
HISTORICAL_REQUEST_FINGERPRINT_AVAILABLE = YES
HISTORICAL_USER_CONTENT_FINGERPRINT_AVAILABLE = NO
D03_SYSTEM_PROMPT_SAME = NO
D03_SCHEMA_SAME = INCONCLUSIVE
D03_MODEL_SETTINGS_SAME = YES
D03_MESSAGE_ORDER_SAME = YES
D03_REQUEST_BUILDER_SAME = YES
D03_OTHER_MODEL_VISIBLE_DIFFERENCE = YES
HISTORICAL_DIAGNOSTIC_OBSERVABILITY_GAP = CONFIRMED
```

Persisted historical artifacts contain bounded request fingerprints but do not
contain historical user content, a user-content fingerprint, complete request
messages, or the exact historical schema/stream metadata. The historical
request cannot therefore be declared equivalent to the current request.

## Evaluator and product boundary

```text
CURRENT_EVALUATOR_DETAIL_MATCH = EXACT
IS_DETAIL_CURRENTLY_PART_OF_FACT_IDENTITY = YES
EXISTING_SYMPTOM_CANONICALIZER = NO
CANONICAL_MATCH_WOULD_CHANGE_ACCEPTANCE_SEMANTICS = YES
PRODUCT_DECISION_REQUIRED = YES
CANONICALIZER_ADDED = NO
FUZZY_SEMANTIC_MATCH_ADDED = NO
GROUND_TRUTH_CHANGED = NO
```

No symptom canonicalization, evaluator relaxation, Prompt change, schema
change, model change, or Ground Truth change was authorized or made.

## Case A implementation and local validation

The result commit changes only the developer-only V2.2 deterministic-claim
path and its regression tests. It preserves exact original input for zero
claims, including comma-bearing abnormality text. D04, D07, bundle, D06
relation-only, mixed event/relation, and negation behavior remain covered.

```text
CODE_CHANGE = YES
CHANGE_CLASS = ZERO_CLAIM_INPUT_PRESERVATION
PROMPT_CHANGE = NO
SCHEMA_CHANGE = NO
GROUND_TRUTH_CHANGE = NO
MODEL_CHANGE = NO
NEW_REGEX_ENGINE_ADDED = NO
LOCAL_PARALLEL_VALIDATION = PASS
TYPESCRIPT = PASS
TARGETED_V2_2 = PASS (4 files, 44 passed, 3 skipped)
FULL_VITEST = PASS (61 files, 691 passed, 11 skipped)
GIT_DIFF_CHECK = PASS
PRODUCTION_ISOLATION = PASS
```

The local validation used no provider call and no runtime business side
effect. The root result commit is `19d4462fbd297ae8a25ef667abcdd2f1fd983094`; it is not a claim that the real
smoke gate passed.

## Conditional real smoke outcome

The conditional single DEV-SMOKE-8 was attempted only after the local gate and
the Case A diff review passed. The dedicated Keychain API-token discovery was
unavailable before any provider attempt, so the runner stopped safely.

```text
DEV_SMOKE_8 = NOT_RUN
DEV_SMOKE_PASS_COUNT = NOT_RUN
DEV_SMOKE_TOTAL = 8
DEV_SMOKE_PROVIDER_CALLS = 0
RETRIES = 0
MAX_CONCURRENT_AI_CALLS = 1
CURRENT_BLOCKER = DEDICATED_KEYCHAIN_AUTH_UNAVAILABLE
HUMAN_LINE_ACCEPTANCE = BLOCKED
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
PRODUCTION_ACTIVATION = NOT_AUTHORIZED
```

This is an authentication gate stop, not a D03 semantic result. No retry,
Wrangler OAuth fallback, additional real call, Fresh Unseen run, or
Production action was performed.

## Safety totals

```text
PRODUCTION_FUNCTIONAL_CODE_CHANGED = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```
