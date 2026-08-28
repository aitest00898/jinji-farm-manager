# Ambient Extraction V2.2 D07 Convergence Report

Date: 2026-08-28
Scope: developer-only V2.2 convergence gate
Production activation: not authorized and not performed

## Outcome

This gate applied exactly one implementation change: one generic ontology
alignment block in the V2.2 developer prompt. No schema, model, inference
settings, evaluator expectation, deterministic parser, relation logic, or
Production path was changed.

The authorized D07 convergence phase executed three serial real-model calls.
All three provider responses were confirmed structured responses with HTTP
200, JSON success, structural success, and no technical failure. All three
failed the frozen fact-collection acceptance: the expected operation fact was
present, but each response also contained one extra abnormality fact.

The failure is therefore a bounded extra-fact contamination result, not a
transport failure, structural failure, collection substitution, or wrapper
failure. The conditional DEV-SMOKE-8 phase was correctly not run.

## Governance and authorization

Pre-write read-only review:

- Subagent A: ontology gap confirmed with high confidence.
- Subagent B: V2.2 schema/evaluator boundary was sound; a generic ontology
  mapping block was the only authorized prompt-level change.
- Subagent C: governance passed with the developer-only boundary; no
  Production import or semantic redesign was authorized.
- Subagent D: dedicated Keychain auth and bounded-ledger requirements were
  confirmed; the convergence runner had to be serial and parameterized.

Post-change read-only review:

- T1: targeted prompt, convergence, and contract tests passed.
- T2: V2.2 and routing/convergence mock branches passed; no provider or
  side-effect activity occurred in local tests.
- T3: full Vitest passed.
- T4: Production entrypoint remained isolated from V2.2; dedicated Keychain
  auth and bounded ledger handling were verified. The pre-existing fallback
  capable D04 helper was not used by this gate.

Subagent write actions before and after the merge: 0. The main controller was
the only writer.

## Single implementation change

The V2.2 developer prompt now contains one compact, generic ontology
alignment block. It maps mortality/cull operation language to `operations`,
keeps symptoms in `abnormalities`, and excludes unrelated chat. It is not a
D07-specific example, not a dedupe rule, and not a new semantic fallback.

Prompt audit:

- Prompt change class: `ONE_GENERIC_ONTOLOGY_ALIGNMENT_BLOCK`.
- Canonical example count: `0`.
- Old `decisions[]` contract contamination: `NO`.
- V2.2 schema and evaluator: unchanged.
- Model: `@cf/meta/llama-3.2-3b-instruct`.
- Temperature: `0`.
- Max tokens: `1536`.

## Local gates

The following passed before the real calls:

- TypeScript compile check.
- V2.2 prompt and contract tests.
- D07 convergence local pass/fail mock branches.
- Structured boundary, relation-only, D04, and mixed event/relation tests.
- Dedicated runner and bounded-ledger tests.
- Full Vitest: 61 test files passed; 688 tests passed; 11 skipped.

The skips were policy/runtime skips and did not issue Workers AI calls.

## D07 real convergence evidence

Execution policy:

```text
WIRE_CONTRACT_VERSION = 2.2
RUNS = 3
EXECUTION_MODE = SERIAL
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
TOTAL_PROVIDER_CALL_LIMIT = 6
```

Bounded result for each of the three D07 attempts:

```text
HTTP = 200
PROVIDER_RESPONSE_CONFIRMED = YES
STRUCTURED_RESPONSE = OBJECT
JSON_PARSE = PASS
STRUCTURAL_STATUS = PASS
TECHNICAL_FAILURE = NO
EXPECTED_OPERATION_FACT_COUNT = 1
ACTUAL_OPERATION_FACT_COUNT = 1
ACTUAL_ABNORMALITY_FACT_COUNT = 1
EXPECTED_FACT_COUNT = 1
ACTUAL_FACT_COUNT = 2
OPERATION_FACT_PASS = YES
ABNORMALITY_FACT_PASS = NO
FACT_EXTRACTION_PASS = NO
WRONG_COLLECTION_FACT_COUNT = 0
EXTRA_FACT_COUNT = 1
```

