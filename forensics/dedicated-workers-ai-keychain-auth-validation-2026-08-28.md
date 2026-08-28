# Dedicated Workers AI Keychain Auth Validation — 2026-08-28

## Scope

Read-only validation of the developer-only Direct REST authentication path.
No Wrangler login/logout, token creation/rotation, Workers AI request,
Production write, migration, or deployment was performed.

## Static source audit

```text
DEDICATED_KEYCHAIN_AUTH_PRESENT = YES
DEDICATED_KEYCHAIN_AUTH_PRIORITY = PRIMARY_PERSISTENT_SOURCE
WRANGLER_OAUTH_PRIORITY = FALLBACK
CHILD_CREDENTIAL_ENV_INJECTION = ABSENT
ACCOUNT_DISCOVERY_REQUIRES_WRANGLER_WHOAMI = NO
ACCOUNT_DISCOVERY_SUPPORTS_DEDICATED_TOKEN = YES
```

The relevant path is the shared bridge in
`scripts/ambient-semantic-eval-auth.mjs` (with the TypeScript source mirror at
`src/ambient-semantic-eval-auth.ts`). The real runner obtains bounded auth and
account state before starting its developer child, and uses
`buildSafeAmbientChildEnvironment` for the child boundary.

## Keychain and in-process retrieval

Only metadata was checked for service `chicken-line-production-workers-ai`
and account `default`; the secret value was not read into any report or
terminal output.

```text
DEDICATED_KEYCHAIN_ITEM = PRESENT
DEDICATED_AUTH_RETRIEVAL = PASS
AUTH_SOURCE = DEDICATED_KEYCHAIN
AUTH_VALUE_SINGLE_LINE_VALID = YES
OAUTH_FALLBACK_USED = NO
```

The current bridge retrieved the value in process memory. No credential was
placed in command arguments, environment output, ledger, report, or child
environment.

## Account lookup

The bridge performed the bounded authenticated account lookup used by the
harness. Only the bounded result was retained:

```text
ACCOUNT_LOOKUP = FAIL
ACCOUNT_COUNT_CLASS = ZERO
EXPECTED_ACCOUNT_RESOLVED = NO
FAILURE_CLASS = ACCOUNT_LOOKUP_FAILURE
BOUNDED_FAILURE = ACCOUNT_NOT_FOUND
```

No account identifier or provider response body was persisted. Because the
account was not uniquely resolved, the gate stopped before any inference.

## Child credential boundary

```text
PARENT_AUTH_AVAILABLE = YES
CHILD_ENV_CONTAINS_CREDENTIAL = NO
CHILD_AUTH_MECHANISM = OWN_KEYCHAIN_LOOKUP
```

The existing environment scrubber remains in use. The Wrangler OAuth
compatibility fallback was neither needed nor counted as a successful result
for this gate.

## Local quality gate

All tests ran with real/inference flags disabled and with known credential
environment variables removed from the test process.

```text
TYPESCRIPT = PASS
AUTH_WRAPPER_TARGETED = 45 passed / 3 skipped
FULL_VITEST = 682 passed / 9 skipped
WORKERS_AI_CALLS = 0
PROVIDER_REQUESTS = 0
```

## Final bounded result

```text
DEDICATED_AUTH_GATE = FAIL
READY_FOR_REAL_V2_2_D04 = NO
REAL_D04 = NOT_RUN
PRODUCTION_FUNCTIONAL_CODE_CHANGED = NO
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The durable Keychain retrieval portion passed. The gate remains blocked only
by the missing unique account resolution; this result does not authorize a
new token, Wrangler login, OAuth fallback acceptance, or a D04 retry.
