import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  AmbientV2DirectRestAdapter,
  AMBIENT_V2_PRODUCTION_MAX_TOKENS,
  AMBIENT_V2_PRODUCTION_TEMPERATURE,
} from "./ambient-extraction-v2-rest";
import { ambientV2StructuredExecutionOptions } from "./ambient-extraction-v2-structured-output";
import {
  evaluateAmbientExtractionV2,
  planAmbientExtractionV2Batch,
  runAmbientExtractionV2Batch,
  type AmbientV2AiEventProposal,
  type AmbientV2AiAdapter,
  type AmbientV2AiRequest,
  type AmbientV2BatchResult,
  type AmbientV2ExpectedMessage,
  type AmbientV2MessageInput,
  type AmbientV2MessageResult,
  type AmbientV2ExecutionPlan,
  type AmbientV2ParsedResponse,
  type AmbientV2SafeValueType,
  type AmbientV2StructuralSubtype,
} from "./ambient-extraction-v2";
import { ambientV2RequestPromptFingerprint } from "./ambient-extraction-v2";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";
import type {
  AmbientV2_2ResponseClass,
  AmbientV2_2SemanticStatus,
  AmbientV2_2StructuralSubtype,
} from "./ambient-extraction-v2-2";

export const AMBIENT_V2_REAL_SMOKE_MODEL = PRODUCTION_AI_MODEL;
export const AMBIENT_V2_REAL_SMOKE_TEMPERATURE = AMBIENT_V2_PRODUCTION_TEMPERATURE;
export const AMBIENT_V2_REAL_SMOKE_MAX_TOKENS = AMBIENT_V2_PRODUCTION_MAX_TOKENS;
export const AMBIENT_V2_REAL_SMOKE_PHASE_1_RUNS = 3;
export const AMBIENT_V2_REAL_SMOKE_PHASE_2_RUNS = 2;
export const AMBIENT_V2_REAL_SMOKE_MAX_RUNS = AMBIENT_V2_REAL_SMOKE_PHASE_1_RUNS + AMBIENT_V2_REAL_SMOKE_PHASE_2_RUNS;

type V2JsonStatus = "pass" | "fail" | "not_run" | "unknown";
type V2TerminalKind = "ATTEMPT_SUCCESS" | "ATTEMPT_FAILURE" | "ATTEMPT_UNKNOWN_TERMINATION";

export interface AmbientV2SafeEventSnapshot {
  event: "mortality" | "cull" | "abnormal";
  quantity: number | null;
}

export interface AmbientV2SafeMessageSnapshot {
  safeRef: string;
  route?: "RELATION_ONLY" | "MIXED_EVENT_AND_RELATION" | "EVENT_ONLY" | "NONE" | "ROUTING_UNRESOLVED";
  extractionMode: "deterministic" | "ai" | "relation" | "none";
  structuralStatus: "pass" | "fail" | "not_applicable";
  semanticStatus: "resolved" | "partial" | "unresolved" | "none";
  technicalStatus: "not_attempted" | "success" | "failure";
  eventCount: number;
  eventTypes: Array<"mortality" | "cull" | "abnormal">;
  quantities: Array<number | null>;
  relationStatus: "resolved" | "unresolved" | "none";
  relationTargetRef?: string;
  eventDiagnostics: AmbientV2SafeEventSemanticSnapshot[];
}

export type AmbientV2SafeDetailMatch = "YES" | "NO" | "NOT_APPLICABLE";

/** The comparison fields are explicit so a forensic label cannot silently
 * drop the abnormal-event detail field. This is diagnostic metadata only. */
export const AMBIENT_V2_DUPLICATE_TUPLE_FIELDS = ["event", "quantity", "detail"] as const;

export type AmbientV2D03SemanticSubtype =
  | "EXACT_DUPLICATE_EVENT"
  | "SPURIOUS_SECOND_EVENT"
  | "DETAIL_MISMATCH"
  | "DETAIL_MISSING"
  | "MULTIPLE_SEMANTIC_ERRORS"
  | "UNKNOWN";

export interface AmbientV2D03SemanticDiagnostic {
  eventCount: number;
  event1TypePass: "YES" | "NO" | "NOT_APPLICABLE";
  event1QuantityPass: "YES" | "NO" | "NOT_APPLICABLE";
  event1DetailPresent: "YES" | "NO" | "NOT_APPLICABLE";
  event1DetailValidShort: "YES" | "NO" | "NOT_APPLICABLE";
  event1DetailCodePointCount: number | null;
  event1DetailKind: "STRING" | "NULL" | "OTHER" | "NOT_APPLICABLE";
  event1DetailMatchesExpected: "YES" | "NO" | "NOT_APPLICABLE";
  event1MatchesExpected: "YES" | "NO" | "NOT_APPLICABLE";
  event2Present: "YES" | "NO";
  event2TypePass: "YES" | "NO" | "NOT_APPLICABLE";
  event2QuantityPass: "YES" | "NO" | "NOT_APPLICABLE";
  event2DetailPresent: "YES" | "NO" | "NOT_APPLICABLE";
  event2DetailValidShort: "YES" | "NO" | "NOT_APPLICABLE";
  event2DetailCodePointCount: number | null;
  event2DetailKind: "STRING" | "NULL" | "OTHER" | "NOT_APPLICABLE";
  event2DetailMatchesExpected: "YES" | "NO" | "NOT_APPLICABLE";
  event2MatchesExpected: "YES" | "NO" | "NOT_APPLICABLE";
  event2DetailEqualsEvent1: "YES" | "NO" | "NOT_APPLICABLE";
  event2ExactlyEqualsEvent1: "YES" | "NO" | "NOT_APPLICABLE";
  semanticSubtype: AmbientV2D03SemanticSubtype | "NONE";
  semanticPass: "YES" | "NO";
}

export type AmbientV2D04FailureClass =
  | "NONE"
  | "MULTI_EVENT_BOUNDARY"
  | "CULL_SEMANTICS"
  | "ABNORMAL_SEMANTICS"
  | "CROSS_EVENT_QUANTITY_ATTRIBUTION"
  | "MULTIPLE_SEMANTIC_ERRORS"
  | "STRUCTURAL";

export interface AmbientV2D04SemanticDiagnostic {
  eventCount: number;
  eventCountPass: "YES" | "NO";
  event1EventTypePass: "YES" | "NO";
  event1QuantityPass: "YES" | "NO";
  event1DetailKind: "NULL" | "STRING" | "MISSING" | "OTHER" | "UNKNOWN";
  event1DetailNullPass: "YES" | "NO";
  event2EventTypePass: "YES" | "NO";
  event2QuantityPass: "YES" | "NO";
  event2DetailKind: "NULL" | "STRING" | "MISSING" | "OTHER" | "UNKNOWN";
  event2DetailMatchesExpected: "YES" | "NO";
  cullPass: "YES" | "NO";
  abnormalEventPass: "YES" | "NO";
  abnormalQuantityPass: "YES" | "NO";
  semanticPass: "YES" | "NO";
  failureClass: AmbientV2D04FailureClass;
}

export interface AmbientV2SafeEventSemanticSnapshot {
  eventOrdinal: number;
  eventEnum: "mortality" | "cull" | "abnormal";
  quantityKind: "positive_number" | "null";
  detailKind: "STRING" | "NULL" | "MISSING" | "OTHER";
  detailPresent: "YES" | "NO";
  detailValidShort: "YES" | "NO";
  detailCodePointCount: number | null;
  detailEqualsPreviousEvent: "YES" | "NO" | "NOT_APPLICABLE";
  detailMatchExpectedExact: AmbientV2SafeDetailMatch;
  eventMatchExpectedExact: "YES" | "NO";
  fullEventEqualsPreviousEvent: "YES" | "NO" | "NOT_APPLICABLE";
}

