# AMBIENT V2.2 CLAUSE-LEVEL DETERMINISTIC CONVERGENCE REPORT

Date: 2026-08-28
Scope: developer-only V2.2 clause-level deterministic claiming convergence
Production activation: not authorized and not performed

## Outcome

The clause-level deterministic claiming layer passed its local acceptance
scope. It reuses the existing Quick Record parser, proves D07 locally with
one mortality fact and zero provider calls, preserves D04's deterministic
cull while leaving the abnormality residual for AI, and keeps D06 as a
relation-only route.

The single authorized DEV-SMOKE-8 then ran serially with the dedicated
Keychain authentication path. It made two provider calls, for D03 and the
D04 residual only. Both calls were HTTP 200, provider-confirmed, structured,
and structurally valid. D04 passed its residual fact check. The smoke failed
at D03 fact extraction, so no further call, retry, prompt patch, model change,
or Production action was performed.

Historical V2.2 reports were not rewritten. In particular, the earlier D07
ontology-convergence result and the repeated mini-suite remain historical
evidence with their original outcomes.

## Pre-write audit and implementation boundary

The four read-only architecture audits completed before the implementation:

- Audit A: existing `parseQuickItems` / Quick Record parsing is reusable;
  no new NLP or regex engine is needed.
- Audit B: safe clause boundaries are limited to comma, Chinese comma,
  sentence punctuation, and newline; semicolon handling and quantity
  propagation remain out of scope.
- Audit C: the change remains developer-only and aligned with the target
  architecture; no Production activation or semantic redesign is implied.
- Audit D: the known Production Quick-path risks remain documented as
  high-risk historical notes and were not expanded in this turn.

The main controller was the only writer. All four post-implementation
read-only test audits also passed:

```text
T1 = PASS
T2 = PASS
T3 = PASS
T4 = PASS
SUBAGENT_WRITE_ACTIONS = 0
```

Files changed for this developer-only convergence implementation and its
tests:

- `src/ambient-extraction-v2-2.ts`
- `src/ambient-extraction-v2-2-d07-convergence.ts`
- `scripts/ambient-extraction-v2-2-d07-convergence.mjs`
- `src/ambient-extraction-v2-2.test.ts`
- `src/ambient-extraction-v2-2-d07-convergence.test.ts`

No Prompt, schema, model, inference setting, Ground Truth case expectation,
Production entrypoint, D1 schema, Queue, Cron, Candidate, Buffer, or LINE
behavior was changed. `src/index.ts` does not runtime-import or activate
V2.2.

## Deterministic claiming design

The implementation uses the existing `parseQuickItems` parser and only adds
a narrow V2.2 claiming boundary. A clause is claimable only when the existing
parser yields a positive integer mortality/cull operation, the clause is not
explicitly negated, and it is not a relation-bearing clause. Unclaimed text
is retained as an in-memory residual; it is never silently discarded.

The current DEV-SMOKE-8 plan is:

```text
MESSAGES_TOTAL = 8
DETERMINISTIC_RESOLVED = 3
DETERMINISTIC_CLAIMED = 4
AI_EXTRACTION_REQUIRED = 2
RELATION_ONLY_MESSAGES = 1
RELATION_RESOLVER_CALLS = 1
NO_EVENT_FAST_PATH = 2
CURRENT_EXPECTED_PROVIDER_CALLS_PER_RUN = 2
EXECUTION_MODE = SERIAL
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
```

Bounded route results:

```text
D02 = deterministic mortality claim; no provider call
D04 = deterministic cull claim + residual abnormality extraction
D05 = deterministic mortality claim; no provider call
D06 = RELATION_ONLY; no event extraction call; local relation flow
D07 = deterministic mortality claim; no provider call
```

The D04 residual and bundle residual remain separate from the deterministic
operation claim. No quantity is copied from an operation to an abnormality.
The bundle retains independent facts, and the mixed event/relation route
remains distinct from relation-only routing.

## Local quality gate

The local gate passed before the real smoke:

```text
TYPESCRIPT = PASS
V2.2_TARGETED = PASS
T1-T4_READ_ONLY_VALIDATION = PASS
FULL_VITEST_FILES = 61
FULL_VITEST_PASSED = 689
FULL_VITEST_SKIPPED = 11
PROVIDER_CALLS_DURING_LOCAL_GATE = 0
```

The full test suite remained green. The skipped tests were policy/runtime
skips and did not invoke Workers AI.

## Controlled DEV-SMOKE-8 result

The smoke used the dedicated Keychain API-token path, the pinned V2.2
structured request, the existing model and inference settings, serial
execution, and no retry. It was run exactly once as the authorized smoke
phase.

```text
AUTH_SOURCE = DEDICATED_KEYCHAIN
PROVIDER_MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
PEAK_CONCURRENCY = 1
RETRIES = 0
TOTAL_PROVIDER_CALLS = 2
```

D07 was local-only:

```text
D07_EXECUTION_MODE = LOCAL_DETERMINISTIC
D07_DETERMINISTIC_FACT_COUNT = 1
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION = PASS
D07_EXTRA_ABNORMALITY = 0
```

D03 was the first failed smoke case. Only bounded diagnostics were retained:

