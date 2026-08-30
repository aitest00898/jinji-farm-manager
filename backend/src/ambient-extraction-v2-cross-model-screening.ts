import {
  queryAmbientV2ModelSchema,
  type AmbientV2ModelSchemaAudit,
} from "./ambient-extraction-v2-structured-output";

export const AMBIENT_V2_CROSS_MODEL_CANDIDATES = [
  {
    key: "QWEN_3_8",
    modelId: "@cf/qwen/qwen3.8-27b",
    officialFreePlanEvidence: "NOT_EXPLICIT",
  },
  {
    key: "GLM_4_7",
    modelId: "@cf/zai-org/glm-4.7-flash",
    officialFreePlanEvidence: "EXPLICIT_YES",
  },
  {
    key: "QWEN3_30B_A3B",
    modelId: "@cf/qwen/qwen3-30b-a3b-fp8",
    officialFreePlanEvidence: "NOT_EXPLICIT",
  },
] as const;

/**
 * Current screening policy. The catalog/schema audit from the preceding
 * screening is reused; the current Cloudflare documentation is sufficient to
 * authorize one controlled attempt per requested candidate. This is a
 * developer-only policy and never changes the pinned Production model.
 */
export const AMBIENT_V2_CROSS_MODEL_PREINFERENCE_POLICY = {
  officialFreePlanEvidenceSufficient: true,
  accountSpecificEntitlementRequired: false,
  requestCompatibilityPrecondition: "SUFFICIENT_FOR_ONE_CONTROLLED_ATTEMPT",
  catalogAndSchemaAuditReused: true,
} as const;

export type AmbientV2TriState = "YES" | "NO" | "UNKNOWN";
export type AmbientV2FreeEvidence = "EXPLICIT_YES" | "EXPLICIT_NO" | "NOT_EXPLICIT";
export type AmbientV2FreeEligibility = "YES" | "NO" | "INCONCLUSIVE";

export interface AmbientV2ReusedCandidatePreflight {
  catalogModelExists: "YES";
  catalogCanonicalModelId: string;
  modelIdExactMatch: "YES";
  modelSchemaQuery: "PASS";
  modelSchemaHttp: 200;
  responseFormatPresent: "YES";
  jsonSchemaSupported: "YES";
  requestShapeCompatibleWithV21: "YES";
  modelSpecificRequestDifference: "NO";
  requiredDifferenceClass: "NONE";
}

export interface AmbientV2ModelCatalogAudit {
  requestModelId: string;
  httpStatus: number | null;
  cloudflareSuccess: boolean | null;
  resultItemCount: number | null;
  catalogModelExists: AmbientV2TriState;
  catalogCanonicalModelId: string | null;
  modelIdExactMatch: AmbientV2TriState;
  errorClass: string | null;
}

export interface AmbientV2AccountDiscoveryAudit {
  accountId: string | null;
  httpStatus: number | null;
  cloudflareSuccess: boolean | null;
  accountCount: number | null;
  errorClass: string | null;
}

export interface AmbientV2AccountEntitlementAudit {
  httpStatus: number | null;
  cloudflareSuccess: boolean | null;
  accountFreeEntitlement: AmbientV2FreeEligibility;
  accountPlanEvidence: "FREE" | "PAID" | "UNKNOWN";
  errorClass: string | null;
}

export interface AmbientV2RequestCompatibilityAudit {
  structuredOutputSupported: "YES" | "NO" | "INCONCLUSIVE";
  requestShapeCompatibleWithV21: "YES" | "NO" | "INCONCLUSIVE";
  modelSpecificRequestDifference: "YES" | "NO" | "UNKNOWN";
  requiredDifferenceClass: "NONE" | "INPUT_FORMAT" | "RESPONSE_FORMAT_SHAPE" | "MANDATORY_PARAMETER" | "OUTPUT_ENVELOPE" | "OTHER";
}

/**
 * Return only the bounded preflight facts already established for this exact
 * candidate set. No catalog/model-schema request is made here.
 */
export function reusedAmbientV2CandidatePreflight(
  candidate: (typeof AMBIENT_V2_CROSS_MODEL_CANDIDATES)[number],
): AmbientV2ReusedCandidatePreflight {
  return {
    catalogModelExists: "YES",
    catalogCanonicalModelId: candidate.modelId,
    modelIdExactMatch: "YES",
    modelSchemaQuery: "PASS",
    modelSchemaHttp: 200,
    responseFormatPresent: "YES",
    jsonSchemaSupported: "YES",
    requestShapeCompatibleWithV21: "YES",
    modelSpecificRequestDifference: "NO",
    requiredDifferenceClass: "NONE",
  };
}

/**
 * Under the current documented policy, absence from the paid-only list is
 * enough for one controlled attempt. Provider enforcement remains final.
 */
export function freePlanEligibilityForCurrentScreeningPolicy(
  officialEvidence: AmbientV2FreeEvidence,
): AmbientV2FreeEligibility {
  return officialEvidence === "EXPLICIT_NO" ? "NO" : "YES";
}

