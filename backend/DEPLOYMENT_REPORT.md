# Production Deployment Report

## STATUS

`AUTOMATED-RUNTIME-E2E: PASS (previous verified Llama baseline)`

`MODEL-BENCHMARK: STOPPED-BY-USER`

`GEMMA-RUNTIME-SMOKE: FAIL (empty_response)`

`AUTOMATED-FARM-ADMIN-AUTH: PASS`

`AUTOMATED-OPERATIONAL-MASTER-DATA: PASS`

`AUTOMATED-FARM-HOUSE-E2E: PASS`

`REAL-LINE-FARM-HOUSE-E2E: PENDING`

`PRODUCTION-MODEL-UNCHANGED`

`AI-BENCHMARK: STOPPED-BY-USER`

`REAL-LINE-MASTER-DATA-REVIEW: PENDING`

Admin Auth remote verification passed before Phase 2 continuation. The approved Test Farm house/flock master data was created only through the protected Worker flow, then verified by remote D1 read-back. No Production house/flock master rows were inserted.

## Scope and deployment

- LINE identity retained: `金雞協會助理Ai` / `@550rsdwc`
- Existing Worker retained: https://chicken-line-production.jinji-assistant.workers.dev
- Existing webhook URL was not changed or re-verified.
- Existing D1 and Queue/Cron/Workers AI bindings were retained.
- Latest production deployment: `c29b864c-d386-49a2-bd80-b040eeba7830`
- `GET /health`: HTTP 200
- Health body: `{"ok":true,"service":"chicken-line-production","account":"@550rsdwc"}`
- Temporary runtime harness: removed from the final deployment; unauthenticated probe returned HTTP 404.
- Final deployment omitted `RUNTIME_TEST_TOKEN`; benchmark endpoints are disabled in Production.

## Latest Farm+House mortality bugfix — 2026-08-20

### ROOT_CAUSE

The deterministic parser's numeric-first Farm+House split did not accept a space before a named house token. It parsed `金雞測試場 測試1舍 死亡5` as `farmText=金雞測試場 測試` and `house=1舍`. FarmResolver therefore received a non-canonical fragment and safely entered candidate confirmation; AI was not invoked, and no operational event was written.

### FIX

The smallest parser change now matches a complete spaced Farm+House token first, then supports the existing concatenated `洪秀美場1舍` form. The unified intent retains `farmText=金雞測試場`, `houseText=測試1舍`, `needsConfirmation=false`; FarmResolver exact matching and scoped HouseResolver then resolve the only active `TEST-BATCH-001` flock directly. Fuzzy, missing-farm, and invalid-house safety behavior remains unchanged.

### Runtime evidence

- Temporary runtime deployment: `12/12 PASS` — signed webhook rejection/queue, exact direct write, stock read-back `995`, age `1`, fuzzy confirmation, no-farm pending, safe cancellation, invalid-house no-write, and no active pending.
- D1 read-back: `金雞測試場` → `測試1舍` → `TEST-BATCH-001`, `mortality=5`; the synthetic row was reversed with `reversed_at`/`reversal_reason`, never deleted.
- Latest final deployment: `c29b864c-d386-49a2-bd80-b040eeba7830`; `/health` HTTP 200; runtime harness endpoints HTTP 404.
- Additional signed exact webhook validation: HTTP 200 queue → D1 canonical Farm/House/Flock read-back PASS; synthetic row reversed before final deployment.
- Latest local check: `103 passed / 0 failed` across 9 test files.
- Post-cleanup D1: active synthetic events `0`; active pending `0`; Test Farm retained; production farms `8`.

## Additive migration and operational model

