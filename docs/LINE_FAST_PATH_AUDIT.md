# LINE Fast Path 唯讀查證

日期：2026-08-23（Asia/Taipei）
專案：`chicken-line-production`
部署 Worker：`849f78b9-c761-45af-b3a6-537b01e6121d`

## 查證結論

目前 LINE webhook 已先驗證簽章，並在回 HTTP 200 前建立 `line_events` durable receipt；但所有一般 durable event（除了密碼續接與「顯示待摘要訊息」診斷）仍會進入 Queue。Queue consumer 以 serial `for ... of` 逐筆 `await processEvent()`，因此固定選單也會承受 Queue 等候。

本輪 Fast Path 只允許三種既有、固定、無業務副作用的回覆：主選單、更多功能、使用說明。它們共用既有 `buildMainMenuFlex`、`buildMoreMenuFlex`、`MENU_HELP_TEXT`、`persistBusinessResponse` 與 `deliverTrackedReply`；不建立第二套 LINE renderer。

## 實際可靠性邊界

```text
LINE webhook
  -> verifyLineSignature
  -> ensureLineEventReceipt
  -> classifyLineFastPath (default deny)
       -> eligible: fast-path business response + tracked reply
       -> otherwise: mark queued + EVENTS.send + serial consumer
```

Fast Path 不取消以下既有機制：

- LINE signature validation
- `webhookEventId` / `reliabilityEventIdFor` 去重
- `correlation_id`
- `line_events` lifecycle、business/reply separation
- `reply_payload_json`
- reply delivery lease、delivery attempts、LINE HTTP outcome
- retry、recovery、retained metadata、delayed reply notice
- `notificationDisabled = true`

Fast Path 若在 business completion 前失敗，會把同一 event 轉回既有 Queue 路徑；若 business 已完成，禁止重新執行 full business path，只保留既有 reply-only recovery 邏輯。

## Action → current route → eligibility

| Action / 使用者操作 | Action 類型 | 目前實際 route（修改前） | 目前是否需要 Queue | 讀／寫 | AI | 狀態／權限依賴 | Fast Path | 理由 |
|---|---|---|---|---|---|---|---|---|
| `選單`、`功能選單` | Message | `processEvent` → `handleCommand` → `buildMainMenuFlex` | 是 | 純讀 | 否 | 不需群組資料；主選單固定 | ALLOW | 固定公開內容，沒有業務查詢或 mutation |
| `menu_home`、`返回`、`返回上一頁`、`返回主選單` | Postback / Message | `processEvent` → `handleLinePostback`／`handleCommand` → `handleMenuAction(menu_home)` | 是 | 純讀 | 否 | 導覽；Candidate 不應攔截 | ALLOW | 固定公開主選單，使用既有 builder |
| `menu_more`、`更多功能` | Postback / Message | `processEvent` → `handleLinePostback`／navigation layer → `handleMenuAction(menu_more)` | 是 | 純讀 | 否 | 導覽；Candidate 不應攔截 | ALLOW | 固定公開更多功能，使用既有 builder |
| `menu_help`、`使用說明` | Message／可能的 Postback | `processEvent` → `handleCommand` → `handleMenuAction(menu_help)` | 是 | 純讀 | 否 | 固定文字 | ALLOW | `MENU_HELP_TEXT` 為固定說明，不需 D1 business query |
| `快速紀錄` | Message | `processEvent` → `handleCommand` → Quick Record | 是 | 可能寫入 | 否／後續可能 AI | session、Pending、Resolver | DENY | 後續可能建立正式資料 |
| `今日狀況`、`最近異常`、`變更紀錄`、`待確認資料` | Message／Postback | `handleMenuAction` → D1 query／Candidate | 是 | 讀取資料 | 依功能 | organization、Candidate、D1 | DENY | 查詢不是固定內容，避免誤把狀態查詢當靜態回覆 |
| `雞場與批次`、雞場／雞舍／批次選擇 | Message／Postback | `handleMenuAction`／Resolver | 是 | 讀取資料／流程狀態 | 否 | organization、Resolver、Quick Record | DENY | 依實際 D1 與授權資料 |
| `系統狀態`、訊息診斷、未完成訊息 | Message／Postback | reliability read paths | 是 | 讀取維運資料 | 否 | 管理者 session | DENY | 管理功能與 reliability 狀態，不屬公開固定內容 |
| `重新處理`、`我已查看`、恢復確認 | Postback | reliability mutation／recovery | 是／scheduled recovery | 寫 metadata | 管理者 | Admin Auth | DENY | 具副作用，必須保留既有安全流程 |
| Candidate、Pending、Quick Record、Correction、Daily Review actions | Postback／Quick Reply | 各既有 workflow handler | 是 | 草稿或正式 mutation | 依流程 | user/session/resolver | DENY | 任何業務語意或狀態依賴一律留在 Queue |
| `摘要`、Ambient preview/digest | Message／Postback | Ambient preview／digest pipeline | 是或 supervised path | 會讀／可能建立 Candidate | 可能 | lease、buffer、Candidate | DENY | 不可繞過 Ambient lease 與 Candidate pipeline |
| AI 分析／Conversation V2 | Message／Postback | V2 planner、tools、composer | 是 | 唯讀但複雜 | 是 | Farm、session、AI | DENY | 本輪不改 Conversation V2 |
| 管理／開發／技術資訊／管理網頁 | Postback | Admin session／Web link | 是 | 讀取或管理 | 否 | Admin Auth | DENY | 權限判斷不可從 Fast Path 移除 |
| unknown Postback | Postback | `parseLinePostback` fail／safe reply | 是 | 純讀 | 否 | 不明 | DENY | 白名單預設拒絕，避免新 action 意外快速化 |

