# AMBIENT EXTRACTION V2 DEV-ONLY REPORT

Date: 2026-08-27

## A. Scope and production isolation

V2 is an additive developer-only extraction core. No import was added to the
Production Worker entrypoint, `ambient.ts`, `ambient-dev.ts`, Queue, Cron, D1
write path, Candidate lifecycle, Buffer consumption, LINE delivery, Finance,
Master Data, Correction, or Reconcile path. The only package change is the
fixture-only command `npm run ambient:extraction-v2`.

`REAL_AI_CALLS = 0`, `MIGRATION = NONE`, and `PRODUCTION_DEPLOYMENT = NOT_DONE`.

## B. Frozen Ground Truth

The artifact was created before V2 implementation and remains:

* `schema_version = ambient_extraction_v2`
* `ground_truth_version = 1.0.1` (corrected frozen aggregate metadata)
* `status = FROZEN`
* DEV-SMOKE-8: 8 messages, 6 selected
* D04: cull 2 plus abnormal 2/detail 腳傷, attribution risk HIGH
* Fresh Unseen: 13 cases, including FRESH-13 mixed new-event plus relation

The artifact was not changed at the case-expectation level after tests began.
The version `1.0.1` records an aggregate-accounting correction from `1.0` and
preserves the earlier value in its correction record. Future expectation
changes must create a new version and preserve this history.

The earlier aggregate value `5` was an arithmetic omission of D03's valid
unknown-quantity abnormal event. The corrected frozen aggregate is
`semantic_event_count = 6`: D02, D03, D04 x2, D05, and D07. The case-level
expectations are unchanged; this correction does not move the acceptance
standard.

## C. V2 architecture

`src/ambient-extraction-v2.ts` contains pure functions for:

* strict V2 response parsing and event-level schema diagnostics;
* message-level structural, semantic, and technical statuses;
* system-owned source identity, lineage, quantity-unknown status, and context
  separation;
* conservative reuse of the existing deterministic `parseCommand` path for a
  single mortality/cull form;
* bounded relation-cue detection and pending-pool resolution;
* source-identity technical idempotency;
* message-level partial semantic results and bounded evaluator metrics.

`src/ambient-extraction-v2-rest.ts` is a developer-only adapter interface for
the already-existing Direct Workers AI REST transport. It forwards V2
messages and pins the existing Production model parameters (`1536`, `0`), but
constructing the wrapper does not call a provider.

The V2 command is fixture-only and runs the new tests without a real-model
flag or network transport.

## D. Contract and safety

AI owns only `event`, `quantity`, and optional abnormal `detail`. Top-level
keys and event keys are allowlisted. `quantity = null` is valid and means
unknown. Detail length uses Unicode code points (`Array.from`) and is never
truncated. Malformed JSON, invalid top-level shape, and non-array `events`
fail the whole message closed. Parsed semantic violations remain bounded to
the message/event and never trigger JSON salvage.

D06 is intentionally outside main event extraction. A relation cue is
resolved only against a caller-supplied bounded pending pool; official history
is excluded and no new arbitrary time window is introduced. The resolver can
retain both a new event and a relation intent for one message.

Farm/context resolution is a separate status. An ambiguous context preserves
the semantic event and produces no wrong-farm assignment. Candidate, D1,
Buffer, Queue, LINE, and official writes are not reachable from this module.

## E. Fixture results

The DEV-SMOKE-8 fixture passes the frozen semantic expectations:

* selected coverage: 6/6;
* D02 mortality 2;
* D03 abnormal with unknown quantity and detail 咳嗽;
* D04 cull 2 plus abnormal 2/detail 腳傷;
* D05 mortality 3;
* D06 relation to D05 with no second event;
* D07 mortality 1;
* D01/D08 produce no semantic event or lineage contamination;
* six semantic events in total, one D06 relation, no hallucination, and no
  duplicate mortality-3 event.

FRESH-13 passes as one new mortality event plus one resolved relation. The
remaining Fresh Unseen cases are frozen as future model/evaluator cases and
were not used to alter expectations.

## F. Dedupe and relation boundary

Same-source retry collapse is keyed by source identity plus event ordinal.
Different source identities with the same type and quantity remain separate.
Explicit relation language is required before a relation is attempted.
`RELATION_TIME_BOUNDARY_REQUIRED = YES` for future Production integration if
the existing pending/session lifecycle cannot supply a bounded pool naturally;
this turn does not invent a duration or retry framework.

## G. Metrics and future real-model gate

The batch result reports message count, deterministic resolutions, AI-required
messages, AI attempts, relation resolver calls, extracted/unresolved events,
technical failures, idempotency collapses, token/latency slots, and the
semantic evaluator fields needed for future controlled runs.

The real REST bridge is prepared but no real adapter was invoked. Published
Cloudflare concurrency/rate-limit evidence and the conservative serial or
bounded-concurrency policy remain a prerequisite before real V2 calls. No
concurrency number was guessed.

## H. Tests

* `npm run ambient:extraction-v2 -- --reporter=dot`: 33 passed.
* `npm run check`: TypeScript passed; 49 test files passed; 584 tests passed,
  3 skipped.
* Tests cover strict keys, null quantities, multi-event output, Unicode
  detail length, malformed JSON fail-closed, partial semantic results,
  relation resolution, official-pool exclusion, source idempotency, farm
  separation, transport isolation, no raw source leakage, and REST parameter
  forwarding.
* No test invokes Workers AI. No runtime validation, LINE action, D1 write,
  Candidate write, Buffer consume, Queue action, or deployment was performed.

## I. Files changed

* `src/ambient-extraction-v2.ts`
* `src/ambient-extraction-v2-rest.ts`
* `src/ambient-extraction-v2.test.ts`
* `package.json`
* `forensics/ambient-extraction-v2-design-2026-08-27.md`
* `forensics/ambient-extraction-v2-ground-truth-2026-08-27.json`
* `forensics/ambient-extraction-v2-dev-report-2026-08-27.md`

No Production semantic file was modified.

## J. Next gate

Do not run a human LINE acceptance or Dev Full Flow yet. Before a future real
V2 DEV-SMOKE-8 run, perform the current Cloudflare concurrency/rate-limit
documentation audit, choose conservative execution, and explicitly opt in to
the Direct REST adapter. The future real gate is three runs with stop-on-first
failure; only 3/3 permits two additional runs, and only 5/5 permits Fresh
Unseen or human LINE acceptance.