- `migrations/0005_operational_v1.sql`: PASS on local and remote.
- `migrations/0006_test_farm_sandbox.sql`: PASS on local and remote.
- `migrations/0007_pending_priority_cancel_reason.sql`: PASS on local and remote.
- `migrations/0008_operational_event_note.sql`: PASS on local and remote; additive nullable notes only.
- `migrations/0009_operational_event_reversal.sql`: PASS on local and remote; additive audit-safe reversal markers only.
- `migrations/0010_farm_admin_auth.sql`: PASS on local and remote; additive scoped sessions, lockout counters, and farm-admin action records.
- `migrations/0011_operational_master_data.sql`: PASS on local and remote; additive `houses`, `flocks`, nullable `operational_events.house_id`, and indexes.
- `migrations/0012_operational_master_admin_actions.sql`: PASS on local and remote; additive house candidates and confirmation-gated operational master actions.
- Added only:
  - `farm_aliases` with normalized uniqueness and trusted/candidate statuses.
  - `pending_actions` scoped by `line_group_id + line_user_id`, with a 10-minute expiry.
  - `operational_events` for farm-level `mortality`, `cull`, `feed`, `water`, and `shipment`; `house` and `flock_id` remain nullable.
  - `farms.environment` with `production`/`test` values and no change to existing production farms.
  - `pending_actions.house` as a nullable refinement field.
  - `test_farm_actions` for confirmation-scoped test-farm create/archive actions.
  - `cancel_reason` on pending action tables for audit-safe interruption and cleanup.
  - `note` on operational events and pending actions for bounded natural-language context.
- No table was dropped, rebuilt, cleared, or altered destructively.
- Existing `daily_records` constraints remain intact and legacy compatibility is preserved.
- Phase 2 supports house/flock master data, chick-in date, initial count, expected shipment date, derived stock, house-level events, Taiwan-date age, and shipment reminders. Production master rows remain empty; the approved Test Farm now has one house and one active flock.
- Existing group remains organization-bound with `farm_id = NULL`; new writes resolve a farm per event rather than treating the group as one farm.

## Farm resolution and safety

- Canonical exact and normalized matches can write directly.
- Trusted short aliases can write directly.
- Fuzzy, homophone, ambiguous, and unknown farm text creates a pending candidate flow; AI-extracted farm text is still resolved by FarmResolver and cannot bypass it.
- Number/name/yes confirmation validates pending ownership, expiry, candidate membership, organization, active farm, and replay state.
- `取消` / `不要` / `算了` cancels the user-scoped pending action.
- Replayed confirmation is protected by pending-action status plus unique `pending_action_id` and `source_event_id` constraints.
- Test-farm creation and archive actions are separately scoped to `line_group_id + line_user_id`, require confirmation, and never enter Finance equity or profit ledgers.
- Test farms are visible to operational FarmResolver candidates with a `🧪` marker; Finance queries remain production-only.
- Complete deterministic events, queries, and admin/control commands now supersede waiting pending actions; only unclassified messages enter pending-response handling.
- Superseded pending rows are retained with `status = 'cancelled'` and `cancel_reason = 'superseded_by_new_command'`; user cancellation uses `user_cancelled`.
- Bare `新增測試場` and `封存測試場` return deterministic usage instead of entering the operational fallback.
- Initial alias seed: 16 persisted rows across 8 farms. The requested 20 display variants collapse to 16 under the required normalized `(normalized_alias, farm_id)` uniqueness (`二林場`/`二林`, etc.). No typo alias was seeded as trusted.
- `洪秀梅` remains a candidate on first use; confirmation may add a learned candidate alias conservatively.

## Hybrid Semantic Parser

- Deterministic fast-path and Workers AI both produce the same `UnifiedIntent` contract.
- Simple inputs such as `洪秀美死亡5`, `今天死亡`, `各場持股`, and `大富翁盈虧` stay deterministic and do not invoke AI.
- Natural-language inputs such as `洪秀美那邊今天好像又死了五隻`, `東勢今天餵800公斤料`, `太保今天飲水2300L`, and `今天哪場死最多` invoke the existing Free-plan Workers AI model for JSON intent extraction.
- AI output is schema-validated, cannot include farm IDs or database operations, and is passed to FarmResolver, the application validator, and the existing pending confirmation/write path.
- The semantic contract layer only constrains explicit input/event consistency and strips time/quantity words from `farmText`; it never selects `farm_id`. `掛了` in natural-language mortality messages is normalized to mortality, while `淘汰` remains cull.
- Exact canonical/normalized/trusted farm resolution may write after validation; fuzzy, homophone, ambiguous, missing, or invented farm text requires confirmation or safe rejection.
- AI never computes finance, mortality totals, ranking, or investor amounts; D1 queries do that.
- AI observability logs only `ai_invoked`, intent, confidence, latency, and validation result; no full prompt/message or secret is logged.
- AI failure, timeout, invalid JSON, or quota/model errors fall back to the deterministic path when available, otherwise a safe reformat instruction.
- Actual Production runtime model after this deployment: `@cf/meta/llama-3.2-3b-instruct`.
- Previous real Workers AI smoke passed for `金雞測試場今天死了3隻`, `金雞測試場今天又掛了2隻`, and `今天哪場死最多` under the Llama baseline.
- Gemma candidate smoke failed with `empty_response` for schema, JSON-object, no-format, and prompt-style request shapes; it was not deployed.
- Golden benchmark contains `156` cases. The quota-preserving controlled run completed Llama `180`, GLM `180`, Gemma `172` before user stop; Nemotron was not run. No comparable winner was declared.
- AI invocation policy: deterministic fast-path for simple commands; Workers AI for conversational/irregular event and semantic-query input; FarmResolver and D1 remain authoritative.

