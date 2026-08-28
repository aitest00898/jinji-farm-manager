# Dedicated Keychain Auth Access Recovery Gate — 2026-08-28

## Gate metadata

```text
SOURCE_COMMIT = 888f0a09c26db0c86fb7aea95ada5164eae389eb
BASELINE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
RESULT_COMMIT = NOT_NEEDED
WORKTREE_CLEAN_AT_GATE_START = YES
WORKTREE_CLEAN_AT_GATE_END = YES
PRE_BASELINE_SOURCE_HISTORY = NOT_AVAILABLE
```

## Bounded auth result

The read-only metadata lookup for the dedicated developer Keychain item
(`chicken-line-production-workers-ai` / `default`) returned an item-not-found
status. The credential value was not read, printed, hashed, measured,
persisted, or passed through an environment or argument.

```text
DEDICATED_KEYCHAIN_ITEM = MISSING
KEYCHAIN_LOOKUP_ERROR_CLASS = ITEM_NOT_FOUND
PARENT_DEDICATED_AUTH_AVAILABLE = NO
PARENT_AUTH_SOURCE = NONE
PARENT_AUTH_FAILURE_CLASS = KEYCHAIN_MISSING
CHILD_DEDICATED_AUTH_AVAILABLE = NO
CHILD_AUTH_SOURCE = NONE
CHILD_AUTH_FAILURE_CLASS = KEYCHAIN_MISSING
PARENT_CHILD_AUTH_PARITY = PASS
TOKEN_STATE = UNKNOWN
```

This evidence proves the dedicated item is not available at the expected
service/account. It does not prove that a previously issued token was expired,
revoked, or invalidated.

## Bridge and account audit

The existing bridge expects the same service/account, keeps Keychain stdout in
memory, scrubs credential-bearing environment names from child processes, and
does not expose the general Wrangler fallback to the V2.2 smoke. The smoke's
dedicated-only policy remains intact. The developer account configuration is
present and valid, so account configuration is not the current blocker.

```text
AUTH_BRIDGE_KEYCHAIN_LOOKUP_PRESENT = YES
WRANGLER_FALLBACK_AVAILABLE_IN_GENERAL = YES
DEV_SMOKE_WRANGLER_FALLBACK_DISABLED = YES
ACCOUNT_CONFIG_PRESENT = YES
ACCOUNT_RESOLUTION = PASS
ACCOUNT_RESOLUTION_SOURCE = DEVELOPER_CONFIG
PRODUCTION_AUTH_COUPLING = NO
AUTH_ROOT_CAUSE = KEYCHAIN_ITEM_MISSING
DEDICATED_AUTH_GATE = FAIL
HUMAN_ACTION_REQUIRED = YES
```

No auth bridge implementation change was made. No credential storage was
created or altered, and no Wrangler login/logout/rotation/revocation was
performed.

## Smoke gate outcome and safety

The conditional DEV-SMOKE-8 stopped before provider execution because the
dedicated item was missing. This is not a model, semantic, structured-output,
or provider result.

```text
DEV_SMOKE_8 = NOT_RUN
DEV_SMOKE_PASS_COUNT = NOT_RUN
DEV_SMOKE_PROVIDER_CALLS = 0
RETRIES = 0
MAX_CONCURRENT_AI_CALLS = 1
CURRENT_BLOCKER = KEYCHAIN_ITEM_MISSING
ROOT_CAUSE_LOCATED = YES
HUMAN_LINE_ACCEPTANCE = BLOCKED
PRODUCTION_ACTIVATION = NOT_AUTHORIZED

PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The next action requires a separate credential-restoration decision. This gate
does not create a token, attempt interactive login, rerun the smoke, or reopen
D03.
