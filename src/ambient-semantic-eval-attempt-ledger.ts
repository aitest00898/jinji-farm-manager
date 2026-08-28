import { open, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AmbientDecisionSchemaDiagnostics } from "./ambient";
import type { AmbientSemanticEvalReport } from "./ambient-semantic-eval";

/**
 * Developer-only, bounded attempt accounting for the real-model evaluator.
 * This module is deliberately not imported by the Worker entry point.  It
 * contains no raw prompt, completion, source text, credential, or identifier
 * persistence capability.
 */

export type AmbientSemanticEvalAttemptTerminalKind =
  | "ATTEMPT_SUCCESS"
  | "ATTEMPT_FAILURE"
  | "ATTEMPT_UNKNOWN_TERMINATION";

export interface AmbientSemanticEvalAttemptContext {
  matrixRunId: string;
  caseId: string;
  runIndex: number;
}

export interface AmbientSemanticEvalAttemptHandle extends AmbientSemanticEvalAttemptContext {
  attemptId: string;
}

export interface AmbientSemanticEvalSafeDecision {
  sourceRef: string;
  kind: "event" | "support" | "ignore";
  targetRef?: string;
}

export interface AmbientSemanticEvalSafeItem {
  sourceRefs: string[];
  eventType: "mortality" | "cull" | "abnormal";
  quantity: number | null;
  quantityConfidence: "unknown" | "low" | "medium" | "high" | null;
}

export interface AmbientSemanticEvalSafeMetrics {
  selectedCount: number;
  decisionCount: number;
  decisionCoverage: string;
  missingRefCount: number;
  unknownRefCount: number;
  duplicateRefCount: number;
  eventCount: number;
  supportCount: number;
  ignoreCount: number;
  validDecisionCount: number;
  invalidOrMissingDecisionCount: number;
  eventTypeAccuracy: string;
  quantityAccuracy: string;
  unknownQuantityAccuracy: string;
  supportRelationAccuracy: string;
  sourceMappingAccuracy: string;
  overallSemanticAccuracy: string;
  hallucinationCount: number;
  contextLineageContaminationCount: number;
  duplicateEventCount: number;
  jsonPass: boolean;
  normalizationPass: boolean;
  validationPass: boolean;
  systemBuildPass: boolean;
  overallPass: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  selectedSourceRefs: string[];
  accountedSourceRefs: string[];
  missingSourceRefs: string[];
  decisions: AmbientSemanticEvalSafeDecision[];
  items: AmbientSemanticEvalSafeItem[];
  schemaDiagnostics?: AmbientDecisionSchemaDiagnostics | null;
}

export interface AmbientSemanticEvalAttemptStartRecord extends AmbientSemanticEvalAttemptHandle {
  recordType: "ATTEMPT_START";
  model: string;
  timestamp: string;
  requestContractFingerprint: string;
  maxTokens: number;
  temperature: number;
  status: "started";
}

export interface AmbientSemanticEvalAttemptTerminalRecord extends AmbientSemanticEvalAttemptHandle {
  recordType: AmbientSemanticEvalAttemptTerminalKind;
  completedAt: string;
  transportStatus: "success" | "failure" | "unknown";
  httpStatus: number | null;
  cloudflareSuccess: boolean | null;
  providerResponseConfirmed: boolean | null;
  jsonStatus: "pass" | "fail" | "not_run" | "unknown";
  normalizationStatus: "pass" | "fail" | "not_run" | "unknown";
  validationStatus: "pass" | "fail" | "not_run" | "unknown";
  overallPass: boolean | null;
  failureClass: string | null;
  cloudflareErrorCode: string | null;
  safeMetrics: AmbientSemanticEvalSafeMetrics | null;
  /** Present only for a wrapper-detected abnormal child termination. */
  processExitCode?: number | null;
  signal?: string | null;
}

export interface AmbientSemanticEvalProcessRecord {
  recordType: "PROCESS_STARTED" | "PROCESS_EXITED" | "PROCESS_FATAL";
  matrixRunId: string;
  timestamp: string;
  exitCode?: number | null;
  signal?: string | null;
  markerSeen?: boolean;
  stderrClass?: "EMPTY" | "NONEMPTY" | "NOT_CAPTURED";
  fatalClass?: string;
}

