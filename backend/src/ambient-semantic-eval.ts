import {
  ambientPromptSourceRefsForTest,
  extractAmbientCandidates,
  resolveAndReconcileAmbientBundle,
  type AmbientAiRequestInput,
  type AmbientAiDecision,
  type AmbientBufferedMessage,
  type AmbientDecisionSchemaDiagnostics,
  type AmbientEnv,
  type AmbientExtractionResult,
  type AmbientReconciliationSummary,
} from "./ambient";
import {
  buildAmbientDevSemanticSummary,
  type AmbientDevSemanticSummary,
} from "./ambient-dev-semantic";
import {
  evaluateAmbientDevSemanticSnapshot,
  type AmbientDevGroundTruthMessage,
  type AmbientDevSemanticEvaluation,
} from "./ambient-dev-semantic-evaluator";
import { PRODUCTION_AI_MODEL } from "./analysis";
import type {
  AmbientSemanticEvalAttemptContext,
  AmbientSemanticEvalAttemptHandle,
} from "./ambient-semantic-eval-attempt-ledger";

/**
 * Evaluation boundary for the Ambient extraction core. Fixture mode is the
 * default; real-model mode requires an explicitly injected adapter from the
 * developer-only direct-REST evaluation command.
 *
 * This module never creates a Workers AI client.  A caller must inject a
 * response-producing adapter. The module itself never creates a Workers AI
 * client, and real-model mode is rejected unless a caller injects one.
 * The adapter is deliberately shaped like the production AI binding so the
 * parser, normalizer, selected-source validator, and system-side event build
 * remain the same code used by the Worker.
 */
export interface AmbientSemanticEvalAiAdapter {
  readonly name: string;
  readonly calls: number;
  readonly lastCall?: AmbientSemanticEvalTransportMetadata;
  readonly currentAttempt?: AmbientSemanticEvalAttemptHandle;
  setAttemptContext?: (context: AmbientSemanticEvalAttemptContext) => void | Promise<void>;
  run(model: string, input: AmbientAiRequestInput): Promise<unknown>;
}

/** Bounded transport evidence exposed to the real-model report only. */
export type AmbientSemanticEvalTransportSubtype =
  | "DNS"
  | "CONNECTION_REFUSED"
  | "CONNECTION_RESET"
  | "CONNECT_TIMEOUT"
  | "TLS"
  | "UNDICI"
  | "SOCKET"
  | "INVALID_REQUEST"
  | "UNKNOWN";

export interface AmbientSemanticEvalTransportMetadata {
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  errorCode: string | null;
  errorClass: string | null;
  /** Safe classification only; raw provider errors never cross this boundary. */
  transportSubtype?: AmbientSemanticEvalTransportSubtype | null;
  transportErrorName?: string | null;
  transportCauseName?: string | null;
  transportCauseCode?: string | null;
  transportElapsedMs?: number | null;
}

export interface AmbientSemanticEvalGroundTruth {
  messages: AmbientSemanticEvalGroundTruthMessage[];
}

export interface AmbientSemanticEvalGroundTruthMessage extends AmbientDevGroundTruthMessage {
  /** Optional fixture-only same-event relation, never a production field. */
  sameAs?: string;
}

export interface AmbientSemanticEvalCase {
  name: string;
  messages: AmbientBufferedMessage[];
  groundTruth: AmbientSemanticEvalGroundTruth;
  responseForRun: (context: {
    runIndex: number;
    selectedRefs: string[];
    sourceRefFor: (messageId: string) => string;
  }) => string;
}

