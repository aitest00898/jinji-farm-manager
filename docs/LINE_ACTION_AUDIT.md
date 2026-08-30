# LINE 全互動可見回饋稽核

本文件是本輪「全按鈕／Quick Reply 可見操作回饋 + 導航一致性」的
Source-level 與 local runtime audit。它不把真人手機驗收冒充成自動測試。

## 不變條件

> EVERY USER-INITIATED LINE ACTION MUST HAVE VISIBLE CHAT FEEDBACK.

- Message Action：`text` 就是使用者在聊天室看到的操作文字。
- Postback：`displayText` 是白話操作文字；`data` 保留原本的內部 routing key。
- Quick Reply：沿用 Message／Postback 的同一規則，不另開例外。
- URI：先用可見 Postback 留下操作，再由第二則訊息提供 URI 按鈕。
- Navigation：在 Conversation V2 前處理；Open Candidate 只是上下文，不是模式鎖。
- Datetime Picker：Production source 目前沒有此類 Action；若未來加入，必須由 Bot 回覆已選值。

## 盤點範圍

Action 建立與路由主要位於：

- `src/line-menu.ts`：所有 Flex、Message Action、Postback、Quick Reply builder。
- `src/index.ts`：Menu、Quick Record、Pending、Candidate、Correction、Daily Review、Ambient、可靠性 Postback handler。
- `src/line-action-audit.ts`：遞迴收集 nested Flex／Quick Reply Action 的稽核 helper。
- `src/line-action-audit.test.ts`：以所有 Production builder fixture 加上 runtime-only 可靠性 Action 執行 inventory gate。
- `scripts/menu-runtime-local.mjs`：Production-equivalent local event path，包含 Open Candidate 下的 `返回` 導航。

本輪沒有修改 Queue、D1 schema、可靠性 lifecycle、Candidate 資料、官方紀錄、Finance、Weather 或 Cron。

## Action 總數

盤點 fixture 覆蓋所有目前可產生的靜態 builder 與動態 Action template；動態雞場／雞舍／批次／Candidate 數量會依資料列數展開，以下數字是標準 fixture 的實際 inventory：

| 範圍 | Postback | Message | URI | Datetime Picker | 其他 | 合計 |
|---|---:|---:|---:|---:|---:|---:|
| Flex builders | 28 | 12 | 1 | 0 | 0 | 41 |
| Quick Reply builders | 153 | 0 | 0 | 0 | 0 | 153 |
| runtime-only 可靠性通知 Action | 1 | 0 | 0 | 0 | 0 | 1 |
| **總計** | **182** | **12** | **1** | **0** | **0** | **195** |

Inventory output：`LINE_ACTION_INVENTORY { total: 195, postback: 182, message: 12, uri: 1, datetimepicker: 0, other: 0 }`。

結果：

| Gate | 結果 |
|---|---|
| VISIBLE FEEDBACK PASS | 195 個 Action 皆有可見回饋規則；URI 以 alternate flow 驗證 |
| VISIBLE FEEDBACK FAIL | 0 |
| MISSING HANDLER | 0 |
| INTERNAL TEXT LEAK | 0 |

## 完整 Action Matrix

下表以 routing family 列出所有 Action。雞場、雞舍、批次、Candidate 與更正目標是同一個已驗證模板的資料化展開，不把每一個資料列誤算成另一套 handler。

### 主選單、子選單與管理入口

