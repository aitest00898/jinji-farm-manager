# AMBIENT EXTRACTION V2 STRUCTURAL BOUNDARY FORENSIC

Date: 2026-08-27

Status: `READ-ONLY AUDIT COMPLETE; ZERO NEW PROVIDER CALLS`

This report audits the V2 developer real-smoke path and adds bounded
structural diagnostics. It does not replay the historical provider calls and
does not store raw prompts, completions, source text, credentials, or model
values.

## A. Historical real-smoke evidence

The historical matrix run was
`de96baf1-b6cf-4bcd-a0e6-757078f00309` under experiment
`5d579e1d-2927-44a6-a4ab-7130e934cdb8`. RUN-1 made four attempts for D03,
D04, D06, and D07. All four were HTTP 200 with provider responses confirmed.
The bounded result recorded structural failure for all four AI-required
messages; D02 and D05 came from the deterministic fast path. The historical
ledger contains no precise structural subtype and no raw completion, so:

```text
HISTORICAL_D03_SUBTYPE = NOT_PERSISTED
HISTORICAL_D04_SUBTYPE = NOT_PERSISTED
HISTORICAL_D06_SUBTYPE = NOT_PERSISTED
HISTORICAL_D07_SUBTYPE = NOT_PERSISTED
```

The historical aggregate failure class was
`SEMANTIC_EXPECTATION_MISMATCH`, while the bounded message snapshots said
`structuralStatus = fail`. This is an observability/classification limitation,
not evidence that semantic evaluation ran successfully.

## B. Exact V2 request call chain

1. `runAmbientExtractionV2Batch` in
   `src/ambient-extraction-v2.ts:1021` iterates selected messages and calls
   `buildAmbientV2Request` at `:1093` for each AI-required message.
2. `buildAmbientV2Request` in `src/ambient-extraction-v2.ts:809` creates the
   system instruction plus the user JSON source payload.
3. `DurableV2RestAdapter.run` in
   `src/ambient-extraction-v2-real-runner.ts:518` writes the bounded
   write-ahead record, then calls the V2 REST bridge.
4. `AmbientV2DirectRestAdapter.run` in
   `src/ambient-extraction-v2-rest.ts:50` forwards the messages and pinned
   parameters.
5. `DirectWorkersAiRestAdapter.run` in
   `src/ambient-semantic-eval-rest.ts:177` posts the REST body, parses the
   Cloudflare envelope, and returns only `envelope.result` at `:241`.
6. `parseAmbientV2Response` in `src/ambient-extraction-v2.ts:518` receives
   that result; it extracts the model text before calling `JSON.parse`.

```text
V2_REAL_REQUEST_ENTRY = runAmbientExtractionV2Batch
V2_PROMPT_BUILDER = buildAmbientV2Request
V2_REST_REQUEST_BUILDER = AmbientV2DirectRestAdapter.run
V2_PROVIDER_RESPONSE_EXTRACTOR = DirectWorkersAiRestAdapter.run
V2_JSON_PARSER = parseAmbientV2Response
V2_STRUCTURAL_VALIDATOR = parseAmbientV2Response structural branch
```

## C. Actual V2 prompt contract

Source inspection and contract tests show that the real-smoke path uses
`AMBIENT_V2_SYSTEM_PROMPT`, not the Production `decisions[]` prompt. The safe
fingerprint is `fnv1a32-06698b1e`; static length is 319 UTF-16 code units. No
prompt text is emitted here.

```text
ACTUAL_V2_PROMPT_TOP_LEVEL = EVENTS
ACTUAL_V2_PROMPT_REQUIRES_KIND = NO
ACTUAL_V2_PROMPT_REQUIRES_REF = NO
ACTUAL_V2_PROMPT_REQUIRES_TARGET_REF = NO
ACTUAL_V2_PROMPT_REQUIRES_CONFIDENCE = NO
ACTUAL_V2_PROMPT_REQUIRES_RAW = NO
V2_PROMPT_CONTRACT_MARKERS = PASS
OLD_PROMPT_MARKERS_PRESENT = NO
OLD_CONTRACT_CONTAMINATION = NO
```

