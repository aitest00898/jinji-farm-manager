# Ambient AI Contract Evidence — 2026-08-27

This is a source- and runtime-evidence pack for `chicken-line-production`.
It is not a replacement for the source code.  No secret, token, raw LINE
transcript, raw completion, prompt instance, or full identifier is included.

## 1. 09:00 Scheduled Ambient

Target: `2026-08-27 09:00 Asia/Taipei` (`2026-08-27T01:00:34.000Z` in the
durable invocation row).

| Field | Evidence |
| --- | --- |
| Invocation observed | YES |
| Invocation safe ref | `ambi…016f` |
| Trigger | `cron` |
| Invocation status | `completed` |
| Started | `2026-08-27T01:00:34.000Z` |
| Completed | `2026-08-27T01:00:39.626Z` |
| Run row | NOT_CREATED; no group entered the per-group pipeline |
| Groups before/after cleanup | `0 / 0` |
| Expiry scanned/deleted | `0 / 0` |
| 09 source/prefilter | `0 / 0` |
| 09 Push | not attempted |

The active locked DEV-SMOKE-8 cohort was excluded before group discovery.
The production buffer still had 8 buffered DEV-SMOKE-8 rows, but the 09:00
scheduled selector saw 0 of those rows.  This is the expected isolation
behavior, not an AI or validation failure.

Therefore:

```text
DEV_LOCKED_COHORT_SELECTED_BY_09_CRON = NO
DEV_LOCKED_SOURCE_COUNT_VISIBLE_TO_09_CRON = 0
DEV_COHORT_ISOLATION_REAL_PRODUCTION = PASS
09_MISSING_PUSH_REASON = NO_SOURCE
09_NO_PUSH_EXPECTED = YES
```

This is independent of the earlier 06:00 run, which had 8 sources, 6
prefilter-selected sources, and then failed at `SOURCE_COVERAGE`.

## 2. Current production deployment and safety snapshot

Read-only deployment evidence:

```text
CURRENT_WORKER = 8fc4…8c9c
TRAFFIC = 100%
CURRENT_MIGRATION = 0037
WORKER_AT_09 = 8fc4…8c9c
```

Current read-only D1 safety snapshot:

| Metric | Value |
| --- | ---: |
| operational_events total | 60 |
| operational_events effective (`reversed_at IS NULL`) | 13 |
| operational_events reversed | 47 |
| abnormal_events | 8 |
| audit_logs | 66 |
| ambient_digest_candidates | 1 |
| ambient_chat_buffer total | 14 |
| ambient buffered | 8 |
| ambient processed | 6 |
| ambient failure-retained | 6 |
| farms | 9 |
| caretakers | 0 |
| assignments | 0 |
| finance allocated | 434838.6 |
| finance expense | 5500 |
| finance net | 429338.6 |

DEV-SMOKE-8 remains `8 locked / 8 available / 8 buffered / 0 processed` at
the time of the read-only check.  The D1 requests in this round reported
`rows_written = 0`; no Candidate, operational, abnormal, finance, or master
data mutation was performed.

## 3. Production Ambient call path

The scheduled and manual Ambient entry points inject the same extraction
function into the shared Ambient lifecycle:

```text
Scheduled Ambient: src/index.ts:9146-9157
Manual Ambient:    src/index.ts:8124-8143
Shared lifecycle:  src/ambient.ts:3039-3067 and runAmbientDigestCore
AI extraction:     src/ambient.ts:2272-2391
```

```text
SHARED_EXTRACTION_CORE = YES
```

The current extraction boundary is:

```text
source selection
→ ambientPrefilter
→ ambientPrompt / request-local refs
→ Workers AI request
→ strict JSON parse
→ normalizeAmbientAiExtraction
→ selected-source coverage validation
→ buildAmbientCandidateBundleFromDecisions
→ resolveAndReconcileAmbientBundle
→ normal Candidate lifecycle (outside this local harness)
```

The development workflow also calls `runAmbientDigest` with
`executionMode=dev_dry_run` or `dev_commit` and the same extraction core;
see `src/ambient-dev.ts:631-666`.

## 4. Exact current Prompt contract

Source of truth: `src/ambient.ts:2192-2202` and the system message at
`src/ambient.ts:2280-2291`.  The static user contract is copied below without
any production message instance:

