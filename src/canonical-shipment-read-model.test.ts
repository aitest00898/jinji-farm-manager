import { describe, expect, it } from "vitest";
import {
  deriveCanonicalShipmentReadModel,
  validateCanonicalShipmentMutation,
  type CanonicalShipmentReadInput,
} from "./canonical-shipment-read-model";
import {
  deriveCanonicalLifecycleSummary,
  type CanonicalLifecycleFact,
  type CanonicalLifecycleFlock,
  type CanonicalLifecycleScope,
} from "./canonical-lifecycle-read-model";

const scope: CanonicalLifecycleScope = {
  farmId: "farm-o3",
  farmName: "O3 測試場",
  environment: "test",
  houseId: "house-o3",
  houseName: "O3 測試舍",
};

const flock: CanonicalLifecycleFlock = {
  id: "flock-o3",
  farmId: "farm-o3",
  houseId: "house-o3",
  batchCode: "O3-CYCLE-1",
  chickInDate: "2026-09-01",
  initialCount: 100,
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
};

function fact(input: Partial<CanonicalLifecycleFact> & Pick<CanonicalLifecycleFact, "id" | "taxonomyId">): CanonicalLifecycleFact {
  return {
    id: input.id,
    taxonomyId: input.taxonomyId,
    farmId: input.farmId ?? "farm-o3",
    houseId: input.houseId === undefined ? "house-o3" : input.houseId,
    flockId: input.flockId === undefined ? "flock-o3" : input.flockId,
    occurredAt: input.occurredAt ?? "2026-09-01T08:00:00.000+08:00",
    createdAt: input.createdAt ?? input.occurredAt ?? "2026-09-01T08:00:00.000+08:00",
    quantity: input.quantity === undefined ? null : input.quantity,
    totalCount: input.totalCount === undefined ? null : input.totalCount,
    workflowStatus: input.workflowStatus === undefined ? null : input.workflowStatus,
    completedAt: input.completedAt === undefined ? null : input.completedAt,
    lifecycleStatus: input.lifecycleStatus === undefined ? "active" : input.lifecycleStatus,
    reversedAt: input.reversedAt === undefined ? null : input.reversedAt,
    correctionOfId: input.correctionOfId === undefined ? null : input.correctionOfId,
    reversalOfId: input.reversalOfId === undefined ? null : input.reversalOfId,
    replacementOfId: input.replacementOfId === undefined ? null : input.replacementOfId,
    totalWeight: input.totalWeight === undefined ? null : input.totalWeight,
    averageWeight: input.averageWeight === undefined ? null : input.averageWeight,
    weightUnit: input.weightUnit === undefined ? null : input.weightUnit,
  };
}

function intake(count = 100, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id: "intake-o3", taxonomyId: "O1", totalCount: count, ...overrides });
}

function shipment(id: string, quantity: number, occurredAt: string, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id, taxonomyId: "O3", quantity, occurredAt, ...overrides });
}

function read(facts: CanonicalLifecycleFact[], flocks: readonly CanonicalLifecycleFlock[] = [flock]): ReturnType<typeof deriveCanonicalShipmentReadModel> {
  const input: CanonicalShipmentReadInput = { scope, currentFlock: flock, flocks, facts };
  return deriveCanonicalShipmentReadModel(input);
}

