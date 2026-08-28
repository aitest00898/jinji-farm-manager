# REAL-MODEL EVENT SCHEMA FORENSIC REPORT

## Scope and evidence boundary

This review uses only the durable evidence for matrix
0b1327ef-ac43-43ea-b552-99eb75a49896. No Workers AI call, rerun, Prompt
change, model change, deployment, D1 write, source consume, or LINE operation
was performed in this round.

There are eight confirmed provider responses and one orphaned write-ahead
attempt. The eight responses have bounded HTTP 200/provider-response,
JSON-pass, normalization-pass, and invalid_event_schema validation evidence.
The raw completion, raw Prompt, and raw source text were not persisted by the
old runner and are intentionally not reconstructed.

## A. Eight confirmed response summary

| Case/run | HTTP/provider | JSON | Normalization | Decision count | Coverage | Validation | Field-level evidence |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| D03_ALONE A1-A3 | 200 / confirmed, each | PASS | PASS | 1 each | 1/1 each | invalid_event_schema | NOT_PERSISTED |
| D05_D06 B1-B3 | 200 / confirmed, each | PASS | PASS | 2 each | 2/2 each | invalid_event_schema | NOT_PERSISTED |
| FULL_SELECTED C1-C2 | 200 / confirmed, each | PASS | PASS | 4 each | 4/6; missing safe refs m3,m6 | invalid_event_schema | NOT_PERSISTED |
| FULL_SELECTED C3 | provider response unknown after START | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | ORPHAN |

The ledger fields named validDecisionCount=1, 2, and 4 are the old report's
accounted-source count, not schema-valid decision count. They cannot be used
as proof that any event passed event-schema validation.

~~~text
CONFIRMED_PROVIDER_RESPONSES = 8
JSON_PASS = 8/8
EVENT_SCHEMA_PASS = 0/8
INVALID_EVENT_SCHEMA = 8/8
~~~

The 8/8 invalid result is a run-level validation classification. It does not
identify the failing field.

## B. Exact validator and conditions

The effective gate is:

~~~text
INVALID_EVENT_SCHEMA_VALIDATOR =
checkAmbientSelectedSourceCoverage
src/ambient.ts:2275-2397
~~~

The extraction path calls it after strict JSON parsing and normalization, at
src/ambient.ts:2504-2572. If it returns invalid, the path returns
validation=schema_invalid, does not build a system Candidate bundle, and does
not reach enrichment, resolve, reconcile, write, or consume.

For a selected decision with kind=event, the effective validator requires:

- type is exactly mortality, cull, or abnormal;
- raw is a non-empty string of at most 160 characters;
- confidence is exactly low, medium, or high;
- quantityConfidence is exactly unknown, low, medium, or high;
- quantity is null for abnormal;
- for other event types, quantity is null or a finite positive number no
  greater than 1,000,000;
- optional farmText, houseText, flockText, and caretakerText are
  null/undefined or bounded strings.

The decision must also be an object, use a valid selected request-local ref,
and use one of the three legal kinds. A malformed decision or failed event
condition sets the bounded class invalid_event_schema. A malformed support
target is separately classified as invalid_support_target.

The value-free diagnostic helper is:

~~~text
inspectAmbientDecision
src/ambient.ts:1494-1532
~~~

It can distinguish missing fields, invalid enums, invalid field types,
quantity nullability, and support-target format. It was not available in the
old matrix ledger, so it cannot retroactively classify the eight responses.

There is one source-level contract observation, not a proven cause of this
matrix: the exported JSON schema declares additionalProperties=false, while
the effective coverage validator does not reject unknown keys inside a
decision and the normalizer drops unknown keys. New bounded diagnostics now
record only unknownKeysPresent and allowlisted key names for future runs; no
semantic behavior was changed.

## C. Per-run bounded schema diagnostics

The durable rows contain the following safe facts:

| Run group | Parsed decision count | Parsed event/support/ignore kind counts | First issue path/expected/actual | Invalid event count |
| --- | ---: | --- | --- | ---: |
| A1-A3 | 1 | NOT_PERSISTED | NOT_PERSISTED | 1 per completed run |
| B1-B3 | 2 | NOT_PERSISTED | NOT_PERSISTED | 1 per completed run |
| C1-C2 | 4 | NOT_PERSISTED | NOT_PERSISTED | 1 per completed run |
| C3 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

The in-memory transport layer had parsed-kind counters, but the old
safeMetrics rows did not retain those counters or the normalized decisions.
The stored eventCount=0 is the empty post-validation system snapshot, not
proof that the model emitted zero event decisions.

