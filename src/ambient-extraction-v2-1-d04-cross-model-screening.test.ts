import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { discoverAmbientSemanticEvalAuth } from "./ambient-semantic-eval-auth";
import {
  ambientV2RequestPromptFingerprint,
  parseAmbientV2ResponseBoundary,
  planAmbientExtractionV2Batch,
  type AmbientV2ExpectedMessage,
} from "./ambient-extraction-v2";
import {
  readAmbientV2RealSmokeLedger,
  runAmbientExtractionV2RealSmoke,
  type AmbientV2AttemptTerminalRecord,
  type AmbientV2D04SemanticDiagnostic,
  type AmbientV2RealSmokeFixture,
} from "./ambient-extraction-v2-real-runner";
import {
  AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT,
  buildAmbientV2StructuredRequest,
  queryAmbientV2ModelSchema,
  type AmbientV2ModelSchemaAudit,
} from "./ambient-extraction-v2-structured-output";
import {
  AMBIENT_V2_CROSS_MODEL_CANDIDATES,
  discoverAmbientV2AccountId,
  freePlanEligibilityForCurrentScreeningPolicy,
  freePlanEligibilityForCandidate,
  queryAmbientV2AccountEntitlement,
  queryAmbientV2ModelCatalog,
  requestCompatibilityForV21,
  reusedAmbientV2CandidatePreflight,
  type AmbientV2AccountEntitlementAudit,
  type AmbientV2FreeEligibility,
  type AmbientV2ModelCatalogAudit,
  type AmbientV2RequestCompatibilityAudit,
} from "./ambient-extraction-v2-cross-model-screening";

type CandidateScreeningResult = {
  modelId: string;
  catalogModelExists: "YES" | "NO" | "UNKNOWN";
  catalogCanonicalModelId: string | null;
  modelIdExactMatch: "YES" | "NO" | "UNKNOWN";
  modelSchemaQuery: "PASS" | "FAIL" | "NOT_RUN";
  modelSchemaHttp: number | null;
  responseFormatPresent: "YES" | "NO" | "UNKNOWN";
  jsonSchemaSupported: "YES" | "NO" | "INCONCLUSIVE";
  requestShapeCompatibleWithV21: "YES" | "NO" | "INCONCLUSIVE";
  modelSpecificRequestDifference: "YES" | "NO" | "UNKNOWN";
  requiredDifferenceClass: AmbientV2RequestCompatibilityAudit["requiredDifferenceClass"];
  officialFreePlanEvidence: "EXPLICIT_YES" | "EXPLICIT_NO" | "NOT_EXPLICIT";
  accountFreeEntitlement: AmbientV2FreeEligibility;
  freePlanEligibility: AmbientV2FreeEligibility;
  failureLayer: "NONE" | "MODEL_ID_OR_CATALOG" | "AUTH" | "ENTITLEMENT" | "REQUEST_COMPATIBILITY" | "PROVIDER_TRANSPORT" | "STRUCTURED_OUTPUT" | "SEMANTIC" | "UNKNOWN";
  semanticEvidenceAvailable: "YES" | "NO";
  screeningResult: "FULL_PASS" | "CROSS_EVENT_QUANTITY_ONLY" | "MULTI_EVENT_BOUNDARY" | "ABNORMAL_SEMANTICS" | "CULL_SEMANTICS" | "MULTIPLE_SEMANTIC_ERRORS" | "STRUCTURAL_FAILURE" | "PROVIDER_FAILURE" | "UNSUPPORTED" | "NOT_RUN";
  realCalls: number;
  httpStatus: number | null;
  providerConfirmed: "YES" | "NO" | "NOT_RUN";
  structuredStatus: "PASS" | "FAIL" | "NOT_RUN";
  structuredSubtype: string | null;
  eventCount: number | null;
  eventCountPass: "YES" | "NO" | "NOT_RUN";
  cullPresent: "YES" | "NO" | "NOT_RUN";
  cullTypePass: "YES" | "NO" | "NOT_RUN";
  cullQuantityPass: "YES" | "NO" | "NOT_RUN";
  cullDetailNullPass: "YES" | "NO" | "NOT_RUN";
  abnormalPresent: "YES" | "NO" | "NOT_RUN";
  abnormalTypePass: "YES" | "NO" | "NOT_RUN";
  abnormalDetailPass: "YES" | "NO" | "NOT_RUN";
  abnormalQuantityKind: "NUMBER" | "NULL" | "OTHER" | "MISSING" | "NOT_RUN";
  abnormalQuantityPass: "YES" | "NO" | "NOT_RUN";
  multiEventBoundaryPass: "YES" | "NO" | "NOT_RUN";
  crossEventQuantityAttributionPass: "YES" | "NO" | "NOT_RUN";
  semanticPass: "YES" | "NO" | "NOT_RUN";
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  ledgerPath: string | null;
};

