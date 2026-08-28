import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Developer-only auth bridge. Secrets returned by this module are intended for
// immediate in-memory use only and must never be logged, serialized, or passed
// through a child environment.
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
];

const defaultExecFileSync = execFileSync;

function singleLineSecret(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate && !/\s/u.test(candidate) ? candidate : null;
}

function tokenFromJsonOutput(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return singleLineSecret(parsed.token);
  } catch {
    return null;
  }
}

function safeStatus(error) {
  return Number.isInteger(error?.status) ? error.status : null;
}

function keychainToken(projectRoot, execFileSyncImpl) {
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
    return safeStatus(error) === 44
      ? { token: null, state: "MISSING" }
      : { token: null, state: "INACCESSIBLE" };
  }
}

export function discoverAmbientSemanticEvalAuth({
  env = process.env,
  projectRoot = process.cwd(),
  execFileSyncImpl = defaultExecFileSync,
  allowWranglerFallback = true,
} = {}) {
  const envToken = singleLineSecret(env.CLOUDFLARE_API_TOKEN);
  if (envToken) {
    return {
      auth: { token: envToken, source: "ENVIRONMENT" },
      source: "ENVIRONMENT",
      keychainState: "NOT_CHECKED",
      failure: null,
    };
  }

  const keychain = keychainToken(projectRoot, execFileSyncImpl);
  if (keychain.token) {
    return {
      auth: { token: keychain.token, source: "KEYCHAIN_API_TOKEN_MEMORY" },
      source: "KEYCHAIN_API_TOKEN_MEMORY",
      keychainState: keychain.state,
      failure: null,
    };
  }

  if (allowWranglerFallback) {
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
      // Keep the failure bounded below; never surface CLI output.
    }
  }

  return {
    auth: null,
    source: "NONE",
    keychainState: keychain.state,
    failure: keychain.state === "MISSING"
      ? "KEYCHAIN_ITEM_NOT_FOUND"
      : keychain.state === "INACCESSIBLE"
        ? "KEYCHAIN_ACCESS_FAILURE"
        : keychain.state === "INVALID_VALUE"
          ? "KEYCHAIN_VALUE_INVALID"
          : "WRANGLER_AUTH_UNAVAILABLE",
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
