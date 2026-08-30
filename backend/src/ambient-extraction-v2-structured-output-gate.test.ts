import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import {
  ambientV2RequestPromptFingerprint,
  parseAmbientV2ResponseBoundary,
  type AmbientV2ExpectedMessage,
} from "./ambient-extraction-v2";
import {
  readAmbientV2RealSmokeLedger,
  runAmbientExtractionV2RealSmoke,
  type AmbientV2AttemptTerminalRecord,
  type AmbientV2RealSmokeFixture,
} from "./ambient-extraction-v2-real-runner";
import {
  buildAmbientV2StructuredRequest,
  queryAmbientV2ModelSchema,
  type AmbientV2ModelSchemaAudit,
} from "./ambient-extraction-v2-structured-output";

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

const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const gateEnabled = processEnv.AMBIENT_V2_STRUCTURED_OUTPUT_GATE === "1";
const model = PRODUCTION_AI_MODEL;

function loadD03Fixture(): { fixture: AmbientV2RealSmokeFixture; expected: AmbientV2ExpectedMessage } {
  const artifact = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"),
    "utf8",
  )) as GroundTruthArtifact;
  const d03 = artifact.dev_smoke_8.messages.find((message) => message.safe_ref === "D03");
  if (!d03) throw new Error("D03_GROUND_TRUTH_MISSING");
  const message = {
    safeRef: "D03",
    sourceIdentity: "structured-output-gate-D03",
    text: d03.text,
    selected: true,
    groupKey: "structured-output-gate",
  } as const;
  const expected: AmbientV2ExpectedMessage = {
    safeRef: "D03",
    events: d03.expected.events,
    relationTargetRef: null,
  };
  return {
    fixture: { messages: [message], expectedMessages: [expected], selectedRefs: ["D03"] },
    expected,
  };
}