```text
只做逐則雞場語意判斷，不建構正式紀錄。只輸出一個 compact 合法 JSON object；唯一 top-level key 是 decisions；不可輸出 Markdown、code fence、解釋、註解或其他文字。
逐一處理所有 selected 訊息；每個 selected=true ref 必須且只能有一個 decision；ref 只能使用 selected ref，context=false 不可成為 decision。輸出前確認 decisions 的 ref 集合與所有 selected ref 完全相同。
event：ref、kind=event、type、quantity、quantityConfidence、raw、confidence；可選 farmText、houseText、flockText、caretakerText。type 只能 mortality、cull、abnormal；abnormal quantity 必須 null；quantityConfidence 可為 unknown；confidence 只能 low、medium、high。
support：ref、kind=support、targetRef；只有明確表示不是新增一筆、同一件事或就是剛才那件時使用，targetRef 必須指向原 event，不得建立新事件。ignore：ref、kind=ignore；只在 selected 訊息沒有營運事實時使用。
同一農場同一 event type 但不同數量或時間仍是不同事件；混合閒聊與營運事實時只擷取營運部分。raw 是最短、非空、足以辨識事件的單一原文片段，最多160字，不可複製完整對話、改寫或加解釋。不要輸出任何系統欄位。
輸出格式只能是 {"decisions":[...]}；完成輸出前確認所有 [] 與 {} 都已關閉；最後一個字元必須是 }。
```

The system message is exactly:

```text
只輸出 compact Ambient semantic JSON；不要輸出系統欄位。這是提案，不是正式紀錄。
```

The dynamic user field is generated as follows:

```text
source_messages=${JSON.stringify(context.entries.map(({ref, selected, message}) => ({ref, selected, text: message.text})))}
```

For evidence purposes the dynamic `text` values are omitted here.  The
request-local refs are generated in `src/ambient.ts:2013-2047`: prefilter
selected messages are marked `selected=true`, a bounded surrounding window of
up to two messages on either side is included as context, and refs are
assigned in source order as `m1`, `m2`, … .  Context refs cannot be emitted as
decisions.

## 5. Current model-owned Decision contract

Source: `src/ambient.ts:37-159`.

```text
root = object
allowed top-level key = decisions
decisions = array, maxItems 100
```

Every decision has a request-local `ref` matching `m[1-9]` through `m999`.
The three legal variants are:

```text
event:
  required: ref, kind="event", type, quantity, quantityConfidence, raw, confidence
  type: mortality | cull | abnormal
  quantity: number | null
  quantityConfidence: unknown | low | medium | high
  raw: non-empty string, max 160 characters
  confidence: low | medium | high
  optional: farmText, houseText, flockText, caretakerText

support:
  required: ref, kind="support", targetRef

ignore:
  required: ref, kind="ignore"
```

The schema is `additionalProperties=false`.  Model output does not include
timestamps, users, actual LINE/D1 IDs, evidence, resolution,
reconciliation, user overrides, lifecycle state, or persisted Candidate
lineage.  Those are system-owned.

The formal TypeScript declarations are:

```text
AmbientAiEventDecision
AmbientAiSupportDecision
AmbientAiIgnoreDecision
AmbientAiDecision
AmbientAiExtraction
```

at `src/ambient.ts:39-75`.  The persisted `AmbientCandidate` and
`AmbientCandidateBundle` are separate at `src/ambient.ts:243-275`.

## 6. Normalizer and validator evidence

`normalizeAmbientAiExtraction` (`src/ambient.ts:1044-1083`) accepts only the
`decisions` root and copies the decision-owned fields.  It normalizes type,
confidence, and request-local ref strings; it does not translate the stale
legacy `candidates` envelope into the current contract.

The coverage validator (`src/ambient.ts:2055-2190`) enforces:

```text
decision.ref ∈ prompt refs
decision.ref ∈ selected refs
each selected ref appears exactly once
support.targetRef is a selected event ref
context-only refs cannot be decision refs
event fields satisfy the bounded event contract
```

Failure is fail-closed before system build.  `buildAmbientCandidateBundleFromDecisions`
(`src/ambient.ts:1085-1200`) maps request-local refs to actual source rows;
support contributes its source to the target event and never creates a second
item.  `resolveAndReconcileAmbientBundle` (`src/ambient.ts:2925-3025`)
rebuilds timestamps, actors, bounded evidence, entity resolution, and
reconciliation from source rows and D1 facts.

## 7. D03 representability audit

Canonical representation: `quantity=null` and
`quantityConfidence="unknown"`.

| Layer | Result | Evidence |
| --- | --- | --- |
| Prompt | YES | `abnormal quantity 必須 null`; `quantityConfidence 可為 unknown` |
| TypeScript type | YES | event quantity is `number \| null`; quantity confidence includes `unknown` |
| JSON schema | YES | event quantity allows number/null; confidence enum includes unknown |
| Normalizer | YES | copies `quantity`, `quantityConfidence`, and event fields |
| Validator | YES | abnormal requires null; unknown quantity confidence is accepted |
| System build | YES | abnormal becomes a canonical abnormal item with null quantity |
| End-to-end contract | PASS | no deterministic contradiction found |

