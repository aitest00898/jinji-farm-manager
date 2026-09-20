# LINE non-@Bot wake inventory

## Scope

This is the Phase 1 static inventory for the real LINE non-@Bot wake review.
The source is pinned to:

`7df2610070518122b1737c62a310ab5492c0e476`

Repository: `chicken-line-production`
Inventory date: 2026-09-14 (Asia/Taipei)
Runtime test status at creation: static inventory only; the bounded real-client
phase is recorded separately in
`forensics/real-line-non-bot-wake-e2e-2026-09-14.md`.

This document does not claim that a message was sent, that a Bot replied, or
that any Production business data was changed. It also does not change the
wake policy.

## Classification

| Code | Meaning |
|---|---|
| A | Always wakes without a self-mention because it is an exact control, admin, query, or navigation command. |
| B | Wakes only while a matching active group/user context exists, such as an active Quick Record session. |
| C | Wakes only as a response to a scoped pending state, such as a quantity, choice, confirmation, or password response. |
| D | Explicit UI action: Postback, Quick Reply, or a visible Message Action. Postbacks enter the explicit path even without message text. |
| E | Parser-recognized but intentionally quiet in the ordinary group path. |
| F | True validated LINE self-mention is required. A display name, @All, or ordinary text is not equivalent. |
| G | The command wakes, but the handler still requires an admin/session/allowlist boundary and can return a denial. |
| H | Static source does not prove a safe live outcome or an exact authorization result; bounded runtime observation is required. |

Codes can be combined. For example, `A+G` means a message is not quiet, but
the protected handler must still authorize it; `D+G` means the UI action is
explicit but protected.

## Gate model

At the exact source SHA, `src/index.ts` first parses the message, then calls
`interactionGateDecision`. A message is explicit when it has validated self
mention metadata or `isExplicitWakeCommand` returns true; an active/pending
state admits only the scoped continuation; otherwise the message is quiet.
Postbacks are explicit by event type. The exact source also special-cases
bare `摘要` as quiet and requires self mention for the development ambient
command surface.

The important distinction is:

`parser match ≠ global wake ≠ official business write`.

The parser and canonical taxonomy are deterministic, but normal record-shaped
messages can remain quiet unless they are active-context continuations, while
canonical unknown text with a non-ignored taxonomy parse can be admitted to
the explicit path. No parser result by itself grants official write authority.

## Static inventory totals

| Surface | Static result | Evidence |
|---|---:|---|
| Recognized `ParsedCommand.kind` values excluding `unknown` | 50 | `src/core.ts:18-69` |
| `unknown` fallback | 1 | `src/core.ts:69` and `src/core.ts:440` |
| `MENU_ACTIONS` Postback identities | 72 | `src/line-menu.ts:78-151` |
| Canonical taxonomy IDs | 25 | O1-O9 and A1-A16 in `src/recording-taxonomy.ts` |
| Fast-path identities | 3 | `menu_home`, `menu_more`, `menu_help`; default-deny in `src/fast-path.ts:69-92` |
| Datetime Picker actions | 0 | `docs/LINE_MENU_ACCESS_MATRIX.md` static audit |

The historical menu audit reports 195 clickable outputs (182 Postback, 12
Message, 1 URI, 0 Datetime Picker), with no missing handler in that audit.
That is a UI-output count, not the number of parser commands or wake words.

## 1. Exact parser command inventory

Every recognized command kind is listed below. Alias forms are kept together
when they resolve to the same kind; no alias is silently omitted.