## Remote D1 result

- Organizations: `1`
- Farms: `9` total (`8` production + `1` test)
- Investors: `3`
- Farm-investor equity: `24`
- Profit distributions: `12`
- Profit distribution allocations: `36`
- Farm aliases: `17`
- Houses: `1` (Test Farm only)
- Flocks: `1` active (Test Farm only)
- Operational master admin actions: `2` completed through Admin Auth + confirmation
- Pending actions: `21` total (`16 cancelled`, `4 completed`, `1 expired`); active pending `0`.
- Operational events: `48` total (`46` reversed audit rows, `2` pre-existing active test-farm E2E rows); no active synthetic event.
- Production farms: `8`
- Production houses/flocks: `0 / 0`
- Test farms: `1` active (`金雞測試場`, retained from prior真人 E2E)
- Test-farm management actions: `1` completed historical create action
- Line-user investor links: `0` (identities remain unlinked)
- Existing line group: `1`, organization-bound and not forced to one farm
- Farm-admin actions: `13` historical test attempts, all cancelled; no active admin action or session.
- Remote migrations: `0001` through `0012`, all PASS

## Finance regression

Remote D1 read-back is unchanged:

- Gross profit/loss: `4,041,698`
- Allocated profit/loss: `434,838.6`
- Expense: `5,500`
- Player-group net income: `429,338.6`
- SUGAR: `143,112.86666666667`
- 何先生: `143,112.86666666667`
- 承蠔: `143,112.86666666667`
- No-history ledger rows remain zero for `陳駿榜龍潭場`, `林楷威場`, and `洪嘉卿場`.

## Code and local validation

- `npm run check`: PASS
- TypeScript: PASS
- Tests: `103 passed / 0 failed` across 9 test files
- `npx wrangler deploy --dry-run`: PASS
- Local migrations 0001 through 0012: PASS
- Local alias seed: PASS
- Local-only operational fixture: 4 rows, including cross-farm mortality total 7; duplicate source keys: 0
- Local Phase 2 HTTP runtime: `14/14 PASS` through actual Worker dispatch, D1 read/write, confirmation, duplicate guard, derived stock, age, and shipment reminder paths.
- Production Test Farm Admin runtime: `5/5 PASS` — password required, password accepted, house confirmation, flock confirmation, and no bypass.
- Production Test Farm query runtime: `2/2 PASS` — exact farm+house stock and age queries, both deterministic with `ai_invoked=false`.
- Regression coverage includes deterministic mortality, no-farm candidate flow contract, alias/fuzzy/ambiguous resolution, AI known-ID validation, unit conversion, farm-level event parsing, Finance import totals, ROC date conversion, no placeholder ledger rows, and import idempotency contracts.

## Security and prohibited-scope checks

- No LINE Channel Access Token was re-issued.
- No LINE Channel Secret was changed.
- `FARM_ADMIN_PASSWORD_HASH` is configured; its value was never printed, stored in source, D1, logs, or this report.
- Secret inspection exposed names/metadata only; values were never printed or stored.
- Existing LINE secret names remain `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET`.
- No Billing change and no Workers Paid upgrade.
- No Worker, D1, or LINE Channel was deleted or rebuilt.
- No Finance table or historical Finance row was modified or deleted.
- No existing audit/event ledger was deleted.
- The existing `金雞測試場` was retained. Automated runtime rows used only that test farm and were reversed with `reversed_at` / `reversal_reason`; no audit row was deleted.

## Test/Sandbox farm safety

