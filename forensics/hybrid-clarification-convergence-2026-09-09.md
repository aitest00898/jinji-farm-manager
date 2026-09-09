# Hybrid deterministic clarification convergence — 2026-09-09

This receipt closes the five-case forensic routing decision without calling
Workers AI. It preserves the historical provider run as evidence and does
not reinterpret clarification as semantic model success.

## Frozen historical evidence

```text
HISTORICAL_RESIDUAL_TOTAL = 11
HISTORICAL_SEMANTIC_EXACT = 6/11
HISTORICAL_SEMANTIC_FAIL = 5/11
HISTORICAL_FORMAT_PASS = 11/11
HISTORICAL_CONTRACT_PASS = 11/11
HISTORICAL_SAFETY_FAILURES = 0
NEW_AI_CALLS = 0
```

The five non-exact cases are `completed-lab-needs-result`,
`missing-observation-extent`, `ambiguous-stress`, `ambiguous-equipment`, and
`missing-other-detail`. The retained run proves semantic non-exactness only;
raw provider completions were not retained, so a particular model mistake is
not claimed as proven.

## Deterministic routing

| Case | Preserved deterministic state | Clarification route | Decision |
|---|---|---|---|
| completed-lab-needs-result | O6 / `lab_test`; `workflowStatus=completed`; missing `result`, `completedAt` | ask for result and completion time | `CHANGE_REQUIRED`; clarification before AI |
| missing-observation-extent | A8 / `foot_odor`; missing `extent` | ask for small, medium, or large extent | `CHANGE_REQUIRED`; clarification before AI |
| ambiguous-stress | A10; candidate subtypes `heat_stress`, `catching_stress`; missing subtype | bounded choice: heat stress or catching stress | `CHANGE_REQUIRED`; clarification before AI |
| ambiguous-equipment | A12; seven canonical candidate subtypes; missing subtype | bounded choice: feed, water, electricity, fan, cooling, heating, or other | `CHANGE_REQUIRED`; clarification before AI |
| missing-other-detail | A12 / `other`; missing `detail` | ask for the other-equipment detail | `CHANGE_REQUIRED`; clarification before AI |

The planner now emits `UNRESOLVED` with `clarificationQuestion` for these
cases. It does not manufacture a RecordCommand, overwrite known fields, or
authorize a write. The candidate subtype list remains deterministic input for
the bounded A10/A12 choices.

## Local planner result

The authored 75-case planner corpus was re-run through the pure local Vitest
contract; no provider adapter or network inference was used.

```text
PLANNER_TOTAL = 75
DETERMINISTIC_CONFIRMED = 51
AI_RESIDUAL = 6
UNRESOLVED_CLARIFICATION = 18
ESTIMATED_AI_AVOIDANCE = 69/75
KNOWN_FIELD_PRESERVATION = PRESERVED
FIELD_CROSS_CONTAMINATION = NONE_DETECTED
UNSAFE_WRITE_AUTHORIZATION = NONE
FORENSIC_5_DETERMINISTIC_CLARIFICATION = 5/5
MISSING_INFORMATION_SENT_TO_AI = 0
FORENSIC_5_FUTURE_AI_RETEST_COUNT = 0
```

The six remaining AI residuals are unchanged historical residual contracts;
they were not executed in this Gate. If a future product decision explicitly
chooses inference instead of clarification for A10/A12, those cases are an
optional bounded holdout, not a current release requirement. No model
limitation is proven by the five historical failures.

## Verification and boundary

```text
TARGETED_HYBRID_AND_TAXONOMY_TESTS = PASS; 2 files, 18 tests
PRODUCTION_FULL_CHECK = PASS; 74 files, 824 passed, 11 skipped
HYBRID_PRODUCTION_ACTIVATION = NO
WORKERS_AI_CALLS = 0
```

This is a developer-only deterministic clarification change. It has no write
authority, no migration, no model change, and no Production activation.
