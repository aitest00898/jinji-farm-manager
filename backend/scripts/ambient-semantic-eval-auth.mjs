import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Developer-only local auth bridge. The secret is read once into process
// memory and never logged, serialized, or passed through a child environment.
export const AMBIENT_SEMANTIC_EVAL_SECRET_FILE = ".dev.secrets.local";
export const AMBIENT_SEMANTIC_EVAL_SECRET_KEY = "CLOUDFLARE_API_TOKEN";
export const AMBIENT_SEMANTIC_EVAL_ACCOUNT_CONFIG_PATH = "config/ambient-semantic-eval-account.json";
export const AMBIENT_SEMANTIC_EVAL_SECRET_ENV_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
  "CLOUDFLARE_AUTH_TOKEN",
  "AMBIENT_V2_REAL_REST_TOKEN",
  "AMBIENT_V2_D03_DIAGNOSTIC_REST_TOKEN",
  "AMBIENT_V2_D04_DIAGNOSTIC_REST_TOKEN",
  "AMBIENT_SEMANTIC_EVAL_REST_TOKEN",
  "AMBIENT_SEMANTIC_EVAL_REAL_TOKEN",
];

function errorCode(error) {
  return typeof error?.code === "string" ? error.code : null;
}

function parseDeveloperSecretFile(contents) {
  let token = null;
  let tokenSeen = false;
  const lines = contents.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const sourceLine = lines[index];
    const line = sourceLine.endsWith("\r") ? sourceLine.slice(0, -1) : sourceLine;
    const trimmedStart = line.trimStart();
    if (line.trim() === "" || trimmedStart.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) {
      return { token: null, state: "INVALID_VALUE", failure: `DEV_SECRET_INVALID_LINE_${lineNumber}` };
    }
    const key = line.slice(0, separator);
    if (key !== AMBIENT_SEMANTIC_EVAL_SECRET_KEY) {
      return { token: null, state: "INVALID_VALUE", failure: `DEV_SECRET_UNSUPPORTED_KEY_${lineNumber}` };
    }
    if (tokenSeen) {
      return {
        token: null,
        state: "INVALID_VALUE",
        failure: "DEV_SECRET_DUPLICATE_KEY_CLOUDFLARE_API_TOKEN",
      };
    }

    tokenSeen = true;
    const value = line.slice(separator + 1);
    if (value.length === 0) {
      return {
        token: null,
        state: "INVALID_VALUE",
        failure: "DEV_SECRET_EMPTY_CLOUDFLARE_API_TOKEN",
      };
    }
    if (/\s/u.test(value)) {
      return {
        token: null,
        state: "INVALID_VALUE",
        failure: "DEV_SECRET_VALUE_WHITESPACE_CLOUDFLARE_API_TOKEN",
      };
    }
    token = value;
  }

  if (!tokenSeen || token === null) {
    return {
      token: null,
      state: "INVALID_VALUE",
      failure: "DEV_SECRET_MISSING_CLOUDFLARE_API_TOKEN",
    };
  }
  return { token, state: "AVAILABLE", failure: null };
}

function loadDeveloperSecretFile(secretFilePath) {
  let fileStats;
  try {
    fileStats = statSync(secretFilePath);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { token: null, state: "MISSING", failure: "DEV_SECRET_FILE_NOT_FOUND" }
      : { token: null, state: "INACCESSIBLE", failure: "DEV_SECRET_FILE_ACCESS_FAILURE" };
  }
  if (!fileStats.isFile()) {
    return { token: null, state: "INACCESSIBLE", failure: "DEV_SECRET_FILE_NOT_REGULAR" };
  }
  if ((fileStats.mode & 0o077) !== 0) {
    return { token: null, state: "UNSAFE_MODE", failure: "DEV_SECRET_FILE_UNSAFE_MODE" };
  }
  try {
    return parseDeveloperSecretFile(readFileSync(secretFilePath, "utf8"));
  } catch {
    return { token: null, state: "INACCESSIBLE", failure: "DEV_SECRET_FILE_ACCESS_FAILURE" };
  }
}

