# Target Architecture Memory Card

這是快速恢復方向的短卡，不是完整規格；完整規則以
`docs/target-architecture.md` 為準。

`TARGET_ARCHITECTURE_STATUS = NON_EXECUTING_NORTH_STAR`。它是長期方向與
anti-drift 審查基準，不是 V3、不是立即重構，也不授權移除 Production V1。
目前 `CURRENT_V2_STATUS = ACTIVE_DEVELOPMENT_PATH`，架構重寫仍未獲授權。

核心邊界是「一則 LINE message 一個 semantic failure boundary」：先 durable
receipt/technical source idempotency，再 Queue 與 message router；每則訊息
deterministic-first，只有不確定的自然語言才 AI fallback。AI 只提供最小語意
`events[]`：`event`（mortality/cull/abnormal）、`quantity`（正數或 null）、
abnormal 才可有短 `detail`。AI 不得決定 farm/house/flock/user/identity、
timestamp、lineage、dedupe、relation target、transaction、Candidate 或正式
寫入。`quantity=null` 是事件存在但數量未知，不是忽略。

場、舍、批次與 ownership 由 deterministic context resolver 處理；唯一才
resolved，模糊就問人，不猜。多事件是 first-class。Malformed JSON 必須對該
message fail closed，禁止 salvage；已成功解析後的單則 semantic failure 不得
拖死其他訊息。

Relation 與 event extraction 分離。relation-only 不進 main AI；使用明確 cue、
同 group/context 的 bounded pending pool 與 local resolver。mixed message 可以
同時有新 event 與 relation。Technical dedupe 只靠同一 source identity；不同
訊息即使 type/quantity/time 相同也不可自動合併，除非有明確 relation cue。

D1 是唯一正式 Source of Truth；正式資料 append-only，修正走既有
Correction/Reversal 與 Audit。Candidate/Pending 是安全狀態，不是每則訊息的
強制中繼站。Cron 的長期目標是只 aggregate processed state，不重新理解整批
聊天。Daily Review、Web、查詢、Admin、Master Data、Correction 應在 AI 不可用
時仍可運作；AI Analysis 只讀且必須區分 evidence/inference/limitations。

保持 modular monolith、Queue、Fast Path；不要因局部 bug 增加 microservice、
workflow engine、新 table、migration、retry framework 或 agent。先 mapping
現有 schema，只有證明無法安全表達才 migrate。

必要的 business complexity 包括場舍批次、未知數量、relation、correction、
audit、授權、pending interaction 與 idempotency；AI/batch 造成的 source
accounting、repair chain、whole-batch coupling 與 prompt patch chain 則是
accidental complexity。遇到新 framework、欄位、cron、recovery、retry 或
migration，先回答它保護哪個真實業務邊界、能否重用既有責任、為何 mapping 不夠，
並寫出測試與 side-effect boundary。若只是技術事故，先縮小 responsibility 與
failure boundary；單一測試失敗不能直接擴張架構。

長期驗收順序是 deterministic safety、frozen semantic suite、Fresh Unseen、
一次真人 LINE，再考慮 Dev Full Flow。Ground Truth 先凍結，失敗不能改期待值。
任何重大偏離都要記錄 previous decision、new evidence、proposed change、
impact，並取得使用者批准；Target 文件本身永遠不是執行授權。

目前模型凍結為 `@cf/meta/llama-3.2-3b-instruct`，model comparison 要等使用者
明確解除。V2 核心應 reuse，不 rewrite；Production V1、Scheduled Ambient、
Recovery 與 structured-output capability 都仍是 current/deferred deviation，
不是本卡的執行指令。
