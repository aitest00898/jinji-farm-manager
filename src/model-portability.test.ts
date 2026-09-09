import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MODEL_CAPABILITY_EVIDENCE,
  MODEL_KEYS,
  MODEL_REGISTRY,
  MODEL_ROLES,
  MODEL_ROLE_REQUIREMENTS,
  capabilityEvidenceReuseKey,
  checkCapabilityGate,
  modelIdForKey,
  planEvidenceReuse,
  planModelMigration,
  resolveModelForRole,
  runStructured,
  runText,
} from "./model-portability";

const root = resolve(import.meta.dirname, "..");
const capabilitiesFile = JSON.parse(readFileSync(resolve(root, "config/model-capabilities.json"), "utf8")) as {
  appendOnly: boolean;
  evidence: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
};

describe("model portability registry and capability gate", () => {
  it("keeps every active Production role on the current 8B binding", () => {
    for (const role of MODEL_ROLES) expect(resolveModelForRole(role)).toBe(modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST));
    expect(MODEL_ROLE_REQUIREMENTS.ANALYSIS).toEqual([{ capability: "text_generation" }]);
    expect(MODEL_REGISTRY.find((entry) => entry.key === MODEL_KEYS.CURRENT_8B_FAST)).toMatchObject({
      modelId: "@cf/meta/llama-3.1-8b-instruct-fast",
      freeTierEligible: true,
    });
  });

  it("fails closed for unknown models and unbound downgrade overrides", () => {
    expect(() => resolveModelForRole("CONVERSATION", "@cf/developer/unknown-model")).toThrow("MODEL_CAPABILITY_GATE_FAIL:UNKNOWN_MODEL");
    expect(() => resolveModelForRole("CONVERSATION", modelIdForKey(MODEL_KEYS.HISTORICAL_3B))).toThrow("MODEL_CAPABILITY_GATE_FAIL:MODEL_NOT_CURRENTLY_BOUND");
  });

  it("does not bind a model when the requested JSON capability is not proven", () => {
    const result = checkCapabilityGate(modelIdForKey(MODEL_KEYS.HISTORICAL_3B), [{
      capability: "json_mode",
      requestProfile: "json-mode-staircase-s0-s4-v1",
    }]);
    expect(result).toMatchObject({ ok: false, code: "CAPABILITY_NOT_PROVEN" });
  });

  it("keeps full StructuredAnalysis compatibility distinct from bounded JSON Mode", () => {
    const result = checkCapabilityGate(modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST), [{
      capability: "full_structured_analysis_json_mode",
      requestProfile: "full-structured-analysis-json-mode-v1",
    }]);
    expect(result).toMatchObject({ ok: false, code: "CAPABILITY_NOT_PROVEN" });
    expect(checkCapabilityGate(modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST), [{
      capability: "json_mode",
      requestProfile: "json-mode-staircase-s0-s4-v1",
    }])).toMatchObject({ ok: true });
  });

  it("uses the model router at the provider-neutral text boundary", async () => {
    const run = vi.fn(async () => ({ response: "{}" }));
    await runText({ run }, "ANALYSIS", { messages: [{ role: "user", content: "synthetic" }] });
    expect(run).toHaveBeenCalledWith(modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST), expect.any(Object));
  });

  it("requires a proven profile at the structured boundary and has no fallback", async () => {
    const run = vi.fn(async () => ({ response: "{}" }));
    await runStructured(
      { run },
      "ANALYSIS",
      { messages: [{ role: "user", content: "synthetic" }], response_format: { type: "json_schema" } },
      "json-mode-staircase-s0-s4-v1",
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST), expect.any(Object));

    const failingRun = vi.fn(async () => { throw new Error("provider_failure"); });
    await expect(runStructured(
      { run: failingRun },
      "ANALYSIS",
      { messages: [{ role: "user", content: "synthetic" }], response_format: { type: "json_schema" } },
      "json-mode-staircase-s0-s4-v1",
    )).rejects.toThrow("provider_failure");
    expect(failingRun).toHaveBeenCalledTimes(1);
  });

  it("emits reusable evidence buckets without provider calls", () => {
    const current = modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST);
    const reuse = planEvidenceReuse(current, [{ capability: "text_generation" }]);
    expect(reuse.reused).toContain("8b-production-text-generation-current");
    expect(reuse.missing).toEqual([]);
    expect(reuse.stale).toEqual([]);
    expect(reuse.newStaticEvidence).toEqual([]);
    expect(reuse.newLiveEvidence).toContain("8b-production-text-generation-current");

    expect(planModelMigration(modelIdForKey(MODEL_KEYS.HISTORICAL_3B)).downgradeGuard).toBe("RELEASE_INTENT_REQUIRED");
    expect(planModelMigration(modelIdForKey(MODEL_KEYS.HISTORICAL_3B), { releaseIntent: "MODEL_MIGRATION" }).downgradeGuard).toBe("PASS");
  });

  it("keeps the checked-in evidence store append-only and reuse-key complete", () => {
    expect(capabilitiesFile.appendOnly).toBe(true);
    expect(capabilitiesFile.models).toHaveLength(MODEL_REGISTRY.length);
    expect(capabilitiesFile.evidence).toHaveLength(MODEL_CAPABILITY_EVIDENCE.length);
    for (const record of capabilitiesFile.evidence) {
      const { reuseKey, ...withoutKey } = record;
      expect(reuseKey).toBe(capabilityEvidenceReuseKey(withoutKey as never));
    }
  });
});
