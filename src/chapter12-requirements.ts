/**
 * Small, side-effect-free contracts shared by the Chapter 12 repairs.
 *
 * These functions deliberately describe validation and projections only. D1
 * writes, authentication, and canonical lineage remain owned by their
 * existing boundaries in web-api.ts and index.ts.
 */

export type FinanceMutationEntity =
  | "investor"
  | "farm_investor_equity"
  | "profit_distribution"
  | "profit_distribution_allocation";

export type FinanceMutationOperation = "update" | "delete";

export const FINANCE_MUTATION_FIELDS: Record<FinanceMutationEntity, readonly string[]> = {
  investor: ["name", "active"],
  farm_investor_equity: ["equityFraction", "source", "effectiveDate"],
  profit_distribution: ["distributionDate", "sourceDateRoc", "grossProfitLoss", "allocatedProfitLoss", "expense", "netIncome", "note", "sourceDataset", "sourceRowKey"],
  profit_distribution_allocation: ["amount"],
};

export const FINANCE_MUTATION_FIELD_COLUMNS: Record<string, string> = {
  equityFraction: "equity_fraction",
  effectiveDate: "effective_date",
  distributionDate: "distribution_date",
  sourceDateRoc: "source_date_roc",
  grossProfitLoss: "gross_profit_loss",
  allocatedProfitLoss: "allocated_profit_loss",
  sourceDataset: "source_dataset",
  sourceRowKey: "source_row_key",
};

export const FINANCE_MUTATION_TABLES: Record<FinanceMutationEntity, string> = {
  investor: "investors",
  farm_investor_equity: "farm_investor_equity",
  profit_distribution: "profit_distributions",
  profit_distribution_allocation: "profit_distribution_allocations",
};

export function financeMutationScopeFor(
  entityType: FinanceMutationEntity,
  entityId: string,
  organizationId: string,
): { sql: string; values: unknown[] } {
  if (entityType === "investor" || entityType === "profit_distribution") {
    return { sql: "id = ? AND organization_id = ?", values: [entityId, organizationId] };
  }
  if (entityType === "farm_investor_equity") {
    return {
      sql: `id = ? AND farm_id IN (SELECT id FROM farms WHERE organization_id = ?)
        AND investor_id IN (SELECT id FROM investors WHERE organization_id = ?)`,
      values: [entityId, organizationId, organizationId],
    };
  }
  return {
    sql: `id = ? AND distribution_id IN (SELECT id FROM profit_distributions WHERE organization_id = ?)
      AND investor_id IN (SELECT id FROM investors WHERE organization_id = ?)`,
    values: [entityId, organizationId, organizationId],
  };
}

export interface FinanceMutationRequest {
  entityType: FinanceMutationEntity;
  entityId: string;
  operation: FinanceMutationOperation;
  changes: Record<string, unknown>;
  reason: string;
  confirm: boolean;
  warningOverride?: boolean;
}

export interface FinanceMutationPlan {
  entityType: FinanceMutationEntity;
  entityId: string;
  operation: FinanceMutationOperation;
  before: Record<string, unknown>;
  after: Record<string, unknown> | null;
  changedFields: string[];
  requiresWarningOverride: boolean;
}

const FINANCE_ENTITIES = new Set<FinanceMutationEntity>([
  "investor",
  "farm_investor_equity",
  "profit_distribution",
  "profit_distribution_allocation",
]);

const FINANCE_OPERATIONS = new Set<FinanceMutationOperation>(["update", "delete"]);
const FINANCE_NUMERIC_FIELDS = new Set(["equityFraction", "grossProfitLoss", "allocatedProfitLoss", "expense", "netIncome", "amount"]);
const FINANCE_BOOLEAN_FIELDS = new Set(["active"]);

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= max && !/[\u0000-\u001F\u007F]/u.test(normalized)
    ? normalized
    : null;
}

