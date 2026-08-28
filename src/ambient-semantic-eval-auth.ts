import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Dedicated developer-only Keychain item for the non-Production REST harness.
 * This is intentionally separate from Wrangler's OAuth storage: losing or
 * refreshing Wrangler OAuth must not block a developer inference gate.
 */
export const AMBIENT_SEMANTIC_EVAL_KEYCHAIN_SERVICE = "chicken-line-production-workers-ai";
export const AMBIENT_SEMANTIC_EVAL_KEYCHAIN_ACCOUNT = "default";
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

export type AmbientSemanticEvalAuthSource =
  | "ENVIRONMENT"
  | "KEYCHAIN_API_TOKEN_MEMORY"
  | "WRANGLER_KEYRING_MEMORY";

export type AmbientSemanticEvalKeychainState =
  | "AVAILABLE"
  | "MISSING"
  | "INACCESSIBLE"
  | "INVALID_VALUE"
  | "NOT_CHECKED";

export type AmbientSemanticEvalAuthFailure =
  | "KEYCHAIN_ITEM_NOT_FOUND"
  | "KEYCHAIN_ACCESS_FAILURE"
  | "KEYCHAIN_VALUE_INVALID"
  | "WRANGLER_AUTH_UNAVAILABLE"
  | "NO_AUTH_SOURCE_AVAILABLE";

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
  keychainState: AmbientSemanticEvalKeychainState;
  failure: AmbientSemanticEvalAuthFailure | null;
}

interface AmbientSemanticEvalExecOptions {
  cwd: string;
  encoding: "utf8";
  stdio: ["ignore", "pipe", "ignore"];
  maxBuffer: number;
}

type AmbientSemanticEvalExecFileSync = (
  file: string,
  args: string[],
  options: AmbientSemanticEvalExecOptions,
) => string | Buffer;

const defaultExecFileSync: AmbientSemanticEvalExecFileSync = (file, args, options) =>
  execFileSync(file, args, options);

function safeExitStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

function singleLineSecret(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || /\s/u.test(candidate)) return null;
  return candidate;
}

function tokenFromJsonOutput(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const token = (parsed as { token?: unknown }).token;
    return typeof token === "string" ? singleLineSecret(token) : null;
  } catch {
    return null;
  }
}

function keychainToken(
  projectRoot: string,
  execFileSyncImpl: AmbientSemanticEvalExecFileSync,
): { token: string | null; state: AmbientSemanticEvalKeychainState } {
  try {
    const output = execFileSyncImpl(
      "security",
      [
        "find-generic-password",
        "-s",
        AMBIENT_SEMANTIC_EVAL_KEYCHAIN_SERVICE,
        "-a",
        AMBIENT_SEMANTIC_EVAL_KEYCHAIN_ACCOUNT,
        "-w",
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024,
      },
    );
    const token = singleLineSecret(String(output));
    return token
      ? { token, state: "AVAILABLE" }
      : { token: null, state: "INVALID_VALUE" };
  } catch (error) {
    // `security` commonly returns status 44 for errSecItemNotFound. Do not
    // expose the underlying error or any command output.
    return safeExitStatus(error) === 44
      ? { token: null, state: "MISSING" }
      : { token: null, state: "INACCESSIBLE" };
  }
}

/**
 * Discover developer-only REST auth without exposing a credential. The
 * dedicated Keychain API token is preferred after an explicitly supplied
 * environment token; Wrangler OAuth is retained only as a compatibility
 * fallback and is also captured in memory.
 */
export function discoverAmbientSemanticEvalAuthStatus(options: {
  env?: Record<string, string | undefined>;
  projectRoot?: string;
  execFileSyncImpl?: AmbientSemanticEvalExecFileSync;
  allowWranglerFallback?: boolean;
} = {}): AmbientSemanticEvalAuthDiscovery {
  const env = options.env ?? process.env;
  const envToken = typeof env.CLOUDFLARE_API_TOKEN === "string"
    ? singleLineSecret(env.CLOUDFLARE_API_TOKEN)
    : null;
  if (envToken) {
    return {
      auth: { token: envToken, source: "ENVIRONMENT" },
      source: "ENVIRONMENT",
      keychainState: "NOT_CHECKED",
      failure: null,
    };
  }

  const projectRoot = options.projectRoot ?? resolve(import.meta.dirname, "..");
  const execFileSyncImpl = options.execFileSyncImpl ?? defaultExecFileSync;
  const keychain = keychainToken(projectRoot, execFileSyncImpl);
  if (keychain.token) {
    return {
      auth: { token: keychain.token, source: "KEYCHAIN_API_TOKEN_MEMORY" },
      source: "KEYCHAIN_API_TOKEN_MEMORY",
      keychainState: keychain.state,
      failure: null,
    };
  }

  if (options.allowWranglerFallback !== false) {
    try {
      const output = execFileSyncImpl(
        resolve(projectRoot, "node_modules/.bin/wrangler"),
        ["auth", "token", "--json"],
        {
          cwd: projectRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          maxBuffer: 16 * 1024,
        },
      );
      const token = tokenFromJsonOutput(String(output));
      if (token) {
        return {
          auth: { token, source: "WRANGLER_KEYRING_MEMORY" },
          source: "WRANGLER_KEYRING_MEMORY",
          keychainState: keychain.state,
          failure: null,
        };
      }
    } catch {
      // Return a bounded classification below; never surface CLI output.
    }
  }

  const failure = keychain.state === "MISSING"
    ? "KEYCHAIN_ITEM_NOT_FOUND"
    : keychain.state === "INACCESSIBLE"
      ? "KEYCHAIN_ACCESS_FAILURE"
      : keychain.state === "INVALID_VALUE"
        ? "KEYCHAIN_VALUE_INVALID"
        : "WRANGLER_AUTH_UNAVAILABLE";
  return {
    auth: null,
    source: "NONE",
    keychainState: keychain.state,
    failure,
  };
}

/**
 * Developer-only auth bridge. A Wrangler token is captured in this process's
 * memory and never placed in stdout, a ledger, a report, or a child env.
 */
export function discoverAmbientSemanticEvalAuth(options: {
  env?: Record<string, string | undefined>;
  projectRoot?: string;
  execFileSyncImpl?: AmbientSemanticEvalExecFileSync;
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
