# Ambient Extraction V2.2 Transport Observability Minimal Fix

Date: 2026-08-28
Scope: developer-only bounded transport diagnostics followed by the one
authorized V2.2 DEV-SMOKE-8 gate.

## Boundary

This task did not change Auth, `.dev.secrets.local`, the token, Prompt,
schema, model, temperature, max tokens, timeout value, retry policy,
deterministic routing, relation logic, Production behavior, D1, Queue, LINE,
migration, or deployment. No readiness or token-verification request was made
in this task.

## Minimal observability fix

The existing provider `fetch` catch in
`src/ambient-semantic-eval-rest.ts` remains the single high-level
`NETWORK_FAILURE` boundary. It now adds a bounded `TRANSPORT_SUBTYPE` using
only safe runtime fields: error name/code/errno and cause name/code. The
allowed classifications cover DNS, connection refused/reset, connect timeout,
TLS, Undici, socket, invalid request, abort, and unknown failures.

The implementation never reads or stores an error message or stack. The
existing internal timer remains `PROVIDER_TIMEOUT`; a timer-triggered abort is
not reclassified as a generic network subtype. The existing ledger record
shape was not changed. V2.2 attempt results carry only bounded subtype,
safe error name/code/cause fields, and elapsed milliseconds for the current
developer smoke report.

## Local validation before the provider gate

```text
TYPESCRIPT = PASS
TARGETED_REST_AND_V2_2_TESTS = PASS (70 passed / 3 skipped)
FULL_VITEST = PASS (710 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
RAW_ERROR_MESSAGE_STACK_TOKEN_TESTS = PASS
TIMEOUT_REMAINS_PROVIDER_TIMEOUT = PASS
```

The code change was committed separately from pre-existing documentation
changes:

```text
COMMIT = e18ef8d
COMMIT_MESSAGE = fix: preserve bounded provider transport subtype
```

## Single V2.2 DEV-SMOKE-8 result

The existing serial developer runner was executed exactly once after the
local gate. It used the existing developer secret loader, the frozen Llama
3.2 3B model, the existing V2.2 structured request, max concurrency one, and
zero retries.

```text
AUTH_SOURCE = DEV_SECRETS_LOCAL
WIRE_CONTRACT_VERSION = 2.2
MODEL = @cf/meta/llama-3.2-3b-instruct
TEMPERATURE = 0
MAX_TOKENS = 1536
EXECUTION_MODE = SERIAL
MAX_CONCURRENT_AI_CALLS = 1
RETRIES = 0

PROVIDER_ATTEMPTS = 2
HTTP_RESPONSES = 2
PROVIDER_CONFIRMATIONS = 2
CONFIRMED_INFERENCE_CALLS = 2
ACTUAL_PROVIDER_SIDE_INFERENCE = CONFIRMED
TRANSPORT_FAILURES = 0
```

Both residual attempts completed successfully:

```text
D03_PROVIDER_CALLS = 1
D03_HTTP = 200
D03_PROVIDER_RESPONSE = CONFIRMED
D03_STRUCTURAL_STATUS = PASS
D03_FACT_EXTRACTION_PASS = YES
D03_TRANSPORT_SUBTYPE = NONE

D04_PROVIDER_CALLS = 1
D04_HTTP = 200
D04_PROVIDER_RESPONSE = CONFIRMED
D04_STRUCTURAL_STATUS = PASS
D04_FACT_EXTRACTION_PASS = YES
D04_QUANTITY_ATTRIBUTION_STATUS = UNRESOLVED
D04_TRANSPORT_SUBTYPE = NONE
```

The frozen D04 attribution policy remains unchanged: fact extraction passed,
while the bounded attribution status remains `UNRESOLVED`; this did not alter
the existing V2.2 smoke acceptance rule.

The local paths also remained bounded:

```text
D06_PROVIDER_CALLS = 0
D06_RELATION_ONLY_PASS = YES
D07_PROVIDER_CALLS = 0
D07_FACT_EXTRACTION_PASS = YES
```

Overall smoke and process accounting:

```text
DEV_SMOKE_8 = PASS
DEV_SMOKE_PASS_COUNT = 8
DEV_SMOKE_TOTAL = 8
DEV_SMOKE_FAILED_CASE = NONE
ATTEMPT_START_COUNT = 2
ATTEMPT_TERMINAL_COUNT = 2
ORPHAN_ATTEMPTS = 0
INVALID_LEDGER_LINES = 0
PROCESS_EXIT = NORMAL
WRAPPER_MARKER = PRESENT
WRAPPER_STATUS = PASS
```

No retry or second smoke run was performed. No raw source, raw completion,
provider prose, credential, Authorization header, error message, or error
stack was retained.

## Production isolation and next gate

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
PROMPT_CHANGED = NO
SCHEMA_CHANGED = NO
MODEL_CHANGED = NO
TIMEOUT_MS = 30000 (UNCHANGED)
```

This gate is complete and stops here. The bounded transport subtype fix is
validated, and the one authorized V2.2 DEV-SMOKE-8 is `PASS`. The next
human-authorized gate may consider the existing human LINE acceptance step;
Production activation remains `NO`.