describe("canonical O3 shipment operational semantics", () => {
  it("derives a partial shipment and leaves lifecycle ACTIVE", () => {
    const result = read([intake(), shipment("ship-20", 20, "2026-09-02T08:00:00+08:00")]);
    expect(result).toMatchObject({ effectiveStock: 80, reason: null });
    expect(result.projections).toContainEqual(expect.objectContaining({ shipmentId: "ship-20", stockBefore: 100, stockAfter: 80, shipmentState: "PARTIAL_SHIPMENT", effective: true }));
    expect(deriveCanonicalLifecycleSummary(scope, [flock], [intake(), shipment("ship-20", 20, "2026-09-02T08:00:00+08:00")])).toMatchObject({ lifecycleStatus: "ACTIVE", effectiveStock: 80 });
  });

  it("derives a final shipment and leaves the house awaiting cleaning", () => {
    const result = read([intake(), shipment("ship-100", 100, "2026-09-02T08:00:00+08:00")]);
    expect(result).toMatchObject({ effectiveStock: 0, reason: null });
    expect(result.projections).toContainEqual(expect.objectContaining({ shipmentId: "ship-100", stockBefore: 100, stockAfter: 0, shipmentState: "FINAL_SHIPMENT" }));
    expect(deriveCanonicalLifecycleSummary(scope, [flock], [intake(), shipment("ship-100", 100, "2026-09-02T08:00:00+08:00")])).toMatchObject({ lifecycleStatus: "EMPTY_AWAITING_CLEANING", effectiveStock: 0 });
  });

  it("rejects over-shipment and never derives negative stock", () => {
    const candidate = shipment("ship-101", 101, "2026-09-02T08:00:00+08:00");
    const result = validateCanonicalShipmentMutation({ scope, currentFlock: flock, flocks: [flock], facts: [intake()], candidate });
    expect(result).toMatchObject({ accepted: false });
    expect(read([intake(), candidate])).toMatchObject({ effectiveStock: null, reason: "NEGATIVE_EFFECTIVE_STOCK" });
  });

  it("rejects zero or negative shipment quantities", () => {
    for (const quantity of [0, -1]) {
      const candidate = shipment(`ship-invalid-${quantity}`, quantity, "2026-09-02T08:00:00+08:00");
      expect(validateCanonicalShipmentMutation({ scope, currentFlock: flock, flocks: [flock], facts: [intake()], candidate })).toMatchObject({ accepted: false });
    }
  });

  it("removes a partial shipment effect through exact reversal", () => {
    const original = shipment("ship-partial", 20, "2026-09-02T08:00:00+08:00");
    const reversal = shipment("ship-partial-reversal", 20, "2026-09-03T08:00:00+08:00", { reversalOfId: original.id });
    const result = read([intake(), original, reversal]);
    expect(result).toMatchObject({ effectiveStock: 100, reason: null });
    expect(result.projections).toContainEqual(expect.objectContaining({ shipmentId: original.id, effective: false, reversed: true, lineageState: "reversed" }));
  });

  it("restores ACTIVE lifecycle when an exact final shipment is reversed", () => {
    const original = shipment("ship-final", 100, "2026-09-02T08:00:00+08:00");
    const reversal = shipment("ship-final-reversal", 100, "2026-09-03T08:00:00+08:00", { reversalOfId: original.id });
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [intake(), original, reversal]);
    expect(result).toMatchObject({ effectiveStock: 100, lifecycleStatus: "ACTIVE" });
  });

  it("rejects a reversal target outside the current flock scope", () => {
    const foreign = shipment("ship-foreign", 20, "2026-09-02T08:00:00+08:00", { flockId: "flock-other" });
    const reversal = shipment("ship-foreign-reversal", 20, "2026-09-03T08:00:00+08:00", { reversalOfId: foreign.id });
    expect(validateCanonicalShipmentMutation({ scope, currentFlock: flock, flocks: [flock], facts: [intake(), foreign], candidate: reversal })).toMatchObject({
      accepted: false,
      reason: "SHIPMENT_REVERSAL_TARGET_SCOPE_INVALID",
    });
  });

  it("recomputes a corrected final shipment downward as partial", () => {
    const original = shipment("ship-correct-final", 100, "2026-09-02T08:00:00+08:00");
    const correction = shipment("ship-correct-final-child", 80, "2026-09-02T08:00:00+08:00", { correctionOfId: original.id });
    const result = read([intake(), original, correction]);
    expect(result).toMatchObject({ effectiveStock: 20, reason: null });
    expect(result.projections).toContainEqual(expect.objectContaining({ shipmentId: correction.id, stockBefore: 100, stockAfter: 20, shipmentState: "PARTIAL_SHIPMENT", lineageState: "replacement" }));
  });

  it("recomputes a corrected partial shipment to the remaining stock as final", () => {
    const first = shipment("ship-first", 20, "2026-09-02T08:00:00+08:00");
    const original = shipment("ship-correct-partial", 30, "2026-09-03T08:00:00+08:00");
    const correction = shipment("ship-correct-partial-child", 80, "2026-09-03T08:00:00+08:00", { correctionOfId: original.id });
    const result = read([intake(), first, original, correction]);
    expect(result).toMatchObject({ effectiveStock: 0, reason: null });
    expect(result.projections).toContainEqual(expect.objectContaining({ shipmentId: correction.id, stockBefore: 80, stockAfter: 0, shipmentState: "FINAL_SHIPMENT" }));
  });

  it("marks only the effective depletion shipment as final", () => {
    const result = read([
      intake(),
      shipment("ship-a", 20, "2026-09-02T08:00:00+08:00"),
      shipment("ship-b", 30, "2026-09-03T08:00:00+08:00"),
      shipment("ship-c", 50, "2026-09-04T08:00:00+08:00"),
    ]);
    expect(result.projections.filter((item) => item.shipmentState === "FINAL_SHIPMENT").map((item) => item.shipmentId)).toEqual(["ship-c"]);
    expect(result.projections.find((item) => item.shipmentId === "ship-a")?.shipmentState).toBe("PARTIAL_SHIPMENT");
  });

  it("does not let a previous-cycle shipment affect the current cycle", () => {
    const oldFlock = { ...flock, id: "flock-old", batchCode: "O3-OLD", chickInDate: "2026-08-01", status: "closed" as const };
    const currentFlock = { ...flock, id: "flock-current", batchCode: "O3-CURRENT", chickInDate: "2026-09-01" };
    const result = deriveCanonicalShipmentReadModel({
      scope,
      currentFlock,
      flocks: [oldFlock, currentFlock],
      facts: [
        intake(100, { id: "old-intake", flockId: oldFlock.id, occurredAt: "2026-08-01T08:00:00+08:00" }),
        shipment("old-final", 100, "2026-08-05T08:00:00+08:00", { flockId: oldFlock.id }),
        intake(100, { id: "current-intake", flockId: currentFlock.id, occurredAt: "2026-09-01T08:00:00+08:00" }),
        shipment("current-partial", 20, "2026-09-02T08:00:00+08:00", { flockId: currentFlock.id }),
      ],
    });
    expect(result).toMatchObject({ effectiveStock: 80, reason: null });
    expect(result.projections.map((item) => item.shipmentId)).toEqual(["current-partial"]);
  });

  it("does not invent an average when weight evidence is missing", () => {
    const result = read([intake(), shipment("ship-no-weight", 20, "2026-09-02T08:00:00+08:00")]);
    expect(result.projections.find((item) => item.shipmentId === "ship-no-weight")).toMatchObject({ totalWeight: null, averageWeight: null });
  });

  it("derives average weight deterministically from total weight and bird count", () => {
    const result = read([intake(), shipment("ship-weight", 20, "2026-09-02T08:00:00+08:00", { totalWeight: 50, weightUnit: "kg" })]);
    expect(result.projections.find((item) => item.shipmentId === "ship-weight")).toMatchObject({ totalWeight: 50, averageWeight: 2.5, weightUnit: "kg" });
  });

  it("exposes correction and reversal lineage while applying only effective facts", () => {
    const original = shipment("ship-lineage", 20, "2026-09-02T08:00:00+08:00");
    const correction = shipment("ship-lineage-correction", 10, "2026-09-02T08:00:00+08:00", { correctionOfId: original.id });
    const reversal = shipment("ship-lineage-reversal", 10, "2026-09-03T08:00:00+08:00", { reversalOfId: correction.id });
    const result = read([intake(), original, correction, reversal]);
    expect(result).toMatchObject({ effectiveStock: 100, reason: null });
    expect(result.projections.find((item) => item.shipmentId === original.id)).toMatchObject({ effective: false, corrected: true });
    expect(result.projections.find((item) => item.shipmentId === correction.id)).toMatchObject({ effective: false, reversed: true });
  });

  it("keeps read projection pure and performs no business write", () => {
    const facts = [intake(), shipment("ship-pure", 20, "2026-09-02T08:00:00+08:00")];
    const snapshot = structuredClone(facts);
    const result = read(facts);
    expect(facts).toEqual(snapshot);
    expect(result.projections).toHaveLength(1);
  });
});
