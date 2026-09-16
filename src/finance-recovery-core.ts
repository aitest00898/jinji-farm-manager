import { RecoveryCoreError } from "./audit-recovery-core";
import { assertCanonicalWritesOpen } from "./recording-write-adapter";

export type FinanceRecoveryEnvironment = "production" | "test";
export type FinanceRecoveryTargetType = "farm_investor_equity" | "profit_distribution";

export interface FinanceRecoveryEnv {
  DB: D1Database;
  CANONICAL_WRITE_HOLD?: string;
}

export interface FinanceRecoveryContext {
  organizationId: string;
  actorType: "web_admin";
  actorId: string;
  requestId: string;
}

export interface FinanceRecoveryRequest {
  environment: FinanceRecoveryEnvironment;
  auditId: string;
  targetType: FinanceRecoveryTargetType;
  targetId: string;
  clientOperationId: string;
  reason: string;
}

export interface FinanceRecoveryApplyRequest extends FinanceRecoveryRequest {
  stateFingerprint: string;
  dryRunToken: string;
}

export interface FinanceRecoveryDiscoverRequest {
  environment: FinanceRecoveryEnvironment;
  targetType?: FinanceRecoveryTargetType;
  targetId?: string;
}

type FinanceRecoveryOverride =
  | { targetType: "farm_investor_equity"; state: FinanceEquityState }
  | { targetType: "profit_distribution"; state: FinanceDistributionState };

export interface FinanceEquityState {
  id: string;
  farmId: string;
  investorId: string;
  equityFraction: number;
  source: string;
  effectiveDate: string | null;
}

export interface FinanceAllocationState {
  id: string;
  distributionId: string;
  investorId: string;
  amount: number;
}

export interface FinanceDistributionState {
  id: string;
  organizationId: string;
  farmId: string;
  distributionDate: string;
  sourceDateRoc: string;
  grossProfitLoss: number;
  allocatedProfitLoss: number;
  expense: number;
  netIncome: number;
  note: string | null;
  sourceDataset: string;
  sourceRowKey: string;
  allocations: FinanceAllocationState[];
}

export type FinanceRecoveryState = FinanceEquityState | FinanceDistributionState;

export interface FinanceDerivedState {
  portfolio: {
    gross: number;
    allocated: number;
    expense: number;
    net: number;
  };
  farms: Array<{
    farmId: string;
    gross: number;
    allocated: number;
    expense: number;
    net: number;
  }>;
  allocationTotals: Array<{
    distributionId: string;
    allocated: number;
    allocationTotal: number;
    consistent: boolean;
  }>;
  equityByFarm: Array<{
    farmId: string;
    total: number;
    farmLimit: number;
    consistent: boolean;
  }>;
}

export interface FinanceRecoveryDependency {
  id: string;
  entityType: FinanceRecoveryTargetType | "profit_distribution_allocation" | "derived_finance";
  relation: "target" | "dependency_required" | "derived_projection";
  required: boolean;
}

export interface FinanceRecoveryPlan {
  operation: "finance_recovery";
  environment: FinanceRecoveryEnvironment;
  auditId: string;
  targetType: FinanceRecoveryTargetType;
  targetId: string;
  before: FinanceRecoveryState;
  current: FinanceRecoveryState;
  proposedAfter: FinanceRecoveryState | null;
  dependencies: FinanceRecoveryDependency[];
  dependencyImpact: {
    kind: "ISOLATED" | "DEPENDENCY_AWARE";
    affectedEntityTypes: string[];
  };
  derivedBefore: FinanceDerivedState;
  derivedAfter: FinanceDerivedState | null;
  conflicts: string[];
  applyEligibility: "ELIGIBLE" | "BLOCKED";
  stateFingerprint: string;
  dryRunToken: string;
}

export interface FinanceRecoveryCandidate {
  auditId: string;
  targetType: FinanceRecoveryTargetType;
  targetId: string;
  createdAt: string;
  action: string;
  recoverable: boolean;
}

export interface FinanceRecoveryDiscoverResult {
  operation: "finance_recovery";
  environment: FinanceRecoveryEnvironment;
  supportedDomains: FinanceRecoveryTargetType[];
  candidates: FinanceRecoveryCandidate[];
}

export type FinanceRecoveryApplyStatus = "APPLIED" | "STALE_STATE" | "BLOCKED" | "FAILED";

export interface FinanceRecoveryApplyResult {
  operation: "finance_recovery";
  status: FinanceRecoveryApplyStatus;
  applied: boolean;
  idempotent: boolean;
  environment: FinanceRecoveryEnvironment;
  auditId: string;
  targetType: FinanceRecoveryTargetType;
  targetId: string;
  recoveryAuditId: string | null;
  conflicts: string[];
  authoritativeReadback: {
    state: FinanceRecoveryState;
    derived: FinanceDerivedState;
  } | null;
  plan: FinanceRecoveryPlan | null;
}

interface FinanceAuditRow {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
}

interface FinanceTargetRow {
  environment: string;
  organizationId: string;
  farmId: string;
  state: FinanceRecoveryState;
}

interface FinanceDistributionRow {
  id: string;
  organizationId: string;
  farmId: string;
  distributionDate: string;
  sourceDateRoc: string;
  grossProfitLoss: number;
  allocatedProfitLoss: number;
  expense: number;
  netIncome: number;
  note: string | null;
  sourceDataset: string;
  sourceRowKey: string;
  environment: string;
}

