import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import { parseAmbientV2ResponseBoundary } from "./ambient-extraction-v2";
import {
  readAmbientV2RealSmokeLedger,
  runAmbientExtractionV2RealSmoke,
  type AmbientV2AttemptTerminalRecord,
  type AmbientV2RealSmokeFixture,
} from "./ambient-extraction-v2-real-runner";

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
const diagnosticEnabled = processEnv.AMBIENT_V2_D03_DIAGNOSTIC === "1";

function loadD03Fixture(): AmbientV2RealSmokeFixture {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"),
    "utf8",
  )) as GroundTruthArtifact;
  const d03 = artifact.dev_smoke_8.messages.find((message) => message.safe_ref === "D03");
  if (!d03) throw new Error("D03_GROUND_TRUTH_MISSING");
  return {
    messages: [{
      safeRef: "D03",
      sourceIdentity: "fixture-D03",
      text: d03.text,
      selected: true,
      groupKey: "fixture-group",
    }],
    expectedMessages: [{
      safeRef: "D03",
      events: d03.expected.events,
      relationTargetRef: null,
    }],
    selectedRefs: ["D03"],
  };
}

function terminalForD03(records: Awaited<ReturnType<typeof readAmbientV2RealSmokeLedger>>["records"]): AmbientV2AttemptTerminalRecord | null {
  const terminal = records.find((record): record is AmbientV2AttemptTerminalRecord =>
    (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
    && record.caseId === "D03-ALONE"
    && record.safeRef === "D03",
  );
  return terminal ?? null;
}

describe("Ambient Extraction V2 one-call D03 structural diagnostic", () => {
  it("keeps the diagnostic real-model call explicitly disabled by default", () => {
    if (diagnosticEnabled) return;
    expect(diagnosticEnabled).toBe(false);
  });

  it.skipIf(!diagnosticEnabled)("runs exactly one D03 Direct REST diagnostic and emits bounded evidence", async () => {
    const endpoint = processEnv.AMBIENT_V2_D03_DIAGNOSTIC_REST_URL;
    const ledgerPath = processEnv.AMBIENT_V2_D03_DIAGNOSTIC_LEDGER_PATH;
    const experimentId = processEnv.AMBIENT_V2_D03_DIAGNOSTIC_EXPERIMENT_ID;
    const matrixRunId = processEnv.AMBIENT_V2_D03_DIAGNOSTIC_MATRIX_RUN_ID;
    const auth = discoverAmbientSemanticEvalAuth();
    if (!endpoint || !auth || !ledgerPath || !experimentId || !matrixRunId) throw new Error("D03_DIAGNOSTIC_ENV_INCOMPLETE");

    let structuredResponseClass: "PROMPT_TEXT_RESPONSE" | "STRUCTURED_OBJECT_RESPONSE" | "PROVIDER_JSON_MODE_ERROR" | "OTHER" = "OTHER";
    const report = await runAmbientExtractionV2RealSmoke({
      fixture: loadD03Fixture(),
      endpoint,
      token: auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      runLimit: 1,
      caseId: "D03-ALONE",
      totalProviderCallLimit: 1,
      executionMode: "STRUCTURED_OUTPUT",
      responseParser: (value) => {
        const boundary = parseAmbientV2ResponseBoundary(value);
        structuredResponseClass = boundary.responseClass;
        return boundary.parsed;
      },
    });
    const ledger = await readAmbientV2RealSmokeLedger(ledgerPath);
    const terminal = terminalForD03(ledger.records);
    const boundedSchema = terminal?.boundedSchema ?? null;
    const safeReport = {
      experimentId,
      matrixRunId,
      caseId: "D03-ALONE",
      safeRef: "D03",
      expectedProviderCalls: report.plan.expectedProviderCalls,
      providerAttempts: report.totalProviderCalls,
      providerResponses: report.successfulProviderResponses,
      technicalFailures: report.technicalFailures,
      runStatus: report.runs[0]?.status ?? "NOT_COMPLETED",
      httpStatus: terminal?.httpStatus ?? null,
      providerResponseConfirmed: terminal?.providerResponseConfirmed ?? null,
      transportStatus: terminal?.transportStatus ?? "unknown",
      jsonStatus: terminal?.jsonStatus ?? "unknown",
      normalizationStatus: terminal?.normalizationStatus ?? "unknown",
      validationStatus: terminal?.validationStatus ?? "unknown",
      systemBuildStatus: terminal?.systemBuildStatus ?? "unknown",
      structural: boundedSchema,
      structuredResponseClass,
      semantic: terminal?.safeMetrics?.messages.find((message) => message.safeRef === "D03")?.eventDiagnostics ?? [],
      d03SemanticDiagnostic: terminal?.safeMetrics?.d03SemanticDiagnostic ?? null,
    };
    console.log(`AMBIENT_V2_D03_DIAGNOSTIC_SAFE_JSON=${JSON.stringify(safeReport)}`);
    expect(report.plan.expectedProviderCalls).toBe(1);
    expect(report.totalProviderCalls).toBe(1);
    expect(structuredResponseClass).toBe("STRUCTURED_OBJECT_RESPONSE");
    expect(terminal?.boundedSchema?.structuralStatus).toBe("pass");
    expect(ledger.records.filter((record) => record.recordType === "ATTEMPT_START")).toHaveLength(1);
    expect(terminal).not.toBeNull();
  }, 10 * 60 * 1000);
});
