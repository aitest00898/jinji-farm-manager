# Ambient Semantic Eval Runner Reliability — 2026-08-27

## Scope

This is developer-only tooling for the direct Cloudflare Workers AI REST
semantic evaluator.  It is not imported by the Production Worker and has no
D1, Queue, LINE, Candidate, Ambient-buffer, operational, abnormal, finance,
or master-data handle.  The Production prompt, decision contract, model,
temperature, and `max_tokens=1536` remain unchanged.

## Reliability contract

Each real attempt uses a new matrix UUID and a new attempt UUID.  Before the
REST request, the child appends and fsyncs an `ATTEMPT_START` record containing
only the matrix/case/run identifiers, model, bounded request-shape fingerprint,
and fixed inference parameters.  The record contains no authorization value,
prompt, completion, source text, or LINE/D1 identifiers.

After normal extraction/evaluation, the child appends either
`ATTEMPT_SUCCESS` or `ATTEMPT_FAILURE`.  A process crash between START and the
terminal record is represented as `ORPHAN` by reconstruction; it is never
counted as zero or as a semantic failure.  The durable nine-start limit is
checked before a tenth transport call.

The wrapper also records `PROCESS_STARTED` and `PROCESS_EXITED`, captures only
bounded exit/signal/marker/stderr-class metadata, and reconstructs the report
from JSONL when the child marker is absent.  Telemetry append/read failure is a
hard stop before any provider request.

## Local verification before provider calls

```text
TypeScript = PASS
Targeted semantic/eval/REST/ledger suite = 23 passed / 1 skipped
Full Vitest = 541 passed / 1 skipped
Fixture CLI = PASS (11/11)
Direct REST adapter request-shape tests = PASS
Fault-injection coverage = PASS
Secret/raw prompt/raw completion persistence checks = PASS
```

The local fault-injection suite covers successful terminal projection, HTTP
failure, fetch rejection, timeout, malformed provider response handling,
telemetry failure before transport, durable nine-start enforcement, orphan
reconstruction, matrix isolation, and bounded semantic projection.  It does
not treat a child process abnormal exit as a provider semantic result.

## New matrix evidence

```text
MATRIX_RUN_ID = 0b1327ef-ac43-43ea-b552-99eb75a49896
ATTEMPT_START = 9
ATTEMPT_TERMINAL = 8
ORPHAN = 1 (FULL_SELECTED run 3)
PROVIDER_RESPONSE_CONFIRMED = 8
TRANSPORT_FAILURE_TERMINALS = 0
PROCESS_EXIT_CODE = 1
PROCESS_SIGNAL = null
MARKER_SEEN = false
STDERR_CLASS = NONEMPTY
AUTOMATIC_RETRY = 0
```

The wrapper reconstruction is working: it reports the ninth possible attempt
and identifies the exact orphan case.  End-to-end terminal completeness is
not green because C3 did not produce a terminal record.  The eight completed
provider responses were all HTTP 200 and JSON-valid, but all eight failed
Production decision validation with the bounded class `invalid_event_schema`:

```text
D03_ALONE: 3/3 response-confirmed, 1/1 decision coverage, validation 0/3
D05_D06: 3/3 response-confirmed, 2/2 decision coverage, validation 0/3
FULL_SELECTED C1-C2: 2/2 response-confirmed, 4/6 coverage, validation 0/2
FULL_SELECTED C3: orphan after write-ahead START
```

No semantic capability conclusion is valid from this run.  The schema-invalid
responses are evidence for a model-output/contract-format investigation, not
proof of D03, support, or batch capability failure.  No additional attempt is
authorized by this artifact.

## Explicit stop state

```text
RUNNER_RELIABILITY_LOCAL_GATE = PASS
RUNNER_RELIABILITY_REAL_MATRIX_TERMINAL_COMPLETENESS = FAIL
REAL_MATRIX_SEMANTIC_CONCLUSION = NOT_READY
PRODUCTION_DEPLOYMENT = NOT_DONE
DEV_SMOKE_8 = 8 locked / 8 buffered / 0 processed
READY_FOR_DEV_SMOKE_RERUN = NO
READY_FOR_DEV_FULL_FLOW = NO
```

Future work requires a separate authorization to inspect/fix the C3 child
termination path and then obtain a fresh call budget.  It must not reuse this
matrix as if it were a complete 9-result capability measurement.
