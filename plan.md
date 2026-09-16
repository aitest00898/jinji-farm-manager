# Jinji Farm Manager — Commander Project Plan

Status: Chapter 6 is in terminal PASS. Chapter 7 remains reduced to Audit & Recovery Core and has not started.

## Product direction

Deliver a safe canonical operating system for poultry operators and managers.
Production business facts use the Worker canonical boundary, effective lineage,
authoritative stock, explicit access classes, and fail-closed environment
handling. Test and Lab data never represent Production state.

## Current chapter state

CHAPTER_1_ARCHITECTURE_RECONCILIATION = PASS
CHAPTER_2_AUTHORIZED_GROUP_TRUST = PASS
CHAPTER_3_PRODUCTION_TRANSITION = PASS
CHAPTER_4_NORMAL_LINE_OPERATIONS = PASS
CHAPTER_5_SINGLETON_LINE_ADMIN = PASS
CHAPTER_6_WEB_ACCESS_POLICY = PASS
CHAPTER_7_IMPLEMENTATION = NOT_STARTED
READY_FOR_NEXT_FEATURE_CHAPTER = YES

## Current deployed system

WORKER_SOURCE_COMMIT = b5326d6c816b8afb883c46464e1570873108871c
WORKER_DEPLOYED_VERSION = fffd4545-1a82-49dc-b3a0-80d4658520e9
WORKER_BRANCH = feature/chapter-2-authorized-group-trust-20260914
WEB_SOURCE_SHA = 2264241009ba6c0c2c826a6977dd1b5993602298
PAGES_BUILD_SHA = 2264241009ba6c0c2c826a6977dd1b5993602298
PAGES_PUBLISHING_PATH = SINGLE_CONTROLLED_WORKFLOW
MIGRATION_0041 = APPLIED
MIGRATION_0042 = APPLIED
CANONICAL_WRITE_HOLD = OFF
HEALTH_READY = PASS
GITHUB_DEVELOPMENT_PROGRESS_ALIGNMENT = ALIGNED

## Access and integrity invariants

PUBLIC_BOUNDARY = PASS_PRODUCTION
PUBLIC_FINANCE_EXPOSURE = 0
PUBLIC_AUDIT_EXPOSURE = 0
PUBLIC_PERMISSION_EXPOSURE = 0
PUBLIC_ADMIN_DIAGNOSTIC_EXPOSURE = 0
PUBLIC_SENSITIVE_EXPOSURE = 0
SHARED_EDIT_BOUNDARY = PASS_PRODUCTION
ADMIN_BOUNDARY = PASS_PRODUCTION
DIRECT_API_ENFORCEMENT = PASS_PRODUCTION
ENVIRONMENT_FAIL_CLOSED = PASS_PRODUCTION
TEST_GROUP_AUTHORIZATION = 0
SYNTHETIC_GROUP_AUTHORIZATION = 0
UNINTENDED_GROUP_AUTHORIZATION = 0
PRODUCTION_UNEXPECTED_BUSINESS_DELTA = 0
PRODUCTION_UNEXPECTED_STOCK_DELTA = 0
FINANCE_UNEXPECTED_DELTA = 0
LINE_AUTHORITY_REGRESSION = 0
SINGLETON_LINE_ADMIN_REGRESSION = 0
UNSAFE_PRODUCTION_WRITES = 0
AI_CALLS = 0
P0_COUNT = 0
P1_COUNT = 0
ROLLBACK_READY = YES

## Last authoritative readback

LAST_D1_INTEGRITY_READBACK = 2026-09-15
PRODUCTION_FARMS = 8
TEST_FARMS = 1
OPERATIONAL_ACTIONS = 3
OPERATIONAL_EVENTS = 65
RECORDING_EVENTS = 1
ABNORMAL_EVENTS = 9
PROFIT_DISTRIBUTIONS = 12
AUDIT_LOGS = 148
LINE_GROUPS_TOTAL = 3
LINE_GROUPS_UNBOUND = 0
LINE_GROUPS_LEFT = 0
LINE_GROUPS_OPERATIONALLY_AUTHORIZED = 1
ADMIN_SESSIONS = 84
SHARED_EDIT_SESSIONS = 1
READBACK_WRITES = 0

## Compatibility debt classification

AUTHORITATIVE = canonical business facts, effective lineage, stock arithmetic,
Web access classes, and operationally authorized group trust.
COMPATIBILITY_ONLY = legacy farm-bound LINE context fields and transitional
operator-resolution paths retained for existing reads.
AUDIT_OR_CONTEXT_ONLY = audit logs and provider metadata used for attribution,
traceability, and diagnostics; they are not business authority.
DEAD_OR_UNREACHABLE = Lab/Test fixture data on Production routes and retired
legacy password/session privilege paths.

## Chapter 7 reduced scope

Chapter 7 remains Audit & Recovery Core. Its implementation is limited to:

* audit lifecycle and the 120-day visibility boundary;
* dependency model;
* Dry Run;
* stale-state protection;
* one representative dependency-aware restore path.

Full batch recovery, broad selective PIT recovery, broad Finance recovery,
all-domain lifecycle recovery, and full recovery UI expansion are deferred.
No 7A/7B/7C is created.

## Complexity containment

GOD_FILE_FORWARD_CONTAINMENT = ESTABLISHED
BROAD_SOURCE_REFACTOR = 0
DESTRUCTIVE_COMPATIBILITY_REMOVAL = 0
NEW_GOVERNANCE_ARTIFACT = 0
NO_NEW_SUBSTANTIAL_DOMAIN_LOGIC_IN_ORCHESTRATION_SURFACES = REQUIRED

Git history is the archive for resolved execution narratives. This file is
strategy and current direction only; it is not a permission to deploy or
mutate Production.
