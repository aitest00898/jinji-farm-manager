import { PRODUCTION_AI_MODEL } from "./analysis";
import {
  buildAmbientV2Request,
  parseAmbientV2ResponseBoundary,
  runAmbientExtractionV2Batch,
  type AmbientV2AiRequest,
  type AmbientV2BatchOptions,
  type AmbientV2BatchResult,
  type AmbientV2MessageInput,
  type AmbientV2ParsedResponse,
  type AmbientV2ResponseFormat,
} from "./ambient-extraction-v2";

export const AMBIENT_V2_WIRE_CONTRACT_VERSION = "2.1" as const;

/** Developer-only schema. It is not imported by the Production Worker path. */
export const AMBIENT_V2_STRUCTURED_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          event: {
            type: "string",
            enum: ["mortality", "cull", "abnormal"],
          },
          quantity: {
            anyOf: [
              { type: "number", exclusiveMinimum: 0 },
              { type: "null" },
            ],
          },
          detail: {
            anyOf: [
              { type: "string" },
              { type: "null" },
            ],
          },
        },
        required: ["event", "quantity", "detail"],
      },
    },
  },
  required: ["events"],
} as const;

export const AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT: AmbientV2ResponseFormat = {
  type: "json_schema",
  json_schema: AMBIENT_V2_STRUCTURED_JSON_SCHEMA,
};

export function buildAmbientV2StructuredRequest(message: AmbientV2MessageInput): AmbientV2AiRequest {
  return {
    ...buildAmbientV2Request(message),
    response_format: AMBIENT_V2_STRUCTURED_RESPONSE_FORMAT,
  };
}

export interface AmbientV2StructuredExecutionOptions {
  requestBuilder: (message: AmbientV2MessageInput) => AmbientV2AiRequest;
  responseParser: (value: unknown) => AmbientV2ParsedResponse;
}

/**
 * The single developer-only V2 structured execution wiring. Probe and normal
 * V2 callers share this builder and boundary instead of maintaining separate
 * response-format or object-parsing implementations.
 */
export function ambientV2StructuredExecutionOptions(): AmbientV2StructuredExecutionOptions {
  return {
    requestBuilder: buildAmbientV2StructuredRequest,
    responseParser: (value) => parseAmbientV2ResponseBoundary(value).parsed,
  };
}

export type AmbientV2StructuredBatchOptions = Omit<AmbientV2BatchOptions, "requestBuilder" | "responseParser">;

/**
 * Developer-only normal V2 batch path. Production V1 does not import this
 * module. The semantic pipeline remains the existing V2 batch implementation;
 * only its request builder and response boundary are selected here.
 */
export function runAmbientExtractionV2StructuredBatch(
  options: AmbientV2StructuredBatchOptions,
): Promise<AmbientV2BatchResult> {
  return runAmbientExtractionV2Batch({
    ...options,
    ...ambientV2StructuredExecutionOptions(),
  });
}

export interface AmbientV2ModelSchemaAudit {
  httpStatus: number | null;
  cloudflareSuccess: boolean | null;
  resultPresent: boolean;
  inputKeys: string[];
  outputKeys: string[];
  requiredInputKeys: string[];
  responseFormatKeys: string[];
  messagesInputSupported: "YES" | "NO" | "UNKNOWN";
  structuredResponseShape: "OBJECT" | "STRING" | "UNKNOWN";
  inputResponseFormatPresent: "YES" | "NO" | "UNKNOWN";
  inputResponseFormatType: "OBJECT" | "ARRAY" | "STRING" | "MISSING" | "UNKNOWN";
  explicitJsonSchemaSupport: "YES" | "NO" | "INCONCLUSIVE";
  errorClass: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeType(value: unknown): AmbientV2ModelSchemaAudit["inputResponseFormatType"] {
  if (value === undefined) return "MISSING";
  if (Array.isArray(value)) return "ARRAY";
  if (value === null) return "UNKNOWN";
  if (typeof value === "object") return "OBJECT";
  if (typeof value === "string") return "STRING";
  return "UNKNOWN";
}

function safeKeys(value: unknown): string[] {
  return isRecord(value)
    ? Object.keys(value).filter((key) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key)).slice(0, 64)
    : [];
}

function safeRequiredKeys(value: unknown): string[] {
  return isRecord(value) && Array.isArray(value.required)
    ? value.required.filter((key): key is string => typeof key === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key)).slice(0, 64)
    : [];
}

function safePropertyKeys(value: unknown): string[] {
  return isRecord(value) && isRecord(value.properties)
    ? safeKeys(value.properties)
    : [];
}

