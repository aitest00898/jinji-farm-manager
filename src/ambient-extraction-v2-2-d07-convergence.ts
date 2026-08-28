import { randomUUID } from "node:crypto";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { ambientMessageMayBeRelevant } from "./ambient";
import {
  classifyAmbientV2MessageRoute,
  resolveAmbientV2Relation,
  type AmbientV2MessageInput,
  type AmbientV2RelationCandidate,
} from "./ambient-extraction-v2";
import {
  AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
  auditAmbientV2_2PromptContract,
  claimAmbientV2_2DeterministicOperations,
  evaluateAmbientV2_2Facts,
  factsFromAmbientV2_2Parsed,
  planAmbientExtractionV2_2,
  parseAmbientV2_2ResponseBoundary,
  resolveAmbientV2_2Context,
  type AmbientV2_2AttributionExpectation,
  type AmbientV2_2FactSet,
} from "./ambient-extraction-v2-2";
import {
  buildAmbientV2_2RealMiniRequest,
  type AmbientV2_2MiniSuiteAttemptResult,
  type AmbientV2_2MiniSuiteCase,
} from "./ambient-extraction-v2-2-real-mini-suite";
import {
  AmbientV2RealSmokeLedger,
  type AmbientV2_2BoundedFactEvidence,
  type AmbientV2AttemptTerminalRecord,
} from "./ambient-extraction-v2-real-runner";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";
import type { AmbientSemanticEvalTransportSubtype } from "./ambient-semantic-eval";

export const AMBIENT_V2_2_D07_CONVERGENCE_SMOKE_AI_CASE_REFS = ["D03", "D04", "D07"] as const;
export const AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS = 6 as const;
export const AMBIENT_V2_2_D07_CONVERGENCE_EXECUTION_MODE = "SERIAL" as const;
export const AMBIENT_V2_2_D07_CONVERGENCE_MAX_CONCURRENT_AI_CALLS = 1 as const;
export const AMBIENT_V2_2_D07_CONVERGENCE_RETRIES = 0 as const;

export type AmbientV2_2ConvergenceCaseRef = (typeof AMBIENT_V2_2_D07_CONVERGENCE_SMOKE_AI_CASE_REFS)[number];

export interface AmbientV2_2DevSmokeFixtureMessage {
  safeRef: string;
  message: AmbientV2MessageInput;
  expected: AmbientV2_2FactSet;
  attribution?: AmbientV2_2AttributionExpectation;
  relationTargetRef?: string | null;
  contextResolution?: "resolved" | "unresolved";
}

export interface AmbientV2_2DevSmokeFixture {
  messages: readonly AmbientV2_2DevSmokeFixtureMessage[];
  selectedRefs: readonly string[];
}

