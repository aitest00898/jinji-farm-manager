import { describe, expect, it } from "vitest";
import {
  deriveCanonicalLifecycleSummary,
  type CanonicalLifecycleFact,
  type CanonicalLifecycleFlock,
  type CanonicalLifecycleScope,
} from "./canonical-lifecycle-read-model";

const scope: CanonicalLifecycleScope = {
  farmId: "farm-1",
  farmName: "金雞測試場",
  environment: "test",
  houseId: "house-1",
  houseName: "測試一舍",
};

const flock: CanonicalLifecycleFlock = {
  id: "flock-1",
  farmId: "farm-1",
  houseId: "house-1",
  batchCode: "CYCLE-1",
  chickInDate: "2026-09-01",
  initialCount: 3,
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
};

function fact(input: Partial<CanonicalLifecycleFact> & Pick<CanonicalLifecycleFact, "id" | "taxonomyId">): CanonicalLifecycleFact {
  return {
    id: input.id,
    taxonomyId: input.taxonomyId,
    farmId: input.farmId ?? "farm-1",
    houseId: input.houseId === undefined ? "house-1" : input.houseId,
    flockId: input.flockId === undefined ? "flock-1" : input.flockId,
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
  };
}

function intake(overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id: "intake-1", taxonomyId: "O1", totalCount: 3, ...overrides });
}

function removal(id: string, quantity: number, occurredAt: string, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id, taxonomyId: "O3", quantity, occurredAt, ...overrides });
}

function cleaning(id: string, workflowStatus: "pending" | "completed", occurredAt: string, completedAt: string | null = null, overrides: Partial<CanonicalLifecycleFact> = {}): CanonicalLifecycleFact {
  return fact({ id, taxonomyId: "O7", workflowStatus, occurredAt, completedAt, ...overrides });
}

