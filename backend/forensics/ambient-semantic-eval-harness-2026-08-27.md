# Ambient Semantic Eval Harness — 2026-08-27

## Purpose and stop boundary

This is a developer-only semantic evaluation harness for separating:

```text
MODEL CAPABILITY
CONTRACT DESIGN
BATCH INTERFERENCE
IMPLEMENTATION BUG
```

Fixture mode does not send LINE messages, call Workers AI, read Production D1,
write Candidates, consume Ambient sources, write operational/abnormal/finance/
master data, extend retention, or run a Cron/manual/dev lifecycle.  An
explicit real-model mode can forward the exact Production Ambient request to a
temporary, double-gated remote-dev adapter; that mode has a hard nine-call
budget and no business bindings in its route.

```text
REAL_MODEL_DISABLED_BY_DEFAULT = TRUE
REAL_MODEL_REMOTE_ADAPTER = EXPLICIT_ONLY
REAL_MODEL_HARD_MAX_CALLS = 9
ORACLE_ADAPTER = NOT_IMPLEMENTED
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The current harness stops at the reusable extraction/evaluation boundary.  It
uses a read-only in-memory D1 stub for the resolver/reconcile read path and
throws if a write is attempted.

## Files and command

```text
src/ambient-semantic-eval.ts
src/ambient-semantic-eval.test.ts
scripts/ambient-semantic-eval.mjs
package.json → ambient:semantic-eval
```

Run deterministic fixture evaluation:

```bash
npm run ambient:semantic-eval -- --runs 1
```

`--runs` accepts `1..10` in fixture mode.  The default command remains
fixture-only.  Real mode requires both `--real-model --runs 3`; it starts an
ephemeral double-gated `wrangler dev --remote` adapter and runs exactly the
three cases three times in case-major order.  The route accepts only the
Production model, `max_tokens=1536`, and `temperature=0`.

## Production code reused

The harness injects a fixture-shaped AI binding into the same functions used
by the Worker:

```text
extractAmbientCandidates
  → strict parser
  → normalizeAmbientAiExtraction
  → selected-source decision validation
  → system-side decision-to-Candidate event build

resolveAndReconcileAmbientBundle
  → read-only resolver/reconcile path using an empty in-memory D1 stub

buildAmbientDevSemanticSummary
  → bounded development projection

evaluateAmbientDevSemanticSnapshot
  → Ground Truth comparison
```

The full `runAmbientDigest` lifecycle is intentionally not invoked by this
local harness.  That keeps Candidate/source lifecycle side effects outside an
eval run while preserving the semantic extraction core.  No parallel parser,
normalizer, or validator was implemented.

## Cases

The existing locked Ground Truth file remains unchanged:

```text
forensics/dev-ambient-smoke-8-ground-truth.json
```

The test file uses a developer-only safe fixture projection of the same
messages and expected facts so the TypeScript harness remains runnable without
Production D1 or raw Production source rows.

Capability subsets are represented as:

| Case | Selected semantic scope | Expected system result |
| --- | --- | --- |
| `D03_ALONE` | D03 unknown-quantity abnormal event | 1 event |
| `D05_D06` | D05 event plus D06 support→D05 | 1 event, 1 support, one lineage |
| `FULL_SELECTED` | D02–D07 | 5 events, 1 support, 6/6 decisions |

The fixture adapter returns legal or intentionally malformed decision JSON;
the real adapter forwards the exact Production request but never returns raw
completion text in the bounded matrix output.  Neither mode converts fixture
or model text into a business write.

## Required metrics

Each returned report is bounded and contains:

```text
TEST_CASE
RUN_INDEX
SELECTED_COUNT
DECISION_COUNT
DECISION_COVERAGE
MISSING_REF_COUNT
UNKNOWN_REF_COUNT
DUPLICATE_REF_COUNT
EVENT_COUNT
SUPPORT_COUNT
IGNORE_COUNT
EVENT_TYPE_ACCURACY
QUANTITY_ACCURACY
UNKNOWN_QUANTITY_ACCURACY
SUPPORT_RELATION_ACCURACY
SOURCE_MAPPING_ACCURACY
HALLUCINATION_COUNT
CONTEXT_LINEAGE_CONTAMINATION_COUNT
DUPLICATE_EVENT_COUNT
JSON_PASS
NORMALIZATION_PASS
VALIDATION_PASS
SYSTEM_BUILD_PASS
OVERALL_PASS
AI_CALL_COUNT
EVAL_SIDE_EFFECT_FREE
```

The safe report may also include request-local/source-ordinal references and
the bounded semantic snapshot.  It deliberately omits `raw`, `rawTexts`,
prompt text, full source rows, actual LINE/D1 identifiers, secrets, and model
completion text.

## Fixture coverage

The test suite covers:

```text
EVAL-01  D03 valid unknown quantity → PASS
EVAL-02  D03 omitted → exact missing-source failure
EVAL-03  D05 event + D06 support→D05 → PASS
EVAL-04  D06 omitted → exact missing-source failure
EVAL-05  invalid support target → FAIL
EVAL-06  full six-source exact coverage and exact source mapping → PASS
EVAL-08  context-source contamination → FAIL
EVAL-09  duplicate D05/D06 event instead of support → FAIL
EVAL-10  malformed JSON → fail closed
EVAL-11  unknown source ref → FAIL
EVAL-12  duplicate decision ref → FAIL
```

The suite also verifies one fixture AI call per extraction, zero resolver DB
writes, no raw transcript/raw completion in the report, bounded repeated runs,
the nine-call real-mode shape, and refusal of injected real mode without the
explicit flag/adapter.

## Capability matrix

The adapter interface is injectable.  The Production 3B remote-dev adapter is
implemented, but this round's execution was blocked before a provider response
by remote-preview HTTP 503 / error code 1105.  No oracle adapter is
implemented.

Initial matrix:

```text
Production 3B:
  D03_ALONE × 3
  D05_D06 × 3
  FULL_SELECTED × 3
  maximum initial real calls = 9
