# Workers AI Semantic Model Benchmark

Status: STOPPED-BY-USER before the remaining model runs were completed; Production model switch held for runtime safety.

- Dataset: `benchmarks/semantic-golden.json` — 156 cases.
- Safety cases: 12 cases were configured for three runs per model; other cases one run.
- Production model before this task: `@cf/meta/llama-3.2-3b-instruct`.
- User-selected candidate for the next stage: `@cf/google/gemma-4-26b-a4b-it`.
- Benchmark mode: read-only semantic extraction, JSON/schema validation, FarmResolver dry-run, and validator dry-run. No D1 event, pending action, farm, or LINE message writes.
- Free-plan model catalog and eligibility were checked before the run. No Paid plan was enabled.

## Run boundary

The user stopped model testing to preserve the Workers AI allowance after these run counts in the final controlled run:

| Model | Runs completed | Status |
|---|---:|---|
| `@cf/google/gemma-4-26b-a4b-it` | 172 | STOPPED-BY-USER |
| `@cf/meta/llama-3.2-3b-instruct` | 180 | COMPLETED-IN-RUN |
| `@cf/zai-org/glm-4.7-flash` | 180 | COMPLETED-IN-RUN |
| `@cf/nvidia/nemotron-3-120b-a12b` | 0 | NOT-RUN-USER-STOP |

This report intentionally does not present a winner or a complete score table because the user-directed stop occurred before all eligible models and all 156 cases had a persisted, comparable result set. Production model selection is therefore based on the explicit user instruction, not an automated benchmark ranking.

## Runtime compatibility decision

Gemma was smoke-tested through the deployed Worker semantic runtime before any final model switch. The following request shapes were tried with the same Workers AI binding and model: JSON-schema response format, JSON-object response format, no response format, and prompt-style input. Each returned HTTP 200 but no usable model response (`empty_response`). The compatibility smoke therefore failed.

`REQUESTED_MODEL = @cf/google/gemma-4-26b-a4b-it`

`GEMMA_RUNTIME_SMOKE = FAIL (empty_response)`

`CURRENT_PRODUCTION_MODEL = @cf/meta/llama-3.2-3b-instruct`

`PRODUCTION_MODEL_SWITCHED = NO (safety hold)`

The verified Llama runtime is restored for the final deployment. No further model calls are made in this stage, preserving the remaining Workers AI allowance. The benchmark runner does not declare a winner because the user-directed stop left the comparable run set incomplete.
