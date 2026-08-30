# LINE / Web 功能分級與權限盤點

**範圍：** 一般場務、管理功能、開發／維運功能的分層收尾
**程式來源：** `src/line-menu.ts`、`src/core.ts`、`src/index.ts`、`src/reliability.ts`、`src/web-api.ts`、`web/src/App.tsx`
**Migration：** NONE
**Production baseline：** Worker `a082eaba-0be9-45a7-a044-83ae657f8897`（100% traffic）

## 分層結論

| 層級 | 使用者 | 內容 | 寫入性質 |
|---|---|---|---|
| 一般場務 | 所有已授權群組成員 | 快速紀錄、今日狀況、雞場與批次、最近異常、修改紀錄、雲林天氣、AI 分析、待確認資料 | 依原本 Quick Record／更正流程；查詢本身唯讀 |
| 管理功能 | 有效 LINE 管理者 session；Web 則需現有管理登入 | 財務摘要、管理網頁、資料管理入口 | 查詢唯讀；Web 編修沿用登入 session，仍受既有驗證、業務規則與 Audit 保護 |
| 開發功能 | 有效 LINE 管理者 session；未來可再拆 Developer role | 系統狀態、訊息診斷、待確認資料診斷、測試工具、系統設定、技術資訊 | 診斷唯讀；「我已查看」只寫管理 metadata；恢復受既有授權、重試與 Audit 約束 |

## 一般使用者 LINE 主選單

`buildMainMenuFlex()`（`src/line-menu.ts`）現在固定 8 個入口：

1. 快速紀錄 → `快速紀錄`
2. 今日狀況 → `今日狀況`（保留 `今日營運` 相容文字）
3. 雞場與批次 → `雞場與批次`（保留 `場次／批次` 相容文字）
4. 最近異常 → `最近異常`
5. 修改紀錄 → `修改紀錄`（保留 `更正紀錄` 相容文字）
6. 雲林天氣 → `雲林天氣`
7. AI 分析 → `AI分析`（保留 `AI營運分析` 相容文字）
8. 更多功能 → `menu_more`

主選單不放系統狀態、尚未整理訊息、未完成訊息、恢復、測試場管理、技術版本、Migration、Queue 或 AI 模型。

## 更多功能

`buildMoreMenuFlex()`（`src/line-menu.ts`）只放現有功能：

| 顯示 | 事件 | 權限 | 性質 |
|---|---|---|---|
| 待確認資料 | `待確認資料` | 群組授權 | 讀取既有待確認資料；不新增 Candidate |
| 歷史紀錄 | `歷史紀錄`（`變更紀錄`相容） | 群組授權 | 讀取既有歷史／變更紀錄 |
| 使用說明 | `使用說明` | 群組授權 | 一般白話說明；不列技術或管理指令 |
| 返回主選單 | `menu_home` | 群組授權 | 導航 |

「管理功能」與「開發選單」不再顯示在一般「更多功能」；管理者可直接輸入 exact 文字進入，後端仍會再次檢查管理者 session。管理網頁 URI 位於管理功能內，不讓普通使用者把後台誤認成日常功能。

## 管理功能

`buildManagementMenuFlex()`（`src/line-menu.ts`）目前只有真正存在的入口：

- 財務摘要 → `menu_finance`；每次路由都呼叫 `hasLineAdminSession()`，未授權只回「這個功能只有管理者可以使用。」
- 管理網頁 → 既有 Web URI；Web 仍由既有登入／session／管理權限保護。
- 返回更多功能、返回主選單 → 純導航。

`歷史紀錄`保留在一般「更多功能」作為營運查詢；`變更紀錄`仍保留為相容文字，不在管理頁重複放一個相同入口。

## 開發選單

`buildDeveloperMenuFlex()`（`src/line-menu.ts`）最多六個主要入口：