```

Only if a case is unstable at 1/3 or 2/3 would a later human-approved run add
two more attempts for that case.  No automatic retry is attached to the
command; technical failures consume the current hard budget.

Interpretation rules:

```text
D03 alone fails while a stronger oracle passes
  → possible 3B capability ceiling

isolated case passes but full batch fails
  → BATCH_INTERFERENCE suspected; confirm with repeated controlled evidence

D05+D06 passes but full batch loses D06
  → BATCH_INTERFERENCE suspected

both models fail the same case
  → CONTRACT DESIGN RISK

isolated and full cases are stable
  → investigate sampling/inference variance or the prior transient evidence
```

The stop-rule levels are:

```text
LEVEL 1: one decision type fails → field/prompt/example investigation
LEVEL 2: same type repeatedly fails in controlled isolation → redesign that type
LEVEL 3: multiple types fail, isolated PASS/full FAIL, or structural coupling
         → extraction orchestration redesign
```

`BATCH_INTERFERENCE = INCONCLUSIVE` in this round because all nine attempts
were blocked by remote preview transport before provider inference.

## Current readiness

The local fixture harness, three capability subsets, bounded metrics, strict
fail-closed cases, and no-side-effect checks are in place.  Current local
results: TypeScript PASS; targeted harness tests PASS (`11/11`); CLI fixture
command PASS with `--runs 1`.

The real-model matrix was explicitly attempted, but provider inference was not
observed because the remote preview returned 503 / error 1105.  Any separate
runtime validation that would call Workers AI remains `SKIP_BY_POLICY` /
`NOT_RUN`, and is not reported as PASS.

```text
SEMANTIC_EVAL_HARNESS = PASS
HARNESS_REUSES_PRODUCTION_EXTRACTION_CORE = YES
CAPABILITY_SUBSET_D03 = READY
CAPABILITY_SUBSET_D05_D06 = READY
CAPABILITY_SUBSET_FULL = READY
EVAL_SIDE_EFFECT_FREE = PASS
REAL_MODEL_ATTEMPTED_THIS_ROUND = YES
PROVIDER_INFERENCE_OBSERVED = NO
READY_FOR_CAPABILITY_MATRIX = YES
```

This readiness means the harness and explicit real adapter are prepared for a
future authorized matrix after the remote transport issue is resolved.  The
blocked nine attempts do not authorize another attempt in this round, a LINE
rerun, a Production deployment, or Dev Full Flow.

## Direct REST adapter update

The developer-only real adapter now targets the native Cloudflare Workers AI
REST endpoint directly and no longer starts or depends on `wrangler dev
--remote`.  The adapter forwards the exact Production Ambient input and keeps
the nine-call hard limit.  A local request-shape, fail-closed, redaction,
model-mismatch, and hard-limit test set passed before the direct REST
preflight.  The preflight returned HTTP 200 with `success=true` and a
non-empty provider result.  The subsequent matrix child exited before its
bounded report marker, so its semantic results are not accepted and no retry
was made.
