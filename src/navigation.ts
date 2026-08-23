export type NavGroupKey = "operations" | "data" | "system";
export type NavIconName = "dashboard" | "organization" | "farms" | "caretakers" | "houses" | "flocks" | "events" | "abnormal" | "finance" | "equity" | "charts" | "ai" | "reminders" | "aliases" | "audit" | "health" | "settings" | "pending" | "system" | "diagnostics" | "pendingDiagnostics" | "testTools" | "technical" | "lineGroups" | "logout";

export const NAV_GROUPS = [
  { key: "operations", label: "一般場務" },
  { key: "data", label: "資料管理" },
  { key: "system", label: "系統維護" },
] as const satisfies readonly { key: NavGroupKey; label: string }[];

export const NAV_ITEMS = [
  { key: "dashboard", label: "總覽", description: "今日重點", pageDescription: "查看今日營運重點、存欄與近期出雞提醒。", group: "operations", icon: "dashboard" },
  { key: "farms", label: "雞場", description: "場區管理", pageDescription: "管理正式與測試雞場資料。", group: "operations", icon: "farms" },
  { key: "flocks", label: "批次", description: "入雛與出雞", pageDescription: "查看入雛、日齡、存欄與預計出雞資料。", group: "operations", icon: "flocks" },
  { key: "events", label: "營運紀錄", description: "死亡／淘汰／飼料等", pageDescription: "新增、查閱及安全修正死亡、淘汰、飼料、飲水與出雞紀錄。", group: "operations", icon: "events" },
  { key: "abnormal", label: "異常紀錄", description: "只記發生了什麼", pageDescription: "用最少欄位記錄雞場現場異常；分類與天氣由系統補足。", group: "operations", icon: "abnormal" },
  { key: "charts", label: "趨勢分析", description: "數據圖表", pageDescription: "比較死亡、存欄、飼料、飲水與財務趨勢。", group: "operations", icon: "charts" },
  { key: "reminders", label: "提醒", description: "出雞提醒", pageDescription: "查看進行中批次的出雞提醒。", group: "operations", icon: "reminders" },
  { key: "ai", label: "AI 助理", description: "詢答與分析", pageDescription: "以目前頁面與共用資料進行唯讀營運分析。", group: "operations", icon: "ai" },
  { key: "pending", label: "待確認資料", description: "待確認營運資訊", pageDescription: "查看目前還需要人工確認的營運資訊。", group: "operations", icon: "pending" },
  { key: "organization", label: "組織", description: "協會資料", pageDescription: "查看協會投資組合及所涵蓋的雞場。", group: "data", icon: "organization" },
  { key: "caretakers", label: "飼養者", description: "人員管理", pageDescription: "管理飼養者與雞場責任指派。", group: "data", icon: "caretakers" },
  { key: "houses", label: "雞舍", description: "舍別管理", pageDescription: "查看與管理各雞場的雞舍資料。", group: "data", icon: "houses" },
  { key: "finance", label: "財務", description: "盈虧與收支", pageDescription: "查看正式雞場的歷史盈虧與收支。", group: "data", icon: "finance" },
  { key: "equity", label: "股權", description: "投資人與持股", pageDescription: "查看投資人與各場實際持股。", group: "data", icon: "equity" },
  { key: "aliases", label: "名稱解析", description: "別名／錯字／同音", pageDescription: "查看雞場別名、錯字及同音名稱辨識狀態。", group: "data", icon: "aliases" },
  { key: "audit", label: "變更紀錄", description: "修改追蹤", pageDescription: "追查 LINE、網頁與系統資料的修改歷程。", group: "data", icon: "audit" },
  { key: "health", label: "資料檢查", description: "資料異常檢查", pageDescription: "檢查主檔、批次與資料關聯的異常。", group: "system", icon: "health" },
  { key: "system", label: "系統狀態", description: "訊息處理狀態", pageDescription: "查看接收、處理、儲存與 LINE 回覆狀態。", group: "system", icon: "system" },
  { key: "lineGroups", label: "LINE 群組", description: "AI 對話開關", pageDescription: "選擇哪些已授權 LINE 群組可以使用 @助理 的 AI 對話。", group: "system", icon: "lineGroups" },
  { key: "diagnostics", label: "訊息診斷", description: "尚未整理與問題訊息", pageDescription: "查看尚未整理、已過期未完成與處理問題。", group: "system", icon: "diagnostics" },
  { key: "pendingDiagnostics", label: "待確認資料診斷", description: "來源與不一致原因", pageDescription: "查看待確認資料的來源與狀態；只查看不修改。", group: "system", icon: "pendingDiagnostics" },
  { key: "testTools", label: "測試工具", description: "測試雞場資料", pageDescription: "只讀查看測試雞場、雞舍與批次。", group: "system", icon: "testTools" },
  { key: "settings", label: "系統設定", description: "服務設定摘要", pageDescription: "查看系統與 LINE 接收設定狀態。", group: "system", icon: "settings" },
  { key: "technical", label: "技術資訊", description: "進階技術資料", pageDescription: "查看版本、排程與訊息處理設定；不顯示機密。", group: "system", icon: "technical" },
] as const satisfies readonly { key: string; label: string; description: string; pageDescription: string; group: NavGroupKey; icon: Exclude<NavIconName, "logout"> }[];

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
