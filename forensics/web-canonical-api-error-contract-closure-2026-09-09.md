# Web Canonical API Error-Contract Closure Receipt

Date: 2026-09-09

## Scope

This receipt covers the Web-only canonical API error-contract correction. It
does not authorize or record a login retry, business canary, Worker deploy,
Pages deploy, remote migration, schema write, LINE send, Queue write, Cron
change, model change, or main merge.

## Source and handoff

```text
WEB_REPOSITORY = /Users/joe/Ai DEV/jinji-web-v14r-lab
WEB_BRANCH = release/web-production-integration-20260909
WEB_BASE_SHA = 880f47e5a87f030035e370006fa1472a889b187f
WEB_FINAL_SHA = 99f489b9f9fb7e0f49a4465a10fe1c4c26ff0627
WEB_REMOTE_SHA = 99f489b9f9fb7e0f49a4465a10fe1c4c26ff0627
WEB_PUSH = NORMAL_FAST_FORWARD
WORKER_SOURCE_CHANGED = NO
```

The final Web commit contains only the shared client error normalizer, safe
UI mapping, regression tests, and the Web error-contract document. It does
not add an endpoint-specific persistence implementation.

## Proven finding and correction

The current Worker source at deployed source SHA
`18c80b5d5b645e6e2deee76b341089ee9217a154` emits the flat envelope:

```json
{ "error": "invalid_credentials", "message": "..." }
```

The failed authenticated Web canary used a candidate whose client only read
`error.code`. That mismatch is the proven cause of the generic UI message;
password validity was not proven and was not investigated.

The final Web client now normalizes both flat and nested envelopes through
`normalizeCanonicalApiError(payload, httpStatus)`. Malformed, non-object,
missing-code, non-string-code, and non-JSON payloads fail closed to a bounded
HTTP fallback. HTTP status is retained internally. Login, record create,
correction, reversal, and records read all use this same boundary.

The UI maps known codes, including `invalid_credentials`, to bounded copy:

```text
登入未通過，請確認管理密碼後再試。
```

Unknown codes and raw Worker messages are not displayed. No password, token,
Authorization header, or login request body was inspected or recorded.

## Verification

```text
NORMALIZER_FLAT_KNOWN = PASS
NORMALIZER_NESTED_KNOWN = PASS
NORMALIZER_FLAT_UNKNOWN = PASS
NORMALIZER_NESTED_UNKNOWN = PASS
NORMALIZER_MISSING_MESSAGE = PASS
NORMALIZER_MISSING_OR_INVALID_CODE = PASS
NORMALIZER_NULL_NON_OBJECT_NON_JSON = PASS
NORMALIZER_HTTP_STATUS = 400/401/403/404/409/429/500 PASS
FAILED_LOGIN_AUTH_STATE = token_null
PROTECTED_401_CLEARS_MEMORY_AUTH = PASS
INVALID_SUCCESS_AUTH_RESPONSE = clears_and_rejects
CREATE_CORRECT_REVERSE_SHARED_NORMALIZER = PASS
NO_LOCAL_FIXTURE_FALLBACK_ON_API_ERROR = PASS
```

Local Web regression completed against the final source:

```text
STATIC = PASS
UNIT = 32/32
INTEGRATION = 32/32
FINANCE_CHROMIUM = PASS
FINANCE_WEBKIT = PASS
WORKFLOW_ACTIONLINT = PASS
CHROMIUM_E2E = PASS
WEBKIT_E2E = PASS
VISUAL = PASS_PIXEL_DIFF_0
SECURITY = PASS
GIT_DIFF_CHECK = PASS
```

The first in-sandbox `npm run test:all` attempt stopped at
`FINANCE_SERVER_TIMEOUT` because the sandbox prohibited its disposable local
server from binding a test port. The exact same suite was then rerun with
approved local-only execution permissions and passed; no Production Worker
request was made by the suite.

## Safety and decision

```text
PRODUCTION_BUSINESS_WRITES = 0
TEST_SCOPE_BUSINESS_WRITES = 0
REMOTE_MIGRATION = NO
REMOTE_SCHEMA_WRITES = 0
PRODUCTION_DEPLOYED_THIS_GATE = NO
PAGES_DEPLOYED_THIS_GATE = NO
LINE_SEND = 0
QUEUE_BUSINESS_WRITES = 0
CRON_CHANGED = NO
RECOVERY_CRON_REMAINS_DISABLED = YES
MODEL_CHANGED = NO
WORKERS_AI_CALLS = 0
MAIN_UNCHANGED = YES
READY_FOR_HUMAN_LOGIN_RETRY = YES
```

This receipt closes the Web error-contract Gate only. It does not claim the
previous authenticated Test-scope canary succeeded. A separate human-only
login retry may now be considered against the pushed Web candidate; no retry
was executed here.