- Supported create aliases: `新增測試場` / `建立測試場` / `新增測試雞場` / `建立測試雞場`.
- Creation is confirmation-gated; the first message only creates a `waiting_confirmation` action.
- `測試場列表` shows active test farms only.
- `封存測試場` / `刪除測試場` are soft archive operations, confirmation-gated, and cannot modify a production farm.
- Test farms start with zero equity and cannot be selected by Finance queries.

## Automated runtime gate evidence

- `UNIT`: PASS — `103/103` tests.
- `LOCAL-INTEGRATION`: PASS — local migrations/fixtures and parser contracts.
- `REMOTE-D1`: PASS — migrations 0011/0012, read-back, reversal, and finance checksum.
- `DEPLOYED-WORKER-SIGNED-WEBHOOK`: PASS — valid HMAC request reached queue and D1 on runtime validation deployment.
- `REAL-WORKERS-AI-SMOKE`: PASS — previous Llama baseline; no additional AI calls were made after restoration to preserve quota.
- `DETERMINISTIC-RUNTIME`: PASS — direct `金雞測試場死亡5` reply.
- `SEMANTIC-RUNTIME`: PASS — natural mortality and colloquial `掛了` event replies.
- `FUZZY-RUNTIME`: PASS — `金雞側市場` candidate, confirmation, exactly-once write.
- `PENDING-RUNTIME`: PASS — missing farm, supersede, cancellation, stale replay.
- `QUERY-RUNTIME`: PASS — AI query intent plus D1 top-mortality aggregation.
- `LINE-REPLY-PAYLOAD`: PASS — captured text message payloads validated.
- `CLEANUP`: PASS — all `44` automated runtime rows reversed; no automated active event or pending remains. The learned test alias `金雞側市場` was reset to candidate/0.
- `MODEL-BENCHMARK`: STOPPED-BY-USER — no model switch; Gemma runtime compatibility failed safely.
- `FARM-ADMIN-AUTH`: PASS — remote Worker verifier, correct/wrong password handling, 5-failure lockout, 15-minute lockout TTL, group/user scope, 5-minute session TTL, session isolation, and replay guards all passed.
- `OPERATIONAL-MASTER-DATA`: PASS — Test Farm house/flock created through Admin Auth + confirmation; Production master rows remain zero.
- `TEST-FARM-ADMIN-RUNTIME`: PASS — `5/5`.
- `TEST-FARM-QUERY-RUNTIME`: PASS — `2/2`, deterministic exact farm+house queries.
- `FARM-HOUSE-REGRESSION`: PASS — `12/12` dispatch checks plus signed exact webhook queue→D1 read-back; exact Farm+House direct write and invalid-house no-fallback are covered.

## Security compatibility exception

`SECURITY_COMPATIBILITY_EXCEPTION:` PBKDF2-SHA256 100,000 iterations is currently used because Node and Cloudflare Worker runtime verification was experimentally confirmed compatible at 100,000, while higher tested iteration counts produced cross-runtime verification mismatch. Re-evaluate when runtime compatibility changes.

## REAL-LINE-FARM-HOUSE-E2E-PENDING

Automated gates are complete. The corrected exact Farm+House path is ready for one minimal human transaction:

1. `金雞測試場 測試1舍 死亡5`
2. `金雞測試場 測試1舍 目前存欄`

Expected results: the first message writes directly with canonical Test Farm/house name and no farm confirmation; the second returns derived stock `995`隻. No Production farm should be used. If cleanup is later requested, use reversal/soft archive only; do not hard-delete audit history.

The prior baseline UI checks were:

1. `金雞測試場死亡5` → deterministic success: `🧪 金雞測試場｜死亡｜5隻`.
2. `金雞測試場今天死了3隻` → semantic success: `🧪 金雞測試場｜死亡｜3隻`.
3. `今天哪場死最多` → semantic query; D1 supplies the result.

Do not send synthetic quantities such as `死亡999`. No token, secret, webhook URL, Billing, or LINE setting changes are needed for this final review.

## Reliability release — 2026-08-22 final handoff

### 1. Incident conclusion

