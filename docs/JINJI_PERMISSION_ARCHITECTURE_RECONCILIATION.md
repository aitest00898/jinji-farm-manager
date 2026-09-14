# JINJI Permission Architecture Reconciliation

Status: `CHAPTER_1_READ_ONLY_RECONCILIATION`

This document reconciles the deployed permission and authority boundaries with
the approved product direction. It is a documentation artifact only. It does
not authorize a source change, migration, deployment, Production provisioning,
LINE action, or business-data write.

## 1. Evidence boundary

The current architecture below is traced against the exact deployed release
source:

```text
DEPLOYED_SOURCE_SHA = 7df2610070518122b1737c62a310ab5492c0e476
PRODUCTION_REPOSITORY = aitest00898/jinji-farm-manager
PRODUCTION_CHECKOUT = /Users/joe/Documents/Codex/deployment-prerequisites-20260912
WEB_REPOSITORY = aitest00898/jinji-web-v14r-lab
```

The Web checkout is a separate repository and its pre-existing dirty state was
not changed. This chapter uses source, schema, and call-site evidence rather
than older status reports as authority.

Relevant traces include:

- `src/operator-scope.ts` for provisioned identity, environment, farm,
  house/flock scope, and LINE group binding checks;
- `src/index.ts` for LINE group state, command routing, LINE admin sessions,
  legacy queries, canonical write context, and admin actions;
- `src/web-api.ts` for Web sessions, environment selection, canonical writes,
  operators/scopes, group bindings, master data, finance, and audit routes;
- `src/recording-write-adapter.ts` and `src/canonical-lineage-service.ts` for
  canonical write, lineage, idempotency, stock, and correction/reversal
  authority;
- migrations `0001`, `0003`, `0004`, `0006`, `0010`, `0013`, `0016`, `0038`,
  `0039`, and `0040` for the persisted boundaries.

## 2. Approved target direction

The product direction for this chapter is:

### LINE trust boundary

An authorized LINE group is the operational trust boundary. Authorized groups
have equal operational permissions. A trusted group member may:

- read operational and finance/investment information;
- create daily operational records;
- correct and reverse operational records; and
- create cycles and perform lifecycle operations.

There is no per-user farm-write permission matrix, per-group farm permission
matrix, or supervisor/manager role in this target. Farm, house, and flock are
context and entity-resolution data, not a second role system.

### System administrator

There is one unique system administrator identified by a fixed LINE `userId`
held in protected configuration or by an equivalent singleton provisioning
decision. The administrator alone receives the additional abilities to manage:

- master data;
- finance mutations;
- group authorization;
- settings;
- full audit operations; and
- recovery administration.

The fixed identity value is intentionally not recorded in this document.

### Web access

The target has three explicit Web access classes:

| Access class | Intended capability |
| --- | --- |
| `PUBLIC` | Most operational read-only views; no finance, audit, permission, or system administration. |
| `SHARED_EDIT` | Shared-password operational edits; finance/investor read-only; no permission or system administration. |
| `ADMIN` | Admin-password full control, including finance edits, master data, group authorization, audit, archive, batch recovery, and time recovery. |

This is an access policy direction, not an instruction to introduce a generic
RBAC framework.

### Audit and recovery

Important operations must be traceable. Operational correction/reversal remains
append-only. Finance may mutate or delete current finance data only through an
admin-authorized path, with immutable before/after audit. Audit itself is
immutable; archive is admin-only after the approved retention boundary.

Recovery must eventually support single, batch, selective point-in-time,
dependency-aware, dry-run, and stale-state-protected recovery. The target does
not permit recovery to bypass canonical lineage or environment isolation.

## 3. Current architecture

### 3.1 LINE identity, group, and scope

The deployed canonical write path currently combines these facts:

```text
LINE source.userId
  + exact LINE group
  + organization
  + line_groups status/farm context
  + operator_identities active identity
  + operator_scope_bindings active environment/farm/house/flock scope
  + line_group_operator_bindings active association
  + canonical adapter validation
```

`operatorIdentityKeyFor()` uses the stable LINE user id for a `line_user`; Web
uses an organization Web-admin identity. `requireProvisionedOperatorScope()`
requires an active identity. For a LINE write it also requires a bound group,
an organization match, `status = bound`, a matching `farm_id`, and an active
group/operator/scope binding. The scope binding can narrow to a house or flock.

This is a real authorization gate for canonical writes, not merely descriptive
metadata.

The canonical adapter and lineage service remain the business authority after
the scope gate. They validate entity relationships, environment, idempotency,
stock projection, official destination, and correction/reversal lineage.