## 完整 Action inventory 基線

現有 `src/line-action-audit.test.ts` 對 static Flex、Quick Reply 與 reliability redisplay action 的 inventory 輸出為：

- clickable actions：195
- Postback：182
- Message：12
- URI：1
- Datetime Picker：0
- missing handler：0
- visible feedback regression：0

這 195 個 action 的既有完整 UI／handler 對照保留在 `docs/LINE_ACTION_AUDIT.md`。本輪只把上表列出的公開固定操作分流；其餘 action 預設仍走 Queue。

## Source evidence

- signature：`src/index.ts` 的 `/webhook/line` path，`verifyLineSignature` 成功後才解析事件。
- receipt：`src/index.ts` webhook path → `ensureLineEventReceipt`；底層為 `src/reliability.ts`。
- Queue：`src/index.ts` webhook path → `markLineEventQueued` → `env.EVENTS.send({ eventId, correlationId })`。
- serial consumer：`src/index.ts` `queue()` 內 `for (const message of batch.messages) { await processEvent(...); message.ack(); }`。
- business/reply split：`persistBusinessResponse` → `markBusinessCompleted`；`deliverTrackedReply` → reply lease、delivery attempt、LINE result、`markReplyCompleted`。
- navigation precedence：`navigationActionForText` 與 `handleCommand` 在 Candidate／V2 前處理。
- V2 trace：只在 `handleConversationOrchestratorV2Input` 的 AI-first 路徑產生；固定導航不應呼叫 AI。

## Phase 0 scope decision

本輪不改 Queue binding、batch、timeout、retries、Cron、migration 或 AI model。Fast Path 使用既有 `line_events` 欄位完成 timing：`received_at`、`processing_started_at`、`business_completed_at`、`reply_attempted_at`、`reply_completed_at`；另外以 structured log 記錄 Fast Path 選擇、fallback 與完成結果。沒有新增 schema。

## 實作與部署結果

