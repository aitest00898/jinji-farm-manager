const textEncoder = new TextEncoder();

export const ADMIN_SESSION_TTL_MS = 5 * 60 * 1000;
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
export const ADMIN_MAX_FAILED_ATTEMPTS = 5;
/**
 * Security compatibility exception: this fixed value is currently used
 * because Node and Cloudflare Worker verification was experimentally
 * compatible at 100,000 iterations, while higher tested counts diverged.
 */
export const ADMIN_PBKDF2_ITERATIONS = 100_000;

export interface AdminAttemptState {
  failedCount: number;
  lockedUntil: string | null;
}

export function nextAdminFailureState(
  previous: AdminAttemptState | null,
  now = new Date().toISOString(),
  nowMs = Date.now(),
): AdminAttemptState {
  const lockExpired = Boolean(previous?.lockedUntil && previous.lockedUntil <= now);
  const failedCount = lockExpired ? 1 : (previous?.failedCount ?? 0) + 1;
  return {
    failedCount,
    lockedUntil: failedCount >= ADMIN_MAX_FAILED_ATTEMPTS
      ? new Date(nowMs + ADMIN_LOCKOUT_MS).toISOString()
      : null,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

/**
 * Verifier format: pbkdf2-sha256$iterations$salt-base64$derived-base64.
 * The plaintext password is never returned, persisted, or logged here.
 */
export async function verifyAdminPassword(password: string, verifier: string | undefined): Promise<boolean> {
  if (!password || !verifier) return false;
  const parts = verifier.trim().split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  const salt = base64ToBytes(parts[2]);
  const expected = base64ToBytes(parts[3].trim());
  if (iterations !== ADMIN_PBKDF2_ITERATIONS || !salt || !expected || expected.length !== 32) {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password) as unknown as BufferSource,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );
    const derived = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
      key,
      expected.length * 8,
    ));
    return constantTimeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function adminSessionIsActive(expiresAt: string, now = new Date().toISOString()): boolean {
  return expiresAt > now;
}
