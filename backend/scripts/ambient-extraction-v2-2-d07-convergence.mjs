import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSafeAmbientChildEnvironment,
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const MAX_PROVIDER_CALLS = 6;
const projectRoot = process.cwd();
const markerPrefix = "AMBIENT_V2_2_D07_CONVERGENCE_SAFE_JSON=";

function fail(code) {
  console.error(code);
  process.exitCode = 2;
}

function isStart(record) {
  return record?.recordType === "ATTEMPT_START";
}

function isTerminal(record) {
  return record?.recordType === "ATTEMPT_SUCCESS"
    || record?.recordType === "ATTEMPT_FAILURE"
    || record?.recordType === "ATTEMPT_UNKNOWN_TERMINATION";
}

async function readLedger(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { records: [], invalidLineCount: 0 };
    throw new Error("V2_2_D07_LEDGER_READ_FAILURE");
  }
  const records = [];
  let invalidLineCount = 0;
  for (const line of content.split(/\r?\n/u).filter(Boolean)) {
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== "object" || typeof value.recordType !== "string") {
        throw new Error("invalid record");
      }
      records.push(value);
    } catch {
      invalidLineCount += 1;
    }
  }
  return { records, invalidLineCount };
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

function reconstruct(records, experimentId, matrixRunId, processResult, markerSeen, invalidLineCount) {
  const scoped = records.filter((record) => record.experimentId === experimentId && record.matrixRunId === matrixRunId);
  const starts = scoped.filter(isStart);
  const terminals = scoped.filter(isTerminal);
  const terminalIds = new Set(terminals.map((record) => record.attemptId));
  return {
    markerSeen,
    processExitCode: processResult.code,
    processSignal: processResult.signal,
    providerAttemptCount: starts.length,
    terminalAttemptCount: starts.filter((record) => terminalIds.has(record.attemptId)).length,
    orphanAttemptCount: starts.filter((record) => !terminalIds.has(record.attemptId)).length,
    unknownTerminationCount: terminals.filter((record) => record.recordType === "ATTEMPT_UNKNOWN_TERMINATION").length,
    processStartedCount: scoped.filter((record) => record.recordType === "PROCESS_STARTED").length,
    processExitedCount: scoped.filter((record) => record.recordType === "PROCESS_EXITED").length,
    invalidLineCount,
  };
}

function evaluateWrapper(reconstructed, marker, processResult) {
  const reasons = [];
  if (reconstructed.invalidLineCount > 0) reasons.push("LEDGER_CORRUPT");
  if (processResult.spawnErrorClass) reasons.push("CHILD_SPAWN_FAILURE");
  if (processResult.signal || processResult.code !== 0) reasons.push("PROCESS_ABNORMAL_EXIT");
  if (reconstructed.providerAttemptCount > MAX_PROVIDER_CALLS) reasons.push("PROVIDER_CALL_LIMIT_EXCEEDED");
  if (reconstructed.providerAttemptCount !== reconstructed.terminalAttemptCount) reasons.push("MISSING_TERMINAL_RECORD");
  if (reconstructed.orphanAttemptCount > 0) reasons.push("ORPHAN_ATTEMPT");
  if (reconstructed.unknownTerminationCount > 0) reasons.push("UNKNOWN_TERMINATION");
  if (reconstructed.processStartedCount !== 1 || reconstructed.processExitedCount !== 1) reasons.push("PROCESS_LEDGER_INCOMPLETE");
  if (reconstructed.providerAttemptCount < 0 || reconstructed.providerAttemptCount > MAX_PROVIDER_CALLS) reasons.push("UNEXPECTED_PROVIDER_CALL_COUNT");
  if (marker?.totalProviderCalls !== undefined && marker.totalProviderCalls !== reconstructed.providerAttemptCount) reasons.push("MARKER_LEDGER_CALL_MISMATCH");
  if (marker?.d07?.providerCalls !== undefined && marker.d07.providerCalls !== 0) reasons.push("D07_PROVIDER_CALL_VIOLATION");
  if (marker?.d07?.executionMode !== undefined && marker.d07.executionMode !== "LOCAL_DETERMINISTIC") reasons.push("D07_NOT_LOCAL_DETERMINISTIC");
  if (marker?.smoke?.status === "FAIL") reasons.push("DEV_SMOKE_ACCEPTANCE_FAILURE");
  return {
    pass: reasons.length === 0,
    markerStatus: marker ? "PRESENT" : "MISSING_NON_FATAL",
    reasons: [...new Set(reasons)],
  };
}

