# Ambient Extraction V2 D03 Canonical-Example Fix — 2026-08-27

This is a developer-only forensic record. It preserves the prior D03
structural and structured-semantic results as history and adds one new
bounded real result. It contains no raw prompt, raw source, raw completion,
credential, provider prose, or arbitrary model detail value.

## Scope and change boundary

This round made exactly one semantic teaching change to the developer-only
`AMBIENT_V2_SYSTEM_PROMPT`: one canonical positive event example showing the
existing `abnormal`, unknown-quantity, and short-detail shape. No second
example, few-shot conversation, schema change, evaluator change, dedupe,
deterministic parser expansion, relation change, model change, or Production
change was made.

```text
PROMPT_CHANGE_CLASS = ONE_CANONICAL_POSITIVE_EXAMPLE
CANONICAL_EXAMPLE_COUNT = 1
OLD_CONTRACT_CONTAMINATION = NO
AUTO_SEMANTIC_DEDUPE_ADDED = NO
```

The previous V2 prompt fingerprint was `fnv1a32-06698b1e`. The new working
tree prompt fingerprint used by the real request was `fnv1a32-33674de5`.
The request ledger records `system:319` before the change and `system:408`
after it, for a bounded prompt character delta of `89` UTF-16 code units.
The full prompt is not persisted here.

## Historical evidence retained

The earlier Prompt-only D03 result remains historical `INVALID_JSON`. The
earlier structured-output D03 result remains historical semantic failure with
two `abnormal/null` events and insufficient detail persistence for exact
classification. Neither result was rewritten.

## Local quality gate

Before the real call:

* TypeScript: PASS.
* Prompt contract and canonical-example tests: PASS.
* Structured-output, boundary, D03 evaluator, D04, relation, and smoke
  fixture tests: PASS.
* Full local check: `54` test files; `625 passed / 6 skipped`.

## One real D03 result

The developer structured-output path was used once with the frozen model and
inference parameters. No retry was made.

```text
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
HTTP = 200
PROVIDER_RESPONSE = CONFIRMED
STRUCTURED_RESPONSE_CLASS = OBJECT
STRUCTURAL_STATUS = PASS
D03_EVENT_COUNT = 1
```

The one returned event had bounded state:

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

The event-count failure from the prior structured probe did not recur, but
the frozen D03 detail was still absent. Therefore the result is:

```text
D03_EVENT_COUNT_PASS = YES
D03_EVENT_TYPE_PASS = YES
D03_QUANTITY_PASS = YES
D03_DETAIL_PRESENT = NO
D03_DETAIL_MATCHES_EXPECTED = NO
D03_DETAIL_PASS = NO
D03_SEMANTIC_PASS = NO
ONE_CANONICAL_EXAMPLE_FIX = PARTIAL
FAILURE_CLASS = DETAIL_SEMANTICS
D03_MINIMAL_PROMPT_FIX_EXHAUSTED = YES
```

This is evidence that the canonical example improved event cardinality, but
one example did not make the D03 semantic result fully acceptable. It is not
evidence for a model change, schema change, or automatic dedupe. No second
Prompt patch is authorized by this round.

## Durable bounded evidence

The attempt has a durable start and terminal record with no orphan. The
bounded terminal ledger is:

`forensics/runtime/ambient-extraction-v2-d03-diagnostic-07c3ffb6-1c16-42e5-8805-d0ec66bd70f3.jsonl`

The terminal record retains only event classes, null/positive quantity kind,
detail presence/validity/match booleans, counts, and the semantic subtype.
No raw detail or raw completion was retained. The wrapper did not reproduce a
safe console marker in its outer output, but the durable ledger contains the
terminal record and process-exit record; no call was repeated.

## Production safety

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Next gate

The next issue is detail semantics, not event-count duplication. This round
stops without fixing it. D04, Full V2 Smoke, Fresh Unseen, Human LINE
acceptance, and Production activation remain blocked.

```text
READY_FOR_D04_SEMANTIC_GATE = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```