interface FinanceAllocationRow {
  id: string;
  distributionId: string;
  investorId: string;
  amount: number;
}

interface FinanceEquityRow {
  id: string;
  farmId: string;
  investorId: string;
  equityFraction: number;
  source: string;
  effectiveDate: string | null;
  environment: string;
}

interface FinanceFarmRow {
  id: string;
  farmTotalEquityFraction: number;
  environment: string;
}

const FINANCE_OPERATION = "finance_recovery" as const;
const SUPPORTED_TARGETS: FinanceRecoveryTargetType[] = ["farm_investor_equity", "profit_distribution"];
const MAX_DISCOVERY_CANDIDATES = 100;
const EPSILON = 1e-8;

function fail(code: string, status = 400): never {
  throw new RecoveryCoreError(code, status);
}

function text(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string") fail(`FINANCE_${field.toUpperCase()}_INVALID`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001F\u007F]/u.test(trimmed)) fail(`FINANCE_${field.toUpperCase()}_INVALID`);
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function field(record: Record<string, unknown>, camel: string, snake = camel): unknown {
  return record[camel] ?? record[snake];
}

function jsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function sameString(left: string | null, right: string | null): boolean {
  return left === right;
}

function sameEquity(left: FinanceEquityState, right: FinanceEquityState): boolean {
  return left.id === right.id
    && left.farmId === right.farmId
    && left.investorId === right.investorId
    && approximatelyEqual(left.equityFraction, right.equityFraction)
    && left.source === right.source
    && sameString(left.effectiveDate, right.effectiveDate);
}

function sameAllocation(left: FinanceAllocationState, right: FinanceAllocationState): boolean {
  return left.id === right.id
    && left.distributionId === right.distributionId
    && left.investorId === right.investorId
    && approximatelyEqual(left.amount, right.amount);
}

function sameDistribution(left: FinanceDistributionState, right: FinanceDistributionState): boolean {
  if (left.id !== right.id
    || left.organizationId !== right.organizationId
    || left.farmId !== right.farmId
    || left.distributionDate !== right.distributionDate
    || left.sourceDateRoc !== right.sourceDateRoc
    || !approximatelyEqual(left.grossProfitLoss, right.grossProfitLoss)
    || !approximatelyEqual(left.allocatedProfitLoss, right.allocatedProfitLoss)
    || !approximatelyEqual(left.expense, right.expense)
    || !approximatelyEqual(left.netIncome, right.netIncome)
    || !sameString(left.note, right.note)
    || left.sourceDataset !== right.sourceDataset
    || left.sourceRowKey !== right.sourceRowKey
    || left.allocations.length !== right.allocations.length) return false;
  const rightById = new Map(right.allocations.map((allocation) => [allocation.id, allocation]));
  return left.allocations.every((allocation) => {
    const other = rightById.get(allocation.id);
    return Boolean(other && sameAllocation(allocation, other));
  });
}

function sameState(left: FinanceRecoveryState, right: FinanceRecoveryState): boolean {
  return "equityFraction" in left && "equityFraction" in right
    ? sameEquity(left, right)
    : "allocations" in left && "allocations" in right
      ? sameDistribution(left, right)
      : false;
}

function validateEnvironment(environment: unknown): FinanceRecoveryEnvironment {
  if (environment !== "production" && environment !== "test") fail("FINANCE_ENVIRONMENT_INVALID");
  return environment;
}

function validateTargetType(value: unknown): FinanceRecoveryTargetType {
  if (value !== "farm_investor_equity" && value !== "profit_distribution") fail("FINANCE_TARGET_TYPE_INVALID");
  return value;
}

function validateRequest(input: FinanceRecoveryRequest | FinanceRecoveryApplyRequest): FinanceRecoveryRequest {
  return {
    environment: validateEnvironment(input.environment),
    auditId: text(input.auditId, "audit_id", 240),
    targetType: validateTargetType(input.targetType),
    targetId: text(input.targetId, "target_id", 240),
    clientOperationId: text(input.clientOperationId, "client_operation_id", 240),
    reason: text(input.reason, "reason", 500),
  };
}

function parseEquity(value: unknown, targetId: string): FinanceEquityState | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = field(row, "id");
  const farmId = field(row, "farmId", "farm_id");
  const investorId = field(row, "investorId", "investor_id");
  const source = field(row, "source");
  if (typeof id !== "string" || id !== targetId || typeof farmId !== "string" || typeof investorId !== "string" || typeof source !== "string") return null;
  const effectiveDate = field(row, "effectiveDate", "effective_date");
  const fraction = Number(field(row, "equityFraction", "equity_fraction"));
  if (!Number.isFinite(fraction) || (effectiveDate !== null && effectiveDate !== undefined && typeof effectiveDate !== "string")) return null;
  return {
    id,
    farmId,
    investorId,
    equityFraction: fraction,
    source,
    effectiveDate: effectiveDate === null || effectiveDate === undefined ? null : effectiveDate,
  };
}

function parseAllocation(value: unknown, distributionId: string): FinanceAllocationState | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = field(row, "id");
  const rowDistributionId = field(row, "distributionId", "distribution_id");
  const investorId = field(row, "investorId", "investor_id");
  const amount = Number(field(row, "amount"));
  if (typeof id !== "string" || typeof rowDistributionId !== "string" || rowDistributionId !== distributionId || typeof investorId !== "string" || !Number.isFinite(amount)) return null;
  return { id, distributionId, investorId, amount };
}

