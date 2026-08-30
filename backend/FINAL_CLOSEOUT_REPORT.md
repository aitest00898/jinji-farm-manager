# 最終交付收尾結果

日期：2026-08-22（Asia/Taipei）

## 1. 最終結論

能由 Codex 安全完成的收尾工作已完成並部署：排程、Weather 自動工作移除、Ambient 推送邊界、一般／管理／開發選單分層、白話中文、既有授權、Web Pages 證據與回歸測試均已核對。

但這不是 `FULL-PROJECT-PASS`。8 筆歷史保留訊息仍需要管理者本人按「我已查看」，LINE Developers Console 的 Webhook 訊息重送設定仍需要本人確認，LINE 手機上的最後選單與恢復驗收也尚未由真人完成。

## 2. 修改內容

- Cron：Ambient 改為每天 5 個台灣時段；Daily Review 改為 21:00；保留每 2 分鐘恢復。
- Push：排程 Ambient 只推本輪新建立的可處理資料或到期 Snooze 提醒，不重推舊待確認資料。
- Daily Review：21:00，統計台灣當日 00:00–21:00；待確認資料獨立列出。
- Weather：移除排程 Weather；保留互動查詢雲林天氣。
- LINE Menu：一般主選單／更多功能不再露出管理與開發入口；舊 exact text 仍相容，但再次驗證管理權限。
- Web：確認 GitHub Pages 已由既有 workflow 發布；本輪不需無意義地新增 Pages commit。
- 本地測試：只修正 Manual Ambient 測試 fixture 的 stale synthetic official rows 清理，不改 Production business logic。

## 3. 修改前／修改後 Cron

| 功能 | 修改前 | 修改後 UTC | Asia/Taipei | Push／行為 |
|---|---|---|---|---|
| Ambient 整理 | `0 * * * *` | `0 1,4,7,10,22 * * *` | 06:00、09:00、12:00、15:00、18:00 | 只有新 actionable Candidate 或到期 Snooze 才推 |
| Daily Review | `30 12 * * *` | `0 13 * * *` | 21:00 | 今日總覽；無人回覆不修改 |
| 訊息恢復 | `*/2 * * * *` | `*/2 * * * *` | 每 2 分鐘 | 只恢復可靠性事件 |
| Weather 自動工作 | 舊 hourly branch | 已移除 | — | 互動查詢保留 |

Production deploy output 實際註冊的三條 Cron 正是上述三條。

## 4. Push 節省結果

Ambient 排程檢查由每天 24 次降為每天 5 次，減少 `19/24 = 79.2%` 的檢查次數。沒有新來源、沒有新 Candidate、已經正式紀錄、或只有舊的 open Candidate 時，不送排程 Ambient Push。Daily Review 與每 2 分鐘恢復是不同工作，不計入 Ambient 的 5 次。

## 5. Weather

- Scheduled Weather：removed。
- Interactive 雲林天氣：retained。
- `src/weather.ts` 仍提供互動查詢；`executeScheduledJob()` 不再執行 Weather branch。

## 6. LINE 選單

一般使用者主選單保留：

`快速紀錄`、`今日狀況`、`雞場與批次`、`最近異常`、`修改紀錄`、`雲林天氣`、`AI 分析`、`更多功能`。

「更多功能」目前只放待確認資料、歷史紀錄、使用說明、返回主選單；不放管理功能或開發選單。

管理者可使用既有授權後輸入 `管理功能` 或 `開發選單`，也可從已授權的管理入口進入。開發選單包含系統狀態、訊息診斷、待確認資料診斷、測試工具、系統設定、技術資訊，以及返回路徑。未授權者只會收到「這個功能只有管理者可以使用」，不會看到技術內容。

Backend authorization 仍由既有 admin session／群組與使用者範圍判斷；沒有新增另一套密碼或匿名 recovery 入口。

## 7. Web Pages