This is why the historical answers are deliberately:

~~~text
PRIMARY_EVENT_SCHEMA_FAILURE = UNKNOWN
PRIMARY_FAILURE_FREQUENCY = UNKNOWN/8
SYSTEMATIC_MODEL_CONTRACT_VIOLATION = INCONCLUSIVE
SYSTEMATIC_FIELD = UNKNOWN
~~~

## D. D03 unknown-quantity audit

The canonical contract representation is:

~~~text
kind=event
type=abnormal
quantity=null
quantityConfidence=unknown
raw=bounded non-empty string
confidence=low|medium|high
~~~

The Prompt, TypeScript type, JSON schema, normalizer, validator, and system
builder all allow this representation. The validator explicitly requires
quantity=null for abnormal. Therefore the contract is representable, but the
historical A1-A3 field values and issue paths are not persisted.

~~~text
D03_EVENT_SCHEMA_VALID = UNKNOWN
D03_UNKNOWN_QUANTITY_SCHEMA_VALID = UNKNOWN
CANONICAL_UNKNOWN_QUANTITY_REPRESENTATION = quantity=null; quantityConfidence=unknown
~~~

No D03 model-capability conclusion is valid until a response is schema-valid
and reaches the semantic evaluator.

## E. D05 simple mortality event

The contract can represent:

~~~text
kind=event
type=mortality
quantity=3
quantityConfidence=high|medium|low|unknown
raw=bounded non-empty string
confidence=low|medium|high
~~~

The B1-B3 rows show two accounted decisions per run, but do not retain their
kind or field values. Consequently:

~~~text
D05_SIMPLE_EVENT_SCHEMA_VALID = UNKNOWN
B_PAIR_EVENT_SCHEMA_STATUS = UNKNOWN
~~~

It is not safe to attribute the pair failure to D06 support until D05's event
decision is independently known to pass the schema gate.

## F. D06 support audit

The legal support shape is:

~~~text
ref=<selected request-local ref>
kind=support
targetRef=<selected event ref>
~~~

For the pair fixture, D05 precedes D06, so a back-reference is allowed. The
validator collects event refs before checking support targets; the target must
be a selected event ref and cannot be context-only or self-targeting.

The B1-B3 durable rows do not retain decision kinds or targetRef, so:

~~~text
D06_SUPPORT_SCHEMA_VALID = UNKNOWN
SUPPORT_TARGET_EVIDENCE = NOT_PERSISTED
~~~

The source contract itself is end-to-end representable; no deterministic
support contradiction was found. The support task still requires the model to
recognize non-new-event wording, choose support, find the target, and
distinguish it from an independent same-type event.

## G. Full-batch evidence

For C1 and C2:

~~~text
accounted refs = m2,m4,m5,m7
missing refs = m3,m6
decision count = 4
event/support/ignore kind counts = NOT_PERSISTED
event schema valid count = NOT_PERSISTED
~~~

Thus source coverage and event-schema validity cannot be conflated. The
durable record proves 4/6 source accounting and a run-level schema rejection;
it does not prove which of the four accounted decisions were valid events or
whether D03/D06 were omitted versus schema-invalid.

## H. Prompt, schema, and normalization comparison

The current executable Prompt is in src/ambient.ts:2399-2409. It states the
field names and enum rules, including abnormal quantity=null and
quantityConfidence=unknown, but it contains only the short top-level skeleton
{"decisions":[...]}.

~~~text
EVENT_EXAMPLE_PRESENT = NO
UNKNOWN_QUANTITY_EXAMPLE_PRESENT = NO
SUPPORT_EXAMPLE_PRESENT = NO
~~~

The current model-owned contract is in src/ambient.ts:37-159:

~~~text
event required fields = 7
event optional fields = 4
support required fields = 3
ignore required fields = 2
MODEL_OUTPUT_SCHEMA_COMPLEXITY = MEDIUM
~~~

The normalizer is normalizeAmbientAiExtraction at src/ambient.ts:1098-1137.
It performs only deterministic operations: trimming request-local refs,
mapping the explicitly supported type aliases, mapping numeric confidence to
the existing confidence enum, and copying known fields. It cannot safely
invent a missing raw, kind, targetRef, quantity, or confidence value.

~~~text
SAFE_DETERMINISTIC_NORMALIZATION_POSSIBLE = PARTIAL
~~~

No normalization repair was added in this round.

## I. C3 orphan

C3 has a durable ATTEMPT_START, followed by process exit code 1, no final
marker, non-empty stderr class, and no terminal attempt record. The exact
child exception was not persisted.

