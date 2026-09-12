export type CanonicalLifecycleStatus =
  | "ACTIVE"
  | "EMPTY_AWAITING_CLEANING"
  | "READY_NEXT_INTAKE"
  | "INCOMPLETE";

export type CanonicalCleaningStatus = "not_recorded" | "pending" | "completed";

export interface CanonicalLifecycleFlock {
  id: string;
  farmId: string;
  houseId: string;
  batchCode: string;
  chickInDate: string;
  initialCount: number;
  status: "active" | "closed" | "cancelled";
  createdAt: string;
}

export interface CanonicalLifecycleFact {
  id: string;
  taxonomyId: "O1" | "O3" | "O7" | "O9";
  farmId: string;
  houseId: string | null;
  flockId: string | null;
  occurredAt: string | null;
  createdAt: string;
  quantity: number | null;
  totalCount: number | null;
  workflowStatus: string | null;
  completedAt: string | null;
  lifecycleStatus: string | null;
  reversedAt: string | null;
  correctionOfId: string | null;
  reversalOfId: string | null;
  replacementOfId: string | null;
  /** Optional O3 shipment weight evidence carried by the canonical read bridge. */
  totalWeight?: number | null;
  averageWeight?: number | null;
  weightUnit?: string | null;
}

export interface CanonicalLifecycleScope {
  farmId: string;
  farmName: string;
  environment: "production" | "test";
  houseId: string | null;
  houseName: string | null;
}

export interface CanonicalLifecycleSummary {
  farm: {
    id: string;
    name: string;
    environment: "production" | "test";
  };
  house: {
    id: string;
    name: string;
  } | null;
  currentFlock: {
    id: string;
    batchCode: string;
    chickInDate: string;
    initialCount: number;
    status: CanonicalLifecycleFlock["status"];
  } | null;
  currentCycle: {
    id: string;
    flockId: string;
    batchCode: string;
    chickInDate: string;
  } | null;
  intakeDate: string | null;
  effectiveStock: number | null;
  lifecycleStatus: CanonicalLifecycleStatus;
  lifecycleStatusLabel: string;
  lastEffectiveStockEventAt: string | null;
  cleaningStatus: CanonicalCleaningStatus;
  cleaningStatusLabel: string;
  cleaningCompletedAt: string | null;
  readyForNextIntake: boolean;
  dataCompleteness: "complete" | "incomplete";
  reason: string | null;
}

interface EffectiveFactsResult {
  facts: CanonicalLifecycleFact[];
  reason: string | null;
}

interface CycleFactsResult {
  facts: CanonicalLifecycleFact[];
  reason: string | null;
}

const STATUS_LABELS: Record<CanonicalLifecycleStatus, string> = {
  ACTIVE: "飼養中",
  EMPTY_AWAITING_CLEANING: "雞舍已清空，待清消",
  READY_NEXT_INTAKE: "清消完成，可準備下一批入雛",
  INCOMPLETE: "資料不足，無法安全判定",
};

const CLEANING_LABELS: Record<CanonicalCleaningStatus, string> = {
  not_recorded: "尚未完成清消",
  pending: "清消待完成",
  completed: "清消完成",
};

function relationFields(fact: CanonicalLifecycleFact): Array<{ field: string; id: string }> {
  const candidates: Array<[string, string | null]> = [
    ["correctionOfId", fact.correctionOfId],
    ["reversalOfId", fact.reversalOfId],
    ["replacementOfId", fact.replacementOfId],
  ];
  return candidates.flatMap(([field, id]) => typeof id === "string" && id ? [{ field, id }] : []);
}