- Repository：<https://github.com/aitest00898/jinji-farm-manager>
- Branch：`main`
- Commit：`f4813004ea8b4a5d684a12697a84a3639c6ef481`
- Deployment：既有 GitHub Actions Pages workflow
- Successful run：<https://github.com/aitest00898/jinji-farm-manager/actions/runs/32343936197>
- Live URL：<https://aitest00898.github.io/jinji-farm-manager/>
- Live HTTP：200
- Live evidence：目前公開 bundle 已包含 `日常營運`、`財務管理`、`分析與稽核`、`系統管理` 分組。

這表示 Pages 已發布；舊文件中「沒有 Pages publish」的段落是歷史快照，已由最新證據段落取代。

## 8. 自動測試

| Suite | 結果 |
|---|---:|
| TypeScript `tsc --noEmit` | PASS |
| Vitest | 244/244 PASS |
| Menu runtime | 59/59 PASS |
| Quick Record runtime | 25/25 PASS |
| Quiet / Ambient runtime | 24/24 PASS |
| Manual Ambient runtime | 28/28 PASS |
| Scheduled Ambient runtime | 5/5 PASS |
| Digest V2 runtime | 16/16 PASS |
| Candidate Repair runtime | 15/15 PASS |
| Daily Review runtime | 9/9 PASS |
| Conversational Preview runtime | 11/11 PASS |
| Conversation V2 final-response E2E | 21/21 PASS |
| Reliability fault injection | 21/21 PASS |
| Web UI Vitest | 8/8 PASS |
| Web build | PASS |
| Wrangler dry-run | PASS |

Manual Ambient 曾因同一個本地測試群組留下 2199 年合成正式列而失敗；清理僅標示該類 stale local synthetic rows 為失效，重跑 28/28。沒有清理 Production 資料，也沒有改產品 reconciliation 規則。

## 9. Production

| 項目 | 最新結果 |
|---|---|
| Worker | `cb912c8e-7448-4732-b42d-aa472ee5cf97` |
| Traffic | 100% |
| `/health` | HTTP 200 |
| `/ready` | HTTP 503；8 筆歷史保留訊息待管理者查看；stalled=0、retrying=0、delivery uncertain=0、reply failure=0 |
| Migration | 0001–0028；0028 最新；remote 無待套用 migration |
| Cron | `0 1,4,7,10,22 * * *`; `0 13 * * *`; `*/2 * * * *` |
| Queue | `chicken-line-events`; producer=1、consumer=1；batch=10、timeout=0、max retries=3 |
| Farms | production=8、test=1 |
| Ambient | processed=8、buffered=0 |
| Candidate | pending=1、ignored/cancelled=1 |
| Audit | 30 |
| Finance | allocated 434838.6 / expense 5500 / net 429338.6 |
| AI | `@cf/meta/llama-3.2-3b-instruct` unchanged |
| LINE outbound | `notificationDisabled=true` |
| Remote official synthetic writes | 0 |

D1 read-only verification 的 `rows_written=0`、`changed_db=false`。Daily Review `2026-08-21` row 存在，狀態 `sent`、1 次嘗試、沒有 lease、沒有 error。原始 environment breakdown 顯示既有 52 operational／3 abnormal rows 都掛在 test environment；這是既有資料分類觀察，沒有在本輪重新標記或寫入。

## 10. 8 筆 retained

8 筆歷史訊息目前保留、不刪除、不假裝已送達，也不代為按「我已查看」。因原始保存期限已過，這些資料不能安全重新播放；Web 系統狀態頁可讓管理者查看並確認管理 metadata。按下後不會刪除 `line_events`、不會修改正式營運資料。

## 11. LINE Webhook redelivery

`PENDING_HUMAN_SETTING`。

程式已保存 event id 並支援重送去重，但 LINE Developers Console 的 redelivery 開關不能由 Worker 自己證明或修改；需要管理者到 LINE Developers Console 人工確認，不能把未知狀態寫成 false 或 true。

## 12. 真人 LINE 驗收

以下仍是 `PENDING_REAL_REVIEW`：