export interface AmbientSemanticEvalReport {
  testCase: string;
  runIndex: number;
  selectedCount: number;
  decisionCount: number;
  decisionCoverage: string;
  missingRefCount: number;
  unknownRefCount: number;
  duplicateRefCount: number;
  eventCount: number;
  supportCount: number;
  ignoreCount: number;
  eventTypeAccuracy: AmbientDevSemanticEvaluation["eventTypeAccuracy"];
  quantityAccuracy: AmbientDevSemanticEvaluation["quantityAccuracy"];
  unknownQuantityAccuracy: AmbientDevSemanticEvaluation["unknownQuantityAccuracy"];
  supportRelationAccuracy: AmbientDevSemanticEvaluation["supportSourceMappingAccuracy"];
  sourceMappingAccuracy: AmbientDevSemanticEvaluation["sourceMappingAccuracy"];
  overallSemanticAccuracy: AmbientDevSemanticEvaluation["overallSemanticAccuracy"];
  hallucinationCount: number;
  contextLineageContaminationCount: number;
  duplicateEventCount: number;
  jsonPass: boolean;
  normalizationPass: boolean;
  validationPass: boolean;
  systemBuildPass: boolean;
  overallPass: boolean;
  model: string;
  maxTokens: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  aiTransport: "PASS" | "FAIL";
  httpStatus: number | null;
  providerResponseConfirmed: boolean;
  transportErrorCode: string | null;
  transportErrorClass: string | null;
  validDecisionCount: number;
  invalidOrMissingDecisionCount: number;
  errorClass: string | null;
  aiCallCount: number;
  evalSideEffectFree: boolean;
  selectedSourceRefs: string[];
  accountedSourceRefs: string[];
  missingSourceRefs: string[];
  /** Bounded, value-free schema evidence available even when validation fails. */
  decisionSchemaDiagnostics: AmbientDecisionSchemaDiagnostics | null;
  snapshot: AmbientDevSemanticSummary | null;
}

export interface AmbientSemanticEvalSuiteOptions {
  cases: readonly AmbientSemanticEvalCase[];
  runs?: number;
  realModel?: boolean;
  aiAdapter?: AmbientSemanticEvalAiAdapter;
  matrixRunId?: string;
  onAttemptComplete?: (
    report: AmbientSemanticEvalReport,
    attempt: AmbientSemanticEvalAttemptHandle | undefined,
  ) => void | Promise<void>;
  onAttemptFailure?: (
    error: unknown,
    attempt: AmbientSemanticEvalAttemptHandle | undefined,
    context: AmbientSemanticEvalAttemptContext,
  ) => void | Promise<void>;
}

interface ReadOnlyEvalDbState {
  writes: number;
}

function createReadOnlyEvalDb(state: ReadOnlyEvalDbState): D1Database {
  const statement = {
    all: async <T>(): Promise<{ results: T[] }> => ({ results: [] }),
    first: async <T>(): Promise<T | null> => null,
    run: async (): Promise<never> => {
      state.writes += 1;
      throw new Error("EVAL_DB_WRITE_FORBIDDEN");
    },
  };
  const prepare = (_sql: string) => ({
    bind: (..._values: unknown[]) => statement,
    ...statement,
  });
  return { prepare } as unknown as D1Database;
}

function sourceRefMap(messages: AmbientBufferedMessage[]): Map<string, string> {
  const promptRefs = ambientPromptSourceRefsForTest(messages);
  if (promptRefs.length !== messages.length) {
    throw new Error("EVAL_FIXTURE_CONTEXT_MAPPING_NOT_TOTAL");
  }
  return new Map(messages.map((message, index) => [message.id, promptRefs[index]!.ref]));
}

function remapSnapshotSourceRefs(
  snapshot: AmbientDevSemanticSummary,
  messages: AmbientBufferedMessage[],
): AmbientDevSemanticSummary {
  const ordinalToFixtureId = new Map(messages.map((message, index) => [String(index + 1).padStart(2, "0"), message.id]));
  const remap = (ref: string): string => ordinalToFixtureId.get(ref) ?? ref;
  return {
    ...snapshot,
    ignoredSelectedSourceRefs: snapshot.ignoredSelectedSourceRefs.map(remap),
    unaccountedSourceRefs: snapshot.unaccountedSourceRefs.map(remap),
    decisions: snapshot.decisions?.map((decision) => ({
      ...decision,
      sourceRef: remap(decision.sourceRef),
      ...(decision.targetRef ? { targetRef: remap(decision.targetRef) } : {}),
    })),
    candidates: snapshot.candidates.map((candidate) => ({
      ...candidate,
      sourceRefs: candidate.sourceRefs.map(remap),
      items: candidate.items.map((item) => ({ ...item, sourceRefs: item.sourceRefs.map(remap) })),
    })),
  };
}