function parseDistribution(value: unknown, targetId: string): FinanceDistributionState | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = field(row, "id");
  const organizationId = field(row, "organizationId", "organization_id");
  const farmId = field(row, "farmId", "farm_id");
  const distributionDate = field(row, "distributionDate", "distribution_date");
  const sourceDateRoc = field(row, "sourceDateRoc", "source_date_roc");
  const sourceDataset = field(row, "sourceDataset", "source_dataset");
  const sourceRowKey = field(row, "sourceRowKey", "source_row_key");
  const allocationsValue = field(row, "allocations");
  if (typeof id !== "string" || id !== targetId || typeof organizationId !== "string" || typeof farmId !== "string"
    || typeof distributionDate !== "string" || typeof sourceDateRoc !== "string" || typeof sourceDataset !== "string" || typeof sourceRowKey !== "string"
    || !Array.isArray(allocationsValue)) return null;
  const allocations = allocationsValue.map((allocation) => parseAllocation(allocation, id));
  if (allocations.some((allocation): allocation is null => allocation === null)) return null;
  const note = field(row, "note");
  if (note !== null && note !== undefined && typeof note !== "string") return null;
  return {
    id,
    organizationId,
    farmId,
    distributionDate,
    sourceDateRoc,
    grossProfitLoss: Number(field(row, "grossProfitLoss", "gross_profit_loss")),
    allocatedProfitLoss: Number(field(row, "allocatedProfitLoss", "allocated_profit_loss")),
    expense: Number(field(row, "expense")),
    netIncome: Number(field(row, "netIncome", "net_income")),
    note: note === null || note === undefined ? null : note,
    sourceDataset,
    sourceRowKey,
    allocations: allocations as FinanceAllocationState[],
  };
}

function validateEquityState(state: FinanceEquityState, farmLimit: number | null): string[] {
  const conflicts: string[] = [];
  if (!Number.isFinite(state.equityFraction) || state.equityFraction < 0 || state.equityFraction > 1) conflicts.push("FINANCE_EQUITY_FRACTION_INVALID");
  if (!state.source.trim()) conflicts.push("FINANCE_EQUITY_SOURCE_INVALID");
  if (farmLimit !== null && (!Number.isFinite(farmLimit) || farmLimit < 0 || farmLimit > 1)) conflicts.push("FINANCE_FARM_EQUITY_LIMIT_INVALID");
  return conflicts;
}

function validateDistributionState(state: FinanceDistributionState): string[] {
  const conflicts: string[] = [];
  const numbers = [state.grossProfitLoss, state.allocatedProfitLoss, state.expense, state.netIncome];
  if (numbers.some((value) => !Number.isFinite(value))) conflicts.push("FINANCE_NUMBER_INVALID");
  if (Number.isFinite(state.expense) && state.expense < 0) conflicts.push("FINANCE_EXPENSE_NEGATIVE");
  if (Number.isFinite(state.allocatedProfitLoss) && Number.isFinite(state.expense) && Number.isFinite(state.netIncome)
    && !approximatelyEqual(state.netIncome, state.allocatedProfitLoss - state.expense)) conflicts.push("FINANCE_NET_INCOME_INCONSISTENT");
  const investorIds = new Set<string>();
  const allocationIds = new Set<string>();
  let total = 0;
  for (const allocation of state.allocations) {
    if (allocationIds.has(allocation.id)) conflicts.push("FINANCE_DUPLICATE_ALLOCATION");
    allocationIds.add(allocation.id);
    if (investorIds.has(allocation.investorId)) conflicts.push("FINANCE_DUPLICATE_INVESTOR_ALLOCATION");
    investorIds.add(allocation.investorId);
    if (!Number.isFinite(allocation.amount)) conflicts.push("FINANCE_ALLOCATION_AMOUNT_INVALID");
    total += allocation.amount;
  }
  if (Number.isFinite(state.allocatedProfitLoss) && !approximatelyEqual(total, state.allocatedProfitLoss)) conflicts.push("FINANCE_ALLOCATION_TOTAL_INCONSISTENT");
  if (!state.sourceRowKey.trim() || !state.sourceDataset.trim()) conflicts.push("FINANCE_SOURCE_IDENTITY_INVALID");
  return conflicts;
}

