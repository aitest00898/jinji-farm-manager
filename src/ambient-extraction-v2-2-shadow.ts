import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  runAmbientAiRequestInput,
  type AmbientAiRequestInput,
  type AmbientBufferedMessage,
  type AmbientEnv,
} from "./ambient";
import {
  AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
  buildAmbientV2_2StructuredRequest,
  claimAmbientV2_2DeterministicOperations,
  parseAmbientV2_2ResponseBoundary,
  type AmbientV2_2ResponseClass,
} from "./ambient-extraction-v2-2";
import type { AmbientV2MessageInput, AmbientV2MessageRoute } from "./ambient-extraction-v2";

/** The only activation input for the ordinary-line V2.2 shadow branch. */
export const AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST_ENV = "AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST" as const;

const SHADOW_MAX_TOKENS = 1536 as const;
const SHADOW_TEMPERATURE = 0 as const;
const SAFE_GROUP_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export type AmbientV2_2ShadowStructuralStatus = "PASS" | "FAIL" | "NOT_RUN";
export type AmbientV2_2ShadowTelemetryPhase = "SHADOW_ENTERED" | "SHADOW_TERMINAL" | "V1_TERMINAL";
export type AmbientV2_2ShadowTerminalStatus = "COMPLETED" | "FAILED" | "NOT_RUN";

export interface AmbientV2_2ShadowTelemetry {
  event: "ambient_v2_2_shadow";
  phase: AmbientV2_2ShadowTelemetryPhase;
  correlation_id: string;
  shadow_terminal_status: AmbientV2_2ShadowTerminalStatus;
  wire_contract_version: typeof AMBIENT_V2_2_WIRE_CONTRACT_VERSION;
  shadow_enabled: true;
  allowlist_match: true;
  route_class: AmbientV2MessageRoute | "NOT_RUN";
  deterministic_operation_count: number;
  deterministic_abnormality_count: 0;
  ai_required: boolean;
  ai_attempted: boolean;
  structural_status: AmbientV2_2ShadowStructuralStatus;
  semantic_status: "resolved" | "partial" | "unresolved" | "none" | "NOT_RUN";
  operation_count: number;
  abnormality_count: number;
  response_class: AmbientV2_2ResponseClass | "NOT_RUN";
  safe_failure_class: string | null;
  production_v1_unchanged: true;
  v1_terminal_status?: "COMPLETED" | "FAILED";
}
export interface AmbientV2_2ShadowOptions {
  groupId: string | null | undefined;
  allowlist: string | undefined;
  correlationId?: string;
  emit?: (telemetry: AmbientV2_2ShadowTelemetry) => void;
}

export interface AmbientV2_2ShadowResult {
  enabled: boolean;
  allowlistMatch: boolean;
  providerAttempts: number;
  telemetry: AmbientV2_2ShadowTelemetry[];
}

function parseShadowGroupAllowlist(value: string | undefined): Set<string> {
  const entries = (value ?? "").split(/[\s,]+/u).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length || entries.some((entry) => !SAFE_GROUP_ID.test(entry))) return new Set();
  return new Set(entries);
}

/** Exact, fail-closed group gate. It never matches prefixes or substrings. */
export function ambientV2_2ShadowGroupMatches(
  groupId: string | null | undefined,
  allowlist: string | undefined,
): boolean {
  if (!groupId || !SAFE_GROUP_ID.test(groupId)) return false;
  return parseShadowGroupAllowlist(allowlist).has(groupId);
}

function ambientV2MessageForShadow(message: AmbientBufferedMessage, ordinal: number): AmbientV2MessageInput {
  return {
    safeRef: `shadow-${ordinal}`,
    sourceIdentity: message.lineMessageId,
    text: message.text,
    selected: true,
    groupKey: message.lineGroupId,
    sourceTimestamp: message.eventTimestamp,
    sourceUser: message.lineUserId,
  };
}

function safeFailureClass(value: unknown): string {
  if (value instanceof Error && value.name === "AbortError") return "ABORT";
  if (value instanceof Error && value.name === "TimeoutError") return "TIMEOUT";
  return "PROVIDER_FAILURE";
}

function emitShadowTelemetry(
  telemetry: AmbientV2_2ShadowTelemetry,
  emit?: (telemetry: AmbientV2_2ShadowTelemetry) => void,
): void {
  try {
    if (emit) emit(telemetry);
    else console.log(JSON.stringify(telemetry));
  } catch {
    // Shadow telemetry must never become a Production V1 failure boundary.
  }
}

export function createAmbientV2_2ShadowCorrelationId(): string {
  return crypto.randomUUID();
}

