import type {
  AmbientBufferedMessage,
  AmbientCandidate,
  AmbientCandidateBundle,
  AmbientCandidateItem,
  AmbientCandidateState,
  AmbientAiDecisionSummary,
  AmbientReconciliationStatus,
  AmbientReconciliationSummary,
  AmbientResolutionStatus,
  AmbientSourceCoverageDiagnostics,
} from "./ambient";

/**
 * Bounded, development-only semantic observability.  This is deliberately
 * not the persisted Candidate shape and is never used as business input.
 * Source references are cohort ordinals, not LINE message identifiers.
 */
export interface AmbientDevSemanticItemSummary {
  itemOrdinal: number;
  sourceRefs: string[];
  eventType: AmbientCandidateItem["type"];
  quantity: number | null;
  quantityConfidence: "unknown" | "low" | "medium" | "high" | null;
  confidence: AmbientCandidateItem["confidence"];
  semanticTag: AmbientCandidateItem["type"];
  reconcileState: AmbientCandidateState | AmbientReconciliationStatus | "not_available";
}

export interface AmbientDevSemanticCandidateSummary {
  candidateOrdinal: number;
  sourceRefs: string[];
  farmResolutionStatus: AmbientResolutionStatus | "not_available";
  houseResolutionStatus: AmbientResolutionStatus | "not_available";
  flockResolutionStatus: AmbientResolutionStatus | "not_available";
  caretakerResolutionStatus: AmbientResolutionStatus | "not_available";
  reconcileState: AmbientCandidateState | AmbientReconciliationStatus | "not_available";
  readyState: "not_applicable";
  ambiguityState:
    | "clear"
    | "ambiguous"
    | "unresolved"
    | "quantity_unresolved"
    | "entity_unresolved"
    | "conflict"
    | "possibly_recorded"
    | "already_recorded"
    | "not_available";
  items: AmbientDevSemanticItemSummary[];
}

export interface AmbientDevSemanticSummary {
  version: 1;
  extractedCandidateCount: number;
  validatedCandidateCount: number;
  enrichedCandidateCount: number;
  resolvedCandidateCount: number;
  reconciledCandidateCount: number;
  readyCandidateCount: number | null;
  readyCountStatus: "not_applicable";
  committedCandidateCount: number;
  itemCount: number;
  duplicateCollapseCount: number | null;
  unresolvedEntityCount: number;
  unresolvedQuantityCount: number;
  conflictCount: number;
  selectedSourceCount: number | null;
  accountedSelectedSourceCount: number | null;
  unaccountedSelectedSourceCount: number | null;
  ignoredSelectedSourceCount: number | null;
  supportingSourceCount: number | null;
  selectedSourceCoverageStatus: "pass" | "failed" | "not_available";
  ignoredSelectedSourceRefs: string[];
  unaccountedSourceRefs: string[];
  /** Safe per-selected-source decision projection; never raw model output. */
  decisions?: AmbientAiDecisionSummary[];
  candidates: AmbientDevSemanticCandidateSummary[];
}

const MAX_CANDIDATES = 8;
const MAX_ITEMS_PER_CANDIDATE = 12;
const MAX_SOURCE_REFS = 16;
const SOURCE_REF_PATTERN = /^\d{1,3}$/u;
const RESOLUTION_STATUSES = new Set<AmbientResolutionStatus>(["resolved", "ambiguous", "unresolved"]);
const RECONCILIATION_STATUSES = new Set<AmbientReconciliationStatus>(["not_recorded", "possibly_recorded", "already_recorded"]);
const CANDIDATE_STATES = new Set<AmbientCandidateState>([
  "new",
  "unresolved_entity",
  "unresolved_quantity",
  "conflict",
  "possibly_recorded",
  "already_recorded",
  "no_actionable_event",
  "system_failure",
]);
const AMBIGUITY_STATES = new Set<AmbientDevSemanticCandidateSummary["ambiguityState"]>([
  "clear",
  "ambiguous",
  "unresolved",
  "quantity_unresolved",
  "entity_unresolved",
  "conflict",
  "possibly_recorded",
  "already_recorded",
  "not_available",
]);

function boundedCount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function sourceOrdinalMap(messages: AmbientBufferedMessage[]): Map<string, string> {
  return new Map(messages.map((message, index) => [message.lineMessageId, String(index + 1).padStart(2, "0")]));
}

