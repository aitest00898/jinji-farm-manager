import { describe, expect, it } from "vitest";
import {
  RECORDING_TAXONOMY,
  deriveRecordingFields,
  normalizeRecordingDraft,
  parseCanonicalRecordingText,
  resolveTaipeiDate,
  stockEffectForRecord,
  taxonomyDefinitionFor,
  validateRecordingDraft,
} from "./recording-taxonomy";
import {
  TAXONOMY_GOLDEN_CASES,
  TAXONOMY_GOLDEN_EDGE_CASES,
  runTaxonomyGoldenCorpus,
  taxonomyCoverage,
} from "./recording-taxonomy-golden";

const timestamp = "2026-09-08T01:00:00.000Z";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-test-1",
    family: "operational_event",
    type: "event",
    subtype: "mortality",
    occurredAt: timestamp,
    createdAt: timestamp,
    farmId: "farm-test",
    sourceChannel: "line",
    rawText: "金雞測試場 死亡5",
    clientOperationId: "client-test-1",
    quantity: 5,
    ...overrides,
  };
}

describe("recording taxonomy foundation", () => {
  it("contains all 25 canonical categories and 46 subtypes", () => {
    const coverage = taxonomyCoverage();
    expect(RECORDING_TAXONOMY).toHaveLength(25);
    expect(coverage.categories).toBe(25);
    expect(coverage.subtypes).toBe(46);
    expect(coverage.registryCategories).toBe(25);
    expect(coverage.registrySubtypes).toBe(46);
  });

  it("keeps stock effects limited to quantitative events", () => {
    expect(stockEffectForRecord(draft())).toBe(-1);
    expect(stockEffectForRecord(draft({ family: "operational_action", type: "action", subtype: "feed_order", vendor: "供應商", weight: 100, weightUnit: "kg" }))).toBe(0);
    expect(stockEffectForRecord(draft({ family: "operational_observation", type: "observation", subtype: "cough", extent: "small" }))).toBe(0);
    expect(taxonomyDefinitionFor("A1").requiredFields).toContain("linkedMortalityEventId");
  });

  it("validates representative event, action, and observation rows", () => {
    expect(() => validateRecordingDraft(draft({ taxonomyId: "O9" }))).not.toThrow();
    expect(() => validateRecordingDraft(draft({
      taxonomyId: "O1",
      family: "operational_event",
      subtype: "chick_in",
      maleCount: 600,
      femaleCount: 400,
      totalCount: 1000,
      condition: "good",
      houseId: "house-test",
      flockId: "flock-test",
      quantity: undefined,
    }))).not.toThrow();
    expect(() => validateRecordingDraft(draft({
      taxonomyId: "O5",
      family: "operational_action",
      type: "action",
      subtype: "feed_order",
      quantity: undefined,
      vendor: "玉米廠",
      weight: 500,
      weightUnit: "kg",
    }))).not.toThrow();
    expect(() => validateRecordingDraft(draft({
      taxonomyId: "A12",
      family: "operational_observation",
      type: "observation",
      subtype: "other",
      quantity: undefined,
      extent: "large",
      detail: "水泵漏水",
    }))).not.toThrow();
  });

  it("rejects unsafe or semantically malformed rows closed", () => {
    expect(() => validateRecordingDraft(draft({ taxonomyId: "O9", quantity: 1.5 }))).toThrow("RECORDING_INTEGER_INVALID:quantity");
    expect(() => validateRecordingDraft(draft({ taxonomyId: "O9", quantity: -1 }))).toThrow("RECORDING_NUMBER_INVALID:quantity");
    expect(() => validateRecordingDraft(draft({ taxonomyId: "O9", quantity: 5, totalCount: 5 }))).toThrow("RECORDING_UNSUPPORTED_FIELD:totalCount");
    expect(() => validateRecordingDraft(draft({
      taxonomyId: "A12",
      family: "operational_observation",
      type: "observation",
      subtype: "other",
      quantity: undefined,
      extent: "large",
    }))).toThrow("RECORDING_REQUIRED_FIELD:detail");
    expect(() => validateRecordingDraft(draft({
      taxonomyId: "O6",
      family: "operational_action",
      type: "action",
      subtype: "lab_test",
      quantity: undefined,
      submittedAt: timestamp,
      content: "檢驗",
      status: "completed",
    }))).toThrow("RECORDING_REQUIRED_FIELD:result");
    expect(() => validateRecordingDraft(draft({
      taxonomyId: "A2",
      family: "operational_observation",
      type: "observation",
      subtype: "cough",
      quantity: 3,
      extent: "small",
    }))).toThrow("OBSERVATION_QUANTITY_FORBIDDEN:quantity");
  });

  it("derives totals, average weight, age, and lab reminder without inventing input", () => {
    expect(deriveRecordingFields({ subtype: "chick_in", maleCount: 600, femaleCount: 400 })).toEqual({ totalCount: 1000 });
    expect(deriveRecordingFields({ subtype: "shipment", quantity: 100, totalWeight: 180 })).toEqual({ averageWeight: 1.8 });
    expect(deriveRecordingFields({ subtype: "weigh", occurredAt: "2026-09-08T01:00:00.000Z", chickInDate: "2026-09-01" })).toEqual({ ageDays: 7 });
    expect(deriveRecordingFields({ subtype: "lab_test", submittedAt: timestamp })).toEqual({ reminderDueAt: "2026-09-11T01:00:00.000Z" });
    expect(normalizeRecordingDraft({ subtype: "chick_in", maleCount: "6", femaleCount: "4" })).toMatchObject({ maleCount: 6, femaleCount: 4, totalCount: 10 });
  });

  it("resolves relative dates in Asia/Taipei before persistence", () => {
    const now = new Date("2026-09-08T15:30:00.000Z");
    expect(resolveTaipeiDate("今天", now)).toBe("2026-09-08");
    expect(resolveTaipeiDate("昨天", now)).toBe("2026-09-07");
    expect(resolveTaipeiDate("2026-09-01", now)).toBe("2026-09-01");
    expect(resolveTaipeiDate("下週", now)).toBeNull();
  });

  it("preserves known fields and asks the minimum missing question", () => {
    const mortality = parseCanonicalRecordingText("金雞測試場 測試一舍 死亡");
    expect(mortality).toMatchObject({ taxonomyId: "O9", subtype: "mortality", recordWorthiness: "candidate", missingFields: ["quantity"] });
    expect(mortality.fields).toMatchObject({ farmText: "金雞測試場", houseText: "測試一舍" });
    expect(mortality.clarificationQuestion).toBe("請補充數量。");
    const foot = parseCanonicalRecordingText("金雞測試場 測試一舍 臭腳");
    expect(foot).toMatchObject({ taxonomyId: "A8", subtype: "foot_odor", recordWorthiness: "candidate", missingFields: ["extent"] });
    expect(foot.clarificationQuestion).toBe("請選擇小範圍、中範圍或大範圍。");
    const genericEquipment = parseCanonicalRecordingText("金雞測試場 測試一舍 設備異常 大範圍");
    expect(genericEquipment).toMatchObject({ taxonomyId: "A12", subtype: null, recordWorthiness: "candidate", missingFields: ["subtype"] });
  });

  it("keeps questions, negations, future statements, and ordinary chatter out of official recording", () => {
    expect(parseCanonicalRecordingText("請問目前存欄？").recordWorthiness).toBe("ignore");
    expect(parseCanonicalRecordingText("明天金雞測試場死亡5").recordWorthiness).toBe("ignore");
    expect(parseCanonicalRecordingText("不是死亡5").recordWorthiness).toBe("ignore");
    expect(parseCanonicalRecordingText("晚安，明天見").recordWorthiness).toBe("ignore");
    expect(parseCanonicalRecordingText("金雞測試場 一舍 有點怪怪的").recordWorthiness).toBe("candidate");
  });
});

describe("recording taxonomy golden corpus", () => {
  it("has an authored case for every category and subtype", () => {
    expect(TAXONOMY_GOLDEN_CASES).toHaveLength(46);
    expect(TAXONOMY_GOLDEN_EDGE_CASES.length).toBeGreaterThanOrEqual(15);
    expect(taxonomyCoverage()).toMatchObject({ categories: 25, subtypes: 46, registryCategories: 25, registrySubtypes: 46 });
  });

  it("passes deterministic classification and field thresholds", () => {
    const metrics = runTaxonomyGoldenCorpus(new Date("2026-09-08T01:00:00.000Z"));
    expect(metrics.failures).toEqual([]);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.95);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.95);
    expect(metrics.falsePositiveRate).toBeLessThanOrEqual(0.02);
    expect(metrics.fieldSwapErrors).toBe(0);
    expect(metrics.unsafeFieldInvention).toBe(0);
    expect(metrics.knownFieldPreservation).toBeGreaterThanOrEqual(0.95);
    expect(metrics.minimumQuestionAccuracy).toBe(1);
  });
});
