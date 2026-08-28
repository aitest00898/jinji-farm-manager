import { randomUUID } from "node:crypto";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
  buildAmbientV2_2StructuredRequest,
  auditAmbientV2_2PromptContract,
  evaluateAmbientV2_2Facts,
  factsFromAmbientV2_2Parsed,
  parseAmbientV2_2ResponseBoundary,
  type AmbientV2_2AttributionExpectation,
  type AmbientV2_2FactSet,
  type AmbientV2_2ResponseClass,
  type AmbientV2_2SemanticStatus,
} from "./ambient-extraction-v2-2";
import type { AmbientAiRequestInput } from "./ambient";
import type { AmbientV2AiRequest, AmbientV2MessageInput } from "./ambient-extraction-v2";
import {
  AmbientV2RealSmokeLedger,
  type AmbientV2_2BoundedFactEvidence,
  type AmbientV2AttemptTerminalRecord,
  type AmbientV2RealSmokeLedgerRecord,
  type AmbientV2RealSmokeLedgerRead,
} from "./ambient-extraction-v2-real-runner";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";

export const AMBIENT_V2_2_REAL_MINI_SUITE_WIRE_VERSION = AMBIENT_V2_2_WIRE_CONTRACT_VERSION;
export const AMBIENT_V2_2_REAL_MINI_SUITE_MODEL = PRODUCTION_AI_MODEL;
export const AMBIENT_V2_2_REAL_MINI_SUITE_TEMPERATURE = 0 as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_MAX_TOKENS = 1536 as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_RUNS = 3 as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS = ["D03", "D04", "D07"] as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS = 9 as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_EXECUTION_MODE = "SERIAL" as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CONCURRENT_AI_CALLS = 1 as const;
export const AMBIENT_V2_2_REAL_MINI_SUITE_RETRIES = 0 as const;

export type AmbientV2_2MiniSuiteCaseRef = (typeof AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS)[number];

export interface AmbientV2_2MiniSuiteCase {
  safeRef: AmbientV2_2MiniSuiteCaseRef;
  message: AmbientV2MessageInput;
  expected: AmbientV2_2FactSet;
  attribution?: AmbientV2_2AttributionExpectation;
}

export interface AmbientV2_2MiniSuitePlan {
  wireContractVersion: typeof AMBIENT_V2_2_REAL_MINI_SUITE_WIRE_VERSION;
  model: typeof AMBIENT_V2_2_REAL_MINI_SUITE_MODEL;
  temperature: 0;
  maxTokens: 1536;
  executionMode: typeof AMBIENT_V2_2_REAL_MINI_SUITE_EXECUTION_MODE;
  maxConcurrentAiCalls: 1;
  retries: 0;
  runs: 3;
  casesPerRun: 3;
  expectedProviderCallsPerRun: 3;
  expectedProviderCalls: 9;
  caseOrder: readonly AmbientV2_2MiniSuiteCaseRef[];
  relationOnlyRefs: readonly string[];
}

export interface AmbientV2_2MiniSuiteAttemptResult {
  runNumber: number;
  callOrdinal: number;
  safeRef: AmbientV2_2MiniSuiteCaseRef;
  caseId: string;
  providerCalls: number;
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  transportErrorClass: string | null;
  transportErrorCode: string | null;
  terminalRecordType: AmbientV2AttemptTerminalRecord["recordType"] | "NOT_RECORDED";
  evidence: AmbientV2_2BoundedFactEvidence;
}

export interface AmbientV2_2MiniSuiteCaseSummary {
  safeRef: AmbientV2_2MiniSuiteCaseRef;
  runs: number;
  factPasses: number;
  structuralPasses: number;
  providerResponses: number;
  technicalFailures: number;
  attributionPasses: number;
  attributionUnresolved: number;
  attributionFailures: number;
  extraFactCount: number;
  wrongCollectionFactCount: number;
}

export interface AmbientV2_2MiniSuiteSummary {
  status: "PASS_STABILITY" | "FAIL_STABILITY" | "INCOMPLETE";
  totalProviderCalls: number;
  structuralPasses: number;
  factPasses: number;
  technicalFailures: number;
  extraFactCount: number;
  wrongCollectionFactCount: number;
  caseSummaries: AmbientV2_2MiniSuiteCaseSummary[];
  attemptTerminalCount: number;
  orphanAttemptCount: number;
  invalidLedgerLineCount: number;
  peakConcurrency: 1;
  noRetries: true;
  sideEffectFree: true;
}