function flatSnapshotItems(snapshot: AmbientDevSemanticSummary): Array<{
  sourceRefs: string[];
  eventType: string;
  quantity: number | null;
}> {
  return snapshot.candidates.flatMap((candidate) => candidate.items.map((item) => ({
    sourceRefs: item.sourceRefs.length ? item.sourceRefs : candidate.sourceRefs,
    eventType: item.eventType,
    quantity: item.quantity,
  })));
}

function duplicateEventCount(snapshot: AmbientDevSemanticSummary | null): number {
  if (!snapshot) return 0;
  const items = flatSnapshotItems(snapshot);
  const d05D06Items = items.filter((item) =>
    item.eventType === "mortality"
    && item.quantity === 3
    && item.sourceRefs.some((ref) => ref === "D05" || ref === "D06"));
  return Math.max(0, d05D06Items.length - 1);
}

function contextContaminationCount(
  snapshot: AmbientDevSemanticSummary | null,
  groundTruth: AmbientSemanticEvalGroundTruth,
): number {
  if (!snapshot) return 0;
  const chatIds = new Set(groundTruth.messages
    .filter((message) => message.groundTruth === "CHAT")
    .map((message) => message.id));
  return flatSnapshotItems(snapshot)
    .filter((item) => item.sourceRefs.some((ref) => chatIds.has(ref)))
    .length;
}

function exactSourceMappingAccuracy(
  snapshot: AmbientDevSemanticSummary | null,
  groundTruth: AmbientSemanticEvalGroundTruth,
): AmbientDevSemanticEvaluation["sourceMappingAccuracy"] {
  if (!snapshot) return "FAIL";
  const allItems = flatSnapshotItems(snapshot);
  const byId = new Map(groundTruth.messages.map((message) => [message.id, message]));
  const supportRefsByTarget = new Map<string, string[]>();
  for (const message of groundTruth.messages) {
    if (message.sameAs) supportRefsByTarget.set(message.sameAs, [...(supportRefsByTarget.get(message.sameAs) ?? []), message.id]);
  }
  const expectedGroups = groundTruth.messages
    .filter((message) => message.expectedOperational && message.groundTruth !== "SUPPORT_DUPLICATE_REFERENCE")
    .map((message) => ({
      type: message.expectedOperational!.type,
      quantity: message.expectedOperational!.quantity,
      refs: new Set([message.id, ...(supportRefsByTarget.get(message.id) ?? [])]),
    }));
  if (!expectedGroups.length || !allItems.length) return "FAIL";
  const exactMatches = expectedGroups.filter((expected) => allItems.some((item) =>
    item.eventType === expected.type
    && item.quantity === expected.quantity
    && item.sourceRefs.length === expected.refs.size
    && item.sourceRefs.every((ref) => expected.refs.has(ref))
  )).length;
  const exactItemCount = allItems.filter((item) => expectedGroups.some((expected) =>
    item.eventType === expected.type
    && item.quantity === expected.quantity
    && item.sourceRefs.length === expected.refs.size
    && item.sourceRefs.every((ref) => expected.refs.has(ref))
  )).length;
  const knownIds = new Set(byId.keys());
  const hasUnknownSource = allItems.some((item) => item.sourceRefs.some((ref) => !knownIds.has(ref)));
  if (exactMatches === expectedGroups.length && exactItemCount === allItems.length && !hasUnknownSource) return "PASS";
  return exactMatches > 0 ? "PARTIAL" : "FAIL";
}