| 子選單 | Postback | 權限 | 目前 backend 行為 |
|---|---|---|---|
| 系統狀態 | `menu_system_status` | 管理者 session | 讀取可靠性狀態與未完成數量；不改正式資料 |
| 訊息診斷 | `menu_message_diagnostics` | 管理者 session | 進入診斷子選單 |
| 待確認資料診斷 | `menu_pending_diagnostics` | 管理者 session | 查看資料狀態／來源入口 |
| 測試工具 | `menu_test_tools` | 管理者 session | 目前只提供查看測試場資料；沒有直接建立事件的按鈕 |
| 系統設定 | `menu_settings` | 管理者 session | 進入 LINE 接收設定說明；不假裝能修改 LINE Developers Console |
| 技術資訊 | `menu_technical_info` | 管理者 session | 顯示服務、模式、模型、排程與重試設定；不顯示 secret、token、完整 user id 或 raw payload |

所有子選單都有返回開發選單、返回更多功能或返回主選單。每個危險或管理 Postback 都在 `handleMenuAction()` 再次檢查 session，不依賴「使用者能看到按鈕」作為安全邊界。

### 訊息診斷

- 查看尚未整理訊息 → 既有 `runAmbientPreview()`；讀取 `ambient_chat_buffer`，AI calls=0、Candidate mutation=0、official mutation=0。
- 查看未完成訊息 → 讀取 `line_events` 的未完成狀態，只顯示短編號、時間與白話狀態，不顯示訊息內容。
- 沒有 backend 的「最近處理問題」本輪不建立假按鈕。

既有 exact command `顯示待摘要訊息` 仍保留，但已經過同一個管理者 session 檢查；未授權使用者只得到白話拒絕，不會看到診斷資料。真正的 command parsing 仍在 `src/core.ts:298-301`，純讀取 shortcut 在 `src/index.ts:7307-7350`。

### 可靠性操作

- `重新處理` 只有 `actionableUnfinishedCount > 0` 時顯示。
- 過期內容不會顯示可恢復按鈕。
- 執行前先顯示「只會重新處理目前仍可恢復的訊息，不會重做已完成的紀錄。」並要求確認。
- `我已查看` 只更新保留訊息的 acknowledgement metadata，另寫既有 Audit；不刪除 `line_events`、不改正式事件。
- LINE 入口呼叫 `manuallyRecoverLineEvents(..., "line_admin")`；Web 入口維持 `web_admin`，共用同一可靠性服務。

## Exact command 與 Message Action inventory

`src/core.ts:parseCommand()` 保留既有相容文字，並將新的顯示文字接到同一 handler：

| 類別 | exact text / pattern | 目前分類 |
|---|---|---|
| 導航 | `選單`、`功能選單` | 一般入口 |
| 一般場務 | `快速紀錄`、`今日營運`／`今日狀況`、`場次／批次`／`雞場與批次`、`最近異常`、`更正紀錄`／`修改紀錄`、`雲林天氣`、`AI營運分析`／`AI分析` | 一般場務 |
| 一般查詢 | `待確認資料`、`歷史紀錄`（`變更紀錄`相容）、`使用說明` | 更多功能 |
| 管理／診斷 | `系統狀態`、`顯示待摘要訊息` | 保留相容性；每次需要管理者 session |
| 管理／開發入口 | `管理功能`、`開發選單` | 保留 exact 文字；每次需要管理者 session；不放一般選單 |
| 摘要 | `摘要` | 既有 Ambient Digest；不等於診斷預覽 |
| 測試 | `測試場列表` | 保留相容性；需要管理者 session |
| 管理操作 | `新增／建立／封存／刪除`雞場、測試場、雞舍、批次等既有文字 | 保留既有 parser、管理密碼、Resolver、Validator、Business Logic、Audit；不放入一般選單 |

