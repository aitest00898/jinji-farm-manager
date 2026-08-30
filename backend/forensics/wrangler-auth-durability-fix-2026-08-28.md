# Wrangler Auth Durability Fix — 2026-08-28

## Scope

Developer-only authentication hardening for the Chicken LINE evaluation
harness. No Workers AI inference, Production deployment, data mutation, login,
logout, revoke, or rotation was performed in this fix.

## Evidence carried forward

The previous bounded forensic found a usable Wrangler OAuth/keyring state could
not be retrieved even though the encrypted Wrangler store existed. It did not
prove natural OAuth expiry. The current dedicated Keychain item was not
confirmed during a metadata-only check.

## Implemented safeguards

- Added a dedicated macOS Keychain API-token bridge using service
  `chicken-line-production-workers-ai` and account `default`.
- Kept the credential in process memory only; the bridge never logs or
  serializes the value.
- Removed developer real-runner token injection into child environments.
- Reused the same scrubber for inherited credential variables.
- Changed account discovery to prefer an explicit account id and otherwise use
  a bounded authenticated account lookup, avoiding a hard dependency on
  Wrangler OAuth `whoami`.
- Kept Wrangler OAuth as a captured-in-memory compatibility fallback only.
- Added bounded auth failure/status types and a stdin-only Keychain provisioning
  helper. The helper does not accept a token as a command-line argument.

## One-time remaining action

The dedicated Keychain API-token item must be provisioned once by the user.
The safe procedure is documented in `docs/developer-auth.md`. The token must
not be sent to Codex. Until that item exists, the harness may still report an
auth blocker if the OAuth fallback is unavailable; this is intentional and
fail-closed.

## Verification

```text
TYPESCRIPT = PASS
AUTH_AND_WRAPPER_TARGETED_TESTS = PASS
AUTH_AND_WRAPPER_TARGETED_TEST_COUNT = 16 passed / 3 skipped
JAVASCRIPT_SYNTAX_CHECKS = PASS
SWIFT_PARSE = PASS
SWIFT_TYPECHECK = BLOCKED_BY_SANDBOX_CACHE_PERMISSION
WORKERS_AI_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
```

The Swift typecheck did not reach source validation because the local sandbox
could not write Xcode's compiler module cache; no application failure was
reported. The helper source contains no credential literal.

## Safety result

Production code, Prompt, model, Worker auth, D1, Queue, Cron, LINE, migrations,
and deployment were not changed. The durable fix is implemented, pending the
one-time Keychain provisioning step.

## Post-report provisioning update — 2026-08-28

The user-approved 90-day Workers AI API Token was provisioned in the dedicated
macOS Keychain item. The dashboard scope was the current account with Workers
AI Read and Edit permissions; the configured validity window was August 28,
2026 through November 26, 2026. The secret was handled only in memory and was
not recorded in any project artifact, command argument, environment, ledger,
report, or Codex output.

The compiled Keychain helper returned a bounded success status, and a separate
metadata-only check confirmed the dedicated item exists. Temporary FIFO and
helper artifacts were removed. No Workers AI request, Production side effect,
or deployment occurred.

```text
KEYCHAIN_PROVISIONING = PASS
DEDICATED_KEYCHAIN_ITEM = PRESENT
WORKERS_AI_CALLS = 0
PRODUCTION_SIDE_EFFECTS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```