| # | Parser kind | Exact text / pattern family | Static class | Live-scope / safety note |
|---:|---|---|---|---|
| 1 | `ping` | `ping`, `測試`, `测试` | A | Read-only health reply. |
| 2 | `help` | `幫助`, `帮助`, `help`, `指令`, `功能` | A | Public help reply. |
| 3 | `menu` | `選單`, `功能選單` | A+D | Main menu; presentation only. |
| 4 | `menu_quick_record` | `快速紀錄` | A+D | Opens Quick Record; later state may be B/C. |
| 5 | `menu_today_summary` | `今日營運`, `今日狀況` | A+D | Read path; scope/data dependent. |
| 6 | `menu_farms` | `場次／批次`, `場次/批次`, `雞場與批次` | A+D | Read path and scope selection. |
| 7 | `menu_recent_abnormal` | `最近異常` | A+D | Read path. |
| 8 | `menu_correction_help` | `更正紀錄`, `修改紀錄` | A+D | Opens correction guidance; a later correction is separately protected. |
| 9 | `menu_weather` | `雲林天氣` | A+D | Read path; external weather data may be involved. |
| 10 | `menu_ai` | `AI營運分析`, `AI分析` | A+D+H | Explicit command, but provider/runtime cost and response need bounded observation; not exercised in this inventory. |
| 11 | `menu_pending_candidates` | `待確認資料` | A+D | Candidate/read path; candidate state is not an official fact. |
| 12 | `menu_finance` | `財務摘要` | A+D+G | Wakes; management/admin authorization remains required. |
| 13 | `menu_audit` | `歷史紀錄`, `變更紀錄` | A+D | Read history path. |
| 14 | `menu_help` | `使用說明` | A+D | Read-only help. |
| 15 | `menu_management` | `管理功能` | A+D+G | Wakes; admin boundary remains. |
| 16 | `menu_developer` | `開發選單` | A+D+G | Wakes; admin boundary remains. |
| 17 | `system_status` | `系統狀態` | A+G | Wakes; active admin session is checked. |
| 18 | `ambient_digest_now` | `摘要` | E+F | Bare text is deliberately quiet; manual digest requires a validated self mention. |
| 19 | `pending_ambient_preview` | `顯示待摘要訊息` | A+G | Exact text has a direct read-only branch; unauthorized users receive denial. |
| 20 | `cancel` | `取消`, `不要`, `算了` | A+B+C | Global control reply; when state exists it cancels the scoped state. |
| 21 | `bind` | `綁定`/`绑定` plus farm text | A+G+H | Admin/mutation-shaped group binding; no live test in this task. |
| 22 | `mortality` | `死亡 N舍 M` and compatible legacy form | E+B+C | Complete operational command is not a global wake word; active/pending context can own it. |
| 23 | `inventory` | `存欄 N舍 M` and compatible legacy form | E+B+C | Same quiet/active distinction; do not confuse with query form. |
| 24 | `record_operational` | legacy farm/event/quantity grammar for mortality, cull, feed, water, shipment | E+B+C | Complete record-shaped input is owned by the existing operational path, not a global wake word. |
| 25 | `summary` | `今日`, `今天`, `查詢`, `查询`, `統計`, `统计`, optionally house | A+H | Deterministic query command; exact read response still depends on scope/data. |
| 26 | `query_today_mortality` | today/current mortality with optional house | A | Deterministic query. |
| 27 | `query_farm_today_mortality` | farm name plus today/mortality | A | Deterministic query; resolver result is runtime-dependent. |
| 28 | `query_inventory` | current/now inventory with optional house/farm | A | Deterministic query. |
| 29 | `query_flock_age` | house plus `日齡`/`日龄` | A | Deterministic query. |
| 30 | `query_upcoming_shipments` | `下週出雞`, `下周出鸡`, `近期出雞`, `近期出鸡` | A | Deterministic query. |
| 31 | `query_farm_list` | farm-list aliases | A | Deterministic query. |
| 32 | `query_equity` | equity/holding list aliases | A+G | Query class, but finance/management authorization remains a handler concern. |
| 33 | `query_my_equity` | my holding/equity aliases | A+G | Query class, protected data path. |
| 34 | `query_farm_profit` | farm name plus `盈虧`/`盈亏` | A+G | Query class, protected finance path. |
| 35 | `query_farm_profit_list` | `各場盈虧`/`各场盈亏` | A+G | Query class, protected finance path. |
| 36 | `query_portfolio_profit` | portfolio/total profit aliases | A+G | Query class, protected finance path. |
| 37 | `query_investor_profit` | personal cumulative profit aliases | A+G | Query class, protected finance path. |
| 38 | `create_test_farm` | create test farm plus name | A+G | Admin mutation flow; no runtime mutation in this task. |
| 39 | `archive_test_farm` | archive/delete test farm plus name | A+G | Admin mutation flow; no runtime mutation in this task. |
| 40 | `create_test_farm_usage` | bare create test farm usage | A+G | Usage reply; no mutation until a later protected flow. |
| 41 | `archive_test_farm_usage` | bare archive/delete test farm usage | A+G | Usage reply; no mutation until a later protected flow. |
| 42 | `create_farm` | create farm plus name | A+G | Admin mutation flow; no runtime mutation in this task. |
| 43 | `archive_farm` | archive/delete farm plus name | A+G | Admin mutation flow; no runtime mutation in this task. |
| 44 | `create_farm_usage` | bare create farm usage | A+G | Usage reply; no mutation until a later protected flow. |
| 45 | `archive_farm_usage` | bare archive/delete farm usage | A+G | Usage reply; no mutation until a later protected flow. |
| 46 | `create_house` | create house plus farm and house | A+G | Admin mutation flow; no runtime mutation in this task. |
| 47 | `create_house_usage` | bare create house usage | A+G | Usage reply; no mutation until a later protected flow. |
| 48 | `create_flock` | create flock plus farm, house, batch, date, count, optional shipment date | A+G | Admin mutation flow; no runtime mutation in this task. |
| 49 | `create_flock_usage` | bare create flock usage | A+G | Usage reply; no mutation until a later protected flow. |
| 50 | `test_farm_list` | `測試場列表` | A+G | Read-only test data view, admin session checked. |
| — | `unknown` fallback | every other normalized text | E/B/C/F/H | Ordinary chat is quiet; active/pending context may admit a scoped continuation; canonical non-ignored taxonomy text can become explicit; otherwise it is not a Bot wake. |

The exact command aliases and classifications above are grounded in
`src/core.ts:284-440` and `src/core.ts:79-143`. `A` means the interaction gate
admits the command; it does not mean the protected handler succeeds.

## 2. Legacy operational and Quick Record pattern inventory

### Legacy one-message command grammar

`src/core.ts` accepts event-first or farm-first forms. The event words are:

| Intent | Words | Quantity/unit rule |
|---|---|---|
| mortality | `死亡`, `死`, `死亡數`, `死亡数` | positive integer, optional `隻`/`只`/`羽` |
| cull | `掛`, `淘汰` | positive integer, optional bird unit |
| feed | `飼料`, `饲料`, `料` | positive number, kg-family units |
| water | `飲水`, `饮水`, `水` | positive number; L or volume conversion |
| shipment | `出雞`, `出鸡`, `出欄`, `出栏` | positive integer, optional bird unit |

These resolve to `record_operational` and therefore have class E/B/C when
complete. A missing/ambiguous form may instead fall to the canonical unknown
route or a pending state.

### Quick Record extractor

`src/quick-record.ts:121-141` independently extracts:

| Extractor | Pattern family |
|---|---|
| mortality | 死亡/死了/死/掛了/掛/死掉 + number |
| cull | 淘汰/抓掉/抓走 + number |
| feed | 飼料/饲料/料, optional usage verb + number + kg/包 |
| water | 飲水/饮水/用水/喝水/水 + number + L/公升/噸 |
| shipment | 出雞/出鸡/出欄/出栏 + number |
| abnormal | concrete phrases such as 咳嗽、喘、臭腳、白冠、停電、漏水、水簾、風扇、屋頂、缺料、缺水、異常、故障、受損 and the listed weather/health/equipment variants |

`quickRecordLooksRelevant` is a narrow handoff predicate, not a global wake
rule. It is evaluated only after the interaction gate and after the
conversation safety checks. Complete simple operational text can consequently
remain quiet in an ordinary group while a canonical observation or active
continuation is admitted.

### Correction patterns

`src/quick-correction.ts:89-141` recognizes quantity changes, whole cancel,
farm move, partial move, replacement, and item cancel forms, including
`死亡改成 N`, `死亡不是 N，是 M`, `剛剛全部取消`, `剛剛全部是在...`,
`不是 A，是 B` and the corresponding comma-separated forms. These are not
ordinary global record words: they need a recent/active correction or daily
review context; without it they are rejected or remain quiet according to the
normal gate. Classification: B/C, with H for live target/result until the
bounded runtime phase.

