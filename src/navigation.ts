export type NavGroupKey = "operations" | "finance" | "analysis" | "system";
export type NavIconName = "dashboard" | "organization" | "farms" | "caretakers" | "houses" | "flocks" | "events" | "abnormal" | "finance" | "equity" | "charts" | "ai" | "reminders" | "aliases" | "audit" | "health" | "settings" | "logout";

export const NAV_GROUPS = [
  { key: "operations", label: "日常營運" },
  { key: "finance", label: "財務管理" },
  { key: "analysis", label: "分析與稽核" },
  { key: "system", label: "系統管理" },
] as const satisfies readonly { key: NavGroupKey; label: string }[];

export const NAV_ITEMS = [
  { key: "dashboard", label: "總覽", description: "今日重點", pageDescription: "查看今日營運重點、存欄與近期出雞提醒。", group: "operations", icon: "dashboard" },
  { key: "farms", label: "雞場", description: "場區管理", pageDescription: "管理正式與測試雞場資料。", group: "operations", icon: "farms" },
  { key: "caretakers", label: "飼養者", description: "人員管理", pageDescription: "管理飼養者與雞場責任指派。", group: "operations", icon: "caretakers" },
  { key: "houses", label: "雞舍", description: "舍別管理", pageDescription: "查看與管理各雞場的雞舍資料。", group: "operations", icon: "houses" },
  { key: "flocks", label: "批次", description: "入雛與出雞", pageDescription: "查看入雛、日齡、存欄與預計出雞資料。", group: "operations", icon: "flocks" },
  { key: "events", label: "營運紀錄", description: "死亡／淘汰／飼料等", pageDescription: "新增、查閱及安全修正死亡、淘汰、飼料、飲水與出雞紀錄。", group: "operations", icon: "events" },
  { key: "abnormal", label: "異常紀錄", description: "只記發生了什麼", pageDescription: "用最少欄位記錄雞場現場異常；分類與天氣由系統補足。", group: "operations", icon: "abnormal" },
  { key: "finance", label: "財務", description: "盈虧與收支", pageDescription: "查看正式雞場的歷史盈虧與收支。", group: "finance", icon: "finance" },
  { key: "equity", label: "股權", description: "投資人與持股", pageDescription: "查看投資人與各場實際持股。", group: "finance", icon: "equity" },
  { key: "charts", label: "趨勢分析", description: "數據圖表", pageDescription: "比較死亡、存欄、飼料、飲水與財務趨勢。", group: "analysis", icon: "charts" },
  { key: "ai", label: "AI 助理", description: "詢答與分析", pageDescription: "以目前頁面與共用 D1 資料進行唯讀營運分析。", group: "analysis", icon: "ai" },
  { key: "reminders", label: "提醒", description: "出雞提醒", pageDescription: "查看進行中批次的出雞提醒。", group: "analysis", icon: "reminders" },
  { key: "aliases", label: "名稱解析", description: "別名／錯字／同音", pageDescription: "查看雞場別名、錯字及同音名稱辨識狀態。", group: "analysis", icon: "aliases" },
  { key: "audit", label: "變更紀錄", description: "修改追蹤", pageDescription: "追查 LINE、Web 與系統資料的修改歷程。", group: "analysis", icon: "audit" },
  { key: "health", label: "資料健康", description: "異常檢查", pageDescription: "檢查主檔、批次與資料關聯的異常。", group: "analysis", icon: "health" },
  { key: "organization", label: "組織", description: "協會資料", pageDescription: "查看協會投資組合及所涵蓋的雞場。", group: "system", icon: "organization" },
  { key: "settings", label: "設定", description: "系統設定", pageDescription: "查看系統連線與安全設定摘要。", group: "system", icon: "settings" },
] as const satisfies readonly { key: string; label: string; description: string; pageDescription: string; group: NavGroupKey; icon: Exclude<NavIconName, "logout"> }[];

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
