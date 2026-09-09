# LINE 全分類真人驗收清單

狀態：待真人執行；本文件不預填任何 PASS/FAIL。

## 執行前硬邊界

- 只可使用由管理者當場確認的 LINE 測試群組；本文件不記錄完整群組識別碼。遠端唯讀資料目前只有一筆未綁定且未標示 farm 的群組，因此真人必須先確認實際測試群組。
- 只可使用 environment=test 的金雞測試場、測試1舍、TEST-BATCH-001；不得使用 Production 農場或真實業務資料。
- 執行前重新讀取 baseline：initial_count=1000、effective stock=963、Finance net=429338.6；數值若改變，先停下並記錄。
- O3、O9 的 stock-changing 測試必須 append-only；使用正式 correction/reversal 流程復原，不得 DELETE、直接 UPDATE 或 raw SQL。
- 每個確認後案例都要用正常 bridge read-back：taxonomyId、family、occurredAt、Test scope、destination、source、client provenance。
- 問句、未來事件、否定句、缺少必要 scope/quantity、未拆分的多事實，不得寫入。
- 真人只填寫本清單中的 PASS/FAIL 與 Notes；不得以自動化測試或模型輸出代填真人 PASS。

## 建議執行順序

先完成 SCOPE-01 至 SCOPE-04，再完成 O1-O9 與 A1-A16；O6 必須依序完成 waiting、overdue/read-only、completed；最後完成 CORR、REV、DUP 與 SAFE 案例。任一安全邊界違反即停止並保留證據。

## O1-O9 營運資料

| TEST_ID | 目的 | 安全 LINE 訊息 | 前置 Test scope | 預期解讀 | 預期確認／回覆 | 權威落點 | stock effect | 保存／修正清理 | PASS/FAIL | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| O1 | 入雛基本資料 | 金雞測試場 測試1舍 批次TEST-BATCH-001 入雛 公雞1 母雞0 良好 | Test farm + house + batch 已確認 | O1 / chick_in；保留性別、數量、condition | 顯示完整 farm/house/batch、總數 1，要求真人確認 | recording_events | 0 | 保留原始事件；若需修正走 correction | □ PASS □ FAIL |  |
| O2 | 疫苗或用藥動作 | 金雞測試場 測試1舍 批次TEST-BATCH-001 疫苗 新城雞瘟 | Test farm + house + batch 已確認 | O2 / medication；不推導 flock 或數量 | 顯示動作內容與 Test scope，確認後才寫 | operational_actions | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| O3 | 出雞與 stock 單次效果 | 金雞測試場 測試1舍 批次TEST-BATCH-001 出雞1 公雞 總重2kg | Test farm + house + batch；先讀 stock=963 | O3 / shipment；只產生一個權威 shipment 與一次 -1 | 顯示數量、性別、重量與 scope；確認前不得扣存欄 | operational_events | -1；確認後讀回 962 | 保存原始 shipment；以 correction/reversal 恢復至 963 | □ PASS □ FAIL |  |
| O4 | 磅重資料 | 金雞測試場 測試1舍 批次TEST-BATCH-001 磅重1.8kg 母雞 | Test farm + house + batch 已確認 | O4 / weigh；不得誤判為 shipment | 顯示重量、性別、scope，確認後回覆單一紀錄 | recording_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| O5 | 叫飼料動作 | 金雞測試場 測試1舍 批次TEST-BATCH-001 叫飼料 玉米廠 1kg | Test farm + house + batch 已確認 | O5 / feed_order；保留 vendor、quantity、unit | 顯示供應商、數量、單位與 scope | operational_actions | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| O6-WAIT | 送驗建立 waiting | 金雞測試場 測試1舍 批次TEST-BATCH-001 送驗 新城雞瘟 | Test farm + house + batch 已確認 | O6 / lab_test；status=waiting_result | 回覆送驗已建立、目前等待結果；不得臆測結果 | operational_actions | 0 | 保留 waiting 原始事件；完成時以 linked update/correction | □ PASS □ FAIL |  |
| O6-OVERDUE | 等待逾期 read-only | 不新增業務訊息；由真人在既有 waiting 案例上檢查 overdue 規則 | O6-WAIT 已完成；只讀檢查 | overdue 只改提醒／待辦狀態，不創造新送驗或結果 | 顯示 pending/overdue 提醒；不得新增 D1 business row | Todo／提醒 read-only | 0 | 不清除原 waiting；保留提醒證據 | □ PASS □ FAIL |  |
| O6-DONE | 送驗完成與結果 | 金雞測試場 測試1舍 批次TEST-BATCH-001 送驗 新城雞瘟 結果陰性 完成 | O6-WAIT 已存在且 scope 相同 | O6 / lab_test；status=completed、result=negative | 顯示原送驗與完成結果的 lineage；不得覆寫原始輸入 | operational_actions | 0 | 原 waiting 保留；完成事件可 correction | □ PASS □ FAIL |  |
| O7 | 清消流程 | 金雞測試場 測試1舍 批次TEST-BATCH-001 清消 完成 | Test farm + house + batch 已確認 | O7 / disinfection；狀態為 completed | 顯示流程狀態與 scope；確認後回覆單一動作 | operational_actions | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| O8 | 設備維護 | 金雞測試場 測試1舍 批次TEST-BATCH-001 設備維護 水線 | Test farm + house + batch 已確認 | O8 / maintenance；內容為 water line | 顯示維護項目與 scope，不得轉成異常或死亡 | operational_actions | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| O9 | 死亡數量與 stock 單次效果 | 金雞測試場 測試1舍 批次TEST-BATCH-001 死亡1 | Test farm + house + batch；先讀 stock=963 | O9 / mortality；只產生一個權威死亡事件與一次 -1 | 顯示 positive integer=1、scope、確認前不扣存欄 | operational_events | -1；確認後讀回 962 | 以 reversal/correction 恢復至 963；原事件不可刪除 | □ PASS □ FAIL |  |