function stateIdentityConflicts(before: FinanceRecoveryState, after: FinanceRecoveryState, organizationId: string): string[] {
  if ("equityFraction" in before && "equityFraction" in after) {
    return before.id === after.id && before.farmId === after.farmId && before.investorId === after.investorId
      ? []
      : ["FINANCE_IDENTITY_CHANGE_UNSUPPORTED"];
  }
  if (!("allocations" in before) || !("allocations" in after)) return ["FINANCE_TARGET_TYPE_MISMATCH"];
  const conflicts: string[] = [];
  if (before.id !== after.id || before.organizationId !== after.organizationId || before.organizationId !== organizationId || before.farmId !== after.farmId
    || before.distributionDate !== after.distributionDate || before.sourceDateRoc !== after.sourceDateRoc
    || before.sourceDataset !== after.sourceDataset || before.sourceRowKey !== after.sourceRowKey) conflicts.push("FINANCE_IDENTITY_CHANGE_UNSUPPORTED");
  const beforeIds = new Set(before.allocations.map((allocation) => allocation.id));
  const afterIds = new Set(after.allocations.map((allocation) => allocation.id));
  if (beforeIds.size !== afterIds.size || [...beforeIds].some((id) => !afterIds.has(id))) conflicts.push("FINANCE_DEPENDENCY_SHAPE_UNSUPPORTED");
  return conflicts;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function financeRecoveryAuditId(clientOperationId: string): Promise<string> {
  return `audit-finance-recovery-${(await sha256Hex(clientOperationId)).slice(0, 48)}`;
}

async function financeStateFingerprint(targetType: FinanceRecoveryTargetType, state: FinanceRecoveryState): Promise<string> {
  return sha256Hex(JSON.stringify({ targetType, state }));
}

async function financeDryRunToken(
  organizationId: string,
  request: FinanceRecoveryRequest,
  stateFingerprint: string,
): Promise<string> {
  return sha256Hex(JSON.stringify({ operation: FINANCE_OPERATION, organizationId, auditId: request.auditId, targetType: request.targetType, targetId: request.targetId, clientOperationId: request.clientOperationId, stateFingerprint }));
}

async function readFinanceAudit(env: FinanceRecoveryEnv, organizationId: string, request: FinanceRecoveryRequest): Promise<FinanceAuditRow> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId, entity_type AS entityType, entity_id AS entityId,
            action, before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
       FROM audit_logs
      WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(request.auditId, organizationId).first<FinanceAuditRow>();
  if (!row) fail("FINANCE_AUDIT_NOT_FOUND", 404);
  if (!SUPPORTED_TARGETS.includes(row.entityType as FinanceRecoveryTargetType) || row.entityType !== request.targetType || row.entityId !== request.targetId) fail("FINANCE_AUDIT_TARGET_MISMATCH");
  if (!row.beforeJson || !row.afterJson) fail("FINANCE_AUDIT_SNAPSHOT_MISSING");
  return row;
}

async function readCurrentTarget(
  env: FinanceRecoveryEnv,
  organizationId: string,
  targetType: FinanceRecoveryTargetType,
  targetId: string,
  environment: FinanceRecoveryEnvironment,
): Promise<FinanceTargetRow> {
  if (targetType === "farm_investor_equity") {
    const row = await env.DB.prepare(
      `SELECT e.id, e.farm_id AS farmId, e.investor_id AS investorId,
              e.equity_fraction AS equityFraction, e.source, e.effective_date AS effectiveDate,
              f.organization_id AS organizationId, f.environment
         FROM farm_investor_equity e JOIN farms f ON f.id = e.farm_id
        WHERE e.id = ? AND f.organization_id = ? LIMIT 1`,
    ).bind(targetId, organizationId).first<FinanceEquityRow & { organizationId: string }>();
    if (!row) fail("FINANCE_TARGET_NOT_FOUND", 404);
    if (row.environment !== environment) fail("FINANCE_ENVIRONMENT_SCOPE_INVALID");
    return {
      environment: row.environment,
      organizationId: row.organizationId,
      farmId: row.farmId,
      state: {
        id: row.id,
        farmId: row.farmId,
        investorId: row.investorId,
        equityFraction: Number(row.equityFraction),
        source: row.source,
        effectiveDate: row.effectiveDate ?? null,
      },
    };
  }
  const row = await env.DB.prepare(
    `SELECT d.id, d.organization_id AS organizationId, d.farm_id AS farmId,
            d.distribution_date AS distributionDate, d.source_date_roc AS sourceDateRoc,
            d.gross_profit_loss AS grossProfitLoss, d.allocated_profit_loss AS allocatedProfitLoss,
            d.expense, d.net_income AS netIncome, d.note, d.source_dataset AS sourceDataset,
            d.source_row_key AS sourceRowKey, f.environment
       FROM profit_distributions d JOIN farms f ON f.id = d.farm_id
      WHERE d.id = ? AND d.organization_id = ? LIMIT 1`,
  ).bind(targetId, organizationId).first<FinanceDistributionRow>();
  if (!row) fail("FINANCE_TARGET_NOT_FOUND", 404);
  if (row.environment !== environment) fail("FINANCE_ENVIRONMENT_SCOPE_INVALID");
  const allocations = await env.DB.prepare(
    `SELECT a.id, a.distribution_id AS distributionId, a.investor_id AS investorId, a.amount
       FROM profit_distribution_allocations a
      WHERE a.distribution_id = ? ORDER BY a.id`,
  ).bind(targetId).all<FinanceAllocationRow>();
  return {
    environment: row.environment,
    organizationId: row.organizationId,
    farmId: row.farmId,
    state: {
      id: row.id,
      organizationId: row.organizationId,
      farmId: row.farmId,
      distributionDate: row.distributionDate,
      sourceDateRoc: row.sourceDateRoc,
      grossProfitLoss: Number(row.grossProfitLoss),
      allocatedProfitLoss: Number(row.allocatedProfitLoss),
      expense: Number(row.expense),
      netIncome: Number(row.netIncome),
      note: row.note ?? null,
      sourceDataset: row.sourceDataset,
      sourceRowKey: row.sourceRowKey,
      allocations: allocations.results.map((allocation) => ({
        id: allocation.id,
        distributionId: allocation.distributionId,
        investorId: allocation.investorId,
        amount: Number(allocation.amount),
      })),
    },
  };
}