| 畫面／流程 | 按鈕或 Quick Reply | Action type | 使用者顯示文字 | routing | 權限 | 是否寫資料 | 測試／handler |
|---|---|---|---|---|---|---|---|
| 主選單 | 快速紀錄 | Message | 快速紀錄 | `menu_quick_record` | 群組成員 | 進既有紀錄流程 | `buildMainMenuFlex` → `parseCommand` → `handleMenuAction` |
| 主選單 | 今日狀況 | Message | 今日狀況 | `menu_today_summary` | 群組成員 | 否 | 同上；menu runtime |
| 主選單 | 雞場與批次 | Message | 雞場與批次 | `menu_farms` | 群組成員 | 否 | 同上；menu runtime |
| 主選單 | 最近異常 | Message | 最近異常 | `menu_recent_abnormal` | 群組成員 | 否 | 同上；menu runtime |
| 主選單 | 修改紀錄 | Message | 修改紀錄 | `menu_correction_help` | 群組成員 | 後續更正才寫 | 同上；Daily／Correction regression |
| 主選單 | 雲林天氣 | Message | 雲林天氣 | `menu_weather` | 群組成員 | 否 | 同上；weather regression |
| 主選單 | AI 分析 | Message | AI分析 | `menu_ai` | 群組成員 | 唯讀分析 | 同上；AI entry runtime |
| 主選單 | 更多功能 | Postback | ⋯ 更多功能 | `action=menu_more` | 群組成員 | 否 | `displayText` gate；menu runtime |
| 更多功能 | 待確認資料 | Message | 待確認資料 | `menu_pending_candidates` | 群組成員 | 否 | `handleMenuAction` |
| 更多功能 | 歷史紀錄 | Message | 歷史紀錄 | `menu_audit` | 群組成員 | 否 | `handleMenuAction` |
| 更多功能 | 使用說明 | Message | 使用說明 | `menu_help` | 群組成員 | 否 | `handleMenuAction` |
| 更多功能 | 返回主選單 | Postback | ↩️ 返回主選單 | `action=menu_home` | 群組成員 | 否 | navigation gate |
| 管理功能 | 財務摘要 | Message | 財務摘要 | `menu_finance` | 管理者 session | 否 | `handleMenuAction` re-check |
| 管理功能 | 管理網頁第一步 | Postback | 管理網頁 | `action=menu_web` | 管理者 session | 否 | `menu_web` handler |
| 管理網頁第二步 | 開啟管理網頁 | URI | 開啟管理網頁 | unchanged URI | 已通過第一步管理者授權 | 否 | `buildManagementWebLinkFlex`; alternate visible flow |
| 管理功能 | 返回更多功能 | Postback | ↩️ 返回更多功能 | `action=menu_more` | 管理者 session | 否 | navigation gate |
| 管理功能 | 返回主選單 | Postback | 🏠 返回主選單 | `action=menu_home` | 管理者 session | 否 | navigation gate |

### 開發選單、診斷與可靠性

| 畫面／流程 | 按鈕或 Quick Reply | Action type | 使用者顯示文字 | routing | 權限 | 是否寫資料 | 測試／handler |
|---|---|---|---|---|---|---|---|
| 開發選單 | 系統狀態 | Postback | ✅ 系統狀態 | `menu_system_status` | 管理者 session | 否 | `handleMenuAction` |
| 開發選單 | 訊息診斷 | Postback | 🔍 訊息診斷 | `menu_message_diagnostics` | 管理者 session | 否 | `handleMenuAction` |
| 開發選單 | 待確認資料診斷 | Postback | 📌 待確認資料診斷 | `menu_pending_diagnostics` | 管理者 session | 否 | `handleMenuAction` |
| 開發選單 | 測試工具 | Postback | 🧪 測試工具 | `menu_test_tools` | 管理者 session | 唯讀 | `handleMenuAction` |
| 開發選單 | 系統設定 | Postback | ⚙️ 系統設定 | `menu_settings` | 管理者 session | 否 | `handleMenuAction` |
| 開發選單 | 技術資訊 | Postback | 🔧 技術資訊 | `menu_technical_info` | 管理者 session | 否 | `handleMenuAction` |
| 開發選單 | 返回更多功能 | Postback | ↩️ 返回更多功能 | `menu_more` | 管理者 session | 否 | navigation gate |
| 開發選單 | 返回主選單 | Postback | 🏠 返回主選單 | `menu_home` | 管理者 session | 否 | navigation gate |
| 訊息診斷 | 查看尚未整理訊息 | Postback | 查看尚未整理訊息 | `menu_pending_ambient_preview` | 管理者 session | 唯讀、AI=0 | `runAmbientPreview` |
| 訊息診斷 | 查看未完成訊息 | Postback | 查看未完成訊息 | `menu_unfinished_messages` | 管理者 session | 唯讀 | reliability status path |
| 訊息診斷 | 返回開發選單 | Postback | ↩️ 返回開發選單 | `menu_developer` | 管理者 session | 否 | navigation gate |
| 訊息診斷 | 返回主選單 | Postback | 🏠 返回主選單 | `menu_home` | 管理者 session | 否 | navigation gate |
| 待確認資料診斷 | 查看待確認資料 | Postback | 查看待確認資料 | `menu_pending_candidates` | 管理者 session | 唯讀 | `linePendingCandidatesReply` |
| 待確認資料診斷 | 查看訊息來源 | Postback | 查看訊息來源 | `menu_pending_ambient_preview` | 管理者 session | 唯讀、AI=0 | `runAmbientPreview` |
| 系統狀態 | 查看未完成訊息 | Quick Reply Postback | 查看未完成訊息 | `menu_unfinished_messages` | 管理者 session | 唯讀 | `displayText` + reliability handler |
| 系統狀態 | 重新處理 | Quick Reply Postback | 重新處理未完成訊息 | `reliability_recover` | 管理者 session | 受控重排 | 先確認；`manuallyRecoverLineEvents` |
| 系統狀態 | 我已查看 | Quick Reply Postback | 我已查看 | `reliability_acknowledge` | 管理者 session | 只寫查看／Audit metadata | `acknowledgeRetainedLineEvents` |
| 系統狀態 | 返回開發選單 | Quick Reply Postback | 返回開發選單 | `menu_developer` | 管理者 session | 否 | navigation gate |
| 重新處理確認 | 確認重新處理 | Quick Reply Postback | 確認重新處理 | `reliability_recover_confirm&decision=confirm` | 管理者 session | 受控重排 | confirmation handler |
| 重新處理確認 | 先不要 | Quick Reply Postback | 先不要 | `reliability_recover_confirm&decision=cancel` | 管理者 session | 否 | confirmation handler |
| 回覆不確定通知 | 重新顯示 | Postback | 重新顯示 | `reliability_redisplay&notice=...` | 原事件 scope | 只補送回覆 | `handleReliabilityRedisplay` |
| 系統設定 | LINE 接收設定 | Postback | LINE 接收設定 | `menu_line_receive_settings` | 管理者 session | 唯讀 | 不猜測外部 Console 設定 |