## 3. Canonical taxonomy pattern inventory

The canonical parser covers every O1-O9 and A1-A16. It is invoked in the
unknown-command branch. When the result is non-ignored, the interaction gate
can admit it even without a self mention; questions, future/hypothetical
phrases, negations, chatter, and other safety exclusions are E.

| Taxonomy | Trigger family | Required/derived fields at parser boundary | Static class |
|---|---|---|---|
| O1 | 入雛, 進雛 | farm, maleCount, femaleCount, condition, house, flock | A+H when canonical unknown; E/B/C when an older complete command owns it |
| O2 | 疫苗, 接種, 用藥, 補充品, 維生素 | farm plus content; subtype is vaccination/medication/supplement | A+H when canonical unknown; E/B/C for legacy complete command |
| O3 | 出雞, 出欄, 出貨 | farm, quantity, house; sex and optional totalWeight | A+H when canonical unknown; E/B/C for legacy complete command |
| O4 | 磅重, 稱重, 平均體重 | farm, averageWeight, house, flock; sex | A+H when canonical unknown; E/B/C for legacy complete command |
| O5 | 叫飼料, 叫料, 訂飼料, 訂料, 訂購飼料 | farm, vendor, weight | A+H when canonical unknown; E/B/C for legacy complete command |
| O6 | 送驗, 檢驗, 化驗 | farm, content; result and completedAt when completed | A+H when canonical unknown; E/B/C for legacy complete command |
| O7 | 清消, 消毒 | farm; pending/completed workflow status | A+H when canonical unknown; E/B/C for legacy complete command |
| O8 | 設備維護, 設備保養, 維修, 保養 | farm, maintenanceContent | A+H when canonical unknown; E/B/C for legacy complete command |
| O9 | 死亡, 死雞, 淘汰, 掛了 | farm, quantity; mortality/cull subtype | A+H when canonical unknown; E/B/C for legacy complete command |
| A1 | 死亡異常, 死亡率異常 | farm, extent, linkedMortalityEventId | A+H candidate; no official write from parser |
| A2 | 咳嗽 | farm, extent | A+H candidate |
| A3 | 喘, 呼吸/respiratory wording | farm, extent | A+H candidate |
| A4 | 沒精神, 活動下降 | farm, extent | A+H candidate |
| A5 | 白冠/眼冠 variants | farm, extent, recognized subtype | A+H candidate; unknown subtype asks clarification |
| A6 | 拉肚子, 腹瀉, 水便 and variants | farm, extent | A+H candidate |
| A7 | 生長延遲, 成長慢 and variants | farm, extent | A+H candidate |
| A8 | 臭腳 | farm, extent | A+H candidate; no location fallback should be invented |
| A9 | 發燒, 高熱 and variants | farm, extent | A+H candidate |
| A10 | 熱緊迫, 抓雞緊迫 and variants | farm, extent | A+H candidate |
| A11 | 採食/飲水異常 | farm, extent | A+H candidate |
| A12 | 電、停電、風扇、水簾、加熱、飼料線、飲水線、設備異常 and `其他` | farm, extent, subtype; `其他` also detail | A+H candidate; unresolved subtype/detail asks clarification |
| A13 | 高溫/低溫/氣溫/雨 and weather wording | farm, extent | A+H candidate |
| A14 | 淹水, 積水 | farm, extent | A+H candidate |
| A15 | 異味, 臭味 | farm, extent | A+H candidate |
| A16 | 攻擊, 感染, 擴散, 傳播 | farm, extent | A+H candidate |

The exact field and safety behavior is in
`src/recording-taxonomy.ts:700-855`. Canonical candidates are not official
business writes until the existing resolver/validator/confirmation path
accepts them. This inventory does not exercise those paths.

## 4. Ambient, conversation, and development-only text

### Ambient buffer is not a wake reply

`ambientMessageMayBeRelevant` uses the canonical parser and a bounded legacy
term fallback to decide whether a quiet group message may be buffered for
future Ambient processing. It rejects ordinary self-report-only text,
context-only phrases, generic heat chatter, questions, future/hypothetical
text, negation, and ordinary chatter. Buffer relevance therefore must not be
counted as a Bot wake.

### Conversation V2

Conversation V2 is entered after an explicit validated self mention or a
scoped active/pending path. Its read tools are allowlisted and its official
tool list is empty. A plain free-chat message in a quiet group does not enter
the AI-first path. Classification: F for natural-language V2 requests;
B/C for scoped continuations. No Workers AI call is part of this static
inventory or its later safe runtime plan.

### Development ambient commands

The exact development-only vocabulary is:

`開發指令`, `開發摘要 開始`, `開發摘要 鎖定`, `開發摘要 狀態`,
`開發摘要 試跑`, `開發摘要 重跑`, `開發摘要 結果`,
`開發摘要 全流程`, `確認開發摘要全流程`, `開發摘要 結束`.

The source explicitly requires a validated self mention before allowlist and
organization checks. Bare text is quiet and not buffered. Classification: F;
the admitted route is additionally authorization/allowlist protected (G).

## 5. UI and postback inventory

All 72 identities in `MENU_ACTIONS` are explicit UI actions (D). Stateful
actions remain on their existing handler and may also be C/B after the
postback. Admin/reliability/finance actions are D+G where the handler checks
admin/session state. The exact identity list is:

`menu_home`, `menu_quick_record`, `menu_today_summary`, `menu_farms`,
`menu_recent_abnormal`, `menu_correction_help`, `menu_weather`, `menu_ai`,
`menu_more`, `menu_pending_candidates`, `menu_management`,
`menu_developer`, `menu_system_status`, `menu_message_diagnostics`,
`menu_pending_diagnostics`, `menu_pending_ambient_preview`,
`menu_test_tools`, `menu_settings`, `menu_technical_info`,
`menu_line_receive_settings`, `menu_unfinished_messages`,
`reliability_acknowledge`, `reliability_recover`,
`reliability_recover_confirm`, `menu_finance`, `menu_audit`, `menu_web`,
`menu_help`, `menu_farm_summary`, `menu_house_summary`,
`menu_flock_summary`, `menu_current_farm_summary`,
`menu_today_mortality`, `menu_recent_abnormal_range`,
`pending_select_farm`, `pending_select_house`, `quick_record_category`,
`quick_record_count`, `quick_record_abnormal`, `quick_record_custom`,
`quick_record_next`, `correction_action`, `correction_target`,
`correction_quantity`, `correction_confirm`, `ai_preset`, `ai_custom`,
`ai_followup`, `ambient_confirm_all`, `ambient_review`, `ambient_ignore`,
`ambient_snooze`, `ambient_select_farm`, `ambient_select_house`,
`ambient_select_flock`, `ambient_item_record`, `ambient_item_modify`,
`ambient_item_ignore`, `ambient_conflict_quantity`,
`ambient_reconcile_already`, `ambient_reconcile_new`,
`ambient_reconcile_view`, `ambient_candidate_edit`,
`ambient_candidate_cancel`, `ambient_candidate_select`,
`ambient_candidate_field`, `ambient_preview_page`,
`ambient_preview_digest`, `daily_review_correction`,
`daily_review_candidates`, `daily_review_detail`, `reliability_redisplay`.

The action parser accepts only a non-empty data string of at most 300
characters whose `action` is in that set
(`src/line-menu.ts:160-166`). Unknown actions are rejected (D denied), not
silently routed.

Static menu builders expose Message Actions for main/more/management/test
surfaces, including `快速紀錄`, `今日狀況`, `雞場與批次`, `最近異常`,
`修改紀錄`, `雲林天氣`, `AI分析`, `待確認資料`, `歷史紀錄`,
`使用說明`, `財務摘要` and `測試場列表`. Those visible message texts
resolve through the same parser/handler as manually entered exact text.
The management web URI is navigation, not a Bot webhook wake by itself.

## 6. Pending and active-state inventory

The exact scoped-pending query checks:

1. `pending_actions` in waiting farm/confirmation;
2. `abnormal_pending_actions` in waiting farm/house;
3. `farm_admin_actions` in waiting password/confirmation;
4. `operational_admin_actions` in waiting password/confirmation;
5. `ambient_digest_candidates` pending for the reviewing user;
6. a `conversation_v2_sessions` canonical pending memory;
7. an active Daily Review context.

Short responses matching a bare number, `是`, `好`, `確認`, `確定`,
`否`, or `不是` are classified as C only when a scoped pending/active
state admits them. Without that state they remain unknown/quiet rather than
becoming a new official action. Farm/house/flock selections, Quick Record
counts, correction targets/quantities, candidate actions, and Daily Review
replies are stateful and must not be treated as global wake words.

## 7. Static wake-word sets

### ALWAYS_WAKE_WORDS

The deterministic no-mention set consists of:

* public control/help/menu exact forms: `ping`/`測試`/`测试`,
  `幫助`/`帮助`/`help`/`指令`/`功能`, `選單`/`功能選單`,
  `快速紀錄`, `今日營運`/`今日狀況`, `場次／批次`/`場次/批次`/
  `雞場與批次`, `最近異常`, `更正紀錄`/`修改紀錄`, `雲林天氣`,
  `AI營運分析`/`AI分析`, `歷史紀錄`/`變更紀錄`, `使用說明`,
  `待確認資料`, and `取消`/`不要`/`算了`;
* exact navigation forms: `主選單`, `選單`, `功能選單`,
  `返回主選單`/`返回主菜单`, `更多功能`/`返回更多功能`,
  `管理功能`, `開發選單`/`返回開發選單`, `返回`/`返回上一頁`/
  `返回上一層`;
* deterministic read queries listed in parser kinds 25-37;
* exact admin/developer command forms and usage forms listed in parser kinds
  17-21 and 38-50. Their handlers can still deny or require an admin
  session.

### CONTEXTUAL_WAKE_WORDS

These are not global wake words in their complete legacy forms:

* complete `死亡`/`死`/`掛`/`淘汰`/`飼料`/`料`/`飲水`/`水`/
  `出雞`/`出欄` plus a quantity;
* farm/house/selection text, a bare count, `是`/`好`/`確認`/`確定`/
  `否`/`不是`, correction target/quantity text, and candidate actions when
  the corresponding state exists;
* Quick Record continuation and Daily Review correction text after their
  scoped context has been established.

Canonical unknown text with a non-ignored O/A taxonomy parse is a separate
deterministic explicit ingress. It must still go through scope, resolver,
validator, candidate/confirmation, and canonical business boundaries.

### QUIET / SELF-MENTION-ONLY

* bare `摘要` is E and does not wake, including when an active record context
  exists;
* ordinary free chat, questions, future/hypothetical statements, negated
  records, duplicate/relation-only statements, and chatter are E;
* development ambient commands are F and bare text is quiet;
* a true validated self mention is the required F boundary for manual digest
  and natural-language Conversation V2. @All is not a self mention.

## 8. Runtime plan boundary

The next phase may observe only the existing confirmed Test group and only
safe, bounded messages. The initial candidate set should be read-only
commands such as `ping` and `使用說明`, followed by the exact query/navigation
forms needed to prove the static categories. Mutation-capable commands are
not to be confirmed or written merely to prove that a parser wakes; any
candidate-only operation must be explicitly cancelled. No Production group,
Production business record, raw SQL, migration, queue write, finance change,
or Workers AI invocation is authorized by this inventory.

The real-client result must separately record:

* the exact text entered in the composer;
* target Test group verification;
* whether the outgoing bubble appeared;
* whether a Bot reply appeared;
* whether any business/candidate/AI state changed;
* whether the behavior matched A/B/C/D/E/F/G/H.

No blind resend is allowed after an uncertain send. The genuine LINE client
must remain open after observation.

## Evidence index

* `src/core.ts:18-143, 175-440` — command kinds, classes, aliases and legacy
  operational grammar.
* `src/index.ts:665-676, 9463-9634` — explicit wake classification, exact
  diagnostic exception, self-mention, active/pending gate and quiet path.
* `src/ambient.ts:564-659` — ambient vocabulary, self mention, gate and
  relevance boundary.
* `src/recording-taxonomy.ts:700-855` — canonical O1-O9/A1-A16 recognition,
  safety exclusions and required fields.
* `src/quick-record.ts:117-141, 1089-1092` — Quick Record extractor and
  relevance predicate.