export interface AmbientV2SafeRunMetrics {
  messagesTotal: number;
  selectedCount: number;
  aiRequired: number;
  aiCalls: number;
  relationResolverCalls: number;
  eventsExtracted: number;
  messagesUnresolved: number;
  eventsUnresolved: number;
  technicalFailures: number;
  decisionCoverage: string;
  eventCount: number;
  relationCount: number;
  eventTypeAccuracy: string;
  quantityAccuracy: string;
  unknownQuantityAccuracy: string;
  supportRelationAccuracy: string;
  hallucinationCount: number;
  contextLineageContaminationCount: number;
  duplicateEventCount: number;
  jsonPass: boolean;
  normalizationPass: boolean;
  validationPass: boolean;
  systemBuildPass: boolean;
  overallPass: boolean;
  messages: AmbientV2SafeMessageSnapshot[];
  d03SemanticDiagnostic?: AmbientV2D03SemanticDiagnostic;
  d04SemanticDiagnostic?: AmbientV2D04SemanticDiagnostic;
}

export interface AmbientV2AttemptStartRecord {
  recordType: "ATTEMPT_START";
  experimentId: string;
  matrixRunId: string;
  attemptId: string;
  caseId: string;
  safeRef: string;
  runNumber: number;
  callOrdinal: number;
  model: string;
  timestamp: string;
  requestContractFingerprint: string;
  promptFingerprint?: string;
  maxTokens: number;
  temperature: number;
  status: "started";
}

export interface AmbientV2BoundedSchemaSnapshot {
  structuralStatus: "pass" | "fail" | "not_applicable";
  structuralSubtype: AmbientV2StructuralSubtype | null;
  semanticSubtype: AmbientV2StructuralSubtype | null;
  jsonParseStatus: "pass" | "fail" | "not_run";
  topLevelType: AmbientV2SafeValueType;
  topLevelKeys: string[];
  eventsKeyPresent: boolean;
  eventsValueType: AmbientV2SafeValueType;
  eventItemCount: number | null;
  firstInvalidEventIndex: number | null;
  firstInvalidField: "event" | "quantity" | "detail" | null;
  unknownKeyNames: string[];
  detailCodePointCount: number | null;
}

/**
 * Value-free V2.2 fact-gate evidence stored beside the existing V2 smoke
 * terminal record. It intentionally contains no source, response, or fact
 * detail values; fact extraction and quantity attribution remain separate.
 */
export interface AmbientV2_2BoundedFactEvidence {
  responseClass: AmbientV2_2ResponseClass;
  jsonParseStatus: "PASS" | "FAIL" | "NOT_RUN";
  structuralStatus: "PASS" | "FAIL" | "NOT_RUN";
  structuralSubtype: AmbientV2_2StructuralSubtype | "NONE" | "NOT_RUN";
  semanticStatus: AmbientV2_2SemanticStatus | "NOT_RUN";
  operationFactCount: number | null;
  abnormalityFactCount: number | null;
  actualFactCount: number | null;
  expectedFactCount: number | null;
  /** Number of facts observed in the opposite V2.2 collection. Bounded and value-free. */
  wrongCollectionFactCount?: number | null;
  operationFactPass: "YES" | "NO" | "NOT_EVALUATED";
  abnormalityFactPass: "YES" | "NO" | "NOT_EVALUATED";
  factExtractionPass: "YES" | "NO" | "NOT_EVALUATED";
  quantityAttributionStatus: "PASS" | "FAIL" | "UNRESOLVED" | "NOT_EVALUATED";
  semanticFailureCode: string | null;
  failureClass: "NONE" | "STRUCTURAL" | "FACT_EXTRACTION" | "TRANSPORT";
}

export interface AmbientV2AttemptTerminalRecord {
  recordType: V2TerminalKind;
  experimentId: string;
  matrixRunId: string;
  attemptId: string;
  caseId: string;
  safeRef: string;
  runNumber: number;
  callOrdinal: number;
  completedAt: string;
  transportStatus: "success" | "failure" | "unknown";
  httpStatus: number | null;
  providerResponseConfirmed: boolean | null;
  jsonStatus: V2JsonStatus;
  normalizationStatus: V2JsonStatus;
  validationStatus: V2JsonStatus;
  systemBuildStatus: V2JsonStatus;
  overallPass: boolean | null;
  failureClass: string | null;
  cloudflareErrorCode: string | null;
  safeMetrics: AmbientV2SafeRunMetrics | null;
  boundedSchema?: AmbientV2BoundedSchemaSnapshot | null;
  boundedV22?: AmbientV2_2BoundedFactEvidence | null;
  processExitCode?: number | null;
  signal?: string | null;
}

export interface AmbientV2ProcessRecord {
  recordType: "PROCESS_STARTED" | "PROCESS_EXITED" | "PROCESS_FATAL";
  experimentId: string;
  matrixRunId: string;
  timestamp: string;
  exitCode?: number | null;
  signal?: string | null;
  markerSeen?: boolean;
  stderrClass?: "EMPTY" | "NONEMPTY" | "NOT_CAPTURED";
  fatalClass?: string;
}

export type AmbientV2RealSmokeLedgerRecord =
  | AmbientV2AttemptStartRecord
  | AmbientV2AttemptTerminalRecord
  | AmbientV2ProcessRecord;

export interface AmbientV2RealSmokeLedgerRead {
  records: AmbientV2RealSmokeLedgerRecord[];
  invalidLineCount: number;
}

export interface AmbientV2RealSmokeFixture {
  messages: readonly AmbientV2MessageInput[];
  expectedMessages: readonly AmbientV2ExpectedMessage[];
  selectedRefs: readonly string[];
}

export interface AmbientV2RealSmokeRunReport {
  runNumber: number;
  status: "PASS" | "FAIL" | "NOT_COMPLETED";
  expectedProviderCalls: number;
  providerAttempts: number;
  providerResponses: number;
  technicalFailures: number;
  plan: AmbientV2ExecutionPlan;
  metrics: AmbientV2SafeRunMetrics | null;
  d04CullPass: boolean | null;
  d04AbnormalDetailPass: boolean | null;
  d04AbnormalQuantityPass: boolean | null;
  failureClass: string | null;
}

export interface AmbientV2RealSmokeReport {
  experimentId: string;
  matrixRunId: string;
  model: string;
  temperature: 0;
  maxTokens: 1536;
  executionMode: "SERIAL";
  maxConcurrentAiCalls: 1;
  plan: AmbientV2ExecutionPlan;
  phase1MaxCalls: number;
  phase2MaxAdditionalCalls: number;
  totalProviderCallLimit: number;
  runs: AmbientV2RealSmokeRunReport[];
  phase1: "3/3_PASS" | "FAIL" | "NOT_COMPLETED";
  phase2: "2/2_PASS" | "FAIL" | "NOT_RUN" | "NOT_COMPLETED";
  overallStatus: "5/5_PASS" | "FAIL" | "NOT_COMPLETED";
  totalProviderCalls: number;
  successfulProviderResponses: number;
  technicalFailures: number;
  orphanAttempts: number;
  http429Count: number;
  error3036Count: number;
  error3040Count: number;
  timeoutCount: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  peakConcurrency: 1;
  hardLimitRemaining: number;
  sideEffectFree: true;
}

interface PendingV2Attempt {
  attemptId: string;
  caseId: string;
  safeRef: string;
  runNumber: number;
  callOrdinal: number;
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
}

interface V2LedgerOptions {
  experimentId: string;
  matrixRunId: string;
  maxCalls: number;
}

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,96}$/u;
const SAFE_UUID = /^[0-9a-f-]{16,96}$/iu;
const SAFE_MODEL = /^[A-Za-z0-9_@./:-]{1,120}$/u;
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,96}$/u;
const SAFE_REF = /^[A-Za-z0-9_.:-]{1,40}$/u;
const FORBIDDEN_PERSISTED_KEYS = new Set([
  "authorization",
  "token",
  "prompt",
  "completion",
  "detail",
  "source",
  "raw",
  "rawtext",
  "sourcetext",
  "messagecontent",
  "reasoning",
]);

function boundedErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "EVALUATION_FAILURE";
  return SAFE_CODE.test(name) ? name : "EVALUATION_FAILURE";
}

function assertSafePrimitive(value: unknown, field: string): void {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`V2_LEDGER_UNSAFE_${field}`);
}