Postback allowlist 仍集中在 `MENU_ACTIONS`（`src/line-menu.ts`），新的導航 action 沒有取代既有 Quick Record、Candidate、Correction、Daily Review、Ambient 或可靠性 action。所有 visible `displayText` 與 internal `data` 仍分開，沒有改動既有 routing key。

## Web 管理台分層

`web/src/App.tsx:NAV_GROUPS` 將既有頁面分成：

- 一般場務：總覽、營運紀錄、雞場、批次、趨勢分析、提醒、待確認資料。
- 資料管理：組織、飼養者、雞舍、財務、股權、名稱解析、變更紀錄。
- 系統維護：資料檢查、系統狀態、訊息診斷、待確認資料診斷、測試工具、系統設定、技術資訊。

Web 的登入、session、組織範圍與 `web_admin` Audit 沿用 `src/web-api.ts`。登入後的編修與可靠性管理沿用有效 Web session，不再要求每次操作重新輸入管理密碼；「重新處理」與「我已查看」仍由既有授權、可靠性服務與 Audit 保護。

### LINE 管理／開發功能與 Web 對應

| LINE 入口 | Web 對應 | 性質 |
|---|---|---|
| 財務摘要 | 資料管理 → 財務 | 唯讀 |
| 管理網頁 | 直接進入本 Web 管理台 | 導航 |
| 系統狀態 | 系統維護 → 系統狀態 | 唯讀；恢復／查看沿用既有授權 |
| 查看未完成訊息 | 系統維護 → 系統狀態 → 查看未完成訊息 | 唯讀 |
| 重新處理未完成訊息 | 系統維護 → 系統狀態 → 重新處理 | 登入後由管理者執行；仍受既有授權、可靠性規則與 Audit 保護 |
| 我已查看 | 系統維護 → 系統狀態 → 我已查看 | 只更新查看標記並留下 Audit |
| 查看尚未整理訊息 | 系統維護 → 訊息診斷 | 唯讀；不呼叫 AI、不消耗來源 |
| 待確認資料診斷 | 系統維護 → 待確認資料診斷 | 唯讀；包含來源摘要與不一致提示 |
| 測試工具 | 系統維護 → 測試工具 | 只讀測試雞場／雞舍／批次 |
| LINE 接收設定 | 系統維護 → 系統設定 | 只顯示需到 LINE Developers 確認，不假裝可修改 |
| 技術資訊 | 系統維護 → 技術資訊 | 顯示必要設定，不顯示 secret、token 或 raw payload |

新增 Web API：`/api/ambient/preview`、`/api/pending-candidates`、`/api/test-tools`、`/api/technical-info`。這些端點都先通過既有 Web session；診斷端點為 read-only。Ambient 預覽與待確認資料支援分頁，避免靜默截斷。

## 白話中文檢查

| 原本／內部說法 | 使用者看到的說法 |
|---|---|
| Open Candidate | 待確認資料 |
| Candidate | 待確認資料 |
| Ambient Source | 尚未整理的群組訊息 |
| buffered | 尚待整理 |
| processed | 已完成整理 |
| candidate-like | 可能與營運有關 |
| prefilter-excluded | 目前判定與營運無關 |
| Queue degraded | 目前有些訊息處理比較慢 |
| Retrying failed event | 正在重新處理剛才沒有完成的訊息 |
| Quarantined message | 這筆訊息多次處理失敗，已先保留 |
| conflict | 資料不一致 |
| blocking | 目前還不能完成 |
| non-blocking | 不影響目前紀錄 |
| retry | 自動再試 |
| retained | 已保留待處理 |
| ignored | 已忽略 |
| cancelled | 已取消 |
| error | 發生問題 |
| stalled | 有訊息卡住 |
| recovery | 恢復處理 |
| Audit 載入失敗 | 變更紀錄載入失敗 |

技術資訊頁是刻意的管理／開發例外；一般主選單、更多功能、診斷摘要與使用說明不要求使用者理解英文系統名詞。

## 安全與保留範圍

