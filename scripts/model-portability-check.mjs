import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MODEL_CAPABILITY_EVIDENCE,
  MODEL_KEYS,
  MODEL_REGISTRY,
  MODEL_ROLES,
  capabilityEvidenceReuseKey,
  checkCapabilityGate,
  checkModelForRole,
  modelIdForKey,
  planModelMigration,
} from "../src/model-portability.ts";

const store = JSON.parse(readFileSync(resolve(process.cwd(), "config/model-capabilities.json"), "utf8"));
const currentModel = modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST);
const roleChecks = MODEL_ROLES.map((role) => ({ role, result: checkModelForRole(role, currentModel) }));
const negativeJsonMode = checkCapabilityGate(modelIdForKey(MODEL_KEYS.HISTORICAL_3B), [{
  capability: "json_mode",
  requestProfile: "json-mode-staircase-s0-s4-v1",
}]);
const keyChecks = store.evidence.every((record) => {
  const { reuseKey, ...withoutKey } = record;
  return reuseKey === capabilityEvidenceReuseKey(withoutKey);
});
const result = {
  command: "check:model-portability",
  registryModels: MODEL_REGISTRY.length,
  evidenceRecords: MODEL_CAPABILITY_EVIDENCE.length,
  activeRoleChecks: roleChecks,
  historical3bJsonModeNegativeGate: negativeJsonMode,
  evidenceReuseKeysValid: keyChecks,
  migrationPlannerProviderCalls: planModelMigration(currentModel).providerCalls,
  providerCalls: 0,
  modelCapabilityGate: roleChecks.every(({ result: check }) => check.ok) && negativeJsonMode.ok === false && keyChecks ? "PASS" : "FAIL",
};
console.log(JSON.stringify(result, null, 2));
if (result.modelCapabilityGate !== "PASS") process.exitCode = 2;
