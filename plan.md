# Jinji Farm Manager — Commander Project Plan

Status: Chapter 6 Web access unification is complete locally; no Production
deployment, migration application, or business mutation was performed.

## Durable outcome

```text
CHAPTER_1_ARCHITECTURE_RECONCILIATION = PASS
CHAPTER_2_AUTHORIZED_GROUP_TRUST = PASS_LOCAL
CHAPTER_2_APPROVED_SOURCE = 6e5b2660813046ad6b6d1cc20ebd53c182d67fb8
CHAPTER_2_PRODUCTION_ACCEPTANCE = NOT_YET_ACCEPTED
CHAPTER_3_PRODUCTION_TRANSITION = BLOCKED
READY_FOR_NEXT_FEATURE_CHAPTER = NO
GITHUB_DEVELOPMENT_PROGRESS_ALIGNMENT = ALWAYS_ON
```

## Chapter 3 blocked conditions

```text
WRANGLER_REMOTE_AUTH = VERIFIED
INTENDED_PRODUCTION_LINE_GROUP = NOT_IDENTIFIED
MIGRATION_0041_REMOTE_STATE = NOT_APPLIED; remote latest is 0040
AUTHENTICATED_GROUP_AUTHORIZATION_PROCEDURE = NOT_VERIFIED
```

The public health and readiness endpoints were available, but they do not
replace authenticated D1, deployment, or authorization readback. The Test
group is not a Production target and must not be promoted implicitly.

## Chapter 3 read-only checkpoint — 2026-09-14

Wrangler OAuth was completed by the human operator. Authenticated read-only
checks then established that the remote D1 migration tracker contains
0001–0040 and has no pending migration; migration 0041 has not been applied.
The current deployed Worker readback is the 100% deployment version
`f4bd4c6c-8cd0-46a2-9278-f8fc00810bde`; public health and readiness are both
normal and canonical write hold is OFF.

The remote `line_groups` schema still has no `operational_authorized` column,
and the current organization has two registered groups. Both are `unbound`,
have no farm binding, and neither can be uniquely identified as the intended
Production group from authoritative metadata. No raw group id is stored in
this durable plan.

```text
WRANGLER_REMOTE_AUTH = VERIFIED
CURRENT_DEPLOYED_WORKER = f4bd4c6c-8cd0-46a2-9278-f8fc00810bde
REMOTE_D1_LATEST_MIGRATION = 0040_line_group_operator_scope_binding.sql
MIGRATION_0041_REMOTE_STATE = NOT_APPLIED
REGISTERED_LINE_GROUP_COUNT = 2
INTENDED_PRODUCTION_LINE_GROUP = NOT_IDENTIFIED
AUTHENTICATED_GROUP_AUTHORIZATION_PROCEDURE = NOT_VERIFIED
PRODUCTION_MIGRATION = 0
PRODUCTION_DEPLOYMENT = 0
PRODUCTION_GROUP_AUTHORIZATION = 0
LINE_SEND = 0
PRODUCTION_SYNTHETIC_BUSINESS_WRITE = 0
FINANCE_MUTATION = 0
STOCK_UNINTENDED_DELTA = 0
STOP_REASON = STOP_1_INTENDED_PRODUCTION_GROUP_NOT_UNIQUELY_IDENTIFIED
```

The only missing human-supplied fact for Phase A is the exact intended
Production LINE group identity (human-confirmed label plus its provider group
identity). The two unbound rows must not be promoted by inference. Chapter 3
remains blocked; no migration, deployment, authorization, LINE send, or
business-data mutation is permitted until that identity is confirmed.

## Fixed Chapter 3 transition order

```text
identify intended Production group
→ establish authenticated Wrangler/Cloudflare remote access
→ authoritative pre-change baseline
→ migration 0041
→ schema/data readback
→ approved Worker deployment
→ explicit intended-group authorization
→ authorization readback
→ safe real-LINE acceptance
→ integrity delta check
→ PASS or rollback
```

Worker-before-schema is forbidden. Migration 0041 is additive; existing
groups remain unauthorized until explicit authorization. A Worker rollback
must not drop migration 0041.

## Chapter 3 mutation record