- 沒有新增 secret、token、密碼或新的登入機制。
- 沒有把診斷 command 改成會跑 AI 摘要；預覽仍是 read-only。
- 沒有提供 Production 故障注入或直接建立正式事件的測試按鈕。
- 沒有新增 migration；選單狀態不寫 D1，沿用既有 session 與 Postback data。
- 沒有改 Finance、Weather、Conversation V2、Ambient、Daily Review、Queue 設定或 0028 schema。
- Production 驗證只應使用 health、ready、deployment、menu payload、權限與既有資料的 read-only 證據；正式 synthetic writes 保持 0。

## 本輪全 Action 可見回饋稽核（最新）

本輪以 `src/line-action-audit.ts` 遞迴收集所有目前 Production menu／Quick Reply builder，並另納入 runtime 可靠性「重新顯示」Action：

| 類型 | 數量 | 可見回饋規則 |
|---|---:|---|
| Flex Postback | 28 | 全部 `displayText` |
| Flex Message Action | 12 | 全部 `text` |
| Flex URI | 1 | 前一步 `管理網頁` Postback 可見；URI 為第二步 |
| Quick Reply Postback | 153 | 全部 `displayText` |
| runtime-only Postback | 1 | `重新顯示` `displayText` |
| **總計** | **195** | **FAIL=0、handler gap=0、內部 routing 文字外洩=0** |

`menu_web` 不再是沒有 handler 的直接 URI：第一步是受管理者授權保護的 `menu_web` Postback，聊天室會留下「管理網頁」；第二步才送出原本的 Web URI。既有 URL、登入與 Web 權限不變。

`返回`、`返回上一頁`、`返回上一層`、`返回主選單`、`選單`、`更多功能`、`管理功能`、`開發選單` 由 `navigationActionForText()` exact mapping，在 Conversation V2 前處理。Open Candidate 不會吞掉導航。

完整 matrix 與 production-equivalent evidence 見 [`docs/LINE_ACTION_AUDIT.md`](./LINE_ACTION_AUDIT.md)。

## 驗證證據

- TypeScript + Vitest：`244/244 PASS`（本輪 source check）。
- LINE menu local runtime：`56/56 PASS`；包含主選單、更多功能分層、未授權開發入口、未授權系統狀態、管理者開發導航、測試工具唯讀與既有 Postback whitelist。
- Conversational preview local runtime：`11/11 PASS`；包含未授權拒絕、管理者預覽、mention 預覽、無 AI／無 D1 狀態變更、分頁、過期診斷與重複預覽。
- Web UI Vitest：`8/8 PASS`；包含三組導覽分層與一般標籤不含技術術語。
- Web build：PASS。
- Wrangler dry-run：PASS；部署後 Worker `a082eaba-0be9-45a7-a044-83ae657f8897`，三個既有 Cron 均保留。
- Production read-only：`/health` HTTP 200；`/ready` HTTP 503（8 筆既有歷史保留訊息尚未由管理者查看）；D1 SELECT `rows_written=0`。
- 真人手機／LINE Rich Menu 點擊驗收：`PENDING_REAL_REVIEW`，不能由上述自動測試代替。

## FINAL CLOSEOUT DEPLOYMENT EVIDENCE

本輪最新 Worker：`cb912c8e-7448-4732-b42d-aa472ee5cf97`，100% traffic；`/health` HTTP 200。Menu runtime 為 `59/59 PASS`，並實際驗證：一般使用者更多功能沒有管理／開發按鈕、未授權輸入「開發選單」只得到管理者提示、已授權管理者可進入管理功能與開發選單，開發選單可進訊息診斷與測試工具。

管理者看到的 `/ready` 注意狀態仍是 8 筆歷史保留訊息待查看；本輪沒有代按「我已查看」，也沒有建立 Production 測試資料。真人選單點擊仍為 `PENDING_REAL_REVIEW`。
