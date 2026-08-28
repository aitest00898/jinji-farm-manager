import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import {
  AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
  AMBIENT_V2_2_SYSTEM_PROMPT,
  type AmbientV2_2FactSet,
} from "./ambient-extraction-v2-2";
import {
  AMBIENT_V2_2_REAL_D04_ATTRIBUTION,
  AMBIENT_V2_2_REAL_D04_CASE_ID,
  AMBIENT_V2_2_REAL_D04_MAX_CALLS,
  AMBIENT_V2_2_REAL_D04_MAX_TOKENS,
  AMBIENT_V2_2_REAL_D04_MODEL,
  AMBIENT_V2_2_REAL_D04_TEMPERATURE,
  buildAmbientV2_2RealD04Request,
  runAmbientV2_2D04RealCall,
} from "./ambient-extraction-v2-2-real-d04";
import { readAmbientV2RealSmokeLedger } from "./ambient-extraction-v2-real-runner";
import type { AmbientV2MessageInput } from "./ambient-extraction-v2";

interface GroundTruthArtifact {
  dev_smoke_8: {
    messages: Array<{
      safe_ref: string;
      text: string;
      expected: {
        operations: Array<{ type: "mortality" | "cull"; quantity: number | null }>;
        abnormalities: Array<{ detail: string; quantity: number | null }>;
      };
    }>;
  };
}

const realEnabled = process.env.AMBIENT_V2_2_REAL_D04 === "1";

function loadD04(): { message: AmbientV2MessageInput; expected: AmbientV2_2FactSet } {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-2-ground-truth-2026-08-28.json"),
    "utf8",
  )) as GroundTruthArtifact;
  const d04 = artifact.dev_smoke_8.messages.find((message) => message.safe_ref === "D04");
  if (!d04) throw new Error("V22_D04_GROUND_TRUTH_MISSING");
  return {
    message: {
      safeRef: "D04",
      sourceIdentity: "v22-real-d04-fixture",
      text: d04.text,
      selected: true,
      groupKey: "v22-real-d04",
    },
    expected: {
      operations: d04.expected.operations,
      abnormalities: d04.expected.abnormalities,
    },
  };
}

