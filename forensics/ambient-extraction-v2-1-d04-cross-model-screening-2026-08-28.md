# Ambient Extraction V2.1 D04 Cross-Model Screening — 2026-08-28

## Scope

Developer-only screening. The current Production model and Production path were
not changed. The frozen D04 Ground Truth and V2.1 wire contract were reused.
Each candidate had at most one inference opportunity, in the requested order;
there was no retry, fallback, D07 call, full smoke, Fresh Unseen run, or deploy.

## Fairness and safety

```text
MODEL_COMPARISON_AUTHORIZED = YES
CURRENT_LLAMA_D04_SCREENING_RESULT = MULTI_EVENT_BOUNDARY (historical; 0 calls this round)
V2_1_WIRE_CONTRACT = 2.1
PROMPT_FINGERPRINT = fnv1a32-bf751097
PROMPT_SCHEMA_GROUND_TRUTH_CHANGED = NO
SERIAL_MAX_CONCURRENT_AI_CALLS = 1
TOTAL_REAL_AI_CALL_LIMIT = 3
REAL_AI_CALLS = 3
ACCOUNT_DISCOVERY_HTTP = 200
ACCOUNT_ENTITLEMENT_PLAN_EVIDENCE = UNKNOWN
OFFICIAL_FREE_PLAN_EVIDENCE_SUFFICIENT = YES
ACCOUNT_SPECIFIC_PREINFERENCE_ENTITLEMENT_REQUIRED = NO
REQUEST_COMPATIBILITY_PRECONDITION = SUFFICIENT_FOR_ONE_CONTROLLED_ATTEMPT
MODEL_ID_SCHEMA_AUDIT_REPEATED = NO
```

No credential, raw prompt, raw source, raw completion, or actual symptom text
was persisted in this report or the screening ledgers.

## Candidate bounded results

### @cf/qwen/qwen3.8-27b

```json
{
  "modelId": "@cf/qwen/qwen3.8-27b",
  "catalogModelExists": "YES",
  "catalogCanonicalModelId": "@cf/qwen/qwen3.8-27b",
  "modelIdExactMatch": "YES",
  "modelSchemaQuery": "PASS",
  "modelSchemaHttp": 200,
  "responseFormatPresent": "YES",
  "jsonSchemaSupported": "YES",
  "requestShapeCompatibleWithV21": "YES",
  "modelSpecificRequestDifference": "NO",
  "requiredDifferenceClass": "NONE",
  "officialFreePlanEvidence": "NOT_EXPLICIT",
  "accountFreeEntitlement": "INCONCLUSIVE",
  "freePlanEligibility": "YES",
  "failureLayer": "STRUCTURED_OUTPUT",
  "semanticEvidenceAvailable": "NO",
  "screeningResult": "STRUCTURAL_FAILURE",
  "realCalls": 1,
  "httpStatus": 200,
  "providerConfirmed": "YES",
  "structuredStatus": "FAIL",
  "structuredSubtype": "UNKNOWN",
  "eventCount": null,
  "eventCountPass": "NOT_RUN",
  "cullPresent": "NOT_RUN",
  "cullTypePass": "NOT_RUN",
  "cullQuantityPass": "NOT_RUN",
  "cullDetailNullPass": "NOT_RUN",
  "abnormalPresent": "NOT_RUN",
  "abnormalTypePass": "NOT_RUN",
  "abnormalDetailPass": "NOT_RUN",
  "abnormalQuantityKind": "NOT_RUN",
  "abnormalQuantityPass": "NOT_RUN",
  "multiEventBoundaryPass": "NOT_RUN",
  "crossEventQuantityAttributionPass": "NOT_RUN",
  "semanticPass": "NOT_RUN",
  "latencyMs": null,
  "promptTokens": null,
  "completionTokens": null,
  "ledgerPath": "/Users/joe/Documents/Codex/2026-08-19/files-pasted-by-the-user-ai/outputs/chicken-line-production/forensics/runtime/ambient-extraction-v2-1-d04-cross-model-qwen_3_8-4ba4c04d-9ee9-4d26-8938-dd7aa2d446f6.jsonl"
}
```

### @cf/zai-org/glm-4.7-flash

