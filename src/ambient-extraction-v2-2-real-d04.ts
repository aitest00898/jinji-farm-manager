import { randomUUID } from "node:crypto";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  buildAmbientV2_2StructuredRequest,
  auditAmbientV2_2PromptContract,
  evaluateAmbientV2_2Facts,
  factsFromAmbientV2_2Parsed,
  parseAmbientV2_2ResponseBoundary,
  type AmbientV2_2AttributionExpectation,
  type AmbientV2_2FactSet,
  type AmbientV2_2ResponseClass,
  type AmbientV2_2SemanticStatus,
  type AmbientV2_2StructuralSubtype,
} from "./ambient-extraction-v2-2";
import type { AmbientAiRequestInput } from "./ambient";
import type { AmbientV2AiRequest, AmbientV2MessageInput } from "./ambient-extraction-v2";
import {
  AmbientV2RealSmokeLedger,
  type AmbientV2_2BoundedFactEvidence,
  type AmbientV2AttemptTerminalRecord,
} from "./ambient-extraction-v2-real-runner";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";

export const AMBIENT_V2_2_REAL_D04_MODEL = PRODUCTION_AI_MODEL;
export const AMBIENT_V2_2_REAL_D04_TEMPERATURE = 0 as const;
export const AMBIENT_V2_2_REAL_D04_MAX_TOKENS = 1536 as const;
export const AMBIENT_V2_2_REAL_D04_MAX_CALLS = 1 as const;
export const AMBIENT_V2_2_REAL_D04_CASE_ID = "D04-V2.2-FACT";
export const AMBIENT_V2_2_REAL_D04_ATTRIBUTION: AmbientV2_2AttributionExpectation = {
  abnormalityQuantities: [2],
};

export type AmbientV2_2RealRequestInput = AmbientAiRequestInput & {
  response_format: NonNullable<AmbientV2AiRequest["response_format"]>;
  stream: false;
};