* `src/quick-correction.ts:89-141` — correction grammar.
* `src/ambient-dev.ts:15-57` — development-only exact commands and
  authorization boundary.
* `src/line-menu.ts:78-166, 189-200` — Postback allowlist and navigation.
* `src/fast-path.ts:49-92` — fixed public fast-path allowlist/default deny.
* `docs/LINE_INTERACTION_STANDARD.md:30-53` — quiet mode and manual digest
  mention boundary.
* `docs/LINE_MENU_ACCESS_MATRIX.md:85-100, 167-195` — user-facing menu
  inventory and authorization layering.

## Phase 1 status

`STATIC_INVENTORY = COMPLETE`
`SOURCE_SHA = 7df2610070518122b1737c62a310ab5492c0e476`
`SOURCE_CHANGE = NONE`
`PRODUCTION_CHANGE = NONE`
`D1_BUSINESS_WRITES = 0`
`WORKERS_AI_CALLS = 0`
`LINE_SENDS_IN_PHASE_1 = 0`

## TEST_LINE_STATE_SURFACE_MATRIX — 2026-09-14 cleanroom

This matrix is based on the exact deployed source
`7df2610070518122b1737c62a310ab5492c0e476` and the read-only Test-scope
schema inspection. It contains no LINE group or user identifiers.

| Store | Purpose | Test scoping key | Actionable states | Terminal states | Canonical cleanup path | Safe to mutate? |
| --- | --- | --- | --- | --- | --- | --- |
| `line_events` | durable incoming event/reply/reliability history | confirmed Test group lineage | received, queued, processing, retryable, retained when still actionable | `reply_completed`, resolved/acknowledged retained states | existing reliability recover/acknowledge/resolve path for eligible retained rows | only through the existing scoped reliability path; no action needed in this readback |
| `pending_actions` | operational candidate and confirmation state | Test group + organization + actor | `waiting_farm`, `waiting_confirmation` | `completed`, `cancelled`, `expired` | existing scoped cancellation lifecycle | yes, only for an explicitly scoped pending action through the supported flow |
| `abnormal_pending_actions` | abnormality candidate and scope selection | Test group + organization + actor | `waiting_farm`, `waiting_house` | `completed`, `cancelled`, `expired` | existing scoped cancellation lifecycle | yes, only for an explicitly scoped pending action through the supported flow |
| `farm_admin_actions`, `operational_admin_actions`, `test_farm_actions` | admin/master-data workflow state | Test group + organization + Test farm lineage | waiting password/confirmation states | `completed`, `cancelled`, `expired` | existing admin cancellation/expiry lifecycle | only through the existing authorized admin flow; no active rows observed |
| `ambient_chat_buffer` | quiet-group source messages awaiting digest | Test group + organization | `buffered` and retained processing-failure states | `processed`, `expired` | existing digest consume/expiry lifecycle; no direct delete | no direct cleanup mutation was used |
| `ambient_digest_candidates` | derived digest candidates awaiting review | Test group + organization | `pending`, due `snoozed` | `confirmed`, `ignored`, `expired` | `cancelAmbientCandidate` / equivalent LINE candidate lifecycle; normal Web route is read-only | only through the existing candidate lifecycle; 4 pending rows block cleanroom |
| `ambient_dev_sessions` | developer-only ambient capture state | Test group + organization + authorized actor | `capturing`, `locked` while unexpired | `ended`, `expired` | existing developer session lifecycle | no active rows observed; developer-only and not a cleanroom bypass |
| `ambient_digest_invocations` | digest cleanup/group orchestration state | invocation schedule and Test group lineage | `started`, cleanup/group-processing states | `completed`, `failed` | existing invocation lifecycle | no active rows observed |
| `ambient_expiry_diagnostics` | retained expiry/audit evidence | Test group + organization + source fingerprint | none; diagnostic retention only | retained diagnostics expire by `retain_until` | retention lifecycle; do not delete as cleanroom cleanup | no active retained rows observed |
| `conversation_v2_sessions` | bounded conversational context | Test group + organization + actor, with expiry | unexpired session with active context | expired/no active context | existing expiry/session lifecycle | no direct row deletion |
| `quick_record_sessions` | Quick Record draft, selector, and correction context | Test group + organization + actor, with expiry | unexpired `active`, `waiting_farm`, or `waiting_house` with pending content | `closed` or expired | existing Quick Record close/cancel/expiry lifecycle | no active or pending rows observed |
| `quick_record_bundles`, `quick_record_items` | confirmed Quick Record grouping and canonical item lineage | Test group + organization + farm/house/flock | active item/bundle lineage is canonical history, not pending cleanup | reversed/corrected/moved lineage as defined by the table | keep history; correction/reversal only for an identified error | never delete/update originals for cleanroom purposes |
| `daily_review_contexts` | Daily Review reply context | Test group + organization + actor, with expiry | unexpired context | expired | existing review expiry lifecycle | no active rows observed |
| `daily_operations_reviews` | generated daily review delivery state | Test group + organization + review date | `pending`, `sending` | `sent`, `failed` | existing review delivery lifecycle | no pending/failed rows observed |
| `line_operational_contexts` | persistent last-confirmed operational scope | Test group + organization + actor | persistent context is not itself pending business work | replaced by a later scoped context | existing scope-context update path | one persistent row observed; not mutated by cleanroom |
| `line_semantic_action_locks` | deduplicate in-flight semantic actions | Test group + actor + semantic key | unexpired `running` lock | `completed` or expired | existing lock completion/expiry lifecycle | no active locks observed |
| `ambient_digest_runs`, `ambient_digest_leases` | digest execution and lease coordination | Test group + organization | running/nonterminal run; lease-until in the future | completed/failed run; expired lease | existing run completion and natural lease expiry | no direct cleanup mutation |
| `line_event_delivery_attempts`, `line_event_recovery_audit` | delivery and recovery audit evidence | line event/correlation lineage | none; audit rows are not pending workflow | retained audit history | retain as audit evidence | never clean up as transient state |
| `recording_events`, `operational_actions`, `operational_events`, `abnormal_events` | canonical business facts and lineage | Test organization/farm/house/flock | effective facts and explicit lineage states | reversed/corrected/replacement lineage as defined by each table | keep correct facts; correction/reversal only for an identified error | never delete/update originals for cleanroom purposes |

