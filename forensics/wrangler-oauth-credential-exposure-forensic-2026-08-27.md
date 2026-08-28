# WRANGLER OAUTH CREDENTIAL EXPOSURE FORENSIC REPORT

Date: 2026-08-27
Scope: local evidence only; read-only credential exposure audit.

## Safety boundary

No credential value, prefix, suffix, hash, Authorization header, OAuth payload, environment dump, or raw matching line is recorded here. The exposure command was not re-executed. No revoke, logout, rotation, deployment, provider call, or functional project change was performed.

## A. Exposure origin

- `EXPOSURE_SOURCE_COMMAND_CLASS = environment dump`
- `EXACT_COMMAND_IDENTIFIED = YES`
- Safe command descriptor: a `sed` read of the local Wrangler `default.toml` credential store.
- `COMMAND_REEXECUTED = NO`
- The corresponding Codex session record is the tool output immediately following that config read; only record location and classification were retained.

## B. Credential type

- `CREDENTIAL_TYPE = WRANGLER_OAUTH`
- The local Wrangler store contains OAuth and refresh credential fields. The store is user-readable only (`0600`).

## C. Codex context and tool capture

- `CODEX_CONTEXT_EXPOSURE = YES`
- `CODEX_TOOL_STDOUT_CAPTURED_SECRET = YES`
- `CODEX_TOOL_STDERR_CAPTURED_SECRET = NO`
- Evidence: the exact stored OAuth value was found twice in the Codex session's captured tool-output record associated with the config read. The command was a successful `sed` read, so the exposure path is stdout; no exact value was found in inspected tool-call inputs or separate error fields.
- This does not claim anything about OpenAI backend storage or retention, which is not locally auditable here.

## D. Repository scan

Exact in-memory comparison against the current local Wrangler OAuth/refresh values:

- `REPO_TRACKED_SECRET_MATCH = NO`
- `REPO_UNTRACKED_SECRET_MATCH = NO`
- `REPO_IGNORED_SECRET_MATCH = NO`
- `MATCH_FILE_COUNT = 0` in the project scope, including source, scripts, docs, migrations, web source/build, forensics, and runtime ledgers.
- The project root is not a Git repository. The nested `web/` repository was checked separately.

## E. Git history

- Nested `web/` repository: 23 tracked files and 22 reachable commits inspected.
- `GIT_HISTORY_SECRET_MATCH = NO`
- `SECRET_EVER_COMMITTED = NO` within the available nested repository history.
- The project root has no available Git history to inspect; this report does not claim to audit any external or missing repository copy.

## F. Forensic and runtime artifacts

- `FORENSIC_ARTIFACT_SECRET_MATCH = NO`
- `RUNTIME_LEDGER_SECRET_MATCH = NO`
- No exact credential value was found in the project forensic reports or ignored `forensics/runtime/*.jsonl` ledgers.

## G. Shell history

- `SHELL_HISTORY_SECRET_MATCH = NO`
- `SECRET_USED_AS_COMMAND_ARGUMENT = NO`
- The inspected zsh and bash history files contain no exact stored credential value. The prior config-read command was observed in the Codex session record rather than shell history.

## H. Local logs and temporary files

- `PROJECT_RELATED_TEMP_SECRET_MATCH = NO`
- 91 project-related `/tmp` candidate files and 59 explicitly scoped Codex local temp/log candidates had no exact credential match.
- Separate from project temp files, two global Wrangler logs contain an exact credential match:
  - `/Users/joe/Library/Preferences/.wrangler/logs/wrangler-2026-08-27_10-53-26_145.log`
  - `/Users/joe/Library/Preferences/.wrangler/logs/wrangler-2026-08-27_11-34-40_786.log`
- These are persistent local Wrangler logs, not project artifacts. Their presence is sufficient to classify the exposure as persistent local log exposure.

## I. Relationship to Direct REST testing

- `WRANGLER_AND_REST_CREDENTIAL_SAME = YES`
- The developer-only REST runner first accepts `CLOUDFLARE_API_TOKEN`; in the audited run no separate API-token source was used. It fell back to `./node_modules/.bin/wrangler auth token` and recorded the safe source class `WRANGLER_AUTH`. That path uses the Wrangler OAuth credential, not a second credential created for the test.
- No Workers AI call was made by this forensic.

## J. Risk classification

- `CREDENTIAL_EXPOSURE_LEVEL = 2`
- Basis: the credential entered Codex-visible tool output and persistent local Wrangler log files, but no exact match was found in the project tree, available Git history, shell history, project runtime ledgers, or scoped temporary files.

## K. Rotation decision

