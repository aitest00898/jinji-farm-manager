import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), "config/model-capabilities.json");
const store = JSON.parse(readFileSync(path, "utf8"));
if (store.appendOnly !== true || !Array.isArray(store.evidence) || !Array.isArray(store.models)) {
  throw new Error("MODEL_CAPABILITY_STORE_INVALID");
}

console.log(JSON.stringify({
  command: "model:capabilities",
  provider: store.providerPolicy?.provider,
  workersPlan: store.providerPolicy?.workersPlan,
  models: store.models.map(({ key, modelId, lifecycle, freeTierEligible }) => ({ key, modelId, lifecycle, freeTierEligible })),
  evidenceCount: store.evidence.length,
  evidence: store.evidence.map(({ evidenceId, modelId, capability, requestProfile, evidenceLevel, result, observedAt }) => ({
    evidenceId,
    modelId,
    capability,
    requestProfile,
    evidenceLevel,
    result,
    observedAt,
  })),
  providerCalls: 0,
}, null, 2));