The prompt contains negative guard wording for legacy fields such as `kind`,
`raw`, and `confidence`; the audit does not count those prohibitions as old
contract requirements. It has no positive `decisions[]`,
`ignoredSelectedRefs`, source-accounting, support-target, or legacy-field
requirement.

```text
MESSAGE_COUNT = 2
ROLE_SEQUENCE = system,user
MODEL = @cf/meta/llama-3.2-3b-instruct
MAX_TOKENS = 1536
TEMPERATURE = 0
V2_CONTRACT_SELECTED = YES
PROMPT_FINGERPRINT = fnv1a32-06698b1e
```

## D. Provider envelope extraction

The direct adapter handles the Cloudflare outer object
`{success, result, errors}` and returns only `result`. The V2 parser accepts
the model result's `response` string and sends that string to `JSON.parse`. It
does not pass the outer provider envelope to the event validator.

Mock tests cover the successful `result.response` path and reject an outer
provider envelope supplied directly to the V2 parser.

```text
PROVIDER_ENVELOPE_EXTRACTION = PASS
MODEL_TEXT_EXTRACTION_TARGET = result.response via envelope.result
JSON_PARSER_INPUT_CLASS = MODEL_TEXT
```

## E. Bounded structural subtype diagnostics

The parser now reports value-free subtypes without changing acceptance
semantics. Structural-layer examples include `INVALID_JSON`,
`TRUNCATED_JSON`, `TOP_LEVEL_NOT_OBJECT`, `TOP_LEVEL_UNKNOWN_KEY`,
`EVENTS_MISSING`, `EVENTS_NOT_ARRAY`, `UNEXPECTED_OLD_DECISIONS_SHAPE`,
`UNEXPECTED_PROVIDER_ENVELOPE`, and `EMPTY_MODEL_TEXT`. Parsed event-layer
examples include `EVENT_ITEM_NOT_OBJECT`, `EVENT_ITEM_UNKNOWN_KEY`,
`EVENT_MISSING_EVENT`, `EVENT_INVALID_EVENT_ENUM`,
`EVENT_MISSING_QUANTITY`, `EVENT_INVALID_QUANTITY_TYPE`,
`EVENT_INVALID_DETAIL_TYPE`, `EVENT_DETAIL_NOT_ALLOWED`, and
`EVENT_DETAIL_TOO_LONG`.

Structural failures still fail closed. Event-layer diagnostics remain separate
from structural status and preserve existing semantic partial-result behavior.
Only known safe key names or `UNKNOWN` are retained; arbitrary model values
are never retained.

```text
STRUCTURAL_SUBTYPE_PERSISTENCE = PASS (future attempts)
HISTORICAL_STRUCTURAL_SUBTYPE = NOT_PERSISTED
```

Malformed JSON is classified as `TRUNCATED_JSON` only when the runtime reports
an unexpected end and a bounded scanner finds an unfinished JSON structure,
string, or escape. Other parse errors remain `INVALID_JSON`; no repair or
salvage was added.

## F. D06 relation wiring

The conservative fast path refuses D06 relation wording, so the current batch
runner sends D06 through the normal per-message V2 `events[]` extraction. It
then runs `resolveAmbientV2Relation` locally against the bounded pending pool.
The relation resolver does not invoke the AI adapter and does not parse an AI
relation schema.

```text
D06_PROVIDER_CALL_PURPOSE = EVENT_EXTRACTION
RELATION_USES_EVENT_SCHEMA = NO
V2_RELATION_WIRING_BUG = NO
```

This is an audit observation only; this turn does not change the D06 call plan.

## G. D04 and call-plan audit

D04 is one message and one multi-event `events[]` extraction request, not two
separate cull/abnormal calls.

