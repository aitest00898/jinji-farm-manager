# 金雞協會助理Ai — LINE Production Worker

Production identity:

- LINE Official Account: `金雞協會助理Ai`
- LINE Official Account ID: `@550rsdwc`
- Webhook path: `/webhook/line`
- Worker: https://chicken-line-production.jinji-assistant.workers.dev

The Worker verifies LINE signatures, queues webhook events, stores farm-level operational events in D1, and serves deterministic organization finance queries. Workers AI is a constrained intent/candidate parser only: it returns validated JSON and never sends free-form answers or writes the database.

## Operational V1

Supported event words:

- `死亡` / `死` → mortality
- `掛`（自然語言「掛了」）→ mortality；`淘汰` → cull
- `飼料` / `料` → feed
- `飲水` / `水` → water
- `出雞` / `出欄` → shipment framework

Examples:

- `洪秀美場死亡5` — direct write after canonical/normalized resolution
- `東勢飼料800kg` — trusted alias resolution
- `黃惠玲太保場飲水2.3噸` — stored as `2300 L`
- `死亡5` — asks which farm; it never guesses
- `洪秀梅死亡1` — candidate confirmation required
- `林志騰死亡3` — two candidates; no auto-selection

Operational writes use `operational_events` with required `organization_id` and `farm_id`; `house` and `flock_id` are nullable. `pending_actions` is isolated by `line_group_id + line_user_id`, expires after 10 minutes, supports number/name/yes confirmation and `取消` / `不要` / `算了`, and prevents replay double-writes.

`今天死亡` is deterministic and aggregates all active farms in the bound organization from D1. It is never sent to Workers AI as a date or birthday question.

## Hybrid Semantic Parser

Deterministic fast-path and Workers AI share one `UnifiedIntent` schema. Simple commands remain deterministic; conversational or irregular operational/query messages invoke the existing Free-plan Workers AI model for validated JSON extraction only. AI output is never trusted for farm IDs, calculations, or database writes: FarmResolver, application validation, pending confirmation, and D1 remain authoritative.

AI examples:

- `洪秀美那邊今天好像又死了五隻`
- `東勢今天餵800公斤料`
- `太保今天飲水2300L`
- `今天哪場死最多`

Fuzzy, homophone, ambiguous, missing, or invented farm text cannot direct-write. AI errors safely fall back to deterministic syntax or a fixed reformat instruction. Observability records only invocation/intent/confidence/latency/validation metadata.

## Test / Sandbox Farms

- `新增測試場 金雞測試場` (or the supported 建立 aliases) always asks for confirmation before inserting a farm.
- Test farms are stored with `environment = 'test'`, never receive equity or finance ledger rows, and are excluded from Finance queries.
- Test-farm operational events use the same FarmResolver and pending confirmation safety boundary as production farms. Test candidates are marked `🧪`.
- `測試場列表` lists active test farms; `封存測試場 名稱` / `刪除測試場 名稱` asks for confirmation and soft-archives with `active = 0`.
- `今天死亡` reports formal and test totals separately. Deployment never creates test farms; the existing user-created `金雞測試場` remains active for follow-up E2E.

## Finance commands

- `ping`
- `幫助`
- `今天死亡` / `今日死亡`
- `目前存欄` / `3舍存欄`
- `3舍日齡`
- `近期出雞`
- `雞場列表`
- `各場持股`
- `我的持股`
- `各場盈虧`
- `洪秀美場盈虧`
- `大富翁盈虧`
- `我的累計盈虧`

Unknown or unrelated text receives a fixed safe rejection and cannot write or query data. Investor identity remains unlinked until an explicit LINE user ID → investor mapping is created.

## Local verification

```sh
npm install
npm run check
npm run db:migrate:local
npm run db:import:local
npm run db:aliases:local
npm run db:fixture:local
```

The local D1 database is isolated from Production. The finance import and alias seed are idempotent. The local operational fixture is for validation only and must never be used against Production.

## Production workflow

```sh
npm run db:migrate:remote
npm run db:aliases:remote
npm run check
npx wrangler deploy --dry-run
npm run deploy
```

Do not run secret commands for this project unless a separate approved task explicitly requires it. Secret values must never be placed in Git, source code, D1, logs, README, deployment reports, or test output.