export interface AmbientV2_2D04RealCallOptions {
  endpoint: string;
  token: string;
  ledgerPath: string;
  experimentId: string;
  matrixRunId: string;
  message: AmbientV2MessageInput;
  expected: AmbientV2_2FactSet;
  attribution?: AmbientV2_2AttributionExpectation;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AmbientV2_2D04RealCallResult {
  experimentId: string;
  matrixRunId: string;
  safeRef: string;
  providerCalls: number;
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  transportErrorClass: string | null;
  transportErrorCode: string | null;
  terminalRecordType: AmbientV2AttemptTerminalRecord["recordType"] | "NOT_RECORDED";
  evidence: AmbientV2_2BoundedFactEvidence;
}

/** Build the exact developer-only V2.2 request sent to the Direct REST path. */
export function buildAmbientV2_2RealD04Request(message: AmbientV2MessageInput): AmbientV2_2RealRequestInput {
  const request = buildAmbientV2_2StructuredRequest(message);
  if (!request.response_format) throw new Error("V2_2_STRUCTURED_RESPONSE_FORMAT_MISSING");
  return {
    messages: request.messages,
    max_tokens: AMBIENT_V2_2_REAL_D04_MAX_TOKENS,
    temperature: AMBIENT_V2_2_REAL_D04_TEMPERATURE,
    response_format: request.response_format,
    stream: false,
  };
}

function safeTransportMetadata(adapter: DirectWorkersAiRestAdapter): {
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  errorClass: string | null;
  errorCode: string | null;
} {
  return {
    httpStatus: adapter.lastCall?.httpStatus ?? null,
    providerResponseConfirmed: adapter.lastCall?.providerResponseConfirmed ?? false,
    errorClass: adapter.lastCall?.errorClass ?? null,
    errorCode: adapter.lastCall?.errorCode ?? null,
  };
}

function statusFromSemantic(value: AmbientV2_2SemanticStatus | "NOT_RUN"): AmbientV2_2BoundedFactEvidence["semanticStatus"] {
  return value;
}

function boundedEvidenceFromParsed(
  responseClass: AmbientV2_2ResponseClass,
  parsed: ReturnType<typeof parseAmbientV2_2ResponseBoundary>["parsed"],
  expected: AmbientV2_2FactSet,
  attribution: AmbientV2_2AttributionExpectation,
): AmbientV2_2BoundedFactEvidence {
  const structuralPass = parsed.structuralStatus === "pass";
  const actualFacts = factsFromAmbientV2_2Parsed(parsed);
  const evaluation = evaluateAmbientV2_2Facts(actualFacts, expected, attribution);
  return {
    responseClass,
    jsonParseStatus: parsed.diagnostics.jsonParseStatus === "pass"
      ? "PASS"
      : parsed.diagnostics.jsonParseStatus === "fail"
        ? "FAIL"
        : "NOT_RUN",
    structuralStatus: structuralPass ? "PASS" : "FAIL",
    structuralSubtype: parsed.diagnostics.structuralSubtype ?? "NONE",
    semanticStatus: statusFromSemantic(parsed.semanticStatus),
    operationFactCount: parsed.diagnostics.operationItemCount,
    abnormalityFactCount: parsed.diagnostics.abnormalityItemCount,
    actualFactCount: evaluation.actualFactCount,
    expectedFactCount: evaluation.expectedFactCount,
    operationFactPass: structuralPass ? evaluation.operationPass ? "YES" : "NO" : "NOT_EVALUATED",
    abnormalityFactPass: structuralPass ? evaluation.abnormalityPass ? "YES" : "NO" : "NOT_EVALUATED",
    factExtractionPass: structuralPass ? evaluation.factExtractionPass ? "YES" : "NO" : "NOT_EVALUATED",
    quantityAttributionStatus: structuralPass ? evaluation.quantityAttributionStatus : "NOT_EVALUATED",
    semanticFailureCode: parsed.diagnostics.semanticFailureCode,
    failureClass: structuralPass
      ? evaluation.factExtractionPass ? "NONE" : "FACT_EXTRACTION"
      : "STRUCTURAL",
  };
}

function transportEvidence(errorClass: string | null): AmbientV2_2BoundedFactEvidence {
  const responseClass: AmbientV2_2ResponseClass = errorClass === "PROVIDER_JSON_MODE_ERROR"
    ? "PROVIDER_JSON_MODE_ERROR"
    : "OTHER";
  return {
    responseClass,
    jsonParseStatus: "NOT_RUN",
    structuralStatus: "NOT_RUN",
    structuralSubtype: "NOT_RUN",
    semanticStatus: "NOT_RUN",
    operationFactCount: null,
    abnormalityFactCount: null,
    actualFactCount: null,
    expectedFactCount: null,
    operationFactPass: "NOT_EVALUATED",
    abnormalityFactPass: "NOT_EVALUATED",
    factExtractionPass: "NOT_EVALUATED",
    quantityAttributionStatus: "NOT_EVALUATED",
    semanticFailureCode: null,
    failureClass: "TRANSPORT",
  };
}

function terminalRecord(options: {
  experimentId: string;
  matrixRunId: string;
  attemptId: string;
  safeRef: string;
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  errorCode: string | null;
  errorClass: string | null;
  evidence: AmbientV2_2BoundedFactEvidence;
}): AmbientV2AttemptTerminalRecord {
  const factPass = options.evidence.factExtractionPass === "YES";
  const structuralPass = options.evidence.structuralStatus === "PASS";
  return {
    recordType: factPass ? "ATTEMPT_SUCCESS" : "ATTEMPT_FAILURE",
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    attemptId: options.attemptId,
    caseId: AMBIENT_V2_2_REAL_D04_CASE_ID,
    safeRef: options.safeRef,
    runNumber: 1,
    callOrdinal: 1,
    completedAt: new Date().toISOString(),
    transportStatus: options.providerResponseConfirmed ? "success" : "failure",
    httpStatus: options.httpStatus,
    providerResponseConfirmed: options.providerResponseConfirmed,
    jsonStatus: options.evidence.jsonParseStatus === "PASS"
      ? "pass"
      : options.evidence.jsonParseStatus === "FAIL"
        ? "fail"
        : "not_run",
    normalizationStatus: "not_run",
    validationStatus: structuralPass ? "pass" : options.providerResponseConfirmed ? "fail" : "not_run",
    systemBuildStatus: "not_run",
    overallPass: factPass ? true : false,
    failureClass: factPass ? null : options.evidence.failureClass === "TRANSPORT"
      ? options.errorClass ?? "V2_2_PROVIDER_FAILURE"
      : options.evidence.structuralSubtype !== "NONE" && options.evidence.structuralSubtype !== "NOT_RUN"
        ? options.evidence.structuralSubtype
        : options.evidence.semanticFailureCode ?? "V2_2_FACT_EXTRACTION_FAILURE",
    cloudflareErrorCode: options.errorCode,
    safeMetrics: null,
    boundedSchema: null,
    boundedV22: options.evidence,
  };
}

/**
 * Execute exactly one V2.2 D04 provider attempt. This function is developer
 * tooling only: it has no Worker, D1, Queue, Candidate, Buffer, or LINE path.
 */
export async function runAmbientV2_2D04RealCall(
  options: AmbientV2_2D04RealCallOptions,
): Promise<AmbientV2_2D04RealCallResult> {
  const ledger = new AmbientV2RealSmokeLedger(options.ledgerPath, {
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    maxCalls: AMBIENT_V2_2_REAL_D04_MAX_CALLS,
  });
  const existing = await ledger.read();
  if (existing.records.some((record) => record.experimentId !== options.experimentId || record.matrixRunId !== options.matrixRunId)) {
    throw new Error("V2_2_D04_LEDGER_RUN_MISMATCH");
  }
  if (existing.records.some((record) => record.recordType === "ATTEMPT_START")) {
    throw new Error("V2_2_D04_CALL_LIMIT_EXCEEDED");
  }
  if (!existing.records.some((record) => record.recordType === "PROCESS_STARTED")) {
    await ledger.append({
      recordType: "PROCESS_STARTED",
      experimentId: options.experimentId,
      matrixRunId: options.matrixRunId,
      timestamp: new Date().toISOString(),
    });
  }

  const attemptId = randomUUID();
  const request = buildAmbientV2_2RealD04Request(options.message);
  await ledger.append({
    recordType: "ATTEMPT_START",
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    attemptId,
    caseId: AMBIENT_V2_2_REAL_D04_CASE_ID,
    safeRef: options.message.safeRef,
    runNumber: 1,
    callOrdinal: 1,
    model: AMBIENT_V2_2_REAL_D04_MODEL,
    timestamp: new Date().toISOString(),
    requestContractFingerprint: `v22-${request.messages.length}-${request.messages.map((message) => `${message.role}-${message.content.length}`).join("-")}-${request.max_tokens}-${request.temperature}-structured`,
    promptFingerprint: auditAmbientV2_2PromptContract().fingerprint,
    maxTokens: AMBIENT_V2_2_REAL_D04_MAX_TOKENS,
    temperature: AMBIENT_V2_2_REAL_D04_TEMPERATURE,
    status: "started",
  });

  const direct = new DirectWorkersAiRestAdapter({
    endpoint: options.endpoint,
    token: options.token,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxCalls: AMBIENT_V2_2_REAL_D04_MAX_CALLS,
  });
  let evidence: AmbientV2_2BoundedFactEvidence;
  let metadata: ReturnType<typeof safeTransportMetadata>;
  try {
    const result = await direct.run(AMBIENT_V2_2_REAL_D04_MODEL, request);
    metadata = safeTransportMetadata(direct);
    const boundary = parseAmbientV2_2ResponseBoundary(result);
    evidence = boundedEvidenceFromParsed(
      boundary.responseClass,
      boundary.parsed,
      options.expected,
      options.attribution ?? AMBIENT_V2_2_REAL_D04_ATTRIBUTION,
    );
  } catch (error) {
    metadata = safeTransportMetadata(direct);
    evidence = transportEvidence(metadata.errorClass);
    const terminal = terminalRecord({
      experimentId: options.experimentId,
      matrixRunId: options.matrixRunId,
      attemptId,
      safeRef: options.message.safeRef,
      httpStatus: metadata.httpStatus,
      providerResponseConfirmed: metadata.providerResponseConfirmed,
      errorCode: metadata.errorCode,
      errorClass: metadata.errorClass ?? (error instanceof Error ? error.name : null),
      evidence,
    });
    await ledger.append(terminal);
    await ledger.append({
      recordType: "PROCESS_EXITED",
      experimentId: options.experimentId,
      matrixRunId: options.matrixRunId,
      timestamp: new Date().toISOString(),
      exitCode: 0,
      signal: null,
      markerSeen: true,
      stderrClass: "NOT_CAPTURED",
    });
    return {
      experimentId: options.experimentId,
      matrixRunId: options.matrixRunId,
      safeRef: options.message.safeRef,
      providerCalls: 1,
      httpStatus: metadata.httpStatus,
      providerResponseConfirmed: metadata.providerResponseConfirmed,
      transportErrorClass: metadata.errorClass,
      transportErrorCode: metadata.errorCode,
      terminalRecordType: terminal.recordType,
      evidence,
    };
  }

  const terminal = terminalRecord({
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    attemptId,
    safeRef: options.message.safeRef,
    httpStatus: metadata.httpStatus,
    providerResponseConfirmed: metadata.providerResponseConfirmed,
    errorCode: metadata.errorCode,
    errorClass: metadata.errorClass,
    evidence,
  });
  await ledger.append(terminal);
  await ledger.append({
    recordType: "PROCESS_EXITED",
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    timestamp: new Date().toISOString(),
    exitCode: 0,
    signal: null,
    markerSeen: true,
    stderrClass: "NOT_CAPTURED",
  });
  return {
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    safeRef: options.message.safeRef,
    providerCalls: 1,
    httpStatus: metadata.httpStatus,
    providerResponseConfirmed: metadata.providerResponseConfirmed,
    transportErrorClass: metadata.errorClass,
    transportErrorCode: metadata.errorCode,
    terminalRecordType: terminal.recordType,
    evidence,
  };
}