- `npm run check`：TypeScript + Vitest `269/269 PASS`。
- Fast Path local runtime：`12/12 PASS`。
- Fast Path、Action inventory、reliability targeted tests：`47/47 PASS`。
- 既有 local runtime：Menu `63/63`、Quick Record `25/25`、Quiet/Ambient `24/24`、Manual Ambient `28/28`、Scheduled Ambient `5/5`、Digest V2 `16/16`、Candidate Repair `15/15`、Daily Review `9/9`、Conversational Preview `11/11`、Conversation V2 `26/26`，全部 PASS。
- `wrangler deploy --dry-run`：PASS；migration：NONE；Queue、Cron、AI model 未改。
- Production deployment：`849f78b9-c761-45af-b3a6-537b01e6121d`，100% traffic。
- `/health`：HTTP 200。
- `/ready`：HTTP 503，原因仍是歷史 7 筆未結案 retained；`actionableUnfinishedCount=0`、卡住 0、最近回覆問題 0。本輪沒有替它們做任何處理。

## 真人 LINE 安全測試

測試群組：`++開發++金雞協會Ai助手測試頻道++`。時間窗：2026-08-23 12:36–12:39（Asia/Taipei）。只送出選單、更多功能、返回主選單、使用說明，並實際點擊「更多功能」與「返回主選單」；沒有建立正式營運資料。

Production `line_events` 唯讀結果：59 筆測試事件全部為 `reply_completed / completed / sent`，全部 `queued_at IS NULL`，沒有 error；`conversation_v2_traces` 時間窗為 0 筆。這證明固定導航沒有進 Queue 或 Conversation V2。

59 筆的 LINE reply HTTP 結果全部為 `200`。整體階段分解如下；`receipt_to_processing` 包含 receipt 完成後到 Fast Path 開始前可由既有欄位觀察到的時間，`reply_delivery_and_finalization` 包含 LINE API 呼叫及最後的 D1 完成標記，現有 schema 尚未把兩者再拆成獨立 request-start/request-end 欄位：

| 階段 | p50 | p95 | max |
|---|---:|---:|---:|
| receipt → processing | 551ms | 648ms | 694ms |
| business completion | 225ms | 260ms | 365ms |
| reply claim → API 前 | 169ms | 212ms | 256ms |
| reply delivery + finalization | 431ms | 512ms | 628ms |
| 全部 | 1.374s | 1.591s | 1.732s |

以 `received_at → reply_completed_at` 計算的 server-side 結果如下；p95 使用 nearest-rank 定義：

| 操作 | 樣本 | p50 | p95 | max |
|---|---:|---:|---:|---:|
| 選單 | 18 | 1.418s | 1.540s | 1.540s |
| 更多功能 | 13 | 1.353s | 1.684s | 1.684s |
| 返回主選單 | 13 | 1.346s | 1.732s | 1.732s |
| 使用說明 | 13 | 1.375s | 1.591s | 1.591s |
| Postback（更多／返回） | 2 | 1.299s | 1.370s | 1.370s |

本機 LINE Desktop 的截圖觀察可確認回覆實際出現在聊天室；但 Computer Use 的畫面擷取不是 LINE client event timestamp，不能宣稱毫秒級 client-visible latency。以上正式延遲數字只採用 Production durable lifecycle timestamp。

## Production 資料安全核對

部署前後唯讀核對未發現正式資料變更：

- operational events：`60 → 60`
- abnormal events：`8 → 8`
- audit logs：`56 → 56`
- Finance：`434838.6 / 5500 / 429338.6` 不變
- 本輪 Production official synthetic writes：`0`

`line_events` 會因真人安全測試留下正常的接收／回覆歷史，這不是 official operational write；測試事件沒有 Candidate、正式紀錄或 AI trace。

## 白名單統計定義

- Fast Path allowlisted action identities：3（`menu_home`、`menu_more`、`menu_help`）。
- 具體可觸發形式：公開 exact message/navigation forms，加上無狀態的 `menu_home`、`menu_more`、`menu_help` Postback。
- 其餘 action：預設 Queue；unknown action 的 Fast Path 命中數：0。
- 原始 clickable inventory：195；本輪未改 routing key、displayText、Quick Reply handler 或 Queue 設定。