### 3.2 Group-to-farm coupling

The current schema and runtime treat a LINE group as having one farm context:

- `line_groups.farm_id` is persisted;
- group state exposes one farm name/id;
- command and query paths use the group farm as a default context; and
- the Web binding endpoint rejects a binding whose farm differs from the
  group's existing farm context.

The current model therefore cannot express the target relationship “one
authorized group can operate across many farms” without either selecting one
farm as the group authority or bypassing a current check. That is a direct
architecture conflict, not a UI gap.

### 3.3 Operator scope responsibility is mixed

The current `operator_scope` boundary carries more than one responsibility:

1. stable identity lookup for a LINE user or Web admin;
2. authorization to an environment/farm/house/flock target;
3. environment isolation checks;
4. group-to-operator-to-scope association for LINE; and
5. a required precondition for canonical writes.

Entity relationship validation itself is also performed by the canonical
adapter/lineage service, while audit actor identity is carried by the write
context. Therefore `operator_scope` should not be deleted as a first step. It
needs a transition role and later decomposition so that group trust,
operator identity, entity resolution, environment isolation, and audit actor
are not permanently treated as one permission concept.

### 3.4 Current admin authority

LINE administration is currently a temporary password-authenticated session
keyed by LINE group and LINE user, with expiry and failed-attempt lockout. The
session gates management, Web-link, developer/status, diagnostics, settings,
finance, and recovery actions, including farm/house/flock master operations.
It does not represent a fixed singleton system-admin identity.

Web administration is a separate organization-scoped shared credential that
returns a hashed-token Bearer session. The current session is the transport
authentication for the Web API; it is not a `PUBLIC`/`SHARED_EDIT`/`ADMIN`
policy split.

### 3.5 Investor link

`line_user_investor_links` is a personal finance-query association. It is used
by investor-specific replies such as “my equity” and “my profit.” It is not the
general LINE authorization boundary, and it must not become one. General
organization or farm queries use their existing organization/context paths.

No self-service investor-link provisioning path was found in the current Web or
LINE surface. That is separate from the target permission model.

### 3.6 Web API and Web surface

The current Web API requires an active Bearer Web-admin session for routes
other than login/session handling. This means the effective current Web model
is one authenticated organization-admin tier, not the target three-tier model.

Current capabilities include:

- canonical record writes, correction, reversal, and reads;
- lifecycle and history reads;
- master-data CRUD with version checks and audit;
- operator identity and scope creation;
- LINE group and operator-scope binding; and
- finance read and audit read surfaces.

The Web Lab surface has no complete operator permission UI, group authorization
UI, investor-link UI, or target access-policy UI. Its Lab overlays are not a
Production authority.

### 3.7 Audit, lineage, and recovery foundation

The current foundation is useful and must be preserved:

- `audit_logs` stores source, actor, action, entity, request id, before, after,
  and changed fields;
- database triggers prevent audit update/delete;
- master data has version columns and stale-write protection;
- canonical facts have client-operation idempotency and append-only
  correction/reversal lineage;
- operational correction/reversal preserves original facts and effective-state
  projection; and
- reliability recovery provides bounded retained-event/manual recovery paths.

The current runtime does not yet prove the full target of immutable audit
archive after 120 days or single/batch/selective point-in-time,
dependency-aware, dry-run, stale-state-protected recovery. Existing
reliability recovery is not the same as a general restore system.

Finance mutation is not exposed as a general current Web API write path in this
release; the target admin finance mutation remains future work and must not be
inferred from finance read capability.

### 3.8 Environment isolation

Farms carry `production` or `test` environment, and canonical entity
validation checks exact farm/house/flock relationships. Canonical writes receive
an environment from their explicit context.

The Web operational read helper recognizes exactly `environment=test`; other
values currently resolve to the compatibility default `production`. This is
narrower than returning both environments, but it is not the target’s fully
explicit fail-closed contract. New public/shared-edit routes must not inherit
this fallback without an explicit policy decision.

### 3.9 Legacy paths

The canonical write adapter is the authority for the taxonomy-backed write
surface. Some legacy quick-record feed/water paths and older query paths do not
share the same operator-scope gate uniformly. They must be inventoried and
kept as compatibility paths until a separately authorized migration confirms
their authority and safety; they are not evidence for creating a second
business authority.

## 4. Current authority matrix

