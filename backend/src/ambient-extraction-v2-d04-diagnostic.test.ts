import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import { parseAmbientV2ResponseBoundary } from "./ambient-extraction-v2";
import {
  buildAmbientV2D04SemanticDiagnostic,
  readAmbientV2RealSmokeLedger,
  runAmbientExtractionV2RealSmoke,
  type AmbientV2AttemptTerminalRecord,
  type AmbientV2RealSmokeFixture,
} from "./ambient-extraction-v2-real-runner";
import { runAmbientExtractionV2StructuredBatch } from "./ambient-extraction-v2-structured-output";

interface GroundTruthArtifact {
  dev_smoke_8: {
    messages: Array<{
      safe_ref: string;
      text: string;
      expected: {
        events: Array<{ event: "mortality" | "cull" | "abnormal"; quantity: number | null; detail?: string }>;
        relation_intent: null | { type: string; target_ref: string };
      };
    }>;
  };
}

const processEnv = process.env;
const diagnosticEnabled = processEnv.AMBIENT_V2_D04_DIAGNOSTIC === "1";

function loadD04Fixture(): AmbientV2RealSmokeFixture {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"),
    "utf8",
  )) as GroundTruthArtifact;
  const d04 = artifact.dev_smoke_8.messages.find((message) => message.safe_ref === "D04");
  if (!d04) throw new Error("D04_GROUND_TRUTH_MISSING");
  return {
    messages: [{
      safeRef: "D04",
      sourceIdentity: "fixture-D04",
      text: d04.text,
      selected: true,
      groupKey: "fixture-group",
    }],
    expectedMessages: [{
      safeRef: "D04",
      events: d04.expected.events,
      relationTargetRef: null,
    }],
    selectedRefs: ["D04"],
  };
}

