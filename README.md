# 金雞協會助理 AI — Jinji Farm Manager

This repository is the single permanent GitHub repository and task handoff
centre for User ↔ ChatGPT ↔ Codex:

<https://github.com/aitest00898/jinji-farm-manager>

It contains both parts of the same product:

- the Web management interface at the repository root;
- the LINE Production Worker under `backend/`.

## Product

The assistant receives Traditional Chinese LINE messages, verifies the LINE
signature, queues inbound events, resolves organization and farm context,
stores operational records in Cloudflare D1, and sends bounded replies. The
Web Pages application manages the same organization-scoped data through the
existing Worker API. D1 remains the official source of truth.

The Production path is deterministic-first. Workers AI is limited to bounded
intent/candidate parsing and never owns farm identity, authority, calculations,
official writes, audit lineage, or free-form user answers. Ambiguous farm
references must be clarified rather than guessed. Corrections use reversal and
audit lineage instead of overwriting history.

## Runtime and evidence boundaries

- Production currently follows the existing `backend/wrangler.jsonc` to
  `backend/src/index.ts` Worker path, including its D1, Queue, AI, and V1
  lifecycle bindings.
- The current Ambient official evidence shape is `decisions[]`. V2 uses
  `events[]`, while V2.2 `operations`/`abnormalities` remains developer or
  Shadow-scoped and does not replace the official V1 path.
- Conversation V2 requires an explicit self-mention and group gate. Reading,
  explaining, querying, and advice do not become official writes; an official
  mutation must pass resolver, validator, business logic, D1, and audit
  lineage.
- Shadow is side-only observation. V1 remains the user-visible and
  business-controlling path unless a separately authorized activation changes
  that boundary.
- `/health` is liveness and `/ready` is readiness. Local tests and automated
  observations do not replace real LINE-path acceptance.
- Developer authentication uses the ignored memory-only `.dev.secrets.local`
  under the documented POSIX 0600 policy. Never commit, print, or report its
  value.
- Dated reports and forensic records are historical evidence; their old IDs,
  schedules, counts, and negative results must not be read as current live
  state without a matching current observation.

## Repository layout

```text
src/                 Web React application
tests/               Web browser tests
public/              Web/PWA assets
.github/workflows/   GitHub Pages workflow
backend/src/         LINE Worker and domain logic
backend/migrations/  Worker D1 schema history
backend/scripts/     Local and explicitly gated diagnostics
backend/forensics/   Historical and development evidence
backend/benchmarks/  Semantic fixtures
backend/config/      Developer evaluation configuration
docs/                Shared current state, architecture, and contracts
```

The Web root keeps its existing package, Vite base path, public assets, tests,
and Pages workflow. Backend commands must be run from `backend/`; Web commands
must be run from the repository root.

## Current-state handoff

Start a new ChatGPT or Codex task by reading:

1. `AGENTS.md`
2. `docs/current-execution-state.md`
3. `docs/target-architecture.md` and
   `docs/target-architecture-memory-card.md` when the task involves
   architecture, AI extraction, recovery, schema, or migration
4. the relevant contract or acceptance document

The repository, rather than chat history or temporary terminal output, is the
formal progress relay. Confirmed facts that affect future work belong in the
existing Current State and contract documents. Do not create a second
`HANDOFF.md`, current-state file, task database, or governance framework.

## Local development

Web:

```sh
npm ci
npm test
npm run build
npm run dev
```

Backend:

```sh
cd backend
npm ci
npm run check
```

Backend local D1 fixtures and runtime harnesses are isolated development tools.
Remote migration, deploy, LINE, Workers AI, and Production data commands are
not ordinary development commands and require their own explicitly authorized
task. Never commit `.dev.secrets.local`, tokens, passwords, authorization
headers, credential caches, raw provider output, or raw LINE data.

## Safety and release boundaries

- Production remains on the existing V1 Ambient/Candidate/Queue/Cron/Review
  architecture unless a separate task explicitly authorizes a change.
- V2/V2.2 and Shadow code remain developer/test-group-gated; their presence in
  the repository does not mean Production semantic activation.
- The user-frozen model and Ground Truth must not be changed without explicit
  authorization.
- Organization scope and farm context are distinct. Official operational
  writes must eventually resolve a farm; an unbound group is not automatically
  a software failure.
- Preserve Web root paths and Pages assumptions when changing backend files.

## Git policy

Use the existing repository only. Do not create a second GitHub repository or
rewrite history merely to make the integration look cleaner. Before each
substantive task, compare local status, branch, HEAD, remote, and Current State.
Before a commit, verify that secrets and generated/dependency directories are
excluded. Push only to:

```text
aitest00898/jinji-farm-manager
```
