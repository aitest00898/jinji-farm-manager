# Farm Admin Password Secret Provenance Forensic — 2026-09-09

```text
TASK_RESULT = FARM_ADMIN_PASSWORD_SECRET_PROVENANCE_FORENSIC_COMPLETE
SUBAGENT_DISABLED = YES
SUBAGENT_TOTAL_USED = 0
WORKERS_AI_CALLS = 0
LOGIN_RETRY_THIS_GATE = NO
PASSWORD_READ = NO
SECRET_VALUE_READ = NO
SECRET_VALUE_PRINTED = NO
```

## Scope and safety

This is a read-only provenance and verifier-compatibility investigation. It
does not retry Web login, request or inspect a password, request or inspect a
stored hash, deploy a Worker, mutate a Secret, execute a migration, write D1,
send LINE, write Queue, call Workers AI, change Cron, change the model, merge
main, or deploy Pages.

Existing untracked audit artifacts in the Production checkout were preserved.
The Web cache-bust source refinement from the preceding UI troubleshooting
work was not changed or included in this forensic Gate. This Gate made no Web
runtime source change.

## Evidence sources

Read-only evidence used:

- Production repository Git history and tracked source/docs/tests/scripts.
- `src/admin-auth.ts`, `src/admin-auth.test.ts`, `src/web-api.ts`, and
  `wrangler.jsonc`.
- `scripts/web-runtime-validation.mjs` and
  `scripts/abnormal-runtime-validation.mjs`.
- Existing `DEPLOYMENT_REPORT.md` and Web-auth/release receipts.
- Wrangler `whoami`, `secret list`, `deployments list`, and current version
  metadata for `chicken-line-production`.
- Public unauthenticated Worker probes: `/api/web/auth/session` and
  unauthenticated `/api/records`.

No password, hash, Bearer token, Authorization header, login request body, or
secret value was retrieved or retained.

## Current Worker and Secret metadata

```text
SECRET_WORKER = chicken-line-production
SECRET_ENVIRONMENT = Production Worker at chicken-line-production.jinji-assistant.workers.dev
CURRENT_LIVE_WORKER_VERSION = b8d5eb49-f032-4180-927d-c428378631ea
CURRENT_LIVE_VERSION_TRAFFIC = 100_PERCENT
CURRENT_LIVE_VERSION_CREATED = 2026-09-09T04:51:19.976Z
FARM_ADMIN_PASSWORD_HASH_BINDING_PRESENT = YES
FARM_ADMIN_PASSWORD_HASH_BINDING_TYPE = secret_text
SECRET_VALUE_VISIBLE = NO
```

The current Secret name is present on both the Worker configuration and the
live version metadata. This proves the binding name exists on the intended
Worker; it does not prove the current value equals the original verifier or
that the verifier contents are valid.

The public runtime boundary is reachable and correctly scoped:

```text
GET /api/web/auth/session with no session = HTTP 200 {authenticated:false}
GET /api/records?environment=production with no session = HTTP 401 unauthorized
CORS origin http://127.0.0.1:5173 = allowlisted
```

These probes did not submit a password and did not create a session or
business fact.

## Repository and Git provenance

### Relevant timeline

| Commit | Date | Evidence-backed change | Auth/Secret relevance |
| --- | --- | --- | --- |
| `8a855c3fb52b5159af127329799fcfa34801cab4` | 2026-08-20 09:18 +08 | Initial Web repository; README referenced a shared `FARM_ADMIN_PASSWORD_HASH` verifier and the frontend test asserted no secret exposure | Reference only; no Worker verifier implementation or Secret mutation command found in this commit |
| `0d97e5cb14529cb080c997f5623abe0f7e329423` | 2026-08-20 09:25 +08 | Removed a sensitive-looking literal from a frontend test | Test hygiene only; no Secret mutation |
| `fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c` | 2026-08-28 16:55 +08 | Introduced the active `src/admin-auth.ts`, Web auth route, required Secret name, and synthetic local runtime verifier generation | First active verifier/Worker binding contract found; no Production Secret command |
| `6f00efd51096d58d7b09ffedf9f43cba9c9c4461` | 2026-08-30 14:13 +08 | Repository unification snapshot | No current verifier-contract change or Secret mutation command found |
| `18c80b5d5b645e6e2deee76b341089ee9217a154` | 2026-09-09 11:25 +08 | Canonical API release candidate later mapped to the live Worker | Diff did not change `src/admin-auth.ts` or the Secret required-name list |
| `21363162b48e4483ace911034a8f26a0f1de1485` | 2026-09-09 13:46 +08 | Web auth runtime closure documentation | Documentation only |