describe("canonical one-water lifecycle read model", () => {
  it("derives ACTIVE when effective stock is greater than zero", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [intake()]);
    expect(result).toMatchObject({ lifecycleStatus: "ACTIVE", effectiveStock: 3, readyForNextIntake: false });
  });

  it("derives EMPTY_AWAITING_CLEANING when stock is zero without completed O7", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [intake(), removal("shipment-1", 3, "2026-09-03T08:00:00+08:00")]);
    expect(result).toMatchObject({ lifecycleStatus: "EMPTY_AWAITING_CLEANING", effectiveStock: 0, cleaningStatus: "not_recorded", readyForNextIntake: false });
  });

  it("keeps a pending O7 in EMPTY_AWAITING_CLEANING", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [intake(), removal("shipment-1", 3, "2026-09-03T08:00:00+08:00"), cleaning("cleaning-1", "pending", "2026-09-04T08:00:00+08:00")]);
    expect(result).toMatchObject({ lifecycleStatus: "EMPTY_AWAITING_CLEANING", cleaningStatus: "pending", reason: "CLEANING_PENDING" });
  });

  it("does not treat O7 before final depletion as ready", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [
      intake(),
      cleaning("cleaning-1", "completed", "2026-09-02T08:00:00+08:00", "2026-09-02T09:00:00+08:00"),
      removal("shipment-1", 3, "2026-09-03T08:00:00+08:00"),
    ]);
    expect(result).toMatchObject({ lifecycleStatus: "EMPTY_AWAITING_CLEANING", reason: "CLEANING_BEFORE_FINAL_DEPLETION", readyForNextIntake: false });
  });

  it("derives READY_NEXT_INTAKE only for same-cycle completed O7 after depletion", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [
      intake(),
      removal("shipment-1", 3, "2026-09-03T08:00:00+08:00"),
      cleaning("cleaning-1", "completed", "2026-09-04T08:00:00+08:00", "2026-09-04T09:00:00+08:00"),
    ]);
    expect(result).toMatchObject({ lifecycleStatus: "READY_NEXT_INTAKE", effectiveStock: 0, cleaningStatus: "completed", readyForNextIntake: true });
  });

  it("removes the effective shipment effect when the exact shipment is reversed", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [
      intake(),
      removal("shipment-1", 3, "2026-09-03T08:00:00+08:00"),
      removal("shipment-reversal-1", 3, "2026-09-04T08:00:00+08:00", { reversalOfId: "shipment-1" }),
    ]);
    expect(result).toMatchObject({ lifecycleStatus: "ACTIVE", effectiveStock: 3, readyForNextIntake: false });
  });

  it("recomputes stock after an append-only correction child changes the effective quantity", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [
      intake(),
      removal("shipment-1", 1, "2026-09-03T08:00:00+08:00"),
      removal("shipment-correction-1", 3, "2026-09-04T08:00:00+08:00", { correctionOfId: "shipment-1" }),
    ]);
    expect(result).toMatchObject({ lifecycleStatus: "EMPTY_AWAITING_CLEANING", effectiveStock: 0 });
  });

  it("does not let previous-cycle O7 make the current cycle ready", () => {
    const oldFlock = { ...flock, id: "flock-old", batchCode: "CYCLE-OLD", chickInDate: "2026-08-01", status: "closed" as const };
    const currentFlock = { ...flock, id: "flock-current", batchCode: "CYCLE-CURRENT", chickInDate: "2026-09-01" };
    const result = deriveCanonicalLifecycleSummary(scope, [oldFlock, currentFlock], [
      intake({ id: "old-intake", flockId: "flock-old", occurredAt: "2026-08-01T08:00:00+08:00" }),
      removal("old-shipment", 3, "2026-08-05T08:00:00+08:00", { flockId: "flock-old" }),
      cleaning("old-cleaning", "completed", "2026-08-06T08:00:00+08:00", "2026-08-06T09:00:00+08:00", { flockId: "flock-old" }),
      intake({ id: "current-intake", flockId: "flock-current", occurredAt: "2026-09-01T08:00:00+08:00" }),
      removal("current-shipment", 3, "2026-09-03T08:00:00+08:00", { flockId: "flock-current" }),
    ]);
    expect(result).toMatchObject({ currentFlock: { id: "flock-current" }, lifecycleStatus: "EMPTY_AWAITING_CLEANING", reason: "CLEANING_NOT_COMPLETED" });
  });

  it("selects a new active flock as the current lifecycle after the old one is ready", () => {
    const oldFlock = { ...flock, id: "flock-old", batchCode: "CYCLE-OLD", chickInDate: "2026-08-01", status: "closed" as const };
    const currentFlock = { ...flock, id: "flock-current", batchCode: "CYCLE-CURRENT", chickInDate: "2026-09-10", initialCount: 4 };
    const result = deriveCanonicalLifecycleSummary(scope, [oldFlock, currentFlock], [
      intake({ id: "old-intake", flockId: "flock-old", totalCount: 3, occurredAt: "2026-08-01T08:00:00+08:00" }),
      removal("old-shipment", 3, "2026-08-03T08:00:00+08:00", { flockId: "flock-old" }),
      cleaning("old-cleaning", "completed", "2026-08-04T08:00:00+08:00", "2026-08-04T09:00:00+08:00", { flockId: "flock-old" }),
      intake({ id: "current-intake", flockId: "flock-current", totalCount: 4, occurredAt: "2026-09-10T08:00:00+08:00" }),
    ]);
    expect(result).toMatchObject({ currentFlock: { id: "flock-current", batchCode: "CYCLE-CURRENT" }, lifecycleStatus: "ACTIVE", effectiveStock: 4 });
  });

  it("fails closed for insufficient or contradictory lineage evidence", () => {
    const result = deriveCanonicalLifecycleSummary(scope, [flock], [
      intake(),
      intake({ id: "intake-2", occurredAt: "2026-09-01T09:00:00+08:00" }),
    ]);
    expect(result).toMatchObject({ lifecycleStatus: "INCOMPLETE", dataCompleteness: "incomplete", readyForNextIntake: false });
  });
});
