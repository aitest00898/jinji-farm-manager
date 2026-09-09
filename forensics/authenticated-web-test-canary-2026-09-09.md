# Authenticated Web Test-Scope Canary Receipt — 2026-09-09

```text
TASK_RESULT=AUTHENTICATED_WEB_TEST_SCOPE_CANARY_FAILED_LOGIN_BLOCKED
SUBAGENT_DISABLED=YES
SUBAGENT_TOTAL_USED=0
WORKERS_AI_CALLS=0
```

## Candidate and preflight

```text
CANARY_WEB_SHA=880f47e5a87f030035e370006fa1472a889b187f
LOCAL_CANARY_ORIGIN=http://127.0.0.1:5173
CANARY_RUNTIME_MODE=canonical_api
CANARY_API_BASE=https://chicken-line-production.jinji-assistant.workers.dev
FIXTURE_WRITE_PATH_ACTIVE=NO
CURRENT_WORKER=b8d5eb49-f032-4180-927d-c428378631ea
CURRENT_DEPLOYED_SOURCE=18c80b5d5b645e6e2deee76b341089ee9217a154
CURRENT_MODEL=@cf/meta/llama-3.1-8b-instruct-fast
HEALTH=HTTP_200
READY=HTTP_200
MIGRATION_0038=APPLIED_VERIFIED
PENDING_MIGRATIONS=0
ACTIVE_CRONS=0 1,4,7,10,22 * * * ; 0 13 * * *
RECOVERY_CRON=ABSENT
```

The local page was served from the exact reviewed build artifact. Its embedded
build SHA and branch matched the candidate. A no-credential browser smoke
confirmed `runtimeMode=canonical_api`, the canonical Worker base, the visible
authentication boundary, and no non-local request before login.

## Human login result

The human entered the credential only in the visible Web login form. Codex did
not read the password, password input value, bearer token, Authorization
header, or login request body.

```text
HUMAN_LOGIN=FAIL
HUMAN_TEST_SCOPE_CONFIRMATION=NOT_REACHED
LOGIN_UI_ERROR=Canonical API rejected the request.
AUTH_HTTP_STATUS=NOT_CAPTURED_BY_POLICY
CANARY_WRITE_ACTIONS_ATTEMPTED=0
```

The failure is not sufficient evidence that the plaintext password itself was
wrong. The deployed Worker source returns flat error objects:

```json
{"error":"invalid_credentials","message":"管理密碼錯誤。"}
```

The Web candidate's parser only recognizes a nested error object of the form
`{ "error": { "code": ..., "message": ... } }`. Therefore a non-2xx Worker
auth response is rendered as the generic English message. The proven finding
is a client/Worker error-contract mismatch; the precise HTTP status and the
password validity were intentionally not inspected.

```text
ERROR_CONTRACT_FINDING=PROVEN_FLAT_WORKER_ERROR_VS_NESTED_CLIENT_PARSER
LIKELY_AUTH_RESULT=WORKER_REJECTED_LOGIN_OR_OTHER_NON_2XX_AUTH_RESPONSE
PASSWORD_WRONG=NOT_PROVEN
SOURCE_FIX_APPLIED_THIS_GATE=NO
```

Per the Gate failure policy, the reviewed candidate was not changed to mask
the failure, and no further login or business write was attempted.

## Test-scope baseline and read-only reconciliation

```text
TEST_SCOPE=金雞測試場 / 測試1舍 / TEST-BATCH-001
TEST_SCOPE_ENVIRONMENT=test
TEST_FLOCK_INITIAL_COUNT=1000
PRE_CANARY_STOCK=963
POST_O3_STOCK=NOT_EXECUTED
POST_REVERSAL_STOCK=NOT_APPLICABLE

PRE_CANARY_FINANCE_ALLOCATED=434838.6
PRE_CANARY_FINANCE_EXPENSE=5500
PRE_CANARY_FINANCE_NET=429338.6
PRE_CANARY_FINANCE_GROSS=4041698
PRE_CANARY_FINANCE_DISTRIBUTIONS=12
PRE_CANARY_FINANCE_ALLOCATIONS=36

POST_FAILURE_STOCK=963
POST_FAILURE_RECORDING_EVENTS=0
POST_FAILURE_OPERATIONAL_ACTIONS=0
POST_FAILURE_OPERATIONAL_EVENTS=15
POST_FAILURE_ABNORMAL_EVENTS=8
POST_FAILURE_FINANCE_CHANGED=NO
```

The post-failure D1 checks were SELECT-only. Two queries had one transient
Cloudflare API authorization response (`7403`) and succeeded on one bounded
retry; the returned values matched the pre-canary baseline. No business row,
stock delta, reversal, Queue write, LINE send, or schema change was observed.

## Canary cases

```text
O4_CANARY=NOT_EXECUTED_LOGIN_BLOCKED
O2_CANARY=NOT_EXECUTED_LOGIN_BLOCKED
A8_CANARY=NOT_EXECUTED_LOGIN_BLOCKED
O3_CANARY=NOT_EXECUTED_LOGIN_BLOCKED
CANONICAL_READBACK=NOT_EXECUTED
IDEMPOTENCY=NOT_EXECUTED
REVERSAL_LINEAGE=NOT_EXECUTED
LOGOUT_REVOCATION=NOT_EXECUTED_NO_SESSION
WRONG_DESTINATION=0_OBSERVED_NO_CANARY_WRITE
DUPLICATE_AUTHORITY=0_OBSERVED_NO_CANARY_WRITE
STOCK_DOUBLE_COUNT=0
A8_STOCK_EFFECT=0_NOT_EXECUTED
TEST_SCOPE_BUSINESS_FACTS_CREATED=0
PRODUCTION_SCOPE_BUSINESS_FACTS_CREATED=0
```

## Safety and readiness

```text
PRODUCTION_DEPLOYED_THIS_GATE=NO
PAGES_DEPLOYED_THIS_GATE=NO
MAIN_MERGE=NO
REMOTE_MIGRATION=NO
SCHEMA_CHANGED=NO
LINE_SEND=0
QUEUE_BUSINESS_WRITES=0
WORKERS_AI_CALLS=0
CRON_CHANGED=NO
RECOVERY_CRON_REMAINS_DISABLED=YES
MODEL_CHANGED=NO

READY_FOR_CANONICAL_API_NORMAL_OPERATION=NO
READY_FOR_WEB_MAIN_MERGE_REVIEW=NO
READY_FOR_PAGES_DEPLOYMENT_AFTER_MAIN_CI=NO
READY_FOR_HUMAN_CANARY_RETRY=NO_ON_THIS_CANDIDATE
```

Required follow-up is a separately reviewed Web error-contract correction that
normalizes the Worker flat error response before any new authenticated canary.
This Gate is stopped with the original candidate and evidence preserved.
