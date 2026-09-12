import {
  effectiveCanonicalLifecycleFacts,
  type CanonicalLifecycleFact,
  type CanonicalLifecycleFlock,
  type CanonicalLifecycleScope,
} from "./canonical-lifecycle-read-model";

/**
 * O3 shipment semantics are a read-time projection over the same effective
 * O1/O3/O9 facts that drive the canonical lifecycle model.  The projection is
 * deliberately not another persistence authority and contains no mutable
 * `isFinal` flag.
 */
export type CanonicalShipmentState = "PARTIAL_SHIPMENT" | "FINAL_SHIPMENT" | "INCOMPLETE";
export type CanonicalShipmentLineageState = "active" | "corrected" | "reversed" | "replacement";

export interface CanonicalShipmentProjection {
  shipmentId: string;
  farmId: string;
  houseId: string | null;
  cycleId: string;
  flockId: string;
  batchCode: string;
  birdCount: number | null;
  stockBefore: number | null;
  stockAfter: number | null;
  shipmentState: CanonicalShipmentState;
  totalWeight: number | null;
  averageWeight: number | null;
  weightUnit: string | null;
  effective: boolean;
  corrected: boolean;
  reversed: boolean;
  lineageState: CanonicalShipmentLineageState;
  occurredAt: string | null;
}

export interface CanonicalShipmentReadModel {
  projections: CanonicalShipmentProjection[];
  effectiveStock: number | null;
  reason: string | null;
}

export interface CanonicalShipmentReadInput {
  scope: CanonicalLifecycleScope;
  currentFlock: CanonicalLifecycleFlock;
  flocks: readonly CanonicalLifecycleFlock[];
  facts: readonly CanonicalLifecycleFact[];
}

export interface CanonicalShipmentMutationInput extends CanonicalShipmentReadInput {
  candidate: CanonicalLifecycleFact;
}

export type CanonicalShipmentMutationResult =
  | { accepted: true; projection: CanonicalShipmentProjection | null }
  | { accepted: false; reason: string; projection: CanonicalShipmentProjection | null };

interface TimedFact {
  fact: CanonicalLifecycleFact;
  timestamp: number;
}

function factTimestamp(fact: CanonicalLifecycleFact): number | null {
  const value = fact.occurredAt || fact.completedAt || fact.createdAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cycleWindow(
  current: CanonicalLifecycleFlock,
  flocks: readonly CanonicalLifecycleFlock[],
): { start: number; end: number | null } | null {
  const start = Date.parse(`${current.chickInDate}T00:00:00+08:00`);
  if (!Number.isFinite(start)) return null;
  const next = flocks
    .filter((flock) =>
      flock.id !== current.id
      && flock.status !== "cancelled"
      && flock.houseId === current.houseId
      && flock.chickInDate > current.chickInDate,
    )
    .sort((left, right) =>
      left.chickInDate.localeCompare(right.chickInDate)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id),
    )[0];
  const end = next ? Date.parse(`${next.chickInDate}T00:00:00+08:00`) : null;
  return { start, end: end !== null && Number.isFinite(end) ? end : null };
}

function factsForCycle(input: CanonicalShipmentReadInput): { facts: CanonicalLifecycleFact[]; reason: string | null } {
  const window = cycleWindow(input.currentFlock, input.flocks);
  if (!window) return { facts: [], reason: "CURRENT_CYCLE_DATE_INVALID" };
  const selected: CanonicalLifecycleFact[] = [];
  for (const fact of input.facts) {
    if (fact.farmId !== input.currentFlock.farmId) continue;
    const timestamp = factTimestamp(fact);
    if (timestamp === null) return { facts: [], reason: "FACT_TIMESTAMP_INVALID" };
    if (timestamp < window.start || (window.end !== null && timestamp >= window.end)) continue;
    if (fact.flockId === input.currentFlock.id) {
      if (fact.houseId !== input.currentFlock.houseId) return { facts: [], reason: "FLOCK_SCOPE_MISMATCH" };
      selected.push(fact);
      continue;
    }
    if (fact.flockId !== null) continue;
    if (fact.houseId === input.currentFlock.houseId) {
      selected.push(fact);
      continue;
    }
    if ((fact.taxonomyId === "O3" || fact.taxonomyId === "O9") && fact.houseId === null) {
      return { facts: [], reason: "UNRESOLVED_CYCLE_SCOPE" };
    }
  }
  return { facts: selected, reason: null };
}

function validInitialCount(currentFlock: CanonicalLifecycleFlock, effectiveFacts: readonly CanonicalLifecycleFact[]): number | null {
  const intakeFacts = effectiveFacts.filter((fact) => fact.taxonomyId === "O1");
  if (intakeFacts.length > 1) return null;
  const intake = intakeFacts[0];
  if (intake && intake.flockId !== currentFlock.id) return null;
  const initial = intake?.totalCount ?? currentFlock.initialCount;
  return Number.isSafeInteger(initial) && initial > 0 ? initial : null;
}

