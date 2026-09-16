import {
  masterBatchPreview,
  type FinanceMutationEntity,
  type FinanceMutationRequest,
  type MasterBatchItem,
  type MasterBatchPreview,
} from "./chapter12-requirements";

export type ParsedChapter12LineAdminCommand =
  | { kind: "finance_admin_usage" }
  | { kind: "finance_admin_preview"; requests: FinanceMutationRequest[] }
  | { kind: "master_admin_usage" }
  | { kind: "master_admin_preview"; items: MasterBatchItem[] };

const financeAliases: Record<string, FinanceMutationEntity> = {
  investor: "investor",
  投資人: "investor",
  investor_master: "investor",
  farm_investor_equity: "farm_investor_equity",
  持股: "farm_investor_equity",
  股權: "farm_investor_equity",
  profit_distribution: "profit_distribution",
  分紅: "profit_distribution",
  盈虧: "profit_distribution",
  profit_distribution_allocation: "profit_distribution_allocation",
  分配: "profit_distribution_allocation",
};

const financeFieldAliases: Record<string, string> = {
  名稱: "name",
  name: "name",
  啟用: "active",
  啟用中: "active",
  active: "active",
  持股比例: "equityFraction",
  股權比例: "equityFraction",
  equityFraction: "equityFraction",
  來源: "source",
  source: "source",
  生效日: "effectiveDate",
  effectiveDate: "effectiveDate",
  分配日: "distributionDate",
  distributionDate: "distributionDate",
  ROC日期: "sourceDateRoc",
  sourceDateRoc: "sourceDateRoc",
  毛利: "grossProfitLoss",
  grossProfitLoss: "grossProfitLoss",
  已分配: "allocatedProfitLoss",
  allocatedProfitLoss: "allocatedProfitLoss",
  費用: "expense",
  expense: "expense",
  淨利: "netIncome",
  netIncome: "netIncome",
  備註: "note",
  note: "note",
  資料集: "sourceDataset",
  sourceDataset: "sourceDataset",
  來源列: "sourceRowKey",
  sourceRowKey: "sourceRowKey",
  金額: "amount",
  amount: "amount",
};

const masterAliases: Record<string, MasterBatchItem["kind"]> = {
  farm: "farm",
  雞場: "farm",
  養雞場: "farm",
  house: "house",
  雞舍: "house",
  舍: "house",
  flock: "flock",
  批次: "flock",
};

const masterFieldAliases: Record<string, string> = {
  名稱: "name",
  name: "name",
  啟用: "active",
  active: "active",
  場址: "siteName",
  siteName: "siteName",
  容量: "capacity",
  capacity: "capacity",
  品種: "breed",
  breed: "breed",
  預計出雞日: "expectedShipmentDate",
  expectedShipmentDate: "expectedShipmentDate",
  備註: "note",
  note: "note",
};

function boundedToken(value: string, max = 160): string | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/u.test(normalized)) return null;
  return normalized;
}

function parseScalar(value: string): unknown {
  const normalized = value.normalize("NFKC").trim();
  if (/^(?:是|true|1)$/iu.test(normalized)) return true;
  if (/^(?:否|false|0)$/iu.test(normalized)) return false;
  if (/^-?(?:\d+\.\d+|\d+)$/u.test(normalized)) return Number(normalized);
  return boundedToken(normalized, 1000) ?? "";
}

function parseAssignments(text: string, fields: Record<string, string>): { changes: Record<string, unknown>; reason: string | null; warningOverride: boolean; dependsOn: string[] } | null {
  const changes: Record<string, unknown> = {};
  const dependencies: string[] = [];
  let reason: string | null = null;
  let warningOverride = false;
  const tokens = text.trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) return null;
  for (const token of tokens) {
    const equals = token.indexOf("=");
    if (equals <= 0) return null;
    const rawKey = token.slice(0, equals);
    const rawValue = token.slice(equals + 1);
    const key = fields[rawKey];
    if (rawKey === "原因" || rawKey === "reason") {
      reason = boundedToken(rawValue, 500);
      if (!reason) return null;
      continue;
    }
    if (rawKey === "警示覆寫" || rawKey === "warningOverride") {
      warningOverride = /^(?:是|true|1|確認)$/iu.test(rawValue);
      continue;
    }
    if (rawKey === "依賴" || rawKey === "dependsOn") {
      const dependency = boundedToken(rawValue, 160);
      if (!dependency) return null;
      dependencies.push(dependency);
      continue;
    }
    if (!key || Object.prototype.hasOwnProperty.call(changes, key)) return null;
    const value = parseScalar(rawValue);
    if (value === "") return null;
    changes[key] = value;
  }
  return { changes, reason, warningOverride, dependsOn: dependencies };
}

function financeEntity(value: string): FinanceMutationEntity | null {
  return financeAliases[value.normalize("NFKC").trim()] ?? null;
}

function financeRequest(entityType: FinanceMutationEntity, entityId: string, operation: "update" | "delete", assignments: ReturnType<typeof parseAssignments>): FinanceMutationRequest | null {
  if (!assignments || !assignments.reason) return null;
  if (operation === "update" && Object.keys(assignments.changes).length === 0) return null;
  return {
    entityType,
    entityId,
    operation,
    changes: assignments.changes,
    reason: assignments.reason,
    // Preview commands are intentionally not executable. The pending action
    // handler sets this to true only after a separate explicit confirmation.
    confirm: false,
    warningOverride: assignments.warningOverride,
  };
}