export interface AmbientV2_2RealMiniSuiteOptions {
  endpoint: string;
  token: string;
  ledgerPath: string;
  experimentId: string;
  matrixRunId: string;
  cases: readonly AmbientV2_2MiniSuiteCase[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AmbientV2_2RealMiniSuiteResult {
  experimentId: string;
  matrixRunId: string;
  providerCalls: number;
  plan: AmbientV2_2MiniSuitePlan;
  attempts: AmbientV2_2MiniSuiteAttemptResult[];
  summary: AmbientV2_2MiniSuiteSummary;
  ledger: {
    attemptStarts: number;
    terminalRecords: number;
    orphanAttempts: number;
    invalidLineCount: number;
    processStarted: number;
    processExited: number;
  };
}

export type AmbientV2_2RealMiniRequest = AmbientAiRequestInput & {
  response_format: NonNullable<AmbientV2AiRequest["response_format"]>;
  stream: false;
};

/** Build the pinned V2.2 structured request without changing its Prompt. */
export function buildAmbientV2_2RealMiniRequest(message: AmbientV2MessageInput): AmbientV2_2RealMiniRequest {
  const request = buildAmbientV2_2StructuredRequest(message);
  if (!request.response_format) throw new Error("V2_2_STRUCTURED_RESPONSE_FORMAT_MISSING");
  return {
    messages: request.messages,
    max_tokens: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_TOKENS,
    temperature: AMBIENT_V2_2_REAL_MINI_SUITE_TEMPERATURE,
    response_format: request.response_format,
    stream: false,
  };
}

export function planAmbientV2_2RealMiniSuite(
  cases: readonly AmbientV2_2MiniSuiteCase[],
): AmbientV2_2MiniSuitePlan {
  const caseOrder = cases.map((item) => item.safeRef);
  if (cases.length !== AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS.length
    || caseOrder.some((value, index) => value !== AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS[index])) {
    throw new Error("V2_2_MINI_SUITE_CASE_ORDER_INVALID");
  }
  return {
    wireContractVersion: AMBIENT_V2_2_REAL_MINI_SUITE_WIRE_VERSION,
    model: AMBIENT_V2_2_REAL_MINI_SUITE_MODEL,
    temperature: AMBIENT_V2_2_REAL_MINI_SUITE_TEMPERATURE,
    maxTokens: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_TOKENS,
    executionMode: AMBIENT_V2_2_REAL_MINI_SUITE_EXECUTION_MODE,
    maxConcurrentAiCalls: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CONCURRENT_AI_CALLS,
    retries: AMBIENT_V2_2_REAL_MINI_SUITE_RETRIES,
    runs: AMBIENT_V2_2_REAL_MINI_SUITE_RUNS,
    casesPerRun: cases.length,
    expectedProviderCallsPerRun: 3,
    expectedProviderCalls: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS,
    caseOrder: [...caseOrder],
    relationOnlyRefs: [],
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

function statusFromSemantic(
  value: AmbientV2_2SemanticStatus | "NOT_RUN",
): AmbientV2_2BoundedFactEvidence["semanticStatus"] {
  return value;
}

export function boundedWrongCollectionFactCount(
  actual: AmbientV2_2FactSet,
  expected: AmbientV2_2FactSet,
): number {
  const operationShortfall = Math.max(0, expected.operations.length - actual.operations.length);
  const operationExcess = Math.max(0, actual.operations.length - expected.operations.length);
  const abnormalityShortfall = Math.max(0, expected.abnormalities.length - actual.abnormalities.length);
  const abnormalityExcess = Math.max(0, actual.abnormalities.length - expected.abnormalities.length);
  return Math.min(
    32,
    Math.min(operationShortfall, abnormalityExcess)
      + Math.min(abnormalityShortfall, operationExcess),
  );
}

export function boundedEvidenceFromParsed(
  responseClass: AmbientV2_2ResponseClass,
  parsed: ReturnType<typeof parseAmbientV2_2ResponseBoundary>["parsed"],
  expected: AmbientV2_2FactSet,
  attribution: AmbientV2_2AttributionExpectation | "NOT_EVALUATED",
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
    wrongCollectionFactCount: structuralPass ? boundedWrongCollectionFactCount(actualFacts, expected) : null,
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
  return {
    responseClass: errorClass === "PROVIDER_JSON_MODE_ERROR"
      ? "PROVIDER_JSON_MODE_ERROR"
      : "OTHER",
    jsonParseStatus: "NOT_RUN",
    structuralStatus: "NOT_RUN",
    structuralSubtype: "NOT_RUN",
    semanticStatus: "NOT_RUN",
    operationFactCount: null,
    abnormalityFactCount: null,
    actualFactCount: null,
    expectedFactCount: null,
    wrongCollectionFactCount: null,
    operationFactPass: "NOT_EVALUATED",
    abnormalityFactPass: "NOT_EVALUATED",
    factExtractionPass: "NOT_EVALUATED",
    quantityAttributionStatus: "NOT_EVALUATED",
    semanticFailureCode: null,
    failureClass: "TRANSPORT",
  };
}

function safeFailureCode(value: string | null): string | null {
  return value && /^[A-Za-z0-9_.:-]{1,96}$/u.test(value) ? value : null;
}

function terminalRecord(options: {
  experimentId: string;
  matrixRunId: string;
  attemptId: string;
  safeRef: AmbientV2_2MiniSuiteCaseRef;
  caseId: string;
  runNumber: number;
  callOrdinal: number;
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
    caseId: options.caseId,
    safeRef: options.safeRef,
    runNumber: options.runNumber,
    callOrdinal: options.callOrdinal,
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
    overallPass: factPass,
    failureClass: factPass ? null : options.evidence.failureClass === "TRANSPORT"
      ? safeFailureCode(options.errorClass) ?? "V2_2_PROVIDER_FAILURE"
      : options.evidence.structuralSubtype !== "NONE" && options.evidence.structuralSubtype !== "NOT_RUN"
        ? options.evidence.structuralSubtype
        : options.evidence.semanticFailureCode ?? "V2_2_FACT_EXTRACTION_FAILURE",
    cloudflareErrorCode: safeFailureCode(options.errorCode),
    safeMetrics: null,
    boundedSchema: null,
    boundedV22: options.evidence,
  };
}

function requestFingerprint(request: AmbientV2_2RealMiniRequest): string {
  const messageShape = request.messages.map((message) => `${message.role}-${message.content.length}`).join("-");
  return `v22-${messageShape}-${request.max_tokens}-${request.temperature}-structured`;
}

function isTerminalRecord(record: AmbientV2RealSmokeLedgerRecord): record is AmbientV2AttemptTerminalRecord {
  return record.recordType === "ATTEMPT_SUCCESS"
    || record.recordType === "ATTEMPT_FAILURE"
    || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION";
}

function summarizeAttempts(
  attempts: readonly AmbientV2_2MiniSuiteAttemptResult[],
  ledger: AmbientV2RealSmokeLedgerRead,
): AmbientV2_2MiniSuiteSummary {
  const caseSummaries = AMBIENT_V2_2_REAL_MINI_SUITE_CASE_REFS.map((safeRef) => {
    const selected = attempts.filter((attempt) => attempt.safeRef === safeRef);
    const extraFactCount = selected.reduce((sum, attempt) => {
      const actual = attempt.evidence.actualFactCount;
      const expected = attempt.evidence.expectedFactCount;
      return sum + (actual !== null && expected !== null ? Math.max(0, actual - expected) : 0);
    }, 0);
    const wrongCollectionFactCount = selected.reduce(
      (sum, attempt) => sum + (attempt.evidence.wrongCollectionFactCount ?? 0),
      0,
    );
    return {
      safeRef,
      runs: selected.length,
      factPasses: selected.filter((attempt) => attempt.evidence.factExtractionPass === "YES").length,
      structuralPasses: selected.filter((attempt) => attempt.evidence.structuralStatus === "PASS").length,
      providerResponses: selected.filter((attempt) => attempt.providerResponseConfirmed).length,
      technicalFailures: selected.filter((attempt) => attempt.evidence.failureClass === "TRANSPORT").length,
      attributionPasses: selected.filter((attempt) => attempt.evidence.quantityAttributionStatus === "PASS").length,
      attributionUnresolved: selected.filter((attempt) => attempt.evidence.quantityAttributionStatus === "UNRESOLVED").length,
      attributionFailures: selected.filter((attempt) => attempt.evidence.quantityAttributionStatus === "FAIL").length,
      extraFactCount,
      wrongCollectionFactCount,
    } satisfies AmbientV2_2MiniSuiteCaseSummary;
  });
  const structuralPasses = attempts.filter((attempt) => attempt.evidence.structuralStatus === "PASS").length;
  const factPasses = attempts.filter((attempt) => attempt.evidence.factExtractionPass === "YES").length;
  const technicalFailures = attempts.filter((attempt) => attempt.evidence.failureClass === "TRANSPORT").length;
  const extraFactCount = caseSummaries.reduce((sum, item) => sum + item.extraFactCount, 0);
  const wrongCollectionFactCount = caseSummaries.reduce((sum, item) => sum + item.wrongCollectionFactCount, 0);
  const expectedCasePass = caseSummaries.every((item) => item.runs === AMBIENT_V2_2_REAL_MINI_SUITE_RUNS
    && item.factPasses === AMBIENT_V2_2_REAL_MINI_SUITE_RUNS);
  const ledgerStarts = ledger.records.filter((record) => record.recordType === "ATTEMPT_START").length;
  const terminals = ledger.records.filter(isTerminalRecord);
  const terminalIds = new Set(terminals.map((record) => record.attemptId));
  const orphanAttemptCount = ledger.records.filter((record) => record.recordType === "ATTEMPT_START"
    && !terminalIds.has(record.attemptId)).length;
  const complete = ledgerStarts === AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS
    && terminals.length === AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS
    && orphanAttemptCount === 0
    && ledger.invalidLineCount === 0;
  const pass = complete
    && expectedCasePass
    && structuralPasses === AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS
    && technicalFailures === 0
    && extraFactCount === 0
    && wrongCollectionFactCount === 0;
  return {
    status: !complete
      ? "INCOMPLETE"
      : pass ? "PASS_STABILITY" : "FAIL_STABILITY",
    totalProviderCalls: attempts.length,
    structuralPasses,
    factPasses,
    technicalFailures,
    extraFactCount,
    wrongCollectionFactCount,
    caseSummaries,
    attemptTerminalCount: terminals.length,
    orphanAttemptCount,
    invalidLedgerLineCount: ledger.invalidLineCount,
    peakConcurrency: 1,
    noRetries: true,
    sideEffectFree: true,
  };
}

/**
 * Execute the fixed V2.2 D03/D04/D07 matrix serially. This is developer-only
 * tooling and has no Worker, D1, Queue, Candidate, Buffer, or LINE path.
 */
export async function runAmbientV2_2RealMiniSuite(
  options: AmbientV2_2RealMiniSuiteOptions,
): Promise<AmbientV2_2RealMiniSuiteResult> {
  const plan = planAmbientV2_2RealMiniSuite(options.cases);
  const ledger = new AmbientV2RealSmokeLedger(options.ledgerPath, {
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    maxCalls: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS,
  });
  const existing = await ledger.read();
  if (existing.records.length > 0) throw new Error("V2_2_MINI_SUITE_LEDGER_NOT_EMPTY");
  await ledger.append({
    recordType: "PROCESS_STARTED",
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    timestamp: new Date().toISOString(),
  });

  const adapter = new DirectWorkersAiRestAdapter({
    endpoint: options.endpoint,
    token: options.token,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxCalls: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_CALLS,
  });
  const attempts: AmbientV2_2MiniSuiteAttemptResult[] = [];
  let callOrdinal = 0;
  for (let runNumber = 1; runNumber <= AMBIENT_V2_2_REAL_MINI_SUITE_RUNS; runNumber += 1) {
    for (const item of options.cases) {
      callOrdinal += 1;
      const attemptId = randomUUID();
      const caseId = `V22-MINI-${item.safeRef}`;
      const request = buildAmbientV2_2RealMiniRequest(item.message);
      await ledger.append({
        recordType: "ATTEMPT_START",
        experimentId: options.experimentId,
        matrixRunId: options.matrixRunId,
        attemptId,
        caseId,
        safeRef: item.safeRef,
        runNumber,
        callOrdinal,
        model: AMBIENT_V2_2_REAL_MINI_SUITE_MODEL,
        timestamp: new Date().toISOString(),
        requestContractFingerprint: requestFingerprint(request),
        promptFingerprint: auditAmbientV2_2PromptContract().fingerprint,
        maxTokens: AMBIENT_V2_2_REAL_MINI_SUITE_MAX_TOKENS,
        temperature: AMBIENT_V2_2_REAL_MINI_SUITE_TEMPERATURE,
        status: "started",
      });

      let evidence: AmbientV2_2BoundedFactEvidence;
      let metadata: ReturnType<typeof safeTransportMetadata>;
      try {
        const result = await adapter.run(AMBIENT_V2_2_REAL_MINI_SUITE_MODEL, request);
        metadata = safeTransportMetadata(adapter);
        const boundary = parseAmbientV2_2ResponseBoundary(result);
        evidence = boundedEvidenceFromParsed(
          boundary.responseClass,
          boundary.parsed,
          item.expected,
          item.attribution ?? "NOT_EVALUATED",
        );
      } catch (error) {
        metadata = safeTransportMetadata(adapter);
        evidence = transportEvidence(metadata.errorClass);
        const terminal = terminalRecord({
          experimentId: options.experimentId,
          matrixRunId: options.matrixRunId,
          attemptId,
          safeRef: item.safeRef,
          caseId,
          runNumber,
          callOrdinal,
          httpStatus: metadata.httpStatus,
          providerResponseConfirmed: metadata.providerResponseConfirmed,
          errorCode: metadata.errorCode,
          errorClass: metadata.errorClass ?? (error instanceof Error ? error.name : null),
          evidence,
        });
        await ledger.append(terminal);
        attempts.push({
          runNumber,
          callOrdinal,
          safeRef: item.safeRef,
          caseId,
          providerCalls: adapter.calls,
          httpStatus: metadata.httpStatus,
          providerResponseConfirmed: metadata.providerResponseConfirmed,
          transportErrorClass: metadata.errorClass,
          transportErrorCode: metadata.errorCode,
          terminalRecordType: terminal.recordType,
          evidence,
        });
        continue;
      }

      const terminal = terminalRecord({
        experimentId: options.experimentId,
        matrixRunId: options.matrixRunId,
        attemptId,
        safeRef: item.safeRef,
        caseId,
        runNumber,
        callOrdinal,
        httpStatus: metadata.httpStatus,
        providerResponseConfirmed: metadata.providerResponseConfirmed,
        errorCode: metadata.errorCode,
        errorClass: metadata.errorClass,
        evidence,
      });
      await ledger.append(terminal);
      attempts.push({
        runNumber,
        callOrdinal,
        safeRef: item.safeRef,
        caseId,
        providerCalls: adapter.calls,
        httpStatus: metadata.httpStatus,
        providerResponseConfirmed: metadata.providerResponseConfirmed,
        transportErrorClass: metadata.errorClass,
        transportErrorCode: metadata.errorCode,
        terminalRecordType: terminal.recordType,
        evidence,
      });
    }
  }

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
  const finalLedger = await ledger.read();
  return {
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    providerCalls: adapter.calls,
    plan,
    attempts,
    summary: summarizeAttempts(attempts, finalLedger),
    ledger: {
      attemptStarts: finalLedger.records.filter((record) => record.recordType === "ATTEMPT_START").length,
      terminalRecords: finalLedger.records.filter((record) => record.recordType === "ATTEMPT_SUCCESS"
        || record.recordType === "ATTEMPT_FAILURE"
        || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION").length,
      orphanAttempts: await ledger.orphanStarts().then((items) => items.length),
      invalidLineCount: finalLedger.invalidLineCount,
      processStarted: finalLedger.records.filter((record) => record.recordType === "PROCESS_STARTED").length,
      processExited: finalLedger.records.filter((record) => record.recordType === "PROCESS_EXITED").length,
    },
  };
}