function lineageStateFor(
  fact: CanonicalLifecycleFact,
  facts: readonly CanonicalLifecycleFact[],
  effective: boolean,
): { state: CanonicalShipmentLineageState; corrected: boolean; reversed: boolean } {
  const children = facts.filter((candidate) =>
    candidate.correctionOfId === fact.id
    || candidate.replacementOfId === fact.id
    || candidate.reversalOfId === fact.id,
  );
  const reversed = Boolean(
    fact.reversedAt
    || fact.lifecycleStatus === "reversed"
    || fact.lifecycleStatus === "reversal"
    || fact.reversalOfId
    || children.some((child) => Boolean(child.reversalOfId)),
  );
  const corrected = Boolean(
    fact.correctionOfId
    || fact.replacementOfId
    || children.some((child) => Boolean(child.correctionOfId || child.replacementOfId)),
  );
  if (reversed) return { state: "reversed", corrected, reversed: true };
  if (effective && (fact.correctionOfId || fact.replacementOfId)) {
    return { state: "replacement", corrected: true, reversed: false };
  }
  if (corrected) return { state: "corrected", corrected: true, reversed: false };
  return { state: "active", corrected: false, reversed: false };
}

function safeBirdCount(fact: CanonicalLifecycleFact): number | null {
  return fact.quantity !== null && Number.isSafeInteger(fact.quantity) && fact.quantity > 0 ? fact.quantity : null;
}

