# Web operation inventory

This inventory uses a semantic denominator: one row is one stable user operation backed by an API or local adapter action. Repeated desktop/mobile controls count once. Passive page-load reads are grouped as workspace loading; navigation-only and visual-only interactions are excluded.

The local audit implementation and the operation coverage test are memory-only. They do not represent Production execution.

| OPERATION_ID | ROUTE | UI_CONTROL | API_METHOD | READ_OR_WRITE | LOCAL_HANDLER | STATE_EFFECT | AUDIT_EFFECT | TEST_ID | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | login | 管理中心登入 | /api/web/auth/login | WRITE (session) | localAuditRequest auth login | memory session authenticated | no | LA-W01 | IMPLEMENTED |
| W02 | workspace | 首頁／重新整理 | dashboard and workspace read bundle | READ | localAuditRequest read routes | none | no | LA-W02 | IMPLEMENTED |
| W03 | charts | 趨勢查詢與篩選 | GET /api/charts/:metric | READ | chartPayload | none | no | LA-W03 | IMPLEMENTED |
| W04 | events | 營運紀錄分頁 | GET /api/operational-events | READ | filterScopedEvents + pageSlice | none | no | LA-W04 | IMPLEMENTED |
| W05 | audit | 變更紀錄分頁 | GET /api/audit | READ | pageSlice audit | none | no | LA-W05 | IMPLEMENTED |
| W06 | abnormal | 異常紀錄分頁 | GET /api/abnormal-events | READ | filterScopedAbnormal + pageSlice | none | no | LA-W06 | IMPLEMENTED |
| W07 | pending | 待確認資料分頁 | GET /api/pending-candidates | READ | pending page slice | none | no | LA-W07 | IMPLEMENTED |
| W08 | diagnostics | 訊息診斷分頁 | GET /api/ambient/preview and GET /api/reliability/events | READ | ambient preview + reliability read | none | no | LA-W08 | IMPLEMENTED |
| W09 | ai | 開始分析 | POST /api/ai/analyze | WRITE (read-only analysis request) | localAuditRequest AI branch | no business mutation | no | LA-W09 | IMPLEMENTED |
| W10 | logout | 登出 | POST /api/web/auth/logout | WRITE (session) | localAuditRequest auth logout | memory session unauthenticated | no | LA-W10 | IMPLEMENTED |
| W11 | farms | 新增雞場 | POST /api/farms | WRITE | farm create branch | adds virtual farm | yes | LA-W11 | IMPLEMENTED |
| W12 | farms | 編輯備註／儲存 | PATCH /api/farms/:id | WRITE | farm patch branch | changes virtual note | yes | LA-W12 | IMPLEMENTED |
| W13 | farms | 封存／重新啟用 | PATCH /api/farms/:id | WRITE | farm patch branch | changes virtual active state | yes | LA-W13 | IMPLEMENTED |
| W14 | caretakers | 新增飼養者 | POST /api/caretakers | WRITE | caretaker create branch | adds virtual caretaker | yes | LA-W14 | IMPLEMENTED |
| W15 | caretakers | 封存／啟用 | PATCH /api/caretakers/:id | WRITE | caretaker patch branch | changes virtual active state | yes | LA-W15 | IMPLEMENTED |
| W16 | caretakers | 指派主要飼養者 | POST /api/farms/:id/caretakers | WRITE | caretaker assignment branch | ends prior virtual primary and adds assignment | yes | LA-W16 | IMPLEMENTED |
| W17 | houses | 建立雞舍 | POST /api/houses | WRITE | house create branch | adds virtual house | yes | LA-W17 | IMPLEMENTED |
| W18 | houses | 封存／啟用 | PATCH /api/houses/:id | WRITE | house patch branch | changes virtual active state | yes | LA-W18 | IMPLEMENTED |
| W19 | flocks | 建立批次 | POST /api/flocks | WRITE | flock create branch | adds virtual flock | yes | LA-W19 | IMPLEMENTED |
| W20 | flocks | 結束批次／狀態更新 | PATCH /api/flocks/:id | WRITE | flock patch branch | changes virtual status | yes | LA-W20 | IMPLEMENTED |
| W21 | events | 寫入營運事件 | POST /api/operational-events | WRITE | operational event create branch | adds virtual event | yes | LA-W21 | IMPLEMENTED |
| W22 | events | 反轉營運事件 | POST /api/operational-events/:id/reverse | WRITE | operational reverse branch | marks virtual original reversed | yes | LA-W22 | IMPLEMENTED |
| W23 | events | 修正營運事件 | POST /api/operational-events/:id/correct | WRITE | operational correct branch | reverses original and adds virtual correction | yes | LA-W23 | IMPLEMENTED |
| W24 | abnormal | 記錄異常 | POST /api/abnormal-events | WRITE | abnormal create branch | adds virtual abnormal event | yes | LA-W24 | IMPLEMENTED |
| W25 | abnormal | 反轉異常 | POST /api/abnormal-events/:id/reverse | WRITE | abnormal reverse branch | marks original reversed and adds reversal child | yes | LA-W25 | IMPLEMENTED |
| W26 | abnormal | 修正異常 | POST /api/abnormal-events/:id/correct | WRITE | abnormal correct branch | marks original corrected and adds correction child | yes | LA-W26 | IMPLEMENTED |
| W27 | system | 重新處理全部未完成訊息 | POST /api/reliability/recover | WRITE | reliability recover-all branch | changes virtual lifecycle | yes | LA-W27 | IMPLEMENTED |
| W28 | system | 記下全部查看結果 | POST /api/reliability/acknowledge | WRITE | reliability acknowledge branch | changes virtual acknowledgement | yes | LA-W28 | IMPLEMENTED |
| W29 | system | 重新處理單筆訊息 | POST /api/reliability/events/:id/recover | WRITE | reliability recover-one branch | changes virtual lifecycle | yes | LA-W29 | IMPLEMENTED |
| W30 | system | 人工結案 | POST /api/reliability/events/:id/resolve | WRITE | reliability resolve branch | changes virtual resolution | yes | LA-W30 | IMPLEMENTED |
| W31 | system | 強制結案 | POST /api/reliability/events/:id/resolve | WRITE | reliability resolve branch | changes virtual resolution | yes | LA-W31 | IMPLEMENTED |
| W32 | system | 補登正式紀錄 | POST /api/reliability/events/:id/record | WRITE | reliability record branch | changes virtual resolution reference | yes | LA-W32 | IMPLEMENTED |
| W33 | line-groups | 開啟／關閉群組 AI 對話 | PATCH /api/line-groups/:id/ai-conversation | WRITE | line-group patch branch | changes virtual group setting | yes | LA-W33 | IMPLEMENTED |

## Coverage interpretation

- W01--W10 cover session, reads, diagnostics, and the read-only analysis surface.
- W11--W20 cover master-data lifecycle.
- W21--W26 cover operational and abnormal event lifecycle.
- W27--W33 cover reliability, retained-message handling, and group settings.
- The test intentionally uses create/update/reverse/correct/toggle calls against a disposable in-memory state. It restores toggled values where practical and resets the complete fixture after each test.
- This is local contract coverage, not proof of authenticated Production E2E or of deployed Pages behavior.

