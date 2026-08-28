import { readFileSync } from "node:fs";
import { mkdtemp as mkdtempAsync } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import {
  runAmbientExtractionV2RealSmoke,
  type AmbientV2RealSmokeFixture,
} from "./ambient-extraction-v2-real-runner";
import { planAmbientExtractionV2Batch, type AmbientV2ExpectedMessage, type AmbientV2MessageInput } from "./ambient-extraction-v2";

interface GroundTruthEvent {
  event: "mortality" | "cull" | "abnormal";
  quantity: number | null;
  detail?: string;
}

interface GroundTruthMessage {
  safe_ref: string;
  role?: "context" | "selected";
  text: string;
  expected: {
    events: GroundTruthEvent[];
    relation_intent: { type: string; target_ref: string } | null;
    context_resolution?: "resolved" | "unresolved";
  };
}

interface V2GroundTruthArtifact {
  dev_smoke_8: {
    selected_refs: string[];
    messages: GroundTruthMessage[];
  };
}

const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const realSmokeEnabled = processEnv.AMBIENT_V2_REAL_SMOKE === "1";

function loadFixture(): AmbientV2RealSmokeFixture {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"),
    "utf8",
  )) as V2GroundTruthArtifact;
  const selected = new Set(artifact.dev_smoke_8.selected_refs);
  const messages: AmbientV2MessageInput[] = artifact.dev_smoke_8.messages.map((message) => ({
    safeRef: message.safe_ref,
    sourceIdentity: `v2-real-${message.safe_ref}`,
    text: message.text,
    selected: selected.has(message.safe_ref),
    groupKey: "dev-smoke-8",
  }));
  const expectedMessages: AmbientV2ExpectedMessage[] = artifact.dev_smoke_8.messages.map((message) => ({
    safeRef: message.safe_ref,
    events: message.expected.events,
    relationTargetRef: message.expected.relation_intent?.target_ref ?? null,
    ...(message.expected.context_resolution ? { contextResolution: message.expected.context_resolution } : {}),
  }));
  return { messages, expectedMessages, selectedRefs: artifact.dev_smoke_8.selected_refs };
}

describe("Ambient Extraction V2 real-smoke runner", () => {
  it("derives three provider calls per DEV-SMOKE-8 run without calling AI", async () => {
    const fixture = loadFixture();
    expect(planAmbientExtractionV2Batch({ messages: fixture.messages, selectedRefs: fixture.selectedRefs })).toMatchObject({
      messagesTotal: 8,
      selectedCount: 6,
      deterministicResolved: 2,
      aiExtractionRequired: 3,
      relationDeterministic: 1,
      relationAiRequired: 0,
      expectedProviderCalls: 3,
    });
  });

  it("keeps real-model execution disabled unless explicit environment opt-in exists", () => {
    if (realSmokeEnabled) return;
    expect(realSmokeEnabled).toBe(false);
  });

  it("runs one bounded synthetic transport pass with no raw fixture persistence", async () => {
    const fixture = loadFixture();
    const root = await mkdtempAsync(join("/tmp", "ambient-v2-runner-test-"));
    const secret = "test-token-not-for-ledger";
    const report = await runAmbientExtractionV2RealSmoke({
      fixture,
      endpoint: "https://example.invalid/workers-ai",
      token: secret,
      ledgerPath: join(root, "attempts.jsonl"),
      experimentId: "11111111-1111-4111-8111-111111111111",
      matrixRunId: "22222222-2222-4222-8222-222222222222",
      runLimit: 1,
      fetchImpl: async () => new Response(JSON.stringify({
        success: true,
        result: { response: JSON.stringify({ events: [] }) },
      }), { status: 200 }),
    });
    expect(report.totalProviderCalls).toBe(3);
    expect(report.runs).toHaveLength(1);
    expect(report.sideEffectFree).toBe(true);
    const ledger = readFileSync(join(root, "attempts.jsonl"), "utf8");
    const ledgerRecords = ledger.trim().split(/\r?\n/u).map((line) => JSON.parse(line) as {
      recordType: string;
      callOrdinal?: number;
      promptFingerprint?: string;
      boundedSchema?: { structuralStatus: string; jsonParseStatus: string } | null;
    });
    expect(ledgerRecords.filter((record) => record.recordType === "ATTEMPT_START")).toHaveLength(3);
    expect(ledgerRecords.filter((record) => record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE")).toHaveLength(3);
    expect(ledgerRecords.filter((record) => record.recordType === "ATTEMPT_START").map((record) => record.callOrdinal)).toEqual([1, 2, 3]);
    expect(ledgerRecords.filter((record) => record.recordType === "ATTEMPT_START").every((record) => /^fnv1a32-[0-9a-f]{8}$/u.test(record.promptFingerprint ?? ""))).toBe(true);
    expect(ledgerRecords.filter((record) => record.recordType === "ATTEMPT_FAILURE").every((record) => record.boundedSchema?.structuralStatus === "pass" && record.boundedSchema.jsonParseStatus === "pass")).toBe(true);
    expect(ledgerRecords.some((record) => record.recordType === "PROCESS_STARTED")).toBe(true);
    expect(ledgerRecords.some((record) => record.recordType === "PROCESS_EXITED")).toBe(true);
    expect(ledger).not.toContain(secret);
    expect(ledger).not.toContain("金雞測試場");
    expect(ledger).not.toContain("source");
  });

  it.skipIf(!realSmokeEnabled)("runs the explicitly authorized serial Direct REST V2 smoke", async () => {
    const endpoint = processEnv.AMBIENT_V2_REAL_REST_URL;
    const ledgerPath = processEnv.AMBIENT_V2_REAL_SMOKE_LEDGER_PATH;
    const experimentId = processEnv.AMBIENT_V2_REAL_SMOKE_EXPERIMENT_ID;
    const matrixRunId = processEnv.AMBIENT_V2_REAL_SMOKE_MATRIX_RUN_ID;
    const auth = discoverAmbientSemanticEvalAuth();
    if (!endpoint || !auth || !ledgerPath || !experimentId || !matrixRunId) throw new Error("V2_REAL_SMOKE_ENV_INCOMPLETE");
    const report = await runAmbientExtractionV2RealSmoke({
      fixture: loadFixture(),
      endpoint,
      token: auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      runLimit: 5,
    });
    console.log(`AMBIENT_V2_REAL_SMOKE_SAFE_JSON=${JSON.stringify(report)}`);
    expect(report.model).toBe("@cf/meta/llama-3.2-3b-instruct");
    expect(report.temperature).toBe(0);
    expect(report.maxTokens).toBe(1536);
    expect(report.peakConcurrency).toBe(1);
    expect(report.totalProviderCalls).toBeLessThanOrEqual(report.totalProviderCallLimit);
  }, 10 * 60 * 1000);
});