```text
D03_HTTP = 200
D03_PROVIDER_RESPONSE_CONFIRMED = YES
D03_RESPONSE_CLASS = STRUCTURED_OBJECT_RESPONSE
D03_STRUCTURAL_STATUS = PASS
D03_SEMANTIC_STATUS = resolved
D03_OPERATION_FACT_COUNT = 0
D03_ABNORMALITY_FACT_COUNT = 1
D03_ACTUAL_FACT_COUNT = 1
D03_EXPECTED_FACT_COUNT = 1
D03_OPERATION_FACT_PASS = YES
D03_ABNORMALITY_FACT_PASS = NO
D03_FACT_EXTRACTION_PASS = NO
D03_FAILURE_CLASS = FACT_EXTRACTION
```

The bounded counts show one actual abnormality fact in the expected slot, but
the abnormality identity comparison failed. The actual detail value was not
persisted and is intentionally not recoverable from this report. This is a
semantic/fact-extraction failure, not an HTTP, provider, structured-boundary,
or JSON failure.

D04 residual extraction passed:

```text
D04_HTTP = 200
D04_PROVIDER_RESPONSE_CONFIRMED = YES
D04_RESPONSE_CLASS = STRUCTURED_OBJECT_RESPONSE
D04_STRUCTURAL_STATUS = PASS
D04_FACT_EXTRACTION = PASS
D04_QUANTITY_ATTRIBUTION = UNRESOLVED_BY_POLICY
```

Aggregate smoke evidence:

```text
DEV_SMOKE_8 = FAIL
SMOKE_MESSAGES_TOTAL = 8
SMOKE_PROVIDER_CALLS = 2
SMOKE_STRUCTURAL_PASSES = 2
SMOKE_FACT_PASSES = 7 / 8
SMOKE_FAILED_CASE = D03
SEMANTIC_EVENT_COUNT_EXPECTED = 6
SEMANTIC_EVENT_COUNT_ACTUAL = 6
RELATION_COUNT_EXPECTED = 1
RELATION_COUNT_ACTUAL = 1
CHAT_CONTAMINATION = 0
HALLUCINATED_EXTRA_FACTS = 0
DUPLICATE_EVENTS = 0
WRONG_FARM_ASSIGNMENTS = 0
UNSAFE_SALVAGE = 0
```

The wrapper and durable ledger were complete: two attempt starts, two
terminal records, zero orphan attempts, normal child exit, and no ledger
corruption. The non-zero wrapper result was the expected acceptance failure,
not the earlier marker false-negative condition.

## Interpretation and next gate

```text
CLAUSE_LEVEL_DETERMINISTIC_CLAIMING = PASS (local D07 scope)
D07_FACT_EXTRACTION = PASS
D04_FACT_EXTRACTION = PASS
BUNDLE_FACT_EXTRACTION = PASS (local regression scope)
D06_RELATION_ONLY = PASS
V2_2_SEMANTIC_CORE = CONTROLLED_DEV_FAIL
V2_2_DEV_SMOKE_8 = FAIL
```

The deterministic claiming boundary itself is supported by local evidence.
The overall V2.2 smoke is not accepted because D03 failed its frozen fact
expectation. No semantic patch, dedupe heuristic, quantity propagation rule,
model comparison, D04/D07 rerun, Fresh Unseen test, or Production activation
is authorized by this result.

The next decision is a separately authorized D03 semantic/fact-extraction
review. It must preserve the frozen Ground Truth and may not infer the
unpersisted detail value from this report.

## Production isolation and safety

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
```

No raw Prompt, raw source message, raw completion, actual detail text,
credential, Authorization header, or secret-derived value was written to this
report or the bounded runtime ledger.

## Final bounded gates

```text
SUBAGENT_A_STATUS = PASS
SUBAGENT_B_STATUS = PASS
SUBAGENT_C_STATUS = PASS
SUBAGENT_D_STATUS = PASS
EXISTING_PARSER_REUSABLE = YES
NEW_REGEX_ENGINE_ADDED = NO
PROMPT_CHANGED = NO
SCHEMA_CHANGED = NO
GROUND_TRUTH_CHANGED = NO

CLAUSE_LEVEL_DETERMINISTIC_CLAIMING = PASS
D07_DETERMINISTIC_FACT_COUNT = 1
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION = PASS
D07_EXTRA_ABNORMALITY = 0
D04_FACT_EXTRACTION = PASS
BUNDLE_FACT_EXTRACTION = PASS
D06_RELATION_ONLY = PASS
LOCAL_PARALLEL_VALIDATION = PASS
FULL_VITEST = PASS
CURRENT_V2_2_EXPECTED_PROVIDER_CALLS_PER_RUN = 2
DEV_SMOKE_8 = FAIL
DEV_SMOKE_PROVIDER_CALLS = 2
DEV_SMOKE_FAILED_CASE = D03
FACT_COLLECTION_SUBSTITUTION_COUNT = 0
EXTRA_FACT_COUNT = 0
CHAT_CONTAMINATION_COUNT = 0
UNSAFE_QUANTITY_PROPAGATION = 0
RELATION_FALSE_NEW_EVENT = 0
REAL_AI_CALLS = 2
RETRIES = 0
MAX_CONCURRENT_AI_CALLS = 1

PRODUCTION_D1_WRITE = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
READY_FOR_FRESH_UNSEEN = NO
```