function emptyEvaluation(): AmbientDevSemanticEvaluation {
  return {
    selectedSourceCoverage: "FAIL",
    silentSelectedSourceDropCount: 0,
    supportSourceMappingAccuracy: "UNKNOWN",
    pureChatFalsePositiveCount: 0,
    operationalFalseNegativeCount: 0,
    eventTypeAccuracy: "FAIL",
    quantityAccuracy: "FAIL",
    unknownQuantityAccuracy: "FAIL",
    mixedChatAccuracy: "FAIL",
    d05D06Dedupe: "UNKNOWN",
    hallucinatedItemCount: 0,
    sourceMappingAccuracy: "FAIL",
    overallSemanticAccuracy: "FAIL",
  };
}

function selectedRefsFor(messages: AmbientBufferedMessage[]): string[] {
  return ambientPromptSourceRefsForTest(messages)
    .filter((entry) => entry.selected)
    .map((entry) => entry.ref);
}

function safeDecisionCounts(extraction: AmbientExtractionResult): {
  decisionCount: number;
  eventCount: number;
  supportCount: number;
  ignoreCount: number;
} {
  const diagnostics = extraction.transportDiagnostics;
  return {
    decisionCount: diagnostics?.parsedDecisionCount ?? 0,
    eventCount: diagnostics?.parsedEventDecisionCount ?? 0,
    supportCount: diagnostics?.parsedSupportDecisionCount ?? 0,
    ignoreCount: diagnostics?.parsedIgnoreDecisionCount ?? 0,
  };
}

