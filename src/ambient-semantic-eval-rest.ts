import { randomUUID } from "node:crypto";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  AMBIENT_SEMANTIC_EVAL_REAL_MODEL_HARD_MAX_CALLS,
  type AmbientSemanticEvalAiAdapter,
  type AmbientSemanticEvalTransportMetadata,
} from "./ambient-semantic-eval";
import type { AmbientAiRequestInput } from "./ambient";
import {
  AmbientSemanticEvalAttemptLedger,
  requestContractFingerprint,
  type AmbientSemanticEvalAttemptContext,
  type AmbientSemanticEvalAttemptHandle,
} from "./ambient-semantic-eval-attempt-ledger";

export interface AmbientWorkersAiRestAdapterOptions {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
  ledger?: AmbientSemanticEvalAttemptLedger;
  matrixRunId?: string;
  timeoutMs?: number;
  maxCalls?: number;
  /** Developer-only cross-model screening opt-in; Production callers never set this. */
  allowNonProductionModel?: boolean;
}

interface CloudflareErrorEntry {
  code?: unknown;
  message?: unknown;
}

interface CloudflareAiRunEnvelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
}

function boundedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function boundedErrorCode(errors: unknown): string | null {
  if (!Array.isArray(errors)) return null;
  const first = errors[0] as CloudflareErrorEntry | undefined;
  const code = first && (typeof first.code === "number" || typeof first.code === "string")
    ? String(first.code)
    : null;
  return code && /^[A-Za-z0-9_.:-]{1,40}$/u.test(code) ? code : null;
}

function boundedErrorClass(status: number | null, errors: unknown): string | null {
  const first = Array.isArray(errors) ? errors[0] as CloudflareErrorEntry | undefined : undefined;
  const message = typeof first?.message === "string" ? first.message.toLowerCase() : "";
  if (/(?:json mode|response_format|json_schema)/u.test(message)) return "PROVIDER_JSON_MODE_ERROR";
  if (status === 401 || status === 403 || /(?:unauthori[sz]ed|forbidden|api token|permission|authentication)/u.test(message)) return "AUTH_FAILURE";
  if (status === 404 || /(?:model|not found|unknown model)/u.test(message)) return "MODEL_NOT_FOUND_OR_NOT_ALLOWED";
  if (/(?:terms|required terms|accept.*terms)/u.test(message)) return "MODEL_TERMS_REQUIRED";
  if (/(?:paid plan|billing)/u.test(message)) return "PAID_PLAN_REQUIRED";
  if (/(?:quota|rate limit|too many requests|exhausted)/u.test(message)) return "FREE_QUOTA_EXHAUSTED";
  if (status !== null && status >= 500) return "CAPACITY_OR_PROVIDER_ERROR";
  if (status !== null && status >= 400) return "INVALID_REQUEST";
  return null;
}

function hasResult(envelope: CloudflareAiRunEnvelope): boolean {
  return Object.prototype.hasOwnProperty.call(envelope, "result")
    && envelope.result !== null
    && envelope.result !== undefined;
}

function hasNonemptyResult(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && value !== null) {
    const response = (value as { response?: unknown }).response;
    if (typeof response === "string") return response.trim().length > 0;
    return Object.keys(value).length > 0;
  }
  return value !== null && value !== undefined;
}

/**
 * Direct Cloudflare REST transport for the developer-only evaluation harness.
 * It forwards the exact Production Ambient request body and has no Worker,
 * D1, Queue, LINE, or business-write dependency.
 */
export class DirectWorkersAiRestAdapter implements AmbientSemanticEvalAiAdapter {
  readonly name = "cloudflare-workers-ai-rest";
  private providerAttemptCount = 0;
  lastCall: AmbientSemanticEvalTransportMetadata | undefined;
  currentAttempt: AmbientSemanticEvalAttemptHandle | undefined;

  private readonly endpoint: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly ledger: AmbientSemanticEvalAttemptLedger | undefined;
  private readonly timeoutMs: number;
  private readonly maxCalls: number;
  private readonly allowNonProductionModel: boolean;
  private matrixRunId: string | undefined;
  private attemptContext: AmbientSemanticEvalAttemptContext | undefined;

  get calls(): number {
    return this.providerAttemptCount;
  }

  constructor(options: AmbientWorkersAiRestAdapterOptions) {
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.ledger = options.ledger;
    this.matrixRunId = options.matrixRunId;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
      ? Math.floor(options.timeoutMs!)
      : 30_000;
    this.maxCalls = Number.isInteger(options.maxCalls) && (options.maxCalls ?? 0) > 0
      ? Math.min(AMBIENT_SEMANTIC_EVAL_REAL_MODEL_HARD_MAX_CALLS, options.maxCalls!)
      : AMBIENT_SEMANTIC_EVAL_REAL_MODEL_HARD_MAX_CALLS;
    this.allowNonProductionModel = options.allowNonProductionModel === true;
    if (this.ledger && !this.matrixRunId) throw boundedError("REAL_MODEL_MATRIX_RUN_ID_REQUIRED");
  }

