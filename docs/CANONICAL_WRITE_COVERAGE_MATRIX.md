# Canonical write coverage matrix

Status: local canonical write/API closure, 2026-09-09. This is an evidence
receipt for the shared `RecordCommand -> validate -> resolve -> adapter`
boundary. It is not a Production deployment approval and it does not assert
that a LINE human acceptance run has occurred.

The executable source for this matrix is
`src/recording-write-matrix.ts`; it is generated from the same taxonomy
definitions used by validation and `RecordCommand` routing. The local D1 E2E
receipt is produced by `npm run test:canonical-write-local`.

## Legend

| Short name | Meaning |
|---|---|
| REA | `recording_events` adapter |
| OAA | `operational_actions` adapter |
| OEA | legacy-authority `operational_events` adapter; this remains the O3/O9 authority |
| AEA | `abnormal_events` adapter |
| RE / OA / OE / AE | corresponding canonical read bridge |
| CID | organization + `client_operation_id` idempotency |
| SID | organization + `source_event_id` idempotency |
| CWA | `POST /api/records` and `GET /api/records` |
| command boundary | the category can be submitted through the shared adapter; it is not a claim that a new LINE text parser was deployed |
| text -> shared | the existing O3/O9 LINE text path now builds the command and calls the shared adapter |

Every row below has `RecordCommand`, validator, resolver, correction, read,
and API support. `COMPLETE` means no uncovered mapping was found in the
canonical local surface. It does not mean Production canary evidence exists.

## Full 25-category matrix

| ID | Family | Type | Subtype(s) | Command | Validator | Resolver | Adapter | Authority | Required fields | Derived fields | Read | Correction | Idempotency | Stock | API | LINE path | Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---|---|---|
| O1 | operational_event | event | chick_in | PASS | PASS | PASS | REA | recording_events | houseId, flockId, maleCount, femaleCount, condition | totalCount | RE | append-only lineage | CID | +1 | CWA | command boundary | COMPLETE |
| O2 | operational_action | action | vaccination / medication / supplement | PASS | PASS | PASS | OAA | operational_actions | content | — | OA | append-only lineage | CID | 0 | CWA | command boundary | COMPLETE |
| O3 | operational_event | event | shipment | PASS | PASS | PASS | OEA | operational_events | quantity, sex | averageWeight | OE | append-only lineage | SID | -1 | CWA | text -> shared | COMPLETE |
| O4 | operational_event | event | weigh | PASS | PASS | PASS | REA | recording_events | houseId, flockId, averageWeight, sex | ageDays | RE | append-only lineage | CID | 0 | CWA | command boundary | COMPLETE |
| O5 | operational_action | action | feed_order | PASS | PASS | PASS | OAA | operational_actions | vendor, weight, weightUnit | — | OA | append-only lineage | CID | 0 | CWA | command boundary | COMPLETE |
| O6 | operational_action | action | lab_test | PASS | PASS | PASS | OAA | operational_actions | submittedAt, content, workflowStatus | reminderDueAt | OA | append-only lineage | CID | 0 | CWA | command boundary | COMPLETE |
| O7 | operational_action | action | disinfection | PASS | PASS | PASS | OAA | operational_actions | workflowStatus | — | OA | append-only lineage | CID | 0 | CWA | command boundary | COMPLETE |
| O8 | operational_action | action | maintenance | PASS | PASS | PASS | OAA | operational_actions | maintenanceContent | — | OA | append-only lineage | CID | 0 | CWA | command boundary | COMPLETE |
| O9 | operational_event | event | mortality / cull | PASS | PASS | PASS | OEA | operational_events | quantity | — | OE | append-only lineage | SID | -1 | CWA | text -> shared | COMPLETE |
| A1 | operational_observation | observation | mortality_abnormality | PASS | PASS | PASS | AEA | abnormal_events | extent, linkedMortalityEventId | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A2 | operational_observation | observation | cough | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A3 | operational_observation | observation | respiratory_distress | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A4 | operational_observation | observation | activity_down | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A5 | operational_observation | observation | eye_swelling / white_crown / purple_crown / black_crown | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A6 | operational_observation | observation | watery / white / green / bloody | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A7 | operational_observation | observation | growth_delay | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A8 | operational_observation | observation | foot_odor | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A9 | operational_observation | observation | fever | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A10 | operational_observation | observation | heat_stress / catching_stress | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A11 | operational_observation | observation | feeding_abnormality / water_abnormality | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A12 | operational_observation | observation | feed / water / electricity / fan / cooling / heating / other | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A13 | operational_observation | observation | high_temperature / low_temperature / heavy_rain | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A14 | operational_observation | observation | flooding | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A15 | operational_observation | observation | odor | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |
| A16 | operational_observation | observation | attack / infection / spread | PASS | PASS | PASS | AEA | abnormal_events | extent | — | AE | append-only lineage | SID | 0 | CWA | command boundary | COMPLETE |

## Destination and authority result

```text
O1/O4  -> recording_events       (REA)
O2/O5/O6/O7/O8 -> operational_actions (OAA)
O3/O9  -> operational_events     (OEA; legacy authority preserved)
A1-A16 -> abnormal_events        (AEA)
```

The adapter rejects multiple lineage references, self-reference, cross-farm or
cross-organization references, invalid environment scope, invalid house/flock
scope, and idempotency reuse across a different destination. A1 validates a
same-organization mortality/cull link but contributes no stock delta. O3 and
O9 remain the only mortality/shipment stock-changing operational authority;
the A1 abnormality row has stock effect `0`.

## Local proof boundary

The recorded disposable local D1 run proves `25/25` accepted commands,
`25/25` authoritative destinations, zero wrong destinations, zero duplicate
authority, append-only correction, idempotency, lineage, stock arithmetic,
negative fail-closed behavior, and the Web API contract. A later source-only
refinement was compile-tested but not rerun through D1 because its harness
applies migration SQL and this Gate forbids executing migrations. The recorded
run does not prove a deployed Production canary, a Pages release, or LINE
human acceptance.