## A1-A16 異常登錄

以下案例全部是 qualitative observation；除 A1 的明確 linked mortality 外，不得轉成死亡數量或扣 stock。

| TEST_ID | 目的 | 安全 LINE 訊息 | 前置 Test scope | 預期解讀 | 預期確認／回覆 | 權威落點 | stock effect | 保存／修正清理 | PASS/FAIL | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 死亡異常不自動連結 | 金雞測試場 測試1舍 批次TEST-BATCH-001 死亡異常 大範圍 | Test farm + house + batch 已確認 | A1 / mortality_abnormality；缺 linkedMortalityEventId | 要求選擇或提供既有死亡事件；未連結前不得自動寫入 | abnormal_events | 0 | 原始 observation 保留；修正補 lineage，不覆寫 | □ PASS □ FAIL |  |
| A2 | 咳嗽觀察 | 金雞測試場 測試1舍 批次TEST-BATCH-001 咳嗽 小範圍 | Test farm + house + batch 已確認 | A2 / cough；extent=small | 確認訊息只描述觀察與範圍 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A3 | 呼吸困難觀察 | 金雞測試場 測試1舍 批次TEST-BATCH-001 呼吸困難 中範圍 | Test farm + house + batch 已確認 | A3 / respiratory_distress；extent=medium | 回覆 subtype、extent、scope | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A4 | 活動力下降觀察 | 金雞測試場 測試1舍 批次TEST-BATCH-001 活動力下降 大範圍 | Test farm + house + batch 已確認 | A4 / activity_down；extent=large | 不自動補 flock；確認內容保留 scope | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A5 | 外觀異常子類型 | 金雞測試場 測試1舍 批次TEST-BATCH-001 眼睛腫 白冠 紫冠 黑冠 大範圍 | Test farm + house + batch 已確認 | A5 / appearance；保留多個 appearance subtype | 回覆各 subtype 與 extent，不轉成死亡 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A6 | 下痢子類型 | 金雞測試場 測試1舍 批次TEST-BATCH-001 水便 白便 綠便 血便 大範圍 | Test farm + house + batch 已確認 | A6 / diarrhea；保留各 stool subtype | 回覆 subtype、extent、scope | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A7 | 生長遲緩 | 金雞測試場 測試1舍 批次TEST-BATCH-001 生長遲緩 中範圍 | Test farm + house + batch 已確認 | A7 / growth_delay；extent=medium | 回覆質性觀察；不得創造數量 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A8 | 臭腳觀察 | 金雞測試場 測試1舍 批次TEST-BATCH-001 臭腳 小範圍 | Test farm + house + batch 已確認 | A8 / foot_odor；extent=small | 回覆 subtype、extent、scope | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A9 | 發燒觀察 | 金雞測試場 測試1舍 批次TEST-BATCH-001 發燒 中範圍 | Test farm + house + batch 已確認 | A9 / fever；extent=medium，可補溫度 | 回覆溫度若有提供；不得轉成死亡 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A10 | 緊迫子類型 | 金雞測試場 測試1舍 批次TEST-BATCH-001 熱緊迫 大範圍；抓雞緊迫 小範圍 | Test farm + house + batch 已確認 | A10 / stress；保留 stress subtype 與 extent | 回覆 subtype、extent、scope | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A11 | 採食／飲水異常 | 金雞測試場 測試1舍 批次TEST-BATCH-001 採食異常 小範圍；飲水異常 中範圍 | Test farm + house + batch 已確認 | A11 / intake；分別保留 feed/water subtype | 回覆各 observation 與 extent；測量值只能保留原值 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A12 | 設備異常子類型 | 金雞測試場 測試1舍 批次TEST-BATCH-001 設備異常 水泵漏水 大範圍 | Test farm + house + batch 已確認 | A12 / equipment；設備 subtype=other，detail=水泵漏水 | 回覆設備 subtype、detail、extent | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A13 | 天候異常 | 金雞測試場 測試1舍 批次TEST-BATCH-001 高溫 中範圍 | Test farm + house + batch 已確認 | A13 / weather；保留 weather subtype 與 extent | 回覆觀察、範圍與可選量測；不轉成死亡 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A14 | 淹水 | 金雞測試場 測試1舍 批次TEST-BATCH-001 淹水 大範圍 | Test farm + house + batch 已確認 | A14 / flooding；extent=large | 回覆觀察與 scope | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A15 | 異味 | 金雞測試場 測試1舍 批次TEST-BATCH-001 異味 中範圍 | Test farm + house + batch 已確認 | A15 / odor；extent=medium | 回覆觀察與 scope，不推導原因 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |
| A16 | 感染／擴散場地事件 | 金雞測試場 測試1舍 批次TEST-BATCH-001 感染擴散 大範圍 | Test farm + house + batch 已確認 | A16 / site_event；保留 detail/evidence/extent | 回覆觀察、證據備註與 scope；不創造死亡數量 | abnormal_events | 0 | append-only；修正走 correction | □ PASS □ FAIL |  |

