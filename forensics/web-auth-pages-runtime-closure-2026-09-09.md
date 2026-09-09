# Web Authenticated API + Pages Runtime Closure Receipt — 2026-09-09

```text
TASK_RESULT=WEB_AUTH_RUNTIME_CLOSURE_LOCAL_RELEASE_CANDIDATE_HUMAN_CANARY_PENDING
SUBAGENT_DISABLED=YES
SUBAGENT_TOTAL_USED=0
WORKERS_AI_CALLS=0
```

## Scope and safety

This receipt records the final local Web authentication and Pages runtime
closure. It does not claim a Production deployment or a Production business
canary. The Worker source was inspected but not changed. Existing untracked
audit artifacts in the Production checkout were preserved.

```text
PRODUCTION_DEPLOYED_THIS_GATE=NO
PAGES_DEPLOYED_THIS_GATE=NO
REMOTE_MIGRATION=NO
REMOTE_SCHEMA_WRITES=0
PRODUCTION_BUSINESS_WRITES=0
TEST_SCOPE_BUSINESS_WRITES=0
LINE_SEND=0
QUEUE_BUSINESS_WRITES=0
CRON_CHANGED=NO
RECOVERY_CRON_REMAINS_DISABLED=YES
MODEL_CHANGED=NO
WORKERS_AI_CALLS=0
MAIN_MERGE=NO
```

## Worker authentication forensic result

The deployed canonical Worker already has the required B-style bearer-session
boundary. The source was not modified in this Gate, so no separate Production
auth release branch is required.

```text
AUTH_ARCHITECTURE=B_EXISTING_BEARER_SESSION_WEB_CLIENT_CLOSED
AUTH_REQUIRED_ROUTES=/api/web/auth/login (public POST); /api/web/auth/session (public GET); /api/web/auth/logout (authenticated POST); all other /api routes require a session
AUTH_VERIFICATION_FUNCTION=sessionFor -> requireSession
ADMIN_SECRET_SOURCE=Worker secret FARM_ADMIN_PASSWORD_HASH
PASSWORD_VERIFICATION=verifyAdminPassword against FARM_ADMIN_PASSWORD_HASH
SESSION_STORAGE=web_admin_sessions; D1 stores only a hash, not the raw token
SESSION_TOKEN=cryptographically random bearer token returned once by login
SESSION_EXPIRATION=30 minutes absolute via WEB_SESSION_TTL_MS
SESSION_REVOCATION=logout marks the session revoked; invalid or expired sessions fail closed
AUTHORIZATION_FORMAT=Authorization: Bearer <token>
CORS_ORIGIN_POLICY=exact allowlist; Authorization is allowed; credentials=false
WORKER_AUTH_SOURCE_CHANGED=NO
PRODUCTION_AUTH_RELEASE_REQUIRED=NO
PRODUCTION_AUTH_RELEASE_BRANCH=N/A
```

The current deployed Worker/runtime identifiers were not changed here:

```text
CURRENT_DEPLOYED_PRODUCTION_SOURCE=afbeab8b6661ad3f3e7e9dca2da75a91d2b734f9
CURRENT_LIVE_WORKER_VERSION=b8d5eb49-f032-4180-927d-c428378631ea
ROLLBACK_TARGET=9ff05ef4-ef4b-4943-8b2c-cab9f8ccfc16
```

## Web release candidate

The Web client now closes the browser-side authentication gap without creating
a second persistence boundary:

```text
WEB_RELEASE_BRANCH=release/web-production-integration-20260909
WEB_RELEASE_BASE_SHA=916b3b65c9827ba623de6ed0361348eb948e39b7
WEB_RELEASE_FINAL_SHA=880f47e5a87f030035e370006fa1472a889b187f
WEB_RELEASE_REMOTE_SHA=880f47e5a87f030035e370006fa1472a889b187f
WEB_RELEASE_LOCAL_BUILD_SHA=880f47e5a87f030035e370006fa1472a889b187f
WEB_AUTH_INTEGRATION=PASS_LOCAL_CONTRACT_UI_SOURCE
WEB_LINE_SHARED_BUSINESS_BOUNDARY=PASS
WEB_BYPASSES_BUSINESS_LAYER=NO
```

Runtime binding is explicit and fail-closed:

