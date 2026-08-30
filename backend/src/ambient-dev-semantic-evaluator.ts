import type { AmbientDevSemanticSummary } from "./ambient-dev-semantic";

/**
 * Forensic/test-only evaluator.  It is intentionally not imported by the
 * Worker runtime: expected semantics belong in a fixture, never in business
 * routing or extraction code.
 */
export interface AmbientDevGroundTruthMessage {
  id: string;
  groundTruth: string;
  expectedOperational: { type: string; quantity: number | null } | null;
}

export interface AmbientDevSemanticEvaluation {
  selectedSourceCoverage: "PASS" | "PARTIAL" | "FAIL";
  silentSelectedSourceDropCount: number;
  supportSourceMappingAccuracy: "PASS" | "PARTIAL" | "FAIL" | "UNKNOWN";
  pureChatFalsePositiveCount: number;
  operationalFalseNegativeCount: number;
  eventTypeAccuracy: "PASS" | "PARTIAL" | "FAIL";
  quantityAccuracy: "PASS" | "PARTIAL" | "FAIL";
  unknownQuantityAccuracy: "PASS" | "PARTIAL" | "FAIL";
  mixedChatAccuracy: "PASS" | "PARTIAL" | "FAIL";
  d05D06Dedupe: "PASS" | "FAIL" | "UNKNOWN";
  hallucinatedItemCount: number;
  sourceMappingAccuracy: "PASS" | "PARTIAL" | "FAIL";
  overallSemanticAccuracy: "PASS" | "PARTIAL" | "FAIL";
}

interface FlatItem {
  sourceRefs: string[];
  eventType: string;
  quantity: number | null;
}

function fixtureId(sourceRef: string): string | null {
  if (/^D\d{2}$/u.test(sourceRef)) return sourceRef;
  if (/^\d{1,3}$/u.test(sourceRef)) return "D" + Number(sourceRef).toString().padStart(2, "0");
  return null;
}

function status(correct: number, expected: number): "PASS" | "PARTIAL" | "FAIL" {
  if (!expected) return "PASS";
  if (correct === expected) return "PASS";
  return correct > 0 ? "PARTIAL" : "FAIL";
}