export async function runAmbientSemanticEvalCase(
  evaluationCase: AmbientSemanticEvalCase,
  runIndex = 1,
  injectedAdapter?: AmbientSemanticEvalAiAdapter,
): Promise<AmbientSemanticEvalReport> {
  const refs = sourceRefMap(evaluationCase.messages);
  const selectedRefs = selectedRefsFor(evaluationCase.messages);
  const state: ReadOnlyEvalDbState = { writes: 0 };
  let aiCalls = 0;
  const fixtureAdapter: AmbientSemanticEvalAiAdapter = {
    name: "fixture",
    get calls() {
      return aiCalls;
    },
    run: async () => {
      aiCalls += 1;
      return {
        response: evaluationCase.responseForRun({
          runIndex,
          selectedRefs: [...selectedRefs],
          sourceRefFor: (messageId) => {
            const ref = refs.get(messageId);
            if (!ref) throw new Error("EVAL_FIXTURE_SOURCE_REF_NOT_FOUND");
            return ref;
          },
        }),
      };
    },
  };
  const adapter = injectedAdapter ?? fixtureAdapter;
  const callsBefore = adapter.calls;
  const env: AmbientEnv = {
    DB: createReadOnlyEvalDb(state),
    AI: adapter as unknown as Ai,
  };
  const extraction = await extractAmbientCandidates(env, evaluationCase.messages, PRODUCTION_AI_MODEL);
  const counts = safeDecisionCounts(extraction);
  const selectedSourceCount = extraction.sourceCoverage?.selectedSourceCount ?? selectedRefs.length;
  const accountedSourceRefs = extraction.sourceCoverage?.unaccountedSourceRefs
    ? selectedRefs.filter((ref) => !extraction.sourceCoverage!.unaccountedSourceRefs.includes(ref))
    : [];
  const missingSourceRefs = extraction.sourceCoverage?.unaccountedSourceRefs ?? [];
  let snapshot: AmbientDevSemanticSummary | null = null;
  if (extraction.bundle) {
    const reconciled = await resolveAndReconcileAmbientBundle(
      env,
      "eval-org",
      extraction.bundle,
      evaluationCase.messages,
      new Date("2026-08-27T00:00:00.000Z"),
    );
    snapshot = remapSnapshotSourceRefs(
      buildAmbientDevSemanticSummary({
        validatedBundle: extraction.bundle,
        reconciledBundle: reconciled.bundle,
        reconciliation: reconciled.summary satisfies AmbientReconciliationSummary,
        messages: evaluationCase.messages,
        extractedCandidateCount: extraction.bundle.candidates.length,
        committedCandidateCount: 0,
        sourceCoverage: extraction.sourceCoverage,
        decisionSummaries: extraction.decisionSummaries,
      }),
      evaluationCase.messages,
    );
  }
  const evaluation = snapshot
    ? evaluateAmbientDevSemanticSnapshot(snapshot, evaluationCase.groundTruth)
    : emptyEvaluation();
  const sourceMappingAccuracy = exactSourceMappingAccuracy(snapshot, evaluationCase.groundTruth);
  const expectsD05D06 = evaluationCase.groundTruth.messages.some((message) => message.id === "D05" || message.id === "D06");
  const scopedOverallSemanticAccuracy = !expectsD05D06 && evaluation.d05D06Dedupe === "UNKNOWN"
    && evaluation.overallSemanticAccuracy === "PARTIAL"
    ? "PASS"
    : evaluation.overallSemanticAccuracy;
  const jsonPass = extraction.transportDiagnostics?.issueCode === "NONE";
  const normalizationPass = jsonPass && extraction.validation !== "ai_error" && extraction.transportDiagnostics !== undefined;
  const validationPass = extraction.validation === "schema_valid";
  const systemBuildPass = Boolean(extraction.bundle);
  const sideEffectFree = state.writes === 0;
  const transportDiagnostics = extraction.transportDiagnostics;
  const transportMetadata = adapter.lastCall;
  const accountedDecisionCount = extraction.sourceCoverage?.accountedSelectedSourceCount ?? 0;
  const missingDecisionCount = extraction.sourceCoverage?.unaccountedSelectedSourceCount ?? selectedSourceCount - accountedDecisionCount;
  const overallPass = jsonPass
    && normalizationPass
    && validationPass
    && systemBuildPass
    && sideEffectFree
    && sourceMappingAccuracy === "PASS"
    && scopedOverallSemanticAccuracy === "PASS";
  return {
    testCase: evaluationCase.name,
    runIndex,
    selectedCount: selectedSourceCount,
    decisionCount: counts.decisionCount,
    decisionCoverage: `${extraction.sourceCoverage?.accountedSelectedSourceCount ?? 0}/${selectedSourceCount}`,
    missingRefCount: extraction.sourceCoverage?.unaccountedSelectedSourceCount ?? 0,
    unknownRefCount: extraction.sourceCoverage?.unknownDecisionRefs?.length ?? 0,
    duplicateRefCount: extraction.sourceCoverage?.duplicateDecisionRefs?.length ?? 0,
    eventCount: counts.eventCount,
    supportCount: counts.supportCount,
    ignoreCount: counts.ignoreCount,
    eventTypeAccuracy: evaluation.eventTypeAccuracy,
    quantityAccuracy: evaluation.quantityAccuracy,
    unknownQuantityAccuracy: evaluation.unknownQuantityAccuracy,
    supportRelationAccuracy: evaluation.supportSourceMappingAccuracy,
    sourceMappingAccuracy,
    overallSemanticAccuracy: scopedOverallSemanticAccuracy,
    hallucinationCount: evaluation.hallucinatedItemCount,
    contextLineageContaminationCount: contextContaminationCount(snapshot, evaluationCase.groundTruth),
    duplicateEventCount: duplicateEventCount(snapshot),
    jsonPass,
    normalizationPass,
    validationPass,
    systemBuildPass,
    overallPass,
    model: PRODUCTION_AI_MODEL,
    maxTokens: transportDiagnostics?.requestedMaxTokens ?? 1536,
    promptTokens: transportDiagnostics?.usagePromptTokens ?? null,
    completionTokens: transportDiagnostics?.usageCompletionTokens ?? null,
    totalTokens: transportDiagnostics?.usageTotalTokens ?? null,
    aiTransport: extraction.validation === "ai_error" ? "FAIL" : extraction.attempted ? "PASS" : "FAIL",
    httpStatus: transportMetadata?.httpStatus ?? null,
    providerResponseConfirmed: transportMetadata?.providerResponseConfirmed ?? (extraction.validation !== "ai_error" && extraction.attempted),
    transportErrorCode: transportMetadata?.errorCode ?? null,
    transportErrorClass: transportMetadata?.errorClass ?? null,
    validDecisionCount: accountedDecisionCount,
    invalidOrMissingDecisionCount: missingDecisionCount,
    errorClass: extraction.errorClass ?? null,
    aiCallCount: adapter.calls - callsBefore,
    evalSideEffectFree: sideEffectFree,
    selectedSourceRefs: [...selectedRefs],
    accountedSourceRefs,
    missingSourceRefs,
    decisionSchemaDiagnostics: extraction.decisionSchemaDiagnostics ?? null,
    snapshot,
  };
}

