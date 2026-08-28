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
  auth bridge, with the dedicated macOS Keychain API-token item preferred.
  Never print a credential, pass it through a child environment, put it in a
  ledger/report, or expose `wrangler auth token` output to the terminal/Codex
  context.
- Wrangler OAuth is a compatibility fallback, not the durable developer
  credential. Missing OAuth/keyring state must fail with a bounded status and
  must not trigger automatic login, logout, rotation, or retries.
- Do not deploy, migrate, call Workers AI, or mutate Production data unless a
  separate task explicitly authorizes that gate.
