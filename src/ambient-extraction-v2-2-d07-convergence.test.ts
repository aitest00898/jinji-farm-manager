import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuthStatus,
} from "./ambient-semantic-eval-auth";
import {
  AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS,
  AMBIENT_V2_2_D07_CONVERGENCE_SMOKE_AI_CASE_REFS,
  runAmbientV2_2D07Convergence,
  type AmbientV2_2DevSmokeFixture,
  type AmbientV2_2DevSmokeFixtureMessage,
} from "./ambient-extraction-v2-2-d07-convergence";
import {
  auditAmbientV2_2PromptContract,
  type AmbientV2_2FactSet,
} from "./ambient-extraction-v2-2";
import type { AmbientV2MessageInput } from "./ambient-extraction-v2";
import type { AmbientV2_2MiniSuiteCase } from "./ambient-extraction-v2-2-real-mini-suite";

interface GroundTruthMessage {
  safe_ref: string;
  role?: "context" | "selected";
  text: string;
  expected: {
    operations: Array<{ type: "mortality" | "cull"; quantity: number | null }>;
    abnormalities: Array<{ detail: string; quantity: number | null }>;
    relation_intent?: { type: string; target_ref: string } | null;
    context_resolution?: "resolved" | "unresolved";
  };
}

interface GroundTruthArtifact {
  dev_smoke_8: {
    selected_refs: string[];
    messages: GroundTruthMessage[];
  };
}

const realEnabled = process.env.AMBIENT_V2_2_D07_CONVERGENCE === "1";

function loadFixture(): AmbientV2_2DevSmokeFixture {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-2-ground-truth-2026-08-28.json"),
    "utf8",
  )) as GroundTruthArtifact;
  const selected = new Set(artifact.dev_smoke_8.selected_refs);
  const messages: AmbientV2_2DevSmokeFixtureMessage[] = artifact.dev_smoke_8.messages.map((fixture, index) => {
    const message: AmbientV2MessageInput = {
      safeRef: fixture.safe_ref,
      sourceIdentity: `v22-smoke-${index + 1}`,
      text: fixture.text,
      selected: selected.has(fixture.safe_ref),
      groupKey: "v22-dev-smoke-8",
    };
    const expected: AmbientV2_2FactSet = {
      operations: fixture.expected.operations,
      abnormalities: fixture.expected.abnormalities,
    };
    return {
      safeRef: fixture.safe_ref,
      message,
      expected,
      ...(fixture.expected.relation_intent?.target_ref ? { relationTargetRef: fixture.expected.relation_intent.target_ref } : {}),
      ...(fixture.expected.context_resolution ? { contextResolution: fixture.expected.context_resolution } : {}),
      ...(fixture.safe_ref === "D04" ? { attribution: { abnormalityQuantities: [null] } } : {}),
    };
  });
  return { messages, selectedRefs: artifact.dev_smoke_8.selected_refs };
}

function loadCases(fixture: AmbientV2_2DevSmokeFixture): AmbientV2_2MiniSuiteCase[] {
  return AMBIENT_V2_2_D07_CONVERGENCE_SMOKE_AI_CASE_REFS.map((safeRef) => {
    const fixtureItem = fixture.messages.find((item) => item.safeRef === safeRef);
    if (!fixtureItem) throw new Error(`V22_D07_FIXTURE_MISSING_${safeRef}`);
    return {
      safeRef,
      message: fixtureItem.message,
      expected: fixtureItem.expected,
      ...(fixtureItem.attribution ? { attribution: fixtureItem.attribution } : {}),
    };
  });
}

function providerResponse(safeRef: string): Record<string, unknown> {
  if (safeRef === "D03") return { operations: [], abnormalities: [{ detail: "咳嗽", quantity: null }] };
  if (safeRef === "D04") return { operations: [], abnormalities: [{ detail: "腳傷", quantity: null }] };
  throw new Error(`UNEXPECTED_PROVIDER_CASE_${safeRef}`);
}

