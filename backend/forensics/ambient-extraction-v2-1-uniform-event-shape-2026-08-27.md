# Ambient Extraction V2.1 Uniform Event Shape — 2026-08-27

This is a developer-only V2.1 contract record. It preserves the earlier V2
structured-output and Prompt-only results; it does not rewrite historical
evidence. It contains no raw prompt, raw source, raw model completion, raw
model detail, credential, authorization header, or provider prose.

## Scope and version

This round made one wire-contract change: every structured event must contain
`event`, `quantity`, and `detail`. `detail` is nullable on the wire. The
semantic validator remains strict: abnormal events require a valid short
detail; mortality and cull events require `detail: null`. The internal V2
proposal keeps its existing optional-detail representation, so validated
`detail: null` is normalized to an omitted internal detail for mortality/cull.

No semantic dedupe, salvage, parser expansion, relation change, model change,
inference-parameter change, or Production change was made.

```text
WIRE_CONTRACT_VERSION = 2.1
UNIFORM_EVENT_SHAPE = PASS
EVENT_REQUIRED = YES
QUANTITY_REQUIRED = YES
DETAIL_REQUIRED = YES
DETAIL_NULLABLE = YES
COMPLEX_CONDITIONAL_SCHEMA_ADDED = NO

CANONICAL_EXAMPLE_COUNT = 1
NEW_SEMANTIC_PROMPT_PATCH = NO
WIRE_CONTRACT_ALIGNMENT_ONLY = YES
AUTO_SEMANTIC_DEDUPE_ADDED = NO
```

The prior working-tree prompt fingerprint was `fnv1a32-33674de5`. The V2.1
wire-alignment prompt fingerprint used by the real request was
`fnv1a32-3316f7ac`. The prompt change is limited to stating that the existing
event wire shape always emits `detail`, using null for mortality/cull. The
canonical example count remains one and the old decisions contract is absent.

## Implementation boundary

Changed developer-only V2 files:

* `src/ambient-extraction-v2.ts`: required-detail validation, bounded missing
  detail / abnormal-null diagnostics, and validated null-to-omitted internal
  normalization for mortality/cull; the existing fail-closed boundary and
  technical idempotency behavior remain unchanged.
* `src/ambient-extraction-v2-structured-output.ts`: V2.1 version marker and
  strict structured schema with required nullable detail.
* `src/ambient-extraction-v2.test.ts`: V2 fixture wire-shape updates and
  validator/prompt regression coverage.
* `src/ambient-extraction-v2-structured-output.test.ts`: V2.1 schema,
  nullable-detail, forbidden-detail, and missing-detail coverage.

The Production Worker source does not import the V2 developer module. No
Production Prompt, model, schema, Queue, Cron, D1, Candidate, Buffer, LINE,
migration, or deployment was changed.

## Contract checks

The local tests verify:

* `abnormal / null / string` resolves;
* `abnormal / null / null` remains semantic-unresolved with the bounded
  `ABNORMAL_DETAIL_REQUIRED` failure code;
* `mortality / positive / null` and `cull / positive / null` resolve and
  normalize to internal proposals without a detail property;
* mortality/cull with a string detail is rejected;
* missing detail is rejected without salvage;
* existing D03/D04 frozen expectations, D06 relation-only routing, FRESH-13,
  structured response boundary, and side-effect protections remain green.

## Local quality gate

```text
TYPESCRIPT = PASS
TARGETED_V2_TESTS = 73 passed / 2 skipped
FULL_VITEST = 630 passed / 6 skipped
ALL_LOCAL_TESTS = PASS
```

The real-call test remained disabled during local test runs. No local test
called Workers AI.

## One real D03 call

After the local gate, exactly one developer-only structured D03 request used
the pinned model and parameters. No retry or fallback request was made.

```text
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
STRUCTURED_OUTPUT = json_schema
HTTP = 200
PROVIDER_RESPONSE = CONFIRMED
STRUCTURAL_STATUS = PASS
EVENT_COUNT = 1
EVENT_COUNT_PASS = YES
EVENT_TYPE_PASS = YES
QUANTITY_PASS = YES
DETAIL_PRESENT = YES
DETAIL_KIND = STRING
DETAIL_MATCHES_EXPECTED = YES
SEMANTIC_PASS = YES
```

The bounded terminal record is:

`forensics/runtime/ambient-extraction-v2-d03-diagnostic-443ee649-8bac-4811-b4e8-bf27a14ba60f.jsonl`

Its safe metrics record one `abnormal` event, null quantity, valid short
detail status, exact expected-detail match, zero hallucinations, zero
duplicates, and `overallPass = true`. Only bounded classes and booleans are
retained; no model detail value is reconstructed here.

The outer wrapper did not reproduce its console marker and returned a wrapper
exit code of 2, but the durable ledger contains one terminal success record
and a process-exit record with exit code 0. The durable evidence was sufficient
and no call was repeated.

## Result and next gate

The V2.1 uniform wire shape is supported for this single D03 control. This is
not a full V2 smoke pass, D04 proof, Fresh Unseen proof, human LINE
acceptance, model comparison, or Production readiness result.

```text
V2_1_UNIFORM_EVENT_SHAPE = PASS
MODEL_SEMANTIC_RELIABILITY_CONCERN = NO
READY_FOR_D04_SEMANTIC_GATE = YES
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```

## Safety gates

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```
