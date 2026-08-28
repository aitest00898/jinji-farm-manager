import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Developer-only local credential source; never used by the Production Worker. */
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
] as const;

export type AmbientSemanticEvalAuthSource = "DEV_SECRETS_LOCAL";

export type AmbientSemanticEvalSecretFileState =
  | "AVAILABLE"
  | "MISSING"
  | "INACCESSIBLE"
  | "INVALID_VALUE"
  | "UNSAFE_MODE";

export type AmbientSemanticEvalAuthFailure = string;

export interface AmbientSemanticEvalAuth {
  token: string;
  source: AmbientSemanticEvalAuthSource;
}

/**
 * Bounded status for developer diagnostics. `auth.token` is for immediate
 * in-memory use only and must never be serialized or logged.
 */
export interface AmbientSemanticEvalAuthDiscovery {
  auth: AmbientSemanticEvalAuth | null;
  source: AmbientSemanticEvalAuthSource | "NONE";
  secretFileState: AmbientSemanticEvalSecretFileState;
  failure: AmbientSemanticEvalAuthFailure | null;
}

interface LoadedDeveloperSecret {
  token: string | null;
  state: AmbientSemanticEvalSecretFileState;
  failure: AmbientSemanticEvalAuthFailure | null;
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

function parseDeveloperSecretFile(contents: string): LoadedDeveloperSecret {
  let token: string | null = null;
  let tokenSeen = false;
  const lines = contents.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index]!.endsWith("\r")
      ? lines[index]!.slice(0, -1)
      : lines[index]!;
    const trimmedStart = line.trimStart();
    if (line.trim() === "" || trimmedStart.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) {
      return {
        token: null,
        state: "INVALID_VALUE",
        failure: `DEV_SECRET_INVALID_LINE_${lineNumber}`,
      };
    }

    const key = line.slice(0, separator);
    if (key !== AMBIENT_SEMANTIC_EVAL_SECRET_KEY) {
      return {
        token: null,
        state: "INVALID_VALUE",
        failure: `DEV_SECRET_UNSUPPORTED_KEY_${lineNumber}`,
      };
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

function loadDeveloperSecretFile(secretFilePath: string): LoadedDeveloperSecret {
  let fileStats: ReturnType<typeof statSync>;
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

/** Discover developer-only REST auth from one local ignored file, in memory only. */
export function discoverAmbientSemanticEvalAuthStatus(options: {
  projectRoot?: string;
  secretFilePath?: string;
} = {}): AmbientSemanticEvalAuthDiscovery {
  const projectRoot = options.projectRoot ?? resolve(import.meta.dirname, "..");
  const secret = loadDeveloperSecretFile(
    options.secretFilePath ?? resolve(projectRoot, AMBIENT_SEMANTIC_EVAL_SECRET_FILE),
  );
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
    failure: secret.failure ?? "NO_AUTH_SOURCE_AVAILABLE",
  };
}

/** Developer-only auth bridge; the token remains in this process's memory. */
export function discoverAmbientSemanticEvalAuth(options: {
  projectRoot?: string;
  secretFilePath?: string;
} = {}): AmbientSemanticEvalAuth | null {
  return discoverAmbientSemanticEvalAuthStatus(options).auth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validAccountId(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{32}$/iu.test(value)
    ? value.toLowerCase()
    : null;
}

function accountIdFromEnvironment(env: Record<string, string | undefined>): string | null {
  return validAccountId(env.CLOUDFLARE_ACCOUNT_ID)
    ?? validAccountId(env.CF_ACCOUNT_ID);
}

function accountIdFromDeveloperConfig(projectRoot: string): {
  value: string | null;
  present: boolean;
  invalid: boolean;
} {
  try {
    const parsed: unknown = JSON.parse(readFileSync(
      resolve(projectRoot, AMBIENT_SEMANTIC_EVAL_ACCOUNT_CONFIG_PATH),
      "utf8",
    ));
    if (!isRecord(parsed)) return { value: null, present: true, invalid: true };
    const value = validAccountId(parsed.accountId);
    return value
      ? { value, present: true, invalid: false }
      : { value: null, present: true, invalid: true };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return code === "ENOENT"
      ? { value: null, present: false, invalid: false }
      : { value: null, present: true, invalid: true };
  }
}

export async function discoverAmbientSemanticEvalAccountId(options: {
  env?: Record<string, string | undefined>;
  projectRoot?: string;
  auth?: AmbientSemanticEvalAuth | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<{
  value: string | null;
  source: "ENVIRONMENT" | "DEVELOPER_CONFIG" | "CLOUDFLARE_ACCOUNTS_API" | "AUTH_UNAVAILABLE";
  failure: string | null;
}> {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? resolve(import.meta.dirname, "..");
  const configured = accountIdFromEnvironment(env);
  if (configured) return { value: configured, source: "ENVIRONMENT", failure: null };
  const developerConfig = accountIdFromDeveloperConfig(projectRoot);
  if (developerConfig.value) {
    return { value: developerConfig.value, source: "DEVELOPER_CONFIG", failure: null };
  }
  if (developerConfig.invalid) {
    return { value: null, source: "DEVELOPER_CONFIG", failure: "INVALID_ACCOUNT_ID_CONFIG" };
  }
  const auth = options.auth;
  if (!auth?.token) return { value: null, source: "AUTH_UNAVAILABLE", failure: "AUTH_UNAVAILABLE" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetchImpl ?? fetch)("https://api.cloudflare.com/client/v4/accounts?per_page=100", {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${auth.token}`,
      },
      signal: controller.signal,
    });
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      return { value: null, source: "CLOUDFLARE_ACCOUNTS_API", failure: "INVALID_RESPONSE" };
    }
    if (!response.ok || !isRecord(envelope) || envelope.success !== true || !Array.isArray(envelope.result)) {
      return { value: null, source: "CLOUDFLARE_ACCOUNTS_API", failure: "ACCOUNT_LOOKUP_FAILED" };
    }
    const ids = [...new Set(envelope.result
      .map((entry) => isRecord(entry) ? validAccountId(entry.id) : null)
      .filter((value): value is string => value !== null))];
    if (ids.length === 1) return { value: ids[0]!, source: "CLOUDFLARE_ACCOUNTS_API", failure: null };
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

/** Remove known credential-bearing variables before spawning developer tools. */
export function stripAmbientSemanticEvalCredentialEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const safeEnv = { ...env };
  for (const key of AMBIENT_SEMANTIC_EVAL_SECRET_ENV_KEYS) delete safeEnv[key];
  return safeEnv;
}