const SAFE_MODEL_ID = /^@cf\/[A-Za-z0-9_./:@-]{1,119}$/u;
const SAFE_ACCOUNT_ID = /^[a-f0-9]{32}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeModelId(value: unknown): string | null {
  return typeof value === "string" && SAFE_MODEL_ID.test(value) ? value : null;
}

function boundedErrorClass(status: number): string {
  if (status === 401 || status === 403) return "AUTH_FAILURE";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "CLOUDFLARE_API_ERROR";
  if (status >= 400) return "INVALID_REQUEST";
  return "UNKNOWN";
}

function responseResult(payload: unknown): unknown {
  return isRecord(payload) ? payload.result : undefined;
}

function candidateIds(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const ids: string[] = [];
  for (const key of ["id", "name", "model", "model_id", "slug", "canonical_model_id"]) {
    const modelId = safeModelId(value[key]);
    if (modelId) ids.push(modelId);
  }
  return [...new Set(ids)];
}

/**
 * Read the account-scoped Workers AI catalog without returning arbitrary
 * catalog payloads. Only safe model IDs and bounded status are retained.
 */
export async function queryAmbientV2ModelCatalog(options: {
  accountId: string;
  token: string;
  model: string;
  fetchImpl?: typeof fetch;
}): Promise<AmbientV2ModelCatalogAudit> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/models/search`);
  url.searchParams.set("search", options.model);
  url.searchParams.set("per_page", "100");
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${options.token}` },
    });
  } catch {
    return {
      requestModelId: options.model,
      httpStatus: null,
      cloudflareSuccess: null,
      resultItemCount: null,
      catalogModelExists: "UNKNOWN",
      catalogCanonicalModelId: null,
      modelIdExactMatch: "UNKNOWN",
      errorClass: "NETWORK_FAILURE",
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      requestModelId: options.model,
      httpStatus: response.status,
      cloudflareSuccess: false,
      resultItemCount: null,
      catalogModelExists: "UNKNOWN",
      catalogCanonicalModelId: null,
      modelIdExactMatch: "UNKNOWN",
      errorClass: "NON_JSON_RESPONSE",
    };
  }

  const envelope = isRecord(payload) ? payload : {};
  const result = responseResult(payload);
  const items = Array.isArray(result) ? result : null;
  const ids = items ? [...new Set(items.flatMap(candidateIds))] : [];
  const exact = ids.find((id) => id === options.model) ?? null;
  return {
    requestModelId: options.model,
    httpStatus: response.status,
    cloudflareSuccess: envelope.success === true,
    resultItemCount: items?.length ?? null,
    catalogModelExists: response.ok && envelope.success === true && items
      ? exact ? "YES" : "NO"
      : "UNKNOWN",
    catalogCanonicalModelId: exact ?? (ids.length === 1 ? ids[0]! : null),
    modelIdExactMatch: response.ok && envelope.success === true && items
      ? exact ? "YES" : "NO"
      : "UNKNOWN",
    errorClass: response.ok && envelope.success === true && items ? null : boundedErrorClass(response.status),
  };
}

