import { describe, expect, it } from "vitest";
import {
  getFeedEstimate,
  type CanonicalFeedFact,
  type FeedEstimateInput,
} from "./canonical-feed-estimation";
import type { CanonicalLifecycleFlock, CanonicalLifecycleScope } from "./canonical-lifecycle-read-model";

const scope: CanonicalLifecycleScope = {
  farmId: "farm-1",
  farmName: "金雞測試場",
  environment: "test",
  houseId: "house-a",
  houseName: "測試一舍",
};

const AS_OF = "2026-09-10T12:00:00.000Z";

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timestamp(date: string, days = 0, hour = 8): string {
  return `${dateOffset(date, days)}T${String(hour).padStart(2, "0")}:00:00+08:00`;
}

function flock(input: Partial<CanonicalLifecycleFlock> & Pick<CanonicalLifecycleFlock, "id" | "chickInDate">): CanonicalLifecycleFlock {
  return {
    id: input.id,
    farmId: input.farmId ?? "farm-1",
    houseId: input.houseId ?? "house-a",
    batchCode: input.batchCode ?? `BATCH-${input.id}`,
    chickInDate: input.chickInDate,
    initialCount: input.initialCount ?? 100,
    status: input.status ?? "closed",
    createdAt: input.createdAt ?? timestamp(input.chickInDate),
  };
}

function fact(input: Partial<CanonicalFeedFact> & Pick<CanonicalFeedFact, "id" | "taxonomyId">): CanonicalFeedFact {
  const occurredAt = input.occurredAt ?? timestamp("2026-01-01");
  return {
    id: input.id,
    taxonomyId: input.taxonomyId,
    farmId: input.farmId ?? "farm-1",
    houseId: input.houseId === undefined ? "house-a" : input.houseId,
    flockId: input.flockId === undefined ? null : input.flockId,
    occurredAt,
    createdAt: input.createdAt ?? occurredAt,
    totalCount: input.totalCount === undefined ? null : input.totalCount,
    quantity: input.quantity === undefined ? null : input.quantity,
    weight: input.weight === undefined ? null : input.weight,
    weightUnit: input.weightUnit === undefined ? null : input.weightUnit,
    workflowStatus: input.workflowStatus === undefined ? null : input.workflowStatus,
    completedAt: input.completedAt === undefined ? null : input.completedAt,
    lifecycleStatus: input.lifecycleStatus === undefined ? "active" : input.lifecycleStatus,
    reversedAt: input.reversedAt === undefined ? null : input.reversedAt,
    correctionOfId: input.correctionOfId === undefined ? null : input.correctionOfId,
    reversalOfId: input.reversalOfId === undefined ? null : input.reversalOfId,
    replacementOfId: input.replacementOfId === undefined ? null : input.replacementOfId,
  };
}

function intake(id: string, cycle: CanonicalLifecycleFlock, totalCount = cycle.initialCount): CanonicalFeedFact {
  return fact({ id, taxonomyId: "O1", farmId: cycle.farmId, houseId: cycle.houseId, flockId: cycle.id, occurredAt: timestamp(cycle.chickInDate), totalCount });
}

function removal(
  id: string,
  cycle: CanonicalLifecycleFlock,
  taxonomyId: "O3" | "O9",
  quantity: number,
  days: number,
): CanonicalFeedFact {
  return fact({ id, taxonomyId, farmId: cycle.farmId, houseId: cycle.houseId, flockId: cycle.id, occurredAt: timestamp(cycle.chickInDate, days), quantity });
}

function cleaning(id: string, cycle: CanonicalLifecycleFlock): CanonicalFeedFact {
  return fact({
    id,
    taxonomyId: "O7",
    farmId: cycle.farmId,
    houseId: cycle.houseId,
    flockId: cycle.id,
    occurredAt: timestamp(cycle.chickInDate, 21),
    workflowStatus: "completed",
    completedAt: timestamp(cycle.chickInDate, 21, 9),
  });
}

function feedOrder(
  id: string,
  cycle: CanonicalLifecycleFlock,
  weight: number,
  days = 8,
  overrides: Partial<CanonicalFeedFact> = {},
): CanonicalFeedFact {
  return fact({
    id,
    taxonomyId: "O5",
    farmId: cycle.farmId,
    houseId: cycle.houseId,
    flockId: cycle.id,
    occurredAt: timestamp(cycle.chickInDate, days),
    weight,
    weightUnit: "kg",
    ...overrides,
  });
}

function completedCycle(
  id: string,
  chickInDate: string,
  feedKg = 10,
  overrides: { farmId?: string; houseId?: string; initialCount?: number; mortality?: number; feed?: Partial<CanonicalFeedFact> } = {},
): { flock: CanonicalLifecycleFlock; facts: CanonicalFeedFact[] } {
  const cycle = flock({ id, chickInDate, farmId: overrides.farmId, houseId: overrides.houseId, initialCount: overrides.initialCount });
  const mortality = overrides.mortality ?? 0;
  const facts: CanonicalFeedFact[] = [intake(`${id}-intake`, cycle)];
  if (mortality > 0) facts.push(removal(`${id}-mortality`, cycle, "O9", mortality, 3));
  facts.push(removal(`${id}-shipment`, cycle, "O3", cycle.initialCount - mortality, 20));
  facts.push(cleaning(`${id}-cleaning`, cycle));
  facts.push(feedOrder(`${id}-feed`, cycle, feedKg, 8, overrides.feed));
  return { flock: cycle, facts };
}