function factTimestamp(fact: CanonicalLifecycleFact): number | null {
  const value = fact.occurredAt || fact.completedAt || fact.createdAt;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function factTimestampValue(fact: CanonicalLifecycleFact): string | null {
  const value = fact.occurredAt || fact.completedAt || fact.createdAt;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function sameScope(left: CanonicalLifecycleFact, right: CanonicalLifecycleFact): boolean {
  return left.farmId === right.farmId
    && left.houseId === right.houseId
    && left.flockId === right.flockId;
}

/**
 * Computes effective leaves of the append-only fact graph. A parent with a
 * correction/reversal child is not effective; a reversal child is also not
 * effective; a correction/replacement leaf is effective. Ambiguous or broken
 * lineage fails closed instead of silently choosing a leaf.
 */
export function effectiveCanonicalLifecycleFacts(facts: readonly CanonicalLifecycleFact[]): EffectiveFactsResult {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const children = new Map<string, CanonicalLifecycleFact[]>();

  for (const fact of facts) {
    const relations = relationFields(fact);
    if (relations.length > 1) return { facts: [], reason: "MULTIPLE_LINEAGE_REFERENCES" };
    if (fact.lifecycleStatus === "replacement" && relations.length === 0) {
      return { facts: [], reason: "REPLACEMENT_WITHOUT_LINEAGE" };
    }
    const relation = relations[0];
    if (!relation) continue;
    if (relation.id === fact.id) return { facts: [], reason: "SELF_LINEAGE" };
    const parent = byId.get(relation.id);
    if (!parent) return { facts: [], reason: "LINEAGE_REFERENCE_NOT_FOUND" };
    if (parent.taxonomyId !== fact.taxonomyId || !sameScope(parent, fact)) {
      return { facts: [], reason: "LINEAGE_SCOPE_OR_TAXONOMY_MISMATCH" };
    }
    const siblings = children.get(parent.id) ?? [];
    siblings.push(fact);
    children.set(parent.id, siblings);
  }

  for (const [parentId, rows] of children) {
    if (rows.length > 1) return { facts: [], reason: `MULTIPLE_LINEAGE_CHILDREN:${parentId}` };
  }

  const effective = facts.filter((fact) => {
    if (fact.reversedAt || fact.lifecycleStatus === "reversed" || fact.lifecycleStatus === "reversal") return false;
    if (children.has(fact.id)) return false;
    const relation = relationFields(fact)[0];
    return !relation || relation.field === "correctionOfId" || relation.field === "replacementOfId";
  });
  return { facts: effective, reason: null };
}

function selectCurrentFlock(flocks: readonly CanonicalLifecycleFlock[]): CanonicalLifecycleFlock | null {
  const eligible = flocks.filter((flock) => flock.status !== "cancelled");
  if (!eligible.length) return null;
  const active = eligible.filter((flock) => flock.status === "active");
  const candidates = active.length ? active : eligible;
  return [...candidates].sort((left, right) =>
    right.chickInDate.localeCompare(left.chickInDate)
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id),
  )[0] ?? null;
}

function cycleWindow(
  current: CanonicalLifecycleFlock,
  flocks: readonly CanonicalLifecycleFlock[],
): { start: number; end: number | null } | null {
  const start = Date.parse(`${current.chickInDate}T00:00:00+08:00`);
  if (!Number.isFinite(start)) return null;
  const next = flocks
    .filter((flock) => flock.status !== "cancelled" && flock.houseId === current.houseId && flock.chickInDate > current.chickInDate)
    .sort((left, right) => left.chickInDate.localeCompare(right.chickInDate) || left.createdAt.localeCompare(right.createdAt))[0];
  const end = next ? Date.parse(`${next.chickInDate}T00:00:00+08:00`) : null;
  return { start, end: Number.isFinite(end ?? NaN) ? end : null };
}

function cycleFacts(
  current: CanonicalLifecycleFlock,
  flocks: readonly CanonicalLifecycleFlock[],
  facts: readonly CanonicalLifecycleFact[],
): CycleFactsResult {
  const window = cycleWindow(current, flocks);
  if (!window) return { facts: [], reason: "CURRENT_CYCLE_DATE_INVALID" };
  const selected: CanonicalLifecycleFact[] = [];
  for (const fact of facts) {
    if (fact.farmId !== current.farmId) continue;
    const timestamp = factTimestamp(fact);
    if (timestamp === null) return { facts: [], reason: "FACT_TIMESTAMP_INVALID" };
    if (timestamp < window.start || (window.end !== null && timestamp >= window.end)) continue;
    if (fact.flockId === current.id) {
      selected.push(fact);
      continue;
    }
    if (fact.flockId !== null) continue;
    if (fact.houseId === current.houseId) {
      selected.push(fact);
      continue;
    }
    if ((fact.taxonomyId === "O3" || fact.taxonomyId === "O9" || fact.taxonomyId === "O7") && fact.houseId === null) {
      return { facts: [], reason: "UNRESOLVED_CYCLE_SCOPE" };
    }
  }
  return { facts: selected, reason: null };
}

function incompleteSummary(
  scope: CanonicalLifecycleScope,
  currentFlock: CanonicalLifecycleFlock | null,
  reason: string,
  effectiveStock: number | null = null,
): CanonicalLifecycleSummary {
  const current = currentFlock ? {
    id: currentFlock.id,
    batchCode: currentFlock.batchCode,
    chickInDate: currentFlock.chickInDate,
    initialCount: currentFlock.initialCount,
    status: currentFlock.status,
  } : null;
  return {
    farm: { id: scope.farmId, name: scope.farmName, environment: scope.environment },
    house: scope.houseId && scope.houseName ? { id: scope.houseId, name: scope.houseName } : null,
    currentFlock: current,
    currentCycle: current ? { id: current.id, flockId: current.id, batchCode: current.batchCode, chickInDate: current.chickInDate } : null,
    intakeDate: current?.chickInDate ?? null,
    effectiveStock,
    lifecycleStatus: "INCOMPLETE",
    lifecycleStatusLabel: STATUS_LABELS.INCOMPLETE,
    lastEffectiveStockEventAt: null,
    cleaningStatus: "not_recorded",
    cleaningStatusLabel: CLEANING_LABELS.not_recorded,
    cleaningCompletedAt: null,
    readyForNextIntake: false,
    dataCompleteness: "incomplete",
    reason,
  };
}

export function deriveCanonicalLifecycleSummary(
  scope: CanonicalLifecycleScope,
  flocks: readonly CanonicalLifecycleFlock[],
  facts: readonly CanonicalLifecycleFact[],
): CanonicalLifecycleSummary {
  const scopedFlocks = flocks.filter((flock) => flock.farmId === scope.farmId && (!scope.houseId || flock.houseId === scope.houseId));
  const currentFlock = selectCurrentFlock(scopedFlocks);
  if (!currentFlock) return incompleteSummary(scope, null, "NO_CURRENT_FLOCK");
  if (scope.houseId && currentFlock.houseId !== scope.houseId) return incompleteSummary(scope, currentFlock, "CURRENT_FLOCK_SCOPE_MISMATCH");

  const cycle = cycleFacts(currentFlock, scopedFlocks, facts);
  if (cycle.reason) return incompleteSummary(scope, currentFlock, cycle.reason);
  const effective = effectiveCanonicalLifecycleFacts(cycle.facts);
  if (effective.reason) return incompleteSummary(scope, currentFlock, effective.reason);

  const intakeFacts = effective.facts.filter((fact) => fact.taxonomyId === "O1");
  if (intakeFacts.length > 1) return incompleteSummary(scope, currentFlock, "MULTIPLE_EFFECTIVE_INTAKES");
  const intake = intakeFacts[0] ?? null;
  if (intake && (intake.flockId !== currentFlock.id || intake.totalCount === null || !Number.isInteger(intake.totalCount) || intake.totalCount <= 0)) {
    return incompleteSummary(scope, currentFlock, "INVALID_INTAKE_FACT");
  }
  const initialCount = intake?.totalCount ?? currentFlock.initialCount;
  if (!Number.isInteger(initialCount) || initialCount <= 0) return incompleteSummary(scope, currentFlock, "INVALID_INITIAL_COUNT");

  const stockFacts = effective.facts.filter((fact) => fact.taxonomyId === "O3" || fact.taxonomyId === "O9");
  const stockEvents: Array<{ fact: CanonicalLifecycleFact; timestamp: number; timestampValue: string }> = [];
  for (const fact of stockFacts) {
    if (fact.quantity === null || !Number.isInteger(fact.quantity) || fact.quantity <= 0) return incompleteSummary(scope, currentFlock, "INVALID_STOCK_QUANTITY");
    const timestamp = factTimestamp(fact);
    const timestampValue = factTimestampValue(fact);
    if (timestamp === null || !timestampValue) return incompleteSummary(scope, currentFlock, "FACT_TIMESTAMP_INVALID");
    stockEvents.push({ fact, timestamp, timestampValue });
  }
  if (intake) {
    const timestamp = factTimestamp(intake);
    const timestampValue = factTimestampValue(intake);
    if (timestamp === null || !timestampValue) return incompleteSummary(scope, currentFlock, "FACT_TIMESTAMP_INVALID");
    stockEvents.push({ fact: intake, timestamp, timestampValue });
  }
  stockEvents.sort((left, right) => left.timestamp - right.timestamp || left.fact.id.localeCompare(right.fact.id));

  let rawStock = initialCount;
  let finalDepletionAt: string | null = null;
  let lastStockEventAt: string | null = null;
  for (const event of stockEvents) {
    lastStockEventAt = event.timestampValue;
    if (event.fact.taxonomyId === "O1") continue;
    rawStock -= event.fact.quantity ?? 0;
    if (rawStock < 0) return incompleteSummary(scope, currentFlock, "NEGATIVE_EFFECTIVE_STOCK", rawStock);
    if (rawStock === 0 && finalDepletionAt === null) finalDepletionAt = event.timestampValue;
  }

  const cleaningFacts = effective.facts.filter((fact) => fact.taxonomyId === "O7");
  const completedCleaning: Array<{ fact: CanonicalLifecycleFact; timestamp: number; value: string }> = [];
  let cleaningStatus: CanonicalCleaningStatus = "not_recorded";
  for (const fact of cleaningFacts) {
    if (fact.workflowStatus === "pending") {
      cleaningStatus = "pending";
      continue;
    }
    if (fact.workflowStatus !== "completed") return incompleteSummary(scope, currentFlock, "INVALID_CLEANING_STATUS", rawStock);
    const timestamp = fact.completedAt || fact.occurredAt || fact.createdAt;
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return incompleteSummary(scope, currentFlock, "CLEANING_TIMESTAMP_INVALID", rawStock);
    completedCleaning.push({ fact, timestamp: parsed, value: timestamp });
    cleaningStatus = "completed";
  }
  completedCleaning.sort((left, right) => left.timestamp - right.timestamp || left.fact.id.localeCompare(right.fact.id));
  const lastCleaning = completedCleaning.at(-1) ?? null;
  const cleaningCompletedAt = lastCleaning?.value ?? null;
  const current = {
    id: currentFlock.id,
    batchCode: currentFlock.batchCode,
    chickInDate: currentFlock.chickInDate,
    initialCount: currentFlock.initialCount,
    status: currentFlock.status,
  };

  if (rawStock > 0) {
    return {
      farm: { id: scope.farmId, name: scope.farmName, environment: scope.environment },
      house: scope.houseId && scope.houseName ? { id: scope.houseId, name: scope.houseName } : null,
      currentFlock: current,
      currentCycle: { id: current.id, flockId: current.id, batchCode: current.batchCode, chickInDate: current.chickInDate },
      intakeDate: intake ? (factTimestampValue(intake)?.slice(0, 10) ?? currentFlock.chickInDate) : currentFlock.chickInDate,
      effectiveStock: rawStock,
      lifecycleStatus: "ACTIVE",
      lifecycleStatusLabel: STATUS_LABELS.ACTIVE,
      lastEffectiveStockEventAt: lastStockEventAt,
      cleaningStatus,
      cleaningStatusLabel: CLEANING_LABELS[cleaningStatus],
      cleaningCompletedAt,
      readyForNextIntake: false,
      dataCompleteness: "complete",
      reason: null,
    };
  }

  if (finalDepletionAt === null) return incompleteSummary(scope, currentFlock, "ZERO_STOCK_WITHOUT_DEPLETION_EVENT", rawStock);
  const depletionTimestamp = Date.parse(finalDepletionAt);
  const cleaningAfterDepletion = lastCleaning !== null && lastCleaning.timestamp > depletionTimestamp;
  const ready = cleaningAfterDepletion;
  const lifecycleStatus: CanonicalLifecycleStatus = ready ? "READY_NEXT_INTAKE" : "EMPTY_AWAITING_CLEANING";
  const reason = ready
    ? null
    : cleaningStatus === "pending"
      ? "CLEANING_PENDING"
      : lastCleaning
        ? "CLEANING_BEFORE_FINAL_DEPLETION"
        : "CLEANING_NOT_COMPLETED";
  return {
    farm: { id: scope.farmId, name: scope.farmName, environment: scope.environment },
    house: scope.houseId && scope.houseName ? { id: scope.houseId, name: scope.houseName } : null,
    currentFlock: current,
    currentCycle: { id: current.id, flockId: current.id, batchCode: current.batchCode, chickInDate: current.chickInDate },
    intakeDate: intake ? (factTimestampValue(intake)?.slice(0, 10) ?? currentFlock.chickInDate) : currentFlock.chickInDate,
    effectiveStock: rawStock,
    lifecycleStatus,
    lifecycleStatusLabel: STATUS_LABELS[lifecycleStatus],
    lastEffectiveStockEventAt: lastStockEventAt,
    cleaningStatus,
    cleaningStatusLabel: CLEANING_LABELS[cleaningStatus],
    cleaningCompletedAt,
    readyForNextIntake: ready,
    dataCompleteness: "complete",
    reason,
  };
}