Aggregated D07 result:

```text
D07_REAL_RUNS = 3
D07_PROVIDER_CALLS = 3
D07_STRUCTURAL_PASSES = 3
D07_FACT_PASSES = 0
D07_TECHNICAL_FAILURES = 0
FACT_COLLECTION_SUBSTITUTION_COUNT = 0
WRONG_COLLECTION_FACT_COUNT = 0
EXTRA_FACT_COUNT = 3
HALLUCINATED_EXTRA_FACT_COUNT = 3
D07_ONTOLOGY_FIX = FAIL
```

The expected operation collection was no longer omitted, so the ontology
alignment improved the original collection-selection failure. However, the
same three attempts each produced one additional abnormality fact. Because
the expected operation was present, this is not counted as an operation /
abnormality collection substitution. It is a separate extra-fact failure.
No actual source text, completion, detail text, prompt, credential, or
reasoning was persisted.

The wrapper was healthy: marker present, process exit normal, three attempt
starts, three terminal records, zero orphan attempts, zero unknown
terminations, and no ledger corruption. The marker is convenience output;
the durable ledger remained authoritative.

## Conditional smoke phase

The conditional DEV-SMOKE-8 phase was not run because the first phase did not
achieve three fact passes. Therefore no D03, D04, or D07 smoke calls were
made, and the total real provider call count remained three. The historical
fixed nine-call mini-suite report remains unchanged and is not rewritten.

## Interpretation and next boundary

The current bounded evidence is:

```text
D07_ROOT_CAUSE_CLASS = ONTOLOGY_GAP
D07_POST_FIX_FAILURE_CLASS = EXTRA_ABNORMALITY_FACT
D07_MINIMAL_ONTOLOGY_FIX_EXHAUSTED = YES
READY_FOR_FULL_V2_2_DEV_SMOKE = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

This gate does not authorize another prompt patch, dedupe heuristic,
deterministic attribution rule, model replacement, D04 test, Fresh Unseen
test, or Production change. The next decision is an explicit semantic/model
architecture review of the remaining extra-fact behavior. A model comparison
is not automatically authorized by this report.

## Safety and persistence

```text
REAL_AI_CALLS = 3
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

No raw credential or credential-derived value was emitted or persisted. The
dedicated Keychain auth path was used; no Wrangler fallback was used by the
convergence runner.

## Final bounded gates

```text
SUBAGENT_A_STATUS = PASS
SUBAGENT_B_STATUS = PASS
SUBAGENT_C_STATUS = PASS
SUBAGENT_D_STATUS = PASS
SUBAGENT_WRITE_ACTIONS_BEFORE_MERGE = 0
D07_ROOT_CAUSE_CLASS = ONTOLOGY_GAP
PROJECT_GOAL_ALIGNMENT = PASS
SDD_GOVERNANCE_ALIGNMENT = PASS
PROMPT_CHANGE_CLASS = ONTOLOGY_ALIGNMENT
CANONICAL_EXAMPLE_COUNT = 0
LOCAL_PARALLEL_VALIDATION = PASS
FULL_VITEST = PASS
D07_REAL_RUNS = 3
D07_FACT_PASS_COUNT = 0
D07_WRONG_COLLECTION_COUNT = 0
D07_STRUCTURAL_PASS_COUNT = 3
D07_ONTOLOGY_FIX = FAIL
D07_MINIMAL_ONTOLOGY_FIX_EXHAUSTED = YES
DEV_SMOKE_8 = NOT_RUN
DEV_SMOKE_AI_CALLS = 0
DEV_SMOKE_FAILED_CASE = NOT_RUN
FACT_COLLECTION_SUBSTITUTION_COUNT = 0
TOTAL_REAL_AI_CALL_LIMIT = 6
TOTAL_REAL_AI_CALLS = 3
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0
PRODUCTION_D1_WRITE = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```
