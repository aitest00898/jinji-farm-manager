import { AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT } from "./ambient-extraction-v2-2";
import type { AmbientAiRequestInput } from "./ambient";

const REQUIRED_V2_2_REQUEST_KEYS = [
  "max_tokens",
  "messages",
  "response_format",
  "stream",
  "temperature",
].sort().join(",");

type ParityRequestFailure =
  | "INVALID_MODEL"
  | "INVALID_REQUEST"
  | "INVALID_REQUEST_KEYS"
  | "INVALID_REQUEST_SETTINGS"
  | "INVALID_MESSAGES"
  | "INVALID_RESPONSE_FORMAT";

export type AmbientV2_2WorkerParityRequestResult =
  | { ok: true; model: string; input: AmbientAiRequestInput }
  | { ok: false; error: ParityRequestFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactPinnedResponseFormat(value: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
}

function validMessages(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length !== 2) return false;
  if (!value.every(isRecord)) return false;
  return value[0]?.role === "system"
    && value[1]?.role === "user"
    && value.every((message) => typeof message.content === "string" && message.content.length <= 100_000);
}

/**
 * Validates the fixed developer-only V2.2 request before it reaches env.AI.
 * The returned input is the parsed request object itself; no request fields
 * are dropped or reconstructed after this allowlist succeeds.
 */
export function validateAmbientV2_2WorkerParityRequest(
  model: unknown,
  request: unknown,
  expectedModel: string,
): AmbientV2_2WorkerParityRequestResult {
  if (model !== expectedModel) return { ok: false, error: "INVALID_MODEL" };
  if (!isRecord(request)) return { ok: false, error: "INVALID_REQUEST" };
  if (Object.keys(request).sort().join(",") !== REQUIRED_V2_2_REQUEST_KEYS) {
    return { ok: false, error: "INVALID_REQUEST_KEYS" };
  }
  if (request.max_tokens !== 1536 || request.temperature !== 0 || request.stream !== false) {
    return { ok: false, error: "INVALID_REQUEST_SETTINGS" };
  }
  if (!validMessages(request.messages)) return { ok: false, error: "INVALID_MESSAGES" };
  if (!hasExactPinnedResponseFormat(request.response_format)) {
    return { ok: false, error: "INVALID_RESPONSE_FORMAT" };
  }
  return { ok: true, model: expectedModel, input: request as unknown as AmbientAiRequestInput };
}
