# Dedicated Keychain Persistence Regression and Repair — 2026-08-28

## Scope and safety

This gate covers developer-only Cloudflare REST authentication. It does not
change Production authentication or business behavior. No token value,
prefix, suffix, length, hash, Authorization header, raw Keychain output, raw
command output, or secret-bearing environment was recorded here.

```text
SOURCE_COMMIT = 96701836794f989b9a805564ad81db53ae59c953
WORKTREE_CLEAN_AT_GATE_START = YES
ONE_WRITER = YES
WORKERS_AI_INFERENCE_CALLS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
```

## Auth simplification decision — 2026-08-28

The custom Keychain approach is now retired from active developer
authentication. The historical provisioning, disappearance, and repair
evidence above remains unchanged and is not rewritten.

```text
CUSTOM_KEYCHAIN_APPROACH = RETIRED_FOR_DEV_AUTH
REASON = UNNECESSARY_COMPLEXITY_AND_PERSISTENCE_FAILURE
NEW_DEV_AUTH_SOURCE = LOCAL_IGNORED_0600_SECRET_FILE
WRANGLER_FALLBACK_FOR_V2_2 = NO
```

The developer-only evaluation path now reads `.dev.secrets.local` directly
into the evaluating process's memory. It rejects unsafe local permissions,
malformed entries, duplicate keys, and value whitespace without including any
raw line or secret value in errors, diagnostics, logs, ledgers, or reports.
The file is ignored by Git and is not required by automated tests.

A synthetic Keychain canary and an extended durability matrix were considered
but deliberately not implemented. For this single-user, developer-only,
least-privilege token, that additional infrastructure was disproportionate to
the threat model and introduced more failure modes than it removed. This is an
intentional de-engineering decision, not an unfinished canary task.

No token was created or requested in this decision, no Cloudflare request was
made, and no Production behavior was changed.

## Historical evidence and incident classification

Earlier bounded evidence on 2026-08-28 established that the dedicated
credential was provisioned, retrieved from independent processes, and used by
successful developer Workers AI requests. A later metadata-only lookup at the
same service/account returned item-not-found. That historical success remains
valid; it is not rewritten as if it never happened.

```text
AUTH_PROVISIONING = HISTORICAL_PASS
AUTH_SHORT_TERM_RETRIEVAL = HISTORICAL_PASS
AUTH_PERSISTENCE = FAIL
AUTH_DURABILITY = NOT_PROVEN
AUTH_INCIDENT = KEYCHAIN_ITEM_DISAPPEARANCE
LAST_CONFIRMED_PRESENT_AT = 2026-08-28 (time not persisted)
FIRST_CONFIRMED_MISSING_AT = UNKNOWN
```

The read-only subagent merge found:

- the default/user search context resolved to the login Keychain, but the
  original helper did not explicitly target it;
- the original helper used `SecItemUpdate` followed by `SecItemAdd`, with no
  delete-before-add, but no transaction primitive or rollback guarantee;
- no project call site, test teardown, cleanup path, FIFO removal, or helper
  removal deletes the dedicated service/account item;
- the observed item-not-found status cannot distinguish physical deletion
  from keychain-domain, access-context, or visibility change;
- parent and child identities matched, while helper identity and ACL effects
  remained inconclusive.

The evidence-backed root cause is therefore deliberately bounded:

```text
ORIGINAL_PROVISIONING_TARGET = IMPLICIT_DEFAULT
KEYCHAIN_DOMAIN_AMBIGUITY = YES
PROJECT_DELETE_PATH_FOUND = NO
TEST_TEARDOWN_REAL_KEYCHAIN_RISK = NO
HELPER_IDENTITY_RISK = INCONCLUSIVE
CONFIRMED_ROOT_CAUSE = PERSISTENCE_DOMAIN_NOT_STRONGLY_CONTROLLED
ROOT_CAUSE_CERTAINTY = MEDIUM
PREVIOUS_DURABILITY_CLAIM_OVERSTATED = YES
```

This report does not invent a deletion event or claim that the original
Cloudflare token was revoked or expired.

## Developer-only repair

The single-writer repair removes the domain ambiguity without changing the
semantic, Production, or provider path:

- `scripts/store-ambient-semantic-eval-keychain.swift` opens the current
  user's `~/Library/Keychains/login.keychain-db` with Security.framework;
  update/search is restricted to that keychain and add uses the same explicit
  keychain reference;
- the upsert is idempotent and update-in-place/add-if-missing, with a bounded
  duplicate race recovery; it never deletes before adding;
