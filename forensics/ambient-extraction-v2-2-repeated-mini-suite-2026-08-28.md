# Ambient Extraction V2.2 — Repeated Mini-Suite

Date: 2026-08-28 13:45 (Asia/Taipei)
Status: `COMPLETED — FAIL_STABILITY`
Scope: developer-only V2.2 fact extraction repeatability
Production deployment: `NOT_DONE`

## Gate boundary

This fixed matrix measured the existing V2.2 structured fact wire only. It did
not change the Prompt, schema, Ground Truth, evaluator, attribution policy,
model, inference settings, relation routing, context resolution, deterministic
parser, or Production path. The matrix order was D03, D04, D07 repeated for
three serial rounds. No retry or fallback call was used.

## Documentation and pre-call gate

The earlier V2.2 D04 report now distinguishes its historical initial
authentication-blocked gate from the later resumed fact-pass gate. Its
historical section was retained. The current execution-state timestamp was
updated to this review.

The dedicated Keychain API-token source was available and account resolution
passed before the child process was started. Wrangler fallback was disabled for
this suite. The child environment contained no credential-bearing variables.

Local pre-call evidence:

```text
TypeScript = PASS
V2.2 mini-suite mock/auth tests = PASS
Script syntax checks = PASS
Full Vitest = 686 passed / 10 skipped
MODEL = @cf/meta/llama-3.2-3b-instruct
WIRE_CONTRACT_VERSION = 2.2
TEMPERATURE = 0
MAX_TOKENS = 1536
EXECUTION_MODE = SERIAL
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
```

## Fixed execution matrix

```text
ROUND 1 = D03, D04, D07
ROUND 2 = D03, D04, D07
ROUND 3 = D03, D04, D07
AI_CALLS_PER_RUN = 3
REAL_AI_CALL_LIMIT = 9
REAL_AI_CALLS = 9
```

The V2.2 D06 relation-only route was not part of the provider matrix and
remained covered by the local regression: D06 uses local relation resolution
and requires zero event-extraction AI calls.

## Bounded provider result

All nine attempts reached the provider and returned the bounded successful
transport envelope:

```text
TOTAL_CALLS = 9
HTTP_200_COUNT = 9
PROVIDER_RESPONSE_CONFIRMED_COUNT = 9
STRUCTURAL_PASS_COUNT = 9
FACT_EXTRACTION_PASS_COUNT = 6
FACT_EXTRACTION_FAIL_COUNT = 3
TECHNICAL_FAILURE_COUNT = 0
EXTRA_FACT_CONTAMINATION_COUNT = 0
```

No raw Prompt, source text, completion, actual abnormality detail, or
credential was persisted. The structured response boundary remained intact for
all nine attempts.

## Per-case repeatability

```text
D03_RUNS = 3
D03_FACT_PASS_COUNT = 3
D03_STRUCTURAL_PASS_COUNT = 3

D04_RUNS = 3
D04_FACT_PASS_COUNT = 3
D04_STRUCTURAL_PASS_COUNT = 3
D04_ATTRIBUTION_PASS_COUNT = 3
D04_ATTRIBUTION_UNRESOLVED_COUNT = 0
D04_ATTRIBUTION_FAIL_COUNT = 0
D04_ATTRIBUTION_NOT_EVALUATED_COUNT = 0

D07_RUNS = 3
D07_FACT_PASS_COUNT = 0
D07_STRUCTURAL_PASS_COUNT = 3
D07_FAILURE_LAYER = FACT_OPERATION
```

D03 was stable at the frozen single abnormality fact. D04 was stable at the
frozen operation-plus-abnormality fact identity, and its separate quantity
attribution check passed three times. D07 was structurally valid in all three
attempts, but its bounded fact projection had zero operation facts and one
abnormality fact against the frozen expectation of one mortality operation and
no abnormality. The exact response content was intentionally not retained, so
no further detail-level claim is made.

The D07 failure layer is classified as `FACT_OPERATION`; its paired bounded
collection counts also show an unexpected abnormality collection fact. This is
semantic fact evidence, not transport or structural evidence.

`EXTRA_FACT_CONTAMINATION_COUNT` is reported as zero under the runner's
bounded total-count-overflow definition: D07 had one observed fact against one
expected fact, but in the wrong fact collection. That collection mismatch is
already captured by the D07 fact failure and is not silently treated as a
pass.

## Ledger integrity

```text
ATTEMPT_START_COUNT = 9
ATTEMPT_TERMINAL_COUNT = 9
ORPHAN_ATTEMPTS = 0
PROCESS_STARTED = 1
PROCESS_EXITED = 1
LEDGER_INVALID_LINES = 0
PEAK_CONCURRENCY = 1
```

The durable Ledger was authoritative for completion. The human-readable
marker was present, but marker presence was not used as a second durability
boundary.

## Stability decision

The strict mini-suite requires D03, D04, and D07 fact extraction to pass three
out of three. D03 and D04 met that requirement; D07 failed all three fact
attempts. Therefore:

```text
V2_2_REPEATED_MINI_SUITE = FAIL_STABILITY
ORTHOGONAL_FACT_REPRESENTATION_REPEATABILITY = NOT_SUPPORTED
D04_ATTRIBUTION_REPEATABILITY = SUPPORTED_BY_3_OF_3
```

This result does not authorize a Prompt patch, schema change, model change,
model replacement, quantity-propagation heuristic, semantic dedupe, full V2.2
smoke, Fresh Unseen, human LINE acceptance, Production activation, or deploy.
The D07 failure should be reviewed under a separate explicit semantic decision
gate.

## Production isolation

```text
PRODUCTION_FUNCTIONAL_CODE_CHANGED = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Files changed in this gate

Developer-only runner/auth boundary and test additions:

- `src/ambient-extraction-v2-2-real-mini-suite.ts`
- `src/ambient-extraction-v2-2-real-mini-suite.test.ts`
- `scripts/ambient-extraction-v2-2-repeated-mini-suite.mjs`
- `src/ambient-semantic-eval-auth.ts`
- `scripts/ambient-semantic-eval-auth.mjs`

Evidence/state documents:

- `docs/current-execution-state.md`
- `forensics/ambient-extraction-v2-2-real-d04-fact-gate-2026-08-28.md`
- this report

The auth change only adds an explicit no-Wrangler-fallback option for the
dedicated developer gate. It does not change Production authentication or
business behavior.

## Next gate

```text
READY_FOR_FULL_V2_2_DEV_SMOKE = NO
READY_FOR_QUANTITY_ATTRIBUTION_DESIGN = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_MODEL_REPLACEMENT = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

Stop at this fixed matrix. Any future action requires a new explicit gate and
must preserve this result as historical evidence.
