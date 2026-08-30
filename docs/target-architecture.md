# 金雞 LINE Bot Target Architecture

Status: `TARGET_ARCHITECTURE_STATUS = NON_EXECUTING_NORTH_STAR`

This document is a long-term target and anti-drift review baseline. It is not
an implementation plan, a V3 release, a migration authorization, or a
Production rollout instruction.

```text
CURRENT_V2_STATUS = ACTIVE_DEVELOPMENT_PATH
ARCHITECTURE_REWRITE_AUTHORIZED = NO
PRODUCTION_V1_IMMEDIATE_REMOVAL = NO
```

## 1. Scope and authority

The target starts from the actual product need: people in a LINE group should
be able to describe chicken-farm operations in natural Traditional Chinese,
while the system preserves source identity, context, auditability, and safe
business state. The architecture must protect users from both silent omission
and wrong-farm writes.

This document is the architecture reference. The short
`target-architecture-memory-card.md` is a fast reminder, not a replacement for
the full rules. `current-execution-state.md` is deliberately transient and
must not be used as the architecture source of truth.

Nothing in this document authorizes a code change, deployment, migration,
model switch, or data rewrite. Any such action requires its own scope and
approval.

## 2. Product needs

The system must:

- accept ordinary, natural LINE messages from group users;
- represent mortality, cull, abnormal conditions, quantity, farm, house,
  flock, and context when the evidence supports them;
- ask the user when quantity, farm, house, flock, or relation is uncertain;
- keep ordinary conversation out of operational records;
- avoid silent omission and wrong-farm assignment;
- isolate one message's failure from other messages;
- preserve correction and reversal lineage instead of destroying official
  history;
- keep Daily Review, Web, queries, admin, master data, and corrections useful
  when AI is unavailable; and
- keep AI responsible for language understanding, not identity, state,
  transaction, lineage, or authority.

## 3. Current high-level architecture

The following is the evidence-backed current shape, not the target. The
Production Ambient branch still uses the historical batch contract.

```mermaid
flowchart LR
  LINE[LINE group message] --> WH[Worker fetch / webhook]
  WH --> R[Durable line_events receipt]
  R --> FP{Deterministic Fast Path?}
  FP -->|yes| DH[Command / query / fast-path handler]
  FP -->|no| Q[EVENTS Queue]
  Q --> C[Queue consumer / processEvent]
  C --> B[Ambient chat buffer when quiet-group flow applies]
  B --> CRON[Manual or Scheduled Ambient]
  CRON --> PF[ambientPrefilter + context window]
  PF --> AI[One batch AI request: decisions[]]
  AI --> N[parse / normalize / source coverage validation]
  N --> CB[Candidate bundle]
  CB --> ER[enrichment / FarmResolver / resolve / reconcile]
  ER --> W[Candidate Write]
  W --> BC[Buffer Consume]
  W --> D1[(D1 official and pending state)]
  D1 --> WEB[Web and deterministic queries]
  D1 --> DR[Daily Review]
  W --> PUSH[LINE reply / push]
  CR[Recovery cron] --> Q
```

Evidence reviewed for this map includes `src/index.ts` (webhook receipt,
Queue consumer, `scheduled`, and the Production Ambient/Daily Review dispatch
paths), `src/ambient.ts` (`ambientPrefilter`, `ambientPrompt`,
`extractAmbientCandidates`, source coverage, Candidate build, reconcile and
buffer lifecycle), `src/reliability.ts`, `src/daily-review.ts`,
`src/farm-resolver.ts`, `wrangler.jsonc`, and `docs/LINE_RELIABILITY.md`.

## 4. Target architecture principles

### 4.1 Message is the semantic failure boundary

The target flow is:

```text
LINE message
  -> durable receipt and technical idempotency
  -> Queue
  -> message router
  -> deterministic first
  -> AI fallback only when needed
  -> strict validation
  -> deterministic context resolution
  -> pending or official path
  -> D1
```

One source message is one independent semantic processing unit. A transport,
structural, or semantic failure for message A must not erase a successful
result for message B. A complete malformed AI response for one request fails
that message closed; it is never repaired by extracting a substring or by
auto-closing JSON.

### 4.2 Deterministic first, conservatively

Small, tested, high-confidence forms such as an already supported
`死亡3隻` or `淘汰2隻` may remain deterministic. The deterministic path must
stay narrow and refuse negation, ambiguity, relation language, and multi-event
phrasing unless an existing tested rule proves otherwise.

The target does not create a large regex NLP engine merely to reduce AI call
count. Unclear natural language belongs to the AI fallback or an unresolved
user clarification state.

### 4.3 AI owns minimum semantic content

The active V2 direction uses this model-owned shape:

```json
{
  "events": [
    {
      "event": "mortality | cull | abnormal",
      "quantity": 3,
      "detail": "optional"
    }
  ]
}
```

The only top-level key is `events`. Each event object allows only `event`,
`quantity`, and optional `detail`. `event` is one of `mortality`, `cull`, and
`abnormal`. Quantity is a positive number or `null`; `null` means that the
event exists but its quantity is unknown. `detail` is only for abnormal
events, is a short symptom phrase, and is limited to 12 Unicode code points.

AI must not produce farm IDs, house IDs, flock IDs, group IDs, user IDs,
timestamps, source identity, source refs, target refs, lineage, confidence,
quantity confidence, raw source text, Candidate fields, database IDs,
dedupe decisions, transaction decisions, corrections, audit records, or
official writes. Original message metadata remains the trusted source for
those fields.

The strict system validator remains in place even if a future platform
structured-output feature is used. Structured output is an additional first
layer, not a replacement for application validation. Current structured
output capability is not declared Production-pass.

### 4.4 Context is deterministic system responsibility

Semantic extraction and context resolution are separate results:

```text
source message -> event meaning: mortality / 3
source message -> context evidence -> deterministic resolver -> farm/house/flock
system -> merge only after both boundaries are explicit
```

The AI never selects formal farm, house, flock, or ownership. A unique context
may resolve. An ambiguous context remains unresolved and asks the user; it
never defaults to a production farm. A semantic pass with context unresolved
is still a semantic pass, but it is not eligible for an unsafe official write.

### 4.5 Multi-event is first-class

One message may contain multiple independent observations. For example,
`死亡32 咳嗽 臭腳` must be representable as mortality 32, abnormal unknown
quantity with detail 咳嗽, and abnormal unknown quantity with detail 臭腳.
The system assigns source identity, event ordinal, and lineage after semantic
validation. The model does not manufacture those system fields.

## 5. Relation, support, and duplicate boundaries

Relation is not main event extraction.

- `RELATION_ONLY` messages such as “那個死亡3隻先記著，不是新增一筆” do
  not enter the main `events[]` AI call.
- The route is relation cue detection, a bounded pending pool, and a local
  resolver.
- A mixed message may contain new `events[]` and a relation intent at the
  same time. The router must distinguish `EVENT_ONLY`, `RELATION_ONLY`,
  `MIXED_EVENT_AND_RELATION`, `NONE`, and `ROUTING_UNRESOLVED`.
- The relation pool is restricted to the same group and, when available, the
  same resolved context. Official historical events are excluded.
- Zero candidates is unresolved. One uniquely supported candidate may resolve.
  Two or three candidates require a future user-selection interaction. More
  than three remains unresolved.
- No arbitrary time window is invented until the existing pending/session
  lifecycle proves what bounded pool it already supplies. If it does not,
  `RELATION_TIME_BOUNDARY_REQUIRED = YES` is an architecture gap, not a
  license to guess a duration.

Technical idempotency and semantic duplicate handling are different:

- retries, queue redelivery, and repeated processing of the same LINE source
  use source identity or the existing receipt/idempotency mechanism;
- two different messages with the same type, quantity, farm, and nearby time
  remain two possible events;
- only explicit relation language such as “不是新增”, “同一筆”, “剛才那筆”,
  or “重複了” can enter relation logic; and
- an official-record correction uses the existing Correction/Reversal flow,
  not an Ambient relation.

## 6. State, integrity, and transaction policy

D1 remains the only official Source of Truth. AI never writes official
business data. Official corrections are append-only: record, reverse,
correct, move, or split operations retain their history and audit lineage.

Candidate/Pending is a safety state, not a mandatory mode for every message.
High-confidence deterministic results may eventually use an existing safe
official append path. AI-derived results, unknown quantities, ambiguous
context, or ambiguous relations remain pending until the required user or
system confirmation exists. “Observation” is a domain concept in this target;
it is not an instruction to create a new SQL table.

Target message-level partial success means one unresolved message does not
clear independent successful messages. It does not mean salvage of malformed
JSON. A request with malformed JSON fails closed as a whole for that message;
success and unresolved states are evaluated after a complete parse.

## 7. Target flow

```mermaid
flowchart LR
  L[LINE] --> R[Webhook / durable receipt]
  R --> Q[Queue]
  Q --> M[Message Router]
  M --> D[Deterministic first]
  M --> A[AI fallback: minimal events[]]
  M --> REL[Relation cue + local resolver]
  M --> CHAT[Ordinary chat]
  D --> V[Strict semantic validator]
  A --> V
  REL --> V
  V --> CTX[Deterministic context resolver]
  CTX --> P[Pending / needs clarification]
  CTX --> O[Safe official append path]
  P --> D1[(D1)]
  O --> D1
  D1 --> SQL[Deterministic Daily Review aggregate]
  D1 --> WEB[Web / queries]
  D1 --> ANA[Read-only AI Analysis]
```

