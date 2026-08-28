import { describe, expect, it } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import { smokeD05 } from "./ambient-semantic-eval-fixtures";
import {
  AmbientSemanticEvalAttemptLedger,
  failureTerminalRecord,
  terminalRecordFromReport,
} from "./ambient-semantic-eval-attempt-ledger";
import { runAmbientSemanticEvalCase } from "./ambient-semantic-eval";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";
import { safeAmbientSchemaMicroReport } from "./ambient-semantic-eval-schema-micro";

const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_REAL_MODEL === "1"
  && processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_SINGLE_D05 === "1"
  && Boolean(processEnv.AMBIENT_SEMANTIC_EVAL_REST_URL)
  && Boolean(processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_LEDGER_PATH)
  && Boolean(processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID);

describe("Ambient kind contract fix real runner", () => {
  it.skipIf(!enabled)("runs exactly one D05 acceptance call", async () => {
    const auth = discoverAmbientSemanticEvalAuth();
    if (!auth) throw new Error("REAL_MODEL_AUTH_UNAVAILABLE");
    const matrixRunId = processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID!;
    const ledger = new AmbientSemanticEvalAttemptLedger(
      processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_LEDGER_PATH!,
      matrixRunId,
    );
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: processEnv.AMBIENT_SEMANTIC_EVAL_REST_URL!,
      token: auth.token,
      ledger,
      matrixRunId,
      maxCalls: 1,
    });
    await adapter.setAttemptContext?.({ matrixRunId, caseId: "D05_ALONE", runIndex: 1 });

    let report;
    try {
      report = await runAmbientSemanticEvalCase(smokeD05, 1, adapter);
      const attempt = adapter.currentAttempt;
      if (!attempt) throw new Error("KIND_FIX_ATTEMPT_HANDLE_MISSING");
      await ledger.append(terminalRecordFromReport(report, attempt));
    } catch (error) {
      const attempt = adapter.currentAttempt;
      if (attempt) await ledger.append(failureTerminalRecord(attempt, "KIND_FIX_RUNNER_FAILURE"));
      throw error;
    }

    const records = (await ledger.read()).records;
    const starts = records.filter((record) => record.recordType === "ATTEMPT_START");
    const terminals = records.filter((record) =>
      record.recordType === "ATTEMPT_SUCCESS"
      || record.recordType === "ATTEMPT_FAILURE"
      || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION");
    expect(adapter.calls).toBe(1);
    expect(starts).toHaveLength(1);
    expect(terminals).toHaveLength(1);
    expect(report.model).toBe(PRODUCTION_AI_MODEL);
    console.log("REAL_MODEL_KIND_FIX_SAFE_JSON=" + JSON.stringify({
      matrixRunId,
      caseId: "D05_ALONE",
      runIndex: 1,
      providerCalls: adapter.calls,
      stopAfterCall: 1,
      result: safeAmbientSchemaMicroReport(report),
    }));
  });

  it("does not enable the one-call runner without explicit configuration", () => {
    if (enabled) return;
    expect(enabled).toBe(false);
  });
});