function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PERSISTED_KEYS.has(key.toLowerCase())) throw new Error(`V2_LEDGER_FORBIDDEN_${key}`);
    assertNoForbiddenKeys(child);
  }
}

function assertSafeRecord(record: AmbientV2RealSmokeLedgerRecord): void {
  assertNoForbiddenKeys(record);
  assertSafePrimitive(record.experimentId, "EXPERIMENT_ID");
  assertSafePrimitive(record.matrixRunId, "MATRIX_RUN_ID");
  if (record.recordType === "ATTEMPT_START" || record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION") {
    assertSafePrimitive(record.attemptId, "ATTEMPT_ID");
    assertSafePrimitive(record.caseId, "CASE_ID");
    assertSafePrimitive(record.safeRef, "SAFE_REF");
    if (!SAFE_UUID.test(record.attemptId) || !SAFE_UUID.test(record.matrixRunId)) throw new Error("V2_LEDGER_UNSAFE_UUID");
    if (!Number.isInteger(record.runNumber) || record.runNumber < 1 || record.runNumber > AMBIENT_V2_REAL_SMOKE_MAX_RUNS) throw new Error("V2_LEDGER_UNSAFE_RUN_NUMBER");
    if (!Number.isInteger(record.callOrdinal) || record.callOrdinal < 1 || record.callOrdinal > 100) throw new Error("V2_LEDGER_UNSAFE_CALL_ORDINAL");
  }
  if (record.recordType === "ATTEMPT_START") {
    if (!SAFE_MODEL.test(record.model) || record.maxTokens !== AMBIENT_V2_REAL_SMOKE_MAX_TOKENS || record.temperature !== AMBIENT_V2_REAL_SMOKE_TEMPERATURE) {
      throw new Error("V2_LEDGER_UNEXPECTED_INFERENCE_PARAMETERS");
    }
    if (!SAFE_CODE.test(record.requestContractFingerprint)) throw new Error("V2_LEDGER_UNSAFE_FINGERPRINT");
    if (record.promptFingerprint !== undefined && !SAFE_CODE.test(record.promptFingerprint)) throw new Error("V2_LEDGER_UNSAFE_PROMPT_FINGERPRINT");
  }
  if (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION") {
    if (record.failureClass !== null && !SAFE_CODE.test(record.failureClass)) throw new Error("V2_LEDGER_UNSAFE_FAILURE_CLASS");
    if (record.cloudflareErrorCode !== null && !SAFE_CODE.test(record.cloudflareErrorCode)) throw new Error("V2_LEDGER_UNSAFE_ERROR_CODE");
    if (record.processExitCode !== undefined && record.processExitCode !== null && (!Number.isInteger(record.processExitCode) || record.processExitCode < -1 || record.processExitCode > 255)) {
      throw new Error("V2_LEDGER_UNSAFE_EXIT_CODE");
    }
    if (record.signal !== undefined && record.signal !== null && !SAFE_CODE.test(record.signal)) throw new Error("V2_LEDGER_UNSAFE_SIGNAL");
    if (record.boundedV22 !== undefined && record.boundedV22 !== null) assertSafeV22Evidence(record.boundedV22);
  }
}

function assertSafeV22Evidence(evidence: AmbientV2_2BoundedFactEvidence): void {
  if (!/^(?:STRUCTURED_OBJECT_RESPONSE|PROMPT_TEXT_RESPONSE|PROVIDER_JSON_MODE_ERROR|OTHER)$/u.test(evidence.responseClass)) {
    throw new Error("V2_LEDGER_UNSAFE_V22_RESPONSE_CLASS");
  }
  if (!/^(?:PASS|FAIL|NOT_RUN)$/u.test(evidence.jsonParseStatus)
    || !/^(?:PASS|FAIL|NOT_RUN)$/u.test(evidence.structuralStatus)
    || !/^(?:resolved|partial|unresolved|none|NOT_RUN)$/u.test(evidence.semanticStatus)
    || !/^(?:YES|NO|NOT_EVALUATED)$/u.test(evidence.operationFactPass)
    || !/^(?:YES|NO|NOT_EVALUATED)$/u.test(evidence.abnormalityFactPass)
    || !/^(?:YES|NO|NOT_EVALUATED)$/u.test(evidence.factExtractionPass)
    || !/^(?:PASS|FAIL|UNRESOLVED|NOT_EVALUATED)$/u.test(evidence.quantityAttributionStatus)
    || !/^(?:NONE|STRUCTURAL|FACT_EXTRACTION|TRANSPORT)$/u.test(evidence.failureClass)) {
    throw new Error("V2_LEDGER_UNSAFE_V22_STATUS");
  }
  if (!/^(?:NONE|NOT_RUN|[A-Z0-9_]{1,96})$/u.test(evidence.structuralSubtype)) {
    throw new Error("V2_LEDGER_UNSAFE_V22_SUBTYPE");
  }
  if (evidence.semanticFailureCode !== null && !SAFE_CODE.test(evidence.semanticFailureCode)) {
    throw new Error("V2_LEDGER_UNSAFE_V22_FAILURE_CODE");
  }
  for (const value of [evidence.operationFactCount, evidence.abnormalityFactCount, evidence.actualFactCount, evidence.expectedFactCount, evidence.wrongCollectionFactCount ?? null]) {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 32)) throw new Error("V2_LEDGER_UNSAFE_V22_COUNT");
  }
}

function isLedgerRecord(value: unknown): value is AmbientV2RealSmokeLedgerRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as { recordType?: unknown; experimentId?: unknown; matrixRunId?: unknown };
  return typeof record.recordType === "string" && typeof record.experimentId === "string" && typeof record.matrixRunId === "string";
}

export async function readAmbientV2RealSmokeLedger(path: string): Promise<AmbientV2RealSmokeLedgerRead> {
  let content: string;
  try {
    content = await readFile(path, { encoding: "utf8" });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "ENOENT") return { records: [], invalidLineCount: 0 };
    throw new Error("V2_LEDGER_READ_FAILURE");
  }
  const records: AmbientV2RealSmokeLedgerRecord[] = [];
  let invalidLineCount = 0;
  for (const line of content.split(/\r?\n/u).filter(Boolean)) {
    try {
      const value: unknown = JSON.parse(line);
      if (!isLedgerRecord(value)) throw new Error("invalid record");
      assertSafeRecord(value);
      records.push(value);
    } catch {
      invalidLineCount += 1;
    }
  }
  return { records, invalidLineCount };
}

export class AmbientV2RealSmokeLedger {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(readonly path: string, readonly options: V2LedgerOptions) {
    assertSafePrimitive(options.experimentId, "EXPERIMENT_ID");
    assertSafePrimitive(options.matrixRunId, "MATRIX_RUN_ID");
    if (!SAFE_UUID.test(options.matrixRunId) || !Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 100) throw new Error("V2_LEDGER_OPTIONS_INVALID");
  }

