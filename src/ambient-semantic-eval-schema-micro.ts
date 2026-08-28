import {
  runAmbientSemanticEvalCase,
  type AmbientSemanticEvalAiAdapter,
  type AmbientSemanticEvalCase,
  type AmbientSemanticEvalReport,
} from "./ambient-semantic-eval";
import {
  failureTerminalRecord,
  terminalRecordFromReport,
  type AmbientSemanticEvalAttemptContext,
  type AmbientSemanticEvalAttemptLedger,
} from "./ambient-semantic-eval-attempt-ledger";

export const AMBIENT_SCHEMA_MICRO_MAX_CALLS = 3;
export const AMBIENT_SCHEMA_MICRO_CASE_ORDER = ["D05_ALONE", "D03_ALONE", "D05_D06"] as const;

export type AmbientSchemaMicroStopReason =
  | "SCHEMA_FAILURE"
  | "TECHNICAL_FAILURE"
  | "SYSTEM_BUILD_FAILURE"
  | "RUNNER_FAILURE"
  | "COMPLETED_THREE_CALLS";

export interface AmbientSchemaMicroResult {
  matrixRunId: string;
  reports: AmbientSemanticEvalReport[];
  safeReports: Array<Record<string, unknown>>;
  providerCalls: number;
  stopAfterCall: number;
  stopReason: AmbientSchemaMicroStopReason;
}

const SAFE_FIELDS = new Set([
  "decisions",
  "ref",
  "kind",
  "targetRef",
  "type",
  "quantity",
  "quantityConfidence",
  "raw",
  "confidence",
  "farmText",
  "houseText",
  "flockText",
  "caretakerText",
]);

function safeErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return /^[A-Za-z0-9_.:-]{1,80}$/u.test(name) ? name : "MICRO_RUNNER_FAILURE";
}

function safeIssueField(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path === "decisions") return "decisions";
  const match = path.match(/^decisions\[\d+\]\.([A-Za-z][A-Za-z0-9]*)$/u);
  const field = match?.[1] ?? null;
  return field && SAFE_FIELDS.has(field) ? field : null;
}

function schemaFailureClass(report: AmbientSemanticEvalReport): string | null {
  const diagnostics = report.decisionSchemaDiagnostics;
  const code = diagnostics?.firstIssueCode;
  const field = safeIssueField(diagnostics?.firstIssuePath);
  const decisionIndex = diagnostics?.firstIssuePath?.match(/^decisions\[(\d+)\]/u)?.[1];
  const firstDecision = decisionIndex === undefined
    ? undefined
    : diagnostics?.decisions[Number(decisionIndex)];
  if (!code) return report.validationPass ? null : report.errorClass ?? "UNKNOWN";
  if (code === "INVALID_SUPPORT_TARGET") return "INVALID_SUPPORT_TARGET";
  if (code === "MISSING_REQUIRED_FIELD") {
    if (field === "raw") return "MISSING_RAW";
    if (field === "quantity") return "UNKNOWN_QUANTITY_REPRESENTATION";
    return "MISSING_REQUIRED_FIELD";
  }
  if (code === "INVALID_FIELD_TYPE") {
    if (field === "raw" && firstDecision?.rawStatus === "MISSING") return "MISSING_RAW";
    if (field === "quantity" && firstDecision?.quantityKind === "missing") return "UNKNOWN_QUANTITY_REPRESENTATION";
    if (field === "quantity") return "INVALID_QUANTITY";
    if (field === "raw") return "INVALID_RAW";
    return "WRONG_FIELD_TYPE";
  }
  if (code === "INVALID_ENUM") {
    if (field === "type") return "NONCANONICAL_EVENT_TYPE";
    if (field === "quantityConfidence") return "INVALID_QUANTITY_CONFIDENCE";
    if (field === "confidence") return "INVALID_CONFIDENCE";
    if (field === "kind") return "INVALID_DECISION_KIND";
    return "INVALID_ENUM";
  }
  if (code === "INVALID_EVENT_SCHEMA" && field === "kind") {
    if (firstDecision?.missingRequiredKeys.includes("kind")) return "MISSING_REQUIRED_FIELD";
    return "INVALID_DECISION_KIND";
  }
  return code;
}

function schemaDiagnosticsForReport(report: AmbientSemanticEvalReport): Record<string, unknown> | null {
  const diagnostics = report.decisionSchemaDiagnostics;
  if (!diagnostics) return null;
  return {
    rootKind: diagnostics.rootKind,
    envelopeKind: diagnostics.envelopeKind,
    decisionCount: diagnostics.decisionCount,
    unknownTopLevelKeys: diagnostics.unknownTopLevelKeys,
    issueCount: diagnostics.issueCount,
    firstIssueCode: diagnostics.firstIssueCode,
    firstIssueField: safeIssueField(diagnostics.firstIssuePath),
    firstExpectedType: diagnostics.firstExpectedType,
    firstActualType: diagnostics.firstActualType,
    decisions: diagnostics.decisions.map((decision) => ({
      decisionOrdinal: decision.decisionOrdinal,
      safeRef: decision.safeRef,
      kind: decision.kind,
      presentKeys: decision.presentKeys,
      missingRequiredKeys: decision.missingRequiredKeys,
      unknownKeysPresent: decision.unknownKeysPresent,
      fieldTypeClasses: decision.fieldTypeClasses,
      typeEnumStatus: decision.typeEnumStatus,
      quantityKind: decision.quantityKind,
      quantityNullabilityStatus: decision.quantityNullabilityStatus,
      quantityConfidenceStatus: decision.quantityConfidenceStatus,
      confidenceStatus: decision.confidenceStatus,
      rawStatus: decision.rawStatus,
      safeTargetRef: decision.safeTargetRef,
      targetRefStatus: decision.targetRefStatus,
      targetRefSelectedStatus: decision.targetRefSelectedStatus,
    })),
  };
}