```text
PRODUCTION_MIGRATION = 0
PRODUCTION_DEPLOYMENT = 0
PRODUCTION_GROUP_AUTHORIZATION = 0
LINE_SEND = 0
PRODUCTION_SYNTHETIC_BUSINESS_WRITE = 0
FINANCE_MUTATION = 0
STOCK_UNINTENDED_DELTA = 0
```

## Readiness rule

Do not start a later feature chapter while Chapter 3 is `BLOCKED`. The
blocker must be cleared through the explicit transition order above; do not
use raw SQL, wildcard authorization, synthetic Production records, or a
legacy operator binding as a substitute.

## Chapter 3A — group identification and authorization readiness checkpoint

Machine-only evidence exhausted the available authoritative sources without
identifying a legitimate Production LINE group. The group with substantial
historical activity is the human-confirmed Test group
`++開發++金雞協會Ai助手測試頻道++`, mapped by the existing evidence to Test
Farm `金雞測試場`; it must not be promoted. The other registered row is a
synthetic Web registration with no real LINE group activity and no farm
binding. Neither is a Production target.

The missing authenticated procedure was added locally as a narrow Web admin
route:
`PATCH /api/line-groups/:groupId/operational-authorization`.
It requires an existing authenticated admin session, an explicit target,
organization ownership, `authorized` plus `confirm=true` and a reason, rejects
left/unknown/cross-organization groups, writes immutable audit before/after
state, reads the result back, and fails closed when the 0041 column is
unavailable. Repeating the same state is idempotent. This route does not
authorize any group by itself.

```text
CHAPTER_3A_GROUP_IDENTIFICATION = COMPLETE_READ_ONLY
MACHINE_INVESTIGATION_EXHAUSTED = YES
INTENDED_PRODUCTION_LINE_GROUP = NOT_IDENTIFIED
HUMAN_CHOICE_REQUIRED = YES
AUTHENTICATED_GROUP_AUTHORIZATION_PROCEDURE = VERIFIED_LOCAL
AUTHORIZATION_PROCEDURE_SOURCE_COMMIT = f5befec903dc56b8a5900dc934b8e4b9cca17ca7
FOCUSED_AUTHORIZATION_TESTS = PASS
FULL_REGRESSION = 920 passed / 11 skipped
DIFF_CHECK = PASS
PRODUCTION_MIGRATION = 0
PRODUCTION_DEPLOYMENT = 0
PRODUCTION_GROUP_AUTHORIZATION = 0
PRODUCTION_BUSINESS_WRITE = 0
FINANCE_MUTATION = 0
LINE_SEND = 0
AI_CALLS = 0
CHAPTER_3 = BLOCKED
STOP_REASON = STOP_1_INTENDED_PRODUCTION_GROUP_NOT_UNIQUELY_IDENTIFIED
```

No raw provider group identifier is stored in this plan. The next human-only
input is the name/identity of the real Production LINE group; do not select
the Test group or the synthetic Web registration. The procedure must remain
un-deployed and 0041 must remain unapplied until the approved Chapter 3
transition order is explicitly authorized.

## Chapter 3B — machine preparation for real Production group identification

The documentation-only alignment correction is prepared together with the
machine-side handoff. Wrangler remote authentication remains valid. The
current deployed Worker version is healthy: `/health` reports `ok=true` and
canonical write hold `OFF`; `/ready` is normal with no unfinished, stalled,
retryable, retained-open, or reply-failure work. Remote D1 remains applied
through 0040 and reports 0041 pending; no migration was applied.

The remote baseline still has two registered rows. The known human-confirmed
Test group has 798 reply-completed LINE events and remains Test-only. The
other row has no LINE events and remains a synthetic Web registration. No
Production group is inferred from either row.

Source inspection selected the harmless verification phrase `正式群組驗證`.
It contains none of the reviewed deterministic mutation/query/control or
canonical recording markers, so it is suitable only to attribute one new
real LINE event and cannot be used as a business record request.