- `ROTATION_RECOMMENDED = YES`
- Reason: Codex-context exposure and persistent local-log exposure are both confirmed.
- `CREDENTIAL_REVOKED = NO`
- `CREDENTIAL_ROTATED = NO`
- Rotation/revocation is intentionally left to the user because it may affect Wrangler login and the developer REST tooling.

## Final gates

```text
EXACT_EXPOSURE_COMMAND_IDENTIFIED = YES
EXPOSURE_SOURCE_COMMAND_CLASS = environment dump
CREDENTIAL_TYPE = WRANGLER_OAUTH
CODEX_CONTEXT_EXPOSURE = YES
CODEX_TOOL_STDOUT_CAPTURED_SECRET = YES
CODEX_TOOL_STDERR_CAPTURED_SECRET = NO
REPO_TRACKED_SECRET_MATCH = NO
REPO_UNTRACKED_SECRET_MATCH = NO
REPO_IGNORED_SECRET_MATCH = NO
FORENSIC_ARTIFACT_SECRET_MATCH = NO
RUNTIME_LEDGER_SECRET_MATCH = NO
GIT_HISTORY_SECRET_MATCH = NO
SECRET_EVER_COMMITTED = NO
SHELL_HISTORY_SECRET_MATCH = NO
SECRET_USED_AS_COMMAND_ARGUMENT = NO
PROJECT_RELATED_TEMP_SECRET_MATCH = NO
WRANGLER_AND_REST_CREDENTIAL_SAME = YES
CREDENTIAL_EXPOSURE_LEVEL = 2
ROTATION_RECOMMENDED = YES
CREDENTIAL_REVOKED = NO
CREDENTIAL_ROTATED = NO
REAL_AI_CALLS = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
PROJECT_FUNCTIONAL_CHANGES = NONE
```

## Rotation section — approved and completed

Approval: `ROTATION_APPROVED_BY_USER = YES`.

- `OLD_OAUTH_INVALIDATED = YES`: the local Wrangler `logout` completed successfully before any new credential lookup.
- `LOCAL_OLD_WRANGLER_AUTH_REMOVED = YES`: the plaintext `default.toml` credential file is absent after logout/login.
- `CONFIRMED_SECRET_LOGS_EXPECTED = 2`
- `CONFIRMED_SECRET_LOGS_REMOVED = 2`
- `UNRELATED_LOGS_REMOVED = 0`
- The two exact previously confirmed log paths were verified absent after removal. No other Wrangler logs were removed.
- `NEW_OAUTH_LOGIN = PASS`: `wrangler login --use-keyring --browser` completed successfully; no token was copied or supplied by the user.
- `WRANGLER_CREDENTIAL_STORAGE = KEYRING_BACKED`: Wrangler preferences report keyring enabled, `default.enc` exists, plaintext `default.toml` is absent, macOS Keychain metadata lookup succeeded, and quiet `whoami` succeeded.
- `OLD_REST_CREDENTIAL_INVALIDATED = YES`: the REST runner previously used the same Wrangler OAuth source, so logout invalidated that old REST credential as well.
- `SAFE_REST_AUTH_BRIDGE = PASS`: the developer-only runner no longer passes a credential through child environment variables. The child captures the bounded `wrangler auth token` stdout in memory only, with stderr suppressed, rejects ambiguous multi-line output, and never writes or prints the value. Tests cover the bridge and child-environment scrubbing.
- Post-rotation local project scan found no credential value in project files, runtime ledgers, or forensic artifacts. No Workers AI call, D1 write, business write, LINE send, migration, or deployment occurred.

### Rotation gates

```text
ROTATION_APPROVED_BY_USER = YES
OLD_OAUTH_INVALIDATED = YES
LOCAL_OLD_WRANGLER_AUTH_REMOVED = YES
CONFIRMED_SECRET_LOGS_EXPECTED = 2
CONFIRMED_SECRET_LOGS_REMOVED = 2
UNRELATED_LOGS_REMOVED = 0
NEW_OAUTH_LOGIN = PASS
WRANGLER_CREDENTIAL_STORAGE = KEYRING_BACKED
OLD_REST_CREDENTIAL_INVALIDATED = YES
SAFE_REST_AUTH_BRIDGE = PASS
POST_ROTATION_REPO_SECRET_MATCH = 0
POST_ROTATION_RUNTIME_SECRET_MATCH = 0
POST_ROTATION_FORENSIC_SECRET_MATCH = 0
OLD_SECRET_HISTORICALLY_EXPOSED = YES
OLD_SECRET_NOW_INVALIDATED = YES
CREDENTIAL_REVOKED = NO_DIRECT_DASHBOARD_ACTION
CREDENTIAL_ROTATED = YES_VIA_NEW_OAUTH_LOGIN
REAL_AI_CALLS = 0
MODEL_SCHEMA_CALLS = 0
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
PROJECT_FUNCTIONAL_CHANGES = NONE
```
