# Ambient development manual debug workflow

This is a development-only command surface for the allowlisted LINE test
group. It is disabled by default in `wrangler.jsonc` and is not exposed from
the normal menu, Quick Replies, or ordinary-text routing.

## Enablement

Set these Worker variables only in the intended development deployment
environment; do not commit LINE group or actor identifiers:

- `DEV_COMMANDS_ENABLED=true`
- `DEV_AMBIENT_GROUP_ALLOWLIST=<exact group id(s)>`
- `DEV_AMBIENT_ACTOR_ALLOWLIST=<exact actor id(s)>`

Authorization requires all three conditions, plus a real LINE self-mention.
Bare text and fuzzy text remain quiet.

## Loop

1. Mention the bot and send `開發摘要 開始`.
2. Send ordinary group messages for one controlled sample.
3. Mention the bot and send `開發摘要 鎖定`.
4. Mention the bot and send `開發摘要 試跑`.
5. Read the bounded stage result. `重跑` uses the same locked source IDs.
6. After the dry-run reaches Reconcile successfully, send `開發摘要 全流程`.
7. Send the exact second confirmation `確認開發摘要全流程` only when a real
   Candidate review-layer write and source consumption are intended.
8. Send `開發摘要 結束` when the session is over.

The dry-run uses the same source selection, Ambient prefilter, Workers AI,
JSON parsing, normalization, strict validation, source enrichment, resolver,
and Reconcile functions as Cron/manual Ambient. It writes only bounded run,
lease, and development-session metadata. Candidate Write and Buffer Consume
are explicitly not committed. The confirmed full-flow mode reuses the normal
Candidate Write/Buffer Consume/idempotency path, but never confirms a Candidate
or writes Operational, Abnormal, Finance, or master data.

The AI contract is intentionally smaller than the persisted Candidate contract;
`sourceMessageIds`, timestamps, users, evidence, conflicts, resolution,
reconciliation, overrides, and lifecycle state are system-owned. The model only
returns bounded semantic clues and item evidence. The durable run exposes the
effective trigger as `cron`, `manual`, `dev_dry_run`, or `dev_commit` by using
the existing trigger field together with the additive `execution_mode` field;
this preserves the existing database trigger constraint without a table rebuild.

Development replies use the LINE Reply API only. Push fallback is disabled for
this command surface; a failed reply is recoverable through `開發摘要 結果`.

## First smoke cohort

Use the locked fixture `forensics/dev-ambient-smoke-8-ground-truth.json` and
send only the eight message texts in that fixture, without the `D01`–`D08`
labels. Do not send them until a fresh development session has started.