export function safeAmbientSchemaMicroReport(report: AmbientSemanticEvalReport): Record<string, unknown> {
  const diagnostics = schemaDiagnosticsForReport(report);
  return {
    caseId: report.testCase,
    runIndex: report.runIndex,
    model: report.model,
    maxTokens: report.maxTokens,
    promptTokens: report.promptTokens,
    completionTokens: report.completionTokens,
    totalTokens: report.totalTokens,
    aiTransport: report.aiTransport,
    httpStatus: report.httpStatus,
    providerResponseConfirmed: report.providerResponseConfirmed,
    jsonPass: report.jsonPass,
    normalizationPass: report.normalizationPass,
    validationPass: report.validationPass,
    systemBuildPass: report.systemBuildPass,
    selectedCount: report.selectedCount,
    decisionCount: report.decisionCount,
    decisionCoverage: report.decisionCoverage,
    missingRefCount: report.missingRefCount,
    unknownRefCount: report.unknownRefCount,
    duplicateRefCount: report.duplicateRefCount,
    errorClass: report.errorClass,
    primarySchemaFailureClass: schemaFailureClass(report),
    primarySchemaFailureField: safeIssueField(report.decisionSchemaDiagnostics?.firstIssuePath),
    diagnosticSufficiency: report.validationPass
      ? "NOT_APPLICABLE"
      : diagnostics
        ? "PASS"
        : "FAIL",
    decisionSchemaDiagnostics: diagnostics,
  };
}

function stopReasonFor(report: AmbientSemanticEvalReport): AmbientSchemaMicroStopReason | null {
  if (!report.aiTransport || !report.providerResponseConfirmed || !report.jsonPass || !report.normalizationPass) {
    return "TECHNICAL_FAILURE";
  }
  if (!report.validationPass) return "SCHEMA_FAILURE";
  if (!report.systemBuildPass) return "SYSTEM_BUILD_FAILURE";
  return null;
}

export async function runAmbientSchemaMicroSequence(options: {
  cases: readonly AmbientSemanticEvalCase[];
  adapter: AmbientSemanticEvalAiAdapter;
  matrixRunId: string;
  ledger?: AmbientSemanticEvalAttemptLedger;
}): Promise<AmbientSchemaMicroResult> {
  if (options.cases.length !== AMBIENT_SCHEMA_MICRO_CASE_ORDER.length) {
    throw new Error("SCHEMA_MICRO_CASE_COUNT_REQUIRED");
  }
  const actualOrder = options.cases.map((evaluationCase) => evaluationCase.name);
  if (actualOrder.some((name, index) => name !== AMBIENT_SCHEMA_MICRO_CASE_ORDER[index])) {
    throw new Error("SCHEMA_MICRO_CASE_ORDER_REQUIRED");
  }

  const reports: AmbientSemanticEvalReport[] = [];
  for (const [index, evaluationCase] of options.cases.entries()) {
    if (options.adapter.calls >= AMBIENT_SCHEMA_MICRO_MAX_CALLS) {
      throw new Error("SCHEMA_MICRO_CALL_LIMIT_EXCEEDED");
    }
    const context: AmbientSemanticEvalAttemptContext = {
      matrixRunId: options.matrixRunId,
      caseId: evaluationCase.name,
      runIndex: 1,
    };
    await options.adapter.setAttemptContext?.(context);
    try {
      const report = await runAmbientSemanticEvalCase(evaluationCase, 1, options.adapter);
      const attempt = options.adapter.currentAttempt;
      if (options.ledger) {
        if (!attempt) throw new Error("SCHEMA_MICRO_ATTEMPT_HANDLE_MISSING");
        await options.ledger.append(terminalRecordFromReport(report, attempt));
      }
      reports.push(report);
      const stopReason = stopReasonFor(report);
      if (stopReason) {
        return {
          matrixRunId: options.matrixRunId,
          reports,
          safeReports: reports.map(safeAmbientSchemaMicroReport),
          providerCalls: options.adapter.calls,
          stopAfterCall: index + 1,
          stopReason,
        };
      }
    } catch (error) {
      const attempt = options.adapter.currentAttempt;
      if (options.ledger && attempt) {
        await options.ledger.append(failureTerminalRecord(attempt, safeErrorClass(error)));
      }
      return {
        matrixRunId: options.matrixRunId,
        reports,
        safeReports: reports.map(safeAmbientSchemaMicroReport),
        providerCalls: options.adapter.calls,
        stopAfterCall: index + 1,
        stopReason: "RUNNER_FAILURE",
      };
    }
  }

  return {
    matrixRunId: options.matrixRunId,
    reports,
    safeReports: reports.map(safeAmbientSchemaMicroReport),
    providerCalls: options.adapter.calls,
    stopAfterCall: reports.length,
    stopReason: "COMPLETED_THREE_CALLS",
  };
}
