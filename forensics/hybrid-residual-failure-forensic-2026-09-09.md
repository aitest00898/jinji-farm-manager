# Hybrid residual failure forensic — 2026-09-09

This report uses the already completed 11-case developer-only residual run.
It does not call Workers AI, does not change the model, and does not rerun
any residual case. The deterministic residual contract was re-read only to
reconstruct candidate sets, known fields, and missing fields.

## Frozen evidence

```text
RESIDUAL_HISTORICAL_TOTAL = 11
HISTORICAL_AI_CALLS = 11
NEW_AI_CALLS_THIS_GATE = 0
HISTORICAL_MODEL = @cf/meta/llama-3.1-8b-instruct-fast
FORMAT_PASS = 11/11
CONTRACT_PASS = 11/11
SAFETY_FAILURES = 0
SEMANTIC_EXACT = 6/11
SEMANTIC_NON_EXACT = 5/11
TAXONOMY_EXACT = 8/11
SUBTYPE_EXACT = 10/11
FACT_COUNT_EXACT = 11/11
MISSING_INFO_EXACT = 8/11
DETERMINISTIC_FIELD_OVERWRITE = 0
CANDIDATE_ESCAPE = 0
UNSAFE_INVENTION = 0
FIELD_CROSS_CONTAMINATION = 0
HISTORICAL_PROVIDER_RUN_EVALUATOR_HASH = 278792914444914146c3bf91e37fd49ed9f0b5a66403333ac510e881c2ed1fc2
RESIDUAL_CASESET_HASH = 4f655cc23c5be607fccc1c782b6e384430ecd2718d3a061d5195fd22f3f39f9
RESIDUAL_CONTRACT_HASH = e7b46e322a9d4ba6e2d1db9bc41c42c79426b058e2f0ca8583a7af7630ea7c96
DETERMINISTIC_RECONSTRUCTION_HASH = a932442517315f24881f23bf37a5e3a75d722dc26382137657c87680ca582df6
```

The five non-exact cases are known from the historical evaluator output:

| Case | Deterministic contract before AI | Historical status | Failure layer classification |
|---|---|---|---|
| `completed-lab-needs-result` | O6 / `lab_test`; candidate set size 1; known `workflowStatus=completed`, missing `result` and `completedAt` | semantic non-exact; format/contract/safety still passed | `MISSING_INFORMATION`, `KNOWN_FIELD_PRESERVATION`, `RESIDUAL_CONTEXT_INSUFFICIENT`; a model semantic limit is only a hypothesis |
| `missing-observation-extent` | A8 / `foot_odor`; subtype known; missing `extent` | semantic non-exact; format/contract/safety still passed | `MISSING_INFORMATION`, `RESIDUAL_CONTEXT_INSUFFICIENT`; taxonomy/subtype ambiguity is not supported by the deterministic candidate set |
| `ambiguous-stress` | A10; candidates `heat_stress` or `catching_stress`; missing `subtype` | semantic non-exact; format/contract/safety still passed | `SUBTYPE_SELECTION`, `CANDIDATE_SET_TOO_BROAD`, `RESIDUAL_CONTEXT_INSUFFICIENT`; possible `MODEL_SEMANTIC_LIMIT` is not proven |
| `ambiguous-equipment` | A12; seven valid equipment candidates; missing `subtype` | semantic non-exact; format/contract/safety still passed | `SUBTYPE_SELECTION`, `CANDIDATE_SET_TOO_BROAD`, `RESIDUAL_CONTEXT_INSUFFICIENT`; possible `MODEL_SEMANTIC_LIMIT` is not proven |
| `missing-other-detail` | A12 / `other`; subtype known; missing `detail` | semantic non-exact; format/contract/safety still passed | `MISSING_INFORMATION`, `KNOWN_FIELD_PRESERVATION`, `RESIDUAL_CONTEXT_INSUFFICIENT`; candidate set is not broad |

## Proven failure versus cause

Proven by the retained run: all five cases were transport, format, and
contract safe, and no unsafe field invention, candidate escape, field
overwrite, or cross-contamination was recorded. The only proven failure is
the evaluator's semantic exactness predicate for these five cases.

Not proven: the exact provider field-by-field mistake for any case. Raw
provider completions were not retained in the bounded evidence, so this report
does not claim that the model selected a particular wrong subtype or omitted a
particular field. The layer labels above are contract-grounded likely causes,
not fabricated completion details.

## Ablation decision

| Case(s) | Information already deterministic? | Candidate set can be narrowed without AI? | Clause separation / clarification | Decision | Prompt change |
|---|---|---|---|---|---|
| O6 completed without result/time | Yes: O6, subtype, completed state, two missing fields | Yes, already one candidate | Ask for result and completion time; do not create a completed fact until both exist | `CHANGE_REQUIRED` in routing: clarification before AI | `NO_CHANGE_REQUIRED` |
| A8 without extent | Yes: A8 and `foot_odor` | Yes, one candidate | Ask for extent; preserve known A8/subtype | `CHANGE_REQUIRED` in routing: clarification before AI | `NO_CHANGE_REQUIRED` |
| A10 ambiguous stress | Yes: A10 and two valid subtype buttons | Yes, present the two candidates | Ask the user to choose heat or catching stress; do not infer silently | `CHANGE_REQUIRED` in routing: clarification before AI | `NO_CHANGE_REQUIRED` |
| A12 ambiguous equipment | Yes: A12 and seven valid subtype buttons | Yes, present the seven candidates | Ask the user to choose the equipment class; keep extent | `CHANGE_REQUIRED` in routing: clarification before AI | `NO_CHANGE_REQUIRED` |
| A12 `other` without detail | Yes: A12/`other` and missing detail | Yes, one candidate | Ask for the other-equipment detail; preserve subtype and extent | `CHANGE_REQUIRED` in routing: clarification before AI | `NO_CHANGE_REQUIRED` |

The deterministic fix is to make the residual planner's known candidate and
missing-field state authoritative for clarification routing. It must not
manufacture a RecordCommand, and it must not let AI choose a value when the
contract already says the user must provide it. This is a routing/contract
decision, not a Prompt patch.

## Future retest boundary

```text
FUTURE_AI_RETEST_REQUIRED_BY_CURRENT_CONTRACT = 0
OPTIONAL_AI_HOLDOUT_IF_PRODUCT_LATER_WANTS_INFERENCE = ambiguous-stress, ambiguous-equipment
MINIMUM_FUTURE_AI_RETEST_CASES = 0
```

All five cases can remain unresolved until the human supplies the missing or
ambiguous field. If the product later deliberately chooses model inference
for A10/A12 instead of clarification, those two cases are the minimum
bounded semantic holdout; this Gate does not run them. O6 completion and A8
extent should stay deterministic clarification cases.

```text
DETERMINISTIC_FIX_CANDIDATES = completed-lab-needs-result, missing-observation-extent, ambiguous-stress, ambiguous-equipment, missing-other-detail
CONTRACT_FIX_CANDIDATES = explicit candidate list + one-to-one missing-field preservation + clarification-only decision
CLARIFICATION_CANDIDATES = all five non-exact cases
MODEL_LIMIT_CANDIDATES = none proven; A10/A12 are conditional hypotheses only
HYBRID_PRODUCTION_ACTIVATION = NO
```