```text
D03_PROMPT_REPRESENTABLE = YES
D03_TYPE_REPRESENTABLE = YES
D03_NORMALIZER_REPRESENTABLE = YES
D03_VALIDATOR_REPRESENTABLE = YES
D03_SYSTEM_BUILD_REPRESENTABLE = YES
D03_CONTRACT_END_TO_END = PASS
UNKNOWN_QUANTITY_RULE_STRENGTH = STRONG
FEW_SHOT_UNKNOWN_QUANTITY_PRESENT = NO
```

## 8. D06 representability audit

The current support contract is:

```text
ref=m6, kind=support, targetRef=m5
```

`m5` preceding `m6` is a valid back-reference.  The validator first collects
all event refs, so a valid target event may also be referenced independent of
array order; no production change was made to this behavior.

| Check | Result |
| --- | --- |
| support in Prompt | YES |
| support in TypeScript type | YES |
| support in JSON schema | YES |
| support in Normalizer | YES |
| support in Validator | YES |
| support in System build | YES |
| targetRef required | YES |
| target must be selected event | YES |
| context target allowed | NO |
| self-target allowed | NO |
| back-reference allowed | YES |
| forward-reference allowed when target event exists | YES |
| unknown target | reject as `invalid_support_target` |
| D06 contract end-to-end | PASS |

The model must still perform the cognitively difficult part: recognize
support language, choose `support`, identify the target ref, and distinguish
it from independent same-type events.  This is a high-complexity model task,
but it is not a deterministic schema contradiction.

## 9. Inference parameters

Evidence: `src/analysis.ts:9`, `src/ambient.ts:2272-2291`, and
`src/index.ts:4050` / `9146-9152`.

| Parameter | Current value |
| --- | --- |
| model | `EXPLICIT:@cf/meta/llama-3.2-3b-instruct` |
| max_tokens | `EXPLICIT:1536` |
| temperature | `EXPLICIT:0` |
| top_p | `NOT_SET` |
| top_k | `NOT_SET` |
| seed | `NOT_SET` |
| response_format | `NOT_SET` |
| frequency_penalty | `NOT_SET` |
| presence_penalty | `NOT_SET` |
| stop | `NOT_SET` |
| JSON mode | `NOT_SET / NOT_PROVEN for this exact model` |

The request passes only `messages`, `max_tokens`, and `temperature` to the
Ambient Workers AI binding.  No response-format or tool-calling guarantee is
being assumed.

## 10. Batch coupling and transaction boundary

```text
ONE_AI_CALL_PER_BATCH = YES
SELECTED_MESSAGES_PER_REQUEST = dynamic prefilter count plus bounded context window
CONTEXT_MESSAGES_INCLUDED = YES
MODEL_MUST_RETURN_ALL_DECISIONS_IN_ONE_RESPONSE = YES
BATCH_COUPLING_ARCHITECTURAL_RISK = YES
BATCH_INTERFERENCE_CONFIRMED = NO
```

The current boundary is all-or-nothing.  A batch with valid decisions for
only some selected refs fails source coverage before system build; it does not
write a partial Candidate or consume the source batch.

```text
CURRENT_TRANSACTION_BOUNDARY = ALL_OR_NOTHING
FOUR_VALID_TWO_MISSING_RESULTS_IN_ZERO_CANDIDATE = YES
FOUR_VALID_TWO_MISSING_RESULTS_IN_ZERO_CONSUME = YES
PARTIAL_ACCEPTANCE_CURRENTLY_SUPPORTED = NO
```

## 11. Error classification

The current source has separate allowlisted details:

```text
missing decision        → source_decision_missing
unknown ref             → unknown_source_reference
duplicate ref           → duplicate_source_decision
context ref             → invalid_context_decision_ref
invalid support target  → invalid_support_target
invalid event shape     → invalid_event_schema
```

The prior durable 4/6 live result used the broad historical label
`invalid_source_reference`; it should not be used as proof that all of these
cases are the same.  Current source-level classification is consistent; the
historical row remains an observability compatibility issue to keep separate
from semantic behavior.

## 12. Known contract/documentation mismatch

`docs/AMBIENT_AI_EXTRACTION_CONTRACT.md` describes the earlier `candidates`
envelope.  Current executable source uses the per-source `decisions` root and
is the authoritative contract for this evidence pack.  The stale document was
not edited in this read/evidence round.

## 13. Conclusions for this round

```text
D03_CONTRACT_END_TO_END = PASS
D06_CONTRACT_END_TO_END = PASS
BATCH_INTERFERENCE_CONFIRMED = NO
CONTRACT_DETERMINISTIC_CONTRADICTION = NONE_FOUND
PROPOSED_PRODUCTION_SEMANTIC_FIX = NONE_THIS_ROUND
```

The repeated D03/D06 misses therefore remain an empirical model/batch
capability question, not a proven inability of the current Prompt, Type,
Normalizer, Validator, or system build to represent those facts.  The next
safe evidence step is the local fixture harness described in the companion
document, followed by a separately approved real-model capability matrix.
