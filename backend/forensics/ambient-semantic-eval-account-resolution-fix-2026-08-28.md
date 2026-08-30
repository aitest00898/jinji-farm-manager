# Developer Account Resolution Repair — 2026-08-28

## Scope

This repair is limited to the developer-only Direct Workers AI evaluation
harness. Production Worker behavior, Prompt, model settings, D1, Queue, LINE,
and business data were not changed.

## Root cause

The dedicated Keychain API token was available, but the token's authenticated
`/accounts` lookup returned a successful envelope with zero account entries.
The previous resolver treated that as `ACCOUNT_NOT_FOUND`, even though the
Cloudflare account still existed and the token was scoped to it. Wrangler OAuth
`whoami` was not a reliable source for the non-interactive developer path.

The non-secret Cloudflare Account ID was confirmed from the already signed-in
Cloudflare dashboard URL. It was not confused with the LINE account id or the
D1 database id.

## Minimal repair

- Added `config/ambient-semantic-eval-account.json` containing only the
  developer account identifier.
- Updated the shared TypeScript and JavaScript auth bridges to resolve account
  identity in this order: explicit environment value, developer-only config,
  then bounded account enumeration.
- Invalid developer account config fails closed; no arbitrary fallback is
  selected.
- Documented the separation in `docs/developer-auth.md`.
- Added a local test proving configured account resolution avoids the restricted
  account enumeration path.

## Recheck

```text
KEYCHAIN_AUTH = PASS
AUTH_SOURCE = KEYCHAIN_API_TOKEN_MEMORY
ACCOUNT_CONFIG = PRESENT_VALID
ACCOUNT_RESOLUTION = PASS
ACCOUNT_RESOLUTION_SOURCE = DEVELOPER_CONFIG
ACCOUNT_LIST_LOOKUP = NOT_NEEDED
ACCOUNT_SCOPED_MODEL_SCHEMA_HTTP = 200
ACCOUNT_SCOPED_MODEL_SCHEMA_SUCCESS = true
WORKERS_AI_INFERENCE_CALLS = 0
```

The account-scoped model-schema request was a non-inference verification only.
No raw response, credential, authorization header, or account identifier was
written to this report.

## Local quality gate

```text
TYPESCRIPT = PASS
AUTH_TARGETED_TESTS = 8 passed
FULL_VITEST = 683 passed / 9 skipped
```

## Safety boundary

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

The earlier `ACCOUNT_NOT_FOUND` gate remains historical evidence and was not
rewritten. The repair only removes the account-resolution blocker; it does not
authorize a Workers AI semantic gate or Production action.