export type AmbientSemanticEvalLedgerRecord =
  | AmbientSemanticEvalAttemptStartRecord
  | AmbientSemanticEvalAttemptTerminalRecord
  | AmbientSemanticEvalProcessRecord;

export interface AmbientSemanticEvalLedgerReadResult {
  records: AmbientSemanticEvalLedgerRecord[];
  invalidLineCount: number;
}

export interface AmbientSemanticEvalReconstructedRun {
  matrixRunId: string;
  processStatus: "not_started" | "running" | "completed" | "abnormal_exit";
  providerAttemptCount: number;
  providerSuccessCount: number;
  providerFailureCount: number;
  terminalAttemptCount: number;
  orphanAttemptCount: number;
  orphanAttemptIds: string[];
  attempts: Array<{
    caseId: string;
    runIndex: number;
    terminalStatus: "ATTEMPT_SUCCESS" | "ATTEMPT_FAILURE" | "ATTEMPT_UNKNOWN_TERMINATION" | "ORPHAN";
    transportStatus: "success" | "failure" | "unknown";
    httpStatus: number | null;
    providerResponseConfirmed: boolean | null;
    safeMetrics: AmbientSemanticEvalSafeMetrics | null;
  }>;
  caseSummaries: Array<{
    caseId: string;
    attempts: number;
    terminalAttempts: number;
    providerResponses: number;
    technicalFailures: number;
    semanticPasses: number;
    semanticEvaluable: number;
    lastRunIndex: number;
  }>;
  hardLimitRemaining: number;
  overallRunnerStatus: "not_started" | "running" | "completed" | "incomplete" | "orphaned";
}

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,80}$/u;
const SAFE_REF = /^(?:m[1-9]\d{0,2}|\d{1,3}|D\d{2})$/u;
const SAFE_CASE = /^[A-Za-z0-9_.:-]{1,80}$/u;
const MAX_SAFE_REFS = 16;
const MAX_SAFE_DECISIONS = 16;
const MAX_SAFE_ITEMS = 32;

function assertSafeText(value: string, pattern: RegExp, field: string): void {
  if (!pattern.test(value)) throw new Error(`LEDGER_UNSAFE_${field}`);
}

function assertSafeRecord(record: AmbientSemanticEvalLedgerRecord): void {
  assertSafeText(record.matrixRunId, /^[0-9a-f-]{16,80}$/iu, "MATRIX_RUN_ID");
  if (record.recordType.startsWith("ATTEMPT_")) {
    const attempt = record as AmbientSemanticEvalAttemptStartRecord | AmbientSemanticEvalAttemptTerminalRecord;
    assertSafeText(attempt.attemptId, /^[0-9a-f-]{16,80}$/iu, "ATTEMPT_ID");
    assertSafeText(attempt.caseId, SAFE_CASE, "CASE_ID");
    if (!Number.isInteger(attempt.runIndex) || attempt.runIndex < 1 || attempt.runIndex > 3) throw new Error("LEDGER_UNSAFE_RUN_INDEX");
  }
  if (record.recordType === "ATTEMPT_START") {
    assertSafeText(record.model, /^[A-Za-z0-9_@./:-]{1,120}$/u, "MODEL");
    assertSafeText(record.requestContractFingerprint, /^[A-Za-z0-9_.:-]{1,200}$/u, "REQUEST_FINGERPRINT");
    if (record.maxTokens !== 1536 || record.temperature !== 0) throw new Error("LEDGER_UNEXPECTED_INFERENCE_PARAMETERS");
  }
  if (record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION") {
    if (record.failureClass !== null && record.failureClass !== undefined) assertSafeText(record.failureClass, SAFE_CODE, "FAILURE_CLASS");
    if (record.cloudflareErrorCode !== null && record.cloudflareErrorCode !== undefined) assertSafeText(record.cloudflareErrorCode, SAFE_CODE, "CLOUDFLARE_ERROR_CODE");
    if (record.processExitCode !== undefined && record.processExitCode !== null
      && (!Number.isInteger(record.processExitCode) || record.processExitCode < -1 || record.processExitCode > 255)) throw new Error("LEDGER_UNSAFE_EXIT_CODE");
    if (record.signal !== undefined && record.signal !== null) assertSafeText(record.signal, /^[A-Za-z0-9_.:-]{1,40}$/u, "SIGNAL");
  }
  if (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE") {
    if (record.safeMetrics) assertSafeMetrics(record.safeMetrics);
  }
}

