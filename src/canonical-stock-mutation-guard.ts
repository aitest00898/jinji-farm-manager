import {
  deriveCanonicalShipmentReadModel,
  validateCanonicalShipmentMutation,
  type CanonicalShipmentReadInput,
} from "./canonical-shipment-read-model";
import {
  type CanonicalLifecycleFact,
} from "./canonical-lifecycle-read-model";

/**
 * The only canonical taxonomy categories that can change effective bird
 * stock.  This is intentionally derived from the current domain contract,
 * rather than from a per-endpoint list.
 */
export const CANONICAL_STOCK_MUTATION_TAXONOMY_IDS = Object.freeze(["O1", "O3", "O9"] as const);
export type CanonicalStockMutationTaxonomyId = (typeof CANONICAL_STOCK_MUTATION_TAXONOMY_IDS)[number];

export type CanonicalStockMutationRelation = "correction" | "reversal" | "replacement" | null;

export interface CanonicalStockMutationInput extends CanonicalShipmentReadInput {
  candidate: CanonicalLifecycleFact;
  relationKind?: CanonicalStockMutationRelation;
  operationLabel?: string | null;
}

export interface CanonicalStockReadState {
  effectiveStock: number | null;
  established: boolean;
  reason: string | null;
}

export interface CanonicalStockMutationProjection {
  taxonomyId: CanonicalStockMutationTaxonomyId;
  operationLabel: string;
  currentStock: number | null;
  requestedStockDelta: number;
  projectedStock: number;
  confirmation: string;
}

export type CanonicalStockMutationValidationResult =
  | { accepted: true; projection: CanonicalStockMutationProjection | null }
  | { accepted: false; reason: string; projection: null };

export interface CanonicalStockMutationReceipt extends CanonicalStockMutationProjection {
  authoritativeStock: number | null;
  readbackMatchesProjection: boolean;
  discrepancy: {
    projectedStock: number;
    authoritativeStock: number | null;
  } | null;
}

function isStockMutationTaxonomy(value: CanonicalLifecycleFact["taxonomyId"]): value is CanonicalStockMutationTaxonomyId {
  return (CANONICAL_STOCK_MUTATION_TAXONOMY_IDS as readonly string[]).includes(value);
}

function factValue(fact: CanonicalLifecycleFact): string {
  return fact.occurredAt || fact.completedAt || fact.createdAt;
}