async function readFinanceDerived(
  env: FinanceRecoveryEnv,
  organizationId: string,
  environment: FinanceRecoveryEnvironment,
  override: FinanceRecoveryOverride | null = null,
): Promise<FinanceDerivedState> {
  const distributions = await env.DB.prepare(
    `SELECT d.id, d.organization_id AS organizationId, d.farm_id AS farmId,
            d.distribution_date AS distributionDate, d.source_date_roc AS sourceDateRoc,
            d.gross_profit_loss AS grossProfitLoss, d.allocated_profit_loss AS allocatedProfitLoss,
            d.expense, d.net_income AS netIncome, d.note, d.source_dataset AS sourceDataset,
            d.source_row_key AS sourceRowKey, f.environment
       FROM profit_distributions d JOIN farms f ON f.id = d.farm_id
      WHERE d.organization_id = ? AND f.environment = ? ORDER BY d.id`,
  ).bind(organizationId, environment).all<FinanceDistributionRow>();
  const allocationRows = await env.DB.prepare(
    `SELECT a.id, a.distribution_id AS distributionId, a.investor_id AS investorId, a.amount
       FROM profit_distribution_allocations a
       JOIN profit_distributions d ON d.id = a.distribution_id
       JOIN farms f ON f.id = d.farm_id
      WHERE d.organization_id = ? AND f.environment = ? ORDER BY a.id`,
  ).bind(organizationId, environment).all<FinanceAllocationRow>();
  const allocationsByDistribution = new Map<string, FinanceAllocationState[]>();
  for (const allocation of allocationRows.results) {
    const list = allocationsByDistribution.get(allocation.distributionId) ?? [];
    list.push({ id: allocation.id, distributionId: allocation.distributionId, investorId: allocation.investorId, amount: Number(allocation.amount) });
    allocationsByDistribution.set(allocation.distributionId, list);
  }
  let snapshots: FinanceDistributionState[] = distributions.results.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    farmId: row.farmId,
    distributionDate: row.distributionDate,
    sourceDateRoc: row.sourceDateRoc,
    grossProfitLoss: Number(row.grossProfitLoss),
    allocatedProfitLoss: Number(row.allocatedProfitLoss),
    expense: Number(row.expense),
    netIncome: Number(row.netIncome),
    note: row.note ?? null,
    sourceDataset: row.sourceDataset,
    sourceRowKey: row.sourceRowKey,
    allocations: [...(allocationsByDistribution.get(row.id) ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
  }));
  if (override?.targetType === "profit_distribution") {
    snapshots = snapshots.map((snapshot) => snapshot.id === override.state.id ? override.state : snapshot);
  }
  const farms = new Map<string, { gross: number; allocated: number; expense: number; net: number }>();
  const portfolio = { gross: 0, allocated: 0, expense: 0, net: 0 };
  const allocationTotals = snapshots.map((snapshot) => {
    const farm = farms.get(snapshot.farmId) ?? { gross: 0, allocated: 0, expense: 0, net: 0 };
    farm.gross += snapshot.grossProfitLoss;
    farm.allocated += snapshot.allocatedProfitLoss;
    farm.expense += snapshot.expense;
    farm.net += snapshot.netIncome;
    farms.set(snapshot.farmId, farm);
    portfolio.gross += snapshot.grossProfitLoss;
    portfolio.allocated += snapshot.allocatedProfitLoss;
    portfolio.expense += snapshot.expense;
    portfolio.net += snapshot.netIncome;
    const allocationTotal = snapshot.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    return {
      distributionId: snapshot.id,
      allocated: snapshot.allocatedProfitLoss,
      allocationTotal,
      consistent: approximatelyEqual(allocationTotal, snapshot.allocatedProfitLoss),
    };
  }).sort((left, right) => left.distributionId.localeCompare(right.distributionId));
  const equityRows = await env.DB.prepare(
    `SELECT e.id, e.farm_id AS farmId, e.investor_id AS investorId,
            e.equity_fraction AS equityFraction, e.source, e.effective_date AS effectiveDate,
            f.environment
       FROM farm_investor_equity e JOIN farms f ON f.id = e.farm_id
      WHERE f.organization_id = ? AND f.environment = ? ORDER BY e.id`,
  ).bind(organizationId, environment).all<FinanceEquityRow>();
  const farmRows = await env.DB.prepare(
    `SELECT id, farm_total_equity_fraction AS farmTotalEquityFraction, environment
       FROM farms WHERE organization_id = ? AND environment = ? ORDER BY id`,
  ).bind(organizationId, environment).all<FinanceFarmRow>();
  const equityTotals = new Map<string, number>();
  for (const row of equityRows.results) equityTotals.set(row.farmId, (equityTotals.get(row.farmId) ?? 0) + Number(row.equityFraction));
  if (override?.targetType === "farm_investor_equity") {
    const current = equityRows.results.find((row) => row.id === override.state.id);
    if (current) equityTotals.set(current.farmId, (equityTotals.get(current.farmId) ?? 0) - Number(current.equityFraction) + override.state.equityFraction);
  }
  return {
    portfolio,
    farms: [...farms.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([farmId, values]) => ({ farmId, ...values })),
    allocationTotals,
    equityByFarm: farmRows.results.map((row) => {
      const total = equityTotals.get(row.id) ?? 0;
      const farmLimit = Number(row.farmTotalEquityFraction);
      return { farmId: row.id, total, farmLimit, consistent: Number.isFinite(total) && total >= -EPSILON && total <= farmLimit + EPSILON };
    }),
  };
}

