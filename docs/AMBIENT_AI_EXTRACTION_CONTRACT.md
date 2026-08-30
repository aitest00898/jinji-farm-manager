# Ambient AI extraction contract

The model returns a compact semantic proposal. It does not return the
persisted Ambient Candidate and it never owns source lineage, reconciliation,
authority, or lifecycle state.

## Model-owned input contract

The only model-owned keys are:

```json
{
  "candidates": [
    {
      "farmText": "string|null",
      "houseText": "string|null",
      "flockText": "string|null",
      "caretakerText": "string|null",
      "items": [
        {
          "type": "mortality|cull|abnormal",
          "quantity": "number|null",
          "raw": "short non-empty source phrase",
          "confidence": "low|medium|high"
        }
      ]
    }
  ]
}
```

`raw` is one bounded source phrase (maximum 160 characters), not a transcript.
`quantityConfidence` may be `unknown` only in the persisted Candidate contract;
the model-owned item confidence is always `low`, `medium`, or `high`.

## Field ownership matrix

| Field | Owner | Why | Required from AI | Can rebuild from source | Downstream dependency |
| --- | --- | --- | --- | --- | --- |
| `farmText` | model clue + system refinement | AI reads the farm wording; resolver decides identity | yes, nullable | no, not safely in all cases | resolver, Candidate renderer |
| `houseText` | model clue | house wording may require semantic extraction | yes, nullable | no | resolver |
| `flockText` | model clue | flock wording may require semantic extraction | yes, nullable | no | resolver |
| `caretakerText` | model clue | only a source-mentioned caretaker clue | optional | no | caretaker conflict/evidence |
| `items` | model | event meaning is the semantic task | yes, non-empty for a candidate | no | validator, reconcile, Candidate |
| `items[].type` | model | classifies mortality, cull, or abnormal | yes | no | validator, reconcile |
| `items[].quantity` | model | quantity may be ambiguous or absent | yes, nullable | no | validator, reconcile |
| `items[].raw` | model | compact evidence phrase for the item | yes, non-empty | no; do not invent it | reconcile evidence, renderer |
| `items[].confidence` | model | bounded confidence for the item extraction | yes | no | validator, renderer |
| `quantityConfidence` | derived | combines item confidence and unresolved quantity rules | no | yes | Candidate state, renderer |
| `eventType` | derived | derived from normalized item set | no | yes | reconcile, Candidate |
| `rawTexts` | system enrichment | bounded unique item evidence, not transcript storage | no | yes | Candidate renderer/legacy readers |
| `sourceMessageIds` | system enrichment | exact source lineage | no | yes | audit, rerun, reconcile |
| `sourceTimestamps` | system enrichment | source timing | no | yes | audit, reconcile |
| `sourceUsers` | system enrichment | source actor references | no | yes | audit, conflict evidence |
| `evidence` | system enrichment | deterministic source facts and resolver facts | no | yes | review, conflict explanation |
| `uncertainties` | derived | records unresolved entity/quantity conditions | no | yes | Candidate state, renderer |
| `conflicts` | system enrichment | derived from source and database disagreement | no | yes | resolver, renderer |
| `conflict` | system enrichment | persisted boolean is not an AI assertion | no | yes | Candidate state, reconcile |
| `conflictText` | system enrichment | bounded explanation of a derived conflict | no | yes | Candidate renderer |
| `conflictEvidence` | system enrichment | structured facts supporting a conflict | no | yes | conflict resolution |
| `resolution` | system enrichment | entity resolver output | no | yes | reconcile, Candidate repair |
| `reconciliation` | system enrichment | official-record comparison | no | yes | Candidate state, review |
| `userOverrides` | explicit user/system | authority comes from an explicit action | no | no, must not be inferred | Candidate repair/confirm |
| `state` | system lifecycle | application state, never model authority | no | yes | Candidate lifecycle, renderer |

## Deterministic pipeline

```text
AI minimal extraction
  -> strict model-contract normalization
  -> system-owned source enrichment
  -> persisted Candidate validation
  -> entity resolution
  -> Reconcile
  -> Candidate Write (normal/dev_commit only)
  -> Buffer Consume (normal/dev_commit only)
```

Unknown model keys are projected out before persisted validation. That does not
relax the persisted validator: required fields remain required, unknown enum
values are not guessed, and `raw: null` remains invalid.
