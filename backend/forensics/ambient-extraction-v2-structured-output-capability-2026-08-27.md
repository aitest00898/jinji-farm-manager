# Ambient Extraction V2 Structured Output Capability Gate — 2026-08-27

This report records one bounded developer-only capability gate. It contains
safe metadata only: no account identifier, credential, authorization header,
raw prompt, source message, model completion, or model prose is retained.
Production V1 and Production data were not touched.

## A. Gate boundary

* Model: `@cf/meta/llama-3.2-3b-instruct`
* `temperature = 0`
* `max_tokens = 1536`
* Maximum inference calls: `1`
* Actual inference calls: `1`
* Model-schema queries: `1`
* Execution mode: serial; peak concurrency `1`
* Prompt fingerprint: `fnv1a32-06698b1e`
* Prompt fingerprint changed: `NO`
* Current positive canonical event example: `NO`
* Prompt-only malformed-JSON history remains `CONFIRMED`; no JSON repair or
  raw salvage was used in this gate.

The gate used the existing V2 prompt/messages and added only the developer-only
structured response boundary. The V2 semantic contract, model, inference
parameters, and Production path were unchanged.

## B. Model-schema audit

The official model-schema request completed successfully:

```text
MODEL_SCHEMA_CALLS = 1
MODEL_SCHEMA_QUERY = PASS
MODEL_SCHEMA_HTTP = 200
MODEL_INPUT_RESPONSE_FORMAT_PRESENT = YES
MODEL_INPUT_RESPONSE_FORMAT_TYPE = OBJECT
MODEL_SCHEMA_EXPLICIT_JSON_SCHEMA_SUPPORT = YES
OFFICIAL_JSON_MODE_LISTS_CURRENT_MODEL = NO
CAPABILITY_CONCLUSION = SUPPORTED
```

