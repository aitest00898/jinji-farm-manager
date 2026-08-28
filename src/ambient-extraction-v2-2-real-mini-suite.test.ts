import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuthStatus,
} from "./ambient-semantic-eval-auth";
import {
  AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
  AMBIENT_V2_2_SYSTEM_PROMPT,
  type AmbientV2_2FactSet,
} from "./ambient-extraction-v2-2";
import {
  AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS,
  AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS,
  AMBIENT_V2_2_REAL_MINI_SUITE_MAX_TOKENS,
  AMBIENT_V2_2_REAL_MINI_SUITE_MODEL,
  AMBIENT_V2_2_REAL_MINI_SUITE_RUNS,
  AMBIENT_V2_2_REAL_MINI_SUITE_TEMPERATURE,
  buildAmbientV2_2RealMiniRequest,
  planAmbientV2_2RealMiniSuite,
  runAmbientV2_2RealMiniSuite,
  type AmbientV2_2MiniSuiteCase,
} from "./ambient-extraction-v2-2-real-mini-suite";
import type { AmbientV2MessageInput } from "./ambient-extraction-v2";

interface GroundTruthMessage {
  safe_ref: string;
  text: string;
  expected: {
    operations: Array<{ type: "mortality" | "cull"; quantity: number | null }>;
    abnormalities: Array<{ detail: string; quantity: number | null }>;
  };
}

interface GroundTruthArtifact {
  dev_smoke_8: { messages: GroundTruthMessage[] };
}

const realEnabled = process.env.AMBIENT_V2_2_REAL_MINI_SUITE === "1";

function loadMiniCases(): AmbientV2_2MiniSuiteCase[] {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-2-ground-truth-2026-08-28.json"),
    "utf8",
  )) as GroundTruthArtifact;
  return AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS.map((safeRef) => {
    const fixture = artifact.dev_smoke_8.messages.find((message) => message.safe_ref === safeRef);
    if (!fixture) throw new Error(`V22_MINI_GROUND_TRUTH_MISSING_${safeRef}`);
    const expected: AmbientV2_2FactSet = {
      operations: fixture.expected.operations,
      abnormalities: fixture.expected.abnormalities,
    };
    const message: AmbientV2MessageInput = {
      safeRef,
      sourceIdentity: `v22-mini-${safeRef}`,
      text: fixture.text,
      selected: true,
      groupKey: "v22-mini-suite",
    };
    return safeRef === "D04"
      ? { safeRef, message, expected, attribution: { abnormalityQuantities: [2] } }
      : { safeRef, message, expected };
  });
}