| Concern | Current authority | Current result |
| --- | --- | --- |
| LINE canonical operational write | LINE user + group + provisioned operator/scope/binding + canonical adapter | Narrower than target; trusted group member alone is insufficient. |
| LINE operational read | Organization/context and, for some queries, group/farm fallback | Not one uniform authorized-group policy. |
| Finance read | Organization/context; investor link for personal queries | Investor link is not general authorization. |
| Finance write | No general Web finance mutation route in this release; admin-only LINE surface exists for admin workflows | Target admin mutation is not yet represented as a single verified Web policy. |
| LINE admin | Temporary password-authenticated group/user session | Not a unique fixed system administrator. |
| Web admin | Shared password → hashed Bearer session | One admin tier, not public/shared-edit/admin. |
| Environment | Farm/entity environment plus route-derived Web environment | Unknown Web values fall to production compatibility default. |
| Operational correction/reversal | Canonical append-only lineage | Preserve. |
| Audit | Append-only `audit_logs` with before/after/request metadata | Preserve; archive/recovery target is incomplete. |
| Recovery | Existing reliability recovery paths | Not full target restore/recovery. |

## 5. Conflict map

| ID | Conflict | Product impact | Required direction |
| --- | --- | --- | --- |
| C1 | Target authorized group → many farms; current group has one farm context. | One trusted group cannot safely operate multiple farms. | Decouple group trust from farm context; resolve farm/house/flock explicitly. |
| C2 | Target trusts all members of an authorized group; current canonical writes require per-user operator identity, scope, and group binding. | A valid group member can be denied despite group authorization. | Add an authorized-group decision seam and retain the current scope gate as a compatibility bridge during migration. |
| C3 | Target has one fixed system administrator; current LINE admin is password/session based for any group/user. | Admin identity and normal group trust are not separated. | Introduce a singleton admin identity decision, then migrate admin actions without widening normal access. |
| C4 | Target Web has `PUBLIC`, `SHARED_EDIT`, and `ADMIN`; current Web has one Bearer admin session. | Public read and shared operational edit cannot be expressed safely. | Add route policy at dispatch while retaining current session transport initially. |
| C5 | Target trusted members may read finance; target finance mutation is admin-only; current investor links are personal-query convenience and current Web finance is read-only. | Finance visibility and mutation boundaries are not represented by one explicit policy. | Keep investor link separate; add explicit finance policy only with audit and admin guardrails. |
| C6 | Target recovery includes point-in-time/batch/selective/dependency-aware/dry-run/stale-state protection; current recovery is reliability recovery. | Restore claims would exceed current evidence. | Design recovery from immutable audit/version/lineage primitives before exposing mutation. |
| C7 | Target requires explicit environment isolation; unknown Web environment currently maps to production. | A malformed or unknown request can receive production-scoped reads. | Reject unknown environment on new public/shared-edit paths; treat legacy fallback as compatibility debt. |
| C8 | Some legacy quick/query paths are not uniformly behind the canonical operator-scope gate. | “All operations share one trust boundary” is not yet literally true. | Inventory and migrate only where a real user journey requires it; do not create a parallel adapter. |

## 6. Component disposition

| Component | Disposition | Reason |
| --- | --- | --- |
| `operator_identities` | `RETAIN_DURING_TRANSITION / ADAPT` | Useful stable actor and audit bridge; not the final group-trust authority. |
| `operator_scope_bindings` | `ADAPT / RETIRE_LATER` | Keep as a narrow compatibility and environment/entity safety gate until group trust is proven. |
| `line_group_operator_bindings` | `RETAIN_AS_COMPATIBILITY / RETIRE_LATER` | Current canonical write bridge; not the target group authorization model. |
| `line_groups` farm fields | `RETAIN_AS_CONTEXT / REMOVE_AUTHORITY_LATER` | Existing reads and legacy resolution depend on them; they must not block group→many-farm transition. |
| LINE group authority | `ADAPT` | Add authorized-group trust as a separate decision from farm/house/flock resolution. |
| Investor link | `KEEP_AS_PERSONAL_QUERY_ASSOCIATION` | Useful for personal queries; bypass for general authorization. |
| LINE admin session | `ADAPT / RETIRE_LATER` | Preserve temporary transport while migrating to fixed system-admin identity. |
| Web admin session | `KEEP_AS_SESSION_TRANSPORT / ADAPT_POLICY` | Hashed token session can carry the future route policy; no immediate session rewrite is needed. |
| Audit foundation | `KEEP / EXTEND_ONLY` | Append-only audit, before/after, actor, and request metadata are required by target. |
| Recovery foundation | `ADAPT / EXTEND` | Existing reliability recovery is retained; full recovery is a separate controlled capability. |

## 7. Minimal migration strategy

No destructive migration is required now. The safest path changes decision
boundaries before deleting storage:

### Stage 0 — Contract and observation only

