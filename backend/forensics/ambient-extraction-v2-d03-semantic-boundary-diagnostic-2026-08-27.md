# Ambient Extraction V2 D03 Semantic Boundary Diagnostic — 2026-08-27

This is a developer-only forensic record. It contains bounded booleans,
enums, counts, and code-point counts only. It does not contain raw source,
raw model detail, raw completion, prompt text, credentials, or authorization
headers. No Production path or business data was changed.

## Scope and stop boundary

* Real provider calls in this diagnostic: `1`.
* Case: `D03` only; structured-output path remained fixed.
* No retry, D04, D07, Full Smoke, Fresh Unseen, Prompt change, model change,
  or Production deployment was performed.
* Durable ledger: `forensics/runtime/ambient-extraction-v2-d03-diagnostic-d2cbc809-a5a8-41c8-a2e5-c198bdc172ca.jsonl`.

## Tuple definition audit

The current developer runner's exact event tuple comparison is explicitly:

```text
event + quantity + detail
```

The historical structured-output record did not persist detail-level equality
evidence. Therefore its earlier bounded `tuple duplicate` label does not prove
an exact duplicate event:

```text
CURRENT_DUPLICATE_TUPLE_FIELDS = event, quantity, detail
DUPLICATE_TUPLE_INCLUDES_DETAIL = YES
HISTORICAL_TUPLE_DUPLICATE_PROVES_EXACT_DUPLICATE = NO
AUTO_SEMANTIC_DEDUPE_ADDED = NO
```

## Local diagnostic gate

Before the real call:

* TypeScript: PASS.
* Targeted V2 tests: PASS (`65 passed / 2 skipped`).
* Full local check: PASS (`54` test files; `624 passed / 6 skipped`).
* The tests cover correct D03, exact-duplicate fixture, distinct-second-event
  fixture, missing detail, mismatched detail, and no raw-detail persistence.

## Bounded real D03 result

```text
HTTP = 200
PROVIDER_RESPONSE = CONFIRMED
STRUCTURED_RESPONSE_CLASS = OBJECT
JSON_PARSE = PASS
STRUCTURAL_STATUS = PASS
D03_EVENT_COUNT = 2
D03_SEMANTIC_PASS = NO
```

### Event 1

```text
EVENT_1_TYPE_PASS = YES
EVENT_1_QUANTITY_KIND = null
EVENT_1_QUANTITY_PASS = YES
EVENT_1_DETAIL_PRESENT = NO
EVENT_1_DETAIL_VALID_SHORT = NO
EVENT_1_DETAIL_CODEPOINT_COUNT = null
EVENT_1_DETAIL_MATCHES_EXPECTED = NO
EVENT_1_MATCHES_EXPECTED = NO
```

### Event 2

```text
EVENT_2_PRESENT = YES
EVENT_2_TYPE_PASS = YES
EVENT_2_QUANTITY_KIND = null
EVENT_2_QUANTITY_PASS = YES
EVENT_2_DETAIL_PRESENT = NO
EVENT_2_DETAIL_VALID_SHORT = NO
EVENT_2_DETAIL_CODEPOINT_COUNT = null
EVENT_2_DETAIL_MATCHES_EXPECTED = NO
EVENT_2_MATCHES_EXPECTED = NO
EVENT_2_DETAIL_EQUALS_EVENT_1 = YES
EVENT_2_EXACTLY_EQUALS_EVENT_1 = YES
```

The complete-tuple equality result includes the detail field. However, the
first event itself does not exactly match the frozen D03 expectation because
its detail is absent. Under the frozen classification rules, this is not
`EXACT_DUPLICATE_EVENT` or `SPURIOUS_SECOND_EVENT`; it is a bounded multiple
semantic failure:

```text
D03_SEMANTIC_SUBTYPE = MULTIPLE_SEMANTIC_ERRORS
NEXT_FIX_CLASS = NEEDS_ONE_MORE_DESIGN_DECISION
```

This does not infer model intent. In particular, the
`QUANTITY_UNCERTAINTY_SPLIT_HYPOTHESIS` remains `UNCONFIRMED`.

## Persistence and safety audit

```text
BOUNDED_SEMANTIC_DIAGNOSTICS = PASS
RAW_DETAIL_PERSISTED = NO
RAW_COMPLETION_PERSISTED = NO
RAW_SOURCE_PERSISTED = NO
AUTO_SEMANTIC_DEDUPE_ADDED = NO
```

The ledger contains a durable terminal record and no orphan for this call.
The semantic evidence is diagnostic only; no automatic collapse or semantic
fix was applied.

## Final gates

```text
STRUCTURED_OUTPUT_BASELINE = PASS
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
READY_FOR_ONE_MINIMAL_SEMANTIC_FIX = YES
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```