The target remains a modular monolith. It does not introduce microservices,
an event-bus framework, a workflow engine, or a distributed orchestration
layer merely to express the flow.

## 8. Queue, recovery, and graceful degradation

The existing Webhook → durable receipt → Queue boundary remains the
reliability boundary. Queue retry, failed/DLQ state, and message-level
processing status are preferred over a new custom recovery framework.

The target requires AI unavailability to degrade only AI-dependent natural
language extraction and analysis. Deterministic recording, official queries,
Web, Daily Review, admin, master data, and corrections remain usable. The
existing Recovery Cron is not removed in this documentation turn; it is only
a future review candidate after evidence proves its responsibilities are
covered elsewhere.

Fast Path remains a first-class deterministic path for static navigation,
help, simple queries, and safe quick actions. It does not need AI, Ambient, or
Queue merely for architectural uniformity.

## 9. Cron, Daily Review, Web, and AI Analysis

The target Cron policy is:

```text
TARGET_CRON_POLICY = AGGREGATE_PROCESSED_STATE_NOT_REINTERPRET_CHAT
```

Daily Review reads verified D1 official events, pending state, and failed
processing state through deterministic queries and renders a deterministic
summary. It must not ask AI to reinterpret a day's chat. AI Analysis is a
separate read-only feature: it may explain direct evidence, inference, weak
evidence, and limitations, but it cannot mutate official data.

Web remains a query/admin surface with existing authentication and business
rules. Admin operations for farms, houses, flocks, caretakers, assignments,
finance, and other master data require explicit authorization and deterministic
confirmation. There is no autonomous AI admin agent.

## 10. Observability boundary

Production observability should answer operational questions rather than
reproduce user content: webhook received, durable receipt, Queue processing,
message resolved/unresolved/failed, AI attempt and failure, pending
confirmation, official write, LINE delivery, and Cron status. Correlation IDs,
bounded error classes, HTTP status, stage, and timestamps are preferred over
raw prompts, raw completions, secrets, full ordinary-chat transcripts, or
hidden reasoning.

The current V2 prompt fingerprints, structural subtypes, real-run ledgers, and
semantic evaluator are useful developer/forensic tooling. They do not
automatically become Production business tables, lifecycle authority, or a
second source of truth. Any Production observability addition must prove its
retention, privacy, and operational purpose separately.

## 11. Future Quick Reply interaction state

Ambiguous farm context, two-to-three relation candidates, and event
confirmation require an explicit pending interaction identity. Future state
must include, conceptually, interaction identity, group, user,
observation/candidate, interaction type, allowed options, creation time,
expiry, and status. It must not infer the answer from only the previous
sentence or a mutable group state.

This turn records the requirement only. It does not create a table, migration,
workflow engine, or state machine.

## 12. Schema and migration policy

The following are domain concepts, not required new SQL table names:

| Target concept | First current mapping to verify | Status |
| --- | --- | --- |
| `line_messages` | `line_events` durable receipt and lifecycle | Map before change |
| `observations` | existing Ambient buffer/Candidate or safe staged semantic result | Mapping needs evidence |
| `operational_ledger` | `operational_events`, `abnormal_events`, and append-only audit lineage | Existing responsibilities |
| `job_runs` | `ambient_digest_invocations`, `ambient_digest_runs`, and existing review/job state | Map before change |

Policy:

```text
MAP_FIRST_MIGRATE_ONLY_IF_NECESSARY
```

No Production data is renamed, moved, converted, or rewritten for diagram
consistency. A migration is justified only when a read-only mapping proves
that the existing schema cannot safely express a required state.

## 13. Testing and release gates

Long-term testing is layered:

1. deterministic parser, validator, context, relation, idempotency, audit, and
   business-rule tests;
2. frozen semantic suite with immutable Ground Truth;
3. Fresh Unseen controlled evaluation;
4. one explicit human LINE acceptance; and
5. only then a Dev Full Flow with Candidate/Buffer behavior where authorized.

The frozen V2 artifact is
`forensics/ambient-extraction-v2-ground-truth-2026-08-27.json`, version
`1.0.1`. Its case expectations are immutable for that version: DEV-SMOKE-8
expects six semantic events and one relation; D04 expects cull 2 plus
abnormal 2/detail 腳傷 and carries high cross-event quantity-attribution
risk. A changed product rule requires a new Ground Truth version and a
written reason. Historical failures are never rewritten into passes.

