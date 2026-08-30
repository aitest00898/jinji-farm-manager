import { runAmbientAiRequestInput, type AmbientEnv } from "./ambient";
import {
  AMBIENT_V2_2_PARITY_CASE_REF,
  AMBIENT_V2_2_PARITY_MAX_TOKENS,
  AMBIENT_V2_2_PARITY_MODEL,
  AMBIENT_V2_2_PARITY_PATH,
  AMBIENT_V2_2_PARITY_TEMPERATURE,
  type AmbientV2_2ParityWorkerEnv,
} from "./ambient-extraction-v2-2-parity-contract";
import {
  AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
  AMBIENT_V2_2_SYSTEM_PROMPT,
  AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
  buildAmbientV2_2StructuredRequest,
  evaluateAmbientV2_2Facts,
  factsFromAmbientV2_2Parsed,
  parseAmbientV2_2ResponseBoundary,
  type AmbientV2_2FactSet,
} from "./ambient-extraction-v2-2";
import type { AmbientV2MessageInput } from "./ambient-extraction-v2";

/** The existing frozen D03 input; this entrypoint creates no new fixture. */
const D03_SOURCE_TEXT = "金雞測試場有幾隻一直咳，數量還不確定";
const D03_EXPECTED: AmbientV2_2FactSet = {
  operations: [],
  abnormalities: [{ detail: "咳嗽", quantity: null }],
};

type ParityRequest = { caseRef: typeof AMBIENT_V2_2_PARITY_CASE_REF };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isParityRequest(value: unknown): value is ParityRequest {
  return isRecord(value)
    && Object.keys(value).length === 1
    && value.caseRef === AMBIENT_V2_2_PARITY_CASE_REF;
}

function responseValueType(value: unknown): "object" | "string" | "null" | "other" {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return "other";
}

function buildD03Request() {
  const message: AmbientV2MessageInput = {
    safeRef: AMBIENT_V2_2_PARITY_CASE_REF,
    sourceIdentity: "v22-worker-parity-d03",
    text: D03_SOURCE_TEXT,
    selected: true,
    groupKey: "v22-worker-parity",
  };
  const base = buildAmbientV2_2StructuredRequest(message);
  return {
    ...base,
    max_tokens: AMBIENT_V2_2_PARITY_MAX_TOKENS,
    temperature: AMBIENT_V2_2_PARITY_TEMPERATURE,
    stream: false as const,
  };
}

/**
 * Dedicated local-only Worker for one V2.2 D03 binding-parity request.
 * It has no D1, Queue, LINE, Candidate, or official-write dependency.
 */
const worker = {
  async fetch(request: Request, env: AmbientV2_2ParityWorkerEnv): Promise<Response> {
    if (env.PARITY_LOCAL_ONLY !== "1"
      || request.method !== "POST"
      || new URL(request.url).pathname !== AMBIENT_V2_2_PARITY_PATH) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_request" }, 400);
    }
    if (!isParityRequest(body)) return json({ ok: false, error: "invalid_case" }, 400);

    const requestInput = buildD03Request();
    const requestResponseFormatPreserved = JSON.stringify(requestInput.response_format)
      === JSON.stringify(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);

    let providerResult: unknown;
    try {
      providerResult = await runAmbientAiRequestInput(
        { AI: env.AI } as unknown as AmbientEnv,
        AMBIENT_V2_2_PARITY_MODEL,
        requestInput,
      );
    } catch {
      return json({
        ok: false,
        caseRef: body.caseRef,
        wireContractVersion: AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
        model: AMBIENT_V2_2_PARITY_MODEL,
        requestResponseFormatPresent: requestInput.response_format !== undefined,
        requestResponseFormatPreserved,
        providerResponseConfirmed: false,
        failureLayer: "WORKER_AI_BINDING",
      }, 502);
    }

    const boundary = parseAmbientV2_2ResponseBoundary(providerResult);
    const parsed = boundary.parsed;
    const structuralPass = parsed.structuralStatus === "pass";
    const evaluation = structuralPass
      ? evaluateAmbientV2_2Facts(factsFromAmbientV2_2Parsed(parsed), D03_EXPECTED)
      : null;

    return json({
      ok: structuralPass && evaluation?.factExtractionPass === true,
      caseRef: body.caseRef,
      wireContractVersion: AMBIENT_V2_2_WIRE_CONTRACT_VERSION,
      model: AMBIENT_V2_2_PARITY_MODEL,
      requestResponseFormatPresent: requestInput.response_format !== undefined,
      requestResponseFormatPreserved,
      promptUnchanged: requestInput.messages[0]?.content === AMBIENT_V2_2_SYSTEM_PROMPT,
      providerResponseConfirmed: true,
      providerResponseValueType: responseValueType(providerResult),
      responseBoundaryReached: true,
      responseClass: boundary.responseClass,
      structuralStatus: structuralPass ? "PASS" : "FAIL",
      structuralSubtype: parsed.diagnostics.structuralSubtype ?? "NONE",
      operationFactCount: parsed.diagnostics.operationItemCount,
      abnormalityFactCount: parsed.diagnostics.abnormalityItemCount,
      actualFactCount: evaluation?.actualFactCount ?? null,
      expectedFactCount: evaluation?.expectedFactCount ?? null,
      factExtraction: evaluation === null
        ? "NOT_EVALUATED"
        : evaluation.factExtractionPass ? "PASS" : "FAIL",
    });
  },
};

export default worker;
