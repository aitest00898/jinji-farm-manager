import { describe, expect, it } from "vitest";

// The wrapper is a developer-only ESM script. Its main guard keeps this
// import side-effect free so the pure policy can be tested without spawning
// Vitest or calling Workers AI.
// @ts-expect-error The JavaScript wrapper intentionally has no production TS dependency.
import { evaluateWrapperExecution } from "../scripts/ambient-extraction-v2-real-smoke.mjs";

function reconstructed(overrides: Record<string, unknown> = {}) {
  return {
    providerAttemptCount: 1,
    terminalAttemptCount: 1,
    orphanAttemptCount: 0,
    attemptStates: [{ terminalState: "ATTEMPT_SUCCESS" }],
    ...overrides,
  };
}

const healthyProcess = { code: 0, signal: null, spawnErrorClass: null };

describe("Ambient V2 real-smoke wrapper durability policy", () => {
  it("passes when the marker is present and the durable ledger is complete", () => {
    const result = evaluateWrapperExecution({
      reconstructed: reconstructed(),
      processResult: healthyProcess,
      markerSeen: true,
      maxProviderCalls: 1,
    });

    expect(result).toMatchObject({ pass: true, markerStatus: "PRESENT", failureReasons: [] });
  });

  it("treats a missing marker as non-fatal when the ledger is complete", () => {
    const result = evaluateWrapperExecution({
      reconstructed: reconstructed(),
      processResult: healthyProcess,
      markerSeen: false,
      maxProviderCalls: 1,
    });

    expect(result).toMatchObject({ pass: true, markerStatus: "MISSING_NON_FATAL", failureReasons: [] });
  });

  it("fails when an orphan attempt exists even if the marker is missing", () => {
    const result = evaluateWrapperExecution({
      reconstructed: reconstructed({ orphanAttemptCount: 1, terminalAttemptCount: 0, attemptStates: [{ terminalState: "ORPHAN" }] }),
      processResult: healthyProcess,
      markerSeen: false,
      maxProviderCalls: 1,
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toEqual(expect.arrayContaining(["ORPHAN_ATTEMPT", "MISSING_TERMINAL_RECORD"]));
  });

  it("fails on abnormal child termination", () => {
    const result = evaluateWrapperExecution({
      reconstructed: reconstructed(),
      processResult: { code: 1, signal: null, spawnErrorClass: null },
      markerSeen: true,
      maxProviderCalls: 1,
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toContain("PROCESS_ABNORMAL_EXIT");
  });

  it("fails when the provider call limit is exceeded", () => {
    const result = evaluateWrapperExecution({
      reconstructed: reconstructed({ providerAttemptCount: 2, terminalAttemptCount: 2 }),
      processResult: healthyProcess,
      markerSeen: false,
      maxProviderCalls: 1,
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toContain("PROVIDER_CALL_LIMIT_EXCEEDED");
  });

  it("fails when a provider attempt has no terminal record", () => {
    const result = evaluateWrapperExecution({
      reconstructed: reconstructed({ terminalAttemptCount: 0, attemptStates: [{ terminalState: "ORPHAN" }] }),
      processResult: healthyProcess,
      markerSeen: true,
      maxProviderCalls: 1,
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toEqual(expect.arrayContaining(["MISSING_TERMINAL_RECORD", "UNKNOWN_TERMINATION"]));
  });
});