function safeSourceRefs(sourceIds: string[] | undefined, ordinals: Map<string, string>): string[] {
  return [...new Set((sourceIds ?? []).map((sourceId) => ordinals.get(sourceId)).filter((value): value is string => Boolean(value)))]
    .slice(0, MAX_SOURCE_REFS);
}

function resolutionStatusFor(
  candidate: AmbientCandidate,
  field: "farm" | "house" | "flock" | "caretaker",
): AmbientResolutionStatus | "not_available" {
  const resolution = candidate.resolution;
  if (!resolution) return "not_available";
  if (field === "farm") return resolution.status;
  if (field === "caretaker") {
    if (resolution.caretakerId) return "resolved";
    if (candidate.caretakerText || candidate.caretakerClues?.length) return resolution.status === "resolved" ? "unresolved" : resolution.status;
    return "not_available";
  }
  const resolvedId = field === "house" ? resolution.resolvedHouseId : resolution.resolvedFlockId;
  const candidateIds = field === "house" ? resolution.candidateHouseIds : resolution.candidateFlockIds;
  const requested = field === "house" ? candidate.houseText : candidate.flockText;
  if (resolvedId) return "resolved";
  if (candidateIds && candidateIds.length > 1) return "ambiguous";
  if (requested) return "unresolved";
  return "not_available";
}

function candidateAmbiguityState(candidate: AmbientCandidate): AmbientDevSemanticCandidateSummary["ambiguityState"] {
  if (candidate.conflict || candidate.state === "conflict") return "conflict";
  if (candidate.state === "unresolved_quantity") return "quantity_unresolved";
  if (candidate.state === "unresolved_entity") return "entity_unresolved";
  if (candidate.reconciliation?.status === "possibly_recorded" || candidate.state === "possibly_recorded") return "possibly_recorded";
  if (candidate.reconciliation?.status === "already_recorded" || candidate.state === "already_recorded") return "already_recorded";
  if (candidate.resolution?.status === "ambiguous") return "ambiguous";
  if (candidate.resolution?.status === "unresolved") return "unresolved";
  if (candidate.state === "new") return "clear";
  return "not_available";
}

function itemSourceRefs(
  candidate: AmbientCandidate,
  item: AmbientCandidateItem,
  candidateRefs: string[],
  ordinals: Map<string, string>,
): string[] {
  // The resolver already creates bounded source_fact evidence for an item.
  // Reuse only its source references; never persist the evidence text itself.
  const evidenceField = item.type === "mortality" ? "mortality" : item.type === "cull" ? "cull" : "event";
  const evidenceRefs = (candidate.evidence ?? [])
    .filter((evidence) =>
      evidence.evidenceType === "source_fact"
      && evidence.field === evidenceField
      && (String(evidence.normalizedValue) === String(item.quantity) || String(evidence.normalizedValue) === item.raw)
      && evidence.sourceRef)
    .map((evidence) => evidence.sourceRef as string);
  const mapped = safeSourceRefs(evidenceRefs, ordinals);
  if (mapped.length) return mapped;
  // A single-item candidate has an unambiguous candidate-level lineage.  For
  // multi-item candidates, leave item attribution empty instead of guessing.
  return candidate.items.length === 1 ? candidateRefs : [];
}

function safeItemSummary(
  candidate: AmbientCandidate,
  item: AmbientCandidateItem,
  itemOrdinal: number,
  candidateRefs: string[],
  ordinals: Map<string, string>,
): AmbientDevSemanticItemSummary {
  return {
    itemOrdinal,
    sourceRefs: itemSourceRefs(candidate, item, candidateRefs, ordinals),
    eventType: item.type,
    quantity: item.quantity,
    quantityConfidence: item.quantity === null ? "unknown" : candidate.quantityConfidence ?? item.confidence,
    confidence: item.confidence,
    semanticTag: item.type,
    reconcileState: candidate.reconciliation?.status ?? candidate.state ?? "not_available",
  };
}