The schema endpoint evidence and the JSON Mode documentation are kept as two
separate signals. A model-schema response containing `response_format` was not
silently treated as equivalent to the documentation's supported-model list;
the direct account-level schema evidence was used for the one permitted probe.
See the [Workers AI model schema API](https://developers.cloudflare.com/api/resources/ai/subresources/models/subresources/schema/methods/get/)
and [Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/).

## C. Structured response boundary

The request used the small developer-only JSON Schema with strict top-level and
event-object keys, the three canonical event enum values, and positive-number
or-null quantity. The existing REST transport removed the Cloudflare outer
envelope before the V2 boundary.

The single D03 provider result was classified as an object response and was
validated directly as an object. It was not stringified into the Prompt-only
text parser.

```text
STRUCTURED_OUTPUT_PROBE = PASS
STRUCTURED_OUTPUT_HTTP = 200
STRUCTURED_OUTPUT_PROVIDER_CONFIRMED = YES
STRUCTURED_RESPONSE_CLASS = OBJECT
STRUCTURED_RESPONSE_BOUNDARY = PASS
```

## D. D03 bounded result

The frozen D03 expectation was not changed. The result reached semantic
evaluation because the structured boundary was valid.

```text
D03_STRUCTURAL_STATUS = PASS
D03_STRUCTURAL_SUBTYPE = NONE
D03_SEMANTIC_EVALUABLE = YES
D03_EVENT_TYPE_PASS = YES
D03_QUANTITY_PASS = YES
D03_DETAIL_PASS = NO
D03_SEMANTIC_PASS = NO
```

The bounded ledger recorded `eventItemCount = 2`; the frozen expectation has
one event. No arbitrary model values were retained, so this report does not
reconstruct or quote the extra event. This is a semantic result, not a
structured-output transport failure, and it is not evidence to change the
Ground Truth or Prompt in this turn.

## E. Local quality gate

Before the external calls:

* TypeScript: PASS.
* Structured-output boundary, schema, REST envelope, auth bridge, V2 runner,
  and real-runner targeted tests: PASS.
* Full Vitest: `620 passed / 6 skipped`.
* Explicit opt-in guard: PASS; default mode makes no provider call.

The auth bridge was kept developer-only and captures the Wrangler JSON
credential response in process memory only. The credential was not included in
the child environment, ledger, report, or console output.

## F. Safety and non-actions

```text
PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
LINE_SEND = 0
QUEUE_WRITE = 0
MIGRATION = NONE
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
```

The developer ledger is ignored by the repository's existing
`forensics/runtime/*.jsonl` rule. The project directory has no Git metadata at
its root, so a repository-level `git diff --check` was not applicable; source
and migration/package/config scope were checked without finding a Production
functional change.

## G. Gate conclusion

This gate proves that the current account/model combination accepted the
developer-only structured-output request and returned a usable structured
object boundary for one D03 call. It does not prove stable D03 semantic
accuracy, a full V2 smoke pass, or Production readiness. No Prompt-only retry,
second inference, model comparison, Full Smoke, Fresh Unseen, human LINE test,
or deployment is authorized by this artifact.

```text
SAFE_REST_AUTH_BRIDGE = PASS
MODEL_SCHEMA_CALLS = 1
MODEL_SCHEMA_QUERY = PASS
MODEL_SCHEMA_HTTP = 200
MODEL_INPUT_RESPONSE_FORMAT_PRESENT = YES
MODEL_SCHEMA_EXPLICIT_JSON_SCHEMA_SUPPORT = YES
OFFICIAL_JSON_MODE_LISTS_CURRENT_MODEL = NO
CAPABILITY_CONCLUSION = SUPPORTED

CURRENT_POSITIVE_EVENT_EXAMPLE = NO
PROMPT_FINGERPRINT_CHANGED = NO

REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
STRUCTURED_OUTPUT_PROBE = PASS
STRUCTURED_OUTPUT_HTTP = 200
STRUCTURED_OUTPUT_PROVIDER_CONFIRMED = YES
STRUCTURED_RESPONSE_CLASS = OBJECT
STRUCTURED_RESPONSE_BOUNDARY = PASS

D03_STRUCTURAL_STATUS = PASS
D03_STRUCTURAL_SUBTYPE = NONE
D03_SEMANTIC_EVALUABLE = YES
D03_EVENT_TYPE_PASS = YES
D03_QUANTITY_PASS = YES
D03_DETAIL_PASS = NO
D03_SEMANTIC_PASS = NO

PROMPT_ONLY_INVALID_JSON_HISTORY = CONFIRMED
NO_JSON_REPAIR = PASS
NO_RAW_SALVAGE = PASS

PRODUCTION_D1_WRITE = 0
BUFFER_CONSUME = 0
CANDIDATE_WRITE = 0
OFFICIAL_WRITE = 0
LINE_SEND = 0
PRODUCTION_PROMPT_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE

READY_FOR_STRUCTURED_OUTPUT_V2_IMPLEMENTATION = YES
READY_FOR_MINIMAL_CANONICAL_PROMPT_EXAMPLE_TEST = NO
READY_FOR_MODEL_COMPARISON = NO
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
```

The structured boundary is ready for a separately authorized developer-only
implementation review. The semantic D03 failure remains evidence to analyze;
this report does not patch it.

## H. Resumed execution after auth restoration

This section records the later execution after the human completed the
Wrangler and GitHub logins. It is additive evidence and does not rewrite the
earlier auth-blocked state or the prior Prompt-only malformed-JSON history.
The safe Wrangler status check and memory-only auth bridge both passed. No
credential value was printed, persisted, or passed through the child
environment.

The existing developer gate then performed exactly one bounded model-schema
query and exactly one structured D03 inference. The ledger is the bounded
runtime artifact at:
`forensics/runtime/ambient-extraction-v2-structured-output-5e0bf505-dbd9-49f8-9609-9486c7339337.jsonl`.

```text
MODEL_SCHEMA_CALLS = 1
MODEL_SCHEMA_QUERY = PASS
MODEL_SCHEMA_HTTP = 200
MODEL_SCHEMA_EXPLICIT_JSON_SCHEMA_SUPPORT = YES
REAL_AI_CALL_LIMIT = 1
REAL_AI_CALLS = 1
STRUCTURED_OUTPUT_PROBE = PASS
STRUCTURED_OUTPUT_HTTP = 200
STRUCTURED_OUTPUT_PROVIDER_CONFIRMED = YES
STRUCTURED_RESPONSE_CLASS = OBJECT
STRUCTURED_RESPONSE_BOUNDARY = PASS
D03_STRUCTURAL_STATUS = PASS
D03_SEMANTIC_EVALUABLE = YES
D03_EVENT_TYPE_PASS = YES
D03_QUANTITY_PASS = YES
D03_DETAIL_PASS = NO
D03_SEMANTIC_PASS = NO
```

The newly persisted bounded event telemetry records two `abnormal` events
with null quantities. Both have no persisted detail; the first does not match
the frozen D03 event, and the second is recorded as an exact tuple duplicate
of the first. No raw detail, source text, prompt, completion, credential, or
model prose was retained. This is a semantic failure for the single D03
diagnostic, not evidence to change the Prompt, model, schema, or Ground Truth.

The local pre-call gate in this resumed execution was `npm run check`:
TypeScript passed and Vitest completed with `623 passed / 6 skipped`. No
Production Worker, D1, Queue, Candidate, Buffer, LINE, migration, or deploy
operation was performed.
