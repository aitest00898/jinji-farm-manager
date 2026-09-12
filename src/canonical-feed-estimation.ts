import {
  deriveCanonicalLifecycleSummary,
  effectiveCanonicalLifecycleFacts,
  type CanonicalLifecycleFact,
  type CanonicalLifecycleFlock,
  type CanonicalLifecycleScope,
} from "./canonical-lifecycle-read-model";

export const FEED_ESTIMATION_MAX_YEARS = 5;
export const FEED_ESTIMATION_MAX_CYCLES = 15;
export const MINIMUM_ELIGIBLE_FEED_CYCLES = 3;
export const FEED_AGE_WINDOW_DAYS = 7;

export type FeedEstimateStatus = "ESTIMATE_AVAILABLE" | "INSUFFICIENT_DATA";

export interface CanonicalFeedFact {
  id: string;
  taxonomyId: "O1" | "O3" | "O5" | "O7" | "O9";
  farmId: string;
  houseId: string | null;
  flockId: string | null;
  occurredAt: string | null;
  createdAt: string;
  totalCount: number | null;
  quantity: number | null;
  weight: number | null;
  weightUnit: string | null;
  workflowStatus: string | null;
  completedAt: string | null;
  lifecycleStatus: string | null;
  reversedAt: string | null;
  correctionOfId: string | null;
  reversalOfId: string | null;
  replacementOfId: string | null;
}

export interface FeedEstimateInput {
  scope: CanonicalLifecycleScope;
  currentCycleId: string;
  asOf: Date | string;
  flocks: readonly CanonicalLifecycleFlock[];
  facts: readonly CanonicalFeedFact[];
}

export interface FeedEstimateCycleEvidence {
  cycleId: string;
  batchCode: string;
  chickInDate: string;
  cycleDurationDays: number;
  ageWindowStartDay: number;
  ageWindowEndDay: number;
  feedKg: number;
  averageLiveBirds: number;
  normalizedKgPerLiveBird: number;
}

export interface FeedEstimateResult {
  status: FeedEstimateStatus;
  estimate: number | null;
  range: { lower: number; upper: number } | null;
  unit: "kg";
  referenceCycleCount: number;
  availableEligibleCycleCount: number;
  referenceWindowStart: string | null;
  referenceWindowEnd: string | null;
  currentStock: number | null;
  currentAge: number | null;
  currentPeriodFeedOrderCount: number;
  minimumDataRequirement: {
    minimumEligibleCycles: number;
    perCycle: readonly string[];
    ageWindowDays: number;
  };
  missingData: string[];
  methodSummary: string;
  referenceCycles: FeedEstimateCycleEvidence[];
}

interface EffectiveFeedFactsResult {
  facts: CanonicalFeedFact[];
  reason: string | null;
}

interface ParsedDate {
  timestamp: number;
  value: string;
}

interface AgeWindow {
  startDay: number;
  endDay: number;
}

const DAY_MS = 86_400_000;
const REQUIRED_PER_CYCLE = Object.freeze([
  "cycle identity",
  "intake/start date",
  "initial bird count or reliable effective stock basis",
  "effective O5 feed-order quantity in kg",
  "feed-order timing that aligns to the current age window",
  "completed cycle duration / effective end timestamp",
]);

function parseDate(value: string | null | undefined): ParsedDate | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? { timestamp, value } : null;
}

function factDate(fact: CanonicalFeedFact): ParsedDate | null {
  return parseDate(fact.occurredAt) ?? parseDate(fact.createdAt);
}

type LifecycleTaxonomy = CanonicalLifecycleFact["taxonomyId"];

function isLifecycleTaxonomy(fact: CanonicalFeedFact): fact is CanonicalFeedFact & { taxonomyId: LifecycleTaxonomy } {
  return fact.taxonomyId === "O1" || fact.taxonomyId === "O3" || fact.taxonomyId === "O7" || fact.taxonomyId === "O9";
}

