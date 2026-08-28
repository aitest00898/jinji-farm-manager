# Ambient Extraction V2.1 D04 Event-Fusion Minimal Fix

Status: developer-only semantic diagnostic. This report preserves prior
evidence and records the single authorized change and single D04 call made
after it. It contains bounded fields only; no raw prompt, source message,
completion, actual detail string, credential, or authorization header is
stored here.

## Scope and frozen boundary

- Wire contract remains V2.1: every event carries `event`, `quantity`, and
  `detail`; `detail` is a string or null.
- Structured Output remains the developer baseline for
  `@cf/meta/llama-3.2-3b-instruct`, with temperature `0` and max tokens
  `1536`.
- Ground Truth and all prior reports remain immutable. No D04-specific
  expectation was changed.
- No dedupe, attribution heuristic, deterministic parser change, model
  change, schema change, retry, Production change, or deployment was made.

## Historical evidence preserved

The following results remain historical and are not rewritten:

1. Prompt-only D03 reached HTTP 200 but failed with bounded
   `INVALID_JSON` evidence.
2. Structured D03 initially observed two `abnormal`/null-quantity event
   items and failed semantic evaluation because event count and detail
   evidence did not satisfy the frozen single-event expectation.
3. The one-example D03 canonical-example attempt reached structural PASS and
   semantic PASS, proving the simple abnormal case under that controlled
   result.
4. The earlier V2.1 D04 call reached HTTP 200 and structural PASS but
   observed one event item, with first invalid field `detail` and bounded
   validation failure `EVENT_DETAIL_NOT_ALLOWED`.

The earlier D04 result remains a separate historical attempt. This report
does not reinterpret it as evidence for the new prompt.

## Authorized minimal change

Exactly one general multi-event canonical example was added to the
developer-only V2 system prompt. The existing single-event example was kept.
The new example demonstrates two events in one source message, with an
explicit mortality event and an abnormal event whose quantity is carried in
the example. It is general multi-event teaching, not a D04-specific example
and not an implicit quantity-attribution rule.

Prompt audit:

```text
PROMPT_CHANGE_CLASS = ADD_ONE_GENERAL_MULTI_EVENT_EXAMPLE
CANONICAL_EXAMPLE_COUNT = 2
OLD_PROMPT_FINGERPRINT = fnv1a32-3316f7ac
NEW_PROMPT_FINGERPRINT = fnv1a32-bf751097
OLD_CONTRACT_CONTAMINATION = NO
D04_SPECIFIC_EXAMPLE_ADDED = NO
PROMPT_FINGERPRINT_CHANGED = YES
```

No second patch was added after the result. The structured schema and
semantic evaluator expectation were unchanged.

## Local gate

The targeted V2, structured-output, D04 diagnostic, and real-smoke tests
passed: `74 passed / 2 skipped`. The full TypeScript and Vitest gate then
passed: `638 passed / 7 skipped`.

```text
LOCAL_GATE = PASS
TYPESCRIPT = PASS
FULL_VITEST = 638 passed / 7 skipped
CURRENT_V2_EXPECTED_AI_CALLS_PER_RUN = 3
D06_RELATION_ONLY = PASS
```

## Single D04 real call

The call used the developer normal V2 structured-output path. It was the only
real provider call in this diagnostic and was not retried.

```text
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
D04_HTTP = 200
D04_PROVIDER_RESPONSE = CONFIRMED
WRAPPER_STATUS = PASS
MARKER_STATUS = MISSING_NON_FATAL
ORPHAN_ATTEMPTS = 0
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
D04_UNKNOWN_KEY_NAMES = []
D04_DETAIL_CODEPOINT_COUNT = 2
D04_VALIDATION_FAILURE = EVENT_DETAIL_NOT_ALLOWED
D04_NORMALIZATION = PASS
D04_SYSTEM_BUILD = PASS
D04_SEMANTIC_PASS = NO
```

The bounded semantic projection could not establish the frozen cull/abnormal
pair after validation closed at the first invalid detail field. Therefore the
following are acceptance results, not claims about unpersisted model values:

```text
D04_EVENT_COUNT_PASS = NO
D04_CULL_PASS = NO
D04_ABNORMAL_EVENT_PASS = NO
D04_ABNORMAL_DETAIL_PASS = NO
D04_ABNORMAL_QUANTITY_PASS = NO
D04_CROSS_EVENT_QUANTITY_ATTRIBUTION = NOT_EVALUATED
```

## Interpretation

The new example did not make the D04 response satisfy the frozen two-event
acceptance. The exact bounded outcome is a multi-event boundary failure:

```text
MULTI_EVENT_CANONICAL_FIX = FAIL
FAILURE_CLASS = MULTI_EVENT_BOUNDARY
MODEL_MULTI_EVENT_RELIABILITY_CONCERN = YES
D04_MINIMAL_MULTI_EVENT_PROMPT_FIX_EXHAUSTED = YES
```

This does not prove a transport failure, Structured Output failure, wrapper
failure, or cross-event quantity-attribution failure. The call reached the
structured boundary, but only one event item was available for the frozen
two-event check. The actual event/detail text was intentionally not retained,
so no stronger event-level claim is made.

## Safety and next gate

```text
GROUND_TRUTH_CHANGED = NO
AUTO_SEMANTIC_DEDUPE_ADDED = NO
QUANTITY_ATTRIBUTION_HEURISTIC_ADDED = NO
PROMPT_PATCHES_AFTER_RESULT = 0

PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The next gate is not D07 or the full smoke. It requires a separate decision
about multi-event extraction ownership/reliability. No model comparison is
authorized by this result while the user-frozen model policy remains active.

Safe ledger for this attempt:
`forensics/runtime/ambient-extraction-v2-d04-diagnostic-c75a9f91-d246-4262-84ba-aa1997dc2704.jsonl`