function parseFinanceSpec(spec: string): FinanceMutationRequest | null {
  const tokens = spec.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length < 3) return null;
  const deleteOperation = /^(?:刪除|删除)$/iu.test(tokens[0]);
  const entityToken = deleteOperation ? tokens[1] : tokens[0];
  const idToken = deleteOperation ? tokens[2] : tokens[1];
  const entityType = financeEntity(entityToken);
  const entityId = boundedToken(idToken);
  if (!entityType || !entityId) return null;
  const assignments = parseAssignments(tokens.slice(deleteOperation ? 3 : 2).join(" "), financeFieldAliases);
  return financeRequest(entityType, entityId, deleteOperation ? "delete" : "update", assignments);
}

function parseFinanceAdminCommand(text: string): ParsedChapter12LineAdminCommand | null {
  const normalized = text.normalize("NFKC").trim();
  const match = /^(財務修改|財務刪除|財務批次)\s*(.*)$/u.exec(normalized);
  if (!match) return null;
  if (!match[2].trim()) return { kind: "finance_admin_usage" };
  if (match[1] === "財務批次") {
    const requests = match[2].split("|").map(parseFinanceSpec);
    if (requests.some((request) => !request) || requests.length < 2) return { kind: "finance_admin_usage" };
    return { kind: "finance_admin_preview", requests: requests as FinanceMutationRequest[] };
  }
  const operation = match[1] === "財務刪除" ? "delete" : "update";
  const spec = operation === "delete" ? `刪除 ${match[2]}` : match[2];
  const request = parseFinanceSpec(spec);
  return request ? { kind: "finance_admin_preview", requests: [request] } : { kind: "finance_admin_usage" };
}

function parseMasterSpec(spec: string): MasterBatchItem | null {
  const tokens = spec.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length < 3) return null;
  const kind = masterAliases[tokens[0].normalize("NFKC").trim()];
  const id = boundedToken(tokens[1]);
  if (!kind || !id) return null;
  const assignments = parseAssignments(tokens.slice(2).join(" "), masterFieldAliases);
  if (!assignments || Object.keys(assignments.changes).length === 0) return null;
  return {
    kind,
    id,
    changes: assignments.changes,
    ...(assignments.dependsOn.length ? { dependsOn: assignments.dependsOn } : {}),
  };
}

function parseMasterAdminCommand(text: string): ParsedChapter12LineAdminCommand | null {
  const normalized = text.normalize("NFKC").trim();
  const match = /^(主檔批次|修改雞場|修改雞舍|修改批次)\s*(.*)$/u.exec(normalized);
  if (!match) return null;
  if (!match[2].trim()) return { kind: "master_admin_usage" };
  const specs = match[1] === "主檔批次" ? match[2].split("|") : [match[2]];
  const items = specs.map((spec) => parseMasterSpec(match[1].startsWith("修改") ? `${match[1].slice(2)} ${spec}` : spec));
  if (items.some((item) => !item) || (match[1] === "主檔批次" && items.length < 2)) return { kind: "master_admin_usage" };
  const preview = masterBatchPreview(items as MasterBatchItem[]);
  return preview.safe ? { kind: "master_admin_preview", items: items as MasterBatchItem[] } : { kind: "master_admin_usage" };
}

export function parseChapter12LineAdminCommand(text: string): ParsedChapter12LineAdminCommand | null {
  return parseFinanceAdminCommand(text) ?? parseMasterAdminCommand(text);
}

function financeLabel(entityType: FinanceMutationEntity): string {
  return entityType === "investor" ? "投資人" : entityType === "farm_investor_equity" ? "持股" : entityType === "profit_distribution" ? "分紅" : "分配";
}

export function financePreviewText(requests: FinanceMutationRequest[], plans: Array<{ before: Record<string, unknown>; after: Record<string, unknown> | null; requiresWarningOverride: boolean }>): string {
  const lines = [`Finance 預覽（${requests.length} 項）`];
  requests.forEach((request, index) => {
    const plan = plans[index];
    lines.push(`${index + 1}. ${request.operation === "delete" ? "刪除" : "修改"}${financeLabel(request.entityType)}｜${request.entityId}`);
    if (request.operation === "update") lines.push(`   變更：${Object.entries(request.changes).map(([field, value]) => `${field}=${String(value)}`).join("、")}`);
    if (plan?.requiresWarningOverride) lines.push("   ⚠️ 這會改變財務結果；確認時會再次檢查警示覆寫。免另填覆寫原因。" );
  });
  lines.push("尚未寫入。請回覆：確認全部 / 取消 / 修改後重新輸入完整財務指令。" );
  return lines.join("\n");
}

export function masterPreviewText(preview: MasterBatchPreview): string {
  return [
    `主檔批次預覽（${preview.items.length} 項）`,
    ...preview.items.map((item, index) => `${index + 1}. ${item.kind}｜${item.id}${item.dependsOn?.length ? `｜依賴：${item.dependsOn.join("、")}` : ""}`),
    `執行順序：${preview.executionOrder.join(" → ")}`,
    "尚未寫入。請回覆：確認全部 / 取消 / 修改後重新輸入主檔指令。",
  ].join("\n");
}

export function chapter12LineAdminUsage(kind: "finance" | "master"): string {
  return kind === "finance"
    ? "Finance 管理指令格式：財務修改 投資人 ID 名稱=新名稱 原因=原因；或財務批次 投資人 ID 名稱=新名稱 原因=原因 | 分紅 ID 淨利=100 警示覆寫=是 原因=原因。先預覽，回覆確認全部才寫入。"
    : "主檔管理指令格式：主檔批次 雞場 ID 名稱=新名稱 | 雞舍 ID 名稱=3舍 依賴=farm:ID；既有父項請用依賴=existing:farm:ID。先預覽，回覆確認全部才寫入。";
}