async function mockCall(response: unknown, options: {
  expected?: AmbientV2_2FactSet;
  attribution?: { abnormalityQuantities: readonly (number | null)[] };
  status?: number;
} = {}) {
  const { message, expected: groundTruthExpected } = loadD04();
  const ledgerDirectory = await mkdtemp(join(tmpdir(), "ambient-v22-d04-"));
  const ledgerPath = join(ledgerDirectory, "attempts.jsonl");
  const calls: Array<{ body: Record<string, unknown>; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const headers = new Headers(init?.headers);
    calls.push({
      body,
      authorization: headers.get("authorization"),
    });
    return new Response(JSON.stringify(response), {
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await runAmbientV2_2D04RealCall({
    endpoint: "https://example.invalid/accounts/test/ai/run/model",
    token: "mock-token-never-persisted",
    ledgerPath,
    experimentId: "11111111-1111-4111-8111-111111111111",
    matrixRunId: "22222222-2222-4222-8222-222222222222",
    message,
    expected: options.expected ?? groundTruthExpected,
    attribution: options.attribution ?? AMBIENT_V2_2_REAL_D04_ATTRIBUTION,
    fetchImpl,
  });
  return { result, calls, ledgerPath, ledgerDirectory, message, expected: options.expected ?? groundTruthExpected };
}

async function clean(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

describe("Ambient V2.2 one-call D04 fact gate", () => {
  it("builds the exact pinned structured request without changing the prompt", () => {
    const { message } = loadD04();
    const request = buildAmbientV2_2RealD04Request(message);
    expect(request.max_tokens).toBe(AMBIENT_V2_2_REAL_D04_MAX_TOKENS);
    expect(request.temperature).toBe(AMBIENT_V2_2_REAL_D04_TEMPERATURE);
    expect(request.stream).toBe(false);
    expect(request.response_format).toEqual(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
    expect(request.messages[0]?.content).toBe(AMBIENT_V2_2_SYSTEM_PROMPT);
    expect(request.messages).toHaveLength(2);
  });

  it("sends the structured request settings and records fact PASS separately from attribution UNRESOLVED", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: [{ detail: "腳傷", quantity: null }],
        },
      },
    });
    try {
      expect(run.calls).toHaveLength(1);
      expect(run.calls[0]?.body.max_tokens).toBe(1536);
      expect(run.calls[0]?.body.temperature).toBe(0);
      expect(run.calls[0]?.body.stream).toBe(false);
      expect(run.calls[0]?.body.response_format).toEqual(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
      expect(run.result).toMatchObject({
        providerCalls: 1,
        httpStatus: 200,
        providerResponseConfirmed: true,
        terminalRecordType: "ATTEMPT_SUCCESS",
        evidence: {
          responseClass: "STRUCTURED_OBJECT_RESPONSE",
          structuralStatus: "PASS",
          operationFactPass: "YES",
          abnormalityFactPass: "YES",
          factExtractionPass: "YES",
          quantityAttributionStatus: "UNRESOLVED",
          failureClass: "NONE",
        },
      });
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("keeps a numeric abnormality quantity as fact PASS and attribution PASS", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: [{ detail: "腳傷", quantity: 2 }],
        },
      },
    });
    try {
      expect(run.result.evidence.factExtractionPass).toBe("YES");
      expect(run.result.evidence.quantityAttributionStatus).toBe("PASS");
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("keeps a wrong abnormality quantity as fact PASS and attribution FAIL", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: [{ detail: "腳傷", quantity: 3 }],
        },
      },
    });
    try {
      expect(run.result.evidence.factExtractionPass).toBe("YES");
      expect(run.result.evidence.quantityAttributionStatus).toBe("FAIL");
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("does not evaluate attribution when the abnormality fact is missing", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: [],
        },
      },
    });
    try {
      expect(run.result.evidence).toMatchObject({
        structuralStatus: "PASS",
        operationFactPass: "YES",
        abnormalityFactPass: "NO",
        factExtractionPass: "NO",
        quantityAttributionStatus: "NOT_EVALUATED",
        failureClass: "FACT_EXTRACTION",
      });
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("keeps structural failure outside semantic fact evaluation", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: {},
        },
      },
    });
    try {
      expect(run.result.evidence).toMatchObject({
        responseClass: "STRUCTURED_OBJECT_RESPONSE",
        structuralStatus: "FAIL",
        structuralSubtype: "ABNORMALITIES_NOT_ARRAY",
        factExtractionPass: "NOT_EVALUATED",
        quantityAttributionStatus: "NOT_EVALUATED",
        failureClass: "STRUCTURAL",
      });
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("keeps provider failure outside semantic fact evaluation", async () => {
    const run = await mockCall({
      success: false,
      errors: [{ code: 4000, message: "json_schema response unavailable" }],
    });
    try {
      expect(run.result).toMatchObject({
        providerCalls: 1,
        httpStatus: 200,
        providerResponseConfirmed: false,
        evidence: {
          responseClass: "PROVIDER_JSON_MODE_ERROR",
          structuralStatus: "NOT_RUN",
          factExtractionPass: "NOT_EVALUATED",
          quantityAttributionStatus: "NOT_EVALUATED",
          failureClass: "TRANSPORT",
        },
      });
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("persists only bounded evidence and never raw source, detail, prompt, or credential", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: [{ detail: "腳傷", quantity: null }],
        },
      },
    });
    try {
      const ledgerText = await readFile(run.ledgerPath, "utf8");
      expect(ledgerText).not.toContain(run.message.text);
      expect(ledgerText).not.toContain("腳傷");
      expect(ledgerText).not.toContain(AMBIENT_V2_2_SYSTEM_PROMPT);
      expect(ledgerText).not.toContain("mock-token-never-persisted");
      expect(ledgerText).not.toContain("sourceText");
      expect(ledgerText).not.toContain("completionText");
      expect(ledgerText).not.toContain("messageContent");
      expect(ledgerText).toContain("boundedV22");
      const parsed = await readAmbientV2RealSmokeLedger(run.ledgerPath);
      expect(parsed.invalidLineCount).toBe(0);
      expect(parsed.records.filter((record) => record.recordType === "ATTEMPT_START")).toHaveLength(1);
      expect(parsed.records.filter((record) => record.recordType === "ATTEMPT_SUCCESS")).toHaveLength(1);
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it("enforces the one-call ledger limit without invoking the provider again", async () => {
    const run = await mockCall({
      success: true,
      result: {
        response: {
          operations: [{ type: "cull", quantity: 2 }],
          abnormalities: [{ detail: "腳傷", quantity: null }],
        },
      },
    });
    try {
      await expect(runAmbientV2_2D04RealCall({
        endpoint: "https://example.invalid/accounts/test/ai/run/model",
        token: "mock-token-never-persisted",
        ledgerPath: run.ledgerPath,
        experimentId: "11111111-1111-4111-8111-111111111111",
        matrixRunId: "22222222-2222-4222-8222-222222222222",
        message: run.message,
        expected: run.expected,
        fetchImpl: async () => new Response("should-not-run", { status: 500 }),
      })).rejects.toThrow("V2_2_D04_CALL_LIMIT_EXCEEDED");
      expect(run.calls).toHaveLength(1);
      expect(AMBIENT_V2_2_REAL_D04_MAX_CALLS).toBe(1);
    } finally {
      await clean(run.ledgerDirectory);
    }
  });

  it.skipIf(!realEnabled)("executes the single real D04 fact extraction call", async () => {
    const accountId = process.env.AMBIENT_V2_2_REAL_D04_ACCOUNT_ID;
    const ledgerPath = process.env.AMBIENT_V2_2_REAL_D04_LEDGER_PATH;
    const experimentId = process.env.AMBIENT_V2_2_REAL_D04_EXPERIMENT_ID;
    const matrixRunId = process.env.AMBIENT_V2_2_REAL_D04_MATRIX_RUN_ID;
    const auth = discoverAmbientSemanticEvalAuth();
    if (!accountId || !ledgerPath || !experimentId || !matrixRunId || !auth) {
      console.log("AMBIENT_V2_2_REAL_D04_SAFE_JSON=" + JSON.stringify({
        providerCalls: 0,
        authBlocked: true,
        sideEffectFree: true,
      }));
      return;
    }
    const { message, expected } = loadD04();
    const result = await runAmbientV2_2D04RealCall({
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${AMBIENT_V2_2_REAL_D04_MODEL}`,
      token: auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      message,
      expected,
    });
    console.log("AMBIENT_V2_2_REAL_D04_SAFE_JSON=" + JSON.stringify(result));
    expect(result.providerCalls).toBe(1);
  }, 10 * 60 * 1000);
});