The first proven stop in the 2026-08-21 incident was the old webhook waiting for `env.EVENTS.send()` until the invocation was cancelled at approximately 22:45:12.856 Asia/Taipei. That is below Conversation V2, the deterministic command handlers, and the LINE Reply API. An independent `D1_ERROR: internal error` was observed in the incident window, but the available historical data cannot prove that it caused every delayed reply. The old `63 ingested / 59 acknowledged` metric also cannot be reconciled event-by-event because the old path did not persist a common correlation id.

### 2. What changed

- Added additive migration `0027_line_reliability.sql`; migrations 0001–0026 were not edited.
- `line_events` is now the durable event receipt and lifecycle ledger: received, queued, processing, reply pending, reply completed, retry waiting, and retained.
- Webhook receipt is persisted before supervised Queue enqueue. Queue enqueue runs under `waitUntil` when the runtime supplies an execution context; if the durable receipt cannot be written, the webhook does not claim success.
- Business completion and LINE reply completion are separate. A reply retry cannot repeat a successful official write or Candidate mutation.
- Added per-event bounded recovery and a separate `*/2 * * * *` recovery-only scheduled route. Hourly Ambient and 20:30 Daily Review routes remain separate.
- Added authenticated Web recovery endpoints and the Web 「系統狀態」 page. It can list unfinished messages and request idempotent recovery without clearing Queue, D1, Candidate, Session, or official records.
- Added `/ready`; `/health` remains liveness only.
- Added delayed-reply notice, once per recovered flow, and safe reply result metadata.
- Added correlation propagation into Queue/process/V2 trace metadata and recovery audit history.
- Changed ordinary LINE/Web copy and the `顯示待摘要訊息` screen to short Traditional Chinese. Internal technical fields remain available only in technical diagnostics.
- Preserved Admin Auth: password continuations are processed in a supervised short-lived path; the plaintext is not put into Queue, the durable receipt, recovery metadata, or Audit.

### 3. Verification after deployment

| Check | Result |
|---|---|
| Wrangler dry-run | PASS |
| Worker | `f0215a31-92ee-450d-a6ee-422c2daa58e5`, 100% traffic |
| `/health` | HTTP 200 |
| `/ready` | HTTP 503, correctly reporting 8 retained legacy messages needing attention; stalled 0; reply problems 0 |
| Migration | `0027_line_reliability.sql` applied; no pending remote migration |
| Cron | `0 * * * *`, `30 12 * * *`, `*/2 * * * *` |
| Queue | `chicken-line-events`; batch 10; timeout 0; max retries 3 |
| Daily Review | 2026-08-21 row exists, sent, one attempt, no lease, no error |
| Finance | `434838.6 / 5500 / 429338.6` unchanged |
| Official counts | operational 52; abnormal 3; no release-generated official event |
| Remote official synthetic writes | 0 |

## FINAL CLOSEOUT DEPLOYMENT — 2026-08-22

| 項目 | 最新結果 |
|---|---|
| Worker | `cb912c8e-7448-4732-b42d-aa472ee5cf97`，100% traffic |
| `/health` | HTTP 200 |
| `/ready` | HTTP 503；8 筆歷史保留訊息尚未由管理者按「我已查看」；stalled=0、retrying=0、delivery uncertain=0、reply failure=0 |
| Migration | 無新 migration；0028 仍是最新，remote 無待套用 migration |
| Cron | `0 1,4,7,10,22 * * *`、`0 13 * * *`、`*/2 * * * *` |
| Queue | `chicken-line-events`；batch=10、timeout=0、max retries=3；producer=1、consumer=1 |
| Conversation / AI | `test_farm`；`@cf/meta/llama-3.2-3b-instruct` unchanged |
| LINE outbound | `notificationDisabled=true` |
| D1 read-only | counts query `rows_written=0`、`changed_db=false` |
| Daily Review | 2026-08-21 row=`sent`、1 attempt、lease 空、error 空 |
| Finance | `434838.6 / 5500 / 429338.6` unchanged |
| Remote official synthetic writes | 0 |

### Closeout test evidence

- TypeScript：PASS。
- Vitest：`244/244 PASS`。
- Menu runtime：`59/59 PASS`。
- Manual Ambient：`28/28 PASS`。
- Scheduled Ambient：`5/5 PASS`。
- Web UI：`8/8 PASS`；build PASS。
- Wrangler dry-run：PASS。