function safeWeight(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function weightProjection(fact: CanonicalLifecycleFact, birdCount: number | null): {
  totalWeight: number | null;
  averageWeight: number | null;
  weightUnit: string | null;
} {
  const totalWeight = safeWeight(fact.totalWeight);
  const storedAverage = safeWeight(fact.averageWeight);
  return {
    totalWeight,
    averageWeight: totalWeight !== null && birdCount !== null ? totalWeight / birdCount : storedAverage,
    weightUnit: typeof fact.weightUnit === "string" && fact.weightUnit ? fact.weightUnit : null,
  };
}

function baseProjection(
  fact: CanonicalLifecycleFact,
  currentFlock: CanonicalLifecycleFlock,
  facts: readonly CanonicalLifecycleFact[],
  effective: boolean,
): CanonicalShipmentProjection {
  const lineage = lineageStateFor(fact, facts, effective);
  const birdCount = safeBirdCount(fact);
  const weight = weightProjection(fact, birdCount);
  return {
    shipmentId: fact.id,
    farmId: currentFlock.farmId,
    houseId: currentFlock.houseId,
    cycleId: currentFlock.id,
    flockId: currentFlock.id,
    batchCode: currentFlock.batchCode,
    birdCount,
    stockBefore: null,
    stockAfter: null,
    shipmentState: "INCOMPLETE",
    ...weight,
    effective,
    corrected: lineage.corrected,
    reversed: lineage.reversed,
    lineageState: lineage.state,
    occurredAt: fact.occurredAt || null,
  };
}

function incompleteProjections(
  facts: readonly CanonicalLifecycleFact[],
  currentFlock: CanonicalLifecycleFlock,
  effectiveIds: ReadonlySet<string>,
): CanonicalShipmentProjection[] {
  return facts
    .filter((fact) => fact.taxonomyId === "O3")
    .map((fact) => baseProjection(fact, currentFlock, facts, effectiveIds.has(fact.id)));
}

/**
 * Derive O3 shipment states for one cycle. The effective lineage graph is
 * validated before arithmetic, then stock is replayed in occurred-at order.
 * Any unsafe quantity or arithmetic contradiction returns INCOMPLETE rather
 * than a guessed partial/final state.
 */
export function deriveCanonicalShipmentReadModel(input: CanonicalShipmentReadInput): CanonicalShipmentReadModel {
  const cycle = factsForCycle(input);
  if (cycle.reason) return { projections: [], effectiveStock: null, reason: cycle.reason };
  const effective = effectiveCanonicalLifecycleFacts(cycle.facts);
  if (effective.reason) {
    const effectiveIds = new Set(effective.facts.map((fact) => fact.id));
    return {
      projections: incompleteProjections(cycle.facts, input.currentFlock, effectiveIds),
      effectiveStock: null,
      reason: effective.reason,
    };
  }
  const initial = validInitialCount(input.currentFlock, effective.facts);
  if (initial === null) {
    return { projections: incompleteProjections(cycle.facts, input.currentFlock, new Set(effective.facts.map((fact) => fact.id))), effectiveStock: null, reason: "INVALID_INITIAL_COUNT" };
  }

  const timedFacts: TimedFact[] = [];
  for (const fact of effective.facts) {
    if (fact.taxonomyId !== "O1" && fact.taxonomyId !== "O3" && fact.taxonomyId !== "O9") continue;
    const timestamp = factTimestamp(fact);
    if (timestamp === null) {
      return { projections: incompleteProjections(cycle.facts, input.currentFlock, new Set(effective.facts.map((item) => item.id))), effectiveStock: null, reason: "FACT_TIMESTAMP_INVALID" };
    }
    timedFacts.push({ fact, timestamp });
  }
  timedFacts.sort((left, right) => left.timestamp - right.timestamp || left.fact.id.localeCompare(right.fact.id));

  const projectionsById = new Map<string, CanonicalShipmentProjection>();
  let stock = initial;
  let reason: string | null = null;
  for (const event of timedFacts) {
    if (event.fact.taxonomyId === "O1") continue;
    const quantity = safeBirdCount(event.fact);
    if (quantity === null) {
      reason = "INVALID_STOCK_QUANTITY";
      if (event.fact.taxonomyId === "O3") {
        const projection = baseProjection(event.fact, input.currentFlock, cycle.facts, true);
        projection.stockBefore = stock;
        projectionsById.set(event.fact.id, projection);
      }
      break;
    }
    const stockBefore = stock;
    const stockAfter = stockBefore - quantity;
    if (stockBefore <= 0 || stockAfter < 0) {
      reason = "NEGATIVE_EFFECTIVE_STOCK";
      if (event.fact.taxonomyId === "O3") {
        const projection = baseProjection(event.fact, input.currentFlock, cycle.facts, true);
        projection.stockBefore = stockBefore;
        projectionsById.set(event.fact.id, projection);
      }
      break;
    }
    stock = stockAfter;
    if (event.fact.taxonomyId === "O3") {
      const projection = baseProjection(event.fact, input.currentFlock, cycle.facts, true);
      projection.stockBefore = stockBefore;
      projection.stockAfter = stockAfter;
      projection.shipmentState = stockAfter > 0 ? "PARTIAL_SHIPMENT" : "FINAL_SHIPMENT";
      projectionsById.set(event.fact.id, projection);
    }
  }

  const effectiveIds = new Set(effective.facts.map((fact) => fact.id));
  const projections = cycle.facts
    .filter((fact) => fact.taxonomyId === "O3")
    .map((fact) => {
      const computed = projectionsById.get(fact.id);
      if (computed) return computed;
      return baseProjection(fact, input.currentFlock, cycle.facts, effectiveIds.has(fact.id));
    });
  return { projections, effectiveStock: reason ? null : stock, reason };
}

/**
 * Validate a prospective O3 original/correction before the canonical write.
 * Reversals do not introduce a new shipment effect, so their target/lineage
 * checks remain the responsibility of the shared lineage validator.
 */
export function validateCanonicalShipmentMutation(input: CanonicalShipmentMutationInput): CanonicalShipmentMutationResult {
  if (input.candidate.taxonomyId !== "O3") return { accepted: true, projection: null };
  if (input.candidate.flockId !== input.currentFlock.id) {
    return { accepted: false, reason: "SHIPMENT_FLOCK_SCOPE_REQUIRED", projection: null };
  }
  // A reversal adds no shipment effect, but it must still carry the exact
  // current-cycle scope so the append-only child can neutralize its target
  // in the canonical read model rather than becoming an unscoped orphan.
  if (input.candidate.reversalOfId) {
    const target = input.facts.find((fact) => fact.id === input.candidate.reversalOfId);
    if (!target || target.taxonomyId !== "O3" || target.farmId !== input.currentFlock.farmId || target.houseId !== input.currentFlock.houseId || target.flockId !== input.currentFlock.id) {
      return { accepted: false, reason: "SHIPMENT_REVERSAL_TARGET_SCOPE_INVALID", projection: null };
    }
    return { accepted: true, projection: null };
  }
  const result = deriveCanonicalShipmentReadModel({
    scope: input.scope,
    currentFlock: input.currentFlock,
    flocks: input.flocks,
    facts: [...input.facts, input.candidate],
  });
  const projection = result.projections.find((item) => item.shipmentId === input.candidate.id) ?? null;
  if (!projection || !projection.effective || projection.stockBefore === null || projection.stockAfter === null) {
    return { accepted: false, reason: result.reason || "SHIPMENT_STOCK_ARITHMETIC_INVALID", projection };
  }
  if (projection.stockBefore <= 0 || projection.stockAfter < 0) {
    return { accepted: false, reason: "SHIPMENT_STOCK_ARITHMETIC_INVALID", projection };
  }
  return { accepted: true, projection };
}
