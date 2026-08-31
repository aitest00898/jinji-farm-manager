# Project instructions

This repository is the single permanent project repository for
`金雞協會助理 AI`:

- GitHub: `aitest00898/jinji-farm-manager`
- Web application: repository root (`src/`, `tests/`, `public/`)
- Backend Worker: `backend/` (`src/`, `migrations/`, `scripts/`, `forensics/`)
- Shared project documentation: `docs/`

Do not create a second project, backend, handoff, or governance repository.
Do not move or overwrite the Web root to integrate backend work.

## Required reading and handoff

At the start of every substantive task, inspect:

1. `git status`
2. `git branch --show-current`
3. `git rev-parse HEAD`
4. `git remote -v`
5. `AGENTS.md`
6. `docs/current-execution-state.md`

For architecture, AI extraction, recovery, schema, or migration work, also
read `docs/target-architecture.md`,
`docs/target-architecture-memory-card.md`, and the relevant contract.

The repository handoff chain is:

```text
AGENTS.md
→ docs/current-execution-state.md
→ docs/target-architecture.md
→ docs/target-architecture-memory-card.md
→ domain contracts and acceptance docs
→ current source, tests, and migrations
```

`AGENTS.md` contains entry rules and boundaries. `docs/current-execution-state.md`
is the primary progress relay. Do not create `HANDOFF.md`, a second current
state, a task database, or another governance framework.

## Autonomy and stop rules

- L1 may inspect, diagnose, test locally, and report.
- L2 may make reversible repository/documentation changes, commit, and push to
  the single GitHub repository when the task explicitly authorizes it.
- L3 actions require a separate explicit authorization and must stop: Worker
  deployment, remote D1 migration/write, Queue or LINE mutation, Workers AI
  calls, production model/prompt/schema changes, secret rotation, or security
  boundary redesign.
- Preserve existing dirty worktree changes until their origin and scope are
  understood. Never use `git reset --hard`, force-push, or discard unknown
  changes as an integration shortcut.
- Stop when the requested task is complete, evidence is consistent, local
  verification is sufficient, and the authorized boundary is intact.

For every future L3 completion record, when evidence is available, record only
the minimum authorization trace: `L3_AUTHORIZATION` (`USER_EXPLICIT` or
`NOT_RECORDED`), `AUTHORIZED_SCOPE` (a closed action list with limits),
`AUTHORIZATION_REASON`, and `EXECUTION_CORRELATION` (source SHA plus existing
deployment/workflow identifiers and counters). These fields describe evidence;
they do not authorize work. Never backfill historical approval, or store raw
approval text, credentials, secrets, or tokens.

## GitHub handoff policy

`aitest00898/jinji-farm-manager` is the single permanent project handoff and
progress-synchronization repository for User ↔ ChatGPT ↔ Codex. Confirmed
facts that change future task decisions belong in the existing Source of Truth
chain, not only in chat or terminal output. Do not record secrets, raw
credentials, raw provider completions, or raw LINE data in the repository.

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

## Documentation truth and audit boundary

- `docs/target-architecture.md` and its memory card describe the target
  architecture; they are not evidence that a target change is authorized or
  deployed.
- `docs/current-execution-state.md` is the single transient progress ledger.
  Do not create another Current State, HANDOFF, task database, or governance
  layer.
- Label evidence by kind: source/config, last verified deployment metadata,
  live observation, historical report, or unknown. Do not present a historical
  Worker ID, schedule, count, contract shape, or test result as current live
  proof.
- Dated reports and forensics are historical evidence. Preserve failures and
  conflicting records; do not rewrite them to make the latest state appear
  cleaner. Record any unresolved conflict in the owning document.
- Keep V1, V2, V2.2, Conversation V2, and Shadow evidence separate. A test or
  Shadow result does not silently replace the V1 official path.
- Documentation audits remain read-only unless the task explicitly authorizes
  a documentation update. Do not run tests, scripts, network commands, or
  Production probes merely to rewrite historical documentation.
