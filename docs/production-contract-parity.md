# Production contract parity

## Scope and authority

This document records a bounded source-parity review for a disposable external audit environment. The Production backend source was read as the contract authority; the audit mirror implements synthetic, memory-only behavior. No Production source or state is changed by this branch.

Runtime evidence remains stronger than documentation. This report does not turn source inspection into a claim that Production has been exercised.

## Decision summary

- PRODUCTION_SOURCE_EDITED: NO
- PRODUCTION_DATA_CHANGED: NO
- CONFIRMED_PRODUCTION_SOURCE_DEFECTS_FROM_THIS_REVIEW: 0
- AUDIT_ONLY_CONTRACT_REPAIRS: YES
- REAL_IDENTIFIERS_OR_PRODUCTION_ENDPOINTS_IN_MIRROR: NO
- LOCAL_OPERATION_COVERAGE: 33 semantic operations
- PRODUCTION_RUNTIME_E2E: NOT_PROVEN
- HUMAN_PAGES_ACCEPTANCE: NOT_PROVEN

A source quirk is recorded as a contract characteristic unless a runtime or acceptance failure proves it is a defect. The audit mirror therefore does not silently redesign Production semantics.

## Contract matrix

| Area | Production contract read from source | Audit mirror treatment | Evidence status |
| --- | --- | --- | --- |
| Chart metrics | Event, cumulative, stock, mortality-rate, weather, and finance routes use server-side scope, bucket, and date semantics; finance has a farm-required path. | Local chart adapter implements the same bounded metric set, date buckets, scope filters, historical stock, area weather, and farm-required finance error. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Operational correction | Correction reverses the original and creates an active correction event linked to the original. | Local adapter follows the same append-only replacement shape. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Operational reversal | Reversal marks the original event reversed; no synthetic replacement row is required. | Local adapter marks the original and keeps the audit row. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Abnormal correction | Correction leaves a corrected parent and creates an active child linked by correction reference. | Local adapter follows the same graph shape. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Abnormal reversal | Reversal marks the original and creates a reversal child linked to it. | Local adapter follows the same graph shape. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Weather | Weather is area-scoped, captured/backfilled rows are usable, and farm selection validates scope without duplicating area rows. | Five synthetic area rows provide captured/backfilled coverage; timeline joins by date. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Time | Production source uses its configured Taipei business-date behavior. | Audit mode uses a fixed local audit date so screenshots and tests are deterministic. | LOCAL-AUDIT-DESIGN |
| Finance | Production schema/source path stores independent financial values; exact live rounding/enforcement semantics are not asserted here. | Synthetic distributions satisfy the inferred gross, allocation, expense, net, investor allocation, and equity invariants. | SOURCE-PARITY / LOCAL-TEST-PASS |
| Reliability | Read/acknowledge/recover/resolve/record boundaries are distinct actions. | Local adapter exposes the same action families with memory-only state transitions. | SOURCE-PARITY / LOCAL-TEST-PASS |
| AI | Production AI is an external/runtime concern and is not invoked by the audit mirror. | Local analysis is a synthetic read-only fixture and explicitly reports that no AI provider was called. | BOUNDARY-PRESERVED |
| Privacy/export | A shared audit artifact must not carry credentials, tokens, real runtime endpoints, production fingerprints, or real business records. | Mirror omits backend/runtime docs and uses a generic scanner plus synthetic fixtures. | SCAN-REQUIRED |

## Audit-only repairs

1. Replaced real remote API fallback with an empty audit-build default so the mirror cannot silently point at a live service.
2. Replaced non-local settings labels that exposed deployment-specific account/model/worker values with deployment-neutral labels.
3. Added a fixed audit clock, matching date inputs and chart to values to the synthetic anchor.
4. Reworked local chart behavior to mirror the server contract rather than calculate only a narrow dashboard sample.
5. Added area weather rows and timeline weather joins, plus captured/backfilled semantics.
6. Corrected local operational and abnormal correction/reversal graph behavior and added graph validation.
7. Added finance fixture invariants without asserting that Production enforces those formulas.
8. Added 33-operation memory-only coverage and separated local-adapter E2E from UI-mock E2E.
9. Replaced the export scanner with a generic, disposable-mirror scanner that does not encode project-specific fingerprints.

## Deliberate unknowns

- Exact Production business values, user identities, group identifiers, and live database rows are not copied into this mirror.
- Authenticated Web E2E, live Worker behavior, Pages deployment, and human acceptance remain outside this local-only repair.
- A source-level characteristic is not promoted to a Production bug without runtime/acceptance evidence.
- Finance rounding and the complete multi-scope weather edge matrix remain UNKNOWN — NOT CURRENT BLOCKER for local audit packaging.

## Safety boundary

This branch may be committed and pushed only as an audit artifact. It must not be merged to main, deployed to Pages or Worker, used to access Production, or treated as a replacement for the Production source-of-truth.