## Scope、缺欄位與安全拒寫

| TEST_ID | 目的 | 安全 LINE 訊息 | 前置 Test scope | 預期解讀 | 預期確認／回覆 | 權威落點 | stock effect | 保存／修正清理 | PASS/FAIL | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| SCOPE-01 | Farm-only 必須明確套用整場 | 金雞測試場 死亡1 | 只有 Test farm；尚未選 house/flock | 要求真人明確確認整場；不得自動套用 flock | 確認前只回覆待確認；明確確認後才可進入 O9 | operational_events only after confirmation | 確認後 -1；完成後 reversal 恢復 | 原始輸入與整場確認 lineage 都保留 | □ PASS □ FAIL |  |
| SCOPE-02 | House-only 不得猜 flock | 金雞測試場 測試1舍 死亡1 | Test farm + house；未指定 batch/flock | 要求選擇批次或明確整舍；不得自動選 flock | 未選 scope 前不得寫入 | no write before choice | 0 before choice | 保留待確認輸入 | □ PASS □ FAIL |  |
| SCOPE-03 | 缺 quantity 必須追問 | 金雞測試場 測試1舍 批次TEST-BATCH-001 死亡 | Test farm + house + batch 已確認 | O9 缺 positive integer | 回覆要求數量；不得猜 1 | no write | 0 | 原始輸入保留為 clarification | □ PASS □ FAIL |  |
| SCOPE-04 | 缺 scope 不得猜測 | 死亡1 | 無 scope | 必須要求 farm/house/batch 或明確範圍 | clarification；不得寫入 | no write | 0 | 原始輸入保留 | □ PASS □ FAIL |  |
| SAFE-01 | 問句 read-only | 請問目前存欄？ | Test scope 可讀取 | 只回答目前資料；不得建立事件 | 回覆讀值與資料時間，不建立事件 | read-only bridge | 0 | 不需清理 | □ PASS □ FAIL |  |
| SAFE-02 | 未來事件拒寫 | 明天金雞測試場死亡1 | Test farm 可讀取 | future event 不得寫入現在事件 | 說明需在事件發生後重新輸入 | no write | 0 | 原始問題不產生 business row | □ PASS □ FAIL |  |
| SAFE-03 | 否定句拒寫 | 不是死亡1 | 任意 Test scope | negation 不得建立 O9 或反向數量 | 回覆已辨識為否定，不寫入 | no write | 0 | 不需清理 | □ PASS □ FAIL |  |
| SAFE-04 | 多事實必須分離 | 金雞測試場 測試1舍 批次TEST-BATCH-001 死亡1，而且臭腳 小範圍 | Test farm + house + batch | 拆成 O9 + A8；兩者需各自確認與 read-back | 不得將 A8 合併成死亡；O9 確認後才有 -1 | operational_events + abnormal_events | O9 only -1；A8 0；最後恢復 O9 | 兩個 lineage 不可互相覆寫 | □ PASS □ FAIL |  |
| SAFE-05 | 重送／重試去重 | 重新送出已確認的 O9 原始訊息 | 先完成同一 O9 並保留官方 redelivery/retry 證據 | 同一 client/event authority 不得新增第二 row 或第二次扣存欄 | 回覆既有權威事件；stock effect 維持一次 | existing operational_events authority | 仍只有一次 -1 | 以既有事件 reconciliation；不得刪原事件 | □ PASS □ FAIL |  |