```text
CHAPTER_3B_MACHINE_PREPARATION = COMPLETE
WRANGLER_REMOTE_AUTH = VERIFIED
CURRENT_DEPLOYED_WORKER = f4bd4c6c-8cd0-46a2-9278-f8fc00810bde
HEALTH = PASS
READY = PASS
REMOTE_D1_LATEST_APPLIED = 0040_line_group_operator_scope_binding.sql
MIGRATION_0041_REMOTE_STATE = NOT_APPLIED
REGISTERED_LINE_GROUP_COUNT = 2
INTENDED_PRODUCTION_LINE_GROUP = NOT_IDENTIFIED
SAFE_VERIFICATION_PHRASE = 正式群組驗證
PRODUCTION_MIGRATION = 0
PRODUCTION_DEPLOYMENT = 0
PRODUCTION_GROUP_AUTHORIZATION = 0
PRODUCTION_BUSINESS_WRITE = 0
FINANCE_MUTATION = 0
AI_CALLS = 0
GITHUB_DEVELOPMENT_PROGRESS_ALIGNMENT = ALIGNED
CHAPTER_3 = BLOCKED
NEXT_HUMAN_ACTION = 在真正 Production LINE 群組邀請機器人後，送出一次正式群組驗證
```

No raw provider group identifier is stored in this plan. After the single
human action, the new event must be attributed by timestamp, group metadata,
organization, and exclusion of the Test/synthetic rows before any group can
be considered Production.

## 2026-09-15 — Chapter 3 terminal human/environment block

The minimum group-name status and Web revocation changes were implemented,
tested, pushed, and the Worker was deployed. The controlled Pages workflow is
now the only remaining transition dependency. GitHub reports the deploy job
waiting for `github-pages` deployment approval; the environment has no
reviewers, the current account cannot approve it, and the authenticated Safari
job page exposes no `Review deployments` or `Approve` control. No environment
policy was changed and the workflow was not cancelled or bypassed.

```text
CHAPTER_3 = TRUE_HUMAN_BLOCKED
CHAPTER_3_BLOCKER = GITHUB_PAGES_ENVIRONMENT_APPROVAL_UNAVAILABLE
CONTROLLED_PAGES_RUN = 34919937805
CONTROLLED_PAGES_HEAD = 80b2b70f45ec093b12296c1e4fe3b32c77d99176
CONTROLLED_PAGES_DEPLOYMENT = WAITING_FOR_APPROVAL
WEB_PAGES_DEPLOYMENT_VERIFIED = NO
PUBLIC_BUILD_SHA = LOCAL_UNBUILT
WORKER_SOURCE = e001106506c5e62a86a1968f9b076e7d8d11319a
WORKER_DEPLOYED = YES
WORKER_HEALTH_READY = PASS
PRODUCTION_GROUP = ++金雞Ai助手正式++
GROUP_ORGANIZATION_CLAIM = NOT_EXECUTED
TARGET_GROUP_AUTHORIZED = NOT_EXECUTED
REVOCATION_UI_PRESENT = YES
REVOCATION_CAPABILITY = PASS_BY_TEST_EVIDENCE
UNIDENTIFIED_GROUP_ACTIONABLE = NO
PRODUCTION_MIGRATION = 0
PRODUCTION_BUSINESS_WRITE = 0
STOCK_UNINTENDED_DELTA = 0
FINANCE_MUTATION = 0
TEST_PRODUCTION_CROSSOVER = 0
READY_FOR_NEXT_FEATURE_CHAPTER = NO
```

The exact Pages approval or environment-policy action must be completed by a
GitHub account with the required repository/environment authority before the
existing Chapter 3 transition can resume. No Production group claim,
authorization, business write, stock mutation, or Finance mutation was made
in this blocked state.

## 2026-09-15 — Chapter 3 terminal evidence closure (latest)

This latest section supersedes the earlier environment-block entry. The
previously completed Production transition now has authoritative read-only
evidence. The current Web readback identifies `++金雞Ai助手正式++` as the
sole organization-owned, operationally authorized group. D1 audit correlation
to that current authorized row found one immutable organization-claim audit at
`2026-09-15 01:01:27` UTC with organization `NULL -> SET`, and one immutable
operational-authorization audit at `2026-09-15 01:01:34` UTC with
`operational_authorized 0 -> 1`. No mutation was repeated to manufacture
evidence.

The controlled Pages workflow is verified on the exact tested Web SHA
`80b2b70f45ec093b12296c1e4fe3b32c77d99176`; public build-SHA readback matches,
and the Worker source `e001106506c5e62a86a1968f9b076e7d8d11319a` is deployed
and healthy. Migration 0041 and its schema readback are present.