function baseTelemetry(
  route: AmbientV2MessageRoute | "NOT_RUN",
  operationCount: number,
  aiRequired: boolean,
  correlationId: string,
): AmbientV2_2ShadowTelemetry {
  return {
    event: "ambient_v2_2_shadow",
    phase: "SHADOW_TERMINAL",
    correlation_id: correlationId,
    shadow_terminal_status: "NOT_RUN",
    wire_contract_version: AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
    shadow_enabled: true,
    allowlist_match: true,
    route_class: route,
    deterministic_operation_count: operationCount,
    deterministic_abnormality_count: 0,
    ai_required: aiRequired,
    ai_attempted: false,
    structural_status: "NOT_RUN",
    semantic_status: "NOT_RUN",
    operation_count: operationCount,
    abnormality_count: 0,
    response_class: "NOT_RUN",
    safe_failure_class: null,
    production_v1_unchanged: true,
  };
}

function enteredTelemetry(correlationId: string): AmbientV2_2ShadowTelemetry {
  return {
    ...baseTelemetry("NOT_RUN", 0, false, correlationId),
    phase: "SHADOW_ENTERED",
  };
}

export function emitAmbientV2_2V1TerminalTelemetry(
  correlationId: string,
  status: "COMPLETED" | "FAILED",
  emit?: (telemetry: AmbientV2_2ShadowTelemetry) => void,
): void {
  emitShadowTelemetry({
    ...baseTelemetry("NOT_RUN", 0, false, correlationId),
    phase: "V1_TERMINAL",
    v1_terminal_status: status,
    safe_failure_class: status === "FAILED" ? "V1_FAILURE" : null,
  }, emit);
}

function structuredRequest(message: AmbientV2MessageInput): AmbientAiRequestInput {
  const request = buildAmbientV2_2StructuredRequest(message);
  return {
    ...request,
    max_tokens: SHADOW_MAX_TOKENS,
    temperature: SHADOW_TEMPERATURE,
    stream: false,
  };
}

/**
 * Runs V2.2 as a read-only side observation for one ordinary Ambient digest.
 * Every provider/error boundary is contained here so Production V1 remains
 * the controlling extraction, Candidate, reply, and business-write path.
 */
export async function runAmbientV2_2Shadow(
  env: AmbientEnv,
  messages: readonly AmbientBufferedMessage[],
  options: AmbientV2_2ShadowOptions,
): Promise<AmbientV2_2ShadowResult> {
  const allowlistMatch = ambientV2_2ShadowGroupMatches(options.groupId, options.allowlist);
  if (!allowlistMatch) return { enabled: false, allowlistMatch: false, providerAttempts: 0, telemetry: [] };

  const correlationId = options.correlationId ?? createAmbientV2_2ShadowCorrelationId();
  emitShadowTelemetry(enteredTelemetry(correlationId), options.emit);
  const telemetry: AmbientV2_2ShadowTelemetry[] = [];
  let providerAttempts = 0;
  try {
    for (const [index, buffered] of messages.entries()) {
      const message = ambientV2MessageForShadow(buffered, index + 1);
      const claim = claimAmbientV2_2DeterministicOperations(message);
      const aiRequired = claim.residualRequiresAi;
      const item = baseTelemetry(claim.route, claim.operations.length, aiRequired, correlationId);
      if (!aiRequired) {
        item.semantic_status = claim.operations.length ? "resolved" : "none";
        item.shadow_terminal_status = "COMPLETED";
        telemetry.push(item);
        emitShadowTelemetry(item, options.emit);
        continue;
      }

      item.ai_attempted = true;
      providerAttempts += 1;
      try {
        const residualMessage = { ...message, text: claim.residualMessage };
        const result = await runAmbientAiRequestInput(env, PRODUCTION_AI_MODEL, structuredRequest(residualMessage));
        const boundary = parseAmbientV2_2ResponseBoundary(result);
        const parsed = boundary.parsed;
        item.response_class = boundary.responseClass;
        item.structural_status = parsed.structuralStatus === "pass" ? "PASS" : "FAIL";
        item.semantic_status = parsed.semanticStatus;
        item.operation_count = claim.operations.length + parsed.operations.length;
        item.abnormality_count = parsed.abnormalities.length;
        item.safe_failure_class = parsed.structuralStatus === "pass"
          ? parsed.semanticStatus === "resolved" || parsed.semanticStatus === "none" ? null : "SEMANTIC_FAILURE"
          : boundary.responseClass === "PROVIDER_JSON_MODE_ERROR"
            ? "PROVIDER_JSON_MODE_ERROR"
            : parsed.diagnostics.structuralSubtype ?? "STRUCTURAL_FAILURE";
        item.shadow_terminal_status = item.safe_failure_class ? "FAILED" : "COMPLETED";
      } catch (error) {
        item.safe_failure_class = safeFailureClass(error);
        item.semantic_status = "NOT_RUN";
        item.shadow_terminal_status = "FAILED";
      }
      telemetry.push(item);
      emitShadowTelemetry(item, options.emit);
    }
  } catch (error) {
    const item = baseTelemetry("NOT_RUN", 0, false, correlationId);
    item.safe_failure_class = safeFailureClass(error);
    item.shadow_terminal_status = "FAILED";
    telemetry.push(item);
    emitShadowTelemetry(item, options.emit);
  }
  return { enabled: true, allowlistMatch: true, providerAttempts, telemetry };
}
