# Canonical Record Read Model

Last reviewed: 2026-09-09 (Asia/Taipei)

This document describes the read-side contract added for the canonical
recording boundary. It is a source and local-test receipt, not permission to
deploy or to mutate Production.

## Boundary

Every read starts from one of the four authoritative tables and is projected by
`src/canonical-record-read-model.ts` into `CanonicalRecordView`. Web and LINE
must consume that projection; neither channel may reconstruct a command from
display labels, a lossy legacy list, or a second SQL implementation.

The write and read boundaries are:

```text
RecordCommand
  -> validateRecordingDraft
  -> resolveScope + validateRelation
  -> canonical adapter
  -> one authoritative table
  -> read bridge / direct canonical projection
  -> CanonicalRecordView
```

`readStatus=unsafe` is fail-closed. The row remains visible as an explicitly
unsafe source row, but it has no correction or reversal seed and the Web API
does not invent missing domain values. The Web client rejects malformed read
envelopes and never substitutes Lab fixture data for an API read failure.

## Shared implementation matrix

| Capability | Authoritative implementation | Result |
|---|---|---|
| RecordCommand | `createRecordCommand` in `src/record-command.ts` | All 25 taxonomy IDs route to one destination and forbid parallel authority |
| Validator | `normalizeRecordingDraft` + `validateRecordingDraft` in `src/recording-taxonomy.ts` | Required fields, subtype/family/type, derived-field consistency, scope fields and stock-safe semantics are validated |
| Scope resolver | `resolveScope` in `src/recording-write-adapter.ts` | Organization, farm, environment, active house and flock are checked fail-closed |
| Lineage resolver | `lineageFor` + `validateRelation` + `validateRecordingLineage` | Same organization, farm, taxonomy, family and creation order; no self/future/cross-org reference |
| Write adapter | `persistRecordCommand` | One adapter boundary, idempotency, audit, read-back and append-only inserts |
| Read model | `readCanonicalRecordModel` | Four scoped SELECTs, then source-backed projection and lineage status |
| API | `GET /api/records` | Returns `{ environment, records[] }` with fields, derived fields, provenance, safety and lineage |
| Correction | `POST /api/records/:id/correct` | Adds a child in the same authoritative table; original row remains immutable |
| Reversal | `POST /api/records/:id/reverse` | Adds a reversal child in the same authoritative table; original row remains immutable |
| Idempotency | `client_operation_id` for recording/action; `source_event_id` for operational/abnormal event | Same operation does not create a second business fact; cross-destination reuse is rejected |

## Full 25-category coverage

The `RecordCommand`, validator, resolver, canonical adapter, read bridge,
correction path, reversal path and idempotency path columns below are all
source-backed. `PASS` means the final source has a concrete implementation and
the local test matrix exercised the category or its shared family adapter.

