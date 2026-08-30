# REAL-MODEL SCHEMA MICRO-DIAGNOSTIC REPORT

## Scope and stop rule

This developer-only diagnostic used the verified direct Workers AI REST
transport, the current Production Ambient extraction input, parser,
normalizer, decision validator, and system-build boundary.  It did not change
the Prompt, model, decision contract, inference parameters, Production code,
database, source buffer, or official write path.

The authorized sequence was D05 alone, then D03 alone, then D05+D06.  The
sequence stopped at the first schema failure.  No retry and no second provider
call were made.

```text
MATRIX_RUN_ID = d4408b3d-2be2-408d-881d-81b33dbd7c19
MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
REAL_PROVIDER_CALL_LIMIT = 3
REAL_PROVIDER_CALLS = 1
STOPPED_AFTER_CALL = 1
STOP_REASON = SCHEMA_FAILURE
```

## A. Pre-call gate

The local TypeScript, bounded-diagnostics, REST-adapter, attempt-ledger,
secret-redaction, side-effect, and semantic fixture tests passed before the
real call.  The full local check after the developer-only classification and
ledger-fallback changes also passed:

```text
TypeScript = PASS
Vitest = 549 passed / 2 skipped
```

The direct REST adapter was used without a new preflight.  It wrote a
write-ahead attempt record before the request and a terminal failure record
after the response.  No D03 or D05+D06 request was started.

## B. Actual call: D05 alone

The single provider response was bounded as HTTP 200 with a confirmed
provider response, legal JSON, and successful normalization.  The response
was rejected at event-schema validation.

```text
CASE = D05_ALONE
RUN_INDEX = 1
HTTP_STATUS = 200
PROVIDER_RESPONSE_CONFIRMED = YES
JSON = PASS
NORMALIZATION = PASS
VALIDATION = FAIL
PROMPT_TOKENS = 460
COMPLETION_TOKENS = 24
TOTAL_TOKENS = 484
SELECTED_COUNT = 1
DECISION_COUNT = 1
DECISION_COVERAGE = 1/1
```

The response contained one decision for request-local ref `m1`, so this was
not a source-coverage omission.  The bounded decision inspection recorded:

```text
SAFE_REF = m1
DECISION_KIND = unknown
PRESENT_KEYS = confidence, quantity, ref
MISSING_KEYS = kind
UNKNOWN_KEYS_PRESENT = YES
FIELD_TYPE_CLASSES = confidence:string, quantity:number, ref:string
TYPE_ENUM_STATUS = NOT_APPLICABLE
QUANTITY_KIND = not_applicable
QUANTITY_NULLABILITY_STATUS = NOT_APPLICABLE
QUANTITY_CONFIDENCE_STATUS = NOT_APPLICABLE
RAW_STATUS = NOT_APPLICABLE
CONFIDENCE_STATUS = NOT_APPLICABLE
TARGET_REF_STATUS = NOT_APPLICABLE
VALIDATION_FIRST_ISSUE_CODE = INVALID_EVENT_SCHEMA
VALIDATION_FIRST_ISSUE_FIELD = kind
VALIDATION_FIRST_ISSUE_CLASS = event|support|ignore
VALIDATION_FIRST_ISSUE_ACTUAL = missing
```

`UNKNOWN_KEYS_PRESENT=YES` is retained only as a bounded flag.  Unknown key
names and values were not stored, and that flag was not the first validation
failure.  Because `kind` was absent, event-specific checks such as `raw`,
`quantityConfidence`, and event type were not semantically evaluated.

## C. Exact causal mismatch

The first field-level diagnostic is produced by
`inspectAmbientDecision` in `src/ambient.ts:1496-1533`.  The enclosing
selected-source gate is `checkAmbientSelectedSourceCoverage` in
`src/ambient.ts:2283-2405`.

The relevant deterministic condition is:

```text
if kind is not exactly event, support, or ignore:
  INVALID_EVENT_SCHEMA at decisions[index].kind
```

For this response, the bounded evidence further proves that the key was
missing rather than merely a non-canonical value:

```text
PRIMARY_SCHEMA_FAILURE_CLASS = MISSING_REQUIRED_FIELD
PRIMARY_SCHEMA_FAILURE_FIELD = kind
```

