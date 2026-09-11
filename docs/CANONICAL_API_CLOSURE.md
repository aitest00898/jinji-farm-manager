# Canonical Web API closure

Status: local API closure, 2026-09-11. No Worker or Pages deployment was
performed by this Gate.

## Root cause of the former `CANONICAL_API_GAP`

The deployed Lane B source had the taxonomy and read bridge but no shared
canonical write adapter or canonical `/api/records` route. Existing Web
endpoints were table- or legacy-domain-specific, so their existence could not
prove O4, O2, A8, or the other 25-category write contract. The missing layer
was therefore a runtime write boundary, not an O4/O2/A8-only mapping defect.

The closure adds one Web boundary:

```text
Web session -> RecordCommand -> validate -> resolve scope/lineage
             -> shared canonical adapter -> D1 authoritative destination
             -> audit + read-back
```

LINE O3/O9 text handling now calls the same adapter. The O3/O9 destination is
still the existing `operational_events` authority; O1/O4, O2/O5/O6/O7/O8, and
A1-A16 keep the destinations in the write matrix.

## Canonical API surface

| Operation | Endpoint | Auth | Input | Validator / resolver | Persistence | Response |
|---|---|---|---|---|---|---|
| Guided/Quick canonical write | `POST /api/records` | active Web session, organization-scoped | `RecordCommand` or record payload; `clientOperationId` required | `createRecordCommand`, taxonomy validator, shared scope/lineage resolver | shared adapter; one of four authorities | `{ record: { id, destination, taxonomyId, created, stockDelta, lineage } }` |
| Canonical read | `GET /api/records` | active Web session | optional `environment=test`, `farmId`, bounded `limit` | organization + farm environment filter | union read bridge over four authorities | `{ records, lifecycleSummaries, environment }`; each summary includes derived O6 lab status |
| One-water lifecycle/readiness read | `GET /api/lifecycle` | active Web session | optional `environment=test`, `farmId`, `houseId` | organization/environment scope plus read-time effective lineage projection | derived from O1/O3/O7/O9, flock master data, and effective stock; no write | `{ lifecycleSummaries, environment }`; each house includes O6 pending/overdue readback |
| Correction | `POST /api/records/:id/correct` | active Web session | replacement record; route target is injected server-side | same validator plus same-destination lineage | append-only child row; original immutable | same canonical write result |
| Reversal | `POST /api/records/:id/reverse` | active Web session | reversal record; route target is injected server-side | same validator plus same-destination lineage | append-only reversal row; original immutable | same canonical write result |
| O3/O9 legacy compatibility write | existing `POST /api/operational-events` shipment/mortality/cull path | active Web session | existing operational body | canonical command branch for these intents | shared OEA adapter; feed/water compatibility remains outside this taxonomy equivalence | legacy-compatible event response |
| Records/Pending/O6 state | existing read routes including `GET /api/pending-candidates` plus canonical records read | active Web session | bounded query | organization/environment scope | read-only bridge | existing read contracts plus derived `{ pendingSubmissionCount, oldestPendingSubmissionAt, hasOverdueLabSubmission, incompleteReason, statusLabel }`; no new business write |

The compatibility endpoints are not the canonical Guided Record surface. No
`/api/o1` through `/api/a16` endpoint was added, and the Web route does not
contain a second SQL persistence implementation for canonical records.

## Security and environment contract

```text
CORS = allowlist only; OPTIONS is 204; disallowed Origin is 403
AUTH = existing Web session/Bearer boundary; unauthenticated canonical API is 401
ORGANIZATION_SCOPE = session organization is passed into the adapter
CLIENT_OPERATION_ID = required and checked organization-wide across all four destinations
REPLAY = same operation returns the existing authority row without a duplicate
DEFAULT_ENVIRONMENT = production
EXPLICIT_TEST = query environment=test only
UNKNOWN_ENVIRONMENT = does not widen scope; existing helper defaults to production
BROWSER_SECRETS = none added
```

The adapter rejects invalid farm/house/flock scope, cross-organization or
cross-farm lineage, self-reference, multiple lineage references, destination
mismatch, invalid taxonomy, and A1 mortality links that do not resolve to the
same organization's O9 mortality/cull authority.

## Local contract evidence

The final-source local disposable D1 harness submitted representatives for
O1, O2, O3, O4, O6, O9, A1, A8, A12, and A16 through the canonical Web API,
then exercised canonical correction/reversal, legacy operational and
abnormal correction/reversal compatibility routes, replay, read-back,
authentication, CORS, and explicit Test scope. It passed with
`WEB_API_CONTRACT=PASS`, `LEGACY_LINEAGE_ROUTES=PASS`, and
`WEB_SECURITY_SCOPE=PASS`. The run did not contact Production D1, send LINE,
call Workers AI, or deploy Pages.

```text
CANONICAL_API_GAP_ROOT_CAUSE = absent shared runtime write adapter + absent /api/records route
SHARED_RECORD_WRITE_API = POST /api/records
WEB_BYPASSES_BUSINESS_LAYER = NO for canonical surface
WEB_API_CONTRACT_TESTS = PASS (local disposable D1)
LEGACY_CORRECTION_REVERSAL_CONVERGENCE = COMPLETE
ONE_WATER_LIFECYCLE_READINESS = COMPLETE (read-time derived; no second authority)
O6_LAB_SUBMISSION_WORKFLOW = COMPLETE (house-level read-time derived; same reminder deadline)
CANONICAL_API_PRODUCTION_RELEASE = NOT_DEPLOYED; separate release review required
```