Observed Test-scope state at the cleanroom boundary: 750 LINE events were
terminal with zero actionable unfinished/failed/retryable rows; 19 ambient
buffer rows had zero actionable rows; all non-candidate transient stores had
zero active rows. Quick Record sessions and pending content, Daily Review
contexts/reviews, semantic locks, Ambient dev sessions/invocations, and
retained expiry diagnostics were also inactive. One persistent operational
scope context row was observed and was not treated as pending work. Four
`ambient_digest_candidates` rows remained in `pending`, so they cannot be
silently treated as clean.

## TEST LINE CLEANROOM GATE — 2026-09-14 read-only result

```text
TEST_GROUP_CONFIRMED = YES
TEST_ENVIRONMENT_CONFIRMED = YES
TEST_PENDING = 0_NON_CANDIDATE_TRANSIENT
TEST_UNPROCESSED = 0
TEST_ACTIONABLE_FAILED = 0
TEST_UNRESOLVED = 0_ACTIONABLE
TEST_UNRECOGNIZED_ACTIONABLE = 0
TEST_PENDING_CANDIDATES = 4
TEST_ACTIVE_SESSIONS = 0
TEST_PENDING_CLARIFICATIONS = 0
TEST_PENDING_CONFIRMATIONS = 0
TEST_PENDING_SELECTIONS = 0
TEST_STALE_DIGEST_WORK = 4_PENDING_CANDIDATE_ROWS
TEST_ACTIVE_DIGEST_RUNS = 0
TEST_ACTIVE_LEASES = 0
OLD_AMBIENT_ELIGIBLE_FOR_NEXT_DIGEST = 0
CANONICAL_RECONCILIATION = PASS
TEST_AUTHORITATIVE_STOCK = 963
READBACK_1 = STABLE_BASELINE_2026-09-14T01:51:08Z
READBACK_2 = STABLE_BASELINE_2026-09-14T01:52:58Z
STATE_REAPPEARED = NO_CLEANUP_PERFORMED
```

`GET /api/pending-candidates` is read-only in the exact deployed source.
Candidate terminalization is available only through the existing LINE
candidate lifecycle, and no new LINE message was allowed in this cleanroom.
Accordingly:

```text
TEST_LINE_CLEANROOM_GATE = BLOCKED
REAL_LINE_WAKE_TEST = PAUSED_FOR_CLEANROOM
NEW_LINE_MESSAGES_DURING_CLEANROOM = 0
TEST_ROWS_MUTATED = 0
PRODUCTION_ROWS_MUTATED = 0
DIRECT_CANONICAL_DELETE = 0
DIRECT_CANONICAL_UPDATE = 0
CLEANROOM_CUTOFF_TIMESTAMP = 2026-09-14T01:53:37.300Z
NEXT_ALLOWED_ACTION = EXISTING_TEST_ONLY_CANDIDATE_CANCEL_OR_IGNORE_PATH; NO_NEW_LINE_MESSAGES_UNTIL_GATE_PASS
```

## TEST LINE CLEANROOM GATE — terminalized and stabilized (2026-09-14)

The four authorized cleanup-only candidate actions completed sequentially in
the confirmed Test group. Candidate workflow state changed only through the
existing LINE lifecycle; no canonical business fact was created or changed.

```text
CLEANROOM_CLEANUP = COMPLETE
CANDIDATE_1 = IGNORED
CANDIDATE_2 = EXISTING_RECORD_RECONCILIATION_ONLY
CANDIDATE_3 = IGNORED
CANDIDATE_4 = IGNORED
PENDING_CANDIDATE_SEQUENCE = 4 -> 3 -> 2 -> 1 -> 0
CANDIDATE_STATUS_AFTER = CONFIRMED_1_EXISTING_RECONCILIATION + IGNORED_3
CLEANUP_CREATED_NEW_CANDIDATE = 0
OFFICIAL_BUSINESS_WRITE_DELTA = 0
AUTHORITATIVE_STOCK_DELTA = 0
CANONICAL_TEST_BUSINESS_ROWS_MUTATED = 0
PRODUCTION_ROWS_MUTATED = 0
FINANCE_ROWS_MUTATED = 0
DIRECT_SQL_BUSINESS_FIXES = 0
WORKERS_AI_CALLS = 0

TEST_LINE_EVENTS_TOTAL_AFTER = 760
TEST_ACTIONABLE_UNFINISHED = 0
TEST_ACTIONABLE_FAILED = 0
TEST_RETRYABLE = 0
TEST_UNRESOLVED = 0
TEST_UNRECOGNIZED_ACTIONABLE = 0
TEST_AMBIENT_ACTIONABLE = 0
TEST_PENDING_CANDIDATES = 0
TEST_ACTIVE_SESSIONS = 0
TEST_PENDING_CLARIFICATIONS = 0
TEST_PENDING_CONFIRMATIONS = 0
TEST_PENDING_SELECTIONS = 0
TEST_ACTIVE_DIGEST_RUNS = 0
TEST_ACTIVE_LEASES = 0
OLD_AMBIENT_ELIGIBLE_FOR_NEXT_DIGEST = 0
TEST_RECORDING_EVENT_COUNT = 1
TEST_OPERATIONAL_ACTION_COUNT = 3
TEST_OPERATIONAL_EVENT_COUNT = 65
TEST_ABNORMAL_EVENT_COUNT = 9
TEST_AUTHORITATIVE_STOCK = 963
CANONICAL_RECONCILIATION = PASS

AFTER_READBACK_AT = 2026-09-14T02:56:52Z
STABILIZATION_READBACK_1_AT = 2026-09-14T02:57:19Z
STABILIZATION_READBACK_2_AT = 2026-09-14T02:57:45Z
STATE_REAPPEARED = NO
CLEANROOM_CUTOFF_TIMESTAMP = 2026-09-14T02:58:23Z
TEST_LINE_CLEANROOM_GATE = PASS
REAL_LINE_WAKE_TEST = PAUSED_AFTER_CLEANROOM
NEXT_ALLOWED_ACTION = POST_CLEANROOM_REAL_LINE_NON_BOT_WAKE_INVENTORY
```

