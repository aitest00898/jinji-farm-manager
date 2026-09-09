# Model Migration Policy

This policy defines the small model-portability boundary used by the Worker.
It does not authorize a Production deployment, Workers AI call, D1 migration,
or model switch.

## Routing

Production call sites resolve one of the actual roles in
`src/model-registry.ts`: `ANALYSIS`, `CONVERSATION`, `AMBIENT_EXTRACTION`, or
`ABNORMAL_CLASSIFICATION`. `resolveModelForRole()` fails closed for an unknown
role, unknown model, missing capability evidence, stale evidence, or an
explicit model that is not the currently bound model. The historical 3B model
remains available only as recorded developer/baseline evidence.

The provider boundary is intentionally narrow:

- `runText()` resolves a role and executes the existing text request.
- `runStructured()` additionally requires an already supplied response format
  and a proven JSON Mode request profile.
- Neither boundary retries, falls back to a paid provider, writes D1, sends
  LINE, enqueues Queue work, or replaces local validation.

## Candidate planning

`model:migration-plan` is a no-provider-call planner. It reports current and
target role bindings, required capabilities, reusable/missing/stale evidence,
static/live evidence available, release checks, and rollback requirements.
It is not a switch command.

The baseline downgrade guard rejects 8B → 3B unless the caller supplies the
explicit `MODEL_MIGRATION` release intent. A valid intent still only produces
a review-ready plan; it does not activate the candidate.

The bootstrap receipt in
`config/model-migration-receipts/2026-09-08-3b-to-8b.json` records the existing
3B → 8B decision. It deliberately records `SEMANTIC_SUPERIORITY=NOT_PROVEN`,
`BOUNDED_JSON_MODE=PROVEN_S0_S4`, and
`FULL_STRUCTURED_ANALYSIS=NOT_PROVEN`.

## Required release boundary

Every future model migration requires explicit L3 approval, targeted
regression, a captured rollback Worker version, post-release model/health
verification, and a separate decision for any D1 migration. No command in this
framework performs those Production actions automatically.