- `scripts/check-ambient-semantic-eval-keychain.swift` performs a metadata-only
  Security.framework check and never requests password data;
- `src/ambient-semantic-eval-auth.ts` and
  `scripts/ambient-semantic-eval-auth.mjs` pass the explicit login keychain
  path to `security find-generic-password`; the credential remains captured
  only in process memory;
- the existing child-environment scrubber and dedicated-only V2.2 policy are
  retained; Wrangler remains only a compatibility fallback in general tooling
  and is not a replacement for the dedicated source.

```text
EXPLICIT_LOGIN_KEYCHAIN_TARGET = YES (implementation)
ATOMIC_UPSERT = YES (single-writer update-in-place; no delete window)
DELETE_BEFORE_ADD = NO
SAFE_REST_AUTH_BRIDGE = IMPLEMENTED_PENDING_PROVISIONING
```

The Security.framework API exposes the legacy `SecKeychainOpen` declaration as
deprecated on current SDKs, but it remains the explicit mechanism used here to
select the user's login keychain. The implementation also uses the documented
search-list restriction for update and metadata lookup. No custom encryption,
plaintext file, new dependency, migration, or alternate secret store was
introduced.

## Restoration boundary

The original secret is not available from the expected Keychain item and was
not recovered from any safe user-held source during this gate.

```text
HUMAN_NEW_TOKEN_REQUIRED = YES
NEW_TOKEN_CREATED = NO
SECRET_ENTERED_VIA_SAFE_LOCAL_CHANNEL = NO
LOGIN_KEYCHAIN_ITEM_PRESENT = NO (not provisioned in this gate)
SECURITY_FRAMEWORK_METADATA_LOOKUP = NOT_RUN_AFTER_REPAIR
SECURITY_CLI_LOGIN_KEYCHAIN_LOOKUP = NOT_RUN_AFTER_REPAIR
AUTH_BRIDGE_RETRIEVAL = NOT_RUN_AFTER_REPAIR
ACCOUNT_RESOLUTION = NOT_RUN_AFTER_REPAIR
```

The safe next action is one Cloudflare Dashboard action: create one new
least-privilege Workers AI API Token for the configured account with Workers
AI Read and Edit permissions, retaining the existing approved 90-day policy.
The user must not paste the token into Codex or chat. After creation, it must
enter only through the hidden stdin procedure in `docs/developer-auth.md`.

## Durability acceptance remains pending

The stronger acceptance is intentionally not claimed yet. After local
provisioning, the gate must verify the same service/account through both
Security.framework metadata and the explicit-keychain `security` CLI, then
retrieve it in the parent, a sanitized child, a separate invocation, and a
fresh helper build where applicable. It must also survive removal of temporary
FIFO/helper files and all auth tests must prove zero mutation of the real
service/account item.

```text
PARENT_PROCESS_RETRIEVAL = NOT_RUN
FRESH_CHILD_RETRIEVAL = NOT_RUN
INDEPENDENT_PROCESS_RETRIEVAL = NOT_RUN
REBUILT_HELPER_RETRIEVAL = NOT_RUN
PARENT_CHILD_PARITY = NOT_RUN
INDEPENDENT_PROCESS_PARITY = NOT_RUN
LOGIN_KEYCHAIN_ITEM_PRESENT_AFTER_CLEANUP = NOT_RUN
AUTH_BRIDGE_RETRIEVAL_AFTER_CLEANUP = NOT_RUN
REAL_KEYCHAIN_MUTATION_DURING_TESTS = 0 (static/test isolation guard)
AUTH_DURABILITY = NOT_PROVEN
```

Only after `AUTH_DURABILITY = PASS` may the project make one bounded
non-inference Cloudflare readiness request. Only if that also passes may the
already-authorized single serial V2.2 DEV-SMOKE-8 run. No inference was made
in this gate.

## Local validation performed before restoration

```text
SWIFT_PARSE = PASS
SWIFT_TYPECHECK = PASS (SDK deprecation warnings only)
TARGETED_AUTH_TESTS = PASS (10 passed)
PRODUCTION_AUTH_COUPLING = NO
NO_SECRET_LITERAL_ADDED = PASS
```

The post-change local validation completed before this gate stops. It does
not substitute for the pending durability matrix.

```text
TYPESCRIPT = PASS
TARGETED_AUTH_TESTS = PASS (10 passed)
FULL_VITEST = PASS (692 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
```

## Safety gates

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
