import { describe, expect, it } from "vitest";
import {
  assertCanonicalWritesOpen,
  canonicalWebMutationRequiresHold,
  canonicalWriteHoldState,
  CanonicalWriteHoldError,
} from "./recording-write-adapter";

describe("canonical write hold", () => {
  it("defaults to OFF and preserves the existing open-write behavior", () => {
    expect(canonicalWriteHoldState({})).toBe("OFF");
    expect(() => assertCanonicalWritesOpen({})).not.toThrow();
    expect(() => assertCanonicalWritesOpen({ CANONICAL_WRITE_HOLD: "off" })).not.toThrow();
  });

  it("blocks ON and unknown configuration values without touching D1", () => {
    expect(canonicalWriteHoldState({ CANONICAL_WRITE_HOLD: "on" })).toBe("ON");
    expect(() => assertCanonicalWritesOpen({ CANONICAL_WRITE_HOLD: "on" }))
      .toThrowError(new CanonicalWriteHoldError("ON"));
    expect(canonicalWriteHoldState({ CANONICAL_WRITE_HOLD: "unexpected" })).toBe("INVALID");
    expect(() => assertCanonicalWritesOpen({ CANONICAL_WRITE_HOLD: "unexpected" }))
      .toThrowError(new CanonicalWriteHoldError("INVALID"));
  });

  it("holds every authenticated API mutation while preserving reads and logout", () => {
    expect(canonicalWebMutationRequiresHold("/api/records", "POST")).toBe(true);
    expect(canonicalWebMutationRequiresHold("/api/records/record-1/reverse", "POST")).toBe(true);
    expect(canonicalWebMutationRequiresHold("/api/operators", "POST")).toBe(true);
    expect(canonicalWebMutationRequiresHold("/api/line-groups/group-1/operator-bindings", "POST")).toBe(true);
    expect(canonicalWebMutationRequiresHold("/api/dashboard", "GET")).toBe(false);
    expect(canonicalWebMutationRequiresHold("/api/records", "GET")).toBe(false);
    expect(canonicalWebMutationRequiresHold("/api/web/auth/login", "POST")).toBe(false);
    expect(canonicalWebMutationRequiresHold("/api/web/auth/logout", "POST")).toBe(false);
  });
});
