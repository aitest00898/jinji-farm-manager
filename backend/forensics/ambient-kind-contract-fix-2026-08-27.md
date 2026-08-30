# AMBIENT KIND-CONTRACT FIX REPORT

## Scope

This was a Level-1, developer-only Prompt contract change.  It added one
explicit required-kind rule and one compact canonical event example.  It did
not change the model, temperature, max_tokens, parser, normalizer semantics,
validator semantics, Prefilter, Reconcile, Candidate/Buffer behavior, D1, or
Production deployment.

The authorized real test was exactly one D05-alone direct REST attempt.  It
was not retried and no D03, support pair, full batch, Dev Rerun, Cron, LINE,
or Production business operation was executed.

## A. Root cause and old Prompt state

The previous real D05 evidence showed one legal JSON decision with request-
local ref `m1`, but no `kind` key.  The first validator issue was
`INVALID_EVENT_SCHEMA` at `decisions[0].kind`, with actual type `missing`.
The missing kind cannot be safely inferred because it could mean `event`,
`support`, or `ignore`.

Before this change, the Prompt listed `kind=event`, `kind=support`, and
`kind=ignore` by branch, but did not state that every decision must contain
kind and did not contain a complete event object example.

```text
ROOT_CAUSE = MODEL_OMITTED_REQUIRED_KIND
CURRENT_COMPLETE_EVENT_EXAMPLE = NO
CURRENT_EXPLICIT_KIND_REQUIRED_RULE = WEAK
CURRENT_KIND_ENUM_RULE = event | support | ignore
```

## B. Minimal Prompt change

The executable Prompt in `src/ambient.ts` now adds only:

```text
每個 decision 的 kind 必填；只能是 event、support、ignore，不得省略。
canonical event JSON 例：{"ref":"m1","kind":"event","type":"mortality","quantity":3,"quantityConfidence":"high","raw":"死3隻","confidence":"high"}。
```

The event example contains the exact required event fields from the current
contract and uses a request-local synthetic ref.  No D03 example, support
example, ignore example, few-shot batch, or semantic rule was added.

```text
PROMPT_CHARS_BEFORE = 818 static instruction chars
PROMPT_CHARS_AFTER = 1015 static instruction chars
PROMPT_CHAR_DELTA = 197
PROMPT_TOKEN_ESTIMATE_BEFORE = ~222 with the same synthetic D05 source line
PROMPT_TOKEN_ESTIMATE_AFTER = ~271 with the same synthetic D05 source line
PROMPT_TOKEN_DELTA = ~49
```

The token estimate is a bounded `characters/4` estimate, not a provider
tokenizer claim.  Dynamic source content is unchanged.

## C. Canonical event contract audit

The source contract in `src/ambient.ts` requires:

- `ref`: request-local source ref string;
- `kind`: exactly `event` for an event decision;
- `type`: exactly `mortality`, `cull`, or `abnormal`;
- `quantity`: required number or null; abnormal requires null;
- `quantityConfidence`: required `unknown`, `low`, `medium`, or `high`;
- `raw`: required non-empty string, at most 160 characters;
- `confidence`: required `low`, `medium`, or `high`.

`farmText`, `houseText`, `flockText`, and `caretakerText` are optional and may
be bounded strings or null.  The JSON schema, TypeScript type, normalizer,
and validator agree on the required kind field.  The normalizer copies kind
when present and does not infer it when absent.

## D. Unknown-key policy

```text
UNKNOWN_KEYS_POLICY = schema declaration additionalProperties=false;
runtime normalizer drops unrecognized keys; the effective decision gate does
not use an unknown key as the first blocker
```

The prior bounded diagnostic `UNKNOWN_KEYS_PRESENT=YES` remains secondary.
This round did not expand that policy or change validation semantics.

## E. Local gates

The Prompt assertions, canonical event example assertions, missing-kind
fail-closed test, normalizer non-inference test, decision contract tests,
REST adapter tests, runner tests, and side-effect tests passed.

```text
TypeScript = PASS
Vitest = 551 passed / 3 skipped
ALL_LOCAL_TESTS = PASS
MISSING_KIND_FAIL_CLOSED = PASS
```

## F. One real D05 attempt

The working-tree Prompt was used through the existing extraction core and the
direct Workers AI REST adapter.  The attempt ledger is bounded and contains
one write-ahead start plus one terminal failure.

```text
MATRIX_RUN_ID = 29792fd3-2110-4106-b9ca-50daf3fc4dcb
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
CASE = D05_ALONE
RUN_INDEX = 1
HTTP_STATUS = null
PROVIDER_RESPONSE_CONFIRMED = NO
JSON = NOT_RUN
NORMALIZATION = NOT_RUN
VALIDATION = NOT_RUN
SYSTEM_BUILD = NOT_RUN
CHILD_EXIT_CODE = 1
STDERR_CLASS = NONEMPTY
TERMINAL_RECORD = ATTEMPT_FAILURE
FAILURE_CLASS = KIND_FIX_RUNNER_FAILURE
```

The child/transport failure occurred before a provider response was
available.  Consequently this run cannot answer whether the new Prompt made
the model emit `kind`; it is not evidence that the kind fix failed.

```text
D05_ALONE_REACHED = YES (attempt only)
D05_JSON = NOT_RUN
D05_KIND_PRESENT = NOT_RUN
D05_EVENT_SCHEMA = NOT_RUN
D05_SYSTEM_BUILD = NOT_RUN
D05_FIRST_INVALID_FIELD = NOT_RUN
KIND_CONTRACT_FIX_REAL = NOT_RUN
GENERAL_EVENT_SCHEMA_COMPATIBILITY = INCONCLUSIVE
```

No second call was made after the transport failure.

## G. Safety and next boundary

```text
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_OFFICIAL_WRITE = PASS
NO_LINE_SEND = PASS
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The next valid step is a separately authorized, reliable direct-REST D05
attempt after the transport/runner failure is understood.  It must remain one
call and must not broaden into D03, support, or full-batch testing.  This
round does not authorize another call.

```text
READY_FOR_D03_MICRO_DIAGNOSTIC = NO
READY_FOR_SUPPORT_DIAGNOSTIC = NO
READY_FOR_FULL_BATCH_DIAGNOSTIC = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_DEV_SMOKE_RERUN = NO
READY_FOR_DEV_FULL_FLOW = NO
```