| ID | Family / type / subtype(s) | RecordCommand | Validator | Resolver | Canonical adapter / destination | Read bridge | Required fields | Derived fields | Correction / reversal / idempotency | Stock |
|---|---|---:|---:|---:|---|---|---|---|---|---:|
| O1 | `operational_event` / `event` / `chick_in` | PASS | PASS | PASS | recording event adapter → `recording_events` | direct recording projection | `houseId`, `flockId`, `maleCount`, `femaleCount`, `condition` | `totalCount` | same-table append-only child; client operation id | +1 |
| O2 | `operational_action` / `action` / `vaccination`, `medication`, `supplement` | PASS | PASS | PASS | operational action adapter → `operational_actions` | `readLegacyOperationalAction` | `content` | — | same-table append-only child; client operation id | 0 |
| O3 | `operational_event` / `event` / `shipment` | PASS | PASS | PASS | legacy operational-event adapter → `operational_events` | `readLegacyOperationalEvent` | `quantity`, `sex` | `averageWeight` | same-table append-only child; source event id | -1 |
| O4 | `operational_event` / `event` / `weigh` | PASS | PASS | PASS | recording event adapter → `recording_events` | direct recording projection | `houseId`, `flockId`, `averageWeight`, `sex` | `ageDays` | same-table append-only child; client operation id | 0 |
| O5 | `operational_action` / `action` / `feed_order` | PASS | PASS | PASS | operational action adapter → `operational_actions` | `readLegacyOperationalAction` | `vendor`, `weight`, `weightUnit` | — | same-table append-only child; client operation id | 0 |
| O6 | `operational_action` / `action` / `lab_test` | PASS | PASS | PASS | operational action adapter → `operational_actions` | `readLegacyOperationalAction` | `submittedAt`, `content`, `workflowStatus` | `reminderDueAt` | same-table append-only child; client operation id | 0 |
| O7 | `operational_action` / `action` / `disinfection` | PASS | PASS | PASS | operational action adapter → `operational_actions` | `readLegacyOperationalAction` | `workflowStatus` | — | same-table append-only child; client operation id | 0 |
| O8 | `operational_action` / `action` / `maintenance` | PASS | PASS | PASS | operational action adapter → `operational_actions` | `readLegacyOperationalAction` | `maintenanceContent` | — | same-table append-only child; client operation id | 0 |
| O9 | `operational_event` / `event` / `mortality`, `cull` | PASS | PASS | PASS | legacy operational-event adapter → `operational_events` | `readLegacyOperationalEvent` | `quantity` | — | same-table append-only child; source event id | -1 |
| A1 | `operational_observation` / `observation` / `mortality_abnormality` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent`, `linkedMortalityEventId` | — | same-table append-only child; source event id | 0 |
| A2 | `operational_observation` / `observation` / `cough` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A3 | `operational_observation` / `observation` / `respiratory_distress` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A4 | `operational_observation` / `observation` / `activity_down` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A5 | `operational_observation` / `observation` / `eye_swelling`, `white_crown`, `purple_crown`, `black_crown` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A6 | `operational_observation` / `observation` / `watery`, `white`, `green`, `bloody` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A7 | `operational_observation` / `observation` / `growth_delay` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A8 | `operational_observation` / `observation` / `foot_odor` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A9 | `operational_observation` / `observation` / `fever` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A10 | `operational_observation` / `observation` / `heat_stress`, `catching_stress` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A11 | `operational_observation` / `observation` / `feeding_abnormality`, `water_abnormality` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A12 | `operational_observation` / `observation` / `feed`, `water`, `electricity`, `fan`, `cooling`, `heating`, `other` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A13 | `operational_observation` / `observation` / `high_temperature`, `low_temperature`, `heavy_rain` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A14 | `operational_observation` / `observation` / `flooding` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A15 | `operational_observation` / `observation` / `odor` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |
| A16 | `operational_observation` / `observation` / `attack`, `infection`, `spread` | PASS | PASS | PASS | abnormal event adapter → `abnormal_events` | `readLegacyAbnormalEvent` | `extent` | — | same-table append-only child; source event id | 0 |

## Read projection and lineage

`CanonicalRecordView` carries the source-backed domain record, raw domain
fields, derived fields, authority destination, farm/house/flock labels,
environment, channel and operation provenance. The projection also carries:

- `effectiveStatus`: `active`, `corrected`, `reversed`, or `replacement`.
- `isEffective`: a corrected/reversed parent is not effective; a correction
  child is the current replacement fact; a reversal child is a cancellation
  fact and does not create a second quantity.
- `lineage`: both the parent IDs (`correctionOfId`, `reversalOfId`,
  `replacementOfId`) and the discovered child IDs.
- `correctionSeed` and `reversalSeed`: validated source-backed drafts with
  lineage removed. They are null when the row is unsafe. The Web correction
  and reversal UI sends a new command and never reconstructs from labels.

For O3 and O9, `operational_events` remains the only authority. A shipment or
mortality correction/reversal is an append-only child in that same table; no
new table is introduced and no quantity is copied into `abnormal_events`.
A1 remains an observation with stock effect zero even when it links to an O9
mortality event.

## Local evidence

The final-source local evidence for this contract is:

```text
READ_MODEL_UNIT_COVERAGE = 25/25
FINAL_LOCAL_D1_WRITE_E2E = 25/25
DESTINATION_ROUTING = 25/25
WRONG_DESTINATION = 0
DUPLICATE_AUTHORITY = 0
CORRECTION_FAMILY_COVERAGE = 4/4
REVERSAL_FAMILY_COVERAGE = 4/4
DESTRUCTIVE_CORRECTION = 0
IDEMPOTENCY = PASS
LINEAGE = PASS
STOCK_INVARIANT = PASS
FINAL_NEGATIVE_FAIL_CLOSED = PASS
```

The disposable D1 harness applies the local migration chain in a temporary
directory only. It is not a Production migration and it does not contact the
remote D1 database.