  async append(record: AmbientV2RealSmokeLedgerRecord): Promise<void> {
    assertSafeRecord(record);
    if (record.experimentId !== this.options.experimentId || record.matrixRunId !== this.options.matrixRunId) throw new Error("V2_LEDGER_RUN_ID_MISMATCH");
    const operation = this.writeChain.then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        const handle = await open(this.path, "a");
        try {
          await handle.appendFile(`${JSON.stringify(record)}\n`, { encoding: "utf8" });
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch {
        throw new Error("V2_TELEMETRY_DURABILITY_FAILURE");
      }
    });
    this.writeChain = operation.catch(() => undefined);
    return operation;
  }

  async read(): Promise<AmbientV2RealSmokeLedgerRead> {
    await this.writeChain;
    const result = await readAmbientV2RealSmokeLedger(this.path);
    if (result.invalidLineCount > 0) throw new Error("V2_LEDGER_CORRUPT");
    return result;
  }

  async countStarts(): Promise<number> {
    const { records } = await this.read();
    return records.filter((record) => record.recordType === "ATTEMPT_START" && record.experimentId === this.options.experimentId).length;
  }

  async orphanStarts(): Promise<AmbientV2AttemptStartRecord[]> {
    const { records } = await this.read();
    const terminalIds = new Set(records
      .filter((record): record is AmbientV2AttemptTerminalRecord => record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
      .map((record) => record.attemptId));
    return records.filter((record): record is AmbientV2AttemptStartRecord => record.recordType === "ATTEMPT_START" && !terminalIds.has(record.attemptId));
  }
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

type AmbientV2EventTuple = Pick<AmbientV2AiEventProposal, "event" | "quantity" | "detail">;

function sameEventTuple(a: AmbientV2EventTuple, b: AmbientV2EventTuple): boolean {
  return a.event === b.event
    && a.quantity === b.quantity
    && (a.detail ?? undefined) === (b.detail ?? undefined);
}

function sameEventDetail(a: AmbientV2EventTuple, b: AmbientV2EventTuple): boolean {
  return (a.detail ?? undefined) === (b.detail ?? undefined);
}

/**
 * Persist only semantic classes and comparisons. Actual detail/source values
 * never leave this function, and the expected detail is compared in memory.
 */
export function buildAmbientV2SafeEventSemanticTelemetry(
  message: Pick<AmbientV2MessageResult, "events" | "diagnostics">,
  expectedMessage?: Pick<AmbientV2ExpectedMessage, "events">,
): AmbientV2SafeEventSemanticSnapshot[] {
  const expectedEvents = expectedMessage?.events ?? [];
  const usedExpectedIndexes = new Set<number>();
  const validDiagnostics = message.diagnostics.schema.eventDiagnostics.filter((diagnostic) => diagnostic.valid);
  return message.events.map((event, index) => {
    const exactExpectedIndex = expectedEvents.findIndex((expected, expectedIndex) =>
      !usedExpectedIndexes.has(expectedIndex) && sameEventTuple(event, expected));
    if (exactExpectedIndex >= 0) usedExpectedIndexes.add(exactExpectedIndex);
    const sameEventAndQuantityExpected = expectedEvents.some((expected) =>
      expected.event === event.event && expected.quantity === event.quantity);
    const detailPresent = event.detail !== undefined;
    const schemaDiagnostic = validDiagnostics[index];
    const detailKind = schemaDiagnostic?.detailKind === "string"
      ? "STRING"
      : schemaDiagnostic?.detailKind === "null"
        ? "NULL"
        : schemaDiagnostic?.detailKind === "missing"
          ? "MISSING"
          : typeof event.detail === "string"
            ? "STRING"
            : "OTHER";
    const detailValidShort = detailPresent
      ? schemaDiagnostic?.detailStatus === "VALID_SHORT" ? "YES" : "NO"
      : event.event === "abnormal" ? "NO" : "YES";
    const previous = message.events[index - 1];
    return {
      eventOrdinal: index + 1,
      eventEnum: event.event,
      quantityKind: event.quantity === null ? "null" : "positive_number",
      detailKind,
      detailPresent: detailPresent ? "YES" : "NO",
      detailValidShort,
      detailCodePointCount: typeof event.detail === "string" ? Array.from(event.detail).length : null,
      detailEqualsPreviousEvent: previous
        ? sameEventDetail(event, previous) ? "YES" : "NO"
        : "NOT_APPLICABLE",
      detailMatchExpectedExact: sameEventAndQuantityExpected
        ? exactExpectedIndex >= 0 ? "YES" : "NO"
        : "NOT_APPLICABLE",
      eventMatchExpectedExact: exactExpectedIndex >= 0 ? "YES" : "NO",
      fullEventEqualsPreviousEvent: previous
        ? sameEventTuple(event, previous) ? "YES" : "NO"
        : "NOT_APPLICABLE",
    } satisfies AmbientV2SafeEventSemanticSnapshot;
  });
}

function safeD04DetailKind(
  diagnostic: AmbientV2SafeEventSemanticSnapshot | undefined,
): AmbientV2D04SemanticDiagnostic["event1DetailKind"] {
  return diagnostic?.detailKind ?? "UNKNOWN";
}

/**
 * Compare the frozen D04 cull/abnormal pair in memory and retain only bounded
 * pass flags and type classes. Actual detail values never leave this helper.
 */
export function buildAmbientV2D04SemanticDiagnostic(
  message: Pick<AmbientV2MessageResult, "events" | "diagnostics">,
  expectedMessage?: Pick<AmbientV2ExpectedMessage, "events">,
): AmbientV2D04SemanticDiagnostic {
  const expectedEvents = expectedMessage?.events ?? [];
  const cullExpected = expectedEvents.find((event) => event.event === "cull");
  const abnormalExpected = expectedEvents.find((event) => event.event === "abnormal");
  const telemetry = buildAmbientV2SafeEventSemanticTelemetry(message, expectedMessage);
  const cull = message.events.find((event) => event.event === "cull");
  const abnormal = message.events.find((event) => event.event === "abnormal");
  const cullTelemetry = telemetry.find((event) => event.eventEnum === "cull");
  const abnormalTelemetry = telemetry.find((event) => event.eventEnum === "abnormal");
  const eventCount = message.diagnostics.schema.eventItemCount ?? message.events.length;
  const eventCountPass = eventCount === expectedEvents.length ? "YES" : "NO";
  const cullTypePass = cull && cullExpected ? "YES" : "NO";
  const cullQuantityPass = cull && cullExpected && cull.quantity === cullExpected.quantity ? "YES" : "NO";
  const cullDetailKind = safeD04DetailKind(cullTelemetry);
  const cullDetailNullPass = cullDetailKind === "NULL" ? "YES" : "NO";
  const abnormalTypePass = abnormal && abnormalExpected ? "YES" : "NO";
  const abnormalQuantityPass = abnormal && abnormalExpected && abnormal.quantity === abnormalExpected.quantity ? "YES" : "NO";
  const abnormalDetailMatchesExpected = abnormal && abnormalExpected
    ? sameEventDetail(abnormal, abnormalExpected) ? "YES" : "NO"
    : "NO";
  const cullPass = cullTypePass === "YES" && cullQuantityPass === "YES" && cullDetailNullPass === "YES" ? "YES" : "NO";
  const abnormalEventPass = abnormalTypePass === "YES" && abnormalDetailMatchesExpected === "YES" ? "YES" : "NO";
  const structuralPass = message.diagnostics.schema.structuralFailureCode === null
    && message.diagnostics.schema.jsonParseStatus === "pass"
    && message.diagnostics.schema.eventsIsArray;
  const failedChecks = [eventCountPass, cullPass, abnormalEventPass, abnormalQuantityPass]
    .filter((value) => value === "NO").length;
  let failureClass: AmbientV2D04FailureClass = "NONE";
  if (!structuralPass) failureClass = "STRUCTURAL";
  else if (failedChecks > 1) failureClass = "MULTIPLE_SEMANTIC_ERRORS";
  else if (eventCountPass === "NO") failureClass = "MULTI_EVENT_BOUNDARY";
  else if (cullPass === "NO") failureClass = "CULL_SEMANTICS";
  else if (abnormalEventPass === "NO") failureClass = "ABNORMAL_SEMANTICS";
  else if (abnormalQuantityPass === "NO") failureClass = "CROSS_EVENT_QUANTITY_ATTRIBUTION";
  return {
    eventCount,
    eventCountPass,
    event1EventTypePass: cullTypePass,
    event1QuantityPass: cullQuantityPass,
    event1DetailKind: cullDetailKind,
    event1DetailNullPass: cullDetailNullPass,
    event2EventTypePass: abnormalTypePass,
    event2QuantityPass: abnormalQuantityPass,
    event2DetailKind: safeD04DetailKind(abnormalTelemetry),
    event2DetailMatchesExpected: abnormalDetailMatchesExpected,
    cullPass,
    abnormalEventPass,
    abnormalQuantityPass,
    semanticPass: structuralPass
      && eventCountPass === "YES"
      && cullPass === "YES"
      && abnormalEventPass === "YES"
      && abnormalQuantityPass === "YES"
      ? "YES"
      : "NO",
    failureClass,
  };
}

function safeD03EventDetail(
  event: AmbientV2AiEventProposal | undefined,
  diagnostic: AmbientV2SafeEventSemanticSnapshot | undefined,
  wireDiagnostic?: AmbientV2MessageResult["diagnostics"]["schema"]["eventDiagnostics"][number],
): {
  present: "YES" | "NO" | "NOT_APPLICABLE";
  validShort: "YES" | "NO" | "NOT_APPLICABLE";
  codePointCount: number | null;
  kind: "STRING" | "NULL" | "OTHER" | "NOT_APPLICABLE";
} {
  if (!event && !wireDiagnostic) {
    return { present: "NOT_APPLICABLE", validShort: "NOT_APPLICABLE", codePointCount: null, kind: "NOT_APPLICABLE" };
  }
  const wireKind = wireDiagnostic?.detailKind;
  const kind = event
    ? typeof event.detail === "string" ? "STRING" : event.detail === null ? "NULL" : "OTHER"
    : wireKind === "string" ? "STRING" : wireKind === "null" ? "NULL" : "OTHER";
  return {
    present: event ? event.detail === undefined ? "NO" : "YES" : wireKind === "missing" ? "NO" : "YES",
    validShort: event ? diagnostic?.detailValidShort ?? "NO" : wireDiagnostic?.detailStatus === "VALID_SHORT" ? "YES" : "NO",
    codePointCount: event && typeof event.detail === "string"
      ? Array.from(event.detail).length
      : wireDiagnostic?.detailCodePointCount ?? null,
    kind,
  };
}

/**
 * Compare the D03 result in memory and emit only bounded semantic evidence.
 * No detail value leaves this function; the exact tuple comparison includes
 * event, quantity, and detail.
 */
export function buildAmbientV2D03SemanticDiagnostic(
  message: Pick<AmbientV2MessageResult, "events" | "diagnostics">,
  expectedMessage?: Pick<AmbientV2ExpectedMessage, "events">,
): AmbientV2D03SemanticDiagnostic {
  const actualEvents = message.events;
  const expected = expectedMessage?.events[0];
  const event1 = actualEvents[0];
  const event2 = actualEvents[1];
  const wireDiagnostics = message.diagnostics.schema.eventDiagnostics;
  const wireEventCount = message.diagnostics.schema.eventItemCount ?? actualEvents.length;
  const event1Wire = wireDiagnostics[0];
  const event2Wire = wireDiagnostics[1];
  const telemetry = buildAmbientV2SafeEventSemanticTelemetry(message, expectedMessage);
  const event1Detail = safeD03EventDetail(event1, telemetry[0], event1Wire);
  const event2Detail = safeD03EventDetail(event2, telemetry[1], event2Wire);
  const event1TypePass = event1 && expected
    ? event1.event === expected.event ? "YES" : "NO"
    : event1Wire && expected
      ? event1Wire.eventType === expected.event ? "YES" : "NO"
      : "NOT_APPLICABLE";
  const event1QuantityPass = event1 && expected
    ? event1.quantity === expected.quantity ? "YES" : "NO"
    : event1Wire && expected
      ? expected.quantity === null && event1Wire.quantityKind === "null" ? "YES" : "NO"
      : "NOT_APPLICABLE";
  const event1DetailMatchesExpected = event1 && expected
    ? sameEventDetail(event1, expected) ? "YES" : "NO"
    : event1Wire && expected ? "NO" : "NOT_APPLICABLE";
  const event1MatchesExpected = event1 && expected
    ? sameEventTuple(event1, expected) ? "YES" : "NO"
    : event1Wire && expected ? "NO" : "NOT_APPLICABLE";
  const event2TypePass = event2 && expected
    ? event2.event === expected.event ? "YES" : "NO"
    : event2Wire && expected
      ? event2Wire.eventType === expected.event ? "YES" : "NO"
      : "NOT_APPLICABLE";
  const event2QuantityPass = event2 && expected
    ? event2.quantity === expected.quantity ? "YES" : "NO"
    : event2Wire && expected
      ? expected.quantity === null && event2Wire.quantityKind === "null" ? "YES" : "NO"
      : "NOT_APPLICABLE";
  const event2DetailMatchesExpected = event2 && expected
    ? sameEventDetail(event2, expected) ? "YES" : "NO"
    : event2Wire && expected ? "NO" : "NOT_APPLICABLE";
  const event2MatchesExpected = event2 && expected
    ? sameEventTuple(event2, expected) ? "YES" : "NO"
    : event2Wire && expected ? "NO" : "NOT_APPLICABLE";
  const event2DetailEqualsEvent1 = event2 && event1
    ? sameEventDetail(event2, event1) ? "YES" : "NO"
    : "NOT_APPLICABLE";
  const event2ExactlyEqualsEvent1 = event2 && event1
    ? sameEventTuple(event2, event1) ? "YES" : "NO"
    : "NOT_APPLICABLE";
  const semanticPass = wireEventCount === 1 && event1MatchesExpected === "YES";
  let semanticSubtype: AmbientV2D03SemanticDiagnostic["semanticSubtype"] = "UNKNOWN";
  if (semanticPass) {
    semanticSubtype = "NONE";
  } else if (!expected) {
    semanticSubtype = "UNKNOWN";
  } else if (wireEventCount === 2 && event1MatchesExpected === "YES") {
    semanticSubtype = event2ExactlyEqualsEvent1 === "YES" ? "EXACT_DUPLICATE_EVENT" : "SPURIOUS_SECOND_EVENT";
  } else if (wireEventCount === 1 && event1TypePass === "YES" && event1QuantityPass === "YES") {
    semanticSubtype = event1Detail.present === "NO" ? "DETAIL_MISSING" : "DETAIL_MISMATCH";
  } else if (wireEventCount > 1 || event1 || event1Wire) {
    semanticSubtype = "MULTIPLE_SEMANTIC_ERRORS";
  }
  return {
    eventCount: wireEventCount,
    event1TypePass,
    event1QuantityPass,
    event1DetailPresent: event1Detail.present,
    event1DetailValidShort: event1Detail.validShort,
    event1DetailCodePointCount: event1Detail.codePointCount,
    event1DetailKind: event1Detail.kind,
    event1DetailMatchesExpected,
    event1MatchesExpected,
    event2Present: event2 || event2Wire ? "YES" : "NO",
    event2TypePass,
    event2QuantityPass,
    event2DetailPresent: event2Detail.present,
    event2DetailValidShort: event2Detail.validShort,
    event2DetailCodePointCount: event2Detail.codePointCount,
    event2DetailKind: event2Detail.kind,
    event2DetailMatchesExpected,
    event2MatchesExpected,
    event2DetailEqualsEvent1,
    event2ExactlyEqualsEvent1,
    semanticSubtype,
    semanticPass: semanticPass ? "YES" : "NO",
  };
}

function snapshotMessage(
  message: AmbientV2MessageResult,
  expectedMessage?: AmbientV2ExpectedMessage,
): AmbientV2SafeMessageSnapshot {
  return {
    safeRef: message.safeRef,
    route: message.route,
    extractionMode: message.extractionMode,
    structuralStatus: message.structuralStatus,
    semanticStatus: message.semanticStatus,
    technicalStatus: message.technicalStatus,
    eventCount: message.events.length,
    eventTypes: message.events.map((event) => event.event),
    quantities: message.events.map((event) => event.quantity),
    relationStatus: message.relationIntent?.status ?? "none",
    ...(message.relationIntent?.targetRef ? { relationTargetRef: message.relationIntent.targetRef } : {}),
    eventDiagnostics: buildAmbientV2SafeEventSemanticTelemetry(message, expectedMessage),
  };
}

function boundedSchemaSnapshot(message: AmbientV2MessageResult): AmbientV2BoundedSchemaSnapshot {
  const schema = message.diagnostics.schema;
  return {
    structuralStatus: message.structuralStatus,
    structuralSubtype: schema.structuralSubtype,
    semanticSubtype: schema.semanticSubtype,
    jsonParseStatus: schema.jsonParseStatus,
    topLevelType: schema.topLevelType,
    topLevelKeys: [...schema.topLevelKeys],
    eventsKeyPresent: schema.eventsKeyPresent,
    eventsValueType: schema.eventsValueType,
    eventItemCount: schema.eventItemCount,
    firstInvalidEventIndex: schema.firstInvalidEventIndex,
    firstInvalidField: schema.firstInvalidField,
    unknownKeyNames: [...schema.unknownKeyNames],
    detailCodePointCount: schema.detailCodePointCount,
  };
}

function safeRunMetrics(
  result: AmbientV2BatchResult,
  evaluation: ReturnType<typeof evaluateAmbientExtractionV2>,
  expectedMessages: readonly AmbientV2ExpectedMessage[] = [],
): AmbientV2SafeRunMetrics {
  const expectedByRef = new Map(expectedMessages.map((message) => [message.safeRef, message]));
  const d03Message = result.messages.find((message) => message.safeRef === "D03");
  const d03Expected = expectedByRef.get("D03");
  const d03SemanticDiagnostic = d03Message && d03Expected
    ? buildAmbientV2D03SemanticDiagnostic(d03Message, d03Expected)
    : undefined;
  const d04Message = result.messages.find((message) => message.safeRef === "D04");
  const d04Expected = expectedByRef.get("D04");
  const d04SemanticDiagnostic = d04Message && d04Expected
    ? buildAmbientV2D04SemanticDiagnostic(d04Message, d04Expected)
    : undefined;
  return {
    messagesTotal: result.metrics.messagesTotal,
    selectedCount: result.messages.filter((message) => message.extractionMode !== "none").length,
    aiRequired: result.metrics.aiRequired,
    aiCalls: result.metrics.aiCalls,
    relationResolverCalls: result.metrics.relationResolverCalls,
    eventsExtracted: result.metrics.eventsExtracted,
    messagesUnresolved: result.metrics.messagesUnresolved,
    eventsUnresolved: result.metrics.eventsUnresolved,
    technicalFailures: result.metrics.technicalFailures,
    decisionCoverage: evaluation.decisionCoverage,
    eventCount: evaluation.eventCount,
    relationCount: evaluation.relationCount,
    eventTypeAccuracy: evaluation.eventTypeAccuracy,
    quantityAccuracy: evaluation.quantityAccuracy,
    unknownQuantityAccuracy: evaluation.unknownQuantityAccuracy,
    supportRelationAccuracy: evaluation.supportRelationAccuracy,
    hallucinationCount: evaluation.hallucinationCount,
    contextLineageContaminationCount: evaluation.contextLineageContaminationCount,
    duplicateEventCount: evaluation.duplicateEventCount,
    jsonPass: evaluation.jsonPass,
    normalizationPass: evaluation.normalizationPass,
    validationPass: evaluation.validationPass,
    systemBuildPass: evaluation.systemBuildPass,
    overallPass: evaluation.overallPass,
    messages: result.messages.map((message) => snapshotMessage(message, expectedByRef.get(message.safeRef))),
    ...(d03SemanticDiagnostic ? { d03SemanticDiagnostic } : {}),
    ...(d04SemanticDiagnostic ? { d04SemanticDiagnostic } : {}),
  };
}

function failureRecord(
  pending: PendingV2Attempt,
  experimentId: string,
  matrixRunId: string,
  failureClass: string,
  transport: { httpStatus: number | null; providerResponseConfirmed: boolean; errorCode: string | null } = {
    httpStatus: null,
    providerResponseConfirmed: false,
    errorCode: null,
  },
): AmbientV2AttemptTerminalRecord {
  return {
    recordType: "ATTEMPT_FAILURE",
    experimentId,
    matrixRunId,
    attemptId: pending.attemptId,
    caseId: pending.caseId,
    safeRef: pending.safeRef,
    runNumber: pending.runNumber,
    callOrdinal: pending.callOrdinal,
    completedAt: new Date().toISOString(),
    transportStatus: transport.providerResponseConfirmed ? "success" : "failure",
    httpStatus: transport.httpStatus,
    providerResponseConfirmed: transport.providerResponseConfirmed,
    jsonStatus: transport.providerResponseConfirmed ? "not_run" : "unknown",
    normalizationStatus: "not_run",
    validationStatus: "not_run",
    systemBuildStatus: "not_run",
    overallPass: false,
    failureClass,
    cloudflareErrorCode: transport.errorCode,
    safeMetrics: null,
    boundedSchema: null,
  };
}

class DurableV2RestAdapter implements AmbientV2AiAdapter {
  readonly name = "ambient-v2-durable-direct-workers-ai-rest";
  calls = 0;
  private readonly pending = new Map<string, PendingV2Attempt>();
  private readonly direct: DirectWorkersAiRestAdapter;
  private readonly bridge: AmbientV2DirectRestAdapter;

  constructor(
    private readonly ledger: AmbientV2RealSmokeLedger,
    private readonly experimentId: string,
    private readonly matrixRunId: string,
    private readonly runNumber: number,
    private readonly maxCallsThisRun: number,
    endpoint: string,
    token: string,
    fetchImpl?: typeof fetch,
    private readonly caseId = "DEV-SMOKE-8",
    private readonly model = AMBIENT_V2_REAL_SMOKE_MODEL,
    private readonly allowNonProductionModel = false,
  ) {
    this.direct = new DirectWorkersAiRestAdapter({
      endpoint,
      token,
      fetchImpl,
      maxCalls: maxCallsThisRun,
      allowNonProductionModel,
    });
    this.bridge = new AmbientV2DirectRestAdapter({
      transport: this.direct,
      model,
      allowNonProductionModel,
    });
  }

  async run(request: Parameters<AmbientV2AiAdapter["run"]>[0], context: { safeRef: string }): Promise<unknown> {
    const existingStarts = await this.ledger.countStarts();
    if (existingStarts >= this.ledger.options.maxCalls) throw new Error("V2_REAL_SMOKE_CALL_LIMIT_EXCEEDED");
    if (this.calls >= this.maxCallsThisRun) throw new Error("V2_REAL_SMOKE_RUN_CALL_LIMIT_EXCEEDED");
    const pending: PendingV2Attempt = {
      attemptId: randomUUID(),
      caseId: this.caseId,
      safeRef: context.safeRef,
      runNumber: this.runNumber,
      callOrdinal: existingStarts + 1,
      httpStatus: null,
      providerResponseConfirmed: false,
    };
    await this.ledger.append({
      recordType: "ATTEMPT_START",
      experimentId: this.experimentId,
      matrixRunId: this.matrixRunId,
      attemptId: pending.attemptId,
      caseId: pending.caseId,
      safeRef: pending.safeRef,
      runNumber: pending.runNumber,
      callOrdinal: pending.callOrdinal,
      model: this.model,
      timestamp: new Date().toISOString(),
      requestContractFingerprint: `v2-${request.messages.length}-${request.messages.map((message) => `${message.role}:${message.content.length}`).join("-")}-${AMBIENT_V2_REAL_SMOKE_MAX_TOKENS}-${AMBIENT_V2_REAL_SMOKE_TEMPERATURE}`,
      promptFingerprint: ambientV2RequestPromptFingerprint(request),
      maxTokens: AMBIENT_V2_REAL_SMOKE_MAX_TOKENS,
      temperature: AMBIENT_V2_REAL_SMOKE_TEMPERATURE,
      status: "started",
    });
    this.calls += 1;
    try {
      const response = await this.bridge.run(request, { safeRef: context.safeRef });
      const metadata = safeTransportMetadata(this.direct);
      pending.httpStatus = metadata.httpStatus;
      pending.providerResponseConfirmed = metadata.providerResponseConfirmed;
      this.pending.set(pending.safeRef, pending);
      return response;
    } catch (error) {
      const metadata = safeTransportMetadata(this.direct);
      pending.httpStatus = metadata.httpStatus;
      pending.providerResponseConfirmed = metadata.providerResponseConfirmed;
      await this.ledger.append(failureRecord(
        pending,
        this.experimentId,
        this.matrixRunId,
        metadata.errorClass ?? boundedErrorName(error),
        metadata,
      ));
      throw error;
    }
  }

  async finalizeBatch(
    result: AmbientV2BatchResult,
    evaluation: ReturnType<typeof evaluateAmbientExtractionV2>,
    expectedMessages: readonly AmbientV2ExpectedMessage[] = [],
  ): Promise<void> {
    const metrics = safeRunMetrics(result, evaluation, expectedMessages);
    for (const pending of this.pending.values()) {
      const message = result.messages.find((item) => item.safeRef === pending.safeRef);
      const messagePass = Boolean(message
        && message.technicalStatus === "success"
        && message.structuralStatus === "pass"
        && (message.semanticStatus === "resolved" || message.semanticStatus === "none")
        && message.diagnostics.invalidEventCount === 0);
      await this.ledger.append({
        recordType: messagePass ? "ATTEMPT_SUCCESS" : "ATTEMPT_FAILURE",
        experimentId: this.experimentId,
        matrixRunId: this.matrixRunId,
        attemptId: pending.attemptId,
        caseId: pending.caseId,
        safeRef: pending.safeRef,
        runNumber: pending.runNumber,
        callOrdinal: pending.callOrdinal,
        completedAt: new Date().toISOString(),
        transportStatus: "success",
        httpStatus: pending.httpStatus,
        providerResponseConfirmed: pending.providerResponseConfirmed,
        jsonStatus: message?.structuralStatus === "pass" ? "pass" : "fail",
        normalizationStatus: message?.technicalStatus === "success" && message.structuralStatus === "pass" ? "pass" : "fail",
        validationStatus: messagePass ? "pass" : "fail",
        systemBuildStatus: evaluation.systemBuildPass ? "pass" : "fail",
        overallPass: messagePass && evaluation.overallPass,
        failureClass: messagePass && evaluation.overallPass
          ? null
          : (message?.diagnostics.schema.structuralSubtype
            ?? message?.diagnostics.schema.semanticSubtype
            ?? message?.diagnostics.schema.structuralFailureCode
            ?? message?.diagnostics.schema.semanticFailureCode
            ?? "SEMANTIC_EXPECTATION_MISMATCH"),
        cloudflareErrorCode: null,
        safeMetrics: metrics,
        boundedSchema: message ? boundedSchemaSnapshot(message) : null,
      });
    }
    this.pending.clear();
  }

  async terminatePending(failureClass: string): Promise<void> {
    for (const pending of this.pending.values()) {
      await this.ledger.append(failureRecord(pending, this.experimentId, this.matrixRunId, failureClass, {
        httpStatus: pending.httpStatus,
        providerResponseConfirmed: pending.providerResponseConfirmed,
        errorCode: null,
      }));
    }
    this.pending.clear();
  }
}

function d04Metrics(result: AmbientV2BatchResult): {
  cull: boolean;
  abnormalDetail: boolean;
  abnormalQuantity: boolean;
} {
  const d04 = result.messages.find((message) => message.safeRef === "D04");
  const cull = d04?.events.find((event) => event.event === "cull");
  const abnormal = d04?.events.find((event) => event.event === "abnormal");
  return {
    cull: cull?.quantity === 2,
    abnormalDetail: abnormal?.detail === "腳傷",
    abnormalQuantity: abnormal?.quantity === 2,
  };
}

async function terminalStats(ledger: AmbientV2RealSmokeLedger): Promise<{
  totalProviderCalls: number;
  successfulProviderResponses: number;
  technicalFailures: number;
  orphanAttempts: number;
  http429Count: number;
  error3036Count: number;
  error3040Count: number;
  timeoutCount: number;
}> {
  const { records } = await ledger.read();
  const starts = records.filter((record): record is AmbientV2AttemptStartRecord => record.recordType === "ATTEMPT_START");
  const terminals = records.filter((record): record is AmbientV2AttemptTerminalRecord => record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION");
  const terminalIds = new Set(terminals.map((record) => record.attemptId));
  const failedTransport = terminals.filter((record) => record.transportStatus === "failure");
  return {
    totalProviderCalls: starts.length,
    successfulProviderResponses: terminals.filter((record) => record.providerResponseConfirmed === true).length,
    technicalFailures: failedTransport.length,
    orphanAttempts: starts.filter((record) => !terminalIds.has(record.attemptId)).length,
    http429Count: terminals.filter((record) => record.httpStatus === 429).length,
    error3036Count: terminals.filter((record) => record.cloudflareErrorCode === "3036").length,
    error3040Count: terminals.filter((record) => record.cloudflareErrorCode === "3040").length,
    timeoutCount: terminals.filter((record) => record.failureClass === "PROVIDER_TIMEOUT").length,
  };
}

async function runTerminalStats(ledger: AmbientV2RealSmokeLedger, runNumber: number): Promise<{
  providerAttempts: number;
  providerResponses: number;
  technicalFailures: number;
}> {
  const { records } = await ledger.read();
  const starts = records.filter((record): record is AmbientV2AttemptStartRecord => record.recordType === "ATTEMPT_START" && record.runNumber === runNumber);
  const terminals = records.filter((record): record is AmbientV2AttemptTerminalRecord =>
    (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
    && record.runNumber === runNumber,
  );
  return {
    providerAttempts: starts.length,
    providerResponses: terminals.filter((record) => record.providerResponseConfirmed === true).length,
    technicalFailures: terminals.filter((record) => record.transportStatus === "failure").length,
  };
}

export interface AmbientV2RealSmokeOptions {
  fixture: AmbientV2RealSmokeFixture;
  endpoint: string;
  token: string;
  ledgerPath: string;
  experimentId?: string;
  matrixRunId?: string;
  runLimit?: number;
  fetchImpl?: typeof fetch;
  caseId?: string;
  totalProviderCallLimit?: number;
  executionMode?: "PROMPT_TEXT" | "STRUCTURED_OUTPUT";
  requestBuilder?: (message: AmbientV2MessageInput) => AmbientV2AiRequest;
  responseParser?: (value: unknown) => AmbientV2ParsedResponse;
  /** Developer-only cross-model screening opt-in. Defaults to the pinned model guard. */
  model?: string;
  allowNonProductionModel?: boolean;
}

export async function runAmbientExtractionV2RealSmoke(options: AmbientV2RealSmokeOptions): Promise<AmbientV2RealSmokeReport> {
  const experimentId = options.experimentId ?? randomUUID();
  const matrixRunId = options.matrixRunId ?? randomUUID();
  const model = options.model ?? AMBIENT_V2_REAL_SMOKE_MODEL;
  const allowNonProductionModel = options.allowNonProductionModel === true;
  const runLimit = options.runLimit ?? AMBIENT_V2_REAL_SMOKE_MAX_RUNS;
  if (!Number.isInteger(runLimit) || runLimit < 1 || runLimit > AMBIENT_V2_REAL_SMOKE_MAX_RUNS) throw new Error("V2_REAL_SMOKE_RUN_LIMIT_INVALID");
  const baseOptions = {
    messages: options.fixture.messages,
    selectedRefs: options.fixture.selectedRefs,
  };
  const structuredExecution = options.executionMode === "STRUCTURED_OUTPUT"
    ? ambientV2StructuredExecutionOptions()
    : null;
  const requestBuilder = options.requestBuilder ?? structuredExecution?.requestBuilder;
  const responseParser = options.responseParser ?? structuredExecution?.responseParser;
  const plan = planAmbientExtractionV2Batch(baseOptions);
  const totalProviderCallLimit = options.totalProviderCallLimit
    ?? plan.expectedProviderCalls * AMBIENT_V2_REAL_SMOKE_MAX_RUNS;
  if (!Number.isInteger(totalProviderCallLimit) || totalProviderCallLimit < 1 || totalProviderCallLimit > 100) {
    throw new Error("V2_REAL_SMOKE_TOTAL_CALL_LIMIT_INVALID");
  }
  const ledger = new AmbientV2RealSmokeLedger(options.ledgerPath, { experimentId, matrixRunId, maxCalls: totalProviderCallLimit });
  const existing = await ledger.read();
  if (existing.records.some((record) => record.experimentId !== experimentId || record.matrixRunId !== matrixRunId)) {
    throw new Error("V2_REAL_SMOKE_LEDGER_RUN_MISMATCH");
  }
  const processStarted = existing.records.some((record) => record.recordType === "PROCESS_STARTED");
  if (!processStarted) await ledger.append({ recordType: "PROCESS_STARTED", experimentId, matrixRunId, timestamp: new Date().toISOString() });

  const runs: AmbientV2RealSmokeRunReport[] = [];
  let phase1: AmbientV2RealSmokeReport["phase1"] = "NOT_COMPLETED";
  let phase2: AmbientV2RealSmokeReport["phase2"] = "NOT_RUN";
  let unexpectedFailure = false;
  for (let runNumber = 1; runNumber <= Math.min(AMBIENT_V2_REAL_SMOKE_PHASE_1_RUNS, runLimit); runNumber += 1) {
    const adapter = new DurableV2RestAdapter(
      ledger,
      experimentId,
      matrixRunId,
      runNumber,
      plan.expectedProviderCalls,
      options.endpoint,
      options.token,
      options.fetchImpl,
      options.caseId,
      model,
      allowNonProductionModel,
    );
    try {
      const result = await runAmbientExtractionV2Batch({
        ...baseOptions,
        adapter,
        ...(requestBuilder ? { requestBuilder } : {}),
        ...(responseParser ? { responseParser } : {}),
      });
      const evaluation = evaluateAmbientExtractionV2(result, options.fixture.expectedMessages, options.fixture.selectedRefs);
      await adapter.finalizeBatch(result, evaluation, options.fixture.expectedMessages);
      const d04 = d04Metrics(result);
      const metrics = safeRunMetrics(result, evaluation, options.fixture.expectedMessages);
      const runStats = await runTerminalStats(ledger, runNumber);
      const status = evaluation.overallPass ? "PASS" : "FAIL";
      runs.push({
        runNumber,
        status,
        expectedProviderCalls: plan.expectedProviderCalls,
        providerAttempts: runStats.providerAttempts,
        providerResponses: runStats.providerResponses,
        technicalFailures: runStats.technicalFailures,
        plan,
        metrics,
        d04CullPass: d04.cull,
        d04AbnormalDetailPass: d04.abnormalDetail,
        d04AbnormalQuantityPass: d04.abnormalQuantity,
        failureClass: status === "PASS" ? null : "SEMANTIC_EXPECTATION_MISMATCH",
      });
      if (!evaluation.overallPass) break;
    } catch (error) {
      await adapter.terminatePending("V2_RUN_EXCEPTION");
      runs.push({
        runNumber,
        status: "NOT_COMPLETED",
        expectedProviderCalls: plan.expectedProviderCalls,
        providerAttempts: adapter.calls,
        providerResponses: 0,
        technicalFailures: 1,
        plan,
        metrics: null,
        d04CullPass: null,
        d04AbnormalDetailPass: null,
        d04AbnormalQuantityPass: null,
        failureClass: boundedErrorName(error),
      });
      unexpectedFailure = true;
      break;
    }
  }
  if (!unexpectedFailure && runs.length === AMBIENT_V2_REAL_SMOKE_PHASE_1_RUNS && runs.every((run) => run.status === "PASS")) {
    phase1 = "3/3_PASS";
    if (runLimit > AMBIENT_V2_REAL_SMOKE_PHASE_1_RUNS) {
      for (let runNumber = 4; runNumber <= Math.min(AMBIENT_V2_REAL_SMOKE_MAX_RUNS, runLimit); runNumber += 1) {
        const adapter = new DurableV2RestAdapter(
          ledger,
          experimentId,
          matrixRunId,
          runNumber,
          plan.expectedProviderCalls,
          options.endpoint,
          options.token,
          options.fetchImpl,
          options.caseId,
          model,
          allowNonProductionModel,
        );
        try {
          const result = await runAmbientExtractionV2Batch({
            ...baseOptions,
            adapter,
            ...(requestBuilder ? { requestBuilder } : {}),
            ...(responseParser ? { responseParser } : {}),
          });
          const evaluation = evaluateAmbientExtractionV2(result, options.fixture.expectedMessages, options.fixture.selectedRefs);
          await adapter.finalizeBatch(result, evaluation, options.fixture.expectedMessages);
          const d04 = d04Metrics(result);
          const metrics = safeRunMetrics(result, evaluation, options.fixture.expectedMessages);
          const runStats = await runTerminalStats(ledger, runNumber);
          const status = evaluation.overallPass ? "PASS" : "FAIL";
          runs.push({
            runNumber,
            status,
            expectedProviderCalls: plan.expectedProviderCalls,
            providerAttempts: runStats.providerAttempts,
            providerResponses: runStats.providerResponses,
            technicalFailures: runStats.technicalFailures,
            plan,
            metrics,
            d04CullPass: d04.cull,
            d04AbnormalDetailPass: d04.abnormalDetail,
            d04AbnormalQuantityPass: d04.abnormalQuantity,
            failureClass: status === "PASS" ? null : "SEMANTIC_EXPECTATION_MISMATCH",
          });
          if (!evaluation.overallPass) break;
        } catch (error) {
          await adapter.terminatePending("V2_RUN_EXCEPTION");
          runs.push({
            runNumber,
            status: "NOT_COMPLETED",
            expectedProviderCalls: plan.expectedProviderCalls,
            providerAttempts: adapter.calls,
            providerResponses: 0,
            technicalFailures: 1,
            plan,
            metrics: null,
            d04CullPass: null,
            d04AbnormalDetailPass: null,
            d04AbnormalQuantityPass: null,
            failureClass: boundedErrorName(error),
          });
          unexpectedFailure = true;
          break;
        }
      }
      if (!unexpectedFailure && runs.length === Math.min(AMBIENT_V2_REAL_SMOKE_MAX_RUNS, runLimit) && runs.slice(3).every((run) => run.status === "PASS")) phase2 = "2/2_PASS";
      else if (!unexpectedFailure) phase2 = "FAIL";
      else phase2 = "NOT_COMPLETED";
    }
  } else if (!unexpectedFailure) {
    phase1 = "FAIL";
  }

  const stats = await terminalStats(ledger);
  const completedFullRunCount = runs.filter((run) => run.status === "PASS").length;
  const overallStatus: AmbientV2RealSmokeReport["overallStatus"] = phase1 !== "3/3_PASS"
    ? phase1 === "NOT_COMPLETED" ? "NOT_COMPLETED" : "FAIL"
    : phase2 === "2/2_PASS" ? "5/5_PASS" : phase2 === "NOT_COMPLETED" ? "NOT_COMPLETED" : "FAIL";
  await ledger.append({
    recordType: "PROCESS_EXITED",
    experimentId,
    matrixRunId,
    timestamp: new Date().toISOString(),
    exitCode: overallStatus === "5/5_PASS" || overallStatus === "FAIL" ? 0 : 2,
    signal: null,
    markerSeen: true,
    stderrClass: "NOT_CAPTURED",
  });
  return {
    experimentId,
    matrixRunId,
    model,
    temperature: AMBIENT_V2_REAL_SMOKE_TEMPERATURE,
    maxTokens: AMBIENT_V2_REAL_SMOKE_MAX_TOKENS,
    executionMode: "SERIAL",
    maxConcurrentAiCalls: 1,
    plan,
    phase1MaxCalls: plan.expectedProviderCalls * AMBIENT_V2_REAL_SMOKE_PHASE_1_RUNS,
    phase2MaxAdditionalCalls: plan.expectedProviderCalls * AMBIENT_V2_REAL_SMOKE_PHASE_2_RUNS,
    totalProviderCallLimit,
    runs,
    phase1,
    phase2,
    overallStatus,
    totalProviderCalls: stats.totalProviderCalls,
    successfulProviderResponses: stats.successfulProviderResponses,
    technicalFailures: stats.technicalFailures,
    orphanAttempts: stats.orphanAttempts,
    http429Count: stats.http429Count,
    error3036Count: stats.error3036Count,
    error3040Count: stats.error3040Count,
    timeoutCount: stats.timeoutCount,
    totalInputTokens: null,
    totalOutputTokens: null,
    peakConcurrency: 1,
    hardLimitRemaining: Math.max(0, totalProviderCallLimit - stats.totalProviderCalls),
    sideEffectFree: true,
  };
}