Human LINE is a release gate, not a daily debugging loop. Real-model tests
must retain bounded transport/structural evidence, use the user-frozen model
policy, and never enter Production business writes.

## 14. Model policy and structured output

```text
CURRENT_MODEL = @cf/meta/llama-3.2-3b-instruct
CURRENT_MODEL_POLICY = FROZEN_BY_USER_FOR_DEVELOPMENT_QUOTA_CONTROL
MODEL_COMPARISON_AUTHORIZED = NO
```

The target is model-agnostic in interface design, but that does not authorize
switching models now. GLM, Gemma, Qwen, Nemotron, 70B, GPT-OSS, or another
provider remain frozen until the user explicitly unfreezes comparison.

Platform structured output may be adopted after capability evidence, but the
application strict validator remains mandatory. The current V2 real-model
history contains structural failures and is not evidence of Production
structured-output success.

## 15. Existing V2 components to reuse

The current V2 is not discarded or rewritten. The following are aligned with
the target and should be reused where safe:

- message-level extraction units;
- minimal `events[]` output and strict keys;
- null quantity as a real unknown event;
- structural fail-closed parsing with no salvage;
- message-level semantic partial success and technical failure isolation;
- conservative deterministic fast path;
- separate context resolution;
- relation-only routing and mixed event-plus-relation handling;
- source-identity technical idempotency;
- frozen Ground Truth and Fresh Unseen fixtures;
- developer-only real-model harness, bounded diagnostics, and Direct REST
  adapter; and
- side-effect-free staged semantic results.

These are development evidence and direction, not a Production activation
claim.

## 16. Historical complexity candidates

The following may be reviewed later, but none is authorized for removal:

- historical Production `decisions[]` contract;
- batch Ambient semantic extraction;
- AI source-coverage protocol;
- AI-generated support/target references;
- whole-batch failure coupling;
- Scheduled Ambient chat reinterpretation;
- repair-only diagnostics whose responsibility no longer exists; and
- Recovery layers whose responsibility is demonstrably covered by Queue and
  message state.

Each is a `FUTURE_RETIREMENT_CANDIDATE`, not a deletion task.

## 17. Current known deviations

The following are architecture-level differences between the current system
and the target. They are intentionally not repaired here.

| Current | Target | Action status |
| --- | --- | --- |
| Production still uses historical Ambient batch/`decisions[]` path | Message-level minimal semantic extraction | `NOT_AUTHORIZED_THIS_TURN` |
| V2 is developer-only | Controlled transition only after its gates pass | `NOT_AUTHORIZED_THIS_TURN` |
| Structured-output compatibility is still an active diagnostic topic | Prove platform support, then retain application validation | `NOT_AUTHORIZED_THIS_TURN` |
| Scheduled Ambient still exists in Production | Cron aggregates processed state rather than rereading chat | `NOT_AUTHORIZED_THIS_TURN` |
| Recovery and failure-retention layers still exist | Retain only responsibilities still required by evidence | `NOT_AUTHORIZED_THIS_TURN` |
| Quick Reply pending interaction identity is not yet a product state | Explicit scoped interaction state with expiry/status | `NOT_AUTHORIZED_THIS_TURN` |

## 18. Anti-drift rules

Before adding a framework, migration, AI field, recovery layer, observability
layer, agent, workflow engine, table, cron, or retry mechanism, the proposal
must answer:

1. Is this complexity required by the real farm/LINE business, or is it an
   artifact of the current AI, batch, or diagnostic design?
2. Which message or state failure boundary does it protect?
3. Which existing responsibility is reused or removed?
4. Does it require a schema or data migration, and why can mapping not work?
5. What deterministic safety and side-effect boundary proves it is safe?
6. Which layer and acceptance tests demonstrate the need?

If the answer is accidental technical complexity, first reduce responsibility,
shrink the failure boundary, or simplify the architecture. A single test
failure is not permission to expand the architecture.

Major architecture changes must explicitly record:

```text
PREVIOUS_DECISION
NEW_EVIDENCE
PROPOSED_CHANGE
WHY_CURRENT_ARCHITECTURE_NO_LONGER_SUFFICIENT
IMPACT
USER_APPROVAL_REQUIRED = YES
```

Model comparison remains forbidden while the user freeze is active. A target
document is not authorization to modify Production.

## 19. Non-executing baseline gates

```text
TARGET_ARCHITECTURE_STATUS = NON_EXECUTING_NORTH_STAR
ARCHITECTURE_REWRITE_AUTHORIZED = NO
DATA_MIGRATION = NONE
PRODUCTION_V1_IMMEDIATE_REMOVAL = NO
```

This baseline succeeds when future work can distinguish necessary business
complexity from accidental technical complexity and can identify the smallest
authorized next gate without silently changing Production.
