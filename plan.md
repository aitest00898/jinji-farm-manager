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
WRANGLER_REMOTE_AUTH = UNAVAILABLE
INTENDED_PRODUCTION_LINE_GROUP = NOT_IDENTIFIED
MIGRATION_0041_REMOTE_STATE = NOT_VERIFIED
AUTHENTICATED_GROUP_AUTHORIZATION_PROCEDURE = NOT_VERIFIED
```

The public health and readiness endpoints were available, but they do not
replace authenticated D1, deployment, or authorization readback. The Test
group is not a Production target and must not be promoted implicitly.

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