function findSchemaProperty(value: unknown, propertyName: string, depth = 0): unknown {
  if (depth > 5 || !isRecord(value)) return undefined;
  const properties = value.properties;
  if (isRecord(properties) && Object.prototype.hasOwnProperty.call(properties, propertyName)) {
    return properties[propertyName];
  }
  for (const key of ["input", "oneOf", "anyOf", "allOf", "items"]) {
    const child = value[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findSchemaProperty(item, propertyName, depth + 1);
        if (found !== undefined) return found;
      }
    } else {
      const found = findSchemaProperty(child, propertyName, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function messagesInputStatus(input: unknown): AmbientV2ModelSchemaAudit["messagesInputSupported"] {
  const messages = findSchemaProperty(input, "messages");
  if (messages === undefined) return "UNKNOWN";
  if (!isRecord(messages)) return "NO";
  const type = messages.type;
  return type === "array" || (Array.isArray(type) && type.includes("array")) ? "YES" : "NO";
}

function structuredOutputShape(output: unknown): AmbientV2ModelSchemaAudit["structuredResponseShape"] {
  if (!isRecord(output)) return "UNKNOWN";
  if (output.type === "object") return "OBJECT";
  if (output.type === "string") return "STRING";
  return "UNKNOWN";
}

function explicitJsonSchemaSupport(responseFormat: unknown): AmbientV2ModelSchemaAudit["explicitJsonSchemaSupport"] {
  if (!isRecord(responseFormat)) return "INCONCLUSIVE";
  const properties = responseFormat.properties;
  if (!isRecord(properties)) return "INCONCLUSIVE";
  const typeNode = properties.type;
  const jsonSchemaNode = properties.json_schema;
  if (isRecord(typeNode) && Array.isArray(typeNode.enum)
    && typeNode.enum.includes("json_schema") && jsonSchemaNode !== undefined) return "YES";
  if (isRecord(typeNode) && Array.isArray(typeNode.enum)
    && !typeNode.enum.includes("json_schema")) return "NO";
  return "INCONCLUSIVE";
}

function boundedErrorClass(status: number): string {
  if (status === 401 || status === 403) return "AUTH_FAILURE";
  if (status === 404) return "MODEL_SCHEMA_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "CLOUDFLARE_API_ERROR";
  if (status >= 400) return "INVALID_REQUEST";
  return "UNKNOWN";
}

/**
 * Read the official model-schema endpoint without returning or persisting its
 * raw payload. The token exists only in the caller's process memory.
 */
export async function queryAmbientV2ModelSchema(options: {
  accountId: string;
  token: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<AmbientV2ModelSchemaAudit> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/models/schema`);
  url.searchParams.set("model", options.model ?? PRODUCTION_AI_MODEL);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.token}`,
      },
    });
  } catch {
    return {
      httpStatus: null,
      cloudflareSuccess: null,
      resultPresent: false,
      inputKeys: [],
      outputKeys: [],
      requiredInputKeys: [],
      responseFormatKeys: [],
      messagesInputSupported: "UNKNOWN",
      structuredResponseShape: "UNKNOWN",
      inputResponseFormatPresent: "UNKNOWN",
      inputResponseFormatType: "UNKNOWN",
      explicitJsonSchemaSupport: "INCONCLUSIVE",
      errorClass: "NETWORK_FAILURE",
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      httpStatus: response.status,
      cloudflareSuccess: false,
      resultPresent: false,
      inputKeys: [],
      outputKeys: [],
      requiredInputKeys: [],
      responseFormatKeys: [],
      messagesInputSupported: "UNKNOWN",
      structuredResponseShape: "UNKNOWN",
      inputResponseFormatPresent: "UNKNOWN",
      inputResponseFormatType: "UNKNOWN",
      explicitJsonSchemaSupport: "INCONCLUSIVE",
      errorClass: "NON_JSON_RESPONSE",
    };
  }

  const envelope = isRecord(payload) ? payload : {};
  const result = isRecord(envelope.result) ? envelope.result : null;
  const input = result && isRecord(result.input) ? result.input : null;
  const output = result && isRecord(result.output) ? result.output : null;
  const responseFormat = findSchemaProperty(input, "response_format");
  const responseFormatPresent: AmbientV2ModelSchemaAudit["inputResponseFormatPresent"] = responseFormat === undefined
    ? input && Object.prototype.hasOwnProperty.call(input, "properties") ? "NO" : "UNKNOWN"
    : "YES";
  return {
    httpStatus: response.status,
    cloudflareSuccess: envelope.success === true,
    resultPresent: result !== null,
    inputKeys: safeKeys(input),
    outputKeys: safeKeys(output),
    requiredInputKeys: safeRequiredKeys(input),
    responseFormatKeys: safePropertyKeys(responseFormat),
    messagesInputSupported: messagesInputStatus(input),
    structuredResponseShape: structuredOutputShape(output),
    inputResponseFormatPresent: responseFormatPresent,
    inputResponseFormatType: safeType(responseFormat),
    explicitJsonSchemaSupport: responseFormatPresent === "YES"
      ? explicitJsonSchemaSupport(responseFormat)
      : "INCONCLUSIVE",
    errorClass: response.ok && envelope.success === true && result !== null ? null : boundedErrorClass(response.status),
  };
}