export function evaluateAmbientDevSemanticSnapshot(
  snapshot: AmbientDevSemanticSummary,
  groundTruth: { messages: AmbientDevGroundTruthMessage[] },
): AmbientDevSemanticEvaluation {
  const byId = new Map(groundTruth.messages.map((message) => [message.id, message]));
  const flatItems: FlatItem[] = snapshot.candidates.flatMap((candidate) => candidate.items.map((item) => ({
    sourceRefs: item.sourceRefs.length ? item.sourceRefs : candidate.sourceRefs,
    eventType: item.eventType,
    quantity: item.quantity,
  })));
  const itemSources = (item: FlatItem): AmbientDevGroundTruthMessage[] => [...new Set(item.sourceRefs
    .map(fixtureId)
    .filter((id): id is string => Boolean(id))
    .map((id) => byId.get(id))
    .filter((message): message is AmbientDevGroundTruthMessage => Boolean(message)))];
  const pureChatFalsePositiveCount = flatItems.filter((item) => itemSources(item).some((message) => message.groundTruth === "CHAT")).length;
  const operational = groundTruth.messages.filter((message) => message.expectedOperational && message.groundTruth !== "SUPPORT_DUPLICATE_REFERENCE");
  const represented = new Set(flatItems.flatMap((item) => itemSources(item).map((message) => message.id)));
  const expectedSelected = groundTruth.messages.filter((message) => Boolean(message.expectedOperational) || message.groundTruth === "SUPPORT_DUPLICATE_REFERENCE");
  const ignoredSelected = new Set(snapshot.ignoredSelectedSourceRefs.map(fixtureId).filter((id): id is string => Boolean(id)));
  const accountedSelected = new Set([...represented, ...ignoredSelected]);
  const silentSelectedSourceDropCount = expectedSelected.filter((message) => !accountedSelected.has(message.id)).length;
  const selectedSourceCoverage = snapshot.selectedSourceCoverageStatus === "pass" && silentSelectedSourceDropCount === 0
    ? "PASS"
    : silentSelectedSourceDropCount > 0 ? "FAIL" : "PARTIAL";
  const operationalFalseNegativeCount = operational.filter((message) => !represented.has(message.id)).length;
  const relevantItems = flatItems.filter((item) => itemSources(item).some((message) => Boolean(message.expectedOperational)));
  const expectedEventMatches = operational.filter((message) => relevantItems.some((item) => itemSources(item).some((source) => source.id === message.id && item.eventType === source.expectedOperational?.type)));
  const expectedQuantityMatches = operational.filter((message) => relevantItems.some((item) => itemSources(item).some((source) => source.id === message.id && item.quantity === source.expectedOperational?.quantity)));
  const unknownQuantitySources = operational.filter((message) => message.expectedOperational?.quantity === null);
  const unknownQuantityMatches = unknownQuantitySources.filter((message) => relevantItems.some((item) => itemSources(item).some((source) => source.id === message.id && item.quantity === null)));
  const mixedSource = byId.get("D07");
  const mixedChatCorrect = mixedSource
    ? relevantItems.some((item) => itemSources(item).some((source) => source.id === "D07" && item.eventType === "mortality" && item.quantity === 1))
    : false;
  const knownIds = new Set(groundTruth.messages.map((message) => message.id));
  const hallucinatedItemCount = flatItems.filter((item) => {
    const sources = itemSources(item);
    return !sources.length || sources.every((source) => source.groundTruth === "CHAT");
  }).length;
  const sourceMappingAccuracy = flatItems.length === 0
    ? "FAIL"
    : flatItems.every((item) => item.sourceRefs.length > 0 && item.sourceRefs.every((ref) => {
      const id = fixtureId(ref);
      return Boolean(id && knownIds.has(id));
    })) ? "PASS" : "PARTIAL";
  const d05Items = flatItems.filter((item) => itemSources(item).some((source) => source.id === "D05"));
  const d06Items = flatItems.filter((item) => itemSources(item).some((source) => source.id === "D06"));
  let d05D06Dedupe: AmbientDevSemanticEvaluation["d05D06Dedupe"] = "UNKNOWN";
  if (d05Items.length && d06Items.length) {
    const sameItem = flatItems.some((item) => {
      const ids = new Set(itemSources(item).map((source) => source.id));
      return ids.has("D05") && ids.has("D06") && item.eventType === "mortality" && item.quantity === 3;
    });
    d05D06Dedupe = sameItem && flatItems.filter((item) => item.eventType === "mortality" && item.quantity === 3 && itemSources(item).some((source) => source.id === "D05" || source.id === "D06")).length === 1
      ? "PASS"
      : "FAIL";
  }
  let supportSourceMappingAccuracy: AmbientDevSemanticEvaluation["supportSourceMappingAccuracy"] = "UNKNOWN";
  if (d05Items.length || d06Items.length) {
    supportSourceMappingAccuracy = d05Items.some((item) => itemSources(item).some((source) => source.id === "D06"))
      && d06Items.some((item) => itemSources(item).some((source) => source.id === "D05"))
      ? "PASS"
      : d06Items.length ? "FAIL" : "PARTIAL";
  }
  const eventTypeAccuracy = status(expectedEventMatches.length, operational.length);
  const quantityAccuracy = status(expectedQuantityMatches.length, operational.length);
  const unknownQuantityAccuracy = status(unknownQuantityMatches.length, unknownQuantitySources.length);
  const mixedChatAccuracy = status(mixedChatCorrect ? 1 : 0, mixedSource ? 1 : 0);
  const overallSemanticAccuracy = pureChatFalsePositiveCount > 0 || hallucinatedItemCount > 0
    ? "FAIL"
    : d05D06Dedupe === "FAIL" || operationalFalseNegativeCount > 0 || silentSelectedSourceDropCount > 0
      ? "PARTIAL"
      : [eventTypeAccuracy, quantityAccuracy, unknownQuantityAccuracy, mixedChatAccuracy].every((value) => value === "PASS") && d05D06Dedupe === "PASS"
        ? "PASS"
        : "PARTIAL";
  return {
    selectedSourceCoverage,
    silentSelectedSourceDropCount,
    supportSourceMappingAccuracy,
    pureChatFalsePositiveCount,
    operationalFalseNegativeCount,
    eventTypeAccuracy,
    quantityAccuracy,
    unknownQuantityAccuracy,
    mixedChatAccuracy,
    d05D06Dedupe,
    hallucinatedItemCount,
    sourceMappingAccuracy,
    overallSemanticAccuracy,
  };
}
