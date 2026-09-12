# O3 Shipment Operational Semantics

Status: `COMPLETE` (read-time projection plus canonical write guard)

O3 remains authoritative in `operational_events`. The shipment state is not a
stored flag and does not create a second stock authority. For the effective
O1/O3/O9 facts in one flock cycle, the shared read model replays stock in
`occurredAt` order and derives:

```text
stock_after > 0  -> PARTIAL_SHIPMENT
stock_after = 0  -> FINAL_SHIPMENT
unsafe arithmetic -> INCOMPLETE
```

The canonical write adapter performs the same prospective replay before an O3
original or correction is inserted. Missing flock scope, invalid arithmetic,
and over-shipment fail closed; reversal children add no new shipment effect but
must target an O3 fact in the same flock cycle.
The existing append-only lineage projection then recomputes the classification
after correction or reversal.

`GET /api/lifecycle` exposes the current house summary's `shipments` projection.
`GET /api/records` attaches `shipmentProjection` to O3 rows and also exposes
the projection fields for the existing canonical record detail surface. The
projection includes cycle/flock identity, bird count, stock before/after,
shipment state, weight evidence, effective status, correction/reversal state,
and occurrence time.

No migration, new table, new authority, LINE command, Finance path, or business
write is required by this slice. Weight values are shown only when stored or
deterministically derivable from total weight and bird count.

Targeted coverage includes partial/final classification, over-shipment and
negative-stock protection, append-only correction/reversal recomputation,
multiple shipments, cross-cycle isolation, weight readback, and read-model
purity. The disposable canonical write E2E additionally verifies the guard and
API projection fields.