export function validateFinanceMutationRequest(input: unknown): FinanceMutationRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("FINANCE_MUTATION_INPUT_INVALID");
  }
  const value = input as Record<string, unknown>;
  const entityType = boundedText(value.entityType, 80) as FinanceMutationEntity | null;
  const entityId = boundedText(value.entityId, 160);
  const operation = boundedText(value.operation, 20) as FinanceMutationOperation | null;
  const reason = boundedText(value.reason, 500);
  if (!entityType || !FINANCE_ENTITIES.has(entityType)) throw new Error("FINANCE_MUTATION_ENTITY_INVALID");
  if (!entityId) throw new Error("FINANCE_MUTATION_ENTITY_ID_INVALID");
  if (!operation || !FINANCE_OPERATIONS.has(operation)) throw new Error("FINANCE_MUTATION_OPERATION_INVALID");
  if (!reason) throw new Error("FINANCE_MUTATION_REASON_REQUIRED");
  if (value.confirm !== true) throw new Error("FINANCE_MUTATION_CONFIRMATION_REQUIRED");
  const changes = value.changes === undefined
    ? {}
    : typeof value.changes === "object" && value.changes !== null && !Array.isArray(value.changes)
      ? value.changes as Record<string, unknown>
      : null;
  if (!changes) throw new Error("FINANCE_MUTATION_CHANGES_INVALID");
  if (operation === "update" && Object.keys(changes).length === 0) throw new Error("FINANCE_MUTATION_CHANGES_REQUIRED");
  return {
    entityType,
    entityId,
    operation,
    changes,
    reason,
    confirm: true,
    warningOverride: value.warningOverride === true,
  };
}

export function validateFinanceMutationValues(request: FinanceMutationRequest): void {
  for (const [field, value] of Object.entries(request.changes)) {
    if (FINANCE_NUMERIC_FIELDS.has(field)) {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
      if (!Number.isFinite(number) || (field === "equityFraction" && (number < 0 || number > 1))) throw new Error("FINANCE_MUTATION_VALUE_INVALID");
    }
    if (FINANCE_BOOLEAN_FIELDS.has(field) && typeof value !== "boolean") throw new Error("FINANCE_MUTATION_VALUE_INVALID");
    if (typeof value === "string" && value.length > 1000) throw new Error("FINANCE_MUTATION_VALUE_INVALID");
  }
}

export function financeMutationPlan(
  request: FinanceMutationRequest,
  before: Record<string, unknown>,
  allowedFields: readonly string[],
  options: { enforceWarningOverride?: boolean } = {},
): FinanceMutationPlan {
  const allowed = new Set(allowedFields);
  const changedFields = Object.keys(request.changes).filter((field) => allowed.has(field));
  if (request.operation === "update" && changedFields.length !== Object.keys(request.changes).length) {
    throw new Error("FINANCE_MUTATION_FIELD_INVALID");
  }
  if (request.operation === "update" && !changedFields.some((field) => before[field] !== request.changes[field])) {
    throw new Error("FINANCE_MUTATION_NO_CHANGE");
  }
  const after = request.operation === "delete"
    ? null
    : { ...before, ...Object.fromEntries(changedFields.map((field) => [field, request.changes[field]])) };
  const requiresWarningOverride = request.entityType === "profit_distribution"
    && request.operation === "update"
    && ("netIncome" in request.changes || "grossProfitLoss" in request.changes || "expense" in request.changes);
  if (requiresWarningOverride && options.enforceWarningOverride !== false && !request.warningOverride) {
    throw new Error("FINANCE_WARNING_OVERRIDE_REQUIRED");
  }
  return {
    entityType: request.entityType,
    entityId: request.entityId,
    operation: request.operation,
    before,
    after,
    changedFields,
    requiresWarningOverride,
  };
}

export interface MasterBatchItem {
  kind: "farm" | "house" | "flock";
  id: string;
  changes: Record<string, unknown>;
  dependsOn?: string[];
}

export interface MasterBatchPreview {
  items: MasterBatchItem[];
  dependencies: string[];
  executionOrder: string[];
  conflicts: string[];
  safe: boolean;
}