### 雞場、雞舍、批次與待確認資料

| 畫面／流程 | 按鈕或 Quick Reply | Action type | 使用者顯示文字 | routing | 權限 | 是否寫資料 | 測試／handler |
|---|---|---|---|---|---|---|---|
| 雞場列表 | 雞場選項 | Quick Reply Postback | 實際雞場名稱 | `menu_farm_summary&farm=...` | 群組成員 | 否 | Resolver scope；Farm runtime |
| 雞場摘要 | 雞舍選項 | Quick Reply Postback | 實際雞舍名稱 | `menu_house_summary&farm=...&house=...` | 群組成員 | 否 | `handleMenuAction` |
| 雞場摘要 | 批次選項 | Quick Reply Postback | 實際批次編號 | `menu_flock_summary&farm=...&flock=...` | 群組成員 | 否 | `handleMenuAction` |
| 今日狀況後續 | 今日死亡／選場查看 | Quick Reply Postback | 今日死亡、選場查看 | `menu_today_mortality` / `menu_farms` | 群組成員 | 否 | `handleMenuAction` |
| 最近異常後續 | 今天／最近7天／最近30天 | Quick Reply Postback | 今天、最近7天、最近30天 | `menu_recent_abnormal_range&days=...` | 群組成員 | 否 | `handleMenuAction` |
| 紀錄完成 | 查看本場 | Quick Reply Postback | 查看本場 | `menu_current_farm_summary` | 群組成員 | 否 | `handleMenuAction` |
| Pending | 選雞場 | Quick Reply Postback | 實際雞場名稱 | `pending_select_farm&farm=...` | 擁有該待確認流程的使用者 | 既有 Pending／Quick Record | `handlePendingFarmPostback` |
| Pending | 選雞舍 | Quick Reply Postback | 實際雞舍名稱 | `pending_select_house&farm=...&house=...` | 擁有該流程的使用者 | 既有 Pending／Quick Record | `handlePendingHousePostback` |
| 待確認資料解析 | 選雞場／選雞舍／選批次 | Quick Reply Postback | 實際雞場、雞舍、批次名稱 | `ambient_select_farm` / `ambient_select_house` / `ambient_select_flock` | 群組授權 | Candidate draft／重新解析 | `handleAmbientPostback` |
| 待確認資料 | 全部紀錄 | Quick Reply Postback | 全部紀錄 | `ambient_confirm_all&candidate=...` | 群組授權 | Candidate→既有正式流程 | `handleAmbientPostback` |
| 待確認資料 | 逐項確認 | Quick Reply Postback | 逐項確認 | `ambient_review&candidate=...` | 群組授權 | 否 | `handleAmbientPostback` |
| 待確認資料 | 修改 | Quick Reply Postback | 修改 | `ambient_candidate_edit&candidate=...` | 群組授權 | Candidate draft | `handleAmbientPostback` |
| 待確認資料 | 取消這筆 | Quick Reply Postback | 取消這筆 | `ambient_candidate_cancel&candidate=...` | 群組授權 | Candidate terminal | `handleAmbientPostback` |
| 待確認資料 | 忽略／稍後處理 | Quick Reply Postback | 忽略、稍後處理 | `ambient_ignore` / `ambient_snooze` | 群組授權 | Candidate workflow | `handleAmbientPostback` |
| 待確認資料欄位 | 改雞場／舍別／批次／數量／事件 | Quick Reply Postback | 對應白話欄位名稱 | `ambient_candidate_field&candidate=...&field=...` | 群組授權 | Candidate draft | resolver／validator |
| 待確認資料選項 | 選擇候選資料 | Quick Reply Postback | 資料摘要 | `ambient_candidate_select&candidate=...` | 群組授權 | 否 | scope／stale check |
| 待確認資料項目 | 紀錄／修改／忽略 | Quick Reply Postback | 紀錄、修改、忽略 | `ambient_item_record` / `ambient_item_modify` / `ambient_item_ignore` | 群組授權 | 依既有 Candidate flow | `handleAmbientPostback` |
| 衝突數量 | 確認數量 | Quick Reply Postback | 確認數量 | `ambient_conflict_quantity` | 群組授權 | Candidate draft | `handleAmbientPostback` |
| 比對結果 | 是已紀錄／不是新增／查看紀錄 | Quick Reply Postback | 是，已紀錄／不是，新增／查看紀錄 | `ambient_reconcile_already` / `ambient_reconcile_new` / `ambient_reconcile_view` | 群組授權 | 依選項 | reconciliation handler |
| 預覽分頁 | 上一頁／下一頁 | Quick Reply Postback | 上一頁、下一頁 | `ambient_preview_page&page=...` | 管理者 session | 唯讀 | preview runtime |
| 預覽 | 摘要 | Quick Reply Postback | 摘要 | `ambient_preview_digest` | 管理者 session | 會進既有摘要流程 | 明確 Action；不是預覽本身 |