The persisted terminal record retains only safe schema diagnostics and the
broad validator code `invalid_event_schema`; it does not retain the model
completion, Prompt, source text, arbitrary field values, or secrets.

## D. Cases not reached

The first failure rule prevented the remaining calls:

```text
D05_ALONE = reached; JSON PASS; schema FAIL
D03_ALONE = not reached
D05_D06_PAIR = not reached
GENERAL_EVENT_SCHEMA_COMPATIBILITY = FAIL
UNKNOWN_QUANTITY_SCHEMA_COMPATIBILITY = NOT_TESTED
SUPPORT_SCHEMA_COMPATIBILITY = NOT_TESTED
```

D03 unknown-quantity capability and D06 support capability remain
unevaluable.  This run provides no batch-interference evidence.

## E. Safe-normalization assessment

```text
SAFE_NORMALIZATION_POSSIBLE = NO
```

Inferring `kind=event` from a missing field would be semantic guessing: the
same missing value could represent `support` or `ignore`.  Therefore the
missing `kind` must remain fail-closed.  No auto-fill, salvage, repair, or
Prompt change was made.

## F. Runner and privacy safety

The attempt ledger contains one `ATTEMPT_START` before transport and one
terminal `ATTEMPT_FAILURE` after the HTTP 200/schema failure.  The wrapper can
reconstruct bounded reports from a complete ledger if the child marker is not
forwarded; it does not convert an unknown termination into semantic success
or failure.  The classification and fallback changes are developer-only.

```text
DIAGNOSTIC_SUFFICIENCY = PASS
AUTO_CLOSE_REPAIR = ABSENT
RAW_PROMPT_PERSISTED = NO
RAW_COMPLETION_PERSISTED = NO
RAW_SOURCE_PERSISTED = NO
SECRET_PERSISTED = NO
```

No Production D1 write, Candidate write, buffer consume, official write, or
LINE send occurred.  No Production deployment occurred.

## G. Next decision boundary

This is sufficient evidence for a future schema-compatibility decision, but
not for judging D03 or D06 model capability.  The next change, if authorized,
must explicitly decide how to make the required decision kind reliably
emitted; it must not infer a missing kind in the normalizer.  The next real
call, if separately authorized, should follow the same stop-at-first-failure
rule.

```text
READY_FOR_SCHEMA_FIX = YES
READY_FOR_PROMPT_EXAMPLE_FIX = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_FULL_BATCH_DIAGNOSTIC = NO
READY_FOR_DEV_SMOKE_RERUN = NO
READY_FOR_DEV_FULL_FLOW = NO
```

## H. Final gates

```text
REAL_PROVIDER_CALL_LIMIT = 3
REAL_PROVIDER_CALLS = 1
STOPPED_AFTER_CALL = 1

D05_ALONE_REACHED = YES
D05_ALONE_JSON = PASS
D05_ALONE_SCHEMA = FAIL
D05_ALONE_FIRST_INVALID_FIELD = kind
D05_ALONE_FAILURE_CLASS = MISSING_REQUIRED_FIELD

D03_ALONE_REACHED = NO
D03_ALONE_SCHEMA = NOT_RUN
D03_FIRST_INVALID_FIELD = NOT_RUN
D03_FAILURE_CLASS = NOT_RUN

D05_D06_PAIR_REACHED = NO
PAIR_D05_EVENT_SCHEMA = NOT_RUN
PAIR_D06_SUPPORT_SCHEMA = NOT_RUN
D06_FIRST_INVALID_FIELD = NOT_RUN
D06_FAILURE_CLASS = NOT_RUN

GENERAL_EVENT_SCHEMA_COMPATIBILITY = FAIL
UNKNOWN_QUANTITY_SCHEMA_COMPATIBILITY = NOT_TESTED
SUPPORT_SCHEMA_COMPATIBILITY = NOT_TESTED
PRIMARY_SCHEMA_FAILURE_CLASS = MISSING_REQUIRED_FIELD
PRIMARY_SCHEMA_FAILURE_FIELD = kind
DIAGNOSTIC_SUFFICIENCY = PASS
SAFE_NORMALIZATION_POSSIBLE = NO

NEW_AI_CALLS = 1
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_LINE_SEND = PASS
PRODUCTION_DEPLOYMENT = NOT_DONE
```