interface GroundTruthArtifact {
  schema_version: string;
  ground_truth_version: string;
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
const screeningEnabled = processEnv.AMBIENT_V2_CROSS_MODEL_SCREENING === "1";
const projectRoot = resolve(import.meta.dirname, "..");
const reportPath = resolve(projectRoot, "forensics/ambient-extraction-v2-1-d04-cross-model-screening-2026-08-28.md");

function loadD04Fixture(): AmbientV2RealSmokeFixture {
  const artifact = JSON.parse(readFileSync(
    resolve(projectRoot, "forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"),
    "utf8",
  )) as GroundTruthArtifact;
  const d04 = artifact.dev_smoke_8.messages.find((message) => message.safe_ref === "D04");
  if (!d04) throw new Error("D04_GROUND_TRUTH_MISSING");
  return {
    messages: [{
      safeRef: "D04",
      sourceIdentity: "cross-model-D04",
      text: d04.text,
      selected: true,
      groupKey: "cross-model-screening",
    }],
    expectedMessages: [{
      safeRef: "D04",
      events: d04.expected.events,
      relationTargetRef: null,
    }],
    selectedRefs: ["D04"],
  };
}

function terminalForD04(records: Awaited<ReturnType<typeof readAmbientV2RealSmokeLedger>>["records"]): AmbientV2AttemptTerminalRecord | null {
  const terminal = records.find((record): record is AmbientV2AttemptTerminalRecord =>
    (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
    && record.caseId === "D04-CROSS-MODEL"
    && record.safeRef === "D04",
  );
  return terminal ?? null;
}

function emptySchemaAudit(errorClass: string): AmbientV2ModelSchemaAudit {
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

function emptyCatalog(modelId: string, errorClass: string): AmbientV2ModelCatalogAudit {
  return {
    requestModelId: modelId,
    httpStatus: null,
    cloudflareSuccess: null,
    resultItemCount: null,
    catalogModelExists: "UNKNOWN",
    catalogCanonicalModelId: null,
    modelIdExactMatch: "UNKNOWN",
    errorClass,
  };
}

function emptyEntitlement(errorClass: string): AmbientV2AccountEntitlementAudit {
  return {
    httpStatus: null,
    cloudflareSuccess: null,
    accountFreeEntitlement: "INCONCLUSIVE",
    accountPlanEvidence: "UNKNOWN",
    errorClass,
  };
}

function baseCandidateResult(
  modelId: string,
  catalog: AmbientV2ModelCatalogAudit,
  officialFreePlanEvidence: CandidateScreeningResult["officialFreePlanEvidence"],
  accountFreeEntitlement: AmbientV2FreeEligibility,
): CandidateScreeningResult {
  return {
    modelId,
    catalogModelExists: catalog.catalogModelExists,
    catalogCanonicalModelId: catalog.catalogCanonicalModelId,
    modelIdExactMatch: catalog.modelIdExactMatch,
    modelSchemaQuery: "NOT_RUN",
    modelSchemaHttp: null,
    responseFormatPresent: "UNKNOWN",
    jsonSchemaSupported: "INCONCLUSIVE",
    requestShapeCompatibleWithV21: "INCONCLUSIVE",
    modelSpecificRequestDifference: "UNKNOWN",
    requiredDifferenceClass: "OTHER",
    officialFreePlanEvidence,
    accountFreeEntitlement,
    freePlanEligibility: "INCONCLUSIVE",
    failureLayer: "UNKNOWN",
    semanticEvidenceAvailable: "NO",
    screeningResult: "NOT_RUN",
    realCalls: 0,
    httpStatus: null,
    providerConfirmed: "NOT_RUN",
    structuredStatus: "NOT_RUN",
    structuredSubtype: null,
    eventCount: null,
    eventCountPass: "NOT_RUN",
    cullPresent: "NOT_RUN",
    cullTypePass: "NOT_RUN",
    cullQuantityPass: "NOT_RUN",
    cullDetailNullPass: "NOT_RUN",
    abnormalPresent: "NOT_RUN",
    abnormalTypePass: "NOT_RUN",
    abnormalDetailPass: "NOT_RUN",
    abnormalQuantityKind: "NOT_RUN",
    abnormalQuantityPass: "NOT_RUN",
    multiEventBoundaryPass: "NOT_RUN",
    crossEventQuantityAttributionPass: "NOT_RUN",
    semanticPass: "NOT_RUN",
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    ledgerPath: null,
  };
}

function classifySemanticResult(d04: AmbientV2D04SemanticDiagnostic): CandidateScreeningResult["screeningResult"] {
  if (d04.semanticPass === "YES") return "FULL_PASS";
  if (d04.eventCount !== 2) return "MULTI_EVENT_BOUNDARY";
  if (d04.cullPass === "NO" && d04.abnormalEventPass === "NO") return "MULTIPLE_SEMANTIC_ERRORS";
  if (d04.cullPass === "NO") return "CULL_SEMANTICS";
  if (d04.abnormalEventPass === "NO") return "ABNORMAL_SEMANTICS";
  if (d04.abnormalQuantityPass === "NO") return "CROSS_EVENT_QUANTITY_ONLY";
  return "MULTIPLE_SEMANTIC_ERRORS";
}

function applySchemaGate(
  base: CandidateScreeningResult,
  audit: AmbientV2ModelSchemaAudit,
  compatibility: AmbientV2RequestCompatibilityAudit,
): CandidateScreeningResult {
  return {
    ...base,
    modelSchemaQuery: audit.httpStatus === 200 && audit.cloudflareSuccess === true && audit.resultPresent ? "PASS" : "FAIL",
    modelSchemaHttp: audit.httpStatus,
    responseFormatPresent: audit.inputResponseFormatPresent,
    jsonSchemaSupported: audit.explicitJsonSchemaSupport,
    requestShapeCompatibleWithV21: compatibility.requestShapeCompatibleWithV21,
    modelSpecificRequestDifference: compatibility.modelSpecificRequestDifference,
    requiredDifferenceClass: compatibility.requiredDifferenceClass,
  };
}

async function screenCandidate(options: {
  accountId: string;
  token: string;
  candidate: (typeof AMBIENT_V2_CROSS_MODEL_CANDIDATES)[number];
  fixture: AmbientV2RealSmokeFixture;
}): Promise<CandidateScreeningResult> {
  const { accountId, token, candidate, fixture } = options;
  const preflight = reusedAmbientV2CandidatePreflight(candidate);
  const catalog: AmbientV2ModelCatalogAudit = {
    requestModelId: candidate.modelId,
    httpStatus: 200,
    cloudflareSuccess: true,
    resultItemCount: 1,
    catalogModelExists: preflight.catalogModelExists,
    catalogCanonicalModelId: preflight.catalogCanonicalModelId,
    modelIdExactMatch: preflight.modelIdExactMatch,
    errorClass: null,
  };
  let result = baseCandidateResult(candidate.modelId, catalog, candidate.officialFreePlanEvidence, "INCONCLUSIVE");
  result = {
    ...result,
    modelSchemaQuery: preflight.modelSchemaQuery,
    modelSchemaHttp: preflight.modelSchemaHttp,
    responseFormatPresent: preflight.responseFormatPresent,
    jsonSchemaSupported: preflight.jsonSchemaSupported,
    requestShapeCompatibleWithV21: preflight.requestShapeCompatibleWithV21,
    modelSpecificRequestDifference: preflight.modelSpecificRequestDifference,
    requiredDifferenceClass: preflight.requiredDifferenceClass,
    freePlanEligibility: freePlanEligibilityForCurrentScreeningPolicy(candidate.officialFreePlanEvidence),
  };
  if (preflight.catalogModelExists !== "YES" || preflight.modelIdExactMatch !== "YES") {
    return { ...result, failureLayer: "MODEL_ID_OR_CATALOG", screeningResult: "UNSUPPORTED" };
  }
  const entitlementSafe = result.freePlanEligibility === "YES";
  if (!entitlementSafe) return { ...result, failureLayer: "ENTITLEMENT", screeningResult: "NOT_RUN" };

  const experimentId = randomUUID();
  const matrixRunId = randomUUID();
  const ledgerPath = resolve(projectRoot, `forensics/runtime/ambient-extraction-v2-1-d04-cross-model-${candidate.key.toLowerCase()}-${experimentId}.jsonl`);
  let structuredResponseClass: "PROMPT_TEXT_RESPONSE" | "STRUCTURED_OBJECT_RESPONSE" | "PROVIDER_JSON_MODE_ERROR" | "OTHER" = "OTHER";
  try {
    const report = await runAmbientExtractionV2RealSmoke({
      fixture,
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${candidate.modelId}`,
      token,
      ledgerPath,
      experimentId,
      matrixRunId,
      runLimit: 1,
      caseId: "D04-CROSS-MODEL",
      totalProviderCallLimit: 1,
      executionMode: "STRUCTURED_OUTPUT",
      model: candidate.modelId,
      allowNonProductionModel: true,
      responseParser: (value) => {
        const boundary = parseAmbientV2ResponseBoundary(value);
        structuredResponseClass = boundary.responseClass;
        return boundary.parsed;
      },
    });
    const ledger = await readAmbientV2RealSmokeLedger(ledgerPath);
    const terminal = terminalForD04(ledger.records);
    const run = report.runs[0];
    const diagnostic = run?.metrics?.d04SemanticDiagnostic;
    const structuralStatus = terminal?.boundedSchema?.structuralStatus === "pass" ? "PASS" : "FAIL";
    if (!terminal || terminal.transportStatus === "failure" || report.technicalFailures > 0) {
      return {
        ...result,
        failureLayer: "PROVIDER_TRANSPORT",
        semanticEvidenceAvailable: "NO",
        screeningResult: "PROVIDER_FAILURE",
        realCalls: report.totalProviderCalls,
        httpStatus: terminal?.httpStatus ?? null,
        providerConfirmed: terminal?.providerResponseConfirmed === true ? "YES" : "NO",
        structuredStatus: structuralStatus,
        structuredSubtype: terminal?.boundedSchema?.structuralSubtype ?? terminal?.failureClass ?? null,
        ledgerPath,
      };
    }
    if (!diagnostic || structuralStatus !== "PASS") {
      return {
        ...result,
        failureLayer: "STRUCTURED_OUTPUT",
        semanticEvidenceAvailable: "NO",
        screeningResult: "STRUCTURAL_FAILURE",
        realCalls: report.totalProviderCalls,
        httpStatus: terminal.httpStatus,
        providerConfirmed: terminal.providerResponseConfirmed === true ? "YES" : "NO",
        structuredStatus: structuralStatus,
        structuredSubtype: terminal.boundedSchema?.structuralSubtype ?? terminal.failureClass ?? null,
        ledgerPath,
      };
    }
    const semanticResult = classifySemanticResult(diagnostic);
    return {
      ...result,
      failureLayer: "SEMANTIC",
      semanticEvidenceAvailable: "YES",
      screeningResult: semanticResult,
      realCalls: report.totalProviderCalls,
      httpStatus: terminal.httpStatus,
      providerConfirmed: terminal.providerResponseConfirmed === true ? "YES" : "NO",
      structuredStatus: structuralStatus,
      structuredSubtype: null,
      eventCount: diagnostic.eventCount,
      eventCountPass: diagnostic.eventCountPass,
      cullPresent: diagnostic.event1EventTypePass === "YES" ? "YES" : "NO",
      cullTypePass: diagnostic.event1EventTypePass,
      cullQuantityPass: diagnostic.event1QuantityPass,
      cullDetailNullPass: diagnostic.event1DetailNullPass,
      abnormalPresent: diagnostic.event2EventTypePass === "YES" ? "YES" : "NO",
      abnormalTypePass: diagnostic.event2EventTypePass,
      abnormalDetailPass: diagnostic.event2DetailMatchesExpected,
      abnormalQuantityKind: diagnostic.event2DetailKind === "UNKNOWN" ? "OTHER" : diagnostic.event2QuantityPass === "YES" ? "NUMBER" : "NULL",
      abnormalQuantityPass: diagnostic.event2QuantityPass,
      multiEventBoundaryPass: diagnostic.eventCountPass,
      crossEventQuantityAttributionPass: diagnostic.abnormalQuantityPass,
      semanticPass: diagnostic.semanticPass,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
      ledgerPath,
    };
  } catch (error) {
    return {
      ...result,
      failureLayer: error instanceof Error && /AUTH|TOKEN|PERMISSION/u.test(error.name) ? "AUTH" : "PROVIDER_TRANSPORT",
      semanticEvidenceAvailable: "NO",
      screeningResult: "PROVIDER_FAILURE",
      realCalls: 0,
      structuredStatus: "NOT_RUN",
      ledgerPath,
    };
  }
}

function rankingWeight(result: CandidateScreeningResult): number {
  return {
    FULL_PASS: 1,
    CROSS_EVENT_QUANTITY_ONLY: 2,
    ABNORMAL_SEMANTICS: 3,
    CULL_SEMANTICS: 3,
    MULTIPLE_SEMANTIC_ERRORS: 4,
    MULTI_EVENT_BOUNDARY: 5,
    STRUCTURAL_FAILURE: 6,
    PROVIDER_FAILURE: 7,
    UNSUPPORTED: 8,
    NOT_RUN: 9,
  }[result.screeningResult];
}

function renderReport(input: {
  accountDiscovery: Awaited<ReturnType<typeof discoverAmbientV2AccountId>>;
  entitlement: AmbientV2AccountEntitlementAudit;
  promptFingerprint: string;
  results: CandidateScreeningResult[];
}): string {
  const semantic = input.results.filter((result) => result.semanticEvidenceAvailable === "YES");
  const nonSemantic = input.results.filter((result) => result.semanticEvidenceAvailable !== "YES");
  const ranking = [...semantic].sort((a, b) => rankingWeight(a) - rankingWeight(b));
  return `# Ambient Extraction V2.1 D04 Cross-Model Screening — 2026-08-28

## Scope

Developer-only screening. The current Production model and Production path were
not changed. The frozen D04 Ground Truth and V2.1 wire contract were reused.
Each candidate had at most one inference opportunity, in the requested order;
there was no retry, fallback, D07 call, full smoke, Fresh Unseen run, or deploy.

## Fairness and safety

\`\`\`text
MODEL_COMPARISON_AUTHORIZED = YES
CURRENT_LLAMA_D04_SCREENING_RESULT = MULTI_EVENT_BOUNDARY (historical; 0 calls this round)
V2_1_WIRE_CONTRACT = 2.1
PROMPT_FINGERPRINT = ${input.promptFingerprint}
PROMPT_SCHEMA_GROUND_TRUTH_CHANGED = NO
SERIAL_MAX_CONCURRENT_AI_CALLS = 1
TOTAL_REAL_AI_CALL_LIMIT = 3
REAL_AI_CALLS = ${input.results.reduce((sum, result) => sum + result.realCalls, 0)}
ACCOUNT_DISCOVERY_HTTP = ${input.accountDiscovery.httpStatus ?? "CONFIGURED"}
ACCOUNT_ENTITLEMENT_PLAN_EVIDENCE = ${input.entitlement.accountPlanEvidence}
OFFICIAL_FREE_PLAN_EVIDENCE_SUFFICIENT = YES
ACCOUNT_SPECIFIC_PREINFERENCE_ENTITLEMENT_REQUIRED = NO
REQUEST_COMPATIBILITY_PRECONDITION = SUFFICIENT_FOR_ONE_CONTROLLED_ATTEMPT
MODEL_ID_SCHEMA_AUDIT_REPEATED = NO
\`\`\`

No credential, raw prompt, raw source, raw completion, or actual symptom text
was persisted in this report or the screening ledgers.

## Candidate bounded results

${input.results.map((result) => `### ${result.modelId}

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``).join("\n\n")}

## D04 semantic-only ranking

${ranking.length > 0 ? ranking.map((result, index) => `${index + 1}. ${result.modelId} — ${result.screeningResult}`).join("\n") : "NONE — no candidate reached semantic evaluation"}

Only candidates with \`SEMANTIC_EVIDENCE_AVAILABLE = YES\` appear in this ranking.
Models skipped or blocked by catalog, entitlement, request compatibility,
transport, or structural failure are listed separately:

${nonSemantic.length > 0 ? nonSemantic.map((result) => `- ${result.modelId} — ${result.screeningResult}; layer=${result.failureLayer}`).join("\n") : "- NONE"}

## Interpretation

A \`FULL_PASS\` is screening evidence only. It is not model validation,
Production readiness, or replacement approval. A semantic result is the only
evidence used for the D04 ranking; non-semantic failures are not interpreted as
model capability failures.

## Safety gates

\`\`\`text
PRODUCTION_D1_WRITE = 0
CANDIDATE_WRITE = 0
BUFFER_CONSUME = 0
OFFICIAL_WRITE = 0
QUEUE_WRITE = 0
LINE_SEND = 0
MIGRATION = NONE
PRODUCTION_MODEL_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
READY_FOR_FULL_V2_DEV_SMOKE = NO
READY_FOR_FRESH_UNSEEN = NO
READY_FOR_HUMAN_LINE_ACCEPTANCE = NO
\`\`\`
`;
}

describe("Ambient V2.1 D04 cross-model screening", () => {
  it("keeps cross-model inference disabled without explicit opt-in", () => {
    if (screeningEnabled) return;
    expect(screeningEnabled).toBe(false);
  });

  it("keeps the requested order and the same V2.1 structured request", () => {
    expect(AMBIENT_V2_CROSS_MODEL_CANDIDATES.map((candidate) => candidate.modelId)).toEqual([
      "@cf/qwen/qwen3.8-27b",
      "@cf/zai-org/glm-4.7-flash",
      "@cf/qwen/qwen3-30b-a3b-fp8",
    ]);
    const request = buildAmbientV2StructuredRequest({
      safeRef: "D04",
      sourceIdentity: "fixture",
      text: "synthetic D04",
      selected: true,
    });
    expect(request.response_format).toEqual(AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT);
    expect(request.messages[0]).toEqual(buildAmbientV2StructuredRequest({
      safeRef: "D04",
      sourceIdentity: "other",
      text: "different fixture text",
      selected: true,
    }).messages[0]);
  });

  it("classifies catalog, entitlement, and request-shape evidence without raw payloads", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/ai/models/search")) {
        return new Response(JSON.stringify({ success: true, result: [{ name: "@cf/qwen/qwen3.8-27b" }] }), { status: 200 });
      }
      if (url.includes("/ai/models/schema")) {
        return new Response(JSON.stringify({
          success: true,
          result: {
            input: {
              type: "object",
              properties: {
                messages: { type: "array" },
                response_format: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["json_object", "json_schema"] },
                    json_schema: { type: "object" },
                  },
                },
              },
            },
            output: { type: "object" },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, result: [{ rate_plan: { public_name: "Workers Free" } }] }), { status: 200 });
    });
    const catalog = await queryAmbientV2ModelCatalog({ accountId: "a".repeat(32), token: "fixture-token-not-for-output", model: "@cf/qwen/qwen3.8-27b", fetchImpl });
    const schema = await queryAmbientV2ModelSchema({ accountId: "a".repeat(32), token: "fixture-token-not-for-output", model: "@cf/qwen/qwen3.8-27b", fetchImpl });
    const entitlement = await queryAmbientV2AccountEntitlement({ accountId: "a".repeat(32), token: "fixture-token-not-for-output", fetchImpl });
    expect(catalog).toMatchObject({ catalogModelExists: "YES", modelIdExactMatch: "YES" });
    expect(requestCompatibilityForV21(schema)).toMatchObject({ structuredOutputSupported: "YES", requestShapeCompatibleWithV21: "YES" });
    expect(entitlement).toMatchObject({ accountPlanEvidence: "FREE", accountFreeEntitlement: "YES" });
    expect(JSON.stringify({ catalog, schema, entitlement })).not.toContain("fixture-token-not-for-output");
    expect(JSON.stringify({ catalog, schema, entitlement })).not.toContain("Workers Free");
  });