/** Resolve the account ID with a safe API response projection. */
export async function discoverAmbientV2AccountId(options: {
  token: string;
  configuredAccountId?: string;
  fetchImpl?: typeof fetch;
}): Promise<AmbientV2AccountDiscoveryAudit> {
  const configured = options.configuredAccountId?.trim().toLowerCase();
  if (configured && SAFE_ACCOUNT_ID.test(configured)) {
    return { accountId: configured, httpStatus: null, cloudflareSuccess: true, accountCount: 1, errorClass: null };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL("https://api.cloudflare.com/client/v4/accounts");
  url.searchParams.set("per_page", "100");
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${options.token}` },
    });
  } catch {
    return { accountId: null, httpStatus: null, cloudflareSuccess: null, accountCount: null, errorClass: "NETWORK_FAILURE" };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { accountId: null, httpStatus: response.status, cloudflareSuccess: false, accountCount: null, errorClass: "NON_JSON_RESPONSE" };
  }
  const envelope = isRecord(payload) ? payload : {};
  const result = Array.isArray(envelope.result) ? envelope.result : null;
  const ids = result
    ? result.map((item) => isRecord(item) && typeof item.id === "string" && SAFE_ACCOUNT_ID.test(item.id) ? item.id.toLowerCase() : null).filter((id): id is string => id !== null)
    : [];
  const uniqueIds = [...new Set(ids)];
  return {
    accountId: response.ok && envelope.success === true && uniqueIds.length === 1 ? uniqueIds[0]! : null,
    httpStatus: response.status,
    cloudflareSuccess: envelope.success === true,
    accountCount: result ? uniqueIds.length : null,
    errorClass: response.ok && envelope.success === true && result ? null : boundedErrorClass(response.status),
  };
}

function pathValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function accountPlanMarkers(result: unknown): string[] {
  const items = Array.isArray(result) ? result : [result];
  const paths = [
    ["rate_plan", "id"],
    ["rate_plan", "name"],
    ["rate_plan", "public_name"],
    ["plan", "id"],
    ["plan", "name"],
    ["plan", "public_name"],
    ["plan_id"],
    ["plan_name"],
    ["public_name"],
  ];
  return items.flatMap((item) => paths
    .map((path) => pathValue(item, path))
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase()));
}

/** Read only bounded free/paid plan evidence; never returns plan text. */
export async function queryAmbientV2AccountEntitlement(options: {
  accountId: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<AmbientV2AccountEntitlementAudit> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${options.accountId}/subscriptions`);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${options.token}` },
    });
  } catch {
    return { httpStatus: null, cloudflareSuccess: null, accountFreeEntitlement: "INCONCLUSIVE", accountPlanEvidence: "UNKNOWN", errorClass: "NETWORK_FAILURE" };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { httpStatus: response.status, cloudflareSuccess: false, accountFreeEntitlement: "INCONCLUSIVE", accountPlanEvidence: "UNKNOWN", errorClass: "NON_JSON_RESPONSE" };
  }
  const envelope = isRecord(payload) ? payload : {};
  const result = responseResult(payload);
  const markers = accountPlanMarkers(result);
  const isFree = markers.some((marker) => /(?:workers?[_ -]?free|free[_ -]?plan|^free$)/u.test(marker));
  const isPaid = markers.some((marker) => /(?:workers?[_ -]?paid|paid[_ -]?plan|^paid$|^pro$|business|enterprise)/u.test(marker));
  const evidence: AmbientV2AccountEntitlementAudit["accountPlanEvidence"] = isFree && !isPaid ? "FREE" : isPaid && !isFree ? "PAID" : "UNKNOWN";
  return {
    httpStatus: response.status,
    cloudflareSuccess: envelope.success === true,
    accountFreeEntitlement: evidence === "FREE" ? "YES" : evidence === "PAID" ? "NO" : "INCONCLUSIVE",
    accountPlanEvidence: evidence,
    errorClass: response.ok && envelope.success === true && result !== undefined ? null : boundedErrorClass(response.status),
  };
}

export function requestCompatibilityForV21(audit: AmbientV2ModelSchemaAudit): AmbientV2RequestCompatibilityAudit {
  if (audit.inputResponseFormatPresent === "NO" || audit.explicitJsonSchemaSupport === "NO") {
    return { structuredOutputSupported: "NO", requestShapeCompatibleWithV21: "NO", modelSpecificRequestDifference: "YES", requiredDifferenceClass: "RESPONSE_FORMAT_SHAPE" };
  }
  if (audit.inputResponseFormatPresent !== "YES" || audit.explicitJsonSchemaSupport !== "YES") {
    return { structuredOutputSupported: "INCONCLUSIVE", requestShapeCompatibleWithV21: "INCONCLUSIVE", modelSpecificRequestDifference: "UNKNOWN", requiredDifferenceClass: "OTHER" };
  }
  const formatKeys = new Set(audit.responseFormatKeys);
  const requiredInput = new Set(audit.requiredInputKeys);
  const messagesCompatible = audit.messagesInputSupported !== "NO";
  const responseFormatCompatible = audit.inputResponseFormatType === "OBJECT"
    && formatKeys.has("type")
    && formatKeys.has("json_schema");
  const mandatoryDifference = [...requiredInput].some((key) => !new Set(["messages", "max_tokens", "temperature", "response_format", "stream"]).has(key));
  if (!messagesCompatible) {
    return { structuredOutputSupported: "YES", requestShapeCompatibleWithV21: "NO", modelSpecificRequestDifference: "YES", requiredDifferenceClass: "INPUT_FORMAT" };
  }
  if (!responseFormatCompatible) {
    return { structuredOutputSupported: "YES", requestShapeCompatibleWithV21: "NO", modelSpecificRequestDifference: "YES", requiredDifferenceClass: "RESPONSE_FORMAT_SHAPE" };
  }
  if (mandatoryDifference) {
    return { structuredOutputSupported: "YES", requestShapeCompatibleWithV21: "NO", modelSpecificRequestDifference: "YES", requiredDifferenceClass: "MANDATORY_PARAMETER" };
  }
  return {
    structuredOutputSupported: "YES",
    requestShapeCompatibleWithV21: audit.messagesInputSupported === "YES" ? "YES" : "INCONCLUSIVE",
    modelSpecificRequestDifference: audit.messagesInputSupported === "YES" ? "NO" : "UNKNOWN",
    requiredDifferenceClass: "NONE",
  };
}

export function freePlanEligibilityForCandidate(
  officialEvidence: AmbientV2FreeEvidence,
  account: AmbientV2AccountEntitlementAudit,
): AmbientV2FreeEligibility {
  if (account.accountPlanEvidence === "PAID") return "NO";
  if (account.accountPlanEvidence !== "FREE") return "INCONCLUSIVE";
  return officialEvidence === "EXPLICIT_YES" ? "YES" : "INCONCLUSIVE";
}
