# Project instructions

Before any architecture, AI extraction, recovery, schema, or migration work,
read:

- `docs/target-architecture.md`
- `docs/target-architecture-memory-card.md`
- `docs/current-execution-state.md`

Hard guardrails:

- The target architecture is a non-executing north star, not authorization to
  rewrite or remove Production behavior.
- Do not expand architecture because of one local failure; require evidence,
  an explicit impact record, and user approval for a major deviation.
- The current model is frozen by the user for development quota control; do
  not compare or switch models without explicit unfreeze.
- Developer-only Cloudflare REST evaluation must use the shared memory-only
  loader for the ignored root file `.dev.secrets.local`, protected by the
  local POSIX 0600 policy. Never print a credential, pass it through a child
  environment, put it in a ledger/report, or expose it to terminal/Codex
  context. See `docs/developer-auth.md`.
- Developer evaluation must not fall back to Wrangler OAuth, Keychain lookup,
  environment credential loading, interactive login, rotation, or retries.
- Do not deploy, migrate, call Workers AI, or mutate Production data unless a
  separate task explicitly authorizes that gate.
