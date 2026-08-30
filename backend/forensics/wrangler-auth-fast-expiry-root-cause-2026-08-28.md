# Wrangler Auth Root-Cause Forensic — 2026-08-28

> Read-only diagnosis. No login, logout, credential rotation, Workers AI
> request, Production write, or source-code change was performed in this gate.

## Scope and safety boundary

The audit used only bounded status values and metadata. It did not print,
persist, hash, measure, compare, or expose any OAuth/API credential, bearer
header, raw credential-store content, raw CLI output, or raw environment dump.

```text
WORKERS_AI_CALLS = 0
PROVIDER_REQUESTS = 0
LOGIN_ACTIONS = 0
LOGOUT_ACTIONS = 0
AUTH_RETRIEVAL_FAILURE_CONFIRMED = YES
OAUTH_EXPIRED_CONFIRMED = NO
```

## Static auth-path audit

The developer bridge is implemented in
`src/ambient-semantic-eval-auth.ts`:

```text
AUTH_BRIDGE_COMMAND = project-local wrangler auth token --json
AUTH_BRIDGE_ANY_EXCEPTION_COLLAPSES_TO_NULL = YES
ACCOUNT_DISCOVERY_COMMAND = project-local wrangler whoami --json
ACCOUNT_DISCOVERY_ANY_EXCEPTION_COLLAPSES_TO_NULL = YES
WRAPPER_DISTINGUISHES_EXPIRED_FROM_OTHER_AUTH_FAILURE = NO
AUTH_DIAGNOSTIC_BLIND_SPOT = CONFIRMED
```

The V2.2 wrapper is
`scripts/ambient-extraction-v2-2-real-d04.mjs`. It performs account discovery
before spawning the child test, and maps a failed discovery to a bounded
account-discovery blocker. It does not distinguish expiration, missing
keyring material, profile failure, network failure, or other CLI errors.

## Execution-context metadata

```text
PROJECT_LOCAL_WRANGLER_PRESENT = YES
PROJECT_LOCAL_WRANGLER_VERSION = 4.124.0
GLOBAL_WRANGLER_PRESENT = NO
GLOBAL_WRANGLER_VERSION = NOT_INSTALLED
LOCAL_GLOBAL_WRANGLER_VERSION_MATCH = NOT_APPLICABLE
PROJECT_CWD = EXPECTED_PROJECT
HOME_CONTEXT_PRESENT = YES
USER_CONTEXT_PRESENT = YES
NODE_VERSION = v22.23.1
```

No local/global Wrangler version mismatch was found.

## Keyring and credential-store metadata

Only metadata was inspected. The Wrangler preference is enabled, the
encrypted default store exists, and the plaintext default store does not.
The macOS Keychain metadata lookup for the Wrangler/default and known
Cloudflare/default service contexts did not find an item. No Keychain value
was requested.

```text
WRANGLER_KEYRING_ENABLED = YES
ENCRYPTED_STORE_PRESENT = YES
PLAINTEXT_STORE_PRESENT = NO
KEYCHAIN_ITEM_METADATA_PRESENT = NO
KEYRING_STATE = MISSING
```

This is consistent with a stale/orphaned encrypted credential store whose
corresponding keyring material is unavailable. The encrypted-file presence
alone is not evidence that an OAuth credential can be read or refreshed.

## Safe status probes

Two bounded probe rounds were used; no loop or continuous retry was run.

```text
AUTH_PROBE_ROUNDS = 2
RESULT_STABLE_ACROSS_PROBES = YES

WHOAMI_EXIT_CLASS = NONZERO for --json; ZERO for text mode
WHOAMI_JSON_VALID = YES
WHOAMI_JSON_SHAPE = AUTH_FAILURE_SHAPE
WHOAMI_AUTHENTICATED = NO
WHOAMI_ACCOUNT_FIELD_DISCOVERABLE = NO in the failure response
WHOAMI_ACCOUNT_PRESENT = INCONCLUSIVE
WHOAMI_ERROR_CLASS = NOT_LOGGED_IN

AUTH_TOKEN_COMMAND_EXIT_CLASS = NONZERO
AUTH_TOKEN_SINGLE_LINE_RETURNED = NO
AUTH_TOKEN_RETRIEVAL = FAIL
AUTH_TOKEN_ERROR_CLASS = NOT_LOGGED_IN
```

The text-mode status probe produced an unauthenticated status signal. No
current probe supplied direct evidence that an access token had expired.

## Auto-refresh behavior

Installed Wrangler source `node_modules/wrangler/wrangler-dist/cli.js`
contains an OAuth access-token expiry check followed by a refresh-token
exchange. A successful exchange rewrites the encrypted auth state; a failed
exchange returns no usable access token, and non-interactive callers receive
an expired/refresh-failed status. Therefore:

```text
WRANGLER_AUTH_TOKEN_EXPECTS_AUTO_REFRESH = YES
```

That behavior does not prove that this session expired. In this audit the
stronger live evidence is that the keyring item needed to read the encrypted
store was not found and both safe auth retrieval paths were unavailable.

## Parent/child parity

The parent and a temporary test-only child using the same sanitized credential
environment both executed the existing memory-only discovery path.

```text
PARENT_SAFE_AUTH_AVAILABLE = NO
CHILD_SAFE_AUTH_AVAILABLE = NO
PARENT_CHILD_AUTH_PARITY = PASS
```

There is no evidence of a noninteractive child-context-only failure.

## Account discovery compatibility

Installed Wrangler source shows the successful JSON `whoami` shape includes a
top-level `loggedIn` flag and `accounts` collection. The wrapper's bounded
32-hex account-id extraction would have a match when an authenticated account
payload is present; the current failure payload contained no account data.

```text
CURRENT_REGEX_WOULD_MATCH = NO for current failure payload
ACCOUNT_DISCOVERY_IMPLEMENTATION_COMPATIBLE = YES (static shape evidence)
PROFILE_MISMATCH_EVIDENCE = NO
```

The account discovery parser is not the current root cause.

## Root-cause classification

```text
AUTH_STATE_NOW = INVALID for this developer harness
AUTH_ROOT_CAUSE = ACTUALLY_LOGGED_OUT_OR_STORE_MISSING
HUMAN_LOGIN_REQUIRED = YES
READY_FOR_AUTH_CODE_FIX_GATE = NO
READY_FOR_REAL_D04_AFTER_FIX_OR_VALID_AUTH = NO
REAL_D04_THIS_ROUND = NOT_RUN
```

The prior wording “OAuth expired” remains historical wording only. This gate
does not confirm expiration; it confirms that the current Wrangler auth state
cannot supply a usable credential and that the keyring-backed store's
corresponding Keychain item was not found. Human reauthentication is required
before a future real-model gate, but it was intentionally not initiated here.

## Historical and implementation boundary

The earlier V2.2 real-D04 attempt remains `NOT_RUN_AUTH_BLOCKED` with zero
provider calls. Its historical result is not rewritten. No auth source,
wrapper, semantic code, Prompt, model, or Production path was changed.

The minimum next action, under a separate user-approved gate, is human
Wrangler reauthentication using the existing keyring policy, followed by a
fresh safe `whoami` and memory-only auth-discovery verification. Do not start
the D04 call in the same action until those checks pass.
