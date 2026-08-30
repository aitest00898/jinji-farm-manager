# Ambient Extraction V2 — Dev-only frozen design

Status: `SPEC_STATUS = FROZEN`

This document describes an additive, developer-only extraction boundary. It
does not replace or alter the Production Ambient `decisions[]` contract.

## AI boundary

One source message is one extraction unit. The model may return only:

```json
{"events":[{"event":"mortality|cull|abnormal","quantity":0,"detail":"optional"}]}
```

The only top-level key is `events`. Every event object may contain only
`event`, `quantity`, and optional `detail`. `event` is one of `mortality`,
`cull`, or `abnormal`; `quantity` is a positive finite number or `null`.
`null` means that the event exists but its quantity is unknown. `detail` is
allowed only for `abnormal`, must be a short symptom phrase, and is limited to
12 Unicode code points. The implementation never truncates or repairs it.

The model does not provide `kind`, confidence, quantity confidence, raw text,
source references, target references, farm identifiers, timestamps, users,
lineage, or Candidate fields. Original source metadata remains trusted input;
AI output never becomes a replacement for it.

## Structural and semantic boundaries

Malformed JSON, a non-object top level, an invalid top-level key set, or a
non-array `events` value fails the complete message response closed. There is
no fence/prose extraction, substring salvage, auto-close, repair, or partial
JSON recovery.

After a successful parse, event-level violations produce an unresolved or
partial message result. Independent messages continue. A transport failure is
also isolated to its message, is recorded as a bounded technical failure, and
is not retried automatically in the same run.

## System-owned work

The system adds source identity, original event metadata, `kind=event`,
`quantityConfidence=unknown` for null quantities, context/farm status,
lineage, grouping, lifecycle, audit, dedupe, and transaction decisions.
Farm/context resolution is separate from event semantics. An ambiguous farm
does not erase an otherwise valid semantic result and never defaults to a
production farm.

Technical idempotency uses source identity. Semantic duplicates are not
deduped by type, quantity, farm, or time. A separate relation detector handles
explicit cues such as “不是新增” and resolves only against a bounded pending
pool supplied by the caller. It excludes official historical records, does
not use database IDs, and does not invent a time window. A mixed message may
contain both new events and a relation intent.

The first implementation uses message-level processing and no micro-batching.
Semantic partial success is message-scoped and is not JSON salvage. Dev-only
results are staged in memory; they never write Candidate, Buffer, Operational,
Abnormal, Finance, Master, D1, Queue, or LINE state.

## Frozen acceptance

`forensics/ambient-extraction-v2-ground-truth-2026-08-27.json` is the
authoritative artifact. It has `schema_version=ambient_extraction_v2` and
`ground_truth_version=1.0.1`. The version is an explicit aggregate-accounting
correction from `1.0`: no case-level expectation changed. The old aggregate
value `5` omitted D03's valid unknown-quantity abnormal event; the corrected
`semantic_event_count` is `6`. D04 intentionally expects two events (cull 2
and abnormal 2 with detail 腳傷) and carries high cross-event quantity
attribution risk. A future product decision must create a new version rather
than rewrite this version or its historical failures.

DEV-SMOKE-8 expects six semantic events and one relation, with no
chat contamination, hallucination, or duplicate mortality-3 event. Fresh
Unseen contains 13 independently frozen capability cases, including mixed
event-plus-relation behavior.

## Real-model gate

The adapter interface is prepared for the existing Direct Workers AI REST
transport and the Production model contract. The current Cloudflare limits
documentation lists text generation at 300 requests per minute and does not
publish a general concurrent-request number or a special limit for the pinned
Llama 3.2 3B model. Workers runtime outgoing-connection limits are a separate
concept and are not used as an AI concurrency quota. Workers AI pricing also
documents a 10,000 Neurons/day free allocation. These observations do not
replace live account authorization/quota evidence.

The first real V2 run therefore uses conservative serial execution with
`MAX_CONCURRENT_AI_CALLS=1`, an explicit Direct REST opt-in, and a durable
attempt ledger. The planned DEV-SMOKE-8 fixture execution resolves D02 and D05
through the existing deterministic fast path and requires four provider calls
per complete run. There is no preflight call in this gate.

Required order: DEV-SMOKE-8 for three serial runs, stop on any failure; only
after 3/3 may two more runs be executed. Fresh Unseen follows only after 5/5
DEV-SMOKE-8. Human LINE acceptance and Dev Full Flow remain separate gates.

## Stop rules

* Level 1: one field/type issue — review the local field contract.
* Level 2: repeated single decision-type failure in controlled evaluation —
  redesign that decision type.
* Level 3: multiple decision failures, isolated-pass/batch-fail evidence, or
  structural coupling — redesign extraction orchestration.

No level is acted on by this Dev-only fixture implementation.