export function masterBatchPreview(input: unknown): MasterBatchPreview {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) throw new Error("MASTER_BATCH_INVALID");
  const items: MasterBatchItem[] = [];
  const conflicts: string[] = [];
  const dependencies = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      conflicts.push("item_invalid");
      continue;
    }
    const value = raw as Record<string, unknown>;
    const kind = value.kind;
    const id = boundedText(value.id, 160);
    const changes = value.changes;
    if ((kind !== "farm" && kind !== "house" && kind !== "flock") || !id
      || typeof changes !== "object" || changes === null || Array.isArray(changes)) {
      conflicts.push("item_invalid");
      continue;
    }
    const dependsOn = Array.isArray(value.dependsOn)
      ? value.dependsOn.filter((dependency): dependency is string => typeof dependency === "string" && Boolean(boundedText(dependency, 160)))
      : [];
    if (dependsOn.length !== (Array.isArray(value.dependsOn) ? value.dependsOn.length : 0)) conflicts.push("dependency_invalid");
    const item = { kind, id, changes: changes as Record<string, unknown>, ...(dependsOn.length ? { dependsOn } : {}) } as MasterBatchItem;
    items.push(item);
    if (kind === "house" || kind === "flock") {
      if (!dependsOn.length) conflicts.push("parent_dependency_missing");
      for (const dependency of dependsOn) dependencies.add(dependency);
    }
  }
  const itemKeys = new Set(items.map((item) => `${item.kind}:${item.id}`));
  if (itemKeys.size !== items.length) conflicts.push("duplicate_target");
  for (const dependency of dependencies) {
    // `existing:<kind>:<id>` is an explicit reference to an already-existing
    // parent. Every other dependency must be present in this preview so the
    // operator can see the complete dependency/order contract before confirming.
    if (dependency.startsWith("existing:")) {
      const reference = dependency.slice("existing:".length);
      const separator = reference.indexOf(":");
      const kind = separator > 0 ? reference.slice(0, separator) : "";
      const id = separator > 0 ? reference.slice(separator + 1) : "";
      if (!(kind === "farm" || kind === "house" || kind === "flock") || !id) conflicts.push("dependency_target_invalid");
      continue;
    }
    const separator = dependency.indexOf(":");
    const kind = separator > 0 ? dependency.slice(0, separator) : "";
    const id = separator > 0 ? dependency.slice(separator + 1) : "";
    if (!(kind === "farm" || kind === "house" || kind === "flock") || !id || !itemKeys.has(`${kind}:${id}`)) {
      conflicts.push("dependency_target_missing");
    }
  }
  const itemByKey = new Map(items.map((item) => [`${item.kind}:${item.id}`, item]));
  const indegree = new Map<string, number>(items.map((item) => [`${item.kind}:${item.id}`, 0]));
  const dependents = new Map<string, string[]>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    for (const dependency of item.dependsOn ?? []) {
      if (dependency.startsWith("existing:") || !itemByKey.has(dependency)) continue;
      indegree.set(key, (indegree.get(key) ?? 0) + 1);
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), key]);
    }
  }
  const ready = items
    .map((item) => `${item.kind}:${item.id}`)
    .filter((key) => indegree.get(key) === 0);
  const executionOrder: string[] = [];
  while (ready.length) {
    const key = ready.shift() as string;
    executionOrder.push(key);
    for (const dependent of dependents.get(key) ?? []) {
      const next = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
  }
  if (executionOrder.length !== items.length) conflicts.push("dependency_cycle");
  return { items, dependencies: [...dependencies], executionOrder, conflicts, safe: conflicts.length === 0 && items.length > 0 };
}

export type RecalculationState = "STABLE" | "RECALCULATING";

export function recalculationStateFor(workItemCount: number, largeThreshold = 100): RecalculationState {
  if (!Number.isFinite(workItemCount) || workItemCount < 0) throw new Error("RECALCULATION_COUNT_INVALID");
  return workItemCount > largeThreshold ? "RECALCULATING" : "STABLE";
}

export interface OneWaterPendingBoundaryInput {
  stock: number | null;
  lifecycleStatus: "ACTIVE" | "EMPTY_AWAITING_CLEANING" | "READY_NEXT_INTAKE" | "INCOMPLETE";
  unresolvedPendingCount: number;
  pendingReminderCount: number;
}

export interface OneWaterPendingBoundary {
  status: "OPEN" | "CLOSED";
  unresolvedPendingCount: number;
  finalSummaryRequired: boolean;
  remindersActive: boolean;
  historyRetained: true;
}

export function deriveOneWaterPendingBoundary(input: OneWaterPendingBoundaryInput): OneWaterPendingBoundary {
  if (!Number.isInteger(input.unresolvedPendingCount) || input.unresolvedPendingCount < 0) {
    throw new Error("ONE_WATER_PENDING_COUNT_INVALID");
  }
  if (!Number.isInteger(input.pendingReminderCount) || input.pendingReminderCount < 0) {
    throw new Error("ONE_WATER_REMINDER_COUNT_INVALID");
  }
  const closed = input.stock === 0
    && (input.lifecycleStatus === "EMPTY_AWAITING_CLEANING" || input.lifecycleStatus === "READY_NEXT_INTAKE");
  return {
    status: closed ? "CLOSED" : "OPEN",
    unresolvedPendingCount: input.unresolvedPendingCount,
    finalSummaryRequired: closed && input.unresolvedPendingCount > 0,
    remindersActive: !closed && input.pendingReminderCount > 0,
    historyRetained: true,
  };
}

export function closeOnlySessionPolicy(trigger: "pagehide" | "logout" | "admin_revoke"): {
  revoke: true;
  auditAction: "client_close" | "logout" | "revoke";
} {
  return { revoke: true, auditAction: trigger === "pagehide" ? "client_close" : trigger === "logout" ? "logout" : "revoke" };
}