  setAttemptContext(context: AmbientSemanticEvalAttemptContext): void {
    if (this.matrixRunId && this.matrixRunId !== context.matrixRunId) {
      throw boundedError("REAL_MODEL_MATRIX_RUN_ID_MISMATCH");
    }
    this.matrixRunId = context.matrixRunId;
    this.attemptContext = { ...context };
    this.currentAttempt = undefined;
  }

  private async beginAttempt(model: string, input: AmbientAiRequestInput): Promise<AmbientSemanticEvalAttemptHandle> {
    const matrixRunId = this.matrixRunId ?? this.attemptContext?.matrixRunId;
    const context = this.attemptContext && matrixRunId
      ? { ...this.attemptContext, matrixRunId }
      : undefined;
    if (this.ledger && !context) throw boundedError("REAL_MODEL_ATTEMPT_CONTEXT_REQUIRED");

    let existingStarts = this.providerAttemptCount;
    if (this.ledger && matrixRunId) {
      existingStarts = await this.ledger.countStarts(matrixRunId);
      this.providerAttemptCount = existingStarts;
    }
    if (existingStarts >= this.maxCalls) {
      throw boundedError("REAL_MODEL_CALL_LIMIT_EXCEEDED");
    }

    const handle: AmbientSemanticEvalAttemptHandle = {
      ...(context ?? { matrixRunId: matrixRunId ?? "local-matrix", caseId: "local", runIndex: existingStarts + 1 }),
      attemptId: randomUUID(),
    };
    if (this.ledger) {
      try {
        await this.ledger.append({
          ...handle,
          recordType: "ATTEMPT_START",
          model,
          timestamp: new Date().toISOString(),
          requestContractFingerprint: requestContractFingerprint(input),
          maxTokens: input.max_tokens,
          temperature: input.temperature,
          status: "started",
        });
      } catch {
        this.lastCall = {
          httpStatus: null,
          providerResponseConfirmed: false,
          errorCode: null,
          errorClass: "TELEMETRY_DURABILITY_FAILURE",
        };
        throw boundedError("TELEMETRY_DURABILITY_FAILURE");
      }
    }
    this.currentAttempt = handle;
    this.providerAttemptCount = existingStarts + 1;
    return handle;
  }

  async run(model: string, input: AmbientAiRequestInput): Promise<unknown> {
    if (model !== PRODUCTION_AI_MODEL && !this.allowNonProductionModel) {
      throw boundedError("REAL_MODEL_MODEL_MISMATCH");
    }

    await this.beginAttempt(model, input);
    let response: Response;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      this.lastCall = {
        httpStatus: null,
        providerResponseConfirmed: false,
        errorCode: null,
        errorClass: timedOut ? "PROVIDER_TIMEOUT" : "NETWORK_FAILURE",
      };
      throw boundedError(timedOut ? "REAL_MODEL_REST_TIMEOUT" : "REAL_MODEL_REST_NETWORK_FAILURE");
    }
    clearTimeout(timeout);

    let envelope: CloudflareAiRunEnvelope;
    try {
      envelope = await response.json() as CloudflareAiRunEnvelope;
    } catch {
      this.lastCall = {
        httpStatus: response.status,
        providerResponseConfirmed: false,
        errorCode: null,
        errorClass: "NON_JSON_RESPONSE",
      };
      throw boundedError("REAL_MODEL_REST_NON_JSON_RESPONSE");
    }

    const errorCode = boundedErrorCode(envelope.errors);
    const errorClass = boundedErrorClass(response.status, envelope.errors);
    const providerResponseConfirmed = response.ok && envelope.success === true && hasResult(envelope);
    this.lastCall = {
      httpStatus: response.status,
      providerResponseConfirmed,
      errorCode,
      errorClass: providerResponseConfirmed ? null : errorClass ?? "PROVIDER_RESPONSE_INVALID",
    };
    if (!providerResponseConfirmed) {
      throw boundedError(
        response.ok
          ? "REAL_MODEL_REST_PROVIDER_RESPONSE_INVALID"
          : `REAL_MODEL_REST_HTTP_${response.status}`,
      );
    }
    return envelope.result;
  }
}

export function workersAiRestResultIsNonempty(envelope: unknown): boolean {
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) return false;
  const record = envelope as CloudflareAiRunEnvelope;
  return hasResult(record) && hasNonemptyResult(record.result);
}
