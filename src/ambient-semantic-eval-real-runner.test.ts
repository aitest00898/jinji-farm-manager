import { describe, expect, it } from "vitest";
import {
  AMBIENT_SEMANTIC_EVAL_REAL_MODEL_HARD_MAX_CALLS,
  runAmbientSemanticEvalSuite,
  type AmbientSemanticEvalReport,
} from "./ambient-semantic-eval";
import { fixtureCases } from "./ambient-semantic-eval-fixtures";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";
import {
  AmbientSemanticEvalAttemptLedger,
  failureTerminalRecord,
  terminalRecordFromReport,
} from "./ambient-semantic-eval-attempt-ledger";

const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const restUrl = processEnv.AMBIENT_SEMANTIC_EVAL_REST_URL;
const ledgerPath = processEnv.AMBIENT_SEMANTIC_EVAL_LEDGER_PATH;
const matrixRunId = processEnv.AMBIENT_SEMANTIC_EVAL_MATRIX_RUN_ID;

function safeFailureClass(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return /^[A-Za-z0-9_.:-]{1,80}$/u.test(name) ? name : "EVALUATION_FAILURE";
}

function safeReport(report: AmbientSemanticEvalReport) {
  return {
    testCase: report.testCase,
    runIndex: report.runIndex,
    model: report.model,
    maxTokens: report.maxTokens,
    promptTokens: report.promptTokens,
    completionTokens: report.completionTokens,
    totalTokens: report.totalTokens,
    aiTransport: report.aiTransport,
    httpStatus: report.httpStatus,
    providerResponseConfirmed: report.providerResponseConfirmed,
    transportErrorCode: report.transportErrorCode,
    transportErrorClass: report.transportErrorClass,
    jsonPass: report.jsonPass,
    normalizationPass: report.normalizationPass,
    validationPass: report.validationPass,
    selectedCount: report.selectedCount,
    decisionCount: report.decisionCount,
    validDecisionCount: report.validDecisionCount,
    invalidOrMissingDecisionCount: report.invalidOrMissingDecisionCount,
    decisionCoverage: report.decisionCoverage,
    missingRefCount: report.missingRefCount,
    unknownRefCount: report.unknownRefCount,
    duplicateRefCount: report.duplicateRefCount,
    eventCount: report.eventCount,
    supportCount: report.supportCount,
    ignoreCount: report.ignoreCount,
    eventTypeAccuracy: report.eventTypeAccuracy,
    quantityAccuracy: report.quantityAccuracy,
    unknownQuantityAccuracy: report.unknownQuantityAccuracy,
    supportRelationAccuracy: report.supportRelationAccuracy,
    sourceMappingAccuracy: report.sourceMappingAccuracy,
    hallucinationCount: report.hallucinationCount,
    contextLineageContaminationCount: report.contextLineageContaminationCount,
    duplicateEventCount: report.duplicateEventCount,
    systemBuildPass: report.systemBuildPass,
    overallSemanticAccuracy: report.overallSemanticAccuracy,
    overallPass: report.overallPass,
    errorClass: report.errorClass,
    decisionSchemaDiagnostics: report.decisionSchemaDiagnostics,
    snapshot: report.snapshot,
  };
}

describe("Ambient real-model capability matrix runner", () => {
  const enabled = Boolean(restUrl && ledgerPath && matrixRunId);

  it.skipIf(!enabled)("runs exactly three cases x three runs through direct Workers AI REST", async () => {
    const auth = discoverAmbientSemanticEvalAuth();
    if (!auth) throw new Error("REAL_MODEL_AUTH_UNAVAILABLE");
    const ledger = new AmbientSemanticEvalAttemptLedger(ledgerPath!, matrixRunId!);
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: restUrl!,
      token: auth.token,
      ledger,
      matrixRunId,
    });
    const reports = await runAmbientSemanticEvalSuite({
      cases: [...fixtureCases],
      runs: 3,
      realModel: true,
      aiAdapter: adapter,
      matrixRunId,
      onAttemptComplete: async (report, attempt) => {
        if (!attempt) throw new Error("ATTEMPT_HANDLE_MISSING");
        await ledger.append(terminalRecordFromReport(report, attempt));
      },
      onAttemptFailure: async (error, attempt) => {
        if (!attempt) throw new Error("ATTEMPT_HANDLE_MISSING");
        await ledger.append(failureTerminalRecord(attempt, safeFailureClass(error)));
      },
    });
    expect(adapter.calls).toBe(AMBIENT_SEMANTIC_EVAL_REAL_MODEL_HARD_MAX_CALLS);
    expect(reports).toHaveLength(9);
    expect((await ledger.read()).records.filter((record) => record.recordType.startsWith("ATTEMPT_")).length).toBe(18);
    console.log(`REAL_MODEL_MATRIX_SAFE_JSON=${JSON.stringify(reports.map(safeReport))}`);
  });

  it("does not enable real-model mode unless the direct REST adapter is configured", async () => {
    if (enabled) return;
    await expect(runAmbientSemanticEvalSuite({
      cases: [...fixtureCases],
      runs: 3,
      realModel: true,
    })).rejects.toThrow("REAL_MODEL_ADAPTER_REQUIRED");
  });
});
