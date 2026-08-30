# Ambient Extraction V2 Structured Output Integration — 2026-08-27

This report records the developer-only integration gate and the resulting
pre-transport authentication block. It contains no raw prompt, source
message, model completion, detail value, credential, or authorization header.

## Scope

* Production V1, Worker entrypoint, Prompt, model, inference parameters, D1,
  Queue, Cron, Candidate, Buffer, LINE, and migrations were unchanged.
* Structured output remains developer-only.
* The existing structured request schema and response boundary were reused;
  no second schema/parser implementation was introduced.

## Integration result

The normal developer V2 execution path now has an explicit structured mode:

```text
executionMode = STRUCTURED_OUTPUT
request builder = shared buildAmbientV2StructuredRequest
response boundary = shared parseAmbientV2ResponseBoundary
```

The existing V2 batch semantics and strict validator remain unchanged. Text
responses still use the strict text JSON path, while structured object
responses are validated directly.

The real-runner ledger now records only bounded event telemetry per valid event:
event ordinal, canonical enum, quantity kind, detail presence/shortness,
detail code-point count, exact-match booleans, and previous-event equality.
Actual detail values are not persisted.

## Local quality gate

```text
TYPESCRIPT = PASS
TARGETED_V2_STRUCTURED_REST_RUNNER_AUTH_TESTS = 84 passed / 2 skipped
FULL_VITEST = 623 passed / 6 skipped
REAL_MODE_FLAGS_DURING_LOCAL_TESTS = DISABLED
PROMPT_FINGERPRINT_CHANGED = NO
PRODUCTION_V1_IMPORTS_DEVELOPER_V2_STRUCTURED_PATH = NO
```

## Authorized D03 attempt

The wrapper was started with the explicit one-call D03 authorization. It
stopped before provider transport because safe account/auth discovery found:

```text
WRANGLER_WHOAMI_LOGGED_IN = FALSE
KEYRING_TOKEN_AVAILABLE = FALSE
PROVIDER_REQUEST_SENT = NO
REAL_AI_CALLS = 0
```

No retry, alternate credential source, credential print, or provider call was
performed. Therefore D03 HTTP, structured response, structural status, event
telemetry, and semantic result are all `NOT_RUN` for this turn. This result is
an authentication/tooling block and must not be interpreted as model failure.

## Safety

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
LINE_SEND = 0
QUEUE_WRITE = 0
MIGRATION = NONE
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Final gates

```text
AGENTS_PATH = CORRECT
STRUCTURED_OUTPUT_CAPABILITY = CLOSED_PASS
STRUCTURED_OUTPUT_V2_IMPLEMENTATION_STATUS = DEV_V2_INTEGRATED
ALL_LOCAL_TESTS = PASS
CURRENT_V2_EXPECTED_AI_CALLS_PER_RUN = 3
D06_RELATION_ONLY = PASS

REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 0
D03_HTTP = NOT_RUN
D03_STRUCTURED_RESPONSE = NOT_RUN
D03_STRUCTURAL_STATUS = NOT_RUN
D03_EVENT_COUNT = NOT_RUN

EVENT_1_ENUM = NOT_RUN
EVENT_1_QUANTITY_KIND = NOT_RUN
EVENT_1_DETAIL_PRESENT = NOT_RUN
EVENT_1_DETAIL_VALID_SHORT = NOT_RUN
EVENT_1_DETAIL_CODEPOINT_COUNT = NOT_RUN
EVENT_1_DETAIL_MATCH_EXPECTED_EXACT = NOT_RUN
EVENT_1_MATCHES_EXPECTED_D03 = NOT_RUN
EVENT_2_ENUM = NOT_RUN
EVENT_2_QUANTITY_KIND = NOT_RUN
EVENT_2_DETAIL_PRESENT = NOT_RUN
EVENT_2_DETAIL_VALID_SHORT = NOT_RUN
EVENT_2_DETAIL_CODEPOINT_COUNT = NOT_RUN
EVENT_2_DETAIL_MATCH_EXPECTED_EXACT = NOT_RUN
EVENT_2_MATCHES_EXPECTED_D03 = NOT_RUN
EVENT_2_EQUALS_EVENT_1 = NOT_RUN

PRIMARY_EXPECTED_EVENT_PRESENT = NOT_RUN
EXPECTED_EVENT_MATCH_COUNT = NOT_RUN
EXTRA_EVENT_COUNT = NOT_RUN
NEXT_SEMANTIC_PROBLEM = NOT_RUN

NO_RAW_DETAIL_PERSISTENCE = PASS
NO_RAW_COMPLETION = PASS
NO_JSON_REPAIR = PASS
NO_RAW_SALVAGE = PASS

PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_MINIMAL_SEMANTIC_FIX = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```
