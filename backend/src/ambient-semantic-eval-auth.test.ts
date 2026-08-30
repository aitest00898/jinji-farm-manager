import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_SEMANTIC_EVAL_SECRET_FILE,
  AMBIENT_SEMANTIC_EVAL_SECRET_KEY,
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
  discoverAmbientSemanticEvalAuthStatus,
  stripAmbientSemanticEvalCredentialEnv,
} from "./ambient-semantic-eval-auth";

const fakeToken = "test-only-placeholder";

function temporarySecretFile(contents: string, mode = 0o600): {
  directory: string;
  path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "chicken-line-dev-secret-"));
  const path = join(directory, AMBIENT_SEMANTIC_EVAL_SECRET_FILE);
  writeFileSync(path, contents, "utf8");
  chmodSync(path, mode);
  return { directory, path };
}

function removeTemporarySecretFile(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

describe("Ambient semantic eval local secret loader", () => {
  it("loads a valid 0600 file into the current process only", () => {
    const fixture = temporarySecretFile(`${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=${fakeToken}\n`);
    try {
      expect(discoverAmbientSemanticEvalAuth({ projectRoot: fixture.directory })).toEqual({
        token: fakeToken,
        source: "DEV_SECRETS_LOCAL",
      });
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory })).toMatchObject({
        source: "DEV_SECRETS_LOCAL",
        secretFileState: "AVAILABLE",
        failure: null,
      });
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("allows blank lines, comments, CRLF, and equals signs after the first separator", () => {
    const fixture = temporarySecretFile(
      `\r\n# developer-only fixture\r\n${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=${fakeToken}=suffix\r\n`,
    );
    try {
      expect(discoverAmbientSemanticEvalAuth({ projectRoot: fixture.directory })).toEqual({
        token: `${fakeToken}=suffix`,
        source: "DEV_SECRETS_LOCAL",
      });
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("fails closed when the file is missing", () => {
    const directory = mkdtempSync(join(tmpdir(), "chicken-line-dev-secret-missing-"));
    try {
      expect(discoverAmbientSemanticEvalAuth({ projectRoot: directory })).toBeNull();
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: directory })).toMatchObject({
        source: "NONE",
        secretFileState: "MISSING",
        failure: "DEV_SECRET_FILE_NOT_FOUND",
      });
    } finally {
      removeTemporarySecretFile(directory);
    }
  });

  it("fails closed when the required key is missing", () => {
    const fixture = temporarySecretFile("# no credential here\n");
    try {
      const status = discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory });
      expect(status.auth).toBeNull();
      expect(status.failure).toBe("DEV_SECRET_MISSING_CLOUDFLARE_API_TOKEN");
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("fails closed for an empty token", () => {
    const fixture = temporarySecretFile(`${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=\n`);
    try {
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory }).failure)
        .toBe("DEV_SECRET_EMPTY_CLOUDFLARE_API_TOKEN");
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("fails closed for duplicate keys", () => {
    const fixture = temporarySecretFile(
      `${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=first\n${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=second\n`,
    );
    try {
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory }).failure)
        .toBe("DEV_SECRET_DUPLICATE_KEY_CLOUDFLARE_API_TOKEN");
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("fails closed for malformed and unsupported entries", () => {
    const malformed = temporarySecretFile("not-an-assignment\n");
    const unsupported = temporarySecretFile("OTHER_KEY=value\n");
    try {
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: malformed.directory }).failure)
        .toBe("DEV_SECRET_INVALID_LINE_1");
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: unsupported.directory }).failure)
        .toBe("DEV_SECRET_UNSUPPORTED_KEY_1");
    } finally {
      removeTemporarySecretFile(malformed.directory);
      removeTemporarySecretFile(unsupported.directory);
    }
  });

  it("rejects group or other permissions without changing the file", () => {
    const fixture = temporarySecretFile(`${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=${fakeToken}\n`, 0o644);
    try {
      expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory })).toMatchObject({
        auth: null,
        secretFileState: "UNSAFE_MODE",
        failure: "DEV_SECRET_FILE_UNSAFE_MODE",
      });
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("rejects leading or trailing whitespace without trimming the value", () => {
    for (const value of [` ${fakeToken}`, `${fakeToken} `]) {
      const fixture = temporarySecretFile(`${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=${value}\n`);
      try {
        expect(discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory }).failure)
          .toBe("DEV_SECRET_VALUE_WHITESPACE_CLOUDFLARE_API_TOKEN");
      } finally {
        removeTemporarySecretFile(fixture.directory);
      }
    }
  });

  it("does not use a process environment token", () => {
    const previous = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = fakeToken;
    const directory = mkdtempSync(join(tmpdir(), "chicken-line-dev-secret-env-"));
    try {
      expect(discoverAmbientSemanticEvalAuth({ projectRoot: directory })).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = previous;
      removeTemporarySecretFile(directory);
    }
  });

  it("keeps fake secret and malformed lines out of bounded errors and diagnostics", () => {
    const fixture = temporarySecretFile(
      `${AMBIENT_SEMANTIC_EVAL_SECRET_KEY}=${fakeToken}\nmalformed ${fakeToken}\n`,
    );
    try {
      const status = discoverAmbientSemanticEvalAuthStatus({ projectRoot: fixture.directory });
      const serialized = JSON.stringify(status);
      expect(status.failure).toBe("DEV_SECRET_INVALID_LINE_2");
      expect(serialized).not.toContain(fakeToken);
      expect(String(new Error(status.failure ?? "unknown"))).not.toContain(fakeToken);
    } finally {
      removeTemporarySecretFile(fixture.directory);
    }
  });

  it("removes credential-bearing variables from a child environment copy", () => {
    const source = {
      PATH: "/usr/bin",
      CLOUDFLARE_API_TOKEN: fakeToken,
      AMBIENT_V2_REAL_REST_TOKEN: fakeToken,
      AMBIENT_V2_D03_DIAGNOSTIC_REST_TOKEN: fakeToken,
      AMBIENT_V2_D04_DIAGNOSTIC_REST_TOKEN: fakeToken,
    };
    const safe = stripAmbientSemanticEvalCredentialEnv(source);

    expect(safe).toEqual({ PATH: "/usr/bin" });
    expect(source.CLOUDFLARE_API_TOKEN).toBe(fakeToken);
  });

  it("uses the developer-only account config before account enumeration", async () => {
    let fetchCalls = 0;
    const result = await discoverAmbientSemanticEvalAccountId({
      env: {},
      projectRoot: resolve(import.meta.dirname, ".."),
      auth: { token: fakeToken, source: "DEV_SECRETS_LOCAL" },
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

  it("has no active Keychain or Wrangler credential path", () => {
    const sharedAuth = readFileSync(
      resolve(import.meta.dirname, "../scripts/ambient-semantic-eval-auth.mjs"),
      "utf8",
    );
    const typedAuth = readFileSync(resolve(import.meta.dirname, "./ambient-semantic-eval-auth.ts"), "utf8");
    expect(sharedAuth).toContain(AMBIENT_SEMANTIC_EVAL_SECRET_FILE);
    expect(sharedAuth).toContain("DEV_SECRETS_LOCAL");
    expect(typedAuth).toContain(AMBIENT_SEMANTIC_EVAL_SECRET_FILE);
    expect(sharedAuth).not.toContain("find-generic-password");
    expect(sharedAuth).not.toContain("wrangler auth token");
    expect(typedAuth).not.toContain("find-generic-password");
    expect(typedAuth).not.toContain("wrangler auth token");
  });

  it("keeps developer auth out of the Production Worker entrypoint", () => {
    const productionEntry = readFileSync(resolve(import.meta.dirname, "./index.ts"), "utf8");
    expect(productionEntry).not.toContain("ambient-semantic-eval-auth");
  });
});