```text
FIRST_AUTH_IMPLEMENTATION_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
FIRST_FARM_ADMIN_SECRET_REFERENCE_COMMIT = 8a855c3fb52b5159af127329799fcfa34801cab4 (documentation reference)
FIRST_ACTIVE_WORKER_SECRET_BINDING_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
SECRET_MUTATION_COMMANDS_FOUND_IN_TRACKED_HISTORY = NONE_FOUND
SECRET_DELETE_COMMANDS_FOUND_IN_TRACKED_HISTORY = NONE_FOUND
SECRET_BULK_COMMANDS_FOUND_IN_TRACKED_HISTORY = NONE_FOUND
```

The normal deploy script is only `wrangler deploy`. The tracked local runtime
validation scripts generate a random synthetic password and pass a synthetic
verifier to `wrangler dev --local --var`; they do not mutate a Production
Secret. No tracked Production provisioning script for the original Secret
value was found.

The historical reports state that the Secret value was not printed, stored in
source, D1, logs, or reports. They do not provide a recoverable proof of the
current value or its continuity.

## Cloudflare Audit Log result

```text
CLOUDFLARE_AUDIT_LOG = NOT_AVAILABLE_CURRENT_PERMISSION_OR_WRANGLER_SURFACE
FARM_ADMIN_SECRET_CREATED_EVENT = NOT_OBSERVABLE
FARM_ADMIN_SECRET_UPDATED_EVENT = NOT_OBSERVABLE
FARM_ADMIN_SECRET_DELETED_EVENT = NOT_OBSERVABLE
FARM_ADMIN_SECRET_BULK_REPLACED_EVENT = NOT_OBSERVABLE
VALUE_VISIBLE = NO
```

The existing Wrangler OAuth identity was used only for read-only metadata
commands. Wrangler 4.124.0 exposes Secret-name metadata and Worker deployment
metadata but no Audit Log query command. No new API token, OAuth login, role
change, or permission expansion was performed. Therefore the absence of an
Audit Log event cannot be treated as proof that no control-plane Secret update
occurred.

## Verifier contract

Current `verifyAdminPassword` accepts only:

```text
pbkdf2-sha256$100000$<salt-base64>$<derived-base64>
```

Contract details:

- PBKDF2 with SHA-256.
- Exactly 100,000 iterations.
- UTF-8 password bytes through `TextEncoder`.
- Salt and derived bytes decoded from Base64.
- Derived output must be exactly 32 bytes.
- Verifier framing is exactly four `$`-separated fields and the prefix is
  exact.
- The verifier string is trimmed at the outer boundary; the password is not
  trimmed, case-folded, Unicode-normalized, or hashed by the Web client.
- Comparison is constant-time after length equality.
- Missing, malformed, incompatible, or cryptographic-error inputs fail
  closed.

The Web client sends the entered password as the JSON `password` field to
`POST /api/web/auth/login` without local transformation. The Worker reads that
field and passes it directly to `verifyAdminPassword`.

## Hash provisioning and compatibility

```text
HASH_PROVISIONING_METHOD_FOUND = NO_TRACKED_PRODUCTION_PROVISIONING_METHOD
SYNTHETIC_TEST_GENERATOR_FOUND = YES
SYNTHETIC_GENERATOR_CONTRACT = Node PBKDF2-SHA256, 100000 iterations, random 16-byte salt, 32-byte derived output, Base64 framing
HISTORICAL_VERIFIER_CHANGE_COUNT = 0 after the active verifier was introduced
VERIFIER_COMPATIBILITY_BREAK = NOT_PROVEN
OLD_HASH_CURRENT_VERIFIER_COMPATIBILITY = PASS_FOR_THE_SINGLE_TRACKED_FORMAT
```