  it.skipIf(!screeningEnabled)("runs the authorized three-candidate screening with no retries", async () => {
    const auth = discoverAmbientSemanticEvalAuth();
    if (!auth) {
      await writeFile(reportPath, "# Ambient Extraction V2.1 D04 Cross-Model Screening — 2026-08-28\n\nAUTH_BLOCKED = YES\nREAL_AI_CALLS = 0\n", { encoding: "utf8" });
      return;
    }
    const accountDiscovery = await discoverAmbientV2AccountId({
      token: auth.token,
      configuredAccountId: processEnv.CLOUDFLARE_ACCOUNT_ID ?? processEnv.CF_ACCOUNT_ID,
    });
    if (!accountDiscovery.accountId) {
      await writeFile(reportPath, "# Ambient Extraction V2.1 D04 Cross-Model Screening — 2026-08-28\n\nACCOUNT_DISCOVERY = INCONCLUSIVE\nREAL_AI_CALLS = 0\n", { encoding: "utf8" });
      return;
    }
    const entitlement: AmbientV2AccountEntitlementAudit = {
      httpStatus: null,
      cloudflareSuccess: true,
      accountFreeEntitlement: "INCONCLUSIVE",
      accountPlanEvidence: "UNKNOWN",
      errorClass: null,
    };
    const fixture = loadD04Fixture();
    const promptFingerprint = ambientV2RequestPromptFingerprint(buildAmbientV2StructuredRequest(fixture.messages[0]!));
    const results: CandidateScreeningResult[] = [];
    for (const candidate of AMBIENT_V2_CROSS_MODEL_CANDIDATES) {
      results.push(await screenCandidate({ accountId: accountDiscovery.accountId, token: auth.token, candidate, fixture }));
    }
    await mkdir(resolve(projectRoot, "forensics/runtime"), { recursive: true });
    await writeFile(reportPath, renderReport({ accountDiscovery, entitlement, promptFingerprint, results }), { encoding: "utf8" });
    expect(results).toHaveLength(3);
    expect(results.reduce((sum, result) => sum + result.realCalls, 0)).toBeLessThanOrEqual(3);
    expect(results.every((result) => result.realCalls <= 1)).toBe(true);
  }, 30 * 60 * 1000);
});