const REAL_MODEL_HARD_MAX_CALLS = 9;

/**
 * Run bounded fixture cases, or an explicitly injected real-model adapter.
 * Without `realModel` and `aiAdapter`, this remains entirely fixture-backed.
 */
export async function runAmbientSemanticEvalSuite(
  options: AmbientSemanticEvalSuiteOptions,
): Promise<AmbientSemanticEvalReport[]> {
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1 || runs > (options.realModel ? 3 : 10)) throw new Error("EVAL_RUN_COUNT_OUT_OF_BOUNDS");
  if (!options.realModel && options.aiAdapter) throw new Error("REAL_MODEL_FLAG_REQUIRED_FOR_INJECTED_ADAPTER");
  if (options.realModel && !options.aiAdapter) throw new Error("REAL_MODEL_ADAPTER_REQUIRED");
  if (options.realModel && (options.cases.length !== 3 || runs !== 3)) throw new Error("REAL_MODEL_MATRIX_SHAPE_REQUIRED");
  const reports: AmbientSemanticEvalReport[] = [];
  const orderedCases = options.realModel
    ? options.cases.flatMap((evaluationCase) => Array.from({ length: runs }, (_, index) => ({ evaluationCase, runIndex: index + 1 })))
    : Array.from({ length: runs }, (_, runIndex) => options.cases.map((evaluationCase) => ({ evaluationCase, runIndex: runIndex + 1 }))).flat();
  for (const { evaluationCase, runIndex } of orderedCases) {
    if (options.realModel && (options.aiAdapter?.calls ?? 0) >= REAL_MODEL_HARD_MAX_CALLS) {
      throw new Error("REAL_MODEL_CALL_LIMIT_EXCEEDED");
    }
    const attemptContext: AmbientSemanticEvalAttemptContext = {
      matrixRunId: options.matrixRunId ?? "fixture-matrix",
      caseId: evaluationCase.name,
      runIndex,
    };
    try {
      await options.aiAdapter?.setAttemptContext?.(attemptContext);
      const report = await runAmbientSemanticEvalCase(evaluationCase, runIndex, options.aiAdapter);
      await options.onAttemptComplete?.(report, options.aiAdapter?.currentAttempt);
      reports.push(report);
    } catch (error) {
      await options.onAttemptFailure?.(error, options.aiAdapter?.currentAttempt, attemptContext);
      throw error;
    }
  }
  if (options.realModel && options.aiAdapter?.calls !== REAL_MODEL_HARD_MAX_CALLS) {
    throw new Error("REAL_MODEL_CALL_COUNT_MISMATCH");
  }
  return reports;
}

export const AMBIENT_SEMANTIC_EVAL_REAL_MODEL_HARD_MAX_CALLS = REAL_MODEL_HARD_MAX_CALLS;

export type AmbientSemanticEvalDecision = AmbientAiDecision;