export function discoverAmbientSemanticEvalAuth({
  projectRoot = process.cwd(),
  secretFilePath = resolve(projectRoot, AMBIENT_SEMANTIC_EVAL_SECRET_FILE),
} = {}) {
  const secret = loadDeveloperSecretFile(secretFilePath);
  if (secret.token) {
    return {
      auth: { token: secret.token, source: "DEV_SECRETS_LOCAL" },
      source: "DEV_SECRETS_LOCAL",
      secretFileState: secret.state,
      failure: null,
    };
  }
  return {
    auth: null,
    source: "NONE",
    secretFileState: secret.state,
    failure: secret.failure || "NO_AUTH_SOURCE_AVAILABLE",
  };
}

function validAccountId(value) {
  return typeof value === "string" && /^[a-f0-9]{32}$/iu.test(value)
    ? value.toLowerCase()
    : null;
}

function accountIdFromEnvironment(env) {
  return validAccountId(env.CLOUDFLARE_ACCOUNT_ID)
    ?? validAccountId(env.CF_ACCOUNT_ID);
}

function accountIdFromDeveloperConfig(projectRoot) {
  try {
    const parsed = JSON.parse(readFileSync(
      resolve(projectRoot, AMBIENT_SEMANTIC_EVAL_ACCOUNT_CONFIG_PATH),
      "utf8",
    ));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, present: true, invalid: true };
    }
    const value = validAccountId(parsed.accountId);
    return value
      ? { value, present: true, invalid: false }
      : { value: null, present: true, invalid: true };
  } catch (error) {
    return error?.code === "ENOENT"
      ? { value: null, present: false, invalid: false }
      : { value: null, present: true, invalid: true };
  }
}

/**
 * Resolve an account without depending on Wrangler OAuth. If no explicit
 * account id is configured, the authenticated API token is used in memory for
 * a bounded `/accounts` lookup. Multiple accounts fail closed rather than
 * selecting one arbitrarily.
 */
export async function discoverAmbientSemanticEvalAccountId({
  env = process.env,
  projectRoot = process.cwd(),
  auth,
  fetchImpl = fetch,
  timeoutMs = 10_000,
} = {}) {
  const configured = accountIdFromEnvironment(env);
  if (configured) return { value: configured, source: "ENVIRONMENT", failure: null };
  const developerConfig = accountIdFromDeveloperConfig(projectRoot);
  if (developerConfig.value) {
    return { value: developerConfig.value, source: "DEVELOPER_CONFIG", failure: null };
  }
  if (developerConfig.invalid) {
    return { value: null, source: "DEVELOPER_CONFIG", failure: "INVALID_ACCOUNT_ID_CONFIG" };
  }
  if (!auth?.token) return { value: null, source: "AUTH_UNAVAILABLE", failure: "AUTH_UNAVAILABLE" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("https://api.cloudflare.com/client/v4/accounts?per_page=100", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${auth.token}`,
      },
      signal: controller.signal,
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      return { value: null, source: "CLOUDFLARE_ACCOUNTS_API", failure: "INVALID_RESPONSE" };
    }
    if (!response.ok || envelope?.success !== true || !Array.isArray(envelope?.result)) {
      return { value: null, source: "CLOUDFLARE_ACCOUNTS_API", failure: "ACCOUNT_LOOKUP_FAILED" };
    }
    const ids = [...new Set(envelope.result
      .map((entry) => validAccountId(entry?.id))
      .filter(Boolean))];
    if (ids.length === 1) return { value: ids[0], source: "CLOUDFLARE_ACCOUNTS_API", failure: null };
    return {
      value: null,
      source: "CLOUDFLARE_ACCOUNTS_API",
      failure: ids.length === 0 ? "ACCOUNT_NOT_FOUND" : "MULTIPLE_ACCOUNTS",
    };
  } catch {
    return { value: null, source: "CLOUDFLARE_ACCOUNTS_API", failure: "ACCOUNT_LOOKUP_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSafeAmbientChildEnvironment(extra = {}, env = process.env) {
  const childEnv = { ...env, ...extra };
  for (const key of AMBIENT_SEMANTIC_EVAL_SECRET_ENV_KEYS) delete childEnv[key];
  return childEnv;
}