function mockFetch(): typeof fetch {
  let callIndex = 0;
  return async (_input, init) => {
    const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const userContent = body.messages?.find((message) => message.role === "user")?.content ?? "";
    const source = JSON.parse(userContent) as { source?: string };
    const safeRef = source.source?.includes("咳") ? "D03"
      : source.source?.includes("腳傷") ? "D04"
        : "UNEXPECTED";
    callIndex += 1;
    const response = providerResponse(safeRef);
    return new Response(JSON.stringify({ success: true, result: { response } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

async function createOptions(
  fixture: AmbientV2_2DevSmokeFixture,
  ledgerPath: string,
  fetchImpl: typeof fetch,
) {
  return {
    endpoint: "https://example.invalid/accounts/test/ai/run/model",
    token: "mock-token-never-persisted",
    ledgerPath,
    experimentId: "11111111-1111-4111-8111-111111111111",
    matrixRunId: "22222222-2222-4222-8222-222222222222",
    cases: loadCases(fixture),
    smokeFixture: fixture,
    fetchImpl,
  };
}

describe("Ambient V2.2 D07 convergence gate", () => {
  it("proves D07 locally and calls the provider only for residual smoke cases", async () => {
    const fixture = loadFixture();
    const promptAudit = auditAmbientV2_2PromptContract();
    expect(promptAudit.contractMarkers).toBe("PASS");
    expect(promptAudit.ontologyAlignmentRulePresent).toBe(true);
    expect(promptAudit.canonicalExampleCount).toBe(0);

    const directory = await mkdtemp(join(tmpdir(), "ambient-v22-d07-convergence-"));
    const ledgerPath = join(directory, "attempts.jsonl");
    try {
      const result = await runAmbientV2_2D07Convergence(
        await createOptions(fixture, ledgerPath, mockFetch()),
      );
      expect(result.totalProviderCallLimit).toBe(AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS);
      expect(result.totalProviderCalls).toBe(2);
      expect(result.d07).toMatchObject({
        status: "PASS",
        executionMode: "LOCAL_DETERMINISTIC",
        runs: 0,
        providerCalls: 0,
        structuralPasses: 0,
        factPasses: 1,
        technicalFailures: 0,
        extraFactCount: 0,
        wrongCollectionFactCount: 0,
      });
      expect(result.smoke).toMatchObject({
        status: "PASS",
        messagesTotal: 8,
        deterministicResolved: 3,
        aiExtractionRequired: 2,
        relationOnlyMessages: 1,
        relationResolverCalls: 1,
        noEventFastPath: 2,
        providerCalls: 2,
        structuralPasses: 2,
        factPasses: 8,
        semanticEventCountExpected: 6,
        semanticEventCountActual: 6,
        relationCountActual: 1,
        chatContamination: 0,
        wrongCollectionFactCount: 0,
        hallucinatedExtraFactCount: 0,
        duplicateEventCount: 0,
        wrongFarmAssignmentCount: 0,
        d04FactPass: "YES",
        d04AttributionStatus: "UNRESOLVED",
      });
      expect(result.ledger).toMatchObject({
        attemptStarts: 2,
        terminalRecords: 2,
        orphanAttempts: 0,
        invalidLineCount: 0,
        processStarted: 1,
        processExited: 1,
      });
      const ledger = await readFile(ledgerPath, "utf8");
      expect(ledger).not.toContain("金雞測試場");
      expect(ledger).not.toContain("咳嗽");
      expect(ledger).not.toContain("腳傷");
      expect(ledger).not.toContain("mock-token-never-persisted");
      expect(ledger).not.toContain("\"source\"");
      expect(result.attempts.every((attempt) => attempt.safeRef !== "D07")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(!realEnabled)("executes the authorized serial residual smoke", async () => {
    const ledgerPath = process.env.AMBIENT_V2_2_D07_CONVERGENCE_LEDGER_PATH;
    const experimentId = process.env.AMBIENT_V2_2_D07_CONVERGENCE_EXPERIMENT_ID;
    const matrixRunId = process.env.AMBIENT_V2_2_D07_CONVERGENCE_MATRIX_RUN_ID;
    const accountId = process.env.AMBIENT_V2_2_D07_CONVERGENCE_ACCOUNT_ID;
    const auth = discoverAmbientSemanticEvalAuthStatus();
    if (auth.source !== "DEV_SECRETS_LOCAL" || auth.secretFileState !== "AVAILABLE" || !auth.auth
      || !ledgerPath || !experimentId || !matrixRunId || !accountId) {
      console.log("AMBIENT_V2_2_D07_CONVERGENCE_SAFE_JSON=" + JSON.stringify({
        totalProviderCalls: 0,
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
      console.log("AMBIENT_V2_2_D07_CONVERGENCE_SAFE_JSON=" + JSON.stringify({
        totalProviderCalls: 0,
        authBlocked: true,
        sideEffectFree: true,
      }));
      return;
    }
    const fixture = loadFixture();
    const result = await runAmbientV2_2D07Convergence({
      endpoint: process.env.AMBIENT_V2_2_D07_CONVERGENCE_ENDPOINT
        || `https://api.cloudflare.com/client/v4/accounts/${account.value}/ai/run/@cf/meta/llama-3.2-3b-instruct`,
      token: auth.auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      cases: loadCases(fixture),
      smokeFixture: fixture,
    });
    console.log("AMBIENT_V2_2_D07_CONVERGENCE_SAFE_JSON=" + JSON.stringify(result));
    expect(result.totalProviderCalls).toBe(2);
  }, 30 * 60 * 1000);
});
