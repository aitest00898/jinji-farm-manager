import { MODEL_ROLES, checkModelForRole, modelIdForKey, MODEL_KEYS } from "../src/model-portability.ts";

const candidate = process.argv[2] || modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST);
const checks = MODEL_ROLES.map((role) => ({ role, result: checkModelForRole(role, candidate) }));
const pass = checks.every(({ result }) => result.ok);
console.log(JSON.stringify({
  command: "model:check",
  candidate,
  modelCapabilityGate: pass ? "PASS" : "FAIL",
  checks,
  providerCalls: 0,
}, null, 2));
if (!pass) process.exitCode = 2;