```text
D04_PROVIDER_CALL_COUNT_EXPECTED = 1
D04_PROVIDER_CALL_ARCHITECTURE = PASS
CALL SLOT 1 = D03 / event extraction
CALL SLOT 2 = D04 / multi-event extraction
CALL SLOT 3 = D06 / event extraction; relation resolution local
CALL SLOT 4 = D07 / mixed-chat event extraction
EXPECTED_AI_CALLS_PER_RUN = 4
OBSERVED_HISTORICAL_AI_CALLS_PER_RUN = 4
CALL_PLAN_MATCH = YES
```

D02 and D05 use the existing conservative deterministic fast path. No extra
AI calls were caused by relation resolution or by splitting D04.

## H. Historical recoverability and next gate

No raw completion was saved. The existing ledger retains HTTP status, provider
confirmation, bounded message status, event counts, and coverage, but not the
new subtype fields. No historical value was guessed or rewritten.

The request path, prompt contract, REST envelope extraction, relation wiring,
and new diagnostics tests are source/test consistent. Historical output
compatibility remains `FAIL`; model semantic capability remains
`INCONCLUSIVE`.

```text
READY_FOR_MINIMAL_WIRING_FIX = NO
READY_FOR_ONE_CALL_STRUCTURAL_DIAGNOSTIC = YES
READY_FOR_REAL_V2_DEV_SMOKE_RERUN = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```

## I. Tests and production safety

The local changes cover prompt fingerprinting, envelope separation, structural
subtype classification, bounded event diagnostics, and future terminal-record
persistence. No test invokes Workers AI.

```text
REAL_AI_CALLS = 0
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_OFFICIAL_WRITE = PASS
NO_LINE_SEND = PASS
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Final gates

```text
REAL_AI_CALLS = 0
V2_REAL_REQUEST_ENTRY = runAmbientExtractionV2Batch
V2_PROMPT_BUILDER = buildAmbientV2Request
V2_PROVIDER_RESPONSE_EXTRACTOR = DirectWorkersAiRestAdapter.run
V2_STRUCTURAL_VALIDATOR = parseAmbientV2Response structural branch
ACTUAL_V2_PROMPT_TOP_LEVEL = EVENTS
OLD_CONTRACT_CONTAMINATION = NO
V2_PROMPT_CONTRACT_MARKERS = PASS
V2_PROMPT_FINGERPRINT = fnv1a32-06698b1e
PROVIDER_ENVELOPE_EXTRACTION = PASS
JSON_PARSER_INPUT_CLASS = MODEL_TEXT
STRUCTURAL_SUBTYPE_PERSISTENCE = PASS
HISTORICAL_D03_SUBTYPE = NOT_PERSISTED
HISTORICAL_D04_SUBTYPE = NOT_PERSISTED
HISTORICAL_D06_SUBTYPE = NOT_PERSISTED
HISTORICAL_D07_SUBTYPE = NOT_PERSISTED
D06_PROVIDER_CALL_PURPOSE = EVENT_EXTRACTION
RELATION_USES_EVENT_SCHEMA = NO
V2_RELATION_WIRING_BUG = NO
EXPECTED_AI_CALLS_PER_RUN = 4
OBSERVED_AI_CALLS_PER_RUN = 4
CALL_PLAN_MATCH = YES
CURRENT_V2_REAL_OUTPUT_COMPATIBILITY = FAIL
MODEL_SEMANTIC_CAPABILITY = INCONCLUSIVE
NO_PRODUCTION_D1_WRITE = PASS
NO_BUFFER_CONSUME = PASS
NO_CANDIDATE_WRITE = PASS
NO_LINE_SEND = PASS
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_MINIMAL_WIRING_FIX = NO
READY_FOR_ONE_CALL_STRUCTURAL_DIAGNOSTIC = YES
READY_FOR_REAL_V2_DEV_SMOKE_RERUN = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```