async function run() {
  if (!process.argv.slice(2).includes("--real-model")) {
    fail("REAL_MODEL_OPT_IN_REQUIRED");
    return;
  }

  const auth = discoverAmbientSemanticEvalAuth({
    projectRoot,
  });
  const localFileAuth = auth?.source === "DEV_SECRETS_LOCAL"
    && auth?.secretFileState === "AVAILABLE"
    && Boolean(auth?.auth);
  const account = localFileAuth
    ? await discoverAmbientSemanticEvalAccountId({ projectRoot, auth: auth.auth })
    : { value: null, source: "AUTH_UNAVAILABLE", failure: "DEV_SECRET_FILE_REQUIRED" };
  if (!localFileAuth || !account.value) {
    console.log(`${markerPrefix}${JSON.stringify({
      totalProviderCalls: 0,
      authBlocked: true,
      sideEffectFree: true,
    })}`);
    fail("V2_2_D07_DEV_SECRET_FILE_AUTH_BLOCKED");
    return;
  }

  const experimentId = randomUUID();
  const matrixRunId = randomUUID();
  const ledgerPath = process.env.AMBIENT_V2_2_D07_CONVERGENCE_LEDGER_PATH
    || join(projectRoot, "forensics", "runtime", `ambient-extraction-v2-2-d07-convergence-${experimentId}.jsonl`);
  await mkdir(resolve(ledgerPath, ".."), { recursive: true });
  const existing = await readLedger(ledgerPath);
  if (existing.invalidLineCount > 0) {
    fail("V2_2_D07_LEDGER_CORRUPT_BEFORE_RUN");
    return;
  }
  if (existing.records.length > 0) {
    fail("V2_2_D07_LEDGER_NOT_EMPTY");
    return;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.value}/ai/run/${MODEL}`;
  const child = spawn(
    "./node_modules/.bin/vitest",
    ["run", "src/ambient-extraction-v2-2-d07-convergence.test.ts", "--reporter=dot"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_V2_2_D07_CONVERGENCE: "1",
        AMBIENT_V2_2_D07_CONVERGENCE_ACCOUNT_ID: account.value,
        AMBIENT_V2_2_D07_CONVERGENCE_LEDGER_PATH: ledgerPath,
        AMBIENT_V2_2_D07_CONVERGENCE_EXPERIMENT_ID: experimentId,
        AMBIENT_V2_2_D07_CONVERGENCE_MATRIX_RUN_ID: matrixRunId,
        AMBIENT_V2_2_D07_CONVERGENCE_ENDPOINT: endpoint,
        AMBIENT_V2_2_D07_CONVERGENCE_MAX_CALLS: String(MAX_PROVIDER_CALLS),
      }),
    },
  );
  let childOutput = "";
  child.stdout?.on("data", (chunk) => {
    childOutput = `${childOutput}${String(chunk)}`.slice(-2_000_000);
  });
  child.stderr?.on("data", (chunk) => {
    childOutput = `${childOutput}${String(chunk)}`.slice(-2_000_000);
  });
  const processResult = await new Promise((resolveResult) => {
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      resolveResult({ code: null, signal: null, spawnErrorClass: error?.name || "CHILD_PROCESS_ERROR" });
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolveResult({ code, signal, spawnErrorClass: null });
    });
  });

  try {
    const after = await readLedger(ledgerPath);
    const marker = markerFromOutput(childOutput);
    const reconstructed = reconstruct(after.records, experimentId, matrixRunId, processResult, Boolean(marker), after.invalidLineCount);
    const wrapper = evaluateWrapper(reconstructed, marker, processResult);
    console.log(`V2_2_D07_LEDGER_PATH_SAFE=${ledgerPath.replace(projectRoot, "<PROJECT>")}`);
    console.log(`AMBIENT_V2_2_D07_RECONSTRUCTED_SAFE_JSON=${JSON.stringify(reconstructed)}`);
    if (marker) console.log(`${markerPrefix}${JSON.stringify(marker)}`);
    console.log(`AMBIENT_V2_2_D07_MARKER_STATUS=${wrapper.markerStatus}`);
    console.log(`AMBIENT_V2_2_D07_WRAPPER_STATUS=${wrapper.pass ? "PASS" : "FAIL"}`);
    if (!wrapper.pass) {
      console.log(`AMBIENT_V2_2_D07_WRAPPER_FAILURE_CLASSES=${wrapper.reasons.join(",")}`);
      process.exitCode = 2;
      return;
    }
    const acceptancePass = marker?.d07?.status === "PASS" && marker?.smoke?.status === "PASS";
    console.log(`AMBIENT_V2_2_D07_ACCEPTANCE_STATUS=${acceptancePass ? "PASS" : "FAIL"}`);
    if (!acceptancePass) process.exitCode = 2;
  } catch {
    console.error("V2_2_D07_LEDGER_READ_FAILURE");
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await run();
