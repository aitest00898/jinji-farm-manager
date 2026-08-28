# Conversation V2 群組開關與可追蹤性

## 目的

Conversation V2 是否啟用，是 LINE 群組的 rollout 設定，不是 Candidate 或 Farm
推論的結果。只有真正的 `@助理` mention 才會進入這個 gate；普通群組聊天仍走
Quiet / Ambient 規則。

## 啟用規則

判斷順序是：

```text
真正 mention 自己
  → explicit conversation
  → CONVERSATION_V2_MODE 允許
  → 該 line_groups row 的 conversation_v2_enabled = 1
  → Conversation V2
```

目前 global mode 的合法值仍是 `off`、`shadow`、`test_farm`、`on`。`off` 與
`shadow` 不會把訊息交給使用者 V2；其他 mode 也必須同時通過群組開關。新群組
欄位預設為 0，因此 migration 不會讓既有群組意外獲得 V2。

Candidate 只會在 gate 通過後作為目前對話的 context。Farm binding 只用於查詢
範圍與 resolver；未綁 Farm 不會再讓已明確開啟 V2 的群組在 planner 前被擋下。

## 儲存

`migrations/0031_conversation_v2_group_rollout_observability.sql` 以 additive
方式新增：

- `line_groups.conversation_v2_enabled INTEGER NOT NULL DEFAULT 0`。
- `line_events.conversation_routing_json TEXT`，保存安全的 routing metadata。
- 以 `(correlation_id, conversation_routing_json)` 支援事件追查。

沒有修改或刪除舊 migration，也沒有改寫既有正式資料。

切換群組時使用穩定的 LINE `group_id` 與 organization scope；顯示名稱只用於
管理者這次找出正確資料，不會寫入 runtime 判斷。管理頁 API 為：

- `GET /api/line-groups`
- `PATCH /api/line-groups/:groupId/ai-conversation`

兩者都沿用現有 Web admin session 與 organization authorization，設定變更會留
Audit。一般使用者不會看到技術欄位。

## Durable routing metadata

對 explicit self mention，`line_events.conversation_routing_json` 至少記錄：

- correlation id、是否 self mention、是否進 V2 dispatch。
- `v2_eligible`、group access、結構化 skip reason。
- planner / AI 是否嘗試、AI safe duration。
- session read/write status 與 safe error class。
- fallback origin、V2 trace id、trace save status。
- 最終 goal/topic/renderer/mutation level（若已產生）。

同一筆事件在 `conversation_v2_traces` 仍只保存 metadata，不保存完整普通群組
聊天、token、secret 或 chain-of-thought。即使 eligibility=false，也會留下最小
trace，例如 `group_v2_disabled`、`planner_invoked=false` 與實際 fallback origin。

Observability 寫入失敗不會重新執行業務流程，也不會重送正式 mutation；它只會記錄
安全錯誤類別並讓既有 reply / recovery 邏輯繼續負責事件結果。

## 本次 rollout

Production 只對目前手機驗收群組明確開啟 V2；其他群組保持預設或原有設定。測試群
仍可維持 `status=unbound`、`farm_id=NULL`，因為這些是 Farm context 狀態，不是 V2
電源開關。

切換下一個測試群只需要在管理頁將舊群關閉、將新群開啟，不需要改 source、群組名稱
判斷、Candidate 或重新部署 Worker。

## 測試

純 decision tests 覆蓋 global kill switch、group OFF/ON、missing group、Farm 未綁定、
無 Candidate、Candidate 不得繞過開關、Quiet 群聊與 deterministic command。Production-
equivalent local runtime 會先驗證 OFF 的 durable skip trace，再驗證 ON 的 planner、
AI、session status、V2 trace、grounded response 與 read-only mutation boundary。
