# ONE-WATER FULL LINE AI ACCEPTANCE STANDARD

## Purpose

This standard defines the disposable local acceptance program for one complete
water through the genuine LINE runtime contract before any real Production
pilot. It is an acceptance artifact, not a Production authorization and not a
replacement for human Production sign-off.

## Fixed baseline and safety boundary

- Runtime baseline: `7df2610070518122b1737c62a310ab5492c0e476`.
- Each variant starts from a fresh local Wrangler D1 and the complete local
  migration chain. The synthetic SQL provisions only local farms, houses,
  flocks, aliases, operators, scopes, bindings, and local Web session state.
- Production D1, Production master data, Queue, Finance, Cron, real LINE
  groups, deployment, remote migration, and Workers AI/provider calls are
  forbidden.
- Ambient checks use a schema-valid in-process mock extractor. The mock is
  not a provider call and cannot create an official business fact.

## Corpus and ground truth

- The transcript contains exactly 108 user/group events per variant.
- Variants are `canonical`, `synonym`, and `boundary`.
- `field-coverage-matrix.json` is generated from the current taxonomy and
  write-routing contracts and must cover all 25 taxonomy IDs and 46 subtypes.
- `ground-truth-v1.json`, `ground-truth-v2.json`, and `ground-truth-v3.json`
  are fixed, source-derived expectations. A drift must stop the run; an
  expected-output correction requires an auditable change to the corpus and
  its rationale.

## One-water chronology

The local run covers intake, daily operational facts, O6 waiting/result
lineage, abnormal observation, O9 mortality/cull safety, O3 partial shipment,
exact O3 reversal, reissue, final shipment, cleaning/disinfection, and final
readback. It must finish with effective stock `0`, lifecycle state
`READY_NEXT_INTAKE`, and `readyForNextIntake=true`.

The run also covers candidate/confirmation/cancellation, duplicate event
replay, cross-farm and ambiguous scope, unprovisioned identity permission
gating, menu postback/quick-reply/navigation, quiet-group buffering, and a
manual-vs-cron ambient lease race. Candidate previews are not official writes.

## Required acceptance properties

1. Taxonomy, subtype, required-field, destination, scope, stock, and lineage
   checks are complete for every accepted official fact.
2. Missing/ambiguous scope, unprovisioned confirmation, duplicate replay,
   hypothetical/noise input, and candidate cancellation fail closed with zero
   unsafe official writes.
3. O1 establishes the initial stock basis; O9 reduces stock; O3 partial and
   final shipment semantics are authoritative; reversal targets the exact
   shipment and retains the original row.
4. Correction and reversal are append-only. Effective readback must win over
   client projection.
5. Cross-farm isolation is zero leakage, Finance remains unchanged, and no
   provider/AI call or Production mutation occurs.
6. One baseline run is diagnostic. The acceptance run requires three
   consecutive clean full runs. The event-level score must be at least 99.5%,
   with critical safety conditions passing on every run.

## Evidence and closure

The harness writes the field matrix, three frozen ground-truth files, baseline
and final forensic receipts, and `acceptance-result.json`. A passing local
result proves only the tested source/runtime behavior in disposable D1. If the
tested source differs from the deployed Production source, a real-world pilot
remains closed pending the separately authorized deployment and controlled
  pilot procedure.
