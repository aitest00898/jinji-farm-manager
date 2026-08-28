import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_SEMANTIC_EVAL_KEYCHAIN_ACCOUNT,
  AMBIENT_SEMANTIC_EVAL_KEYCHAIN_SERVICE,
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
  discoverAmbientSemanticEvalAuthStatus,
  stripAmbientSemanticEvalCredentialEnv,
} from "./ambient-semantic-eval-auth";

describe("Ambient semantic eval auth bridge", () => {
  it("prefers an explicitly supplied token without spawning a credential command", () => {
    let spawned = false;
    const auth = discoverAmbientSemanticEvalAuth({
      env: { CLOUDFLARE_API_TOKEN: "fixture-token-not-a-secret" },
      execFileSyncImpl: () => {
        spawned = true;
        return "unexpected";
      },
    });

    expect(auth).toEqual({ token: "fixture-token-not-a-secret", source: "ENVIRONMENT" });
    expect(spawned).toBe(false);
  });

  it("prefers the dedicated Keychain API token and keeps it in memory", () => {
    const calls: Array<{ file: string; args: string[]; options: unknown }> = [];
    const auth = discoverAmbientSemanticEvalAuth({
      env: {},
      projectRoot: "/fixture/project",
      execFileSyncImpl: (file, args, options) => {
        calls.push({ file, args, options });
        return "fixture-keychain-api-token";
      },
    });

    expect(auth).toEqual({ token: "fixture-keychain-api-token", source: "KEYCHAIN_API_TOKEN_MEMORY" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      file: "security",
      args: [
        "find-generic-password",
        "-s",
        AMBIENT_SEMANTIC_EVAL_KEYCHAIN_SERVICE,
        "-a",
        AMBIENT_SEMANTIC_EVAL_KEYCHAIN_ACCOUNT,
        "-w",
      ],
      options: {
        cwd: "/fixture/project",
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024,
      },
    });
  });

  it("falls back to a captured Wrangler JSON credential only when the dedicated item is missing", () => {
    const calls: Array<{ file: string; args: string[]; options: unknown }> = [];
    const auth = discoverAmbientSemanticEvalAuth({
      env: {},
      projectRoot: "/fixture/project",
      execFileSyncImpl: (file, args, options) => {
        calls.push({ file, args, options });
        if (file === "security") throw Object.assign(new Error("missing"), { status: 44 });
        return JSON.stringify({ type: "oauth", token: "fixture-keyring-token" });
      },
    });

    expect(auth).toEqual({ token: "fixture-keyring-token", source: "WRANGLER_KEYRING_MEMORY" });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      file: "/fixture/project/node_modules/.bin/wrangler",
        args: ["auth", "token", "--json"],
      options: {
        cwd: "/fixture/project",
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024,
      },
    });
  });

  it("can fail closed without invoking Wrangler when a gate requires dedicated Keychain auth", () => {
    const calls: string[] = [];
    const status = discoverAmbientSemanticEvalAuthStatus({
      env: {},
      projectRoot: "/fixture/project",
      allowWranglerFallback: false,
      execFileSyncImpl: (file, args) => {
        calls.push(`${file}:${args.join(" ")}`);
        if (file === "security") throw Object.assign(new Error("missing"), { status: 44 });
        throw new Error("wrangler must not run");
      },
    });

    expect(status.auth).toBeNull();
    expect(status.failure).toBe("KEYCHAIN_ITEM_NOT_FOUND");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("security:find-generic-password");
  });

  it("returns bounded auth status without exposing the credential or raw command errors", () => {
    const status = discoverAmbientSemanticEvalAuthStatus({
      env: {},
      projectRoot: "/fixture/project",
      execFileSyncImpl: (file) => {
        if (file === "security") throw Object.assign(new Error("missing"), { status: 44 });
        throw new Error("not logged in");
      },
    });

    expect(status.auth).toBeNull();
    expect(status.source).toBe("NONE");
    expect(status.keychainState).toBe("MISSING");
    expect(status.failure).toBe("KEYCHAIN_ITEM_NOT_FOUND");
    expect(JSON.stringify(status)).not.toContain("not logged in");
  });

  it("fails closed when the credential command emits invalid JSON", () => {
    const auth = discoverAmbientSemanticEvalAuth({
      env: {},
      execFileSyncImpl: () => "diagnostic\nfixture-token-not-a-secret\n",
    });
    expect(auth).toBeNull();
  });

  it("removes credential-bearing variables from a child environment copy", () => {
    const source = {
      PATH: "/usr/bin",
      CLOUDFLARE_API_TOKEN: "fixture-token-not-a-secret",
      AMBIENT_V2_REAL_REST_TOKEN: "fixture-token-not-a-secret",
      AMBIENT_V2_D03_DIAGNOSTIC_REST_TOKEN: "fixture-token-not-a-secret",
      AMBIENT_V2_D04_DIAGNOSTIC_REST_TOKEN: "fixture-token-not-a-secret",
    };
    const safe = stripAmbientSemanticEvalCredentialEnv(source);

    expect(safe).toEqual({ PATH: "/usr/bin" });
    expect(source.CLOUDFLARE_API_TOKEN).toBe("fixture-token-not-a-secret");
  });

  it("uses the developer-only account config before account enumeration", async () => {
    let fetchCalls = 0;
    const result = await discoverAmbientSemanticEvalAccountId({
      env: {},
      projectRoot: resolve(import.meta.dirname, ".."),
      auth: { token: "fixture-token-not-a-secret", source: "KEYCHAIN_API_TOKEN_MEMORY" },
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("account enumeration should not run when configured");
      },
    });

    expect(result).toEqual({
      value: "56ee3f27c78480bbd3066f2501ddb6ab",
      source: "DEVELOPER_CONFIG",
      failure: null,
    });
    expect(fetchCalls).toBe(0);
  });

  it("keeps the real-smoke wrapper from passing a credential through env", () => {
    const wrapper = readFileSync(
      resolve(import.meta.dirname, "../scripts/ambient-extraction-v2-real-smoke.mjs"),
      "utf8",
    );
    expect(wrapper).toContain("buildSafeAmbientChildEnvironment");
    expect(readFileSync(
      resolve(import.meta.dirname, "../scripts/ambient-semantic-eval-auth.mjs"),
      "utf8",
    )).toContain("delete childEnv[key]");
    expect(wrapper).not.toContain("AMBIENT_V2_REAL_REST_TOKEN: auth");
    expect(wrapper).not.toContain("AMBIENT_V2_D03_DIAGNOSTIC_REST_TOKEN: auth");
    expect(readFileSync(
      resolve(import.meta.dirname, "../scripts/ambient-semantic-eval.mjs"),
      "utf8",
    )).not.toContain("AMBIENT_SEMANTIC_EVAL_REST_TOKEN: auth");
    expect(readFileSync(
      resolve(import.meta.dirname, "../scripts/ambient-semantic-eval-schema-micro.mjs"),
      "utf8",
    )).not.toContain("AMBIENT_SEMANTIC_EVAL_REST_TOKEN: auth");
    const sharedAuth = readFileSync(
      resolve(import.meta.dirname, "../scripts/ambient-semantic-eval-auth.mjs"),
      "utf8",
    );
    expect(sharedAuth).toContain("find-generic-password");
    expect(sharedAuth).toContain("KEYCHAIN_API_TOKEN_MEMORY");
    expect(sharedAuth).toContain("accounts?per_page=100");
    expect(sharedAuth).toContain("delete childEnv[key]");
  });
});
