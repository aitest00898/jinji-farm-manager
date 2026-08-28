import { describe, expect, it } from "vitest";
import {
  runAmbientSemanticEvalCase,
  runAmbientSemanticEvalSuite,
  type AmbientSemanticEvalCase,
} from "./ambient-semantic-eval";
import {
  decisionForFixtureId,
  eventDecision,
  fixtureCases,
  smokeD03,
  smokeD05D06,
  smokeFull,
} from "./ambient-semantic-eval-fixtures";
const configuredFixtureRuns = Number((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.AMBIENT_SEMANTIC_EVAL_RUNS ?? "2");
const emitFixtureReport = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.AMBIENT_SEMANTIC_EVAL_REPORT === "1";

describe("Ambient semantic eval harness", () => {
  it("EVAL-01 evaluates D03 unknown quantity through production extraction and build", async () => {
    const report = await runAmbientSemanticEvalCase(smokeD03);
    expect(report.selectedCount).toBe(1);
    expect(report.decisionCoverage).toBe("1/1");
    expect(report.eventCount).toBe(1);
    expect(report.eventTypeAccuracy).toBe("PASS");
    expect(report.unknownQuantityAccuracy).toBe("PASS");
    expect(report.validationPass).toBe(true);
    expect(report.systemBuildPass).toBe(true);
    expect(report.overallPass).toBe(true);
  });

  it("EVAL-03 builds D05 plus D06 support as one event lineage", async () => {
    const report = await runAmbientSemanticEvalCase(smokeD05D06);
    expect(report.decisionCoverage).toBe("2/2");
    expect(report.eventCount).toBe(1);
    expect(report.supportCount).toBe(1);
    expect(report.supportRelationAccuracy).toBe("PASS");
    expect(report.sourceMappingAccuracy).toBe("PASS");
    expect(report.duplicateEventCount).toBe(0);
    expect(report.overallPass).toBe(true);
  });

  it("EVAL-06 evaluates all six selected sources in the full smoke fixture", async () => {
    const report = await runAmbientSemanticEvalCase(smokeFull);
    expect(report.selectedCount).toBe(6);
    expect(report.decisionCoverage).toBe("6/6");
    expect(report.eventCount).toBe(5);
    expect(report.supportCount).toBe(1);
    expect(report.ignoreCount).toBe(0);
    expect(report.contextLineageContaminationCount).toBe(0);
    expect(report.sourceMappingAccuracy).toBe("PASS");
    expect(report.duplicateEventCount).toBe(0);
    expect(report.overallPass).toBe(true);
  });

  it("EVAL-02 and EVAL-04 report exact missing selected refs", async () => {
    const d03Omitted: AmbientSemanticEvalCase = {
      ...smokeD03,
      responseForRun: () => JSON.stringify({ decisions: [] }),
    };
    const d06Omitted: AmbientSemanticEvalCase = {
      ...smokeD05D06,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [decisionForFixtureId("D05", sourceRefFor)] }),
    };
    const [missingD03, missingD06] = await Promise.all([
      runAmbientSemanticEvalCase(d03Omitted),
      runAmbientSemanticEvalCase(d06Omitted),
    ]);
    expect(missingD03.validationPass).toBe(false);
    expect(missingD03.missingRefCount).toBe(1);
    expect(missingD03.decisionCoverage).toBe("0/1");
    expect(missingD06.validationPass).toBe(false);
    expect(missingD06.missingRefCount).toBe(1);
    expect(missingD06.decisionCoverage).toBe("1/2");
  });

  it("EVAL-05 rejects an invalid support target", async () => {
    const invalidTarget: AmbientSemanticEvalCase = {
      ...smokeD05D06,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [
        decisionForFixtureId("D05", sourceRefFor),
        { ref: sourceRefFor("D06"), kind: "support", targetRef: "m99" },
      ] }),
    };
    const report = await runAmbientSemanticEvalCase(invalidTarget);
    expect(report.validationPass).toBe(false);
    expect(report.systemBuildPass).toBe(false);
    expect(report.overallPass).toBe(false);
    expect(report.missingRefCount).toBe(0);
  });

  it("EVAL-07 reports a 4/6 batch as four valid decisions plus two missing refs", async () => {
    const fourOfSix: AmbientSemanticEvalCase = {
      ...smokeFull,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [
        ...["D02", "D04", "D05", "D07"].map((id) => decisionForFixtureId(id, sourceRefFor)),
      ] }),
    };
    const report = await runAmbientSemanticEvalCase(fourOfSix);
    expect(report.decisionCount).toBe(4);
    expect(report.decisionCoverage).toBe("4/6");
    expect(report.missingRefCount).toBe(2);
    expect(report.validationPass).toBe(false);
    expect(report.systemBuildPass).toBe(false);
  });

  it("keeps value-free field diagnostics when an event decision is schema-invalid", async () => {
    const missingRaw: Record<string, unknown> = { ...eventDecision("m1", "abnormal", null), raw: "private symptom" };
    delete missingRaw.raw;
    const invalid: AmbientSemanticEvalCase = {
      ...smokeD03,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [{ ...missingRaw, ref: sourceRefFor("D03") }] }),
    };
    const report = await runAmbientSemanticEvalCase(invalid);
    expect(report.validationPass).toBe(false);
    expect(report.decisionSchemaDiagnostics).toMatchObject({
      decisionCount: 1,
      firstIssueCode: "INVALID_FIELD_TYPE",
      firstIssuePath: "decisions[0].raw",
      decisions: [{
        decisionOrdinal: 1,
        kind: "event",
        missingRequiredKeys: ["raw"],
        rawStatus: "MISSING",
        quantityKind: "null",
        quantityNullabilityStatus: "VALID",
        quantityConfidenceStatus: "VALID",
      }],
    });
    const serialized = JSON.stringify(report.decisionSchemaDiagnostics);
    expect(serialized).not.toContain("private symptom");
    expect(serialized).not.toContain("金雞測試場");
  });

  it("classifies invalid enum and support target shapes without storing values", async () => {
    const invalidEnum: AmbientSemanticEvalCase = {
      ...smokeD03,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [{
        ...eventDecision(sourceRefFor("D03"), "abnormal", null),
        type: "unsupported-event",
      }] }),
    };
    const invalidSupport: AmbientSemanticEvalCase = {
      ...smokeD05D06,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [
        eventDecision(sourceRefFor("D05"), "mortality", 3),
        { ref: sourceRefFor("D06"), kind: "support", targetRef: "m999" },
      ] }),
    };
    const [enumReport, supportReport] = await Promise.all([
      runAmbientSemanticEvalCase(invalidEnum),
      runAmbientSemanticEvalCase(invalidSupport),
    ]);
    expect(enumReport.decisionSchemaDiagnostics?.decisions[0]).toMatchObject({ typeEnumStatus: "INVALID" });
    expect(JSON.stringify(enumReport.decisionSchemaDiagnostics)).not.toContain("unsupported-event");
    expect(supportReport.decisionSchemaDiagnostics?.decisions[1]).toMatchObject({
      kind: "support",
      targetRefStatus: "VALID",
      targetRefSelectedStatus: "INVALID",
    });
  });

  it("EVAL-08 rejects context-source contamination", async () => {
    const contaminated: AmbientSemanticEvalCase = {
      ...smokeFull,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [
        ...["D02", "D03", "D04", "D05", "D06", "D07"].map((id) => decisionForFixtureId(id, sourceRefFor)),
        eventDecision(sourceRefFor("D01"), "mortality", 99),
      ] }),
    };
    const report = await runAmbientSemanticEvalCase(contaminated);
    expect(report.validationPass).toBe(false);
    expect(report.systemBuildPass).toBe(false);
  });

  it("EVAL-09 catches two independent mortality3 events instead of support", async () => {
    const duplicateEvent: AmbientSemanticEvalCase = {
      ...smokeFull,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [
        ...["D02", "D03", "D04", "D05", "D07"].map((id) => decisionForFixtureId(id, sourceRefFor)),
        eventDecision(sourceRefFor("D06"), "mortality", 3),
      ] }),
    };
    const report = await runAmbientSemanticEvalCase(duplicateEvent);
    expect(report.validationPass).toBe(true);
    expect(report.duplicateEventCount).toBe(1);
    expect(report.overallPass).toBe(false);
  });

  it("EVAL-10/11/12 fail closed for malformed, unknown, and duplicate refs", async () => {
    const malformed: AmbientSemanticEvalCase = { ...smokeD03, responseForRun: () => "{\"decisions\":[" };
    const unknownRef: AmbientSemanticEvalCase = {
      ...smokeD03,
      responseForRun: () => JSON.stringify({ decisions: [{ ...eventDecision("m99", "abnormal", null), quantityConfidence: "unknown" }] }),
    };
    const duplicateRef: AmbientSemanticEvalCase = {
      ...smokeD05D06,
      responseForRun: ({ sourceRefFor }) => JSON.stringify({ decisions: [
        decisionForFixtureId("D05", sourceRefFor),
        decisionForFixtureId("D05", sourceRefFor),
      ] }),
    };
    const [badJson, badRef, duplicate] = await Promise.all([
      runAmbientSemanticEvalCase(malformed),
      runAmbientSemanticEvalCase(unknownRef),
      runAmbientSemanticEvalCase(duplicateRef),
    ]);
    expect(badJson.jsonPass).toBe(false);
    expect(badJson.systemBuildPass).toBe(false);
    expect(badRef.validationPass).toBe(false);
    expect(duplicate.validationPass).toBe(false);
    expect(duplicate.duplicateRefCount).toBeGreaterThan(0);
  });

  it("keeps the report bounded and side-effect free", async () => {
    const report = await runAmbientSemanticEvalCase(smokeFull);
    const serialized = JSON.stringify(report);
    expect(report.aiCallCount).toBe(1);
    expect(report.evalSideEffectFree).toBe(true);
    expect(serialized).not.toContain("今天雞排一份85元");
    expect(serialized).not.toContain("金雞測試場剛剛死2隻");
    expect(serialized).not.toContain("rawTexts");
    expect(serialized).not.toContain("source_messages");
    expect(serialized).not.toContain("只做逐則雞場語意判斷");
  });

  it("supports bounded repeated fixture runs but refuses real-model mode", async () => {
    const reports = await runAmbientSemanticEvalSuite({ cases: fixtureCases, runs: configuredFixtureRuns });
    expect(reports).toHaveLength(configuredFixtureRuns * fixtureCases.length);
    expect([...new Set(reports.map((report) => report.runIndex))]).toEqual(Array.from({ length: configuredFixtureRuns }, (_, index) => index + 1));
    expect(reports.every((report) => report.aiCallCount === 1)).toBe(true);
    expect(reports.every((report) => report.evalSideEffectFree)).toBe(true);
    if (emitFixtureReport) console.log(JSON.stringify(reports, null, 2));
    await expect(runAmbientSemanticEvalSuite({ cases: [smokeD03], realModel: true })).rejects.toThrow("REAL_MODEL_ADAPTER_REQUIRED");
  });
});