Safe real-LINE boundary evidence is complete without a business write. In the
authorized Production group, `今日狀況` produced a visible Bot reply; its
authoritative event receipt is `reply_completed`, `reply_status=sent`, HTTP
200, and `business_status=completed`. The deployed source and existing tests
prove ordinary group members are accepted by group authorization, direct
messages have no group context and cannot enter formal operations, and
missing/left/cross-organization/unauthorized groups fail closed.

The bounded read-only operation produced zero stock, canonical business,
Finance, AI, Test/Production crossover, and unintended authorization deltas.
Production write acceptance remains deferred until a real business event.
No raw provider group identifier is stored in this plan.

```text
CLAIM_AUDIT = PASS
CLAIM_READBACK = PASS
AUTHORIZATION_AUDIT = PASS
AUTHORIZATION_READBACK = PASS
AUTHORIZED_READ = PASS
ORDINARY_MEMBER_GROUP_TRUST = PASS
DM_DENIED = PASS
UNAUTHORIZED_BOUNDARY = PASS
WRITE_ACCEPTANCE = DEFERRED_UNTIL_REAL_BUSINESS_EVENT
STOCK_DELTA = 0
CANONICAL_BUSINESS_DELTA = 0
FINANCE_DELTA = 0
TEST_PRODUCTION_CROSSOVER = 0
TEST_GROUP_AUTHORIZATION = 0
SYNTHETIC_GROUP_AUTHORIZATION = 0
UNINTENDED_GROUP_AUTHORIZATION = 0
CHAPTER_3 = PASS
PRODUCTION_CHAPTER_2_AUTHORITY = ACCEPTED
READY_FOR_NEXT_FEATURE_CHAPTER = YES
```

## 2026-09-15 — Chapter 4 normal LINE operations authority unification

The normal LINE source inventory found two reachable authority divergences.
The legacy `bind` command could still rewrite the group farm context through a
direct `line_groups` update, and the reliability `重新顯示` postback could
redisplay a retained reply before the authorized-group trust check. The legacy
LINE binding mutation is now retired with a safe no-write response, and
reliability redisplay reuses the existing canonical group authorization seam.
Legacy operator identity/scope tables remain for Web compatibility and audit,
but are not a prerequisite for normal LINE operations. Web admin-only paths and
system join/leave bookkeeping remain outside this normal operator boundary.

The focused source-contract tests, existing authorized-group tests, canonical
LINE local runtime (18/18), taxonomy parity, migration rehearsal, and full
TypeScript/Vitest suite passed. The older quick-record harness was also run;
its unrelated pre-existing fixture/time assumptions reported 11/25 checks and
did not exercise either changed route, so it is not used as Chapter 4 evidence.
No Production action, LINE send, AI call, business write, stock mutation, or
Finance mutation was performed.

```text
CHAPTER_4 = PASS
NORMAL_LINE_AUTHORITY_UNIFIED = PASS
USER_REACHABLE_LEGACY_AUTHORITY_DIVERGENCE = 0
ORDINARY_MEMBER_EQUAL_TRUST = PASS
MULTI_FARM_OPERATION = PASS
DM_DENIED = PASS
UNAUTHORIZED_GROUP_DENIED = PASS
ENTITY_RESOLUTION = PASS
LINEAGE_INTEGRITY = PASS
STOCK_INTEGRITY = PASS
ENVIRONMENT_ISOLATION = PASS
FOCUSED_TESTS = PASS
CANONICAL_LINE_RUNTIME = PASS_18_OF_18
FULL_REGRESSION = PASS_928_PASSED_11_SKIPPED
DIFF_CHECK = PASS
SOURCE_COMMIT = 24c1e06d81bfa7421765e474e2961816d8678dc9
PRODUCTION_UNEXPECTED_DELTA = 0
READY_FOR_NEXT_FEATURE_CHAPTER = YES
GITHUB_DEVELOPMENT_PROGRESS_ALIGNMENT = ALIGNED
```

No raw provider group identifier is stored in this plan. Chapter 5 was not
started.

## 2026-09-15 — Chapter 5 LINE singleton administrator boundary

