# AMBIENT EXTRACTION V2 REAL DEV SMOKE

Status: `RUN-1-FAILED_STOPPED`

This artifact is append-oriented. It records the frozen acceptance accounting,
the provider-limit evidence, and the real-run result without storing raw
prompts, completions, LINE messages, credentials, or reasoning. Historical
real-model results remain in the earlier forensic artifacts.

## Ground Truth accounting

* `ground_truth_version = 1.0.1`, corrected from `1.0`.
* The correction is aggregate-only: case-level expectations are unchanged.
* DEV-SMOKE-8 `semantic_event_count = 6`: D02 (1), D03 (1), D04 (2), D05
  (1), D07 (1).
* DEV-SMOKE-8 `relation_count = 1`: D06 points to D05.
* The earlier value `5` omitted D03's valid unknown-quantity abnormal event.

## Cloudflare limit evidence

The current [official Workers AI limits page](https://developers.cloudflare.com/workers-ai/platform/limits/)
documents text generation at 300 requests per minute. It does not publish a
general concurrent-request number or a special limit for
`@cf/meta/llama-3.2-3b-instruct`. The [Workers runtime limits
page](https://developers.cloudflare.com/workers/platform/limits/) documents
outgoing-connection limits as a separate runtime concept; it is not used as
an AI quota. The [official Workers AI pricing
page](https://developers.cloudflare.com/workers-ai/platform/pricing/)
documents a 10,000 Neurons/day free allocation. These are published limits,
not live account quota evidence. The transport itself uses the documented
[Workers AI REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).

## Execution plan

* Model: `@cf/meta/llama-3.2-3b-instruct`
* `temperature = 0`, `max_tokens = 1536`
* Direct Workers AI REST only; no Wrangler remote proxy and no new preflight.
* Serial execution: `MAX_CONCURRENT_AI_CALLS = 1`.
* The frozen fixture plan is calculated before inference: D02 and D05 use the
  existing conservative deterministic fast path; D03, D04, D06, and D07
  require provider extraction. Therefore `AI_CALLS_PER_RUN = 4`.
* Phase 1 is RUN-1 through RUN-3, stopping on the first failed run. Only if
  all three pass may RUN-4 and RUN-5 execute. The maximum is 20 provider calls.

## Results

The authorized real smoke used experiment
`5d579e1d-2927-44a6-a4ab-7130e934cdb8` and matrix run
`de96baf1-b6cf-4bcd-a0e6-757078f00309`. The durable ledger is
`forensics/runtime/ambient-extraction-v2-real-smoke-5d579e1d-2927-44a6-a4ab-7130e934cdb8.jsonl`.

The runner executed only RUN-1. Its precomputed plan required four provider
calls: D03, D04, D06, and D07. D02 and D05 were resolved by the existing
conservative deterministic fast path; D06 relation resolution was local and
bounded. All four attempts were serialized (`peak_concurrency = 1`) and all
four received HTTP 200 provider responses. There were no transport failures,
429s, 3036/3040 errors, or timeout records.

| Run | Provider attempts | Responses | AI-required refs | V2 structural result | Coverage | Events | Relations | Result |
| --- | ---: | ---: | --- | --- | --- | ---: | ---: | --- |
| RUN-1 | 4 | 4 | D03, D04, D06, D07 | 4/4 failed closed | 2/6 | 2 | 1 | FAIL |
| RUN-2 | 0 | 0 | not run | not run | not run | — | — | NOT_RUN |
| RUN-3 | 0 | 0 | not run | not run | not run | — | — | NOT_RUN |
| RUN-4 | 0 | 0 | phase 2 not eligible | not run | not run | — | — | NOT_RUN |
| RUN-5 | 0 | 0 | phase 2 not eligible | not run | not run | — | — | NOT_RUN |

The four AI-required message results were all recorded as structural failure
with no extracted events. The two deterministic events (D02 mortality 2 and
D05 mortality 3) remained in the bounded result, so `events_extracted = 2`,
`messages_unresolved = 4`, and `decision_coverage = 2/6`. The local relation
resolver still recorded one bounded relation intent for D06 to D05. This is
not semantic capability evidence: the semantic evaluator could not evaluate
the four provider outputs after structural rejection.

The terminal records use the aggregate failure class
`SEMANTIC_EXPECTATION_MISMATCH`, but their bounded message snapshots identify
the earlier structural rejection (`structuralStatus = fail`); this is a
recording limitation, not evidence of a semantic mismatch.

The exact structural subtype was not persisted in this run's safe terminal
snapshot, and no raw completion was retained. Therefore the evidence is
limited to `STRUCTURAL_FAILURE = YES`; it does not distinguish invalid JSON
from another V2 structural rejection. The runner was subsequently tightened
to preserve the bounded structural failure code for future attempts and the
wrapper was tightened to capture both child stdout and stderr. Those tooling
changes were not used to justify another provider call.

The child process exited normally (`exit_code = 0`), with no orphan attempt.
The first wrapper observation did not see the final marker, but the durable
ledger reconstructed all four attempts and their terminal records. No second
run was started because RUN-1 failed, and no retry or replacement call was
made.

### D04 bounded diagnostic

D04 was one of the four AI-required messages and therefore did not reach
semantic evaluation in RUN-1. `D04_CULL_PASS`,
`D04_ABNORMAL_DETAIL_PASS`, and `D04_ABNORMAL_QUANTITY_PASS` are all
`NOT_EVALUABLE`; the frozen two-event expectation remains unchanged.

### Provider accounting

* `TOTAL_PROVIDER_CALLS = 4` of a maximum 20 for the five-run protocol.
* `SUCCESSFUL_PROVIDER_RESPONSES = 4`.
* `TECHNICAL_FAILURES = 0`; `HTTP_429_COUNT = 0`;
  `ERROR_3036_COUNT = 0`; `ERROR_3040_COUNT = 0`; `TIMEOUT_COUNT = 0`.
* `RUN-1 = FAIL`; `PHASE_1 = FAIL`; `PHASE_2 = NOT_RUN`;
  `REAL_V2_DEV_SMOKE = FAIL`.
* Fresh Unseen is not eligible. Human LINE acceptance and Dev Full Flow are
  not eligible.

## Safety boundary

This harness is developer-only and fixture-backed. It has no Production D1,
Candidate, Buffer, Operational, Abnormal, Finance, Master Data, Queue, Cron,
or LINE write path. `PRODUCTION_DEPLOYMENT = NOT_DONE`.

No Production D1, Candidate, Buffer, Operational, Abnormal, Finance, Master
Data, Queue, Cron, or LINE operation was performed. The Production
DEV-SMOKE-8 cohort was not read or mutated; its last verified baseline remains
8 locked, 8 available, 8 buffered, and 0 processed. The real calls used the
frozen developer fixture.

## Gate result

* `CASE_LEVEL_GROUND_TRUTH_CHANGED = NO`.
* `GROUND_TRUTH_ACCOUNTING_CORRECTED = YES`, version `1.0.1`, with six
  semantic events and one relation.
* `V2_PROVIDER_EXECUTION_MODE = SERIAL`, `MAX_CONCURRENT_AI_CALLS = 1`,
  `PEAK_CONCURRENCY = 1`.
* `AI_CALLS_PER_RUN = 4`; Phase 1 maximum is 12 calls; Phase 2 maximum is 8
  additional calls; total protocol maximum is 20.
* `READY_FOR_FRESH_UNSEEN = NO`; `READY_FOR_HUMAN_LINE_ACCEPTANCE = NO`.

The result is insufficient to classify D03 capability, D06 capability, or
batch interference. The next safe action is to inspect/fix the bounded V2
structural-output compatibility and preserve the structural subtype in the
developer ledger before requesting another real-model gate. No Prompt/model
or Production semantic change is authorized by this report.

## Local quality gate

* TypeScript compile: PASS.
* Targeted V2 and real-smoke runner tests: 37 passed, 1 skipped.
* Full Vitest: 588 passed, 4 skipped (592 total).
* Runner script syntax check: PASS.
* Default real-mode opt-in guard: PASS; without `--real-model` it makes no
  provider call.
* No local test or real-smoke path reached Production D1, Candidate, Buffer,
  Queue, Cron, LINE, Finance, Master Data, or official write behavior.

## Post-run structural boundary forensic

This section is additive and does not rewrite the historical RUN-1 result. The
verified V2 path is `runAmbientExtractionV2Batch` →
`buildAmbientV2Request` → `AmbientV2DirectRestAdapter` →
`DirectWorkersAiRestAdapter` → `envelope.result` → model `response` text →
`parseAmbientV2Response`. Prompt audit markers pass for the V2 `events[]`
contract, with safe fingerprint `fnv1a32-06698b1e`; no positive old
`decisions[]` contract marker is present. Relation resolution is local and
does not use an AI relation schema.

Future terminal records now carry bounded structural/semantic subtype fields,
safe top-level key/type metadata, event index/field metadata, and no raw
values. The historical RUN-1 ledger predates those fields; its D03, D04, D06,
and D07 subtypes therefore remain `NOT_PERSISTED`. No provider call was made
for this forensic section.

## Relation-only routing conformance correction

This section is additive and does not rewrite the historical RUN-1 result. The
historical RUN-1 plan records the then-observed four provider calls: D03, D04,
D06, and D07. Source and routing tests subsequently identified that the
frozen D06 message is relation-only, so it must not enter the V2 `events[]`
provider path. The current plan is therefore:

```text
HISTORICAL_RUN_1_AI_CALLS = 4
CURRENT_V2_EXPECTED_AI_CALLS_PER_RUN = 3
CURRENT_V2_CALL_SLOTS = D03:event_extraction, D04:event_extraction, D07:event_extraction
D06_ROUTE = RELATION_ONLY
D06_EVENT_AI_CALLS = 0
D06_RELATION_RESOLVER = LOCAL
CALL_PLAN_CORRECTION_REASON = D06_RELATION_ONLY_ROUTING_FIXED
HISTORICAL_RESULT_REWRITE = ABSENT
```

Local conformance tests prove that the exact D06 fixture resolves to D05 with
zero new event and zero provider calls, while FRESH-13 remains a mixed route
and still permits event extraction plus independent relation resolution.

## Single D03 structural diagnostic

After the routing and full local gates passed, one and only one D03 Direct REST
diagnostic call was authorized. It used the unchanged V2 prompt, model,
temperature, and max-token settings. The wrapper's final stdout marker was not
observed, but the durable ledger is complete and is the authoritative bounded
record for this call:

```text
NEW_DIAGNOSTIC_PROVIDER_CALLS = 1
D03_HTTP = 200
D03_PROVIDER_RESPONSE = CONFIRMED
D03_JSON_PARSE = FAIL
D03_STRUCTURAL_STATUS = FAIL
D03_STRUCTURAL_SUBTYPE = INVALID_JSON
D03_FIRST_INVALID_FIELD = NONE
STRUCTURAL_DIAGNOSTIC_SUFFICIENCY = PASS
ORPHAN_ATTEMPTS = 0
TERMINAL_ATTEMPTS = 1
```

The ledger retained only bounded schema metadata; it retained no raw prompt,
model completion, source text, token, or authorization material. No second
call, retry, D04/D06/D07 call, full run, deployment, or Production write was
performed.