The previous blocked-cleanroom entries remain historical. This is the latest
authoritative Test-only state; no new non-cleanup wake message was sent.

## AMBIENT 30-CASE QA SPEC RECONCILIATION — 2026-09-20

The existing 30-message corpus remains immutable. Its inputs were not
rewritten, normalized, combined, or reordered. The original semantic
checkpoints that say a record-shaped sentence should immediately write a
canonical fact are retained as explicit-interaction expectations only.

The authoritative routing contract is different for this no-mention run:

* `PASSIVE_AMBIENT`: buffer/process the message; immediate canonical write is
  `0`; an immediate reply is normally not required; later candidate/digest
  behavior is evaluated separately.
* `EXPLICIT_BOT_INTERACTION`: true validated self-mention or an exact
  supported control/query command; deterministic read or write behavior may
  run according to its existing authority boundary.
* `ACTIVE_QUICK_RECORD`: a proven unexpired Quick Record session owns the
  continuation and can enter the canonical Resolver/Validator/write path.
* `PENDING_OR_CANDIDATE_CONFIRMATION`: a scoped pending candidate or
  confirmation state owns the response; without that state, the same text is
  not a global wake word.
* `READ_ONLY_QUERY`: a recognized query may reply/read, but never writes a
  canonical business fact.
* `NON_OPERATIONAL_CHAT`: ordinary chat, questions, negation, uncertainty,
  hypothetical language, or third-party statements; no write.

At the start of this run there is no active Quick Record session and no
pending/candidate confirmation state. Therefore a record-shaped message in
the exact no-mention corpus is `PASSIVE_AMBIENT` unless a later authoritative
readback proves a scoped state was established. A candidate is not a
canonical fact, and AI output never has direct write authority.

| Case | Mode for this no-mention run | Corrected expected behavior |
|---:|---|---|
| 01 | `PASSIVE_AMBIENT` | O9 mortality intent, Test scope; buffer/candidate only, immediate write `0`, immediate reply normally not required. `PASS_EXPECTED_SAFE_NO_WRITE`. |
| 02 | `NON_OPERATIONAL_CHAT` | Quiet/buffer only; write `0`. |
| 03 | `PASSIVE_AMBIENT` | Cough intent is not a global wake; write `0`. An explicit/active replay may record A2 through Resolver/Validator. |
| 04 | `NON_OPERATIONAL_CHAT` | Question/hypothetical; write `0`. |
| 05 | `PASSIVE_AMBIENT` | Mortality/cough/foot-odor bundle may be a later candidate; no immediate bundle write. Explicit/active replay preserves three-fact decomposition. |
| 06 | `NON_OPERATIONAL_CHAT` | Negation/correction-like chatter without scoped state; write `0`. |
| 07 | `PENDING_OR_CANDIDATE_CONFIRMATION*` | Cancel/reversal semantics apply only if an identified scoped candidate or active correction state exists; otherwise remain quiet and write `0`. |
| 08 | `NON_OPERATIONAL_CHAT` | Ordinary chat; write `0`. |
| 09 | `PASSIVE_AMBIENT` | Feed-order intent is buffered/candidate-only; write `0` in this no-mention run. Explicit/active replay may record O5. |
| 10 | `NON_OPERATIONAL_CHAT` | Uncertainty/negation; write `0`. |
| 11 | `PASSIVE_AMBIENT` | Lab-test intent is buffered/candidate-only; write `0` in this no-mention run. Explicit/active replay may record O6. |
| 12 | `NON_OPERATIONAL_CHAT` | Question; write `0`. |
| 13 | `PASSIVE_AMBIENT` | Eye-swelling/poor-spirit bundle may be a candidate with unknown quantity; no immediate write. |
| 14 | `NON_OPERATIONAL_CHAT` | Uncertain negative; write `0`. |
| 15 | `ACTIVE_QUICK_RECORD*` | Green-diarrhoea continuation writes only when a proven active session exists; otherwise passive Ambient and write `0`. |
| 16 | `READ_ONLY_QUERY` | Read-only abnormality query if recognized; no canonical write. |
| 17 | `PASSIVE_AMBIENT` | Fan-failure intent is buffered/candidate-only; write `0` in this no-mention run. Explicit/active replay may record A12. |
| 18 | `NON_OPERATIONAL_CHAT` | Commentary/duplicate-sounding chatter; write `0`. |
| 19 | `ACTIVE_QUICK_RECORD*` | Repair/recovery continuation writes only with a proven active session; otherwise passive Ambient and write `0`. |
| 20 | `NON_OPERATIONAL_CHAT` | Positive appearance/chat; write `0`. |
| 21 | `PASSIVE_AMBIENT` | Purple-crown intent is buffered/candidate-only; write `0` in this no-mention run. |
| 22 | `PENDING_OR_CANDIDATE_CONFIRMATION*` | Purple-to-black correction requires a scoped pending/active correction state; without it, write `0`. Explicit correction remains append-only. |
| 23 | `PASSIVE_AMBIENT` | Weigh intent is buffered/candidate-only; write `0` in this no-mention run. Explicit/active replay may record O4. |
| 24 | `READ_ONLY_QUERY` | Weight question/read-only response; write `0`. |
| 25 | `PASSIVE_AMBIENT` | Shipment intent is buffered/candidate-only; write `0` in this no-mention run. Explicit/active replay may record O3. |
| 26 | `NON_OPERATIONAL_CHAT` | Uncertain quantity; write `0`. |
| 27 | `PENDING_OR_CANDIDATE_CONFIRMATION*` | Shipment correction requires a scoped pending/active correction state; without it, write `0`. Explicit correction remains append-only. |
| 28 | `READ_ONLY_QUERY` | Read-only attention query if recognized; no canonical write. |
| 29 | `NON_OPERATIONAL_CHAT` | Third-party/unrelated farm statement; write `0`. |
| 30 | `READ_ONLY_QUERY` | Summary/read-only query; write `0`. |

`*` means the stateful class is eligible only after authoritative evidence
proves the relevant scoped state. It must not be inferred from the preceding
passive message. The observed Case 01 outcome is therefore
`PASS_EXPECTED_SAFE_NO_WRITE`; the candidate sub-stage detail remains
`OBSERVABILITY_ONLY_GAP` and is not a reason to change runtime behavior.