### Quick Record、修改與 Daily Review

| 畫面／流程 | 按鈕或 Quick Reply | Action type | 使用者顯示文字 | routing | 權限 | 是否寫資料 | 測試／handler |
|---|---|---|---|---|---|---|---|
| 快速紀錄 | 死亡／淘汰／異常／其他紀錄 | Quick Reply Postback | 死亡、淘汰、健康異常、設備異常、環境異常、災損、其他紀錄 | `quick_record_category&type=...` | 群組成員 | 進既有 Quick Record | Quick Record runtime |
| 快速紀錄 | 數量 | Quick Reply Postback | 死亡1、死亡2、死亡3、死亡5、死亡10、死亡20、其他數量；淘汰同理 | `quick_record_count&type=...&count=...` | 群組成員 | 進既有 Resolver／Validator | Quick Record runtime |
| 快速紀錄 | 異常捷徑 | Quick Reply Postback | 咳嗽、臭腳、白冠、停電、氣溫太高等白話文字 | `quick_record_abnormal&type=...&key=...` | 群組成員 | 既有異常流程 | Quick Record runtime |
| 快速紀錄 | 其他／自訂 | Quick Reply Postback | 其他、自行輸入 | `quick_record_custom&type=...` | 群組成員 | 後續輸入才決定 | Quick Record runtime |
| 快速紀錄 | 下一筆 | Quick Reply Postback | 下一筆 | `quick_record_next` | 群組成員 | 否；要求輸入下一筆 | fallback handler |
| 紀錄完成 | 更正／查看本場 | Quick Reply Postback | 更正剛才、查看本場 | `menu_correction_help` / `menu_current_farm_summary` | 群組成員 | 查詢；更正後才寫 | post-record runtime |
| 修改紀錄 | 改死亡數／取消一筆／改場次／全部取消／查看紀錄／自行更正 | Quick Reply Postback | 對應白話文字 | `correction_action` / `menu_audit` / `quick_record_custom` | 群組成員 | 既有 Correction／Reversal／Move | correction runtime |
| 更正目標 | 目標紀錄 | Quick Reply Postback | 雞場｜事件摘要 | `correction_target&item=...` | 群組成員 | 否 | existing item scope |
| 更正數量 | 新數量／其他 | Quick Reply Postback | 改成1、改成2…、其他 | `correction_quantity&item=...` | 群組成員 | existing Correction | correction runtime |
| 全部取消確認 | 確認全部取消／返回 | Quick Reply Postback | 確認全部取消、返回 | `correction_confirm&decision=...` | 群組成員 | 只在確認時寫 | correction runtime |
| AI 分析 | 預設分析／自行提問／繼續追問 | Quick Reply Postback | 白話問題文字 | `ai_preset` / `ai_custom` / `ai_followup` | 群組成員 | 唯讀 AI | Conversation／AI runtime |
| Daily Review | 更正紀錄／查看待確認／查看詳細 | Quick Reply Postback | 更正紀錄、查看待確認、查看詳細 | `daily_review_correction` / `daily_review_candidates` / `daily_review_detail` | 群組授權 | 查看唯讀；更正走既有流程 | Daily Review runtime |