function assertSafeMetrics(metrics: AmbientSemanticEvalSafeMetrics): void {
  for (const value of [metrics.selectedCount, metrics.decisionCount, metrics.missingRefCount, metrics.unknownRefCount,
    metrics.duplicateRefCount, metrics.eventCount, metrics.supportCount, metrics.ignoreCount,
    metrics.validDecisionCount, metrics.invalidOrMissingDecisionCount, metrics.hallucinationCount,
    metrics.contextLineageContaminationCount, metrics.duplicateEventCount]) {
    if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error("LEDGER_UNSAFE_METRIC");
  }
  for (const value of [metrics.eventTypeAccuracy, metrics.quantityAccuracy, metrics.unknownQuantityAccuracy,
    metrics.supportRelationAccuracy, metrics.sourceMappingAccuracy, metrics.overallSemanticAccuracy]) {
    assertSafeText(value, /^[A-Za-z_:-]{1,40}$/u, "METRIC_CLASS");
  }
  for (const refs of [metrics.selectedSourceRefs, metrics.accountedSourceRefs, metrics.missingSourceRefs]) {
    if (refs.length > MAX_SAFE_REFS || refs.some((ref) => !SAFE_REF.test(ref))) throw new Error("LEDGER_UNSAFE_METRIC_REF");
  }
  if (metrics.decisions.length > MAX_SAFE_DECISIONS || metrics.items.length > MAX_SAFE_ITEMS) throw new Error("LEDGER_UNSAFE_METRIC_ARRAY");
  for (const decision of metrics.decisions) {
    if (!SAFE_REF.test(decision.sourceRef) || (decision.targetRef !== undefined && !SAFE_REF.test(decision.targetRef))) {
      throw new Error("LEDGER_UNSAFE_DECISION_REF");
    }
    assertSafeText(decision.kind, /^(?:event|support|ignore)$/u, "DECISION_KIND");
  }
  for (const item of metrics.items) {
    if (item.sourceRefs.length > MAX_SAFE_REFS || item.sourceRefs.some((ref) => !SAFE_REF.test(ref))) throw new Error("LEDGER_UNSAFE_ITEM_REF");
    assertSafeText(item.eventType, /^(?:mortality|cull|abnormal)$/u, "EVENT_TYPE");
    if (item.quantity !== null && (!Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 1_000_000)) throw new Error("LEDGER_UNSAFE_QUANTITY");
    if (item.quantityConfidence !== null) assertSafeText(item.quantityConfidence, /^(?:unknown|low|medium|high)$/u, "QUANTITY_CONFIDENCE");
  }
  if (metrics.schemaDiagnostics !== undefined && metrics.schemaDiagnostics !== null) assertSafeSchemaDiagnostics(metrics.schemaDiagnostics);
}

