import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  buildSafeAmbientChildEnvironment,
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const projectRoot = process.cwd();
const args = process.argv.slice(2);
const markerPrefix = "AMBIENT_V2_2_REAL_D04_SAFE_JSON=";
function fail(code) {
  console.error(code);
  process.exitCode = 2;
}

function markerFromOutput(output) {
  for (const line of output.split(/\r?\n/u).reverse()) {
    const index = line.indexOf(markerPrefix);
    if (index < 0) continue;
    try {
      return JSON.parse(line.slice(index + markerPrefix.length).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function run() {
  if (!args.includes("--real-model")) {
    fail("REAL_MODEL_OPT_IN_REQUIRED");
    return;
  }

  const auth = discoverAmbientSemanticEvalAuth({ projectRoot });
  const account = await discoverAmbientSemanticEvalAccountId({
    env: process.env,
    auth: auth?.auth,
  });
  const experimentId = randomUUID();
  const matrixRunId = randomUUID();
  const ledgerPath = process.env.AMBIENT_V2_2_REAL_D04_LEDGER_PATH
    || join(projectRoot, "forensics", "runtime", `ambient-extraction-v2-2-real-d04-${experimentId}.jsonl`);

  if (!auth?.auth || !account.value) {
    console.log(`${markerPrefix}${JSON.stringify({ providerCalls: 0, authBlocked: true, sideEffectFree: true })}`);
    fail("V2_2_REAL_D04_ACCOUNT_DISCOVERY_FAILED");
    return;
  }

  const child = spawn(
    "./node_modules/.bin/vitest",
    ["run", "src/ambient-extraction-v2-2-real-d04.test.ts", "--reporter=dot"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_V2_2_REAL_D04: "1",
        AMBIENT_V2_2_REAL_D04_ACCOUNT_ID: account.value,
        AMBIENT_V2_2_REAL_D04_LEDGER_PATH: ledgerPath,
        AMBIENT_V2_2_REAL_D04_EXPERIMENT_ID: experimentId,
        AMBIENT_V2_2_REAL_D04_MATRIX_RUN_ID: matrixRunId,
      }),
    },
  );

  let childOutput = "";
  child.stdout?.on("data", (chunk) => {
    childOutput = `${childOutput}${String(chunk)}`.slice(-1_000_000);
  });
  child.stderr?.on("data", () => undefined);

  const processResult = await new Promise((resolve) => {
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ code: null, signal: null, spawnErrorClass: error?.name || "CHILD_PROCESS_ERROR" });
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal, spawnErrorClass: null });
    });
  });

  const marker = markerFromOutput(childOutput);
  if (marker) console.log(`${markerPrefix}${JSON.stringify(marker)}`);
  if (!marker) {
    fail(processResult.spawnErrorClass || "V2_2_REAL_D04_REPORT_MISSING");
    return;
  }
  if (marker.authBlocked) {
    fail("V2_2_REAL_D04_AUTH_BLOCKED");
    return;
  }
  if (marker.providerCalls !== 1) {
    fail("V2_2_REAL_D04_CALL_NOT_COMPLETED");
    return;
  }
  if (processResult.code !== 0) process.exitCode = 2;
}

await run();