function lifecycleFact(fact: CanonicalFeedFact & { taxonomyId: LifecycleTaxonomy }): CanonicalLifecycleFact {
  return {
    id: fact.id,
    taxonomyId: fact.taxonomyId,
    farmId: fact.farmId,
    houseId: fact.houseId,
    flockId: fact.flockId,
    occurredAt: fact.occurredAt,
    createdAt: fact.createdAt,
    quantity: fact.quantity,
    totalCount: fact.totalCount,
    workflowStatus: fact.workflowStatus,
    completedAt: fact.completedAt,
    lifecycleStatus: fact.lifecycleStatus,
    reversedAt: fact.reversedAt,
    correctionOfId: fact.correctionOfId,
    reversalOfId: fact.reversalOfId,
    replacementOfId: fact.replacementOfId,
  };
}

function lifecycleFacts(facts: readonly CanonicalFeedFact[]): CanonicalLifecycleFact[] {
  return facts.filter(isLifecycleTaxonomy).map(lifecycleFact);
}

function relationFields(fact: CanonicalFeedFact): Array<{ field: string; id: string }> {
  const candidates: Array<[string, string | null]> = [
    ["correctionOfId", fact.correctionOfId],
    ["reversalOfId", fact.reversalOfId],
    ["replacementOfId", fact.replacementOfId],
  ];
  return candidates.flatMap(([field, id]) => typeof id === "string" && id ? [{ field, id }] : []);
}

function sameScope(left: CanonicalFeedFact, right: CanonicalFeedFact): boolean {
  return left.farmId === right.farmId
    && left.houseId === right.houseId
    && left.flockId === right.flockId;
}

/**
 * Projects only O5 facts through the same append-only lineage shape used by
 * canonical reads. A correction/replacement leaf is effective; a reversal
 * leaf and its targeted parent have no effective feed-order quantity.
 */
export function effectiveCanonicalFeedFacts(
  facts: readonly CanonicalFeedFact[],
): EffectiveFeedFactsResult {
  const feedFacts = facts.filter((fact) => fact.taxonomyId === "O5");
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const children = new Map<string, CanonicalFeedFact[]>();
  for (const fact of feedFacts) {
    const relations = relationFields(fact);
    if (relations.length > 1) return { facts: [], reason: "MULTIPLE_LINEAGE_REFERENCES" };
    if (fact.lifecycleStatus === "replacement" && relations.length === 0) {
      return { facts: [], reason: "REPLACEMENT_WITHOUT_LINEAGE" };
    }
    const relation = relations[0];
    if (!relation) continue;
    if (relation.id === fact.id) return { facts: [], reason: "SELF_LINEAGE" };
    const parent = byId.get(relation.id);
    if (!parent || parent.taxonomyId !== "O5") return { facts: [], reason: "LINEAGE_REFERENCE_INVALID" };
    if (!sameScope(parent, fact)) return { facts: [], reason: "LINEAGE_SCOPE_MISMATCH" };
    const rows = children.get(parent.id) ?? [];
    rows.push(fact);
    children.set(parent.id, rows);
  }
  for (const [parentId, rows] of children) {
    if (rows.length > 1) return { facts: [], reason: `MULTIPLE_LINEAGE_CHILDREN:${parentId}` };
  }
  return {
    facts: feedFacts.filter((fact) => {
      if (fact.lifecycleStatus === "reversed" || fact.lifecycleStatus === "reversal") return false;
      if (children.has(fact.id)) return false;
      const relation = relationFields(fact)[0];
      return !relation || relation.field === "correctionOfId" || relation.field === "replacementOfId";
    }),
    reason: null,
  };
}

function asOfDate(value: Date | string): { date: string; timestamp: number } | null {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const date = parsed.toISOString().slice(0, 10);
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? { date, timestamp } : null;
}

function subtractYears(date: string, years: number): string | null {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  const value = new Date(parsed);
  value.setUTCFullYear(value.getUTCFullYear() - years);
  return value.toISOString().slice(0, 10);
}

