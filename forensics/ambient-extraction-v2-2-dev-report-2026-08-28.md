# Ambient Extraction V2.2 — Dev-Only Local Prototype Report

Date: 2026-08-28
Status: `PASS — LOCAL ONLY`
Real provider calls: `0`
Production deployment: `NOT_DONE`

## Scope

This round reviewed the operation/abnormality fact boundary and added a
developer-only V2.2 local prototype. The Production Worker, Production V1
Ambient path, V2.1 wire, prompts, model settings, D1 schema, queues, cron,
LINE behavior, and data were not changed.

## Frozen Ground Truth

Created:
`forensics/ambient-extraction-v2-2-ground-truth-2026-08-28.json`

The new artifact is `ambient_extraction_v2_2`, Ground Truth version `2.2.0`,
and is frozen before prototype implementation. It projects the existing
DEV-SMOKE-8 and 13 Fresh Unseen cases into separate `operations` and
`abnormalities` facts. The old V2 Ground Truth remains untouched.

DEV-SMOKE-8 V2.2 accounting is:

```text
fact_count = 6
operation_fact_count = 4
abnormality_fact_count = 2
relation_count = 1
```

D04 is intentionally decomposed. V2.2 fact extraction expects cull quantity 2
and abnormal detail `腳傷` with quantity `null`; cross-fact quantity
attribution is `UNRESOLVED`. No operation quantity is copied to an
abnormality.

## Architecture review

Operations and abnormalities are orthogonal facts. A single message may carry
both, but their quantities have no automatic attribution relationship. The
V2.1 homogeneous `events[]` design is not declared globally broken; the
observed D04 representation has a real cross-fact attribution concern. V2.2
is recommended because it makes the fact families explicit while retaining
one message-level unit and one possible model call.

The prototype does not create two model calls. Relation remains a separate
local route, and technical idempotency remains source-identity based. There is
no semantic tuple dedupe, event-splitting heuristic, or quantity propagation.

Design record:
`forensics/ambient-extraction-v2-2-design-2026-08-28.md`

## Implementation boundary

Added `src/ambient-extraction-v2-2.ts` with:

- strict top-level `operations` and `abnormalities` arrays;
- strict item keys and positive-number-or-null quantities;
- abnormality detail validation using Unicode code-point counting;
- structural fail-closed parsing with no JSON repair or salvage;
- semantic partial results only after a structurally valid response;
- deterministic normalization into existing internal system-event fields;
- message route/relation/context/idempotency adapters reusing existing V2
  components;
- separate fact evaluation and D04 quantity-attribution status;
- bounded, value-free diagnostics.

The module is not imported by `src/index.ts`. It has no provider adapter and
does not call Workers AI.

## Local fixture results

`src/ambient-extraction-v2-2.test.ts`: `28 passed`.

Covered evidence includes:

- empty output, mortality/cull known and null quantities;
- known/null abnormalities and three independent facts in one message;
- strict keys, enums, required fields, detail content and 12-code-point limit;
- BMP and surrogate-pair Unicode counting without truncation;
- malformed/truncated JSON and provider-error separation;
- D02/D03/D04/D05/D06/D07 routing and the three-call current smoke plan;
- D06 relation-only routing with zero event-extraction calls;
- FRESH-13 mixed event plus relation routing;
- technical source idempotency versus different-source same-type/quantity;
- bounded relation pools and official-record exclusion;
- semantic/context separation and message-level partial success;
- preservation of the old V2 D04 Ground Truth;
- no V2.2 import into the Production entrypoint.

## Quality gate

```text
TypeScript: PASS
V2.2 targeted tests: 28 passed
Targeted regression selection: 177 passed / 4 skipped
Full Vitest: 671 passed / 8 skipped
```

No real Workers AI request, preflight, REST call, D1 write, Candidate write,
Buffer consume, official write, Queue write, LINE send, migration, or
deployment occurred.

## Current decision and next gate

```text
V2_2_DEV_PROTOTYPE = PASS
V2_2_STRUCTURAL_VALIDATION = PASS
V2_2_LOCAL_D04_FACT_EXTRACTION = PASS
V2_2_LOCAL_D04_ATTRIBUTION = UNRESOLVED
REAL_AI_CALLS = 0
MODEL_SHOPPING_CONTINUES = NO
```

The next possible gate is a separately authorized, single real V2.2 D04 fact
extraction call using the existing safe Direct REST path. It must report fact
extraction separately from quantity attribution. Full V2 smoke, Fresh Unseen,
model replacement, human LINE acceptance, Dev Full Flow, and Production
activation remain out of scope.

## Acceptance-boundary correction — 2026-08-28

Before any real D04 call, the evaluator boundary was corrected. Abnormality
fact identity is now `detail` plus multiplicity; its quantity is not part of
fact existence. Operation identity remains `type` plus operation quantity.
An optional attribution expectation evaluates the abnormality quantity
separately.

```text
V2_2_FACT_ATTRIBUTION_BOUNDARY_CORRECTED = YES
AUTO_QUANTITY_PROPAGATION = NO
AUTO_EVENT_SPLIT = NO
SEMANTIC_DEDUPE = NO
```

The V2.2 prompt received exactly two wire-contract alignment rules and no
example or D04-specific wording. `CANONICAL_EXAMPLE_COUNT = 0`.

Local D04 boundary cases now pass their intended classifications:

```text
cull/2 + abnormal detail with null quantity -> fact PASS; attribution UNRESOLVED
cull/2 + abnormal detail with quantity 2    -> fact PASS; attribution PASS
cull/2 + abnormal detail with quantity 3    -> fact PASS; attribution FAIL
cull/2 only                                 -> fact FAIL; attribution NOT_EVALUATED
```

The old V2.1 D04 Ground Truth and the frozen V2.2.0 case meanings were not
changed. No provider call or Production side effect occurred.