function terminalForD04(records: Awaited<ReturnType<typeof readAmbientV2RealSmokeLedger>>["records"]): AmbientV2AttemptTerminalRecord | null {
  const terminal = records.find((record): record is AmbientV2AttemptTerminalRecord =>
    (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
    && record.caseId === "D04-ALONE"
    && record.safeRef === "D04",
  );
  return terminal ?? null;
}

describe("Ambient Extraction V2.1 one-call D04 semantic gate", () => {
  it("keeps the real D04 diagnostic disabled by default", () => {
    if (diagnosticEnabled) return;
    expect(diagnosticEnabled).toBe(false);
  });

  it("classifies the frozen cull/abnormal pair with bounded fields only", async () => {
    const fixture = loadD04Fixture();
    const result = await runAmbientExtractionV2StructuredBatch({
      messages: fixture.messages,
      selectedRefs: fixture.selectedRefs,
      adapter: {
        name: "d04-bounded-semantic-fixture",
        async run() {
          return {
            response: {
              events: [
                { event: "cull", quantity: 2, detail: null },
                { event: "abnormal", quantity: 2, detail: "腳傷" },
              ],
            },
          };
        },
      },
    });
    const diagnostic = buildAmbientV2D04SemanticDiagnostic(
      result.messages[0]!,
      fixture.expectedMessages[0],
    );

    expect(diagnostic).toMatchObject({
      eventCount: 2,
      eventCountPass: "YES",
      event1EventTypePass: "YES",
      event1QuantityPass: "YES",
      event1DetailKind: "NULL",
      event1DetailNullPass: "YES",
      event2EventTypePass: "YES",
      event2QuantityPass: "YES",
      event2DetailKind: "STRING",
      event2DetailMatchesExpected: "YES",
      cullPass: "YES",
      abnormalEventPass: "YES",
      abnormalQuantityPass: "YES",
      semanticPass: "YES",
      failureClass: "NONE",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("腳傷");
  });

  it.skipIf(!diagnosticEnabled)("runs exactly one D04 structured Direct REST diagnostic", async () => {
    const endpoint = processEnv.AMBIENT_V2_D04_DIAGNOSTIC_REST_URL;
    const ledgerPath = processEnv.AMBIENT_V2_D04_DIAGNOSTIC_LEDGER_PATH;
    const experimentId = processEnv.AMBIENT_V2_D04_DIAGNOSTIC_EXPERIMENT_ID;
    const matrixRunId = processEnv.AMBIENT_V2_D04_DIAGNOSTIC_MATRIX_RUN_ID;
    const auth = discoverAmbientSemanticEvalAuth();
    if (!endpoint || !auth || !ledgerPath || !experimentId || !matrixRunId) throw new Error("D04_DIAGNOSTIC_ENV_INCOMPLETE");

    let structuredResponseClass: "PROMPT_TEXT_RESPONSE" | "STRUCTURED_OBJECT_RESPONSE" | "PROVIDER_JSON_MODE_ERROR" | "OTHER" = "OTHER";
    const report = await runAmbientExtractionV2RealSmoke({
      fixture: loadD04Fixture(),
      endpoint,
      token: auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      runLimit: 1,
      caseId: "D04-ALONE",
      totalProviderCallLimit: 1,
      executionMode: "STRUCTURED_OUTPUT",
      responseParser: (value) => {
        const boundary = parseAmbientV2ResponseBoundary(value);
        structuredResponseClass = boundary.responseClass;
        return boundary.parsed;
      },
    });
    const ledger = await readAmbientV2RealSmokeLedger(ledgerPath);
    const terminal = terminalForD04(ledger.records);
    const boundedSchema = terminal?.boundedSchema ?? null;
    const semantic = terminal?.safeMetrics?.d04SemanticDiagnostic ?? null;
    const structuralStatus = boundedSchema?.structuralStatus === "pass" ? "PASS" : "FAIL";
    const safeReport = {
      experimentId,
      matrixRunId,
      caseId: "D04-ALONE",
      safeRef: "D04",
      expectedProviderCalls: report.plan.expectedProviderCalls,
      providerAttempts: report.totalProviderCalls,
      providerResponses: report.successfulProviderResponses,
      technicalFailures: report.technicalFailures,
      runStatus: report.runs[0]?.status ?? "NOT_COMPLETED",
      httpStatus: terminal?.httpStatus ?? null,
      providerResponseConfirmed: terminal?.providerResponseConfirmed ?? null,
      structuredResponseClass,
      structuralStatus,
      structuralSubtype: boundedSchema?.structuralSubtype ?? "NONE",
      eventCount: semantic?.eventCount ?? boundedSchema?.eventItemCount ?? null,
      eventCountPass: semantic?.eventCountPass ?? "NO",
      event1EventTypePass: semantic?.event1EventTypePass ?? "NO",
      event1QuantityPass: semantic?.event1QuantityPass ?? "NO",
      event1DetailKind: semantic?.event1DetailKind ?? "UNKNOWN",
      event1DetailNullPass: semantic?.event1DetailNullPass ?? "NO",
      event2EventTypePass: semantic?.event2EventTypePass ?? "NO",
      event2QuantityPass: semantic?.event2QuantityPass ?? "NO",
      event2DetailKind: semantic?.event2DetailKind ?? "UNKNOWN",
      event2DetailMatchesExpected: semantic?.event2DetailMatchesExpected ?? "NO",
      cullPass: semantic?.cullPass ?? "NO",
      abnormalEventPass: semantic?.abnormalEventPass ?? "NO",
      abnormalQuantityPass: semantic?.abnormalQuantityPass ?? "NO",
      semanticPass: semantic?.semanticPass ?? "NO",
      failureClass: semantic?.failureClass ?? "STRUCTURAL",
    };
    console.log(`AMBIENT_V2_D04_DIAGNOSTIC_SAFE_JSON=${JSON.stringify(safeReport)}`);
    expect(report.plan.expectedProviderCalls).toBe(1);
    expect(report.totalProviderCalls).toBe(1);
    expect(structuredResponseClass).toBe("STRUCTURED_OBJECT_RESPONSE");
    expect(terminal).not.toBeNull();
  }, 10 * 60 * 1000);
});