function assertSafeSchemaDiagnostics(diagnostics: AmbientDecisionSchemaDiagnostics): void {
  assertSafeText(diagnostics.rootKind, /^(?:object|array|string|number|boolean|null|unknown)$/u, "SCHEMA_ROOT_KIND");
  assertSafeText(diagnostics.envelopeKind, /^(?:decisions|candidates|events|top_level_array|other_object|unknown)$/u, "SCHEMA_ENVELOPE_KIND");
  if (diagnostics.decisionCount !== null && (!Number.isInteger(diagnostics.decisionCount) || diagnostics.decisionCount < 0 || diagnostics.decisionCount > 1000)) throw new Error("LEDGER_UNSAFE_SCHEMA_DECISION_COUNT");
  if (!Number.isInteger(diagnostics.issueCount) || diagnostics.issueCount < 0 || diagnostics.issueCount > 1000) throw new Error("LEDGER_UNSAFE_SCHEMA_ISSUE_COUNT");
  if (diagnostics.decisions.length > MAX_SAFE_DECISIONS) throw new Error("LEDGER_UNSAFE_SCHEMA_DECISIONS");
  const safeField = /^(?:ref|kind|targetRef|type|quantity|quantityConfidence|raw|confidence|farmText|houseText|flockText|caretakerText)$/u;
  const safeType = /^(?:string|number|boolean|array|object|null|missing|unknown)$/u;
  const safeStatus = /^(?:VALID|INVALID|MISSING|NOT_APPLICABLE)$/u;
  const safeRawStatus = /^(?:PRESENT|MISSING|NULL|EMPTY|INVALID|NOT_APPLICABLE)$/u;
  for (const decision of diagnostics.decisions) {
    if (!Number.isInteger(decision.decisionOrdinal) || decision.decisionOrdinal < 1 || decision.decisionOrdinal > 1000) throw new Error("LEDGER_UNSAFE_SCHEMA_ORDINAL");
    assertSafeText(decision.kind, /^(?:event|support|ignore|unknown)$/u, "SCHEMA_KIND");
    for (const field of [...decision.presentKeys, ...decision.missingRequiredKeys]) assertSafeText(field, safeField, "SCHEMA_FIELD");
    if (decision.presentKeys.length > 16 || decision.missingRequiredKeys.length > 16 || decision.fieldTypeClasses.length > 16) throw new Error("LEDGER_UNSAFE_SCHEMA_FIELDS");
    for (const entry of decision.fieldTypeClasses) {
      assertSafeText(entry.field, safeField, "SCHEMA_TYPE_FIELD");
      assertSafeText(entry.type, safeType, "SCHEMA_TYPE_CLASS");
    }
    assertSafeText(decision.typeEnumStatus, safeStatus, "SCHEMA_TYPE_STATUS");
    assertSafeText(decision.quantityKind, /^(?:string|number|boolean|array|object|null|missing|unknown|not_applicable)$/u, "SCHEMA_QUANTITY_KIND");
    assertSafeText(decision.quantityNullabilityStatus, safeStatus, "SCHEMA_QUANTITY_NULLABILITY");
    assertSafeText(decision.quantityConfidenceStatus, safeStatus, "SCHEMA_QUANTITY_CONFIDENCE");
    assertSafeText(decision.confidenceStatus, safeStatus, "SCHEMA_CONFIDENCE");
    assertSafeText(decision.rawStatus, safeRawStatus, "SCHEMA_RAW_STATUS");
    assertSafeText(decision.targetRefStatus, safeStatus, "SCHEMA_TARGET_STATUS");
    assertSafeText(decision.targetRefSelectedStatus, safeStatus, "SCHEMA_TARGET_SELECTED_STATUS");
  }
  if (diagnostics.firstIssueCode !== null) assertSafeText(diagnostics.firstIssueCode, /^[A-Z_]{1,64}$/u, "SCHEMA_ISSUE_CODE");
  if (diagnostics.firstIssuePath !== null) assertSafeText(diagnostics.firstIssuePath, /^(?:|decisions(?:\[\d+\])?(?:\.[A-Za-z][A-Za-z0-9]*)?)$/u, "SCHEMA_ISSUE_PATH");
  if (diagnostics.firstExpectedType !== null) assertSafeText(diagnostics.firstExpectedType, /^[A-Za-z0-9_+|().=:\-]{1,160}$/u, "SCHEMA_EXPECTED_TYPE");
  if (diagnostics.firstActualType !== null) assertSafeText(diagnostics.firstActualType, safeType, "SCHEMA_ACTUAL_TYPE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownRecord(value: unknown): value is AmbientSemanticEvalLedgerRecord {
  if (!isRecord(value) || typeof value.recordType !== "string" || typeof value.matrixRunId !== "string") return false;
  if (value.recordType === "PROCESS_STARTED" || value.recordType === "PROCESS_EXITED" || value.recordType === "PROCESS_FATAL") return true;
  return value.recordType === "ATTEMPT_START" || value.recordType === "ATTEMPT_SUCCESS"
    || value.recordType === "ATTEMPT_FAILURE" || value.recordType === "ATTEMPT_UNKNOWN_TERMINATION";
}

export async function readAmbientSemanticEvalLedger(path: string): Promise<AmbientSemanticEvalLedgerReadResult> {
  let content: string;
  try {
    content = await readFile(path, { encoding: "utf8" });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "ENOENT") {
      return { records: [], invalidLineCount: 0 };
    }
    throw new Error("TELEMETRY_LEDGER_READ_FAILURE");
  }
  const records: AmbientSemanticEvalLedgerRecord[] = [];
  let invalidLineCount = 0;
  for (const line of content.split(/\r?\n/u).filter(Boolean)) {
    try {
      const value: unknown = JSON.parse(line);
      if (!isKnownRecord(value)) throw new Error("unknown record");
      assertSafeRecord(value);
      records.push(value);
    } catch {
      invalidLineCount += 1;
    }
  }
  return { records, invalidLineCount };
}