## 導航優先權

現在的順序是：

```text
LINE event
  -> Postback / Quick Reply structured handler
  -> exact system command
  -> exact navigation semantic layer
  -> active Quick Record / Pending / Correction context
  -> Conversation V2
  -> safe fallback
```

`navigationActionForText()` 對 `返回`、`返回上一頁`、`返回上一層`、`返回主選單`、`主選單`、`選單`、`更多功能`、`管理功能`、`開發選單` 做 exact normalized mapping。由於目前 session 沒有可安全重建的完整上一層 stack，無指定目的地的「返回」採安全回主選單；不猜測、不進 V2。

`scripts/menu-runtime-local.mjs` 的 Open Candidate 測試證明：Pending 狀態前後相同、Candidate mutation=0、官方資料 mutation=0，且沒有 Conversation V2 trace／AI invocation 控制該導航。

## 重複處理唯讀檢查

本輪部署前的 Production SELECT（`2026-08-21T00:00:00Z` 之後）觀察到：

- `line_events`：99 筆。
- retry／redelivery rows：0。
- 尚未完成 rows：0。
- reply problem rows：0。
- delivery attempt 中成功送出：42 筆。

這不能證明真人不會連點，但沒有證據顯示同一 `webhookEventId` 被重複處理。沒有用 debounce 掩蓋問題；既有 event idempotency、semantic lock 與 reply delivery claim 保留不變。

## 檔案與測試

- Action collector：`src/line-action-audit.ts`
- Inventory gates：`src/line-action-audit.test.ts`
- Menu／navigation／URI flow：`src/line-menu.ts`、`src/index.ts`
- Local production-equivalent menu path：`scripts/menu-runtime-local.mjs`
- `npm run check`：248/248 PASS
- Menu runtime：63/63 PASS
- Digest V2：16/16 PASS
- Candidate Repair：15/15 PASS
- Conversation V2 local runtime：26/26 PASS
- Daily Review：9/9 PASS
- Web tests：11/11 PASS
- Web build：PASS

## 真人驗收界線

自動測試沒有取代手機上的 LINE 測試：

- `REAL-LINE-ALL-BUTTONS-VISIBLE-FEEDBACK: PENDING_REAL_REVIEW`
- `REAL-LINE-QUICK-REPLY-VISIBLE-FEEDBACK: PENDING_REAL_REVIEW`
- `REAL-LINE-RETURN-NAVIGATION: PENDING_REAL_REVIEW`

## 本輪 Production 唯讀驗證

- Worker Version：`65445cf4-ca62-4dee-9021-21dde39f3725`，100% traffic。
- `/health`：HTTP 200。
- `/ready`：HTTP 503；目前是 7 筆 retained 仍未結案、1 筆已結案，不是本輪選單修改造成的寫入。
- Cron：`0 1,4,7,10,22 * * *`、`0 13 * * *`、`*/2 * * * *`。
- Queue：`chicken-line-events`，producer=1、consumer=1；source config 維持 batch=10、timeout=0、max retries=3。
- D1 migration：`0028_line_reliability_closeout.sql`，remote migration check 顯示沒有待套用 migration。
- Production D1 SELECT：8 production farms、1 test farm、60 operational、8 abnormal、56 audit、5 ambient buffer、3 Candidate rows（confirmed=1、ignored=1、pending=1）。
- Finance SELECT：allocated `434838.6`、expense `5500`、net `429338.6`。
- 所有遠端核對皆為 `changed_db=false`、`rows_written=0`；本輪沒有 Production official synthetic write。
