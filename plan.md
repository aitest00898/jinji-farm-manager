# Jinji Farm Manager — Commander Project Plan

Status: Chapter 3 is blocked before any Production mutation.

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