function dependenciesFor(targetType: FinanceRecoveryTargetType, state: FinanceRecoveryState): FinanceRecoveryDependency[] {
  if (targetType === "farm_investor_equity") {
    return [
      { id: state.id, entityType: "farm_investor_equity", relation: "target", required: true },
      { id: `farm-equity:${state.farmId}`, entityType: "derived_finance", relation: "derived_projection", required: true },
    ];
  }
  if (!("allocations" in state)) return [];
  return [
    { id: state.id, entityType: "profit_distribution", relation: "target", required: true },
    ...state.allocations.map((allocation) => ({ id: allocation.id, entityType: "profit_distribution_allocation" as const, relation: "dependency_required" as const, required: true })),
    { id: `distribution-derived:${state.id}`, entityType: "derived_finance", relation: "derived_projection", required: true },
  ];
}

function dependencyImpactFor(targetType: FinanceRecoveryTargetType): FinanceRecoveryPlan["dependencyImpact"] {
  return targetType === "farm_investor_equity"
    ? { kind: "ISOLATED", affectedEntityTypes: ["farm_investor_equity", "derived_finance"] }
    : { kind: "DEPENDENCY_AWARE", affectedEntityTypes: ["profit_distribution", "profit_distribution_allocation", "derived_finance"] };
}

async function buildFinancePlan(
  env: FinanceRecoveryEnv,
  context: FinanceRecoveryContext,
  input: FinanceRecoveryRequest,
): Promise<FinanceRecoveryPlan> {
  const request = validateRequest(input);
  const audit = await readFinanceAudit(env, context.organizationId, request);
  const target = await readCurrentTarget(env, context.organizationId, request.targetType, request.targetId, request.environment);
  const historicalBefore: FinanceRecoveryState | null = request.targetType === "farm_investor_equity"
    ? parseEquity(jsonParse(audit.beforeJson), request.targetId)
    : parseDistribution(jsonParse(audit.beforeJson), request.targetId);
  const historicalAfter: FinanceRecoveryState | null = request.targetType === "farm_investor_equity"
    ? parseEquity(jsonParse(audit.afterJson), request.targetId)
    : parseDistribution(jsonParse(audit.afterJson), request.targetId);
  const conflicts: string[] = [];
  if (!historicalBefore || !historicalAfter) conflicts.push("FINANCE_AUDIT_SNAPSHOT_INVALID");
  if (historicalBefore && historicalAfter) {
    conflicts.push(...stateIdentityConflicts(historicalBefore, historicalAfter, context.organizationId));
    if (request.targetType === "farm_investor_equity"
      && "equityFraction" in historicalBefore && "equityFraction" in historicalAfter) {
      const beforeLimit = (await readFinanceDerived(
        env,
        context.organizationId,
        request.environment,
        { targetType: request.targetType, state: historicalBefore },
      )).equityByFarm.find((row) => row.farmId === historicalBefore.farmId)?.farmLimit ?? null;
      conflicts.push(...validateEquityState(historicalBefore, beforeLimit));
      conflicts.push(...validateEquityState(historicalAfter, beforeLimit));
    } else if (request.targetType === "profit_distribution"
      && "allocations" in historicalBefore && "allocations" in historicalAfter) {
      conflicts.push(...validateDistributionState(historicalBefore));
      conflicts.push(...validateDistributionState(historicalAfter));
    }
    if (!sameState(target.state, historicalAfter)) conflicts.push("FINANCE_TARGET_STATE_CONFLICT");
  }
  const derivedBefore = await readFinanceDerived(env, context.organizationId, request.environment);
  const proposedAfter = historicalBefore;
  const derivedAfter = proposedAfter && !conflicts.includes("FINANCE_AUDIT_SNAPSHOT_INVALID")
    ? request.targetType === "farm_investor_equity" && "equityFraction" in proposedAfter
      ? await readFinanceDerived(env, context.organizationId, request.environment, { targetType: request.targetType, state: proposedAfter })
      : request.targetType === "profit_distribution" && "allocations" in proposedAfter
        ? await readFinanceDerived(env, context.organizationId, request.environment, { targetType: request.targetType, state: proposedAfter })
        : null
    : null;
  if (derivedAfter) {
    const equityIssue = derivedAfter.equityByFarm.find((row) => !row.consistent);
    const allocationIssue = derivedAfter.allocationTotals.find((row) => !row.consistent);
    if (equityIssue) conflicts.push("FINANCE_EQUITY_CONSTRAINT_INVALID");
    if (allocationIssue) conflicts.push("FINANCE_DERIVED_ALLOCATION_INCONSISTENT");
  }
  const stateFingerprint = await financeStateFingerprint(request.targetType, target.state);
  const dryRunToken = await financeDryRunToken(context.organizationId, request, stateFingerprint);
  return {
    operation: FINANCE_OPERATION,
    environment: request.environment,
    auditId: request.auditId,
    targetType: request.targetType,
    targetId: request.targetId,
    before: target.state,
    current: target.state,
    proposedAfter,
    dependencies: dependenciesFor(request.targetType, historicalAfter ?? target.state),
    dependencyImpact: dependencyImpactFor(request.targetType),
    derivedBefore,
    derivedAfter,
    conflicts: [...new Set(conflicts)],
    applyEligibility: conflicts.length ? "BLOCKED" : "ELIGIBLE",
    stateFingerprint,
    dryRunToken,
  };
}

