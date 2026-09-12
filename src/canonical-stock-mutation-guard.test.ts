import { describe, expect, it } from "vitest";
import {
  reconcileCanonicalStockMutation,
  validateCanonicalStockMutation,
  type CanonicalStockMutationInput,
} from "./canonical-stock-mutation-guard";
import type { CanonicalLifecycleFact } from "./canonical-lifecycle-read-model";

const scope = {
  farmId: "farm-guard",
  farmName: "Guard 測試場",
  environment: "test" as const,
  houseId: "house-guard",
  houseName: "Guard 一舍",
};

const flock = {
  id: "flock-guard",
  farmId: "farm-guard",
  houseId: "house-guard",
  batchCode: "GUARD-001",
  chickInDate: "2026-09-01",
  initialCount: 100,
  status: "active" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function fact(
  input: Partial<CanonicalLifecycleFact> & Pick<CanonicalLifecycleFact, "id" | "taxonomyId">,
): CanonicalLifecycleFact {
  return {
    id: input.id,
    taxonomyId: input.taxonomyId,
    farmId: input.farmId ?? scope.farmId,
    houseId: input.houseId === undefined ? scope.houseId : input.houseId,
    flockId: input.flockId === undefined ? flock.id : input.flockId,
    occurredAt: input.occurredAt ?? "2026-09-01T08:00:00+08:00",
    createdAt: input.createdAt ?? "2026-09-01T08:00:00.000Z",
    quantity: input.quantity === undefined ? null : input.quantity,
    totalCount: input.totalCount === undefined ? null : input.totalCount,
    workflowStatus: input.workflowStatus === undefined ? null : input.workflowStatus,
    completedAt: input.completedAt === undefined ? null : input.completedAt,
    lifecycleStatus: input.lifecycleStatus === undefined ? "active" : input.lifecycleStatus,
    reversedAt: input.reversedAt === undefined ? null : input.reversedAt,
    correctionOfId: input.correctionOfId === undefined ? null : input.correctionOfId,
    reversalOfId: input.reversalOfId === undefined ? null : input.reversalOfId,
    replacementOfId: input.replacementOfId === undefined ? null : input.replacementOfId,
  };
}

function intake(totalCount = 100, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id: "intake-guard", taxonomyId: "O1", totalCount, ...overrides });
}

function shipment(id: string, quantity: number, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id, taxonomyId: "O3", quantity, occurredAt: "2026-09-02T08:00:00+08:00", ...overrides });
}

function mortality(id: string, quantity: number, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id, taxonomyId: "O9", quantity, occurredAt: "2026-09-02T08:00:00+08:00", ...overrides });
}

function input(candidate: CanonicalLifecycleFact, facts: CanonicalLifecycleFact[] = [intake()]): CanonicalStockMutationInput {
  return { scope, currentFlock: flock, flocks: [flock], facts, candidate };
}