Freeze the target policy, record current-vs-target decisions, and add no runtime
authority switch. If implementation later requires observation, use dual
decision/telemetry without changing the write result.

### Stage 1 — Protect the recovery foundation

Keep immutable audit, entity versions, stale-write checks, canonical lineage,
and idempotency. Specify archive and recovery semantics before exposing any new
finance or recovery mutation. Do not call existing reliability recovery a full
restore feature.

### Stage 2 — First boundary: LINE authorization seam

Change the authorization seam around `requireProvisionedOperatorScope()` so an
authorized group can be recognized independently from its farm field and
per-user operator binding. During transition:

1. keep the current identity/scope/binding checks available as a compatibility
   safety bridge;
2. resolve the requested farm/house/flock through the existing canonical entity
   resolver and environment checks;
3. shadow-compare old and target decisions; and
4. switch authority only after no unsafe disagreement remains.

This is the first implementation boundary because it resolves C1 and C2
without replacing canonical storage, lineage, stock, or idempotency.

### Stage 3 — Migrate normal LINE operations

Move normal reads and writes to the authorized-group trust decision plus
explicit entity resolution. Keep operator scope and group binding in
read-only/compatibility mode until all relevant legacy paths are covered.
Canonical correction/reversal remains unchanged.

### Stage 4 — Migrate administration

Introduce the unique system-admin identity decision for admin-only commands.
Keep the temporary LINE admin session only as a bounded legacy fallback during
transition. Do not grant system-admin abilities to ordinary authorized-group
members.

### Stage 5 — Add Web route policy

At the existing Web route dispatch boundary, map routes to `PUBLIC`,
`SHARED_EDIT`, or `ADMIN`. Reuse hashed session transport initially. Enforce
finance, permission, audit, archive, recovery, and master-data restrictions at
the common policy boundary, not in separate route-specific persistence code.

### Stage 6 — Keep investor association separate

Retain investor links for personal-query convenience. Add provisioning or
management only if a separate product requirement exists; never use investor
link presence as general group authorization.

### Stage 7 — Retire compatibility authority only after proof

After acceptance and rollback coverage, retire group farm fields as authority,
old operator-scope write gating, temporary admin sessions, and legacy defaults
one at a time. Never drop the tables first and never remove the old path before
the new path can be switched back.

## 8. Rollback and integrity rules

The migration must preserve these invariants at every stage:

```text
TEST_PRODUCTION_ISOLATION = PRESERVED
CANONICAL_ENTITY_RESOLUTION = PRESERVED
STOCK_AUTHORITY = PRESERVED
CORRECTION_REVERSAL_LINEAGE = PRESERVED
IDEMPOTENCY = PRESERVED
FINANCE_OPERATIONAL_ISOLATION = PRESERVED
AUDIT_APPEND_ONLY = PRESERVED
```

Rollback is a policy/feature-flag rollback to the prior decision boundary,
with old columns and tables retained. It is not a destructive schema rollback.
If old and new authorization decisions disagree, fail closed for the mutation
and retain the evidence for reconciliation. Do not silently widen access or
fall back from an unknown environment to a different environment on a new
route.

## 9. Acceptance implications

Before the target policy can be declared implemented, later chapters must
prove at least:

1. one authorized group can safely resolve and operate more than one farm;
2. any trusted member of that group can perform the target operational actions
   without a per-user farm-write binding;
3. admin-only master-data, finance mutation, group authorization, audit,
   archive, and recovery actions remain denied to ordinary members;
4. Web route behavior matches the `PUBLIC`/`SHARED_EDIT`/`ADMIN` matrix;
5. investor-link absence does not block general authorized-group reads;
6. unknown environment input fails closed on every new path;
7. canonical correction/reversal, stock arithmetic, idempotency, and effective
   readback remain unchanged; and
8. recovery dry-run and stale-state protection are demonstrated before
   recovery mutation is exposed.

These are implementation acceptance implications, not tests to run in this
read-only chapter.

## 10. Explicit non-goals of Chapter 1

This chapter does not:

- add a generic RBAC or permission runtime;
- add Web permission/provisioning UI;
- change Worker source or migrations;
- provision Production farms, houses, flocks, operators, or groups;
- deploy or apply a remote migration;
- mutate finance or operational data;
- send LINE messages;
- implement full recovery or archive; or
- start Chapter 2.

## 11. Chapter 2 boundary

The first implementation boundary, when separately authorized, is the common
LINE authorization seam: decouple authorized-group trust from one-farm and
per-user operator scope while retaining a compatibility bridge around the
existing canonical adapter, entity resolver, environment check, audit, stock,
lineage, and idempotency paths. No implementation is started by this document.

