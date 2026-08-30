# HUMAN STEPS — 金雞協會助理Ai

`AUTOMATED-FARM-ADMIN-AUTH: PASS`

`AUTOMATED-OPERATIONAL-MASTER-DATA: PASS`

`AUTOMATED-FARM-HOUSE-E2E: PASS`

`REAL-LINE-FARM-HOUSE-E2E: PENDING`

本文件是 historical acceptance checklist，不是 current runtime truth。Worker
version 與固定存欄數字只代表當時驗收條件；目前 live 狀態與最新唯讀證據以
`docs/current-execution-state.md` 為準。

目前 Production model 保持 `@cf/meta/llama-3.2-3b-instruct`；AI benchmark 已依使用者要求停止，Gemma 沒有切換。Admin Auth 已完成遠端驗證，Phase 2 已通過本機真實 Worker HTTP runtime `14/14`，並已部署。

已在既有 Test Farm `金雞測試場` 建立並驗證 `測試1舍`／`TEST-BATCH-001`；正式 Production farms 沒有新增任何 master data。建立流程已經過管理密碼與確認，暫時 runtime harness 也已移除。

Farm+House mortality bugfix 已完成 root-cause trace、最小修正、signed/runtime E2E、D1 read-back、audit-safe reversal 與正式部署。當時該驗收使用的 Worker version：`c29b864c-d386-49a2-bd80-b040eeba7830`；`/health=200`；temporary runtime harness endpoints 已為 `404`。這個 version 不再視為 current live version。

真人 LINE 只需抽驗以下兩條：

1. `金雞測試場 測試1舍 死亡5`
   - 預期：`✅ 紀錄成功`，`🧪 金雞測試場｜測試1舍｜死亡｜5隻`
2. `金雞測試場 測試1舍 目前存欄`
   - 預期：以測試前讀值為基準，死亡5成功後 derived current stock 必須減少 exactly 5；不要把 `995隻` 當成固定 current-stock 預期。

這兩條只作用於 Test Farm。不要送 `死亡999` 等合成 Production 數據，也不需要重新 Issue token、修改 LINE Secret、webhook URL、Billing 或 LINE 設定。