export interface AmbientV2_2D07ConvergenceOptions {
  endpoint: string;
  token: string;
  ledgerPath: string;
  experimentId: string;
  matrixRunId: string;
  cases: readonly AmbientV2_2MiniSuiteCase[];
  smokeFixture: AmbientV2_2DevSmokeFixture;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AmbientV2_2D07ConvergenceAttempt extends AmbientV2_2MiniSuiteAttemptResult {
  phase: "DEV_SMOKE_8";
  transportSubtype: AmbientSemanticEvalTransportSubtype | null;
  transportErrorName: string | null;
  transportCauseName: string | null;
  transportCauseCode: string | null;
  transportElapsedMs: number | null;
}

export interface AmbientV2_2D07ConvergencePhaseSummary {
  status: "PASS" | "FAIL" | "NOT_RUN";
  executionMode: "LOCAL_DETERMINISTIC" | "PROVIDER";
  runs: number;
  providerCalls: number;
  structuralPasses: number;
  factPasses: number;
  technicalFailures: number;
  extraFactCount: number;
  wrongCollectionFactCount: number;
  attempts: AmbientV2_2D07ConvergenceAttempt[];
}

export interface AmbientV2_2DevSmokeSummary {
  status: "PASS" | "FAIL" | "NOT_RUN";
  messagesTotal: number;
  deterministicResolved: number;
  aiExtractionRequired: number;
  relationOnlyMessages: number;
  relationResolverCalls: number;
  noEventFastPath: number;
  providerCalls: number;
  structuralPasses: number;
  factPasses: number;
  technicalFailures: number;
  semanticEventCountExpected: 6;
  semanticEventCountActual: number;
  relationCountExpected: 1;
  relationCountActual: number;
  chatContamination: number;
  wrongCollectionFactCount: number;
  hallucinatedExtraFactCount: number;
  duplicateEventCount: number;
  wrongFarmAssignmentCount: number;
  unsafeSalvage: 0;
  autoEventSplit: "NO";
  autoQuantityPropagation: "NO";
  semanticDedupe: "NO";
  d04FactPass: "YES" | "NO" | "NOT_RUN";
  d04AttributionStatus: "PASS" | "FAIL" | "UNRESOLVED" | "NOT_EVALUATED" | "NOT_RUN";
  failedCase: string | null;
  attempts: AmbientV2_2D07ConvergenceAttempt[];
}

export interface AmbientV2_2D07ConvergenceResult {
  experimentId: string;
  matrixRunId: string;
  wireContractVersion: typeof AMBIENT_V2_2_WIRE_CONTRACT_VERSION;
  model: typeof PRODUCTION_AI_MODEL;
  temperature: 0;
  maxTokens: 1536;
  executionMode: typeof AMBIENT_V2_2_D07_CONVERGENCE_EXECUTION_MODE;
  maxConcurrentAiCalls: 1;
  retries: 0;
  totalProviderCallLimit: 6;
  totalProviderCalls: number;
  d07: AmbientV2_2D07ConvergencePhaseSummary;
  smoke: AmbientV2_2DevSmokeSummary;
  attempts: AmbientV2_2D07ConvergenceAttempt[];
  ledger: {
    attemptStarts: number;
    terminalRecords: number;
    orphanAttempts: number;
    invalidLineCount: number;
    processStarted: number;
    processExited: number;
  };
  sideEffectFree: true;
}

interface AttemptOutcome {
  attempt: AmbientV2_2D07ConvergenceAttempt;
  parsed: ReturnType<typeof parseAmbientV2_2ResponseBoundary>["parsed"] | null;
}

interface SafeTransportMetadata {
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  errorClass: string | null;
  errorCode: string | null;
  transportSubtype: AmbientSemanticEvalTransportSubtype | null;
  transportErrorName: string | null;
  transportCauseName: string | null;
  transportCauseCode: string | null;
  transportElapsedMs: number | null;
}

function safeTransportMetadata(adapter: DirectWorkersAiRestAdapter): SafeTransportMetadata {
  return {
    httpStatus: adapter.lastCall?.httpStatus ?? null,
    providerResponseConfirmed: adapter.lastCall?.providerResponseConfirmed ?? false,
    errorClass: adapter.lastCall?.errorClass ?? null,
    errorCode: adapter.lastCall?.errorCode ?? null,
    transportSubtype: adapter.lastCall?.transportSubtype ?? null,
    transportErrorName: adapter.lastCall?.transportErrorName ?? null,
    transportCauseName: adapter.lastCall?.transportCauseName ?? null,
    transportCauseCode: adapter.lastCall?.transportCauseCode ?? null,
    transportElapsedMs: adapter.lastCall?.transportElapsedMs ?? null,
  };
}

function transportEvidence(errorClass: string | null): AmbientV2_2BoundedFactEvidence {
  return {
    responseClass: errorClass === "PROVIDER_JSON_MODE_ERROR" ? "PROVIDER_JSON_MODE_ERROR" : "OTHER",
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

function terminalRecord(input: {
  experimentId: string;
  matrixRunId: string;
  attemptId: string;
  safeRef: AmbientV2_2ConvergenceCaseRef;
  caseId: string;
  runNumber: number;
  callOrdinal: number;
  metadata: SafeTransportMetadata;
  errorClass: string | null;
  evidence: AmbientV2_2BoundedFactEvidence;
}): AmbientV2AttemptTerminalRecord {
  const factPass = input.evidence.factExtractionPass === "YES";
  const structuralPass = input.evidence.structuralStatus === "PASS";
  return {
    recordType: factPass ? "ATTEMPT_SUCCESS" : "ATTEMPT_FAILURE",
    experimentId: input.experimentId,
    matrixRunId: input.matrixRunId,
    attemptId: input.attemptId,
    caseId: input.caseId,
    safeRef: input.safeRef,
    runNumber: input.runNumber,
    callOrdinal: input.callOrdinal,
    completedAt: new Date().toISOString(),
    transportStatus: input.metadata.providerResponseConfirmed ? "success" : "failure",
    httpStatus: input.metadata.httpStatus,
    providerResponseConfirmed: input.metadata.providerResponseConfirmed,
    jsonStatus: input.evidence.jsonParseStatus === "PASS"
      ? "pass"
      : input.evidence.jsonParseStatus === "FAIL" ? "fail" : "not_run",
    normalizationStatus: "not_run",
    validationStatus: structuralPass ? "pass" : input.metadata.providerResponseConfirmed ? "fail" : "not_run",
    systemBuildStatus: "not_run",
    overallPass: factPass,
    failureClass: factPass ? null : input.evidence.failureClass === "TRANSPORT"
      ? safeFailureCode(input.errorClass) ?? "V2_2_PROVIDER_FAILURE"
      : input.evidence.structuralSubtype !== "NONE" && input.evidence.structuralSubtype !== "NOT_RUN"
        ? input.evidence.structuralSubtype
        : input.evidence.semanticFailureCode ?? "V2_2_FACT_EXTRACTION_FAILURE",
    cloudflareErrorCode: safeFailureCode(input.metadata.errorCode),
    safeMetrics: null,
    boundedSchema: null,
    boundedV22: input.evidence,
  };
}

function requestFingerprint(request: ReturnType<typeof buildAmbientV2_2RealMiniRequest>): string {
  const messageShape = request.messages.map((message) => `${message.role}-${message.content.length}`).join("-");
  return `v22-${messageShape}-${request.max_tokens}-${request.temperature}-structured`;
}

function emptyFactSet(): AmbientV2_2FactSet {
  return { operations: [], abnormalities: [] };
}

function factsFromDeterministicEvents(
  events: readonly { event: "mortality" | "cull" | "abnormal"; quantity: number | null; detail?: string }[],
): AmbientV2_2FactSet {
  return {
    operations: events
      .filter((event): event is { event: "mortality" | "cull"; quantity: number | null } => event.event === "mortality" || event.event === "cull")
      .map((event) => ({ type: event.event, quantity: event.quantity })),
    abnormalities: events
      .filter((event): event is { event: "abnormal"; quantity: number | null; detail: string } => event.event === "abnormal" && typeof event.detail === "string")
      .map((event) => ({ detail: event.detail, quantity: event.quantity })),
  };
}

function expectedAttribution(item: AmbientV2_2MiniSuiteCase): AmbientV2_2AttributionExpectation | "NOT_EVALUATED" {
  return item.attribution ?? "NOT_EVALUATED";
}

async function executeAiAttempt(
  options: AmbientV2_2D07ConvergenceOptions,
  adapter: DirectWorkersAiRestAdapter,
  ledger: AmbientV2RealSmokeLedger,
  item: AmbientV2_2MiniSuiteCase,
  phase: AmbientV2_2D07ConvergenceAttempt["phase"],
  runNumber: number,
  callOrdinal: number,
  messageOverride?: AmbientV2MessageInput,
): Promise<AttemptOutcome> {
  const attemptId = randomUUID();
  const caseId = `V22-SMOKE-${item.safeRef}-${runNumber}`;
  const request = buildAmbientV2_2RealMiniRequest(messageOverride ?? item.message);
  await ledger.append({
    recordType: "ATTEMPT_START",
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    attemptId,
    caseId,
    safeRef: item.safeRef,
    runNumber,
    callOrdinal,
    model: PRODUCTION_AI_MODEL,
    timestamp: new Date().toISOString(),
    requestContractFingerprint: requestFingerprint(request),
    promptFingerprint: auditAmbientV2_2PromptContract().fingerprint,
    maxTokens: 1536,
    temperature: 0,
    status: "started",
  });

  const metadataBefore = safeTransportMetadata(adapter);
  let metadata = metadataBefore;
  let evidence: AmbientV2_2BoundedFactEvidence;
  let parsed: ReturnType<typeof parseAmbientV2_2ResponseBoundary>["parsed"] | null = null;
  try {
    const result = await adapter.run(PRODUCTION_AI_MODEL, request);
    metadata = safeTransportMetadata(adapter);
    const boundary = parseAmbientV2_2ResponseBoundary(result);
    parsed = boundary.parsed;
    evidence = (await import("./ambient-extraction-v2-2-real-mini-suite")).boundedEvidenceFromParsed(
      boundary.responseClass,
      boundary.parsed,
      item.expected,
      expectedAttribution(item),
    );
  } catch (error) {
    metadata = safeTransportMetadata(adapter);
    evidence = transportEvidence(metadata.errorClass ?? (error instanceof Error ? error.name : null));
  }

  const terminal = terminalRecord({
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    attemptId,
    safeRef: item.safeRef,
    caseId,
    runNumber,
    callOrdinal,
    metadata,
    errorClass: metadata.errorClass,
    evidence,
  });
  await ledger.append(terminal);
  return {
    parsed,
    attempt: {
      phase,
      runNumber,
      callOrdinal,
      safeRef: item.safeRef,
      caseId,
      providerCalls: adapter.calls,
      httpStatus: metadata.httpStatus,
      providerResponseConfirmed: metadata.providerResponseConfirmed,
      transportErrorClass: metadata.errorClass,
      transportErrorCode: metadata.errorCode,
      transportSubtype: metadata.transportSubtype,
      transportErrorName: metadata.transportErrorName,
      transportCauseName: metadata.transportCauseName,
      transportCauseCode: metadata.transportCauseCode,
      transportElapsedMs: metadata.transportElapsedMs,
      terminalRecordType: terminal.recordType,
      evidence,
    },
  };
}

function summarizeD07LocalClaim(
  item: AmbientV2_2MiniSuiteCase,
): AmbientV2_2D07ConvergencePhaseSummary {
  const claim = claimAmbientV2_2DeterministicOperations(item.message);
  const actual = factsFromDeterministicEvents(claim.operations.map((operation) => ({
    event: operation.type,
    quantity: operation.quantity,
  })));
  const evaluation = evaluateAmbientV2_2Facts(actual, item.expected, "NOT_EVALUATED");
  const actualCount = actual.operations.length + actual.abnormalities.length;
  const expectedCount = item.expected.operations.length + item.expected.abnormalities.length;
  const pass = claim.route === "EVENT_ONLY"
    && !claim.residualRequiresAi
    && evaluation.factExtractionPass;
  return {
    status: pass ? "PASS" : "FAIL",
    executionMode: "LOCAL_DETERMINISTIC",
    runs: 0,
    providerCalls: 0,
    structuralPasses: 0,
    factPasses: pass ? 1 : 0,
    technicalFailures: 0,
    extraFactCount: Math.max(0, actualCount - expectedCount),
    wrongCollectionFactCount: 0,
    attempts: [],
  };
}

function relationCandidateFromFacts(
  message: AmbientV2MessageInput,
  facts: AmbientV2_2FactSet,
): AmbientV2RelationCandidate[] {
  return [
    ...facts.operations.map((operation) => ({
      sourceRef: message.safeRef,
      sourceIdentity: message.sourceIdentity,
      event: operation.type,
      quantity: operation.quantity,
      groupKey: message.groupKey,
      contextKey: message.contextKey,
      pending: true,
      isOfficial: false,
    })),
    ...facts.abnormalities.map((abnormality) => ({
      sourceRef: message.safeRef,
      sourceIdentity: message.sourceIdentity,
      event: "abnormal" as const,
      quantity: abnormality.quantity,
      groupKey: message.groupKey,
      contextKey: message.contextKey,
      pending: true,
      isOfficial: false,
    })),
  ];
}

function safeSmokeFactEvaluation(
  actual: AmbientV2_2FactSet,
  expected: AmbientV2_2FactSet,
  attribution: AmbientV2_2AttributionExpectation | "NOT_EVALUATED",
): ReturnType<typeof evaluateAmbientV2_2Facts> {
  return evaluateAmbientV2_2Facts(actual, expected, attribution);
}

function duplicateFactCount(facts: AmbientV2_2FactSet): number {
  const operationDuplicates = facts.operations.length - new Set(
    facts.operations.map((operation) => `${operation.type}:${String(operation.quantity)}`),
  ).size;
  const abnormalityDuplicates = facts.abnormalities.length - new Set(
    facts.abnormalities.map((abnormality) => `${abnormality.detail}:${String(abnormality.quantity)}`),
  ).size;
  return Math.max(0, operationDuplicates) + Math.max(0, abnormalityDuplicates);
}

function summarizeSmoke(
  fixture: AmbientV2_2DevSmokeFixture,
  aiAttempts: readonly AmbientV2_2D07ConvergenceAttempt[],
  parsedByRef: ReadonlyMap<string, ReturnType<typeof parseAmbientV2_2ResponseBoundary>["parsed"] | null>,
): AmbientV2_2DevSmokeSummary {
  const attemptByRef = new Map<string, AmbientV2_2D07ConvergenceAttempt>(aiAttempts.map((attempt) => [attempt.safeRef, attempt]));
  const pending: AmbientV2RelationCandidate[] = [];
  let deterministicResolved = 0;
  let relationOnlyMessages = 0;
  let relationResolverCalls = 0;
  let noEventFastPath = 0;
  let relationCountActual = 0;
  let chatContamination = 0;
  let wrongCollectionFactCount = 0;
  let hallucinatedExtraFactCount = 0;
  let duplicateEventCount = 0;
  let wrongFarmAssignmentCount = 0;
  let factPasses = 0;
  let structuralPasses = 0;
  let technicalFailures = 0;
  let d04FactPass: AmbientV2_2DevSmokeSummary["d04FactPass"] = "NOT_RUN";
  let d04AttributionStatus: AmbientV2_2DevSmokeSummary["d04AttributionStatus"] = "NOT_RUN";
  let failedCase: string | null = null;
  let semanticEventCountActual = 0;

  for (const fixtureItem of fixture.messages) {
    const { message, expected } = fixtureItem;
    const selected = fixture.selectedRefs.includes(fixtureItem.safeRef);
    const route = classifyAmbientV2MessageRoute(message, selected);
    let actual = emptyFactSet();
    const attribution: AmbientV2_2AttributionExpectation | "NOT_EVALUATED" = fixtureItem.attribution ?? "NOT_EVALUATED";
    if (!selected) {
      if (!ambientMessageMayBeRelevant(message.text)) noEventFastPath += 1;
    } else if (route === "RELATION_ONLY") {
      relationOnlyMessages += 1;
      relationResolverCalls += 1;
      const relation = resolveAmbientV2Relation(message.text, pending, {
        groupKey: message.groupKey,
        contextKey: message.contextKey,
      });
      if (relation?.status === "resolved" && relation.targetRef === fixtureItem.relationTargetRef) relationCountActual += 1;
    } else {
      const claim = claimAmbientV2_2DeterministicOperations(message);
      const deterministicFacts = factsFromDeterministicEvents(claim.operations.map((operation) => ({
        event: operation.type,
        quantity: operation.quantity,
      })));
      if (!claim.residualRequiresAi) {
        deterministicResolved += 1;
        actual = deterministicFacts;
        if (actual.operations.length + actual.abnormalities.length === 0) noEventFastPath += 1;
      } else {
        actual = deterministicFacts;
        const attempt = attemptByRef.get(fixtureItem.safeRef);
        if (attempt) {
          const parsed = parsedByRef.get(fixtureItem.safeRef);
          if (parsed?.structuralStatus === "pass") {
            const residualFacts = factsFromAmbientV2_2Parsed(parsed);
            actual = {
              operations: [...actual.operations, ...residualFacts.operations],
              abnormalities: [...actual.abnormalities, ...residualFacts.abnormalities],
            };
          }
        }
      }
      pending.push(...relationCandidateFromFacts(message, actual));
    }

    const evaluation = safeSmokeFactEvaluation(actual, expected, attribution);
    if (evaluation.factExtractionPass) factPasses += 1;
    const expectedCount = expected.operations.length + expected.abnormalities.length;
    const actualCount = actual.operations.length + actual.abnormalities.length;
    semanticEventCountActual += actualCount;
    hallucinatedExtraFactCount += Math.max(0, actualCount - expectedCount);
    duplicateEventCount += duplicateFactCount(actual);
    if (fixtureItem.safeRef === "D01" || fixtureItem.safeRef === "D08") {
      chatContamination += actualCount;
    }
    const context = resolveAmbientV2_2Context({
      farmText: message.farmText,
      contextFarmCandidates: message.contextFarmCandidates,
    });
    if (fixtureItem.contextResolution && context.status !== fixtureItem.contextResolution) wrongFarmAssignmentCount += 1;
    if (!evaluation.factExtractionPass && !failedCase) failedCase = fixtureItem.safeRef;
    if (fixtureItem.safeRef === "D04") {
      d04FactPass = evaluation.factExtractionPass ? "YES" : "NO";
      d04AttributionStatus = evaluation.quantityAttributionStatus;
    }
  }

  const aiExtractionRequired = fixture.selectedRefs.filter((safeRef) => {
    const item = fixture.messages.find((candidate) => candidate.safeRef === safeRef);
    if (!item || classifyAmbientV2MessageRoute(item.message, true) === "RELATION_ONLY") return false;
    return claimAmbientV2_2DeterministicOperations(item.message).residualRequiresAi;
  }).length;
  wrongCollectionFactCount += aiAttempts.reduce((sum, attempt) => sum + (attempt.evidence.wrongCollectionFactCount ?? 0), 0);
  structuralPasses = aiAttempts.filter((attempt) => attempt.evidence.structuralStatus === "PASS").length;
  technicalFailures = aiAttempts.filter((attempt) => attempt.evidence.failureClass === "TRANSPORT").length;
  const allAiFactPass = aiAttempts.length === aiExtractionRequired
    && aiAttempts.every((attempt) => attempt.evidence.factExtractionPass === "YES");
  const allDeterministicAndRelationPass = factPasses === fixture.messages.length;
  const status = allAiFactPass
    && allDeterministicAndRelationPass
    && relationCountActual === 1
    && semanticEventCountActual === 6
    && chatContamination === 0
    && wrongCollectionFactCount === 0
    && hallucinatedExtraFactCount === 0
    && duplicateEventCount === 0
    && wrongFarmAssignmentCount === 0
    ? "PASS"
    : "FAIL";
  if (status === "FAIL" && !failedCase) {
    failedCase = aiAttempts.find((attempt) => attempt.evidence.factExtractionPass !== "YES")?.safeRef ?? "AGGREGATE";
  }
  return {
    status,
    messagesTotal: fixture.messages.length,
    deterministicResolved,
    aiExtractionRequired,
    relationOnlyMessages,
    relationResolverCalls,
    noEventFastPath,
    providerCalls: aiAttempts.length,
    structuralPasses,
    factPasses,
    technicalFailures,
    semanticEventCountExpected: 6,
    semanticEventCountActual,
    relationCountExpected: 1,
    relationCountActual,
    chatContamination,
    wrongCollectionFactCount,
    hallucinatedExtraFactCount,
    duplicateEventCount,
    wrongFarmAssignmentCount,
    unsafeSalvage: 0,
    autoEventSplit: "NO",
    autoQuantityPropagation: "NO",
    semanticDedupe: "NO",
    d04FactPass,
    d04AttributionStatus,
    failedCase,
    attempts: [...aiAttempts],
  };
}

/**
 * Run the authorized V2.2 convergence gate. D07 is proven by the existing
 * deterministic parser locally; only residual semantic cases enter the
 * serial developer smoke. This module is developer-only and has no
 * Production path.
 */
export async function runAmbientV2_2D07Convergence(
  options: AmbientV2_2D07ConvergenceOptions,
): Promise<AmbientV2_2D07ConvergenceResult> {
  const d07Case = options.cases.find((item) => item.safeRef === "D07");
  if (!d07Case) throw new Error("V2_2_D07_CASE_MISSING");
  const smokeCases = new Map(options.cases.map((item) => [item.safeRef, item]));
  for (const safeRef of AMBIENT_V2_2_D07_CONVERGENCE_SMOKE_AI_CASE_REFS) {
    if (!smokeCases.has(safeRef)) throw new Error(`V2_2_SMOKE_CASE_MISSING_${safeRef}`);
  }

  const ledger = new AmbientV2RealSmokeLedger(options.ledgerPath, {
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    maxCalls: AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS,
  });
  const existing = await ledger.read();
  if (existing.records.length > 0) throw new Error("V2_2_D07_CONVERGENCE_LEDGER_NOT_EMPTY");
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
    maxCalls: AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS,
  });
  const attempts: AmbientV2_2D07ConvergenceAttempt[] = [];
  const d07 = summarizeD07LocalClaim(d07Case);
  let smoke: AmbientV2_2DevSmokeSummary;
  if (d07.status !== "PASS") {
    const plan = planAmbientExtractionV2_2(
      options.smokeFixture.messages.map((item) => item.message),
      options.smokeFixture.selectedRefs,
    );
    smoke = {
      status: "NOT_RUN",
      messagesTotal: options.smokeFixture.messages.length,
      deterministicResolved: plan.deterministicResolved,
      aiExtractionRequired: plan.aiRequired,
      relationOnlyMessages: plan.relationOnlyMessages,
      relationResolverCalls: plan.relationResolverCalls,
      noEventFastPath: options.smokeFixture.messages.filter((item) => !options.smokeFixture.selectedRefs.includes(item.safeRef)
        && !ambientMessageMayBeRelevant(item.message.text)).length,
      providerCalls: 0,
      structuralPasses: 0,
      factPasses: 0,
      technicalFailures: 0,
      semanticEventCountExpected: 6,
      semanticEventCountActual: 0,
      relationCountExpected: 1,
      relationCountActual: 0,
      chatContamination: 0,
      wrongCollectionFactCount: 0,
      hallucinatedExtraFactCount: 0,
      duplicateEventCount: 0,
      wrongFarmAssignmentCount: 0,
      unsafeSalvage: 0,
      autoEventSplit: "NO",
      autoQuantityPropagation: "NO",
      semanticDedupe: "NO",
      d04FactPass: "NOT_RUN",
      d04AttributionStatus: "NOT_RUN",
      failedCase: "D07",
      attempts: [],
    };
  } else {
    const smokeAttempts: AmbientV2_2D07ConvergenceAttempt[] = [];
    const smokeParsedByRef = new Map<string, ReturnType<typeof parseAmbientV2_2ResponseBoundary>["parsed"] | null>();
    const smokeAiRefs = AMBIENT_V2_2_D07_CONVERGENCE_SMOKE_AI_CASE_REFS.filter((safeRef) => {
      const fixtureItem = options.smokeFixture.messages.find((item) => item.safeRef === safeRef);
      return fixtureItem !== undefined
        && fixtureItem.message.selected !== false
        && classifyAmbientV2MessageRoute(fixtureItem.message, true) !== "RELATION_ONLY"
        && claimAmbientV2_2DeterministicOperations(fixtureItem.message).residualRequiresAi;
    });
    for (const safeRef of smokeAiRefs) {
      const item = smokeCases.get(safeRef)!;
      const claim = claimAmbientV2_2DeterministicOperations(item.message);
      if (!claim.residualRequiresAi) throw new Error(`V2_2_UNEXPECTED_AI_PLAN_${safeRef}`);
      const residualItem = claim.operations.length > 0
        ? {
          ...item,
          expected: {
            operations: [],
            abnormalities: item.expected.abnormalities,
          },
          attribution: undefined,
        }
        : item;
      const outcome = await executeAiAttempt(
        options,
        adapter,
        ledger,
        residualItem,
        "DEV_SMOKE_8",
        1,
        attempts.length + smokeAttempts.length + 1,
        { ...item.message, text: claim.residualMessage },
      );
      smokeAttempts.push(outcome.attempt);
      smokeParsedByRef.set(safeRef, outcome.parsed);
      attempts.push(outcome.attempt);
    }
    smoke = summarizeSmoke(options.smokeFixture, smokeAttempts, smokeParsedByRef);
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
  const terminals = finalLedger.records.filter((record): record is AmbientV2AttemptTerminalRecord =>
    record.recordType === "ATTEMPT_SUCCESS"
      || record.recordType === "ATTEMPT_FAILURE"
      || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION",
  );
  const terminalIds = new Set(terminals.map((record) => record.attemptId));
  const orphanAttempts = finalLedger.records.filter((record) => record.recordType === "ATTEMPT_START"
    && !terminalIds.has(record.attemptId)).length;
  return {
    experimentId: options.experimentId,
    matrixRunId: options.matrixRunId,
    wireContractVersion: AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
    model: PRODUCTION_AI_MODEL,
    temperature: 0,
    maxTokens: 1536,
    executionMode: AMBIENT_V2_2_D07_CONVERGENCE_EXECUTION_MODE,
    maxConcurrentAiCalls: 1,
    retries: 0,
    totalProviderCallLimit: AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS,
    totalProviderCalls: attempts.length,
    d07,
    smoke,
    attempts,
    ledger: {
      attemptStarts: finalLedger.records.filter((record) => record.recordType === "ATTEMPT_START").length,
      terminalRecords: terminals.length,
      orphanAttempts,
      invalidLineCount: finalLedger.invalidLineCount,
      processStarted: finalLedger.records.filter((record) => record.recordType === "PROCESS_STARTED").length,
      processExited: finalLedger.records.filter((record) => record.recordType === "PROCESS_EXITED").length,
    },
    sideEffectFree: true,
  };
}