Chapter 5 implementation is complete locally but cannot be activated safely
until the protected singleton LINE administrator identity is provisioned. The
runtime now uses only the exact `LINE_SYSTEM_ADMIN_USER_ID` protected binding
for LINE admin actions; legacy LINE password verification and `admin_sessions`
are no longer LINE authorization sources. Web password/session authentication
remains a separate Web transport path. The narrow bootstrap command requires
the fixed identity, explicit confirmation, an existing unbound current group,
one active organization, an atomic claim/authorization update, and
authoritative readback. All non-presentation postbacks use the existing group
trust boundary before any operation, including admin menus.

Local evidence: focused admin/parser tests PASS (36/36), full TypeScript/Vitest
regression PASS (85 files; 930 passed, 11 skipped), local menu runtime PASS
(71/71), local conversational preview runtime PASS (11/11), and `git diff
--check` PASS. The protected runtime secret-name inventory contains no
`LINE_SYSTEM_ADMIN_USER_ID`; no secret value was read. No Production deploy,
LINE mutation, business write, stock mutation, Finance mutation, or group
authorization was performed for Chapter 5.

```text
CHAPTER_5 = TRUE_HUMAN_BLOCKED
SINGLETON_SYSTEM_ADMIN = PASS_BY_SINGLE_PROTECTED_BINDING
FIXED_LINE_ADMIN_IDENTITY = NOT_PROVISIONED
ADMIN_IDENTITY_PROTECTED = PASS_BY_RUNTIME_CONFIG_DESIGN
LEGACY_LINE_ADMIN_PASSWORD_AS_AUTHORITY = NO
LEGACY_LINE_ADMIN_SESSION_AS_AUTHORITY = NO
AUTHORIZED_GROUP_NORMAL_MEMBER_BEHAVIOR_UNCHANGED = PASS_LOCAL
ADMIN_ONLY_CAPABILITIES = PASS_LOCAL_BOUNDARY
UNAUTHORIZED_GROUP_ADMIN_BOOTSTRAP = PASS_LOCAL
BOOTSTRAP_SCOPE_ESCALATION = 0
ORDINARY_MEMBER_ADMIN_ESCALATION = 0
AUDIT_ADMIN_ATTRIBUTION = PASS_LOCAL
TEST_PRODUCTION_ISOLATION = PASS
USER_REACHABLE_LEGACY_ADMIN_AUTHORITY_DIVERGENCE = 0
FULL_REGRESSION = PASS_930_PASSED_11_SKIPPED
PRODUCTION_UNEXPECTED_DELTA = 0
READY_FOR_NEXT_FEATURE_CHAPTER = NO
BLOCKER = PROTECTED_LINE_SYSTEM_ADMIN_USER_ID_NOT_PROVISIONED
```

The remaining action is a protected configuration operation by an authorized
human who controls the real LINE administrator identity. Do not place the raw
identity in source, documentation, client code, logs, or chat. After that
configuration is present, Chapter 5 can be rechecked without changing the
normal authorized-group boundary; Chapter 6 is not started.

## 2026-09-15 — Chapter 5 activated and accepted

The sole administrator sender identity was uniquely established from the
post-cutoff real Production LINE verification event in the verified Production
group and stored only in the protected `LINE_SYSTEM_ADMIN_USER_ID` runtime
secret. Its value was never read back or stored in source, documentation,
client code, logs, or chat. The exact tested Worker source
`b90a556bba40ade1ab570cd8ab091ea1c0c92980` was deployed as the approved
runtime. Health/readiness passed with the canonical write hold OFF, and the
protected secret-name inventory confirmed the binding exists.

One harmless Production `系統狀態` read produced a visible outgoing message
and Bot response, proving the fixed identity can use an admin-only read in the
authorized Production group. Existing local boundary tests cover non-admin
denial, unauthorized-group bootstrap denial, legacy LINE password/session
non-authority, ordinary-member behavior, and opaque audit attribution. No real
business record was created.

