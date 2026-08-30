import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";
import {
  buildAmbientV2Request,
  evaluateAmbientExtractionV2,
  parseAmbientV2ResponseBoundary,
  runAmbientExtractionV2Batch,
  type AmbientV2AiRequest,
  type AmbientV2MessageResult,
  type AmbientV2AiAdapter,
} from "./ambient-extraction-v2";
import {
  AMBIENT_V2_DUPLICATE_TUPLE_FIELDS,
  buildAmbientV2D03SemanticDiagnostic,
  buildAmbientV2SafeEventSemanticTelemetry,
} from "./ambient-extraction-v2-real-runner";
import {
  AMBIENT_V2_WIRE_CONTRACT_VERSION,
  AMBIENT_V2_STRUCTURED_JSON_SCHEMA,
  AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT,
  buildAmbientV2StructuredRequest,
  runAmbientExtractionV2StructuredBatch,
  queryAmbientV2ModelSchema,
} from "./ambient-extraction-v2-structured-output";

const d03 = {
  safeRef: "D03",
  sourceIdentity: "fixture-D03",
  text: "synthetic abnormal quantity unknown cough",
  selected: true,
  groupKey: "fixture-group",
} as const;

describe("Ambient V2 structured-output developer boundary", () => {
  it("adds only response_format and preserves the existing V2 prompt", () => {
    const plain = buildAmbientV2Request(d03);
    const structured = buildAmbientV2StructuredRequest(d03);

    expect(structured.messages).toEqual(plain.messages);
    expect(structured.response_format).toEqual(AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT);
    expect(JSON.stringify(structured.response_format)).not.toContain("kind");
    expect(JSON.stringify(structured.response_format)).not.toContain("targetRef");
    expect(JSON.stringify(structured.response_format)).not.toContain("confidence");
    expect(JSON.stringify(structured.response_format)).not.toContain("raw");
  });

  it("defines a small strict schema with positive-or-null quantity", () => {
    const root = AMBIENT_V2_STRUCTURED_JSON_SCHEMA as Record<string, any>;
    const event = root.properties.events.items as Record<string, any>;
    const quantity = event.properties.quantity as Record<string, any>;

    expect(root).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["events"],
    });
    expect(event).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["event", "quantity", "detail"],
    });
    expect(event.properties.event.enum).toEqual(["mortality", "cull", "abnormal"]);
    expect(quantity.anyOf).toEqual([
      { type: "number", exclusiveMinimum: 0 },
      { type: "null" },
    ]);
    expect(event.properties.detail.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
    expect(AMBIENT_V2_WIRE_CONTRACT_VERSION).toBe("2.1");
  });

  it("validates a structured response object directly without text conversion", () => {
    const boundary = parseAmbientV2ResponseBoundary({
      response: { events: [{ event: "abnormal", quantity: null, detail: "咳嗽" }] },
    });

    expect(boundary.responseClass).toBe("STRUCTURED_OBJECT_RESPONSE");
    expect(boundary.parsed.structuralStatus).toBe("pass");
    expect(boundary.parsed.semanticStatus).toBe("resolved");
    expect(boundary.parsed.proposals).toEqual([{ event: "abnormal", quantity: null, detail: "咳嗽" }]);
  });

  it("enforces the V2.1 uniform detail wire shape and keeps internal detail optional", () => {
    const abnormal = parseAmbientV2ResponseBoundary({
      response: { events: [{ event: "abnormal", quantity: null, detail: "咳嗽" }] },
    }).parsed;
    expect(abnormal.semanticStatus).toBe("resolved");
    expect(abnormal.proposals).toEqual([{ event: "abnormal", quantity: null, detail: "咳嗽" }]);

    const abnormalNull = parseAmbientV2ResponseBoundary({
      response: { events: [{ event: "abnormal", quantity: null, detail: null }] },
    }).parsed;
    expect(abnormalNull.semanticStatus).toBe("unresolved");
    expect(abnormalNull.diagnostics.semanticFailureCode).toBe("ABNORMAL_DETAIL_REQUIRED");
    expect(abnormalNull.diagnostics.firstInvalidField).toBe("detail");

    for (const [event, quantity] of [["mortality", 3], ["cull", 2]] as const) {
      const result = parseAmbientV2ResponseBoundary({
        response: { events: [{ event, quantity, detail: null }] },
      }).parsed;
      expect(result.semanticStatus).toBe("resolved");
      expect(result.proposals).toEqual([{ event, quantity }]);
      expect(result.proposals[0]).not.toHaveProperty("detail");
    }

    const forbidden = parseAmbientV2ResponseBoundary({
      response: { events: [{ event: "mortality", quantity: 3, detail: "咳嗽" }] },
    }).parsed;
    expect(forbidden.semanticStatus).toBe("unresolved");
    expect(forbidden.diagnostics.semanticFailureCode).toBe("DETAIL_NOT_ALLOWED");
  });

  it("rejects an event missing the required detail wire key", () => {
    const result = parseAmbientV2ResponseBoundary({
      response: { events: [{ event: "abnormal", quantity: null }] },
    }).parsed;
    expect(result.structuralStatus).toBe("pass");
    expect(result.semanticStatus).toBe("unresolved");
    expect(result.diagnostics.eventDiagnostics[0]?.missingKeys).toEqual(["detail"]);
    expect(result.diagnostics.semanticFailureCode).toBe("MISSING_DETAIL_FIELD");
    expect(result.diagnostics.semanticSubtype).toBe("EVENT_MISSING_DETAIL");
    expect(result.proposals).toEqual([]);
  });

  it("keeps ordinary text and provider JSON-mode errors in separate classes", () => {
    const text = parseAmbientV2ResponseBoundary({ response: '{"events":[]}' });
    expect(text.responseClass).toBe("PROMPT_TEXT_RESPONSE");
    expect(text.parsed.structuralStatus).toBe("pass");

    const providerError = parseAmbientV2ResponseBoundary({
      success: false,
      errors: [{ code: 4000, message: "JSON Mode could not be met" }],
    });
    expect(providerError.responseClass).toBe("PROVIDER_JSON_MODE_ERROR");
    expect(providerError.parsed.diagnostics.structuralSubtype).toBe("UNEXPECTED_PROVIDER_ENVELOPE");
    expect(providerError.parsed.diagnostics.structuralSubtype).not.toBe("INVALID_JSON");
  });

  it("extracts a structured object from the official-compatible REST envelope", async () => {
    let requestBody = "";
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        success: true,
        result: { response: { events: [{ event: "abnormal", quantity: null, detail: "咳嗽" }] } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const direct = new DirectWorkersAiRestAdapter({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct",
      token: "fixture-token-not-a-secret",
      fetchImpl,
    });
    const request = buildAmbientV2StructuredRequest(d03);
    const structuredInput = {
      messages: request.messages,
      max_tokens: 1536,
      temperature: 0,
      response_format: request.response_format,
    };
    const result = await direct.run(PRODUCTION_AI_MODEL, structuredInput);

    const body = JSON.parse(requestBody) as Record<string, unknown>;
    const boundary = parseAmbientV2ResponseBoundary(result);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(body.response_format).toEqual(AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT);
    expect(boundary.responseClass).toBe("STRUCTURED_OBJECT_RESPONSE");
    expect(boundary.parsed.structuralStatus).toBe("pass");
  });

  it("uses the structured parser boundary in the V2 batch evaluator", async () => {
    const adapter: AmbientV2AiAdapter = {
      name: "structured-fixture",
      async run() {
        return { response: { events: [{ event: "abnormal", quantity: null, detail: "咳嗽" }] } };
      },
    };
    const result = await runAmbientExtractionV2Batch({
      messages: [d03],
      selectedRefs: ["D03"],
      adapter,
      responseParser: (value) => parseAmbientV2ResponseBoundary(value).parsed,
    });
    const evaluation = evaluateAmbientExtractionV2(result, [{
      safeRef: "D03",
      events: [{ event: "abnormal", quantity: null, detail: "咳嗽" }],
      relationTargetRef: null,
    }], ["D03"]);

    expect(result.sideEffectFree).toBe(true);
    expect(result.systemBuildStatus).toBe("pass");
    expect(evaluation.overallPass).toBe(true);
    expect(evaluation.eventCount).toBe(1);
  });

  it("uses the shared structured request and response boundary in normal developer V2 execution", async () => {
    let capturedRequest: AmbientV2AiRequest | null = null;
    const adapter: AmbientV2AiAdapter = {
      name: "structured-normal-fixture",
      async run(request) {
        capturedRequest = request;
        return { response: { events: [{ event: "abnormal", quantity: null, detail: "咳嗽" }] } };
      },
    };
    const result = await runAmbientExtractionV2StructuredBatch({
      messages: [d03],
      selectedRefs: ["D03"],
      adapter,
    });

    expect(capturedRequest).not.toBeNull();
    const captured = capturedRequest as unknown as AmbientV2AiRequest;
    expect(captured.messages).toEqual(buildAmbientV2Request(d03).messages);
    expect(captured.response_format).toEqual(AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT);
    expect(result.messages[0]?.structuralStatus).toBe("pass");
    expect(result.messages[0]?.semanticStatus).toBe("resolved");
  });

  it("emits bounded event telemetry without persisting detail values", async () => {
    const expected = {
      safeRef: "D03",
      events: [{ event: "abnormal" as const, quantity: null, detail: "咳嗽" }],
      relationTargetRef: null,
    };
    const adapterFor = (events: Array<{ event: "abnormal"; quantity: null; detail: string }>): AmbientV2AiAdapter => ({
      name: "bounded-telemetry-fixture",
      async run() {
        return { response: { events } };
      },
    });
    const duplicateResult = await runAmbientExtractionV2StructuredBatch({
      messages: [d03],
      selectedRefs: ["D03"],
      adapter: adapterFor([
        { event: "abnormal", quantity: null, detail: "咳嗽" },
        { event: "abnormal", quantity: null, detail: "咳嗽" },
      ]),
    });
    const duplicateMessage = duplicateResult.messages[0] as AmbientV2MessageResult;
    const duplicateTelemetry = buildAmbientV2SafeEventSemanticTelemetry(duplicateMessage, expected);
    expect(duplicateTelemetry).toMatchObject([
      {
        eventOrdinal: 1,
        eventEnum: "abnormal",
        quantityKind: "null",
        detailPresent: "YES",
        detailValidShort: "YES",
        detailCodePointCount: 2,
        detailEqualsPreviousEvent: "NOT_APPLICABLE",
        detailMatchExpectedExact: "YES",
        eventMatchExpectedExact: "YES",
        fullEventEqualsPreviousEvent: "NOT_APPLICABLE",
      },
      {
        eventOrdinal: 2,
        eventEnum: "abnormal",
        quantityKind: "null",
        detailPresent: "YES",
        detailValidShort: "YES",
        detailCodePointCount: 2,
        detailEqualsPreviousEvent: "YES",
        detailMatchExpectedExact: "NO",
        eventMatchExpectedExact: "NO",
        fullEventEqualsPreviousEvent: "YES",
      },
    ]);
    expect(JSON.stringify(duplicateTelemetry)).not.toContain("咳嗽");

    const distinctResult = await runAmbientExtractionV2StructuredBatch({
      messages: [d03],
      selectedRefs: ["D03"],
      adapter: adapterFor([
        { event: "abnormal", quantity: null, detail: "咳嗽" },
        { event: "abnormal", quantity: null, detail: "喘" },
      ]),
    });
    const distinctMessage = distinctResult.messages[0] as AmbientV2MessageResult;
    const distinctTelemetry = buildAmbientV2SafeEventSemanticTelemetry(distinctMessage, expected);
    expect(distinctTelemetry[0]?.eventMatchExpectedExact).toBe("YES");
    expect(distinctTelemetry[1]?.eventMatchExpectedExact).toBe("NO");
    expect(distinctTelemetry[1]?.detailEqualsPreviousEvent).toBe("NO");
    expect(distinctTelemetry[1]?.fullEventEqualsPreviousEvent).toBe("NO");
    expect(JSON.stringify(distinctTelemetry)).not.toContain("喘");
  });

  it("classifies bounded D03 semantic failure subtypes using the full event tuple", async () => {
    const expected = {
      safeRef: "D03",
      events: [{ event: "abnormal" as const, quantity: null, detail: "咳嗽" }],
      relationTargetRef: null,
    };
    const run = async (events: Array<{ event: "abnormal"; quantity: null; detail?: string }>) => {
      const result = await runAmbientExtractionV2StructuredBatch({
        messages: [d03],
        selectedRefs: ["D03"],
        adapter: {
          name: "d03-semantic-subtype-fixture",
          async run() {
            return { response: { events } };
          },
        },
      });
      return buildAmbientV2D03SemanticDiagnostic(result.messages[0] as AmbientV2MessageResult, expected);
    };

    const correct = await run([{ event: "abnormal", quantity: null, detail: "咳嗽" }]);
    expect(correct.semanticPass).toBe("YES");
    expect(correct.semanticSubtype).toBe("NONE");

    const exactDuplicate = await run([
      { event: "abnormal", quantity: null, detail: "咳嗽" },
      { event: "abnormal", quantity: null, detail: "咳嗽" },
    ]);
    expect(exactDuplicate.event1MatchesExpected).toBe("YES");
    expect(exactDuplicate.event2DetailEqualsEvent1).toBe("YES");
    expect(exactDuplicate.event2ExactlyEqualsEvent1).toBe("YES");
    expect(exactDuplicate.semanticSubtype).toBe("EXACT_DUPLICATE_EVENT");

    const spuriousSecond = await run([
      { event: "abnormal", quantity: null, detail: "咳嗽" },
      { event: "abnormal", quantity: null, detail: "喘" },
    ]);
    expect(spuriousSecond.event2DetailEqualsEvent1).toBe("NO");
    expect(spuriousSecond.event2ExactlyEqualsEvent1).toBe("NO");
    expect(spuriousSecond.semanticSubtype).toBe("SPURIOUS_SECOND_EVENT");

    const missingDetail = await run([{ event: "abnormal", quantity: null }]);
    expect(missingDetail.event1DetailPresent).toBe("NO");
    expect(missingDetail.event1DetailMatchesExpected).toBe("NO");
    expect(missingDetail.semanticSubtype).toBe("DETAIL_MISSING");

    const wrongDetail = await run([{ event: "abnormal", quantity: null, detail: "腳傷" }]);
    expect(wrongDetail.event1DetailPresent).toBe("YES");
    expect(wrongDetail.event1DetailMatchesExpected).toBe("NO");
    expect(wrongDetail.semanticSubtype).toBe("DETAIL_MISMATCH");

    expect(AMBIENT_V2_DUPLICATE_TUPLE_FIELDS).toEqual(["event", "quantity", "detail"]);
    const bounded = JSON.stringify({ exactDuplicate, spuriousSecond, missingDetail, wrongDetail });
    expect(bounded).not.toContain("咳嗽");
    expect(bounded).not.toContain("喘");
    expect(bounded).not.toContain("腳傷");
  });

  it("keeps V1 controlling while the ordinary-line V2.2 Shadow is explicit and gated", () => {
    const productionSource = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");
    expect(productionSource).toContain("runAmbientV2_2Shadow");
    expect(productionSource).toContain("AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST");
    expect(productionSource).toContain("extractAmbientCandidates");
    expect(productionSource).toContain('url.pathname === "/__codex/runtime/ambient-semantic-ai"');
    expect(productionSource).toContain('env.RUNTIME_AMBIENT_SEMANTIC_EVAL_ENABLED !== "1"');
  });

  it("audits model schema with bounded fields and no payload persistence", async () => {
    const secret = "fixture-token-not-for-output";
    let requestUrl = "";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({
        success: true,
        result: {
          input: {
            type: "object",
            properties: {
              messages: { type: "array" },
              response_format: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["json_object", "json_schema"] },
                  json_schema: { type: "object" },
                },
              },
            },
          },
          output: { type: "object" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const audit = await queryAmbientV2ModelSchema({
      accountId: "a".repeat(32),
      token: secret,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(requestUrl).toContain("/ai/models/schema?model=%40cf%2Fmeta%2Fllama-3.2-3b-instruct");
    expect(audit).toMatchObject({
      httpStatus: 200,
      cloudflareSuccess: true,
      resultPresent: true,
      messagesInputSupported: "YES",
      structuredResponseShape: "OBJECT",
      inputResponseFormatPresent: "YES",
      inputResponseFormatType: "OBJECT",
      explicitJsonSchemaSupport: "YES",
      errorClass: null,
    });
    expect(JSON.stringify(audit)).not.toContain(secret);
  });

  it("queries a specified candidate model without changing the default Production model", async () => {
    let requestUrl = "";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({
        success: true,
        result: { input: { type: "object" }, output: { type: "object" } },
      }), { status: 200 });
    });
    await queryAmbientV2ModelSchema({
      accountId: "a".repeat(32),
      token: "fixture-token-not-for-output",
      model: "@cf/qwen/qwen3.8-27b",
      fetchImpl,
    });
    expect(requestUrl).toContain("model=%40cf%2Fqwen%2Fqwen3.8-27b");
  });
});
