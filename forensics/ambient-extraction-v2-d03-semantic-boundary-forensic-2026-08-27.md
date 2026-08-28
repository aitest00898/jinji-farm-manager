# Ambient Extraction V2 D03 Semantic Boundary Forensic — 2026-08-27

This is a read-only, bounded reconstruction of the existing structured D03
probe. No provider call was made in this forensic turn. It contains no raw
source message, prompt, model completion, arbitrary model detail, credential,
or authorization material.

## A. Evidence boundary

The only usable real-model evidence is the existing developer-only structured
D03 probe and its durable bounded ledger. The probe had an HTTP 200 provider
response, a structured object response, a valid `events` structural boundary,
and an evaluable semantic result. The current turn added no inference.

The persisted bounded record identifies one selected D03 message with:

* route: `EVENT_ONLY`
* extraction mode: `ai`
* structural status: `pass`
* semantic status: `resolved`
* event count: `2`
* relation status: `none`
* top-level type: `object`
* top-level keys: `events`
* structural subtype: none

The persisted event-level safe arrays are:

```text
eventTypes = [abnormal, abnormal]
quantities = [null, null]
```

No event-level detail value or detail-presence flag was persisted. The
structured ledger also records aggregate `eventTypeAccuracy = PASS`,
`quantityAccuracy = PASS`, `unknownQuantityAccuracy = PASS`,
`hallucinationCount = 2`, and `duplicateEventCount = 0`.

## B. Event-level bounded diagnosis

The frozen D03 Ground Truth contains one abnormal event with unknown quantity
and a frozen short detail. The table below intentionally reports only safe
classes and comparison states.

| Event | Enum | Quantity kind | Detail present | Detail match | Full D03 event match |
| --- | --- | --- | --- | --- | --- |
| 1 | `abnormal` | `null` | `UNKNOWN` / not persisted | `UNKNOWN` / not persisted | `NO` |
| 2 | `abnormal` | `null` | `UNKNOWN` / not persisted | `UNKNOWN` / not persisted | `NO` |

The `NO` full-match result is derived from the existing evaluator evidence,
not from raw model output: the evaluator defines `hallucinationCount` as the
number of actual proposals minus exact event matches, plus unexpected
relations. The bounded snapshot has two actual proposals, no relation, and
`hallucinationCount = 2`; therefore its exact expected-event match count is
zero. This does not identify which detail each event contained.

Consequently:

* `PRIMARY_EXPECTED_EVENT_PRESENT = NO` under the evaluator's full event
  signature (event, quantity, and detail).
* `EXPECTED_EVENT_MATCH_COUNT = 0`.
* `EXTRA_EVENT_COUNT = UNKNOWN`: the evidence cannot safely distinguish an
  extra event from detail mismatches on otherwise similar proposals.
* It is safe to say that both persisted proposals had the expected enum and
  null quantity class; it is not safe to say either had the expected detail.
* `QUANTITY_UNCERTAINTY_SPLIT_HYPOTHESIS = UNCONFIRMED`. The evidence does not
  establish why two abnormal/null proposals were produced.

The previous aggregate `D03_DETAIL_PASS = NO` remains historical evidence. It
does not supply per-event detail telemetry and is not reinterpreted here.

## C. Structured-output boundary status

There is no contradiction in the existing structured-output evidence:

* the provider response was an object;
* the object had a top-level `events` array;
* the structural validator passed; and
* the semantic evaluator was reached.

Therefore:

```text
STRUCTURED_OUTPUT_CAPABILITY = CLOSED_PASS
PROMPT_ONLY_INVALID_JSON = HISTORICAL_ONLY
```

This forensic does not revisit the response-format, provider envelope, or
JSON parser implementation.

## D. V2 implementation status

The structured response path is developer-only. Source inspection shows the
structured request/gate and real-runner path are used by developer tests and
probe tooling; the Production Worker entrypoint does not import or execute
the V2 structured-output probe path.

```text
STRUCTURED_OUTPUT_V2_IMPLEMENTATION_STATUS = PROBE_ONLY
READY_FOR_STRUCTURED_OUTPUT_V2_IMPLEMENTATION = YES
```

The readiness value means that a separately authorized developer-only
integration step may be considered. It does not mean that Production V2 is
implemented or enabled.

## E. Next decision

The available evidence is sufficient to close the structural boundary, but
not sufficient to choose among `EXTRA_EVENT_ONLY`,
`DETAIL_NORMALIZATION_ONLY`, or `EXTRA_EVENT_AND_DETAIL`. No semantic fix was
made.

```text
NEXT_SEMANTIC_FIX_SCOPE = INSUFFICIENT_EVIDENCE
READY_FOR_ONE_D03_SEMANTIC_DIAGNOSTIC = YES
READY_FOR_PROMPT_SEMANTIC_FIX = NO
```

A future, separately authorized single D03 diagnostic would need to persist
only bounded per-event semantic flags (for example detail presence, shortness,
and match status). It must not persist or print the raw completion. No new
call is authorized by this report.

## F. Safety and non-actions

```text
REAL_AI_CALLS = 0
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

No Prompt, model, structured-output boundary, validator, normalizer, or
Production business behavior was changed.

## G. Final gates

```text
REAL_AI_CALLS = 0
STRUCTURED_OUTPUT_CAPABILITY = CLOSED_PASS
STRUCTURED_OUTPUT_V2_IMPLEMENTATION_STATUS = PROBE_ONLY

D03_EXPECTED_EVENT_COUNT = 1
D03_OBSERVED_EVENT_COUNT = 2

EVENT_1_ENUM = abnormal
EVENT_1_QUANTITY_KIND = null
EVENT_1_DETAIL_PRESENT = UNKNOWN
EVENT_1_DETAIL_MATCH_EXPECTED = UNKNOWN
EVENT_1_MATCHES_EXPECTED_D03 = NO

EVENT_2_ENUM = abnormal
EVENT_2_QUANTITY_KIND = null
EVENT_2_DETAIL_PRESENT = UNKNOWN
EVENT_2_DETAIL_MATCH_EXPECTED = UNKNOWN
EVENT_2_MATCHES_EXPECTED_D03 = NO

PRIMARY_EXPECTED_EVENT_PRESENT = NO
EXPECTED_EVENT_MATCH_COUNT = 0
EXTRA_EVENT_COUNT = UNKNOWN
QUANTITY_UNCERTAINTY_SPLIT_HYPOTHESIS = UNCONFIRMED

NEXT_SEMANTIC_FIX_SCOPE = INSUFFICIENT_EVIDENCE
HISTORICAL_EVENT_LEVEL_DETAIL = NOT_PERSISTED

READY_FOR_STRUCTURED_OUTPUT_V2_IMPLEMENTATION = YES
READY_FOR_ONE_D03_SEMANTIC_DIAGNOSTIC = YES
READY_FOR_PROMPT_SEMANTIC_FIX = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```
