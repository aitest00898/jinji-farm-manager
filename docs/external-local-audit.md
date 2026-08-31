# 金雞協會助理 Ai — 本地外部稽核環境

## Purpose

這個分支提供一個可交給外部稽核者操作的 local-only Web preview。它沿用現有 Web App、components、routes 與 API contract，但所有資料由 deterministic in-memory adapter 提供。

這不是 Production mirror，也不是 Production runtime proof。

- 五個雞場、九個雞舍、八個批次、六位 active 飼養者、營運/異常/財務/可靠性資料全部為 synthetic fixture。
- 五場各有唯一目前主要飼養者；烏骨三場另有副手，歷史五場同時展示目前批次與已出雞批次。
- 固定資料錨點是 `2026-08-31`；「正式／測試」標籤也只是虛擬資料的 domain fixture。
- local mutation 只改目前分頁的記憶體；reload 或 restart 會回到固定 baseline。
- local AI 只回傳「模擬分析結果」，不呼叫 Workers AI。
- 不會連線 Worker、D1、LINE、Queue、Cloudflare API 或任何外部 API。

## Start

在本目錄執行：

```sh
npm ci
npm run audit:scan
npm run audit:local
```

以瀏覽器開啟：

`http://127.0.0.1:5173/jinji-farm-manager/?audit=local#/dashboard`

登入畫面會標示「本地稽核登入」。唯一可用的虛擬密碼是 `audit-local-only`；它只在 local adapter 內比對，並非任何正式密碼。頁面應持續顯示：

> 本地稽核模式 / 100% 虛擬資料 / 不連正式環境

也可以使用 `?audit=local` 讓既有 `npm run dev -- --host 127.0.0.1` 進入同一模式。請不要將 local audit URL 指向公開 Pages 或 Production Worker。

## Suggested audit pass

先從 Dashboard 開始，再依序操作主要流程：

1. 查看五個 synthetic farms、不同 environment/structure、長備註與啟用狀態。
2. 查看 houses、flocks、reminders，使用 farm context、filter 與 deep link。
3. 查看 operational events，建立一筆虛擬事件，檢查反轉與修正鏈，再查看 Audit。
4. 查看 abnormal events，建立、修正、反轉一筆虛擬異常，檢查時間軸與天氣摘要。
5. 在 caretakers 建立、指派、封存虛擬飼養者；檢查 assignment history 與 Audit。
6. 在 system 處理 synthetic reliability event（查看、重新安排、補登或結案），確認狀態轉換與 Audit。
7. 在 LINE 群組切換仍可用的虛擬群組；已離開群組應保持 disabled。
8. 在 AI 助理送出測試問題，確認標題為「模擬分析結果」、結果為唯讀且 limitations 說明沒有 Workers AI。
9. 查看 finance/equity、charts、pending/diagnostics、health、technical/settings/testTools。
10. reload；確認新增事件、飼養者、備註與群組設定都回到 baseline。

所有操作按鈕都只對 synthetic state 生效；本地模式沒有正式資料 cleanup 的必要。

## Routes

現有 24 個 route key 都由同一個 App/route tree 提供：

`dashboard`, `farms`, `flocks`, `events`, `abnormal`, `charts`, `ai`, `pending`, `caretakers`, `finance`, `audit`, `system`, `reminders`, `organization`, `houses`, `equity`, `aliases`, `health`, `lineGroups`, `diagnostics`, `pendingDiagnostics`, `testTools`, `settings`, `technical`。

12 個主要導覽項目維持現有 IA；其餘 route 可用 hash deep link 開啟。頁面資料包含 multiple rows、empty/zero/null、warning、history、pagination、correction/reversal 與 mobile layout 可檢視情境。

## Safety and export

`npm run audit:scan` 只輸出檔案路徑與 bounded category，不輸出任何匹配值。它檢查候選稽核範圍內的 credential-shaped material、過大檔案與 binary file。

Repomix 設定：

```sh
repomix -c repomix.audit.config.json
repomix -c repomix.web-ux.config.json
```

輸出會放在被 `.gitignore` 排除的 `.audit-output/`。兩份設定都排除 `.env*`、developer secrets、node_modules、dist、coverage、test-results、`.wrangler`、Production/LINE historical forensic artifacts、Cloudflare binding config、raw logs 與 local output。分享前仍應確認 Repomix security check 沒有保留敏感檔案。

## What this package can and cannot prove

可以稽核：

- source/components/routes/API contract 的可讀性與一致性；
- 本地 state transition、audit rendering、correction/reversal/reliability UI；
- five-farm fixture 的關聯、stock/finance invariant、mobile/responsive navigation；
- local-only network boundary 與 export safety workflow。

不能稽核：

- Production Worker、remote D1、Cloudflare auth、Cron、Queue、LINE webhook/reply；
- 真實 Workers AI provider/model response；
- 真實使用者資料、正式財務、正式 master data 或 Production deployment。

任何 Production 或 real external integration 驗收都必須另行取得明確授權，不應由本地稽核模式觸發。
