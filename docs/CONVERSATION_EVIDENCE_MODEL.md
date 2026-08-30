# Conversation Evidence Model

## Purpose

Conversation V2 must be able to explain not only what a Candidate contains, but why the system reached that result. The model is bounded, provenance-preserving, and stored inside the existing `candidate_json`; it does not archive the ordinary group transcript.

## Evidence shape

`src/ambient.ts` defines `AmbientCandidateEvidence`:

```json
{
  "evidenceType": "caretaker_clue",
  "field": "caretaker",
  "normalizedValue": "林志騰",
  "sourceRef": "LINE message id",
  "sourceTimestamp": "UTC ISO timestamp",
  "sourceUser": "LINE user id when already part of the Candidate evidence",
  "confidence": "low|medium|high",
  "extractionSource": "ai|deterministic|explicit_user|resolver"
}
```

Allowed evidence types are `source_fact`, `caretaker_clue`, `farm_clue`, `house_clue`, `flock_clue`, `explicit_user_choice`, `resolver_fact`, and `reconciliation_fact`. Local normalization bounds the number and size of entries before the object is written to `ambient_digest_candidates.candidate_json`.

`resolveAmbientCandidateEntity()` enriches validated AI output when the model omitted a provenance entry. It derives only minimum references from the source rows already selected for that Candidate; it does not preserve the full chat. It also preserves `caretakerClues[]`, so multiple clues cannot collapse into `caretakerText = null` plus a label.

## Structured conflict

`AmbientCandidateConflictEvidence` stores:

```json
{
  "type": "caretaker_farm_mismatch",
  "evidenceRefs": ["source message id"],
  "facts": {
    "caretakerClues": ["林志騰"],
    "selectedFarm": "金雞測試場"
  },
  "dbFacts": {
    "activeCaretakerAssignment": false,
    "assignedFarms": []
  },
  "businessRule": {
    "caretakerRequiredForMortality": false
  },
  "blocking": false,
  "overrideAllowed": true,
  "resolutionStatus": "explicit_user_choice_wins"
}
```

The resolver creates this object after evidence enrichment, so `evidenceRefs` points to retained minimum evidence. A legal explicit Farm selection outranks a caretaker clue and changes the conflict resolution status without deleting the clue. Database integrity, authorization, and Farm/House/Flock ownership remain hard constraints.

## Read-only conflict tool

`getCandidateConflictEvidence()` in `src/index.ts` returns bounded:

- source evidence;
- structured evidence;
- structured conflict;
- resolved facts;
- caretaker/Farm database relationships;
- the business rule and blocking consequence;
- safe next options.

If a legacy Candidate contains only `multiple_caretaker_clues` and `caretakerText = null`, the tool does not invent names. It reports that the old row cannot reliably reconstruct the names and may inspect linked Ambient rows only while those rows still exist.

## Retention

Ambient raw source retention remains 24 hours. Candidate evidence is a small structured work record, not a transcript extension. Candidate lifecycle retention remains controlled by its existing terminal/open workflow.

## Test coverage

## General object and query evidence boundary — 2026-08-22

Evidence is now consumed together with the current object type, not only a Candidate. conversation-v2.ts recognizes operational events, abnormal events, pending actions, farms, houses, flocks, daily reviews, quick records, and query results as bounded conversation objects. This lets a read such as today’s mortality or a recent abnormal event remain a query about an existing object rather than being mistaken for a new record assertion.

The general read rule is enforced by conversationOfficialRecordAllowed() in src/conversation-v2.ts and the final guard in src/index.ts: a question, explanation request, advice request, comparison, analysis, navigation, help request, clarification, hypothetical, quoted statement, negation, or unresolved reference cannot write official data. A historical fact assertion can be recorded only when it is not phrased as a question/condition/quote/negation/referential continuation. Existing Resolver, Validator, Business Logic, and Audit remain the only official mutation path.

Legacy label-only evidence remains intentionally incomplete. If a row contains only multiple_caretaker_clues and no names, the response says that the old evidence is insufficient and does not invent caretaker identities. New Candidates retain structured clues, source references, timestamps, extraction source, explicit overrides, structured conflict, database relations, business rule, blocking state, and safe options within the existing bounded Candidate JSON; the raw Ambient message retention remains 24 hours.

- `src/ambient.test.ts`: multiple clue preservation and label-only legacy behavior.
- `src/conversation-composer.test.ts`: evidence/rule/consequence explanation and no invention.
- `scripts/conversation-v2-runtime-local.mjs`: evidence persistence, explicit Farm override, conflict refs, read-only response path.