export async function discoverFinanceRecovery(
  env: FinanceRecoveryEnv,
  context: Pick<FinanceRecoveryContext, "organizationId">,
  input: FinanceRecoveryDiscoverRequest,
): Promise<FinanceRecoveryDiscoverResult> {
  const environment = validateEnvironment(input.environment);
  const targetType = input.targetType === undefined ? undefined : validateTargetType(input.targetType);
  const targetId = input.targetId === undefined ? undefined : text(input.targetId, "target_id", 240);
  const rows = await env.DB.prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, action, before_json AS beforeJson,
            after_json AS afterJson, created_at AS createdAt
       FROM audit_logs
      WHERE organization_id = ?
        AND entity_type IN ('farm_investor_equity', 'profit_distribution')
        AND before_json IS NOT NULL AND after_json IS NOT NULL
        AND action NOT LIKE 'finance_recovery%'
      ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(context.organizationId, MAX_DISCOVERY_CANDIDATES).all<FinanceAuditRow>();
  const candidates: FinanceRecoveryCandidate[] = [];
  for (const row of rows.results) {
    const rowTargetType = row.entityType as FinanceRecoveryTargetType;
    if (targetType && rowTargetType !== targetType) continue;
    if (targetId && row.entityId !== targetId) continue;
    const before = rowTargetType === "farm_investor_equity" ? parseEquity(jsonParse(row.beforeJson), row.entityId) : parseDistribution(jsonParse(row.beforeJson), row.entityId);
    const after = rowTargetType === "farm_investor_equity" ? parseEquity(jsonParse(row.afterJson), row.entityId) : parseDistribution(jsonParse(row.afterJson), row.entityId);
    if (!before || !after) continue;
    try {
      const target = await readCurrentTarget(env, context.organizationId, rowTargetType, row.entityId, environment);
      if (target.environment !== environment) continue;
    } catch {
      continue;
    }
    candidates.push({ auditId: row.id, targetType: rowTargetType, targetId: row.entityId, createdAt: row.createdAt, action: row.action, recoverable: true });
  }
  return { operation: FINANCE_OPERATION, environment, supportedDomains: [...SUPPORTED_TARGETS], candidates };
}

export async function dryRunFinanceRecovery(
  env: FinanceRecoveryEnv,
  context: FinanceRecoveryContext,
  input: FinanceRecoveryRequest,
): Promise<FinanceRecoveryPlan> {
  return buildFinancePlan(env, context, input);
}