The current verifier is byte-for-byte contract-equivalent to the verifier
introduced in `fc66f4d...`; Git history shows no later change to the current
`src/admin-auth.ts` implementation or its iteration constant. The synthetic
Vitest authentication suite passed 5/5, including correct-password success,
wrong-password rejection, and rejection of a synthetic 310,000-iteration
hash. This is compatibility evidence for the tracked format only; it cannot
validate the unseen Production Secret value.

## Release/deployment correlation

```text
NORMAL_DEPLOY_MUTATES_FARM_ADMIN_SECRET = NO_EVIDENCE; deploy script is wrangler deploy only
RELEASE_AUTH_SOURCE_CHANGE = NOT_FOUND
RELEASE_SECRET_BINDING_NAME_CHANGE = NOT_FOUND
RELEASE_CAUSED_SECRET_CHANGE = NOT_PROVEN
PRODUCTION_RUNTIME_SOURCE_CHANGED_THIS_GATE = NO
WEB_RUNTIME_SOURCE_CHANGED_THIS_GATE = NO
```

The live deployment timeline contains normal Worker version uploads through
`b8d5eb49...`; deployment metadata exposes version IDs and binding names, not
Secret values or Secret audit events. The canonical API release changed the
records/API path but did not change the verifier or required Secret names.

## Root-cause synthesis

```text
SECRET_CHANGE_PROVEN = NOT_PROVEN
VERIFIER_COMPATIBILITY_BREAK_PROVEN = NO
SECRET_MISSING_PROVEN = NO
WRONG_WORKER_OR_ENVIRONMENT_PROVEN = NO
PASSWORD_WRONG_PROVEN = NO
CURRENT_SECRET_VALUE_VS_ORIGINAL_PASSWORD = NOT_VERIFIABLE_WITHOUT_HUMAN_AUTHENTICATION_OR_SECRET_RESET
ROOT_CAUSE_CLASS = INCONCLUSIVE; bounded result is no repo/verifier/deploy-path change found
ROOT_CAUSE_CONFIDENCE = HIGH for source/verifier compatibility; NOT_PROVEN for Secret-value continuity
```

The narrowest evidence-backed explanation is that the intended Worker and
Secret binding are present, the public API/CORS boundary is healthy, and the
tracked verifier has not changed incompatibly. The current Secret value may
not match the original password verifier, may be malformed, or may have been
changed outside the tracked repository; none of those possibilities is
provable without reading/resetting the Secret. The user's assertion that the
original password was entered is preserved as human evidence, not converted
into a Secret-value conclusion.

## Recovery design only — not executed

```text
PASSWORD_RESET_RECOMMENDED = CONDITIONAL; requires a separate explicit recovery Gate
PASSWORD_RESET_EXECUTED = NO
```

If recovery is authorized later, the safe design is:

1. The human types a replacement password into a local hidden input, never
   into ChatGPT, argv, shell history, repository files, logs, or a report.
2. A local in-memory generator creates the current PBKDF2-SHA256/100,000
   verifier.
3. Only the generated hash is sent through an explicitly authorized Secret
   update operation.
4. A separately authorized single human login verification confirms the
   result; no business canary is combined with password recovery.

No step above was executed in this Gate.

## Safety receipt

```text
LOGIN_RETRY = NO
PASSWORD_READ = NO
SECRET_VALUE_READ = NO
SECRET_VALUE_PRINTED = NO
WORKER_DEPLOYMENT = NO
PRODUCTION_BUSINESS_WRITES = 0
TEST_SCOPE_BUSINESS_WRITES = 0
REMOTE_MIGRATION = NO
SCHEMA_CHANGED = NO
LINE_SEND = 0
QUEUE_BUSINESS_WRITES = 0
WORKERS_AI_CALLS = 0
CRON_CHANGED = NO
RECOVERY_CRON_REMAINS_DISABLED = YES
MODEL_CHANGED = NO
MAIN_MERGE = NO
PAGES_DEPLOYMENT = NO
```

The correct next action is a separately authorized human/admin control-plane
decision: obtain Audit Log access, or explicitly authorize a safe Secret
reprovisioning Gate. This forensic Gate does not reset the password and does
not claim authenticated Web or canonical business acceptance.