本輪更新後的排程是：Ambient 每天 06:00、09:00、12:00、15:00、18:00（台灣時間）；Daily Review 每天 21:00；訊息恢復每 2 分鐘。Weather 仍可互動查詢，但不再由排程執行。一般主選單的「更多功能」不再顯示管理／開發入口；舊 exact text 仍保留，但再次通過既有管理者授權。

Pages 已確認：`https://github.com/aitest00898/jinji-farm-manager` 的成功 workflow `32343936197`（commit `f4813004ea8b4a5d684a12697a84a3639c6ef481`），公開網址 `https://aitest00898.github.io/jinji-farm-manager/` HTTP 200。本輪不需新增 Pages commit。

真人驗收仍不得以自動測試代替：

```text
REAL-LINE-MAIN-MENU: PENDING_REAL_REVIEW
REAL-LINE-DEVELOPER-MENU: PENDING_REAL_REVIEW
REAL-LINE-DEVELOPER-AUTH: PENDING_REAL_REVIEW
REAL-LINE-DEVELOPER-NAVIGATION: PENDING_REAL_REVIEW
REAL-LINE-RECOVERY-NORMAL: PENDING_REAL_REVIEW
REAL-LINE-SYSTEM-STATUS: PENDING_REAL_REVIEW
REAL-LINE-DELAYED-REPLY: PENDING_REAL_REVIEW
```

The two-minute recovery branch automatically processed the eight expired legacy receipts at 2026-08-21 16:56 UTC. Each is now `retained` with `payload_json={"redacted":true}`, `last_error_class=payload_expired`, and seven-day metadata retention through 2026-08-28 UTC. No raw chat text is retained for these expired receipts, so they are not replayable; they are visible for management attention instead of disappearing.

### 4. Local release gates

| Gate | Result |
|---|---:|
| Vitest | 226/226 PASS |
| Reliability fault-injection | 11/11 PASS |
| Menu | 48/48 PASS |
| Quick Record | 25/25 PASS |
| Quiet/Ambient | 24/24 PASS |
| Manual Ambient | 28/28 PASS |
| Scheduled Ambient | 5/5 PASS |
| Digest V2 | 16/16 PASS |
| Candidate Repair | 15/15 PASS |
| Daily Review | 9/9 PASS |
| Conversational Preview | 10/10 PASS |
| Conversation V2 final-response E2E | 21/21 PASS |
| Web check/build | PASS/PASS |

The fault-injection suite covers delayed/failed enqueue, transient and repeated D1 failure, bounded retention, business-write/reply-failure separation, reply-only retry, manual-recovery idempotency, delayed-reply notice, expiry redaction, status/readiness, and error classification. It is local/fixture-based; it does not replace real LINE acceptance.

### 5. Current operating interpretation

- `/health` means the Worker is alive.
- `/ready` means the message pipeline is currently usable without known retained/stalled work. It is HTTP 503 now because eight old receipts are retained for management review; this is an intentional signal, not a Worker crash.
- A message whose durable receipt exists cannot silently vanish from this system's lifecycle ledger. If its payload remains within 24 hours, the recovery branch can retry it. If the payload expires first, the system preserves seven days of metadata and redacts the raw event rather than pretending it can safely replay it.
- If the D1 receipt write itself is unavailable before persistence, the webhook returns failure rather than falsely returning success; the remaining dependency is LINE's retry behavior and Cloudflare platform delivery guarantees, which are not simulated against Production.

### 6. Real-LINE acceptance remains open

Automated and remote read-only verification do not equal a human phone test:

```text
REAL-LINE-RECOVERY-NORMAL: PENDING_REAL_REVIEW
REAL-LINE-SYSTEM-STATUS: PENDING_REAL_REVIEW
REAL-LINE-DELAYED-REPLY: PENDING_REAL_REVIEW
REAL-LINE-MANUAL-RECOVERY: safe Test fixture / non-official state only
```

No Production Candidate was confirmed, cancelled, edited, or deleted during verification. No official synthetic event was created.

## FINAL CURRENT RELEASE — 0028 LINE reliability closeout

本節是本次部署後的最新 Production 證據；上方 0027 快照保留作歷史紀錄，不再作為目前 Worker 基線。