- 主選單與更多功能分層。
- 管理者／一般使用者權限差異。
- 開發選單與訊息診斷導航。
- 系統狀態、延遲回覆與恢復提示。
- `顯示待摘要訊息` 的開發者預覽。

## 13. 最短真人驗收清單

1. 管理者先到 Web「系統狀態」查看 8 筆保留訊息；若確認已了解，再按「我已查看」。
2. LINE 輸入 `選單`：一般帳號確認「更多功能」沒有管理／開發按鈕。
3. 管理者輸入 `開發選單`：確認可進入；一般帳號輸入同文字只得到管理者提示。
4. 管理者進「系統狀態」與「訊息診斷」：只讀查看，不建立事件、不跑摘要。
5. 到 LINE Developers Console 確認 Webhook 訊息重送設定。

不要用 Production 建立合成死亡或異常事件；需要實際操作時只使用 Test Farm，並把結果標為真人驗收。

## 14. 所有剩餘未完成工作

| 項目 | 狀態 | 原因 | 誰能完成 | 下一步 |
|---|---|---|---|---|
| 8 筆歷史保留訊息 | PENDING_HUMAN_ACKNOWLEDGEMENT | 需要本人確認，Codex 不代按 | 管理者 | Web「系統狀態」→「我已查看」 |
| LINE redelivery 設定 | PENDING_HUMAN_SETTING | Console 狀態不在 Worker 可證明範圍 | LINE Console 管理者 | 到 LINE Developers Console 查看並記錄 |
| 真人 LINE 選單／開發授權 | PENDING_REAL_REVIEW | 自動測試不能代替手機操作 | 管理者／真人使用者 | 執行第 13 節清單 |
| 既有事件的 test environment 分類 | OPEN DATA OBSERVATION | D1 原始 join 顯示 52/3 rows 掛 test；本輪不擅自重標 | 產品資料管理者 | 另立資料分類審查，不在本輪改資料 |
| 舊報告中的 NOT_DEPLOYED／舊 Worker 快照 | RESOLVED | 最新部署與 Pages evidence 已補於最新章節 | Codex | 以最新章節為準 |
| Production source TODO/FIXME | NOT_FOUND IN SCANNED SOURCE | 最終掃描未發現可執行的 TODO/FIXME | — | — |

## 15. 已知風險

1. D1 在 durable receipt 寫入前完全不可用時，Worker 不會假裝成功；後續是否由 LINE 平台重送仍依 Console／平台行為。
2. 原始 payload 超過 24 小時後只能保留 metadata，不能安全重播原文。
3. LINE reply token 失效時可避免重複正式寫入，但不能保證原始 token 仍能回覆。
4. `/health=200` 只代表 Worker 活著；目前應以 `/ready` 與管理狀態頁判斷可用性。
5. 真人手機驗收尚未完成。

## 16. 最終 Gate

| Gate | 狀態 |
|---|---|
| WORKER-PRODUCTION | PASS |
| WEB-PAGES | PASS |
| AUTOMATED-TESTS | PASS |
| PRODUCTION-READONLY-VERIFICATION | PASS |
| LINE-REAL-REVIEW | PENDING |
| HUMAN-CONSOLE-SETTING | PENDING_HUMAN_SETTING |
| FINAL-PROJECT-CLOSEOUT | AUTOMATED-CLOSEOUT-PASS；不是 FULL-PROJECT-PASS |

### 最終 PENDING 掃描分類

- `PENDING_REAL_REVIEW`：真人 LINE／手機選單、權限、診斷、恢復驗收；刻意保留。
- `PENDING_HUMAN_SETTING`：LINE Developers Console redelivery；刻意保留。
- `PENDING_HUMAN_ACKNOWLEDGEMENT`：8 筆 retained；刻意保留，未代為操作。
- 舊文件的 `NOT_DEPLOYED` Pages 敘述：已由最新 GitHub Actions／公開網址證據解決。
- 一般程式內的 `pending`：是 Quick Record／Candidate 等正常工作狀態，不是未完成的交付工作。
- `TODO`／`FIXME`：本次掃描未找到可執行項目。
