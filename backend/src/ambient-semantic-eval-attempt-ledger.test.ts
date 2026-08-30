import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { smokeD03 } from "./ambient-semantic-eval-fixtures";
import { runAmbientSemanticEvalCase } from "./ambient-semantic-eval";
import {
  AmbientSemanticEvalAttemptLedger,
  failureTerminalRecord,
  orphanAttemptHandles,
  reconstructAmbientSemanticEvalRun,
  terminalRecordFromReport,
  unknownTerminationRecord,
  type AmbientSemanticEvalAttemptStartRecord,
} from "./ambient-semantic-eval-attempt-ledger";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";

const endpoint = "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct";
const token = "test-token-not-a-real-secret";
const input = {
  messages: [{ role: "system" as const, content: "system" }, { role: "user" as const, content: "user" }],
  max_tokens: 1536,
  temperature: 0,
};

function tempLedgerPath(): string {
  return `/private/tmp/ambient-semantic-eval-ledger-${randomUUID()}.jsonl`;
}

function successFetch() {
  return vi.fn(async () => new Response(
    JSON.stringify({ success: true, result: { response: '{"decisions":[]}' } }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
}

function startRecord(matrixRunId: string, caseId = "D03_ALONE", runIndex = 1): AmbientSemanticEvalAttemptStartRecord {
  return {
    recordType: "ATTEMPT_START",
    matrixRunId,
    attemptId: randomUUID(),
    caseId,
    runIndex,
    model: PRODUCTION_AI_MODEL,
    timestamp: new Date().toISOString(),
    requestContractFingerprint: "fnv1a-00000000",
    maxTokens: 1536,
    temperature: 0,
    status: "started",
  };
}

async function withLedger<T>(callback: (ledger: AmbientSemanticEvalAttemptLedger, matrixRunId: string, path: string) => Promise<T>): Promise<T> {
  const path = tempLedgerPath();
  const matrixRunId = randomUUID();
  const ledger = new AmbientSemanticEvalAttemptLedger(path, matrixRunId);
  try {
    return await callback(ledger, matrixRunId, path);
  } finally {
    await rm(path, { force: true });
  }
}

describe("Ambient semantic-eval durable attempt ledger", () => {
  it("writes a bounded START before the provider fetch", async () => {
    await withLedger(async (ledger, matrixRunId, path) => {
      let startsSeenByFetch = 0;
      const fetchImpl = vi.fn(async () => {
        const content = await readFile(path, { encoding: "utf8" });
        startsSeenByFetch = content.split(/\r?\n/u).filter(Boolean).filter((line) => line.includes('"ATTEMPT_START"')).length;
        return new Response(JSON.stringify({ success: true, result: { response: '{"decisions":[]}' } }), { status: 200 });
      });
      const adapter = new DirectWorkersAiRestAdapter({ endpoint, token, fetchImpl, ledger, matrixRunId });
      adapter.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: 1 });
      await adapter.run(PRODUCTION_AI_MODEL, input);
      expect(startsSeenByFetch).toBe(1);
      expect(adapter.calls).toBe(1);
      expect((await ledger.read()).records).toHaveLength(1);
    });
  });

  it("keeps HTTP failures terminally attributable without persisting the body", async () => {
    await withLedger(async (ledger, matrixRunId) => {
      const fetchImpl = vi.fn(async () => new Response(
        JSON.stringify({ success: false, errors: [{ code: 5007, message: "private response body" }] }),
        { status: 403 },
      ));
      const adapter = new DirectWorkersAiRestAdapter({ endpoint, token, fetchImpl, ledger, matrixRunId });
      adapter.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: 1 });
      await expect(adapter.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("REAL_MODEL_REST_HTTP_403");
      await ledger.append(failureTerminalRecord(adapter.currentAttempt!, "AUTH_FAILURE"));
      const serialized = JSON.stringify((await ledger.read()).records);
      expect(serialized).not.toContain("private response body");
      expect(serialized).not.toContain(token);
      expect((await ledger.read()).records.filter((record) => record.recordType.startsWith("ATTEMPT_"))).toHaveLength(2);
    });
  });

  it("records fetch rejection and timeout as bounded failures", async () => {
    await withLedger(async (ledger, matrixRunId) => {
      const rejected = new DirectWorkersAiRestAdapter({
        endpoint,
        token,
        fetchImpl: vi.fn(async () => { throw new Error("private network detail"); }),
        ledger,
        matrixRunId,
      });
      rejected.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: 1 });
      await expect(rejected.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("REAL_MODEL_REST_NETWORK_FAILURE");
      await ledger.append(failureTerminalRecord(rejected.currentAttempt!, "NETWORK_FAILURE"));

      const timedOut = new DirectWorkersAiRestAdapter({
        endpoint,
        token,
        timeoutMs: 5,
        fetchImpl: vi.fn((_url, init): Promise<Response> => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })),
        ledger,
        matrixRunId,
      });
      timedOut.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: 2 });
      await expect(timedOut.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("REAL_MODEL_REST_TIMEOUT");
      await ledger.append(failureTerminalRecord(timedOut.currentAttempt!, "PROVIDER_TIMEOUT"));
      expect((await ledger.read()).records.filter((record) => record.recordType === "ATTEMPT_FAILURE")).toHaveLength(2);
    });
  });

  it("fails before provider transport if telemetry append fails", async () => {
    await withLedger(async (ledger, matrixRunId) => {
      const fetchImpl = successFetch();
      ledger.append = async () => { throw new Error("TELEMETRY_DURABILITY_FAILURE"); };
      const adapter = new DirectWorkersAiRestAdapter({ endpoint, token, fetchImpl, ledger, matrixRunId });
      adapter.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: 1 });
      await expect(adapter.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("TELEMETRY_DURABILITY_FAILURE");
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(adapter.calls).toBe(0);
    });
  });

  it("enforces the nine-start hard limit and never sends a tenth request", async () => {
    await withLedger(async (ledger, matrixRunId) => {
      const fetchImpl = successFetch();
      const adapter = new DirectWorkersAiRestAdapter({ endpoint, token, fetchImpl, ledger, matrixRunId });
      for (let index = 0; index < 9; index += 1) {
        adapter.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: (index % 3) + 1 });
        await adapter.run(PRODUCTION_AI_MODEL, input);
      }
      adapter.setAttemptContext({ matrixRunId, caseId: "D03_ALONE", runIndex: 3 });
      await expect(adapter.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("REAL_MODEL_CALL_LIMIT_EXCEEDED");
      expect(fetchImpl).toHaveBeenCalledTimes(9);
      expect(adapter.calls).toBe(9);
      expect(await ledger.countStarts()).toBe(9);
    });
  });

  it("reconstructs an orphan START and isolates matrix runs", async () => {
    await withLedger(async (ledger, matrixRunId) => {
      const orphan = startRecord(matrixRunId, "D03_ALONE", 1);
      const otherRun = randomUUID();
      await ledger.append(orphan);
      await ledger.append({ ...startRecord(otherRun, "FULL_SELECTED", 1), recordType: "ATTEMPT_START" });
      const read = await ledger.read();
      expect(orphanAttemptHandles(read.records, matrixRunId)).toHaveLength(1);
      expect(reconstructAmbientSemanticEvalRun(read.records, matrixRunId).orphanAttemptCount).toBe(1);
      expect(reconstructAmbientSemanticEvalRun(read.records, matrixRunId).providerAttemptCount).toBe(1);
      expect(reconstructAmbientSemanticEvalRun(read.records, otherRun).providerAttemptCount).toBe(1);
    });
  });

  it("accepts an unknown-termination terminal without misclassifying it as semantic failure", async () => {
    await withLedger(async (ledger, matrixRunId) => {
      const start = startRecord(matrixRunId, "FULL_SELECTED", 3);
      await ledger.append(start);
      await ledger.append(unknownTerminationRecord({
        matrixRunId,
        attemptId: start.attemptId,
        caseId: start.caseId,
        runIndex: start.runIndex,
      }, { exitCode: 1, signal: null }));
      const result = reconstructAmbientSemanticEvalRun(await ledger.read().then((value) => value.records), matrixRunId, { exitCode: 1, signal: null });
      expect(orphanAttemptHandles(await ledger.read().then((value) => value.records), matrixRunId)).toHaveLength(0);
      expect(result.terminalAttemptCount).toBe(1);
      expect(result.orphanAttemptCount).toBe(0);
      expect(result.attempts[0]).toMatchObject({
        terminalStatus: "ATTEMPT_UNKNOWN_TERMINATION",
        transportStatus: "unknown",
        providerResponseConfirmed: null,
      });
    });
  });

  it("projects a semantic report without raw prompt, completion, or transcript", async () => {
    const report = await runAmbientSemanticEvalCase(smokeD03);
    await withLedger(async (ledger) => {
      const handle = { matrixRunId: randomUUID(), attemptId: randomUUID(), caseId: "D03_ALONE", runIndex: 1 };
      await ledger.append(terminalRecordFromReport(report, handle));
      const serialized = JSON.stringify((await ledger.read()).records);
      expect(serialized).not.toContain("金雞測試場");
      expect(serialized).not.toContain("只做逐則雞場語意判斷");
      expect(serialized).not.toContain("來源片段");
    });
  });
});
