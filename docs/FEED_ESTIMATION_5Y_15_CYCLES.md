# Feed estimation: five years / fifteen cycles

Status: complete as a read-only deterministic capability, 2026-09-12. No
Production/Test business data, migration, deployment, LINE action, or AI call
is part of this slice.

## Contract

The estimator answers: “依目前日齡與有效存欄，下一次叫飼料約需要多少
kg？” It reads effective canonical O5 `feed_order` facts from
`operational_actions`; O5 remains the only feed authority. It never creates an
O5 order and it does not predict price, FCR, breed performance, weather, or
purchase timing.

The requested house is the reference boundary. A farm-wide fallback is not
used when same-house history is insufficient. Historical candidates are
sorted newest first and limited to the inclusive five-year window ending at
`asOf`, then capped at the latest 15 eligible cycles. The initial minimum is
three eligible cycles, because one or two observations are not a defensible
product estimate.

An eligible historical cycle is a non-current, same-farm/same-house closed
flock with a valid intake/effective-stock basis, a positive completed duration
to its effective final stock event, a complete canonical lifecycle projection
whose effective stock reaches zero, and at least one positive effective O5
order in the current cycle’s seven-day age window. Older cycles can still
provide useful feed history when legacy cleaning (O7) evidence is absent;
cleaning is not silently treated as a feed fact.

## Deterministic method

For each eligible cycle, all positive kg O5 orders in the aligned seven-day
age window are summed. Each order’s denominator is the effective live stock at
that order timestamp, after effective O1/O3/O9 facts and their correction or
reversal lineage. The cycle sample is:

```text
cycle feed kg / average effective live birds at those orders
```

The aligned age window and completed cycle duration provide the temporal
context; the duration is retained in each reference-cycle evidence row so an
operator can audit why a cycle qualified.

The central estimate is the median of the selected cycle samples multiplied
by the current cycle’s effective stock. The displayed range is the minimum to
maximum of those same sample estimates. No outlier is silently deleted and no
confidence score is invented. Missing or contradictory required data returns
`INSUFFICIENT_DATA` with available count, minimum count, and named missing
requirements.

## Read surface and safety

Both authenticated canonical read surfaces include the same `feedEstimate`
projection on each house summary:

```text
GET /api/records?environment=...
GET /api/lifecycle?environment=...
```

The projection is computed at read time from the organization/environment
filtered canonical facts. It has no mutable `house.incomplete` or estimate
table, no second feed authority, no write path, and no AI dependency.

```text
AI_CALLS = 0
BUSINESS_WRITES = 0
STOCK_WRITES = 0
AUTO_ORDER = NO
SECOND_FEED_AUTHORITY = NO
```
