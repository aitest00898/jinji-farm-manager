# Model Capability Evidence Policy

This repository is permanently `FREE_ONLY`: paid Workers plans, paid-only
models, overage billing, and automatic paid fallback are not allowed.

`config/model-capabilities.json` is an append-only, machine-readable record of
model capability evidence. A new request contract, schema profile, adapter
version/hash, evaluator, or result creates a new evidence record; it must not
overwrite an older record.

## Evidence levels

| Level | Meaning |
| --- | --- |
| `L1_DOCUMENTED` | Provider or official catalogue documentation only |
| `L2_STATIC_COMPATIBLE` | Repository/static contract inspection passes |
| `L3_BOUNDED_RUNTIME_PROVEN` | A bounded, explicitly recorded runtime test passes |
| `L4_PRODUCTION_OBSERVED` | Existing Production observation proves the capability |

Evidence is reusable only when the key matches all of:

`provider + modelId + capability + requestProfile + schemaProfile + schemaHash + adapterVersion + adapterHash + evaluatorVersion + result`

Unknown, unsupported, rejected, or stale evidence fails closed. A provider
call is never implicit in a capability check or migration plan.

## Current evidence boundary

The active Worker roles are `ANALYSIS`, `CONVERSATION`,
`AMBIENT_EXTRACTION`, and `ABNORMAL_CLASSIFICATION`. They currently require
text generation and all resolve to
`@cf/meta/llama-3.1-8b-instruct-fast`.

The 8B model has recorded bounded JSON Mode evidence for S0-S4. S5 constraint
schemas were rejected, and full `StructuredAnalysis` JSON Mode compatibility
is not proven. The historical 3B model has recorded text-generation evidence,
but no positive JSON Mode evidence.

The local response validators remain authoritative. Capability evidence does
not relax a validator, authorize a write, change a Prompt, or change a model.