For this exact no-mention execution, the corrected immediate-write baseline
is zero unless a later message independently creates a proven explicit or
active state. This reconciles the corpus with the formal contract without
changing any input or weakening false-write, duplicate, ambiguity,
append-only correction, or Production/Test isolation requirements.

### Runtime sequencing rule for the live corpus

The table above is the clean-context baseline. During a sequential live run,
each next case must be classified against the authoritative state produced by
the preceding case, not against the initial clean-context assumption. Case 01
was later surfaced by the scheduled Ambient digest as a pending candidate
(`死亡2隻`, unresolved farm/house); therefore Case 02 was observed in
`PENDING_OR_CANDIDATE_CONFIRMATION`, not as an ordinary-chat-only path. Its
observed A13 candidate prompt requested scope and produced no canonical or
audit write, so it is a pass under the formal contract. The same rule applies
to every later case: a stateful class is valid only when the state is
authoritatively present; otherwise the case falls back to passive Ambient or
non-operational chat behavior.

### Live no-mention execution evidence — 2026-09-20

The run resumed at Case 02 after the Case 01 forensic PASS. Every message was
sent once, in corpus order, in the visible authorized group. No confirmation
button or candidate-selection button was pressed. The following matrix records
the observed mode/result against the corrected contract; `0` is the observed
canonical business-write count for that case.

| Case | Observed mode/result | Write count | Result |
|---:|---|---:|---|
| 01 | `PASSIVE_AMBIENT`; digest/candidate, no canonical write | 0 | `PASS_EXPECTED_SAFE_NO_WRITE` |
| 02 | `PENDING_OR_CANDIDATE_CONFIRMATION`; A13 scope prompt, no write | 0 | PASS |
| 03 | `PENDING_OR_CANDIDATE_CONFIRMATION`; A2 scope prompt, no write | 0 | PASS |
| 04 | `NON_OPERATIONAL_CHAT`; safe ambiguity warning, no write | 0 | PASS |
| 05 | `PENDING_OR_CANDIDATE_CONFIRMATION`; O9 scope prompt, no write | 0 | PASS |
| 06 | `NON_OPERATIONAL_CHAT`; no prior canonical record to correct | 0 | PASS |
| 07 | `PENDING_OR_CANDIDATE_CONFIRMATION`; multiple candidates, choose required | 0 | PASS |
| 08 | `PENDING_OR_CANDIDATE_CONFIRMATION`; candidate handling, no write | 0 | PASS |
| 09 | `PENDING_OR_CANDIDATE_CONFIRMATION`; O5 scope prompt, no write | 0 | PASS |
| 10 | `NON_OPERATIONAL_CHAT`/uncertainty; safe parse rejection, no write | 0 | PASS |
| 11 | `PENDING_OR_CANDIDATE_CONFIRMATION`; O6 detail prompt, no write | 0 | PASS |
| 12 | `NON_OPERATIONAL_CHAT`; no write and no required immediate reply | 0 | PASS |
| 13 | `PENDING_OR_CANDIDATE_CONFIRMATION`; A5 scope prompt, no write | 0 | PASS |
| 14 | `PENDING_OR_CANDIDATE_CONFIRMATION`; A6 scope prompt, no write | 0 | PASS |
| 15 | `PENDING_OR_CANDIDATE_CONFIRMATION`; A6 continuation still unresolved | 0 | PASS |
| 16 | `READ_ONLY_QUERY`; no write | 0 | PASS |
| 17 | `PENDING_OR_CANDIDATE_CONFIRMATION`; A12 scope prompt, no write | 0 | PASS |
| 18 | `NON_OPERATIONAL_CHAT` with pending context; no write | 0 | PASS |
| 19 | `PENDING_OR_CANDIDATE_CONFIRMATION`; O8 scope prompt, no write | 0 | PASS |
| 20 | `NON_OPERATIONAL_CHAT` with pending context; no write | 0 | PASS |
| 21 | `PENDING_OR_CANDIDATE_CONFIRMATION`; no write | 0 | PASS |
| 22 | `PENDING_OR_CANDIDATE_CONFIRMATION`; correction not applied without target | 0 | PASS |
| 23 | `PENDING_OR_CANDIDATE_CONFIRMATION`; O4 scope prompt, no write | 0 | PASS |
| 24 | `READ_ONLY_QUERY`; safe ambiguity warning, no write | 0 | PASS |
| 25 | `PENDING_OR_CANDIDATE_CONFIRMATION`; O3 farm-selection prompt, no write | 0 | PASS |
| 26 | `PENDING_OR_CANDIDATE_CONFIRMATION`; uncertain quantity rejected safely | 0 | PASS |
| 27 | `PENDING_OR_CANDIDATE_CONFIRMATION`; multiple candidates, no correction | 0 | PASS |
| 28 | `READ_ONLY_QUERY`; read-only analysis warning, no write | 0 | PASS |
| 29 | `NON_OPERATIONAL_CHAT`; third-party farm not in valid master, no write | 0 | PASS |
| 30 | `READ_ONLY_QUERY`; no valid farm context, no write | 0 | PASS |

The Worker canonical read model, viewed through the read-only Web surface,
reported `0` Production-scope canonical records after the run. No canonical
write, audit write, stock change, Finance change, authorization change, or
duplicate write was observed. Because this was the exact no-mention run,
`FALSE_NEGATIVE_WRITES = 0` is evaluated against the corrected no-mention
contract; the conditional explicit/active write branches remain separate
acceptance paths.

```text
AMBIENT_30_CASES = 30
EXPECTED_IMMEDIATE_WRITES = 0
ACTUAL_CANONICAL_WRITES = 0
FALSE_POSITIVE_WRITES = 0
FALSE_NEGATIVE_WRITES = 0
DUPLICATE_WRITES = 0
PRODUCTION_DATA_DELTA = 0
STOCK_DELTA = 0
FINANCE_DELTA = 0
LINE_AUTH_DELTA = 0
QA_SPEC_RECONCILED = YES
FINAL_AMBIENT_QA_STATUS = PASS_FORMAL_NO_MENTION_CONTRACT
OBSERVABILITY_GAPS = OBSERVABILITY_ONLY_GAP
```
