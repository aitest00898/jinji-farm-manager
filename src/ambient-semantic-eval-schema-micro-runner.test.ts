import { describe, expect, it } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import { smokeD03, smokeD05, smokeD05D06 } from "./ambient-semantic-eval-fixtures";
import { AmbientSemanticEvalAttemptLedger } from "./ambient-semantic-eval-attempt-ledger";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";
import { runAmbientSchemaMicroSequence } from "./ambient-semantic-eval-schema-micro";

const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const enabled = processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_REAL_MODEL === "1"
  && Boolean(processEnv.AMBIENT_SEMANTIC_EVAL_REST_URL)
  && Boolean(processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_LEDGER_PATH)
  && Boolean(processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID);

describe("Ambient real-model schema micro runner", () => {
  it.skipIf(!enabled)("runs D05, then D03, then D05+D06 and stops at the first failure", async () => {
    const auth = discoverAmbientSemanticEvalAuth();
    if (!auth) throw new Error("REAL_MODEL_AUTH_UNAVAILABLE");
    const ledger = new AmbientSemanticEvalAttemptLedger(
      processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_LEDGER_PATH!,
      processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID!,
    );
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: processEnv.AMBIENT_SEMANTIC_EVAL_REST_URL!,
      token: auth.token,
      ledger,
      matrixRunId: processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID,
      maxCalls: 3,
    });
    const result = await runAmbientSchemaMicroSequence({
      cases: [smokeD05, smokeD03, smokeD05D06],
      adapter,
      ledger,
      matrixRunId: processEnv.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID!,
    });
    const ledgerRecords = (await ledger.read()).records;
    const starts = ledgerRecords.filter((record) => record.recordType === "ATTEMPT_START");
    const terminals = ledgerRecords.filter((record) =>
      record.recordType === "ATTEMPT_SUCCESS"
      || record.recordType === "ATTEMPT_FAILURE"
      || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION");

    expect(adapter.calls).toBe(result.providerCalls);
    expect(adapter.calls).toBeGreaterThanOrEqual(1);
    expect(adapter.calls).toBeLessThanOrEqual(3);
    expect(starts).toHaveLength(adapter.calls);
    expect(terminals).toHaveLength(adapter.calls);
    expect(result.safeReports).toHaveLength(adapter.calls);
    expect(result.reports.every((report) => report.model === PRODUCTION_AI_MODEL)).toBe(true);
    console.log("REAL_MODEL_SCHEMA_MICRO_SAFE_JSON=" + JSON.stringify(result));
  });

  it("does not enable real schema micro calls without explicit wrapper configuration", () => {
    if (enabled) return;
    expect(enabled).toBe(false);
  });
});