~~~text
C3_ORPHAN_ROOT_CAUSE =
CHILD_ABNORMAL_EXIT_AFTER_START_BEFORE_TERMINAL_RECORD; exact exception UNKNOWN
~~~

The developer-only wrapper now appends ATTEMPT_UNKNOWN_TERMINATION with
bounded exit code/signal metadata when a child exits abnormally. This does not
rewrite historical C3 and does not turn unknown termination into semantic
success or failure.

~~~text
C3_UNKNOWN_TERMINATION_RECORD = PASS
NEW_AI_CALLS = 0
~~~

## J. Root cause and next action

The eight responses establish a model-output/schema compatibility blocker, not
a D03 capability result, D06 capability result, or batch-interference result.
The exact field-level cause is unavailable because the old ledger persisted
only the broad failure class and post-validation empty semantic snapshot.

~~~text
PRIMARY_EVENT_SCHEMA_FAILURE = UNKNOWN
SECONDARY_EVENT_SCHEMA_FAILURE = NONE_CONFIRMED
CONFIDENCE = LOW
D03_MODEL_CAPABILITY_RISK = INCONCLUSIVE
SUPPORT_MODEL_CAPABILITY_RISK = INCONCLUSIVE
BATCH_INTERFERENCE = INCONCLUSIVE
READY_FOR_MINIMAL_SCHEMA_FIX = NO
READY_FOR_PROMPT_FIX = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_ARCHITECTURE_REDESIGN = NO
~~~

The new developer-only bounded diagnostics are wired through:

~~~text
extractAmbientCandidates
→ AmbientExtractionResult.decisionSchemaDiagnostics
→ AmbientSemanticEvalReport
→ safe attempt ledger metrics
~~~

They retain only safe key names, field type classes, allowlisted status
values, safe ordinal/ref status, and bounded issue metadata. They retain no
raw completion, Prompt, source text, user/group/message ID, secret, or
reasoning. They do not repair input or change validation.

## K. Tests and safety

~~~text
TypeScript = PASS
Full Vitest = 45 files; 544 passed, 1 skipped
SCHEMA-DIAG tests = PASS
RUNNER-TERM tests = PASS
NEW_AI_CALLS = 0
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_LINE_SEND = PASS
PRODUCTION_DEPLOYMENT = NOT_DONE
~~~

The existing safety snapshot remains unchanged for this read/diagnostics
round. DEV-SMOKE-8 was not replayed, extended, consumed, or restored.

## Final gates

~~~text
CONFIRMED_PROVIDER_RESPONSES = 8
JSON_PASS = 8/8
EVENT_SCHEMA_PASS = 0/8
INVALID_EVENT_SCHEMA = 8/8
PRIMARY_EVENT_SCHEMA_FAILURE = UNKNOWN
PRIMARY_FAILURE_FREQUENCY = UNKNOWN/8
SECONDARY_EVENT_SCHEMA_FAILURE = NONE_CONFIRMED
SYSTEMATIC_MODEL_CONTRACT_VIOLATION = INCONCLUSIVE
SYSTEMATIC_FIELD = UNKNOWN
D03_EVENT_SCHEMA_VALID = UNKNOWN
D03_UNKNOWN_QUANTITY_SCHEMA_VALID = UNKNOWN
D05_SIMPLE_EVENT_SCHEMA_VALID = UNKNOWN
D06_SUPPORT_SCHEMA_VALID = UNKNOWN
SAFE_DETERMINISTIC_NORMALIZATION_POSSIBLE = PARTIAL
EVENT_EXAMPLE_PRESENT = NO
UNKNOWN_QUANTITY_EXAMPLE_PRESENT = NO
SUPPORT_EXAMPLE_PRESENT = NO
MODEL_OUTPUT_SCHEMA_COMPLEXITY = MEDIUM
C3_ORPHAN_ROOT_CAUSE = CHILD_ABNORMAL_EXIT_AFTER_START_BEFORE_TERMINAL_RECORD; exact exception UNKNOWN
C3_UNKNOWN_TERMINATION_RECORD = PASS
D03_MODEL_CAPABILITY_RISK = INCONCLUSIVE
SUPPORT_MODEL_CAPABILITY_RISK = INCONCLUSIVE
BATCH_INTERFERENCE = INCONCLUSIVE
NEW_AI_CALLS = 0
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_LINE_SEND = PASS
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_MINIMAL_SCHEMA_FIX = NO
READY_FOR_PROMPT_FIX = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_ARCHITECTURE_REDESIGN = NO
READY_FOR_DEV_SMOKE_RERUN = NO
READY_FOR_DEV_FULL_FLOW = NO
~~~