export function buildAmbientDevSemanticSummary(options: {
  validatedBundle: AmbientCandidateBundle;
  reconciledBundle: AmbientCandidateBundle;
  reconciliation: AmbientReconciliationSummary;
  messages: AmbientBufferedMessage[];
  extractedCandidateCount?: number | null;
  committedCandidateCount: number;
  sourceCoverage?: AmbientSourceCoverageDiagnostics;
  decisionSummaries?: AmbientAiDecisionSummary[];
}): AmbientDevSemanticSummary {
  const ordinals = sourceOrdinalMap(options.messages);
  const candidates = options.reconciledBundle.candidates.slice(0, MAX_CANDIDATES).map((candidate, candidateIndex) => {
    const candidateRefs = safeSourceRefs(candidate.sourceMessageIds, ordinals);
    const reconcileState: AmbientDevSemanticCandidateSummary["reconcileState"] =
      candidate.reconciliation?.status ?? candidate.state ?? "not_available";
    return {
      candidateOrdinal: candidateIndex + 1,
      sourceRefs: candidateRefs,
      farmResolutionStatus: resolutionStatusFor(candidate, "farm"),
      houseResolutionStatus: resolutionStatusFor(candidate, "house"),
      flockResolutionStatus: resolutionStatusFor(candidate, "flock"),
      caretakerResolutionStatus: resolutionStatusFor(candidate, "caretaker"),
      reconcileState,
      readyState: "not_applicable" as const,
      ambiguityState: candidateAmbiguityState(candidate),
      items: candidate.items.slice(0, MAX_ITEMS_PER_CANDIDATE).map((item, itemIndex) =>
        safeItemSummary(candidate, item, itemIndex + 1, candidateRefs, ordinals)),
    };
  });
  const itemCount = candidates.reduce((total, candidate) => total + candidate.items.length, 0);
  return {
    version: 1,
    extractedCandidateCount: boundedCount(options.extractedCandidateCount, options.validatedBundle.candidates.length),
    validatedCandidateCount: options.validatedBundle.candidates.length,
    enrichedCandidateCount: options.reconciledBundle.candidates.length,
    resolvedCandidateCount: boundedCount(options.reconciliation.resolvedCount),
    reconciledCandidateCount: boundedCount(options.reconciliation.extractedCandidateCount),
    readyCandidateCount: null,
    readyCountStatus: "not_applicable",
    committedCandidateCount: boundedCount(options.committedCandidateCount),
    itemCount,
    // The current reconcile summary has no explicit duplicate-collapse count.
    // Null is intentional: the renderer must show "未判定", never infer it.
    duplicateCollapseCount: null,
    unresolvedEntityCount: boundedCount(options.reconciliation.ambiguousEntityCount),
    unresolvedQuantityCount: boundedCount(options.reconciliation.unresolvedQuantityCount),
    conflictCount: boundedCount(options.reconciliation.conflictCount),
    selectedSourceCount: options.sourceCoverage?.selectedSourceCount ?? null,
    accountedSelectedSourceCount: options.sourceCoverage?.accountedSelectedSourceCount ?? null,
    unaccountedSelectedSourceCount: options.sourceCoverage?.unaccountedSelectedSourceCount ?? null,
    ignoredSelectedSourceCount: options.sourceCoverage?.ignoredSelectedSourceCount ?? null,
    supportingSourceCount: options.sourceCoverage?.supportingSourceCount ?? null,
    selectedSourceCoverageStatus: options.sourceCoverage?.selectedSourceCoverageStatus ?? "not_available",
    ignoredSelectedSourceRefs: options.sourceCoverage?.ignoredSelectedSourceOrdinals ?? [],
    unaccountedSourceRefs: options.sourceCoverage?.unaccountedSourceOrdinals ?? [],
    decisions: (options.decisionSummaries ?? []).slice(0, MAX_SOURCE_REFS).map((decision) => ({
      sourceRef: decision.sourceRef,
      kind: decision.kind,
      ...(decision.targetRef ? { targetRef: decision.targetRef } : {}),
    })),
    candidates,
  };
}

export function serializeAmbientDevSemanticSummary(summary: AmbientDevSemanticSummary): string {
  return JSON.stringify(summary);
}

function safeNumber(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function safeRefs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_REFS) return null;
  return value.every((ref) => typeof ref === "string" && SOURCE_REF_PATTERN.test(ref))
    ? [...new Set(value)].slice(0, MAX_SOURCE_REFS)
    : null;
}

function safeDecisionSummaries(value: unknown): AmbientAiDecisionSummary[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SOURCE_REFS) return null;
  const summaries: AmbientAiDecisionSummary[] = [];
  const seen = new Set<string>();
  for (const rawDecision of value) {
    if (typeof rawDecision !== "object" || rawDecision === null || Array.isArray(rawDecision)) return null;
    const decision = rawDecision as Record<string, unknown>;
    if (typeof decision.sourceRef !== "string" || !SOURCE_REF_PATTERN.test(decision.sourceRef) || seen.has(decision.sourceRef)) return null;
    if (decision.kind !== "event" && decision.kind !== "support" && decision.kind !== "ignore") return null;
    if (decision.kind === "support") {
      if (typeof decision.targetRef !== "string" || !SOURCE_REF_PATTERN.test(decision.targetRef)) return null;
      summaries.push({ sourceRef: decision.sourceRef, kind: decision.kind, targetRef: decision.targetRef });
    } else {
      if (decision.targetRef !== undefined) return null;
      summaries.push({ sourceRef: decision.sourceRef, kind: decision.kind });
    }
    seen.add(decision.sourceRef);
  }
  return summaries;
}