async function clean(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

describe("Ambient V2.2 repeated mini-suite", () => {
  it("pins the fixed serial 3-by-3 plan and request settings", () => {
    const cases = loadMiniCases();
    const plan = planAmbientV2_2RealMiniSuite(cases);
    const request = buildAmbientV2_2RealMiniRequest(cases[0]!.message);

    expect(plan).toMatchObject({
      wireContractVersion: "2.2",
      executionMode: "SERIAL",
      maxConcurrentAiCalls: 1,
      retries: 0,
      runs: 3,
      casesPerRun: 3,
      expectedProviderCallsPerRun: 3,
      expectedProviderCalls: 9,
      caseOrder: ["D03", "D04", "D07"],
      relationOnlyRefs: [],
    });
    expect(request.max_tokens).toBe(AMBIENT_V2_2_REAL_MINI_SUITE_MAX_TOKENS);
    expect(request.temperature).toBe(AMBIENT_V2_2_REAL_MINI_SUITE_TEMPERATURE);
    expect(request.stream).toBe(false);
    expect(request.response_format).toEqual(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
    expect(request.messages[0]?.content).toBe(AMBIENT_V2_2_SYSTEM_PROMPT);
  });

  it("completes all nine mocked calls serially and keeps D04 attribution separate", async () => {
    const cases = loadMiniCases();
    const ledgerDirectory = await mkdtemp(join(tmpdir(), "ambient-v22-mini-"));
    const ledgerPath = join(ledgerDirectory, "attempts.jsonl");
    let callIndex = 0;
    const fetchImpl: typeof fetch = async () => {
      const safeRef = AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS[callIndex % 3];
      callIndex += 1;
      const response = safeRef === "D03"
        ? { operations: [], abnormalities: [{ detail: "咳嗽", quantity: null }] }
        : safeRef === "D04"
          ? { operations: [{ type: "cull", quantity: 2 }], abnormalities: [{ detail: "腳傷", quantity: null }] }
          : { operations: [{ type: "mortality", quantity: 1 }], abnormalities: [] };
      return new Response(JSON.stringify({ success: true, result: { response } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const result = await runAmbientV2_2RealMiniSuite({
        endpoint: "https://example.invalid/accounts/test/ai/run/model",
        token: "mock-token-never-persisted",
        ledgerPath,
        experimentId: "11111111-1111-4111-8111-111111111111",
        matrixRunId: "22222222-2222-4222-8222-222222222222",
        cases,
        fetchImpl,
      });

      expect(callIndex).toBe(AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS);
      expect(result.providerCalls).toBe(AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS);
      expect(result.attempts).toHaveLength(AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS);
      expect(result.summary).toMatchObject({
        status: "PASS_STABILITY",
        totalProviderCalls: 9,
        structuralPasses: 9,
        factPasses: 9,
        technicalFailures: 0,
        extraFactCount: 0,
        peakConcurrency: 1,
        noRetries: true,
        sideEffectFree: true,
      });
      expect(result.summary.caseSummaries).toEqual([
        expect.objectContaining({ safeRef: "D03", runs: 3, factPasses: 3 }),
        expect.objectContaining({ safeRef: "D04", runs: 3, factPasses: 3, attributionUnresolved: 3 }),
        expect.objectContaining({ safeRef: "D07", runs: 3, factPasses: 3 }),
      ]);
      expect(result.ledger).toMatchObject({
        attemptStarts: 9,
        terminalRecords: 9,
        orphanAttempts: 0,
        invalidLineCount: 0,
        processStarted: 1,
        processExited: 1,
      });

      const ledgerText = await readFile(ledgerPath, "utf8");
      expect(ledgerText).not.toContain("咳嗽");
      expect(ledgerText).not.toContain("腳傷");
      expect(ledgerText).not.toContain("金雞測試場");
      expect(ledgerText).not.toContain("mock-token-never-persisted");
      expect(ledgerText).not.toContain("\"source\"");
    } finally {
      await clean(ledgerDirectory);
    }
  });

  it.skipIf(!realEnabled)("executes the fixed real D03/D04/D07 matrix once", async () => {
    const ledgerPath = process.env.AMBIENT_V2_2_REAL_MINI_SUITE_LEDGER_PATH;
    const experimentId = process.env.AMBIENT_V2_2_REAL_MINI_SUITE_EXPERIMENT_ID;
    const matrixRunId = process.env.AMBIENT_V2_2_REAL_MINI_SUITE_MATRIX_RUN_ID;
    const accountId = process.env.AMBIENT_V2_2_REAL_MINI_SUITE_ACCOUNT_ID;
    const auth = discoverAmbientSemanticEvalAuthStatus();
    if (auth.source !== "DEV_SECRETS_LOCAL" || auth.secretFileState !== "AVAILABLE" || !auth.auth
      || !ledgerPath || !experimentId || !matrixRunId || !accountId) {
      console.log("AMBIENT_V2_2_REAL_MINI_SUITE_SAFE_JSON=" + JSON.stringify({
        providerCalls: 0,
        authBlocked: true,
        sideEffectFree: true,
      }));
      return;
    }

    const account = await discoverAmbientSemanticEvalAccountId({
      env: { CLOUDFLARE_ACCOUNT_ID: accountId },
      projectRoot: resolve(import.meta.dirname, ".."),
      auth: auth.auth,
    });
    if (!account.value) {
      console.log("AMBIENT_V2_2_REAL_MINI_SUITE_SAFE_JSON=" + JSON.stringify({
        providerCalls: 0,
        authBlocked: true,
        sideEffectFree: true,
      }));
      return;
    }

    const result = await runAmbientV2_2RealMiniSuite({
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${account.value}/ai/run/${AMBIENT_V2_2_REAL_MINI_SUITE_MODEL}`,
      token: auth.auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      cases: loadMiniCases(),
    });
    console.log("AMBIENT_V2_2_REAL_MINI_SUITE_SAFE_JSON=" + JSON.stringify(result));
    expect(result.providerCalls).toBe(AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS.length * AMBIENT_V2_2_REAL_MINI_SUITE_RUNS);
  }, 30 * 60 * 1000);
});