```text
PRODUCTION_PAGES_ORIGIN=https://aitest00898.github.io
PRODUCTION_PAGES_PATH=/jinji-web-v14r-lab
PAGES_PRODUCTION_API_BASE=https://chicken-line-production.jinji-assistant.workers.dev
PAGES_PRODUCTION_API_BASE_SOURCE=exact Pages origin/path allowlist in canonical-api.js
PAGES_DEFAULT_RUNTIME_MODE=production_api
LOCALHOST_DEFAULT_RUNTIME_MODE=fixture_local
UNKNOWN_HOST_RUNTIME_MODE=blocked
PRODUCTION_SILENT_FIXTURE_FALLBACK=NO
PAGES_BASE_OVERRIDE_TO_OTHER_HOST=FORBIDDEN
```

The login form sends the password only to the login endpoint. The returned
token is held in a module closure for the current page session, sent as a
dynamic Authorization header, and never placed in localStorage, IndexedDB,
cookies, or URLs. Requests use `credentials: omit`; logout revokes the Worker
session and clears the in-memory token. A 401 returns the UI to the login
boundary and never rewrites a Production/API failure as a fixture write.

The authenticated API shell still labels Lab and Finance read surfaces as
synthetic until their canonical read-model integration is separately closed;
this receipt does not claim full Production read integration.

## Pages mechanism review

The Pages workflow was not changed. It deploys only after a successful `Lab CI`
`workflow_run` for a push to `main`, verifies that the tested SHA is still the
remote `main` SHA, then builds and deploys the Pages artifact.

```text
PAGES_DEPLOY_SOURCE=successful Lab CI workflow_run push on main
PAGES_REQUIRES_MAIN=YES
PAGES_WORKFLOW_CHANGED=NO
PAGES_WORKFLOW_SECURITY=PASS
```

## Local verification

The complete Web test suite passed on the final source before the candidate was
pushed. This includes static checks, 29 unit tests, 31 integration tests,
Finance checks in Chromium and WebKit, actionlint workflow validation, full
Chromium and WebKit journeys, visual checks, and security checks. The final
local Pages artifact was rebuilt with `WEB_RELEASE_FINAL_SHA` and its embedded
build metadata was verified.

```text
WEB_TEST_ALL=PASS
UNIT=29/29
INTEGRATION=31/31
CHROMIUM_E2E=PASS; consoleErrors=0; pageErrors=0; unexpectedRequests=0
WEBKIT_E2E=PASS; consoleErrors=0; pageErrors=0; unexpectedRequests=0
VISUAL=PASS; pixelDiffMobile=0; pixelDiffDesktop=0; overflow=0
SECURITY=PASS
WORKFLOW_ACTIONLINT=PASS
GIT_DIFF_CHECK=PASS
```

## Human-only canary boundary

The human-operated checklist is at
`docs/WEB_AUTHENTICATED_TEST_CANARY_CHECKLIST.md` in the Web repository. No
credential was entered into Codex, no login was executed, and no canary request
was made.

```text
HUMAN_CREDENTIAL_ENTRY_LOCATION=Web login UI only
CREDENTIAL_VISIBLE_TO_CODEX=NO
APPROVED_TEST_SCOPE=金雞測試場 / 測試1舍 / TEST-BATCH-001
TEST_SCOPE_CANARY_REQUESTS=0
READY_FOR_HUMAN_AUTHENTICATED_CANARY=YES_PREPARED_NOT_EXECUTED
READY_FOR_CANONICAL_API_NORMAL_OPERATION=NO
```

The later human canary must confirm the visible label, enter the password only
in the Web form, explicitly select Test when testing, use the approved
farm/house/flock scope, and read back O4/O2/A8/O3 plus correction, reversal,
idempotency, stock, and unchanged Finance. Any wrong scope, unexpected
Production default change, duplicate fact, stock mismatch, or credential leak
is a stop condition.

## Readiness decision

```text
READY_FOR_AUTH_PRODUCTION_RELEASE=NO; Worker auth source unchanged and Pages/main release gate remains
READY_FOR_WEB_MAIN_MERGE=NO; prohibited by this Gate
READY_FOR_PAGES_DEPLOYMENT_AFTER_MAIN_CI=NO; prohibited by this Gate
READY_FOR_HUMAN_AUTHENTICATED_CANARY=YES_PREPARED
READY_FOR_CANONICAL_API_NORMAL_OPERATION=NO; authenticated Test canary and read-back remain pending
```