```json
{
  "modelId": "@cf/zai-org/glm-4.7-flash",
  "catalogModelExists": "YES",
  "catalogCanonicalModelId": "@cf/zai-org/glm-4.7-flash",
  "modelIdExactMatch": "YES",
  "modelSchemaQuery": "PASS",
  "modelSchemaHttp": 200,
  "responseFormatPresent": "YES",
  "jsonSchemaSupported": "YES",
  "requestShapeCompatibleWithV21": "YES",
  "modelSpecificRequestDifference": "NO",
  "requiredDifferenceClass": "NONE",
  "officialFreePlanEvidence": "EXPLICIT_YES",
  "accountFreeEntitlement": "INCONCLUSIVE",
  "freePlanEligibility": "YES",
  "failureLayer": "STRUCTURED_OUTPUT",
  "semanticEvidenceAvailable": "NO",
  "screeningResult": "STRUCTURAL_FAILURE",
  "realCalls": 1,
  "httpStatus": 200,
  "providerConfirmed": "YES",
  "structuredStatus": "FAIL",
  "structuredSubtype": "UNKNOWN",
  "eventCount": null,
  "eventCountPass": "NOT_RUN",
  "cullPresent": "NOT_RUN",
  "cullTypePass": "NOT_RUN",
  "cullQuantityPass": "NOT_RUN",
  "cullDetailNullPass": "NOT_RUN",
  "abnormalPresent": "NOT_RUN",
  "abnormalTypePass": "NOT_RUN",
  "abnormalDetailPass": "NOT_RUN",
  "abnormalQuantityKind": "NOT_RUN",
  "abnormalQuantityPass": "NOT_RUN",
  "multiEventBoundaryPass": "NOT_RUN",
  "crossEventQuantityAttributionPass": "NOT_RUN",
  "semanticPass": "NOT_RUN",
  "latencyMs": null,
  "promptTokens": null,
  "completionTokens": null,
  "ledgerPath": "/Users/joe/Documents/Codex/2026-08-19/files-pasted-by-the-user-ai/outputs/chicken-line-production/forensics/runtime/ambient-extraction-v2-1-d04-cross-model-glm_4_7-9b2c5b45-a7dd-46fb-9804-5c19e52942ee.jsonl"
}
```

### @cf/qwen/qwen3-30b-a3b-fp8

```json
{
  "modelId": "@cf/qwen/qwen3-30b-a3b-fp8",
  "catalogModelExists": "YES",
  "catalogCanonicalModelId": "@cf/qwen/qwen3-30b-a3b-fp8",
  "modelIdExactMatch": "YES",
  "modelSchemaQuery": "PASS",
  "modelSchemaHttp": 200,
  "responseFormatPresent": "YES",
  "jsonSchemaSupported": "YES",
  "requestShapeCompatibleWithV21": "YES",
  "modelSpecificRequestDifference": "NO",
  "requiredDifferenceClass": "NONE",
  "officialFreePlanEvidence": "NOT_EXPLICIT",
  "accountFreeEntitlement": "INCONCLUSIVE",
  "freePlanEligibility": "YES",
  "failureLayer": "SEMANTIC",
  "semanticEvidenceAvailable": "YES",
  "screeningResult": "MULTI_EVENT_BOUNDARY",
  "realCalls": 1,
  "httpStatus": 200,
  "providerConfirmed": "YES",
  "structuredStatus": "PASS",
  "structuredSubtype": null,
  "eventCount": 1,
  "eventCountPass": "NO",
  "cullPresent": "NO",
  "cullTypePass": "NO",
  "cullQuantityPass": "NO",
  "cullDetailNullPass": "NO",
  "abnormalPresent": "NO",
  "abnormalTypePass": "NO",
  "abnormalDetailPass": "NO",
  "abnormalQuantityKind": "OTHER",
  "abnormalQuantityPass": "NO",
  "multiEventBoundaryPass": "NO",
  "crossEventQuantityAttributionPass": "NO",
  "semanticPass": "NO",
  "latencyMs": null,
  "promptTokens": null,
  "completionTokens": null,
  "ledgerPath": "/Users/joe/Documents/Codex/2026-08-19/files-pasted-by-the-user-ai/outputs/chicken-line-production/forensics/runtime/ambient-extraction-v2-1-d04-cross-model-qwen3_30b_a3b-47ad9061-1f76-4d51-a3d1-335eab059784.jsonl"
}
```

## D04 semantic-only ranking

1. @cf/qwen/qwen3-30b-a3b-fp8 — MULTI_EVENT_BOUNDARY

Only candidates with `SEMANTIC_EVIDENCE_AVAILABLE = YES` appear in this ranking.
Models skipped or blocked by catalog, entitlement, request compatibility,
transport, or structural failure are listed separately:

- @cf/qwen/qwen3.8-27b — STRUCTURAL_FAILURE; layer=STRUCTURED_OUTPUT
- @cf/zai-org/glm-4.7-flash — STRUCTURAL_FAILURE; layer=STRUCTURED_OUTPUT

## Interpretation

A `FULL_PASS` is screening evidence only. It is not model validation,
Production readiness, or replacement approval. A semantic result is the only
evidence used for the D04 ranking; non-semantic failures are not interpreted as
model capability failures.

## Safety gates

```text
PRODUCTION_D1_WRITE = 0
CANDIDATE_WRITE = 0
BUFFER_CONSUME = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```