| 項目 | 最新唯讀結果 |
|---|---|
| Worker | `9718d839-d744-485f-9fe3-058f6cdc9e2a`，100% traffic |
| Health | `/health` HTTP 200 |
| Ready | `/ready` HTTP 503；8 筆歷史保留訊息尚未由管理者確認，stalled=0、delivery uncertain=0、reply failure=0 |
| Migration | `0028_line_reliability_closeout.sql` 已套用；remote migrations 無待套用 |
| Cron | `0 * * * *`、`30 12 * * *`、`*/2 * * * *`；最後一個只做訊息恢復 |
| Queue | `chicken-line-events`；batch=10、timeout=0、max retries=3、consumer unchanged |
| D1 lifecycle | 330 筆；322 筆歷史完成資料標記 `legacy_unknown`（不虛稱 LINE 已送達），8 筆 `retained` 且尚未確認 |
| Delivery attempts | 0 筆新的 0028 delivery-attempt；Production 唯讀驗證沒有製造測試訊息 |
| Daily Review | 2026-08-21；`sent`、1 次嘗試、lease 已釋放 |
| Official data | operational=52、abnormal=3；本次沒有新增正式事件 |
| Audit | 30；比先前 29 多的 1 筆是 0028 migration audit，不是營運資料 |
| Ambient | processed=8、buffered=0 |
| Candidate | pending=1、ignored=1 |
| Farms | production=8、test=1 |
| Finance | allocated=434838.6、expense=5500、net=429338.6 |
| Model / silent policy | `@cf/meta/llama-3.2-3b-instruct` unchanged；`notificationDisabled=true` |
| Remote official synthetic writes | 0 |

### Final test evidence

- `npx tsc --noEmit`: PASS。
- Vitest：`240/240 PASS`。
- Reliability fault-injection：PASS，涵蓋 receipt、Queue 延遲/失敗、D1 重試上限、業務與回覆分離、Reply/Push 錯誤分類、固定 retry key、發送 lease、過期保留與手動確認。
- Production-equivalent local runs：reliability `21/21`、preview `10/10`、Conversation V2 E2E `21/21`、Menu `48/48`、Quick Record `25/25`、Quiet/Ambient `24/24`、Manual Ambient `28/28`、Scheduled Ambient `5/5`、Digest V2 `16/16`、Candidate Repair `15/15`、Daily Review `9/9`。
- Web build：PASS。
- Web UI Vitest：`7/7 PASS`。
- Wrangler dry-run：PASS。

### Truthful acceptance status

Remote verification沒有修改 Candidate、正式事件、Finance、Ambient source 或 Queue state；沒有執行人工 LINE 操作。因此真人驗收仍為：

```text
REAL-LINE-RECOVERY-NORMAL: PENDING_REAL_REVIEW
REAL-LINE-SYSTEM-STATUS: PENDING_REAL_REVIEW
REAL-LINE-DELAYED-REPLY: PENDING_REAL_REVIEW
REAL-LINE-MANUAL-RECOVERY: 僅限安全 Test fixture／非正式資料
```

`/ready=503` 是目前的誠實注意訊號，不是自動把 8 筆歷史訊息標成成功；管理者需要在 Web「系統狀態」按「我已查看」後，readiness 才會反映該人工確認。這個動作只更新保留資料的管理 metadata，不會刪除或偽造送達結果。

## FINAL CURRENT DEPLOYMENT — plain-language copy follow-up

最後一次部署只包含 Web 圖表說明與載入文字的白話化，可靠性程式、D1 schema、Queue、Cron 與正式資料均未再變更。

| 項目 | 最新結果 |
|---|---|
| Worker | `62b51851-ac9a-49f3-93c2-44e76341d05d`，100% traffic |
| Wrangler dry-run | PASS |
| `/health` | HTTP 200 |
| `/ready` | HTTP 503；8 筆歷史保留訊息待管理者查看；stalled=0、uncertain=0 |
| Migration | 0028 已套用，無待套用 migration |
| Queue | `chicken-line-events`，batch=10、timeout=0、max retries=3 |
| Cron | `0 * * * *`、`30 12 * * *`、`*/2 * * * *` |
| Web UI | Vitest 7/7 PASS；build PASS |
| Production read-only counts | operational=52、abnormal=3、audit=30、Ambient processed=8/buffered=0、Candidate pending=1/ignored=1 |
| Finance | 434838.6 / 5500 / 429338.6 |
| Remote official synthetic writes | 0 |