function optionalCoverageCount(record: Record<string, unknown>, key: string): number | null | "invalid" {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  if (record[key] === null) return null;
  const value = safeNumber(record[key]);
  return value === null ? "invalid" : value;
}

function safeCoverageStatus(value: unknown): AmbientDevSemanticSummary["selectedSourceCoverageStatus"] | null {
  if (value === undefined) return "not_available";
  return value === "pass" || value === "failed" || value === "not_available" ? value : null;
}

function safeResolutionStatus(value: unknown): AmbientResolutionStatus | "not_available" | null {
  if (value === "not_available") return value;
  return typeof value === "string" && RESOLUTION_STATUSES.has(value as AmbientResolutionStatus)
    ? value as AmbientResolutionStatus
    : null;
}

function safeReconcileState(value: unknown): AmbientDevSemanticItemSummary["reconcileState"] | null {
  if (value === "not_available") return value;
  if (typeof value !== "string") return null;
  return CANDIDATE_STATES.has(value as AmbientCandidateState) || RECONCILIATION_STATUSES.has(value as AmbientReconciliationStatus)
    ? value as AmbientDevSemanticItemSummary["reconcileState"]
    : null;
}

export function parseAmbientDevSemanticSummary(value: string | null | undefined): AmbientDevSemanticSummary | null {
  if (!value || value.length > 16_384) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.version !== 1 || record.readyCountStatus !== "not_applicable") return null;
  if (!Array.isArray(record.candidates) || record.candidates.length > MAX_CANDIDATES) return null;
  const topLevelKeys = [
    "extractedCandidateCount",
    "validatedCandidateCount",
    "enrichedCandidateCount",
    "resolvedCandidateCount",
    "reconciledCandidateCount",
    "committedCandidateCount",
    "itemCount",
    "unresolvedEntityCount",
    "unresolvedQuantityCount",
    "conflictCount",
  ] as const;
  const counts = Object.fromEntries(topLevelKeys.map((key) => [key, safeNumber(record[key])])) as Record<typeof topLevelKeys[number], number | null>;
  if (Object.values(counts).some((count) => count === null)) return null;
  const numericCounts = counts as Record<typeof topLevelKeys[number], number>;
  const readyCandidateCount = safeNumber(record.readyCandidateCount, true);
  if (readyCandidateCount === null && record.readyCandidateCount !== null) return null;
  const candidates: AmbientDevSemanticCandidateSummary[] = [];
  for (const rawCandidate of record.candidates) {
    if (typeof rawCandidate !== "object" || rawCandidate === null || Array.isArray(rawCandidate)) return null;
    const candidate = rawCandidate as Record<string, unknown>;
    const sourceRefs = safeRefs(candidate.sourceRefs);
    const farmResolutionStatus = safeResolutionStatus(candidate.farmResolutionStatus);
    const houseResolutionStatus = safeResolutionStatus(candidate.houseResolutionStatus);
    const flockResolutionStatus = safeResolutionStatus(candidate.flockResolutionStatus);
    const caretakerResolutionStatus = safeResolutionStatus(candidate.caretakerResolutionStatus);
    const reconcileState = safeReconcileState(candidate.reconcileState);
    if (!sourceRefs || !farmResolutionStatus || !houseResolutionStatus || !flockResolutionStatus || !caretakerResolutionStatus || !reconcileState) return null;
    if (typeof candidate.candidateOrdinal !== "number" || !Number.isInteger(candidate.candidateOrdinal) || candidate.candidateOrdinal < 1 || candidate.candidateOrdinal > MAX_CANDIDATES) return null;
    if (candidate.readyState !== "not_applicable" || typeof candidate.ambiguityState !== "string" || !AMBIGUITY_STATES.has(candidate.ambiguityState as AmbientDevSemanticCandidateSummary["ambiguityState"])) return null;
    if (!Array.isArray(candidate.items) || candidate.items.length > MAX_ITEMS_PER_CANDIDATE) return null;
    const items: AmbientDevSemanticItemSummary[] = [];
    for (const rawItem of candidate.items) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) return null;
      const item = rawItem as Record<string, unknown>;
      const itemRefs = safeRefs(item.sourceRefs);
      const quantity = safeNumber(item.quantity, true);
      const quantityConfidence = item.quantityConfidence === null
        ? null
        : ["unknown", "low", "medium", "high"].includes(String(item.quantityConfidence)) ? item.quantityConfidence as AmbientDevSemanticItemSummary["quantityConfidence"] : null;
      const eventType = ["mortality", "cull", "abnormal"].includes(String(item.eventType)) ? item.eventType as AmbientCandidateItem["type"] : null;
      const confidence = ["low", "medium", "high"].includes(String(item.confidence)) ? item.confidence as AmbientCandidateItem["confidence"] : null;
      const semanticTag = ["mortality", "cull", "abnormal"].includes(String(item.semanticTag)) ? item.semanticTag as AmbientCandidateItem["type"] : null;
      const itemReconcileState = safeReconcileState(item.reconcileState);
      if (!itemRefs || quantity === null && item.quantity !== null || !quantityConfidence || !eventType || !confidence || semanticTag !== eventType || !itemReconcileState) return null;
      if (typeof item.itemOrdinal !== "number" || !Number.isInteger(item.itemOrdinal) || item.itemOrdinal < 1 || item.itemOrdinal > MAX_ITEMS_PER_CANDIDATE) return null;
      items.push({ itemOrdinal: item.itemOrdinal, sourceRefs: itemRefs, eventType, quantity, quantityConfidence, confidence, semanticTag, reconcileState: itemReconcileState });
    }
    candidates.push({
      candidateOrdinal: candidate.candidateOrdinal,
      sourceRefs,
      farmResolutionStatus,
      houseResolutionStatus,
      flockResolutionStatus,
      caretakerResolutionStatus,
      reconcileState,
      readyState: "not_applicable",
      ambiguityState: candidate.ambiguityState as AmbientDevSemanticCandidateSummary["ambiguityState"],
      items,
    });
  }
  const duplicateCollapseCount = safeNumber(record.duplicateCollapseCount, true);
  if (duplicateCollapseCount === null && record.duplicateCollapseCount !== null) return null;
  const selectedSourceCount = optionalCoverageCount(record, "selectedSourceCount");
  const accountedSelectedSourceCount = optionalCoverageCount(record, "accountedSelectedSourceCount");
  const unaccountedSelectedSourceCount = optionalCoverageCount(record, "unaccountedSelectedSourceCount");
  const ignoredSelectedSourceCount = optionalCoverageCount(record, "ignoredSelectedSourceCount");
  const supportingSourceCount = optionalCoverageCount(record, "supportingSourceCount");
  if ([selectedSourceCount, accountedSelectedSourceCount, unaccountedSelectedSourceCount, ignoredSelectedSourceCount, supportingSourceCount].includes("invalid")) return null;
  const selectedSourceCoverageStatus = safeCoverageStatus(record.selectedSourceCoverageStatus);
  const ignoredSelectedSourceRefs = record.ignoredSelectedSourceRefs === undefined ? [] : safeRefs(record.ignoredSelectedSourceRefs);
  const unaccountedSourceRefs = record.unaccountedSourceRefs === undefined ? [] : safeRefs(record.unaccountedSourceRefs);
  const decisions = safeDecisionSummaries(record.decisions);
  if (!selectedSourceCoverageStatus || !ignoredSelectedSourceRefs || !unaccountedSourceRefs || !decisions) return null;
  return {
    version: 1,
    ...numericCounts,
    readyCandidateCount,
    readyCountStatus: "not_applicable",
    duplicateCollapseCount,
    selectedSourceCount: selectedSourceCount === "invalid" ? null : selectedSourceCount,
    accountedSelectedSourceCount: accountedSelectedSourceCount === "invalid" ? null : accountedSelectedSourceCount,
    unaccountedSelectedSourceCount: unaccountedSelectedSourceCount === "invalid" ? null : unaccountedSelectedSourceCount,
    ignoredSelectedSourceCount: ignoredSelectedSourceCount === "invalid" ? null : ignoredSelectedSourceCount,
    supportingSourceCount: supportingSourceCount === "invalid" ? null : supportingSourceCount,
    selectedSourceCoverageStatus,
    ignoredSelectedSourceRefs,
    unaccountedSourceRefs,
    decisions,
    candidates,
  };
}
