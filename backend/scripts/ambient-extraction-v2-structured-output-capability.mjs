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
const markerPrefix = "AMBIENT_V2_STRUCTURED_OUTPUT_GATE_REPORT=";
const model = "@cf/meta/llama-3.2-3b-instruct";
function fail(code) {
  console.error(code);
  process.exitCode = 2;
}

function markerFromOutput(output) {
  const lines = output.split(/\r?\n/u).reverse();
  for (const line of lines) {
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
  const ledgerPath = process.env.AMBIENT_V2_STRUCTURED_OUTPUT_GATE_LEDGER_PATH
    || join(projectRoot, "forensics", "runtime", `ambient-extraction-v2-structured-output-${experimentId}.jsonl`);

  if (!auth?.auth || !account.value) {
    console.log(`${markerPrefix}${JSON.stringify({
      model,
      modelSchemaCalls: 0,
      modelSchemaQuery: "FAIL",
      modelSchemaHttp: null,
      modelSchemaErrorClass: "REST_AUTH_BLOCKED",
      capabilityConclusion: "INCONCLUSIVE",
      realAiCalls: 0,
      realAiCallLimit: 1,
      structuredOutputProbe: "NOT_RUN",
      sideEffectFree: true,
    })}`);
    fail("REST_AUTH_BLOCKED");
    return;
  }

  const child = spawn(
    "./node_modules/.bin/vitest",
    ["run", "src/ambient-extraction-v2-structured-output-gate.test.ts", "--reporter=dot"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_V2_STRUCTURED_OUTPUT_GATE: "1",
        AMBIENT_V2_STRUCTURED_OUTPUT_GATE_ACCOUNT_ID: account.value,
        AMBIENT_V2_STRUCTURED_OUTPUT_GATE_LEDGER_PATH: ledgerPath,
        AMBIENT_V2_STRUCTURED_OUTPUT_GATE_EXPERIMENT_ID: experimentId,
        AMBIENT_V2_STRUCTURED_OUTPUT_GATE_MATRIX_RUN_ID: matrixRunId,
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
  if (!marker) fail(processResult.spawnErrorClass || "STRUCTURED_OUTPUT_GATE_REPORT_MISSING");
  if (processResult.code !== 0) process.exitCode = 2;
}

await run();