```text
CHAPTER_5 = PASS
SINGLETON_SYSTEM_ADMIN = PASS
FIXED_LINE_ADMIN_IDENTITY = PASS
ADMIN_IDENTITY_PROTECTED = PASS_BY_RUNTIME_SECRET
PRODUCTION_HEALTH_READY = PASS
PRODUCTION_GROUP_AUTHORIZATION_READBACK = PASS
CORRECT_LINE_ADMIN_STATUS_READ = PASS
NON_ADMIN_LINE_ADMIN_DENIED = PASS_LOCAL
UNAUTHORIZED_GROUP_ADMIN_BOOTSTRAP = PASS_LOCAL
BOOTSTRAP_SCOPE_ESCALATION = 0
ORDINARY_MEMBER_ADMIN_ESCALATION = 0
LEGACY_LINE_ADMIN_PASSWORD_AS_AUTHORITY = NO
LEGACY_LINE_ADMIN_SESSION_AS_AUTHORITY = NO
AUDIT_ADMIN_ATTRIBUTION = PASS_LOCAL
TEST_PRODUCTION_ISOLATION = PASS
FOCUSED_TESTS = PASS_36_OF_36
FULL_REGRESSION = PASS_930_PASSED_11_SKIPPED
LOCAL_MENU_RUNTIME = PASS_71_OF_71
LOCAL_PREVIEW_RUNTIME = PASS_11_OF_11
PRODUCTION_UNEXPECTED_BUSINESS_DELTA = 0
PRODUCTION_UNEXPECTED_STOCK_DELTA = 0
PRODUCTION_UNEXPECTED_FINANCE_DELTA = 0
RAW_LINE_USER_ID_IN_DURABLE_DOCS = 0
SOURCE_COMMIT = b90a556bba40ade1ab570cd8ab091ea1c0c92980
DEPLOYED_WORKER_VERSION = b4a472f0-8462-4825-9fa0-3121aa394f5c
PRODUCTION_UNEXPECTED_DELTA = 0
READY_FOR_NEXT_FEATURE_CHAPTER = YES
BLOCKER = NONE
```

Chapter 6 is not started. No raw provider group or sender identifier is stored
in this plan.

## 2026-09-15 — Chapter 6 unified Web access classes (latest)

Chapter 6 is complete in the local Worker and Web source. The reachable Web
route inventory now has one enforced access policy with three classes:
PUBLIC, SHARED_EDIT, and ADMIN. The Worker dispatch boundary rejects unknown
routes and malformed environments, while the Web client exposes public read
access and explicit shared/admin login transitions. Existing canonical read,
write, correction, reversal, lifecycle, and audit paths are reused; no
parallel business authority was introduced.

```text
CHAPTER_6 = PASS_LOCAL
WEB_ACCESS_POLICY_UNIFIED = PASS
UNCLASSIFIED_REACHABLE_WEB_ROUTES = 0
PUBLIC_NO_PASSWORD = PASS
PUBLIC_READ_ONLY = PASS
PUBLIC_SENSITIVE_DATA_EXPOSURE = 0
SHARED_EDIT_OPERATIONAL_WRITE = PASS
SHARED_EDIT_FINANCE_READ = PASS
SHARED_EDIT_ADMIN_ESCALATION = 0
SHARED_EDIT_FINANCE_MUTATION = DENIED
ADMIN_BOUNDARY = PASS
DIRECT_API_POLICY_ENFORCEMENT = PASS
UI_API_POLICY_PARITY = PASS
UNKNOWN_ENVIRONMENT_FAIL_CLOSED = PASS
TEST_PRODUCTION_ISOLATION = PASS
CANONICAL_LINEAGE_INTEGRITY = PASS
STOCK_INTEGRITY = PASS
AUDIT_ATTRIBUTION = PASS
SESSION_SECURITY = PASS
WORKER_SOURCE_COMMIT = da1d7f90866fb9c02118b5c558a25c83b799910c
WEB_SOURCE_COMMIT = 3b93c2733695b2f901e64702b1bff73e571c8487
WEB_SOURCE_HEAD_AFTER_SAFE_MERGE = 15c117465f716922a852f3160f6a6f9cec80656e
MIGRATION_0042 = CREATED_NOT_APPLIED
PRODUCTION_DEPLOYMENT = 0
PRODUCTION_UNEXPECTED_DELTA = 0
AI_CALLS = 0
FINANCE_MUTATION = 0
READY_FOR_NEXT_FEATURE_CHAPTER = YES
BLOCKER = NONE
```

Worker npm run check passed with 933 passed and 11 skipped across 86 test
files. Web npm run test:all passed static, unit (39/39), integration (34/34),
finance, workflow, Chromium/WebKit E2E, visual pixel comparison, responsive
checks, and security. The local Chapter 6 source and test changes are not
deployed; migration 0042 remains unapplied remotely. No raw provider group or
sender identifier is stored in this plan.