## O6 waiting、overdue、completed

1. 執行 O6-WAIT，確認同一 Test scope 產生 waiting_result，並保存原始輸入與 read-back。
2. 在沒有新業務訊息的情況下執行 O6-OVERDUE 唯讀檢查；逾期只應影響 Todo／提醒狀態，不應新增送驗或結果資料。
3. 執行 O6-DONE，確認 result=negative、status=completed，且完成事件可追溯到原 waiting 事件；不得以完成資料覆寫原始 waiting。

## Correction、reversal 與 authority

| TEST_ID | 目的 | 執行 | 預期結果 | PASS/FAIL | Notes |
|---|---|---|---|---|---|
| CORR-01 | O3 數量修正 | 先完成 O3 出雞1，再使用正式 correction 將數量修正為2 | 原始 O3 保留；新 correction linked 到原事件；stock effect 可追溯且最終可恢復 baseline | □ PASS □ FAIL |  |
| REV-01 | O9 reversal | 先完成 O9 死亡1，再使用正式 reversal | 原始 O9 保留；reversal 只抵銷一次 stock effect；最終 stock 回到執行前 baseline | □ PASS □ FAIL |  |
| DUP-01 | 單一 authority | 對同一 confirmed event 執行官方 redelivery/retry | 仍只有一個權威事件與一次 stock effect；不得產生 duplicate row | □ PASS □ FAIL |  |
| PROV-01 | provenance 完整 | 任選 O4、A8、O9 read-back | source、client、event/lineage、occurredAt、scope 可查；raw input 不被覆寫 | □ PASS □ FAIL |  |

## 真人執行記錄

| 欄位 | 填寫 |
|---|---|
| HUMAN_OPERATOR |  |
| EXECUTION_DATE_TIME_TW |  |
| CONFIRMED_TEST_GROUP_LABEL |  |
| TEST_SCOPE_RECONFIRMED |  |
| PRE_STOCK |  |
| POST_STOCK_BEFORE_RESTORE |  |
| POST_STOCK_AFTER_RESTORE |  |
| PRE_FINANCE_NET |  |
| POST_FINANCE_NET |  |
| READBACK_RECEIPT_LOCATION |  |
| INCIDENT_OR_STOP_REASON |  |
| READY_FOR_LINE_HUMAN_ACCEPTANCE |  |

本清單只準備真人驗收，不代表已完成真人驗收；LINE 發送與 PASS 判定必須由真人在確認測試群組後執行。
