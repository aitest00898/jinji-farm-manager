import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAmbientDevSemanticSummary,
  parseAmbientDevSemanticSummary,
} from "./ambient-dev-semantic";
import { evaluateAmbientDevSemanticSnapshot, type AmbientDevGroundTruthMessage } from "./ambient-dev-semantic-evaluator";
import type {
  AmbientBufferedMessage,
  AmbientCandidateBundle,
  AmbientReconciliationSummary,
} from "./ambient";

const messages: AmbientBufferedMessage[] = [
  "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08",
].map((label, index) => ({
  id: "row-" + label,
  organizationId: "org-test",
  lineGroupId: "group-test",
  lineUserId: "safe-user-ref",
  lineMessageId: "message-" + label,
  eventTimestamp: "2026-08-26T11:" + String(index).padStart(2, "0") + ":00.000Z",
  text: "bounded fixture text",
  digestHour: "2026-08-26T19:00:00+08:00",
}));

const bundle: AmbientCandidateBundle = {
  candidates: [{
    farmText: "金雞測試場",
    houseText: null,
    flockText: null,
    sourceMessageIds: ["message-D02", "message-D03", "message-D04", "message-D05", "message-D06", "message-D07"],
    items: [
      { type: "mortality", quantity: 2, raw: "死2隻", confidence: "high" },
      { type: "abnormal", quantity: null, raw: "一直咳", confidence: "medium" },
      { type: "cull", quantity: 2, raw: "淘汰2隻", confidence: "high" },
      { type: "mortality", quantity: 3, raw: "死3隻", confidence: "high" },
      { type: "mortality", quantity: 1, raw: "死1隻", confidence: "high" },
    ],
    conflict: false,
    state: "new",
    resolution: { status: "resolved", resolvedFarmId: "farm-internal-id" },
    reconciliation: { status: "not_recorded", matchingOfficialRecordIds: [], matchReasons: [], matchConfidence: "high" },
    evidence: [
      { evidenceType: "source_fact", field: "mortality", normalizedValue: 2, sourceRef: "message-D02", extractionSource: "ai" },
      { evidenceType: "source_fact", field: "event", normalizedValue: "咳", sourceRef: "message-D03", extractionSource: "ai" },
      { evidenceType: "source_fact", field: "cull", normalizedValue: 2, sourceRef: "message-D04", extractionSource: "ai" },
      { evidenceType: "source_fact", field: "mortality", normalizedValue: 3, sourceRef: "message-D05", extractionSource: "ai" },
      { evidenceType: "source_fact", field: "mortality", normalizedValue: 3, sourceRef: "message-D06", extractionSource: "ai" },
      { evidenceType: "source_fact", field: "mortality", normalizedValue: 1, sourceRef: "message-D07", extractionSource: "ai" },
    ],
  }],
};

const reconciliation: AmbientReconciliationSummary = {
  extractedCandidateCount: 1,
  resolvedCount: 1,
  ambiguousEntityCount: 0,
  unresolvedQuantityCount: 1,
  conflictCount: 0,
  reconcileAlreadyRecorded: 0,
  reconcilePossible: 0,
  reconcileNew: 1,
  noActionableCount: 0,
  officialRecordsLoaded: 0,
  reconciliationDurationMs: 1,
};

describe("development Ambient semantic snapshot", () => {
  it("persists bounded canonical facts and safe cohort ordinals only", () => {
    const snapshot = buildAmbientDevSemanticSummary({
      validatedBundle: bundle,
      reconciledBundle: bundle,
      reconciliation,
      messages,
      extractedCandidateCount: 1,
      committedCandidateCount: 0,
      sourceCoverage: {
        selectedSourceCount: 6,
        accountedSelectedSourceCount: 6,
        unaccountedSelectedSourceCount: 0,
        ignoredSelectedSourceCount: 0,
        supportingSourceCount: 1,
        selectedSourceCoverageStatus: "pass",
        unaccountedSourceRefs: [],
        ignoredSelectedSourceRefs: [],
        unaccountedSourceOrdinals: [],
        ignoredSelectedSourceOrdinals: [],
      },
    });
    const serialized = JSON.stringify(snapshot);
    expect(snapshot).toMatchObject({
      extractedCandidateCount: 1,
      validatedCandidateCount: 1,
      reconciledCandidateCount: 1,
      committedCandidateCount: 0,
      itemCount: 5,
      readyCandidateCount: null,
      duplicateCollapseCount: null,
      selectedSourceCount: 6,
      accountedSelectedSourceCount: 6,
      unaccountedSelectedSourceCount: 0,
      selectedSourceCoverageStatus: "pass",
    });
    expect(snapshot.candidates[0]?.sourceRefs).toEqual(["02", "03", "04", "05", "06", "07"]);
    expect(snapshot.candidates[0]?.items[0]).toMatchObject({ eventType: "mortality", quantity: 2, sourceRefs: ["02"] });
    expect(snapshot.candidates[0]?.items[3]?.sourceRefs).toEqual(["05", "06"]);
    expect(serialized).not.toContain("死2隻");
    expect(serialized).not.toContain("farm-internal-id");
    expect(serialized).not.toContain("raw");
    expect(serialized.length).toBeLessThan(8192);
    expect(parseAmbientDevSemanticSummary(serialized)).toEqual(snapshot);
  });

  it("evaluates the locked smoke fixture without calling AI", () => {
    const snapshot = buildAmbientDevSemanticSummary({
      validatedBundle: bundle,
      reconciledBundle: bundle,
      reconciliation,
      messages,
      committedCandidateCount: 0,
      sourceCoverage: {
        selectedSourceCount: 6,
        accountedSelectedSourceCount: 6,
        unaccountedSelectedSourceCount: 0,
        ignoredSelectedSourceCount: 0,
        supportingSourceCount: 1,
        selectedSourceCoverageStatus: "pass",
        unaccountedSourceRefs: [],
        ignoredSelectedSourceRefs: [],
        unaccountedSourceOrdinals: [],
        ignoredSelectedSourceOrdinals: [],
      },
    });
    const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../forensics/dev-ambient-smoke-8-ground-truth.json"), "utf8")) as {
      messages: AmbientDevGroundTruthMessage[];
    };
    const evaluation = evaluateAmbientDevSemanticSnapshot(snapshot, fixture);
    expect(evaluation.selectedSourceCoverage).toBe("PASS");
    expect(evaluation.silentSelectedSourceDropCount).toBe(0);
    expect(evaluation.supportSourceMappingAccuracy).toBe("PASS");
    expect(evaluation.pureChatFalsePositiveCount).toBe(0);
    expect(evaluation.operationalFalseNegativeCount).toBe(0);
    expect(evaluation.eventTypeAccuracy).toBe("PASS");
    expect(evaluation.quantityAccuracy).toBe("PASS");
    expect(evaluation.unknownQuantityAccuracy).toBe("PASS");
    expect(evaluation.mixedChatAccuracy).toBe("PASS");
    expect(evaluation.d05D06Dedupe).toBe("PASS");
    expect(evaluation.hallucinatedItemCount).toBe(0);
    expect(evaluation.overallSemanticAccuracy).toBe("PASS");
  });
});
