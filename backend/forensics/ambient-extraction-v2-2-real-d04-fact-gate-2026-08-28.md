# Ambient Extraction V2.2 — Real D04 Fact Gate

Date: 2026-08-28
Status: `COMPLETED — RESUMED FACT PASS`
Historical initial gate: `NOT_COMPLETED — AUTH_BLOCKED`
Current latest gate: `COMPLETED — RESUMED FACT PASS`
Scope: developer-only V2.2 fact extraction
Production deployment: `NOT_DONE`

## Gate boundary

This gate was limited to one D04 provider attempt using the existing Direct
Workers AI REST transport, the V2.2 `operations[]` / `abnormalities[]` wire,
the pinned Llama 3.2 3B model, temperature `0`, and `max_tokens=1536`.
No Prompt, schema, model, inference setting, semantic evaluator expectation,
or Production path was changed.

## Local implementation and quality gate

The developer-only runner reuses the existing Direct REST adapter and durable
V2 smoke ledger. The terminal record now accepts a bounded V2.2 fact-gate
projection containing statuses, counts, structural class, and attribution
status only. It does not persist source text, fact detail values, raw model
response, Prompt, or credentials.

The exact request builder fixes the developer gate to:

```text
model = @cf/meta/llama-3.2-3b-instruct
temperature = 0
max_tokens = 1536
stream = false
response_format = V2.2 structured response format
```

Local evidence passed before the real gate:

```text
TypeScript = PASS
V2.2 and real-D04 mock/ledger tests = 37 PASS / 1 SKIPPED
Combined targeted regression = 125 PASS / 3 SKIPPED
Full Vitest = 680 PASS / 9 SKIPPED
```

The mocks verified the required separation:

```text
cull/2 + abnormality identity with null quantity = fact PASS; attribution UNRESOLVED
cull/2 + abnormality quantity 2 = fact PASS; attribution PASS
cull/2 + abnormality quantity 3 = fact PASS; attribution FAIL
cull only = fact FAIL; attribution NOT_EVALUATED
```

## Real-call outcome

The single real-run wrapper stopped before constructing a provider request.
The safe Wrangler check reported an expired OAuth session in a non-interactive
environment, and the memory-only auth bridge returned unavailable. Account ID
discovery therefore failed before the child test was started.

No provider attempt was created:

```text
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 0
PROVIDER_REQUEST_SENT = NO
D04_RESULT = NOT_RUN_AUTH_BLOCKED
```

This is an authentication/credential-availability result, not a model,
structured-output, semantic, or attribution result. No retry or fallback was
performed.

## Historical evidence boundary

Earlier V2.1 D03/D04 failures and the V2.1 event-fusion result remain
historical evidence. They were not rewritten by this V2.2 gate. The V2.2
frozen Ground Truth and its separate fact-versus-attribution policy remain
unchanged.

## Production isolation

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Next gate

The only blocker is re-establishing the Wrangler OAuth session through the
approved keyring-backed interactive login. After safe auth verification, a
separate explicit gate may use the unused single D04 attempt. This report does
not authorize an automatic retry, another case, a full smoke run, model
comparison, or Production activation.

## Resumed real D04 fact gate — 2026-08-28

The previously unused attempt was executed once after the dedicated Keychain
API-token path and explicit developer account configuration were independently
verified. The historical auth-blocked result above is retained unchanged.

```text
AUTH_SOURCE = DEDICATED_KEYCHAIN
DEDICATED_AUTH_RETRIEVAL = PASS
ACCOUNT_RESOLUTION = PASS
WIRE_CONTRACT_VERSION = 2.2
MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
PROVIDER_REQUEST_SENT = YES
RETRIES = 0
D04_HTTP = 200
D04_PROVIDER_RESPONSE = CONFIRMED
D04_STRUCTURAL_STATUS = PASS
D04_STRUCTURAL_SUBTYPE = NONE
D04_OPERATION_ITEM_COUNT = 1
D04_ABNORMALITY_ITEM_COUNT = 1
D04_TOTAL_FACT_COUNT = 2
D04_OPERATION_PRESENT = YES
D04_OPERATION_TYPE_PASS = YES
D04_OPERATION_QUANTITY_PASS = YES
D04_ABNORMALITY_PRESENT = YES
D04_ABNORMALITY_DETAIL_PRESENT = YES
D04_ABNORMALITY_DETAIL_MATCHES_EXPECTED = YES
D04_ABNORMALITY_QUANTITY_KIND = NUMBER
D04_FACT_OPERATION_PASS = YES
D04_FACT_ABNORMAL_PASS = YES
D04_FACT_EXTRACTION_PASS = YES
D04_QUANTITY_ATTRIBUTION_STATUS = PASS
V2_2_D04_RESULT = FACT_PASS_ATTRIBUTION_PASS
ATTEMPT_START_COUNT = 1
ATTEMPT_TERMINAL_COUNT = 1
ORPHAN_ATTEMPTS = 0
```

The durable ledger contains one process-start record, one attempt start, one
successful terminal record, and one normal process-exit record. Its bounded
content does not contain source text, fact detail, Prompt, completion,
credential, or authorization header. The V2.1 multi-event-boundary failure
remains historical; this single observation supports the orthogonal V2.2 fact
representation but is not Production, model, or architecture validation.

```text
V2_1_D04_MULTI_EVENT_BOUNDARY = HISTORICAL_FAIL
ORTHOGONAL_REPRESENTATION_IMPROVEMENT = SUPPORTED_BY_ONE_CONTROLLED_OBSERVATION
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The V2.2 repeated mini-suite is the next separately authorized gate. It was
not started by this attempt. No Prompt, schema, model, evaluator expectation,
attribution policy, or Production path was changed.