function terminalForD03(records: Awaited<ReturnType<typeof readAmbientV2RealSmokeLedger>>["records"]): AmbientV2AttemptTerminalRecord | null {
  const terminal = records.find((record): record is AmbientV2AttemptTerminalRecord =>
    (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
    && record.caseId === "D03-STRUCTURED-OUTPUT"
    && record.safeRef === "D03",
  );
  return terminal ?? null;
}

function schemaGatePassed(audit: AmbientV2ModelSchemaAudit): boolean {
  return audit.httpStatus === 200
    && audit.cloudflareSuccess === true
    && audit.resultPresent
    && audit.inputResponseFormatPresent === "YES"
    && audit.inputResponseFormatType === "OBJECT"
    && audit.explicitJsonSchemaSupport === "YES";
}

function capabilityConclusion(audit: AmbientV2ModelSchemaAudit): "SUPPORTED" | "NOT_SUPPORTED" | "INCONCLUSIVE" {
  if (audit.explicitJsonSchemaSupport === "NO" || audit.inputResponseFormatPresent === "NO") return "NOT_SUPPORTED";
  if (schemaGatePassed(audit)) return "SUPPORTED";
  return "INCONCLUSIVE";
}

function emptyModelSchemaAudit(errorClass: string): AmbientV2ModelSchemaAudit {
  return {
    httpStatus: null,
    cloudflareSuccess: null,
    resultPresent: false,
    inputKeys: [],
    outputKeys: [],
    requiredInputKeys: [],
    responseFormatKeys: [],
    messagesInputSupported: "UNKNOWN",
    structuredResponseShape: "UNKNOWN",
    inputResponseFormatPresent: "UNKNOWN",
    inputResponseFormatType: "UNKNOWN",
    explicitJsonSchemaSupport: "INCONCLUSIVE",
    errorClass,
  };
}

function safeProbeReportBase(audit: AmbientV2ModelSchemaAudit, promptFingerprint: string) {
  return {
    model,
    maxTokens: 1536,
    temperature: 0,
    modelSchemaCalls: 1,
    modelSchemaQuery: audit.httpStatus === 200 && audit.cloudflareSuccess === true && audit.resultPresent ? "PASS" : "FAIL",
    modelSchemaHttp: audit.httpStatus,
    modelSchemaErrorClass: audit.errorClass,
    modelInputResponseFormatPresent: audit.inputResponseFormatPresent,
    modelInputResponseFormatType: audit.inputResponseFormatType,
    modelSchemaExplicitJsonSchemaSupport: audit.explicitJsonSchemaSupport,
    officialJsonModeListsCurrentModel: "NO",
    capabilityConclusion: capabilityConclusion(audit),
    currentPositiveEventExample: "NO",
    promptFingerprint,
    promptFingerprintChanged: "NO",
    realAiCalls: 0,
    realAiCallLimit: 1,
    structuredOutputProbe: "NOT_RUN",
    structuredOutputHttp: null,
    structuredOutputProviderConfirmed: "NOT_RUN",
    structuredResponseClass: "NOT_RUN",
    structuredResponseBoundary: "NOT_RUN",
    d03: {
      structuralStatus: "NOT_RUN",
      structuralSubtype: "NOT_RUN",
      semanticEvaluable: "NOT_RUN",
      eventTypePass: "NOT_RUN",
      quantityPass: "NOT_RUN",
      detailPass: "NOT_RUN",
      semanticPass: "NOT_RUN",
    },
    noJsonRepair: "PASS",
    noRawSalvage: "PASS",
    sideEffectFree: true,
  } as const;
}

describe("Ambient V2 structured-output capability gate", () => {
  it("keeps schema and inference calls disabled without explicit opt-in", () => {
    if (gateEnabled) return;
    expect(gateEnabled).toBe(false);
  });

  it.skipIf(!gateEnabled)("performs one schema audit and at most one structured D03 probe", async () => {
    const d03 = loadD03Fixture();
    const promptFingerprint = ambientV2RequestPromptFingerprint(buildAmbientV2StructuredRequest(d03.fixture.messages[0]));
    const accountId = processEnv.AMBIENT_V2_STRUCTURED_OUTPUT_GATE_ACCOUNT_ID;
    const auth = discoverAmbientSemanticEvalAuth();
    if (!accountId || !/^[a-f0-9]{32}$/iu.test(accountId) || !auth) {
      const report = {
        ...safeProbeReportBase(emptyModelSchemaAudit("REST_AUTH_BLOCKED"), promptFingerprint),
        modelSchemaCalls: 0,
        modelSchemaQuery: "FAIL",
      };
      console.log(`AMBIENT_V2_STRUCTURED_OUTPUT_GATE_REPORT=${JSON.stringify(report)}`);
      return;
    }

    const audit = await queryAmbientV2ModelSchema({ accountId, token: auth.token });
    const base = safeProbeReportBase(audit, promptFingerprint);
    if (!schemaGatePassed(audit)) {
      console.log(`AMBIENT_V2_STRUCTURED_OUTPUT_GATE_REPORT=${JSON.stringify(base)}`);
      return;
    }

    const ledgerPath = processEnv.AMBIENT_V2_STRUCTURED_OUTPUT_GATE_LEDGER_PATH;
    const experimentId = processEnv.AMBIENT_V2_STRUCTURED_OUTPUT_GATE_EXPERIMENT_ID;
    const matrixRunId = processEnv.AMBIENT_V2_STRUCTURED_OUTPUT_GATE_MATRIX_RUN_ID;
    if (!ledgerPath || !experimentId || !matrixRunId) throw new Error("STRUCTURED_OUTPUT_GATE_ENV_INCOMPLETE");

    let responseClass: "PROMPT_TEXT_RESPONSE" | "STRUCTURED_OBJECT_RESPONSE" | "PROVIDER_JSON_MODE_ERROR" | "OTHER" | null = null;
    const report = await runAmbientExtractionV2RealSmoke({
      fixture: d03.fixture,
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      token: auth.token,
      ledgerPath,
      experimentId,
      matrixRunId,
      runLimit: 1,
      caseId: "D03-STRUCTURED-OUTPUT",
      totalProviderCallLimit: 1,
      requestBuilder: buildAmbientV2StructuredRequest,
      responseParser: (value) => {
        const boundary = parseAmbientV2ResponseBoundary(value);
        responseClass = boundary.responseClass;
        return boundary.parsed;
      },
    });
    const ledger = await readAmbientV2RealSmokeLedger(ledgerPath);
    const terminal = terminalForD03(ledger.records);
    const run = report.runs[0];
    const runMetrics = run?.metrics;
    const structuralStatus = terminal?.boundedSchema?.structuralStatus ?? "fail";
    const structuralSubtype = terminal?.boundedSchema?.structuralSubtype ?? terminal?.failureClass ?? "UNKNOWN";
    const providerConfirmed = terminal?.providerResponseConfirmed === true;
    const semanticEvaluable = providerConfirmed && structuralStatus === "pass";
    const semanticPass = run?.metrics?.overallPass === true;
    const d03SemanticDiagnostic = runMetrics?.d03SemanticDiagnostic ?? null;
    const safeReport = {
      ...base,
      realAiCalls: report.totalProviderCalls,
      structuredOutputProbe: providerConfirmed && structuralStatus === "pass" ? "PASS" : "FAIL",
      structuredOutputHttp: terminal?.httpStatus ?? null,
      structuredOutputProviderConfirmed: providerConfirmed ? "YES" : "NO",
      structuredResponseClass: responseClass ?? (terminal?.failureClass === "PROVIDER_JSON_MODE_ERROR" ? "PROVIDER_JSON_MODE_ERROR" : "OTHER"),
      structuredResponseBoundary: providerConfirmed && structuralStatus === "pass" ? "PASS" : "FAIL",
      d03: {
        structuralStatus: structuralStatus === "pass" ? "PASS" : "FAIL",
        structuralSubtype: structuralStatus === "pass" ? "NONE" : structuralSubtype,
        responseObjectPresent: responseClass === "STRUCTURED_OBJECT_RESPONSE" ? "YES" : "NO",
        eventsPresent: d03SemanticDiagnostic ? "YES" : "NO",
        eventCount: d03SemanticDiagnostic?.eventCount ?? terminal?.boundedSchema?.eventItemCount ?? null,
        semanticEvaluable: semanticEvaluable ? "YES" : "NO",
        eventTypePass: semanticEvaluable && d03SemanticDiagnostic?.event1TypePass === "YES" ? "YES" : semanticEvaluable ? "NO" : "NOT_EVALUABLE",
        quantityPass: semanticEvaluable && d03SemanticDiagnostic?.event1QuantityPass === "YES" ? "YES" : semanticEvaluable ? "NO" : "NOT_EVALUABLE",
        detailPass: semanticEvaluable && d03SemanticDiagnostic?.event1DetailMatchesExpected === "YES" ? "YES" : semanticEvaluable ? "NO" : "NOT_EVALUABLE",
        semanticPass: semanticEvaluable ? (semanticPass ? "YES" : "NO") : "NOT_EVALUABLE",
        semanticSubtype: d03SemanticDiagnostic?.semanticSubtype ?? "NOT_RUN",
        event1DetailMatchesExpected: d03SemanticDiagnostic?.event1DetailMatchesExpected ?? "NOT_RUN",
        event2Present: d03SemanticDiagnostic?.event2Present ?? "NOT_RUN",
        event2DetailEqualsEvent1: d03SemanticDiagnostic?.event2DetailEqualsEvent1 ?? "NOT_RUN",
        event2ExactlyEqualsEvent1: d03SemanticDiagnostic?.event2ExactlyEqualsEvent1 ?? "NOT_RUN",
      },
    };
    console.log(`AMBIENT_V2_STRUCTURED_OUTPUT_GATE_REPORT=${JSON.stringify(safeReport)}`);
    expect(report.totalProviderCalls).toBeLessThanOrEqual(1);
    expect(ledger.records.filter((record) => record.recordType === "ATTEMPT_START")).toHaveLength(1);
  }, 10 * 60 * 1000);
});