describe("shared canonical stock mutation guard", () => {
  it("shows scope, current stock, and projected stock for valid O9", () => {
    const result = validateCanonicalStockMutation(input(mortality("mortality-valid", 3)));
    expect(result).toMatchObject({ accepted: true, projection: { currentStock: 100, requestedStockDelta: -3, projectedStock: 97 } });
    expect(result.accepted && result.projection?.confirmation).toContain("雞場：Guard 測試場");
    expect(result.accepted && result.projection?.confirmation).toContain("雞舍：Guard 一舍");
    expect(result.accepted && result.projection?.confirmation).toContain("目前存欄：100");
    expect(result.accepted && result.projection?.confirmation).toContain("操作後預計存欄：97");
  });

  it("rejects O9 when quantity exceeds current stock", () => {
    expect(validateCanonicalStockMutation(input(mortality("mortality-over", 101)))).toMatchObject({
      accepted: false,
      reason: "NEGATIVE_EFFECTIVE_STOCK",
    });
  });

  it("projects O3 partial shipment and final shipment without duplicated arithmetic", () => {
    const partial = validateCanonicalStockMutation(input(shipment("shipment-partial", 30)));
    const final = validateCanonicalStockMutation(input(shipment("shipment-final", 100)));
    expect(partial).toMatchObject({ accepted: true, projection: { currentStock: 100, projectedStock: 70 } });
    expect(final).toMatchObject({ accepted: true, projection: { currentStock: 100, projectedStock: 0 } });
  });

  it("rejects O3 overshipment before persistence", () => {
    expect(validateCanonicalStockMutation(input(shipment("shipment-over", 101)))).toMatchObject({ accepted: false });
  });

  it("rejects missing and non-positive stock quantities", () => {
    expect(validateCanonicalStockMutation(input(mortality("mortality-zero", 0)))).toMatchObject({
      accepted: false,
      reason: "STOCK_QUANTITY_INVALID",
    });
    expect(validateCanonicalStockMutation(input(shipment("shipment-negative", -1)))).toMatchObject({
      accepted: false,
      reason: "STOCK_QUANTITY_INVALID",
    });
  });

  it("fails closed when house or flock scope is ambiguous", () => {
    expect(validateCanonicalStockMutation({
      ...input(mortality("mortality-no-scope", 1)),
      scope: { ...scope, houseId: null, houseName: null },
    })).toMatchObject({ accepted: false, reason: "STOCK_SCOPE_HOUSE_REQUIRED" });
    expect(validateCanonicalStockMutation(input(mortality("mortality-no-flock", 1, { flockId: null })))).toMatchObject({
      accepted: false,
      reason: "STOCK_FLOCK_SCOPE_REQUIRED",
    });
  });

  it("fails closed for a foreign farm scope", () => {
    expect(validateCanonicalStockMutation(input(mortality("mortality-foreign", 1, { farmId: "foreign-farm" })))).toMatchObject({
      accepted: false,
      reason: "STOCK_SCOPE_FARM_MISMATCH",
    });
  });

  it("requires an active flock for an original stock mutation", () => {
    expect(validateCanonicalStockMutation({
      ...input(mortality("mortality-closed-flock", 1)),
      currentFlock: { ...flock, status: "closed" },
    })).toMatchObject({ accepted: false, reason: "ACTIVE_FLOCK_REQUIRED" });
  });

  it("keeps O1 intake-specific semantics instead of adding to master stock", () => {
    const candidate = fact({ id: "intake-new", taxonomyId: "O1", totalCount: 120, occurredAt: "2026-09-01T09:00:00+08:00" });
    const result = validateCanonicalStockMutation(input(candidate, []));
    expect(result).toMatchObject({ accepted: true, projection: { currentStock: null, requestedStockDelta: 120, projectedStock: 120 } });
  });

  it("rejects a second original O1 for the same flock", () => {
    expect(validateCanonicalStockMutation(input(
      fact({ id: "intake-duplicate", taxonomyId: "O1", totalCount: 120 }),
      [intake()],
    ))).toMatchObject({ accepted: false, reason: "INTAKE_ALREADY_ESTABLISHED" });
  });

  it("rejects an original event outside the current cycle", () => {
    expect(validateCanonicalStockMutation(input(mortality("mortality-before-cycle", 1, {
      occurredAt: "2026-08-31T23:59:59+08:00",
    })))).toMatchObject({ accepted: false, reason: "STOCK_CANDIDATE_OUTSIDE_CURRENT_CYCLE" });
    expect(validateCanonicalStockMutation(input(mortality("mortality-invalid-status", 1, {
      lifecycleStatus: "reversed",
    })))).toMatchObject({ accepted: false, reason: "STOCK_ORIGINAL_LINEAGE_STATUS_INVALID" });
  });

  it("keeps correction and exact reversal on the established lineage path", () => {
    const original = shipment("shipment-lineage", 20);
    const correction = shipment("shipment-lineage-correction", 10, {
      correctionOfId: original.id,
      occurredAt: original.occurredAt,
    });
    const reversal = shipment("shipment-lineage-reversal", 20, {
      reversalOfId: original.id,
      occurredAt: "2026-09-03T08:00:00+08:00",
    });
    expect(validateCanonicalStockMutation({
      ...input(correction, [intake(), original]),
      relationKind: "correction",
    })).toMatchObject({ accepted: true, projection: { currentStock: 80, projectedStock: 90 } });
    expect(validateCanonicalStockMutation({
      ...input(reversal, [intake(), original]),
      relationKind: "reversal",
    })).toMatchObject({ accepted: true, projection: null });
  });

  it("marks a successful authoritative readback", () => {
    const projection = validateCanonicalStockMutation(input(mortality("mortality-readback", 3)));
    if (!projection.accepted || !projection.projection) throw new Error("expected accepted projection");
    expect(reconcileCanonicalStockMutation(projection.projection, 97)).toMatchObject({
      authoritativeStock: 97,
      readbackMatchesProjection: true,
      discrepancy: null,
    });
  });

  it("surfaces a readback discrepancy instead of trusting the projection", () => {
    const projection = validateCanonicalStockMutation(input(mortality("mortality-discrepancy", 3)));
    if (!projection.accepted || !projection.projection) throw new Error("expected accepted projection");
    expect(reconcileCanonicalStockMutation(projection.projection, 96)).toMatchObject({
      projectedStock: 97,
      authoritativeStock: 96,
      readbackMatchesProjection: false,
      discrepancy: { projectedStock: 97, authoritativeStock: 96 },
    });
  });
});
