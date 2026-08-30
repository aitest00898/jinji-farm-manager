import { describe, expect, it } from "vitest";
import {
  ADMIN_MAX_FAILED_ATTEMPTS,
  ADMIN_PBKDF2_ITERATIONS,
  adminSessionIsActive,
  nextAdminFailureState,
  verifyAdminPassword,
} from "./admin-auth";

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function fixtureVerifier(): Promise<string> {
  const salt = new Uint8Array(Array.from({ length: 16 }, (_, index) => index + 1));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("unit-only-password") as unknown as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ADMIN_PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  ));
  return `pbkdf2-sha256$${ADMIN_PBKDF2_ITERATIONS}$${base64(salt)}$${base64(derived)}`;
}

describe("farm admin authentication", () => {
  it("verifies a salted PBKDF2 verifier without accepting a wrong password", async () => {
    const verifier = await fixtureVerifier();
    await expect(verifyAdminPassword("unit-only-password", verifier)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong-password", verifier)).resolves.toBe(false);
  });

  it("rejects verifier iteration counts outside the compatibility policy", async () => {
    const verifier = await fixtureVerifier();
    await expect(verifyAdminPassword("unit-only-password", verifier.replace(`$${ADMIN_PBKDF2_ITERATIONS}$`, "$310000$"))).resolves.toBe(false);
  });

  it("uses a scoped five-failure lockout state", () => {
    let state = null;
    const start = Date.parse("2026-08-19T00:00:00.000Z");
    for (let attempt = 0; attempt < ADMIN_MAX_FAILED_ATTEMPTS; attempt += 1) {
      state = nextAdminFailureState(state, new Date(start + attempt * 1000).toISOString(), start + attempt * 1000);
    }
    expect(state?.failedCount).toBe(5);
    expect(state?.lockedUntil).toBe(new Date(start + 4_000 + 15 * 60 * 1000).toISOString());
  });

  it("resets the failed counter after a lock expires", () => {
    const now = "2026-08-19T01:00:00.000Z";
    const state = nextAdminFailureState({ failedCount: 5, lockedUntil: "2026-08-19T00:59:00.000Z" }, now, Date.parse(now));
    expect(state.failedCount).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });

  it("enforces the short-lived session boundary", () => {
    expect(adminSessionIsActive("2026-08-19T00:05:00.000Z", "2026-08-19T00:04:59.000Z")).toBe(true);
    expect(adminSessionIsActive("2026-08-19T00:05:00.000Z", "2026-08-19T00:05:00.000Z")).toBe(false);
  });
});