async function existingRecoveryAudit(env: FinanceRecoveryEnv, organizationId: string, recoveryAuditId: string): Promise<FinanceAuditRow | null> {
  return env.DB.prepare(
    `SELECT id, organization_id AS organizationId, entity_type AS entityType, entity_id AS entityId,
            action, before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
       FROM audit_logs WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(recoveryAuditId, organizationId).first<FinanceAuditRow>();
}

function applyResult(
  input: FinanceRecoveryRequest,
  status: FinanceRecoveryApplyStatus,
  plan: FinanceRecoveryPlan | null,
  recoveryAuditId: string | null,
  conflicts: string[] = [],
  idempotent = false,
  authoritativeReadback: FinanceRecoveryApplyResult["authoritativeReadback"] = null,
): FinanceRecoveryApplyResult {
  return {
    operation: FINANCE_OPERATION,
    status,
    applied: status === "APPLIED" && !idempotent,
    idempotent,
    environment: input.environment,
    auditId: input.auditId,
    targetType: input.targetType,
    targetId: input.targetId,
    recoveryAuditId,
    conflicts,
    authoritativeReadback,
    plan,
  };
}

function recoveryAuditStatement(
  env: FinanceRecoveryEnv,
  context: FinanceRecoveryContext,
  request: FinanceRecoveryRequest,
  recoveryAuditId: string,
  plan: FinanceRecoveryPlan,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
       before_json, after_json, changed_fields_json, reason, request_id, created_at)
     VALUES (?, ?, 'web', 'web_admin', ?, 'finance_recovery_apply', 'finance_recovery', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    recoveryAuditId,
    context.organizationId,
    context.actorId,
    request.targetId,
    JSON.stringify({
      operation: FINANCE_OPERATION,
      sourceAuditId: request.auditId,
      environment: request.environment,
      targetType: request.targetType,
      targetId: request.targetId,
      current: plan.current,
      before: plan.before,
      dependencyImpact: plan.dependencyImpact,
      derivedBefore: plan.derivedBefore,
      stateFingerprint: plan.stateFingerprint,
    }),
    JSON.stringify({
      proposedAfter: plan.proposedAfter,
      actualResult: plan.proposedAfter,
      dependencyImpact: plan.dependencyImpact,
      derivedAfter: plan.derivedAfter,
      recoveryLineage: { sourceAuditId: request.auditId, recoveryAuditId },
    }),
    JSON.stringify(plan.dependencies.map((dependency) => dependency.id)),
    request.reason,
    context.requestId,
    new Date().toISOString(),
  );
}

function equityApplyStatements(env: FinanceRecoveryEnv, current: FinanceEquityState, proposed: FinanceEquityState): D1PreparedStatement[] {
  return [env.DB.prepare(
    `UPDATE farm_investor_equity
        SET equity_fraction = ?, source = ?, effective_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND farm_id = ? AND investor_id = ?`,
  ).bind(proposed.equityFraction, proposed.source, proposed.effectiveDate, current.id, current.farmId, current.investorId)];
}

function distributionApplyStatements(env: FinanceRecoveryEnv, current: FinanceDistributionState, proposed: FinanceDistributionState): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [env.DB.prepare(
    `UPDATE profit_distributions
        SET gross_profit_loss = ?, allocated_profit_loss = ?, expense = ?, net_income = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ? AND farm_id = ?`,
  ).bind(
    proposed.grossProfitLoss,
    proposed.allocatedProfitLoss,
    proposed.expense,
    proposed.netIncome,
    proposed.note,
    current.id,
    current.organizationId,
    current.farmId,
  )];
  const currentById = new Map(current.allocations.map((allocation) => [allocation.id, allocation]));
  for (const allocation of proposed.allocations) {
    const existing = currentById.get(allocation.id);
    if (!existing) fail("FINANCE_DEPENDENCY_SHAPE_UNSUPPORTED");
    statements.push(env.DB.prepare(
      `UPDATE profit_distribution_allocations
          SET amount = ?
        WHERE id = ? AND distribution_id = ? AND investor_id = ?`,
    ).bind(allocation.amount, existing.id, existing.distributionId, existing.investorId));
  }
  return statements;
}

type FinanceRecoveryReadback = NonNullable<FinanceRecoveryApplyResult["authoritativeReadback"]>;

async function recoveryReadback(
  env: FinanceRecoveryEnv,
  context: FinanceRecoveryContext,
  input: FinanceRecoveryRequest,
): Promise<FinanceRecoveryReadback> {
  const target = await readCurrentTarget(env, context.organizationId, input.targetType, input.targetId, input.environment);
  const derived = await readFinanceDerived(env, context.organizationId, input.environment);
  return { state: target.state, derived };
}

export async function applyFinanceRecovery(
  env: FinanceRecoveryEnv,
  context: FinanceRecoveryContext,
  input: FinanceRecoveryApplyRequest,
): Promise<FinanceRecoveryApplyResult> {
  if (context.actorType !== "web_admin") fail("FINANCE_ADMIN_REQUIRED", 403);
  const request = validateRequest(input);
  const recoveryAuditId = await financeRecoveryAuditId(request.clientOperationId);
  const previousRecovery = await existingRecoveryAudit(env, context.organizationId, recoveryAuditId);
  if (previousRecovery) {
    const readback = await recoveryReadback(env, context, request);
    const after = asRecord(jsonParse(previousRecovery.afterJson));
    const expected = request.targetType === "farm_investor_equity"
      ? parseEquity(field(after ?? {}, "proposedAfter"), request.targetId)
      : parseDistribution(field(after ?? {}, "proposedAfter"), request.targetId);
    if (!expected || !sameState(readback.state, expected)) return applyResult(request, "FAILED", null, recoveryAuditId, ["FINANCE_IDEMPOTENCY_READBACK_FAILED"]);
    return applyResult(request, "APPLIED", null, recoveryAuditId, [], true, readback);
  }
  const plan = await buildFinancePlan(env, context, request);
  if (plan.stateFingerprint !== input.stateFingerprint) return applyResult(request, "STALE_STATE", plan, null, ["STALE_STATE"]);
  if (plan.dryRunToken !== input.dryRunToken) return applyResult(request, "BLOCKED", plan, null, ["FINANCE_PLAN_TOKEN_MISMATCH"]);
  if (plan.conflicts.length || !plan.proposedAfter) return applyResult(request, "BLOCKED", plan, null, plan.conflicts.length ? plan.conflicts : ["FINANCE_PLAN_NOT_ELIGIBLE"]);
  assertCanonicalWritesOpen(env);
  try {
    const proposed = plan.proposedAfter;
    const statements = request.targetType === "farm_investor_equity"
      ? equityApplyStatements(env, plan.current as FinanceEquityState, proposed as FinanceEquityState)
      : distributionApplyStatements(env, plan.current as FinanceDistributionState, proposed as FinanceDistributionState);
    statements.push(recoveryAuditStatement(env, context, request, recoveryAuditId, plan));
    await env.DB.batch(statements);
    const readback = await recoveryReadback(env, context, request);
    if (!sameState(readback.state, proposed) || (plan.derivedAfter && JSON.stringify(readback.derived) !== JSON.stringify(plan.derivedAfter))) {
      return applyResult(request, "FAILED", plan, recoveryAuditId, ["FINANCE_DERIVED_READBACK_MISMATCH"]);
    }
    const audit = await existingRecoveryAudit(env, context.organizationId, recoveryAuditId);
    if (!audit) return applyResult(request, "FAILED", plan, recoveryAuditId, ["FINANCE_AUDIT_READBACK_FAILED"]);
    return applyResult(request, "APPLIED", plan, recoveryAuditId, [], false, readback);
  } catch (error) {
    if (error instanceof RecoveryCoreError) throw error;
    const code = (error as { code?: string })?.code || "FINANCE_ATOMIC_APPLY_FAILED";
    return applyResult(request, "FAILED", plan, recoveryAuditId, [code]);
  }
}