function currentFixture(options: { initialCount?: number; removed?: number; feedKg?: number } = {}): { current: CanonicalLifecycleFlock; flocks: CanonicalLifecycleFlock[]; facts: CanonicalFeedFact[] } {
  const current = flock({ id: "current", chickInDate: "2026-09-01", status: "active", initialCount: options.initialCount ?? 100 });
  const facts: CanonicalFeedFact[] = [intake("current-intake", current), feedOrder("current-feed", current, options.feedKg ?? 10)];
  if (options.removed) facts.splice(1, 0, removal("current-mortality", current, "O9", options.removed, 3));
  return { current, flocks: [current], facts };
}

function inputWithCycles(cycles: Array<{ flock: CanonicalLifecycleFlock; facts: CanonicalFeedFact[] }>, currentOptions: { initialCount?: number; removed?: number; feedKg?: number } = {}): FeedEstimateInput {
  const current = currentFixture(currentOptions);
  return {
    scope,
    currentCycleId: current.current.id,
    asOf: AS_OF,
    flocks: [current.current, ...cycles.map((cycle) => cycle.flock)],
    facts: [...current.facts, ...cycles.flatMap((cycle) => cycle.facts)],
  };
}

describe("deterministic canonical feed estimation", () => {
  it("fails closed when there are no historical cycles", () => {
    const result = getFeedEstimate(inputWithCycles([]));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 0, currentStock: 100, currentAge: 9 });
    expect(result.missingData).toContain("minimum_eligible_completed_cycles");
  });

  it("reports the minimum requirement when fewer than three cycles qualify", () => {
    const cycles = [completedCycle("cycle-1", "2026-08-01")];
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 1, referenceCycleCount: 1 });
    expect(result.minimumDataRequirement.minimumEligibleCycles).toBe(3);
  });

  it("estimates with exactly the minimum three completed same-house cycles", () => {
    const cycles = [
      completedCycle("cycle-1", "2026-08-01", 10),
      completedCycle("cycle-2", "2026-07-01", 20),
      completedCycle("cycle-3", "2026-06-01", 30),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result).toMatchObject({ status: "ESTIMATE_AVAILABLE", referenceCycleCount: 3, availableEligibleCycleCount: 3, currentStock: 100, currentAge: 9, estimate: 20, range: { lower: 10, upper: 30 } });
  });

  it("keeps only the latest fifteen eligible cycles while reporting all available cycles", () => {
    const cycles = Array.from({ length: 16 }, (_, index) => completedCycle(`cycle-${index}`, dateOffset("2026-08-01", -index * 30), index + 1));
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result.status).toBe("ESTIMATE_AVAILABLE");
    expect(result.availableEligibleCycleCount).toBe(16);
    expect(result.referenceCycleCount).toBe(15);
    expect(result.referenceCycles.map((cycle) => cycle.cycleId)).not.toContain("cycle-15");
  });

  it("excludes cycles older than the five-year cutoff", () => {
    const cycles = [
      completedCycle("old-1", "2020-01-01"),
      completedCycle("old-2", "2020-02-01"),
      completedCycle("old-3", "2020-03-01"),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 0 });
    expect(result.referenceWindowStart).toBe("2021-09-10");
  });

  it("prefers the same house and does not widen to other-house cycles", () => {
    const sameHouse = [
      completedCycle("same-1", "2026-08-01"),
      completedCycle("same-2", "2026-07-01"),
    ];
    const otherHouse = [
      completedCycle("other-1", "2026-06-01", 10, { houseId: "house-b" }),
      completedCycle("other-2", "2026-05-01", 20, { houseId: "house-b" }),
      completedCycle("other-3", "2026-04-01", 30, { houseId: "house-b" }),
    ];
    const result = getFeedEstimate(inputWithCycles([...sameHouse, ...otherHouse]));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 2, referenceCycleCount: 2 });
    expect(result.referenceCycles.every((cycle) => cycle.cycleId.startsWith("same-"))).toBe(true);
  });

  it("normalizes feed by effective live birds after mortality", () => {
    const cycles = [
      completedCycle("mortality", "2026-08-01", 10, { mortality: 50 }),
      completedCycle("healthy", "2026-07-01", 10),
      completedCycle("baseline", "2026-06-01", 10),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles));
    const mortalityEvidence = result.referenceCycles.find((cycle) => cycle.cycleId === "mortality");
    expect(mortalityEvidence).toMatchObject({ averageLiveBirds: 50, normalizedKgPerLiveBird: 0.2 });
    expect(result).toMatchObject({ estimate: 10, range: { lower: 10, upper: 20 } });
  });

  it("uses the corrected effective O5 quantity", () => {
    const corrected = completedCycle("corrected", "2026-08-01", 10);
    const original = corrected.facts.find((fact) => fact.id === "corrected-feed")!;
    corrected.facts.push(feedOrder("corrected-feed-child", corrected.flock, 20, 8, { correctionOfId: original.id }));
    const result = getFeedEstimate(inputWithCycles([
      corrected,
      completedCycle("cycle-2", "2026-07-01", 10),
      completedCycle("cycle-3", "2026-06-01", 10),
    ]));
    expect(result.referenceCycles.find((cycle) => cycle.cycleId === "corrected")).toMatchObject({ feedKg: 20 });
  });

  it("excludes a reversed O5 order from the effective projection", () => {
    const reversed = completedCycle("reversed", "2026-08-01", 10);
    const original = reversed.facts.find((fact) => fact.id === "reversed-feed")!;
    reversed.facts.push(feedOrder("reversed-feed-child", reversed.flock, 10, 8, { lifecycleStatus: "reversal", reversalOfId: original.id }));
    const result = getFeedEstimate(inputWithCycles([
      reversed,
      completedCycle("cycle-2", "2026-07-01", 10),
      completedCycle("cycle-3", "2026-06-01", 10),
    ]));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 2 });
    expect(result.referenceCycles.some((cycle) => cycle.cycleId === "reversed")).toBe(false);
  });

  it("isolates historical farm and house scope", () => {
    const otherScope = [
      completedCycle("other-farm-1", "2026-08-01", 10, { farmId: "farm-2", houseId: "house-z" }),
      completedCycle("other-farm-2", "2026-07-01", 20, { farmId: "farm-2", houseId: "house-z" }),
      completedCycle("other-farm-3", "2026-06-01", 30, { farmId: "farm-2", houseId: "house-z" }),
    ];
    const result = getFeedEstimate(inputWithCycles(otherScope));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 0 });
  });

  it("uses current effective stock and current age in the estimate", () => {
    const cycles = [
      completedCycle("cycle-1", "2026-08-01", 10),
      completedCycle("cycle-2", "2026-07-01", 10),
      completedCycle("cycle-3", "2026-06-01", 10),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles, { removed: 20 }));
    expect(result).toMatchObject({ status: "ESTIMATE_AVAILABLE", currentStock: 80, currentAge: 9, estimate: 8 });
  });

  it("returns a deterministic transparent min/max range", () => {
    const input = inputWithCycles([
      completedCycle("cycle-1", "2026-08-01", 10),
      completedCycle("cycle-2", "2026-07-01", 20),
      completedCycle("cycle-3", "2026-06-01", 30),
    ]);
    const first = getFeedEstimate(input);
    const second = getFeedEstimate(input);
    expect(first).toEqual(second);
    expect(first.range).toEqual({ lower: 10, upper: 30 });
    expect(first.methodSummary).toContain("中位數");
  });

  it("fails closed when historical O5 data lacks a usable kg quantity", () => {
    const cycles = [
      completedCycle("cycle-1", "2026-08-01", 10, { feed: { weightUnit: "bag" } }),
      completedCycle("cycle-2", "2026-07-01", 10, { feed: { weight: null, weightUnit: "kg" } }),
      completedCycle("cycle-3", "2026-06-01", 10, { feed: { weight: 0 } }),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 0 });
    expect(result.missingData).toContain("historical_feed_order_in_current_age_window");
  });

  it("does not mutate facts or create a business write", () => {
    const cycles = [
      completedCycle("cycle-1", "2026-08-01"),
      completedCycle("cycle-2", "2026-07-01"),
      completedCycle("cycle-3", "2026-06-01"),
    ];
    const input = inputWithCycles(cycles);
    const before = JSON.stringify(input);
    const result = getFeedEstimate(input);
    expect(result.status).toBe("ESTIMATE_AVAILABLE");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("includes the exact five-year boundary and excludes one day before it", () => {
    const cycles = [
      completedCycle("boundary", "2021-09-10"),
      completedCycle("inside-1", "2022-01-01"),
      completedCycle("inside-2", "2022-05-01"),
      completedCycle("outside", "2021-09-09"),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result.availableEligibleCycleCount).toBe(3);
    expect(result.referenceCycles.map((cycle) => cycle.cycleId)).toContain("boundary");
    expect(result.referenceCycles.map((cycle) => cycle.cycleId)).not.toContain("outside");
  });

  it("requires historical orders to align with the current age window", () => {
    const cycles = [
      completedCycle("early-1", "2026-08-01", 10, { feed: { occurredAt: timestamp("2026-08-01", 1) } }),
      completedCycle("early-2", "2026-07-01", 10, { feed: { occurredAt: timestamp("2026-07-01", 1) } }),
      completedCycle("early-3", "2026-06-01", 10, { feed: { occurredAt: timestamp("2026-06-01", 1) } }),
    ];
    const result = getFeedEstimate(inputWithCycles(cycles));
    expect(result).toMatchObject({ status: "INSUFFICIENT_DATA", availableEligibleCycleCount: 0, currentAge: 9 });
  });
});
