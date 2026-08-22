# 金雞協會助理Ai｜雞場管理中心

這是 `金雞協會助理Ai / @550rsdwc` 的正式 Web 管理介面。資料只透過既有
Cloudflare Worker API 讀寫既有 Production D1，沒有第二套資料庫或展示用假資料。

## 開發

```sh
npm install
npm run check
npm test
npm run build
npm run dev
```

`VITE_API_BASE_URL` 可在本機開發時指向既有 Worker；Production Pages build
預設使用 `https://chicken-line-production.jinji-assistant.workers.dev`。

## 安全邊界

- session token 只保存在目前頁面的記憶體，不寫入 localStorage、cookie 或檔案。
- 結構性新增、封存與主檔操作沿用登入後的管理 session，並經既有驗證、業務規則與 Audit；不會每次操作再次要求密碼。
- Worker 以同一個 `FARM_ADMIN_PASSWORD_HASH` verifier 驗證，不在前端保存明文密碼。
- 營運修正使用 reversal/correction ledger，不直接覆寫歷史數量。
- Production Finance API 只聚合 `environment = 'production'`。