function currentCycleWindow(
  current: CanonicalShipmentReadInput["currentFlock"],
  flocks: CanonicalShipmentReadInput["flocks"],
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

function belongsToCurrentFlock(fact: CanonicalLifecycleFact, input: CanonicalShipmentReadInput): boolean {
  if (!isStockMutationTaxonomy(fact.taxonomyId) || fact.farmId !== input.currentFlock.farmId) return false;
  const window = currentCycleWindow(input.currentFlock, input.flocks);
  const timestamp = Date.parse(factValue(fact));
  if (!window || !Number.isFinite(timestamp) || timestamp < window.start || (window.end !== null && timestamp >= window.end)) return false;
  if (fact.flockId === input.currentFlock.id) {
    return fact.houseId === null || fact.houseId === input.currentFlock.houseId;
  }
  if (fact.flockId !== null || fact.houseId !== input.currentFlock.houseId) return false;
  return timestamp >= window.start;
}

function currentStockFacts(input: CanonicalShipmentReadInput): CanonicalLifecycleFact[] {
  return input.facts.filter((fact) => belongsToCurrentFlock(fact, input));
}

/**
 * Read the effective stock projection through the existing O3/lifecycle
 * replay.  O3 remains the implementation of the shared stock replay; O1 and
 * O9 use the same replay without creating another authority.
 */
export function deriveCanonicalStockReadState(input: CanonicalShipmentReadInput): CanonicalStockReadState {
  const read = deriveCanonicalShipmentReadModel(input);
  const established = currentStockFacts(input).length > 0
    || (Number.isSafeInteger(input.currentFlock.initialCount) && input.currentFlock.initialCount > 0);
  return {
    effectiveStock: read.effectiveStock,
    established,
    reason: read.reason,
  };
}

function operationLabel(
  taxonomyId: CanonicalStockMutationTaxonomyId,
  requested: string | null | undefined,
): string {
  if (taxonomyId === "O1") return "入雛";
  if (taxonomyId === "O3") return "出雞";
  if (requested === "cull") return "淘汰";
  if (requested === "mortality") return "死亡";
  return "死亡／淘汰";
}

function stockText(value: number | null): string {
  return value === null ? "尚未建立" : String(value);
}

function confirmationText(
  input: CanonicalStockMutationInput,
  label: string,
  amount: number,
  currentStock: number | null,
  projectedStock: number,
): string {
  return [
    `雞場：${input.scope.farmName}`,
    `雞舍：${input.scope.houseName ?? "未指定"}`,
    `批次：${input.currentFlock.batchCode}`,
    `${label}：${amount} 隻`,
    `目前存欄：${stockText(currentStock)}`,
    `操作後預計存欄：${stockText(projectedStock)}`,
  ].join("\n");
}

function rejected(reason: string): CanonicalStockMutationValidationResult {
  return { accepted: false, reason, projection: null };
}

function positiveBirdCount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

/**
 * Validate and project one prospective stock mutation.  This is the common
 * pre-write boundary for O1/O3/O9.  Existing append-only reversals are kept
 * on their established lineage validator and deliberately do not invent a
 * second mutation projection here.
 */
export function validateCanonicalStockMutation(input: CanonicalStockMutationInput): CanonicalStockMutationValidationResult {
  const taxonomyId = input.candidate.taxonomyId;
  if (!isStockMutationTaxonomy(taxonomyId)) return { accepted: true, projection: null };

  if (!input.scope.houseId || !input.scope.houseName) return rejected("STOCK_SCOPE_HOUSE_REQUIRED");
  if (input.candidate.farmId !== input.scope.farmId || input.candidate.farmId !== input.currentFlock.farmId) {
    return rejected("STOCK_SCOPE_FARM_MISMATCH");
  }
  if (input.candidate.houseId !== input.currentFlock.houseId || input.candidate.flockId !== input.currentFlock.id) {
    return rejected("STOCK_FLOCK_SCOPE_REQUIRED");
  }

  const relationKind = input.relationKind ?? null;
  if (!relationKind && input.candidate.lifecycleStatus && input.candidate.lifecycleStatus !== "active") {
    return rejected("STOCK_ORIGINAL_LINEAGE_STATUS_INVALID");
  }
  if (!relationKind && !belongsToCurrentFlock(input.candidate, input)) {
    return rejected("STOCK_CANDIDATE_OUTSIDE_CURRENT_CYCLE");
  }
  if (relationKind === "reversal") {
    if (taxonomyId === "O3") {
      const shipment = validateCanonicalShipmentMutation(input);
      if (!shipment.accepted) return rejected(shipment.reason);
    }
    return { accepted: true, projection: null };
  }
  if (!relationKind && input.currentFlock.status !== "active") return rejected("ACTIVE_FLOCK_REQUIRED");

  const amount = taxonomyId === "O1" ? input.candidate.totalCount : input.candidate.quantity;
  if (!positiveBirdCount(amount)) return rejected("STOCK_QUANTITY_INVALID");

  const current = deriveCanonicalStockReadState(input);
  if (taxonomyId === "O1" && !relationKind) {
    const existingStockFacts = currentStockFacts(input);
    if (existingStockFacts.some((fact) => fact.taxonomyId === "O1")) return rejected("INTAKE_ALREADY_ESTABLISHED");
    if (existingStockFacts.some((fact) => fact.taxonomyId === "O3" || fact.taxonomyId === "O9")) {
      return rejected("INTAKE_CONTEXT_HAS_STOCK_ACTIVITY");
    }
  } else if (current.effectiveStock === null || current.effectiveStock < 0 || current.reason) {
    return rejected(current.reason || "STOCK_PROJECTION_UNAVAILABLE");
  }

  let projectedStock: number | null = null;
  if (taxonomyId === "O3") {
    const shipment = validateCanonicalShipmentMutation(input);
    if (!shipment.accepted) return rejected(shipment.reason);
    projectedStock = shipment.projection?.stockAfter ?? null;
  } else {
    const prospective = deriveCanonicalStockReadState({
      ...input,
      facts: [...input.facts, input.candidate],
    });
    projectedStock = prospective.effectiveStock;
    if (prospective.reason) return rejected(prospective.reason);
  }

  if (projectedStock === null || !Number.isSafeInteger(projectedStock) || projectedStock < 0) {
    return rejected("NEGATIVE_EFFECTIVE_STOCK");
  }

  const currentStock = taxonomyId === "O1" && !relationKind ? null : current.effectiveStock;
  const requestedStockDelta = relationKind
    ? projectedStock - (currentStock ?? projectedStock)
    : taxonomyId === "O1" ? amount : -amount;
  const label = operationLabel(taxonomyId, input.operationLabel);
  return {
    accepted: true,
    projection: {
      taxonomyId,
      operationLabel: label,
      currentStock,
      requestedStockDelta,
      projectedStock,
      confirmation: confirmationText(input, label, amount, currentStock, projectedStock),
    },
  };
}

/**
 * Reconcile the deterministic pre-write projection with the post-write
 * canonical read.  The readback is authoritative; a mismatch is surfaced to
 * the caller instead of being hidden behind the client-side projection.
 */
export function reconcileCanonicalStockMutation(
  projection: CanonicalStockMutationProjection,
  authoritativeStock: number | null,
): CanonicalStockMutationReceipt {
  const readbackMatchesProjection = authoritativeStock === projection.projectedStock;
  return {
    ...projection,
    authoritativeStock,
    readbackMatchesProjection,
    discrepancy: readbackMatchesProjection ? null : {
      projectedStock: projection.projectedStock,
      authoritativeStock,
    },
  };
}