export class AmbientSemanticEvalAttemptLedger {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(readonly path: string, readonly matrixRunId: string) {
    assertSafeText(matrixRunId, /^[0-9a-f-]{16,80}$/iu, "MATRIX_RUN_ID");
  }

  async append(record: AmbientSemanticEvalLedgerRecord): Promise<void> {
    assertSafeRecord(record);
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
        throw new Error("TELEMETRY_DURABILITY_FAILURE");
      }
    });
    this.writeChain = operation.catch(() => undefined);
    return operation;
  }

  async read(): Promise<AmbientSemanticEvalLedgerReadResult> {
    await this.writeChain;
    const result = await readAmbientSemanticEvalLedger(this.path);
    if (result.invalidLineCount > 0) throw new Error("TELEMETRY_LEDGER_CORRUPT");
    return result;
  }

  async countStarts(matrixRunId = this.matrixRunId): Promise<number> {
    const { records } = await this.read();
    return records.filter((record) => record.recordType === "ATTEMPT_START" && record.matrixRunId === matrixRunId).length;
  }
}

export function requestContractFingerprint(input: { messages: Array<{ role: string; content: string }>; max_tokens: number; temperature: number }): string {
  const shape = [
    "ambient-input-v1",
    `messages=${input.messages.length}`,
    ...input.messages.map((message) => `${message.role}:${message.content.length}`),
    `max_tokens=${input.max_tokens}`,
    `temperature=${input.temperature}`,
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < shape.length; index += 1) {
    hash ^= shape.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function safeMetricsFromReport(report: AmbientSemanticEvalReport): AmbientSemanticEvalSafeMetrics {
  const decisions = (report.snapshot?.decisions ?? []).slice(0, MAX_SAFE_DECISIONS).flatMap((decision) => {
    if (!SAFE_REF.test(decision.sourceRef) || (decision.targetRef && !SAFE_REF.test(decision.targetRef))) return [];
    return [{ sourceRef: decision.sourceRef, kind: decision.kind, ...(decision.targetRef ? { targetRef: decision.targetRef } : {}) }];
  });
  const items = (report.snapshot?.candidates ?? []).flatMap((candidate) => candidate.items).slice(0, MAX_SAFE_ITEMS).flatMap((item) => {
    if (!/^(?:mortality|cull|abnormal)$/u.test(item.eventType)) return [];
    const sourceRefs = item.sourceRefs.filter((ref) => SAFE_REF.test(ref)).slice(0, MAX_SAFE_REFS);
    return [{ sourceRefs, eventType: item.eventType, quantity: item.quantity, quantityConfidence: item.quantityConfidence }];
  });
  const schemaDiagnostics = report.decisionSchemaDiagnostics
    ? {
      ...report.decisionSchemaDiagnostics,
      decisions: report.decisionSchemaDiagnostics.decisions.slice(0, MAX_SAFE_DECISIONS).map((decision) => ({
        ...decision,
        presentKeys: decision.presentKeys.slice(0, 16),
        missingRequiredKeys: decision.missingRequiredKeys.slice(0, 16),
        fieldTypeClasses: decision.fieldTypeClasses.slice(0, 16),
      })),
    }
    : null;
  return {
    selectedCount: report.selectedCount,
    decisionCount: report.decisionCount,
    decisionCoverage: report.decisionCoverage,
    missingRefCount: report.missingRefCount,
    unknownRefCount: report.unknownRefCount,
    duplicateRefCount: report.duplicateRefCount,
    eventCount: report.eventCount,
    supportCount: report.supportCount,
    ignoreCount: report.ignoreCount,
    validDecisionCount: report.validDecisionCount,
    invalidOrMissingDecisionCount: report.invalidOrMissingDecisionCount,
    eventTypeAccuracy: report.eventTypeAccuracy,
    quantityAccuracy: report.quantityAccuracy,
    unknownQuantityAccuracy: report.unknownQuantityAccuracy,
    supportRelationAccuracy: report.supportRelationAccuracy,
    sourceMappingAccuracy: report.sourceMappingAccuracy,
    overallSemanticAccuracy: report.overallSemanticAccuracy,
    hallucinationCount: report.hallucinationCount,
    contextLineageContaminationCount: report.contextLineageContaminationCount,
    duplicateEventCount: report.duplicateEventCount,
    jsonPass: report.jsonPass,
    normalizationPass: report.normalizationPass,
    validationPass: report.validationPass,
    systemBuildPass: report.systemBuildPass,
    overallPass: report.overallPass,
    promptTokens: report.promptTokens,
    completionTokens: report.completionTokens,
    totalTokens: report.totalTokens,
    selectedSourceRefs: report.selectedSourceRefs.filter((ref) => SAFE_REF.test(ref)).slice(0, MAX_SAFE_REFS),
    accountedSourceRefs: report.accountedSourceRefs.filter((ref) => SAFE_REF.test(ref)).slice(0, MAX_SAFE_REFS),
    missingSourceRefs: report.missingSourceRefs.filter((ref) => SAFE_REF.test(ref)).slice(0, MAX_SAFE_REFS),
    decisions,
    items,
    schemaDiagnostics,
  };
}

export function unknownTerminationRecord(
  handle: AmbientSemanticEvalAttemptHandle,
  processExit: { exitCode: number | null; signal: string | null },
): AmbientSemanticEvalAttemptTerminalRecord {
  return {
    ...handle,
    recordType: "ATTEMPT_UNKNOWN_TERMINATION",
    completedAt: new Date().toISOString(),
    transportStatus: "unknown",
    httpStatus: null,
    cloudflareSuccess: null,
    providerResponseConfirmed: null,
    jsonStatus: "unknown",
    normalizationStatus: "unknown",
    validationStatus: "unknown",
    overallPass: null,
    failureClass: "PROCESS_ABNORMAL_EXIT",
    cloudflareErrorCode: null,
    safeMetrics: null,
    processExitCode: processExit.exitCode,
    signal: processExit.signal,
  };
}

export function terminalRecordFromReport(
  report: AmbientSemanticEvalReport,
  handle: AmbientSemanticEvalAttemptHandle,
): AmbientSemanticEvalAttemptTerminalRecord {
  const providerSuccess = report.aiTransport === "PASS" && report.providerResponseConfirmed;
  const evaluationCompleted = providerSuccess
    && report.jsonPass
    && report.normalizationPass
    && report.validationPass
    && report.systemBuildPass;
  return {
    ...handle,
    recordType: evaluationCompleted ? "ATTEMPT_SUCCESS" : "ATTEMPT_FAILURE",
    completedAt: new Date().toISOString(),
    transportStatus: providerSuccess ? "success" : "failure",
    httpStatus: report.httpStatus,
    cloudflareSuccess: providerSuccess ? true : null,
    providerResponseConfirmed: report.providerResponseConfirmed,
    jsonStatus: report.jsonPass ? "pass" : "fail",
    normalizationStatus: report.normalizationPass ? "pass" : "fail",
    validationStatus: report.validationPass ? "pass" : "fail",
    overallPass: report.overallPass,
    failureClass: evaluationCompleted
      ? null
      : report.transportErrorClass
        ?? report.errorClass
        ?? (report.jsonPass ? "SEMANTIC_EVALUATION_FAILURE" : "JSON_PARSE_FAILURE"),
    cloudflareErrorCode: report.transportErrorCode,
    safeMetrics: safeMetricsFromReport(report),
  };
}

export function failureTerminalRecord(
  handle: AmbientSemanticEvalAttemptHandle,
  failureClass: string,
): AmbientSemanticEvalAttemptTerminalRecord {
  assertSafeText(failureClass, SAFE_CODE, "FAILURE_CLASS");
  return {
    ...handle,
    recordType: "ATTEMPT_FAILURE",
    completedAt: new Date().toISOString(),
    transportStatus: "failure",
    httpStatus: null,
    cloudflareSuccess: false,
    providerResponseConfirmed: false,
    jsonStatus: "unknown",
    normalizationStatus: "not_run",
    validationStatus: "not_run",
    overallPass: false,
    failureClass,
    cloudflareErrorCode: null,
    safeMetrics: null,
  };
}

export function orphanAttemptHandles(records: readonly AmbientSemanticEvalLedgerRecord[], matrixRunId?: string): AmbientSemanticEvalAttemptHandle[] {
  const starts = records.filter((record): record is AmbientSemanticEvalAttemptStartRecord =>
    record.recordType === "ATTEMPT_START" && (matrixRunId === undefined || record.matrixRunId === matrixRunId));
  const terminals = new Set(records.filter((record): record is AmbientSemanticEvalAttemptTerminalRecord =>
    record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION")
    .map((record) => record.attemptId));
  return starts.filter((start) => !terminals.has(start.attemptId)).map(({ matrixRunId: id, attemptId, caseId, runIndex }) => ({ matrixRunId: id, attemptId, caseId, runIndex }));
}

export function reconstructAmbientSemanticEvalRun(
  records: readonly AmbientSemanticEvalLedgerRecord[],
  matrixRunId: string,
  processExit?: { exitCode: number | null; signal: string | null },
): AmbientSemanticEvalReconstructedRun {
  const scoped = records.filter((record) => record.matrixRunId === matrixRunId);
  const starts = scoped.filter((record): record is AmbientSemanticEvalAttemptStartRecord => record.recordType === "ATTEMPT_START");
  const terminalByAttempt = new Map<string, AmbientSemanticEvalAttemptTerminalRecord>();
  for (const record of scoped) {
    if (record.recordType === "ATTEMPT_SUCCESS" || record.recordType === "ATTEMPT_FAILURE" || record.recordType === "ATTEMPT_UNKNOWN_TERMINATION") {
      terminalByAttempt.set(record.attemptId, record);
    }
  }
  const orphans = starts.filter((start) => !terminalByAttempt.has(start.attemptId));
  const terminals = starts.flatMap((start) => terminalByAttempt.get(start.attemptId) ? [terminalByAttempt.get(start.attemptId)!] : []);
  const processStarted = scoped.some((record) => record.recordType === "PROCESS_STARTED");
  const processStatus: AmbientSemanticEvalReconstructedRun["processStatus"] = !processStarted
    ? "not_started"
    : processExit?.signal || (processExit && processExit.exitCode !== 0)
      ? "abnormal_exit"
      : processExit
        ? "completed"
        : "running";
  const caseIds = [...new Set(starts.map((start) => start.caseId))];
  const caseSummaries = caseIds.map((caseId) => {
    const caseStarts = starts.filter((start) => start.caseId === caseId);
    const caseTerminals = terminals.filter((terminal) => terminal.caseId === caseId);
    const providerResponses = caseTerminals.filter((terminal) => terminal.providerResponseConfirmed === true).length;
    const technicalFailures = caseTerminals.filter((terminal) => terminal.transportStatus === "failure").length;
    return {
      caseId,
      attempts: caseStarts.length,
      terminalAttempts: caseTerminals.length,
      providerResponses,
      technicalFailures,
      semanticPasses: caseTerminals.filter((terminal) => terminal.overallPass === true).length,
      semanticEvaluable: caseTerminals.filter((terminal) => terminal.providerResponseConfirmed === true && terminal.jsonStatus === "pass").length,
      lastRunIndex: Math.max(...caseStarts.map((start) => start.runIndex), 0),
    };
  });
  const providerSuccessCount = terminals.filter((terminal) => terminal.providerResponseConfirmed === true).length;
  const providerFailureCount = terminals.filter((terminal) => terminal.transportStatus === "failure").length;
  const attempts = starts.map((start) => {
    const terminal = terminalByAttempt.get(start.attemptId);
    return {
      caseId: start.caseId,
      runIndex: start.runIndex,
      terminalStatus: terminal?.recordType ?? "ORPHAN" as const,
      transportStatus: terminal?.transportStatus ?? "unknown" as const,
      httpStatus: terminal?.httpStatus ?? null,
      providerResponseConfirmed: terminal?.providerResponseConfirmed ?? null,
      safeMetrics: terminal?.safeMetrics ?? null,
    };
  });
  const overallRunnerStatus: AmbientSemanticEvalReconstructedRun["overallRunnerStatus"] = orphans.length > 0
    ? "orphaned"
    : starts.length === 0
      ? "not_started"
      : starts.length === 9 && terminals.length === 9 && processStatus === "completed"
        ? "completed"
        : "incomplete";
  return {
    matrixRunId,
    processStatus,
    providerAttemptCount: starts.length,
    providerSuccessCount,
    providerFailureCount,
    terminalAttemptCount: terminals.length,
    orphanAttemptCount: orphans.length,
    orphanAttemptIds: orphans.map((orphan) => orphan.attemptId),
    attempts,
    caseSummaries,
    hardLimitRemaining: Math.max(0, 9 - starts.length),
    overallRunnerStatus,
  };
}
