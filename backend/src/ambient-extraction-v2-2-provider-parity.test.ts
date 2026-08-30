import { describe, expect, it, vi } from "vitest";
import {
  ambientAiRequestFor,
  runAmbientAiRequestInput,
  type AmbientBufferedMessage,
  type AmbientEnv,
} from "./ambient";
import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
  buildAmbientV2_2StructuredRequest,
  parseAmbientV2_2ResponseBoundary,
} from "./ambient-extraction-v2-2";
import { buildAmbientV2_2RealMiniRequest } from "./ambient-extraction-v2-2-real-mini-suite";
import { validateAmbientV2_2WorkerParityRequest } from "./ambient-extraction-v2-2-provider-parity";

function parityRequest() {
  return buildAmbientV2_2RealMiniRequest({
    safeRef: "D03",
    sourceIdentity: "provider-parity-fixture",
    text: "D03 fixture",
    selected: true,
  });
}

describe("Ambient V2.2 Worker AI provider parity boundary", () => {
  it("accepts only the pinned V2.2 structured request", () => {
    const request = parityRequest();
    const result = validateAmbientV2_2WorkerParityRequest(PRODUCTION_AI_MODEL, request, PRODUCTION_AI_MODEL);
    expect(result).toEqual({ ok: true, model: PRODUCTION_AI_MODEL, input: request });
    if (result.ok) expect(result.input).toBe(request);
    expect(request.response_format).toEqual(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
    expect(request.stream).toBe(false);
  });

  it("rejects a missing response_format, foreign schema, and arbitrary model", () => {
    const request = parityRequest();
    const { response_format: _responseFormat, ...missingResponseFormat } = request;
    expect(validateAmbientV2_2WorkerParityRequest(PRODUCTION_AI_MODEL, missingResponseFormat, PRODUCTION_AI_MODEL)).toEqual({
      ok: false,
      error: "INVALID_REQUEST_KEYS",
    });
    expect(validateAmbientV2_2WorkerParityRequest(
      PRODUCTION_AI_MODEL,
      { ...request, response_format: { type: "json_schema", json_schema: { properties: {} } } },
      PRODUCTION_AI_MODEL,
    )).toEqual({ ok: false, error: "INVALID_RESPONSE_FORMAT" });
    expect(validateAmbientV2_2WorkerParityRequest("@cf/other-model", request, PRODUCTION_AI_MODEL)).toEqual({
      ok: false,
      error: "INVALID_MODEL",
    });
  });

  it("forwards the accepted request unchanged through the Worker AI seam", async () => {
    const request = parityRequest();
    const run = vi.fn(async () => ({ response: "unused" }));
    const env = { AI: { run } } as unknown as AmbientEnv;
    await runAmbientAiRequestInput(env, PRODUCTION_AI_MODEL, request);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(PRODUCTION_AI_MODEL, request);
  });

  it("accepts a binding-shaped structured object at the V2.2 response boundary", () => {
    const result = parseAmbientV2_2ResponseBoundary({
      response: { operations: [], abnormalities: [] },
    });
    expect(result.responseClass).toBe("STRUCTURED_OBJECT_RESPONSE");
    expect(result.parsed.diagnostics.structuralStatus).toBe("pass");
  });

  it("keeps the existing Production V1 request free of structured fields", () => {
    const message: AmbientBufferedMessage = {
      id: "local-message",
      organizationId: "local-org",
      lineGroupId: "local-group",
      lineUserId: "local-user",
      lineMessageId: "local-line-message",
      eventTimestamp: "2026-08-28T00:00:00.000Z",
      text: "plain fixture",
      digestHour: "2026-08-28T00",
    };
    const request = ambientAiRequestFor([message]);
    expect(request).not.toHaveProperty("response_format");
    expect(request).not.toHaveProperty("stream");
  });
});