function ageDays(chickInDate: string, eventTimestamp: number): number | null {
  const start = Date.parse(`${chickInDate}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return null;
  const age = Math.floor((eventTimestamp - start) / DAY_MS);
  return Number.isInteger(age) && age >= 0 ? age : null;
}

function ageWindow(currentAge: number): AgeWindow {
  const startDay = Math.floor(currentAge / FEED_AGE_WINDOW_DAYS) * FEED_AGE_WINDOW_DAYS;
  return { startDay, endDay: startDay + FEED_AGE_WINDOW_DAYS };
}

function inAgeWindow(age: number | null, window: AgeWindow): boolean {
  return age !== null && age >= window.startDay && age < window.endDay;
}

function cycleWindow(
  flock: CanonicalLifecycleFlock,
  flocks: readonly CanonicalLifecycleFlock[],
): { start: number; end: number | null } | null {
  const start = Date.parse(`${flock.chickInDate}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return null;
  const next = flocks
    .filter((candidate) => candidate.id !== flock.id && candidate.status !== "cancelled" && candidate.houseId === flock.houseId && candidate.chickInDate > flock.chickInDate)
    .sort((left, right) => left.chickInDate.localeCompare(right.chickInDate) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
  const end = next ? Date.parse(`${next.chickInDate}T00:00:00.000Z`) : null;
  return { start, end: end !== null && Number.isFinite(end) ? end : null };
}

function factsForCycle(
  flock: CanonicalLifecycleFlock,
  flocks: readonly CanonicalLifecycleFlock[],
  facts: readonly CanonicalFeedFact[],
): CanonicalFeedFact[] {
  const window = cycleWindow(flock, flocks);
  if (!window) return [];
  return facts.filter((fact) => {
    if (fact.farmId !== flock.farmId) return false;
    const at = factDate(fact)?.timestamp;
    if (at === undefined || at < window.start || (window.end !== null && at >= window.end)) return false;
    if (fact.flockId === flock.id) return true;
    return fact.flockId === null && fact.houseId === flock.houseId;
  });
}

function validInitialCount(flock: CanonicalLifecycleFlock, cycleFacts: readonly CanonicalLifecycleFact[]): number | null {
  const intakeFacts = cycleFacts.filter((fact) => fact.taxonomyId === "O1");
  if (intakeFacts.length > 1) return null;
  const intake = intakeFacts[0];
  const initial = intake?.totalCount ?? flock.initialCount;
  return Number.isInteger(initial) && initial > 0 ? initial : null;
}

function effectiveStockAt(
  flock: CanonicalLifecycleFlock,
  cycleFacts: readonly CanonicalFeedFact[],
  at: number,
): number | null {
  const lifecycle = effectiveCanonicalLifecycleFacts(lifecycleFacts(cycleFacts));
  if (lifecycle.reason) return null;
  const initial = validInitialCount(flock, lifecycle.facts);
  if (initial === null) return null;
  const events = lifecycle.facts
    .map((fact) => ({ fact, at: parseDate(fact.occurredAt)?.timestamp ?? parseDate(fact.createdAt)?.timestamp ?? null }))
    .filter((item): item is { fact: CanonicalLifecycleFact; at: number } => item.at !== null && item.at <= at)
    .filter((item) => item.fact.taxonomyId === "O1" || item.fact.taxonomyId === "O3" || item.fact.taxonomyId === "O9")
    .sort((left, right) => left.at - right.at || left.fact.id.localeCompare(right.fact.id));
  let stock = initial;
  for (const event of events) {
    if (event.fact.taxonomyId === "O1") continue;
    if (event.fact.quantity === null || !Number.isInteger(event.fact.quantity) || event.fact.quantity <= 0) return null;
    stock -= event.fact.quantity;
    if (stock < 0) return null;
  }
  return stock;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function minimumDataRequirement() {
  return {
    minimumEligibleCycles: MINIMUM_ELIGIBLE_FEED_CYCLES,
    perCycle: REQUIRED_PER_CYCLE,
    ageWindowDays: FEED_AGE_WINDOW_DAYS,
  } as const;
}

function insufficient(
  windowStart: string | null,
  windowEnd: string | null,
  currentStock: number | null,
  currentAge: number | null,
  currentPeriodFeedOrderCount: number,
  missingData: string[],
  availableEligibleCycleCount = 0,
  referenceCycles: FeedEstimateCycleEvidence[] = [],
): FeedEstimateResult {
  return {
    status: "INSUFFICIENT_DATA",
    estimate: null,
    range: null,
    unit: "kg",
    referenceCycleCount: referenceCycles.length,
    availableEligibleCycleCount,
    referenceWindowStart: windowStart,
    referenceWindowEnd: windowEnd,
    currentStock,
    currentAge,
    currentPeriodFeedOrderCount,
    minimumDataRequirement: minimumDataRequirement(),
    missingData: [...new Set(missingData)],
    methodSummary: "同舍、近5年、最多15水；每水以同一7日齡窗的有效 O5 kg 叫料量除以該次有效存欄，資料不足時不估算。",
    referenceCycles,
  };
}

/**
 * Deterministic decision-support estimate. It reads canonical O5 facts and
 * canonical lifecycle facts only; it never persists an order or mutates stock.
 */
export function getFeedEstimate(input: FeedEstimateInput): FeedEstimateResult {
  const asOf = asOfDate(input.asOf);
  if (!asOf) return insufficient(null, null, null, null, 0, ["as_of"]);
  const windowStart = subtractYears(asOf.date, FEED_ESTIMATION_MAX_YEARS);
  if (!windowStart) return insufficient(null, asOf.date, null, null, 0, ["reference_window"]);
  if (!input.scope.houseId) return insufficient(windowStart, asOf.date, null, null, 0, ["same_house_scope"]);

  const currentFlock = input.flocks.find((flock) => flock.id === input.currentCycleId);
  if (!currentFlock || currentFlock.farmId !== input.scope.farmId || currentFlock.houseId !== input.scope.houseId || currentFlock.status === "cancelled") {
    return insufficient(windowStart, asOf.date, null, null, 0, ["current_cycle_identity"]);
  }
  const currentCycleFacts = factsForCycle(currentFlock, input.flocks, input.facts);
  const currentLifecycle = deriveCanonicalLifecycleSummary(input.scope, [currentFlock], lifecycleFacts(currentCycleFacts));
  const currentStock = currentLifecycle.effectiveStock;
  const currentAge = ageDays(currentFlock.chickInDate, asOf.timestamp);
  if (currentAge === null) return insufficient(windowStart, asOf.date, currentStock, null, 0, ["current_age"]);
  if (currentFlock.status !== "active" || currentLifecycle.lifecycleStatus !== "ACTIVE" || currentStock === null || currentStock <= 0) {
    return insufficient(windowStart, asOf.date, currentStock, currentAge, 0, ["current_active_effective_stock"]);
  }

  const window = ageWindow(currentAge);
  // Project only the requested house's O5 lineage.  A malformed or reversed
  // order in another house must not poison this house's read model.
  const scopedFacts = input.facts.filter((fact) =>
    fact.farmId === input.scope.farmId
    && (fact.houseId === input.scope.houseId || fact.houseId === null));
  const effectiveFeed = effectiveCanonicalFeedFacts(scopedFacts);
  if (effectiveFeed.reason) {
    return insufficient(windowStart, asOf.date, currentStock, currentAge, 0, [`effective_o5_lineage:${effectiveFeed.reason}`]);
  }
  const currentFeedOrders = factsForCycle(currentFlock, input.flocks, effectiveFeed.facts)
    .filter((fact) => fact.weightUnit === "kg" && typeof fact.weight === "number" && Number.isFinite(fact.weight) && fact.weight > 0)
    .filter((fact) => inAgeWindow(ageDays(currentFlock.chickInDate, factDate(fact)?.timestamp ?? NaN), window));
  if (!currentFeedOrders.length) {
    return insufficient(windowStart, asOf.date, currentStock, currentAge, 0, ["current_feed_order_history_in_age_window"]);
  }

  const candidateCycles = input.flocks
    .filter((flock) => flock.id !== currentFlock.id && flock.farmId === input.scope.farmId && flock.houseId === input.scope.houseId && flock.status === "closed")
    .filter((flock) => flock.chickInDate >= windowStart && flock.chickInDate <= asOf.date)
    .sort((left, right) => right.chickInDate.localeCompare(left.chickInDate) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  const evidence: FeedEstimateCycleEvidence[] = [];
  let missingHistoricalFeed = false;
  let missingHistoricalStock = false;
  for (const flock of candidateCycles) {
    const cycleFacts = factsForCycle(flock, input.flocks, input.facts);
    const cycleLifecycle = deriveCanonicalLifecycleSummary(input.scope, [flock], lifecycleFacts(cycleFacts));
    // Feed history only needs a closed, complete cycle with a proven zero
    // effective stock endpoint.  Requiring O7 cleaning would discard useful
    // historical feed facts merely because the older cycle predates the
    // lifecycle read-model's cleaning evidence.
    if (cycleLifecycle.dataCompleteness !== "complete" || cycleLifecycle.effectiveStock !== 0) continue;
    const cycleStart = Date.parse(`${flock.chickInDate}T00:00:00.000Z`);
    const cycleEnd = parseDate(cycleLifecycle.lastEffectiveStockEventAt)?.timestamp ?? NaN;
    const cycleDurationDays = (cycleEnd - cycleStart) / DAY_MS;
    if (!Number.isFinite(cycleDurationDays) || cycleDurationDays <= 0) {
      missingHistoricalStock = true;
      continue;
    }
    const orders = factsForCycle(flock, input.flocks, effectiveFeed.facts)
      .map((fact) => ({ fact, date: factDate(fact), age: ageDays(flock.chickInDate, factDate(fact)?.timestamp ?? NaN) }))
      .filter((item) => item.date !== null && item.fact.weightUnit === "kg" && typeof item.fact.weight === "number" && Number.isFinite(item.fact.weight) && item.fact.weight > 0)
      .filter((item) => inAgeWindow(item.age, window));
    if (!orders.length) {
      missingHistoricalFeed = true;
      continue;
    }
    const liveBirds = orders.map((item) => effectiveStockAt(flock, cycleFacts, item.date!.timestamp));
    if (liveBirds.some((value) => value === null || value <= 0)) {
      missingHistoricalStock = true;
      continue;
    }
    const feedKg = orders.reduce((sum, item) => sum + Number(item.fact.weight), 0);
    const positiveLiveBirds = liveBirds.filter((value): value is number => value !== null && value > 0);
    if (positiveLiveBirds.length !== liveBirds.length) {
      missingHistoricalStock = true;
      continue;
    }
    const averageLiveBirds = positiveLiveBirds.reduce((sum, value) => sum + value, 0) / positiveLiveBirds.length;
    if (!Number.isFinite(feedKg) || feedKg <= 0 || !Number.isFinite(averageLiveBirds) || averageLiveBirds <= 0) {
      missingHistoricalStock = true;
      continue;
    }
    evidence.push({
      cycleId: flock.id,
      batchCode: flock.batchCode,
      chickInDate: flock.chickInDate,
      cycleDurationDays: rounded(cycleDurationDays),
      ageWindowStartDay: window.startDay,
      ageWindowEndDay: window.endDay,
      feedKg: rounded(feedKg),
      averageLiveBirds: rounded(averageLiveBirds),
      normalizedKgPerLiveBird: rounded(feedKg / averageLiveBirds),
    });
  }

  const availableEligibleCycleCount = evidence.length;
  const referenceCycles = evidence.slice(0, FEED_ESTIMATION_MAX_CYCLES);
  if (referenceCycles.length < MINIMUM_ELIGIBLE_FEED_CYCLES) {
    const missing = ["minimum_eligible_completed_cycles"];
    if (missingHistoricalFeed) missing.push("historical_feed_order_in_current_age_window");
    if (missingHistoricalStock) missing.push("historical_effective_live_stock_at_feed_order");
    return insufficient(windowStart, asOf.date, currentStock, currentAge, currentFeedOrders.length, missing, availableEligibleCycleCount, referenceCycles);
  }

  const sampleEstimates = referenceCycles.map((cycle) => cycle.normalizedKgPerLiveBird * currentStock);
  const central = rounded(median(sampleEstimates));
  const lower = rounded(Math.min(...sampleEstimates));
  const upper = rounded(Math.max(...sampleEstimates));
  return {
    status: "ESTIMATE_AVAILABLE",
    estimate: central,
    range: { lower, upper },
    unit: "kg",
    referenceCycleCount: referenceCycles.length,
    availableEligibleCycleCount,
    referenceWindowStart: windowStart,
    referenceWindowEnd: asOf.date,
    currentStock,
    currentAge,
    currentPeriodFeedOrderCount: currentFeedOrders.length,
    minimumDataRequirement: minimumDataRequirement(),
    missingData: [],
    methodSummary: "同舍近5年、最多15水；每水須為已關閉、具有有效飼養 duration 且有效存欄歸零的完整水次，以目前日齡所在7日齡窗的有效 O5 kg 叫料總量除以該窗平均有效存欄，取每水樣本中位數並乘目前有效存欄；範圍保留樣本最小至最大。估算不會自動建立 O5。",
    referenceCycles,
  };
}
