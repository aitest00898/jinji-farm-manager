import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSafeAmbientChildEnvironment,
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const projectRoot = process.cwd();
const args = process.argv.slice(2);
const d03Only = args.includes("--d03-only");
const d04Only = args.includes("--d04-only");
const markerPrefix = d03Only
  ? "AMBIENT_V2_D03_DIAGNOSTIC_SAFE_JSON="
  : d04Only
    ? "AMBIENT_V2_D04_DIAGNOSTIC_SAFE_JSON="
  : "AMBIENT_V2_REAL_SMOKE_SAFE_JSON=";
const childTestFile = d03Only
  ? "src/ambient-extraction-v2-d03-diagnostic.test.ts"
  : d04Only
    ? "src/ambient-extraction-v2-d04-diagnostic.test.ts"
  : "src/ambient-extraction-v2-real-smoke.test.ts";
const defaultLedgerPrefix = d03Only
  ? "ambient-extraction-v2-d03-diagnostic"
  : d04Only
    ? "ambient-extraction-v2-d04-diagnostic"
  : "ambient-extraction-v2-real-smoke";
const maxProviderCalls = d03Only || d04Only ? 1 : null;
function fail(code) {
  console.error(code);
  process.exitCode = 2;
}

function maskAccountId(value) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : null;
}

async function appendLedgerRecord(path, record) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a");
  try {
    await handle.appendFile(`${JSON.stringify(record)}\n`, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readLedgerRecords(path) {
  let content;
  try {
    content = await readFile(path, { encoding: "utf8" });
  } catch (error) {
    if (error?.code === "ENOENT") return { records: [], invalidLineCount: 0 };
    throw new Error("V2_LEDGER_READ_FAILURE");
  }
  const records = [];
  let invalidLineCount = 0;
  for (const line of content.split(/\r?\n/u).filter(Boolean)) {
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== "object" || typeof value.recordType !== "string" || typeof value.matrixRunId !== "string") throw new Error("invalid record");
      records.push(value);
    } catch {
      invalidLineCount += 1;
    }
  }
  return { records, invalidLineCount };
}

function isStart(record) {
  return record?.recordType === "ATTEMPT_START";
}

function isTerminal(record) {
  return record?.recordType === "ATTEMPT_SUCCESS"
    || record?.recordType === "ATTEMPT_FAILURE"
    || record?.recordType === "ATTEMPT_UNKNOWN_TERMINATION";
}

function markerFromOutput(output) {
  const markerIndex = output.lastIndexOf(markerPrefix);
  if (markerIndex < 0) return null;
  try {
    return JSON.parse(output.slice(markerIndex + markerPrefix.length).trim());
  } catch {
    return null;
  }
}

/**
 * The durable ledger is authoritative for wrapper success. The marker is a
 * human-readable convenience signal and must not be a second durability
 * boundary. This function returns only bounded control-flow classes.
 */
export function evaluateWrapperExecution({
  reconstructed,
  processResult,
  markerSeen,
  maxProviderCalls,
  ledgerReadOk = true,
  ledgerCorrupt = false,
  durabilityWriteOk = true,
}) {
  const failureReasons = [];
  if (!ledgerReadOk) failureReasons.push("LEDGER_READ_FAILURE");
  if (ledgerCorrupt) failureReasons.push("LEDGER_CORRUPT");
  if (!durabilityWriteOk) failureReasons.push("LEDGER_WRITE_FAILURE");
  if (processResult?.spawnErrorClass) failureReasons.push("CHILD_SPAWN_FAILURE");
  if (processResult?.signal) failureReasons.push("PROCESS_ABNORMAL_EXIT");
  if (processResult?.code !== 0) failureReasons.push("PROCESS_ABNORMAL_EXIT");
  if (!reconstructed || reconstructed.orphanAttemptCount > 0) failureReasons.push("ORPHAN_ATTEMPT");
  if (reconstructed
    && reconstructed.providerAttemptCount !== reconstructed.terminalAttemptCount) failureReasons.push("MISSING_TERMINAL_RECORD");
  if (reconstructed?.attemptStates?.some((attempt) => attempt.terminalState === "ORPHAN" || attempt.terminalState === "ATTEMPT_UNKNOWN_TERMINATION")) {
    failureReasons.push("UNKNOWN_TERMINATION");
  }
  if (maxProviderCalls !== null
    && reconstructed
    && reconstructed.providerAttemptCount > maxProviderCalls) failureReasons.push("PROVIDER_CALL_LIMIT_EXCEEDED");
  return {
    pass: failureReasons.length === 0,
    markerStatus: markerSeen ? "PRESENT" : "MISSING_NON_FATAL",
    failureReasons: [...new Set(failureReasons)],
  };
}

function reconstruct(records, experimentId, matrixRunId, processResult, markerSeen) {
  const scoped = records.filter((record) => record.experimentId === experimentId && record.matrixRunId === matrixRunId);
  const starts = scoped.filter(isStart);
  const terminals = scoped.filter(isTerminal);
  const terminalIds = new Set(terminals.map((record) => record.attemptId));
  return {
    experimentId,
    matrixRunId,
    markerSeen,
    processExitCode: processResult.code,
    processSignal: processResult.signal,
    providerAttemptCount: starts.length,
    terminalAttemptCount: starts.filter((record) => terminalIds.has(record.attemptId)).length,
    orphanAttemptCount: starts.filter((record) => !terminalIds.has(record.attemptId)).length,
    providerResponseCount: terminals.filter((record) => record.providerResponseConfirmed === true).length,
    technicalFailureCount: terminals.filter((record) => record.transportStatus === "failure").length,
    attemptStates: starts.map((start) => ({
      safeRef: start.safeRef,
      runNumber: start.runNumber,
      callOrdinal: start.callOrdinal,
      terminalState: terminalIds.has(start.attemptId)
        ? terminals.find((record) => record.attemptId === start.attemptId)?.recordType ?? "UNKNOWN"
        : "ORPHAN",
    })),
  };
}

async function markOrphans(path, experimentId, matrixRunId, processResult) {
  const current = await readLedgerRecords(path);
  const scoped = current.records.filter((record) => record.experimentId === experimentId && record.matrixRunId === matrixRunId);
  const terminalIds = new Set(scoped.filter(isTerminal).map((record) => record.attemptId));
  for (const start of scoped.filter((record) => isStart(record) && !terminalIds.has(record.attemptId))) {
    await appendLedgerRecord(path, {
      recordType: "ATTEMPT_UNKNOWN_TERMINATION",
      experimentId,
      matrixRunId,
      attemptId: start.attemptId,
      caseId: start.caseId,
      safeRef: start.safeRef,
      runNumber: start.runNumber,
      callOrdinal: start.callOrdinal,
      completedAt: new Date().toISOString(),
      transportStatus: "unknown",
      httpStatus: null,
      providerResponseConfirmed: null,
      jsonStatus: "unknown",
      normalizationStatus: "unknown",
      validationStatus: "unknown",
      systemBuildStatus: "unknown",
      overallPass: null,
      failureClass: "PROCESS_ABNORMAL_EXIT",
      cloudflareErrorCode: null,
      safeMetrics: null,
      processExitCode: processResult.code,
      signal: processResult.signal,
    });
  }
}

async function run() {
  if (!args.includes("--real-model")) {
    fail("REAL_MODEL_OPT_IN_REQUIRED");
    return;
  }
  if (d03Only && d04Only) {
    fail("ONE_DIAGNOSTIC_MODE_REQUIRED");
    return;
  }

  const auth = discoverAmbientSemanticEvalAuth({ projectRoot });
  const account = await discoverAmbientSemanticEvalAccountId({
    env: process.env,
    auth: auth?.auth,
  });
  const experimentId = randomUUID();
  const matrixRunId = randomUUID();
  const ledgerPath = process.env.AMBIENT_V2_REAL_SMOKE_LEDGER_PATH
    || join(projectRoot, "forensics", "runtime", `${defaultLedgerPrefix}-${experimentId}.jsonl`);
  console.log(JSON.stringify({
    ACCOUNT_ID_AVAILABLE: Boolean(account.value),
    ACCOUNT_ID_SAFE: maskAccountId(account.value),
    AUTH_TOKEN_AVAILABLE: Boolean(auth?.auth),
    AUTH_SOURCE: auth?.source ?? "UNAVAILABLE",
    WORKERS_AI_PERMISSION_VERIFIED: "YES_PREVIOUS_DIRECT_REST_PREFLIGHT",
    MODEL,
    REST_PREFLIGHT_THIS_ROUND: "NOT_RUN_BY_POLICY",
    V2_PROVIDER_EXECUTION_MODE: "SERIAL",
    MAX_CONCURRENT_AI_CALLS: 1,
    MAX_PROVIDER_CALLS_THIS_EXECUTION: maxProviderCalls,
  }));
  if (!account.value || !auth?.auth) {
    fail("REST_AUTH_BLOCKED");
    return;
  }

  let existing;
  try {
    existing = await readLedgerRecords(ledgerPath);
  } catch {
    fail("V2_LEDGER_READ_FAILURE");
    return;
  }
  if (existing.invalidLineCount > 0) {
    fail("V2_LEDGER_CORRUPT");
    return;
  }
  if (existing.records.length > 0) {
    fail("V2_LEDGER_NOT_EMPTY");
    return;
  }
  try {
    await appendLedgerRecord(ledgerPath, {
      recordType: "PROCESS_STARTED",
      experimentId,
      matrixRunId,
      timestamp: new Date().toISOString(),
    });
  } catch {
    fail("V2_TELEMETRY_DURABILITY_FAILURE");
    return;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.value}/ai/run/${MODEL}`;
  const child = spawn(
    "./node_modules/.bin/vitest",
    ["run", childTestFile, "--reporter=dot"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_V2_REAL_SMOKE: "1",
        AMBIENT_V2_D03_DIAGNOSTIC: d03Only ? "1" : "0",
        AMBIENT_V2_D04_DIAGNOSTIC: d04Only ? "1" : "0",
        AMBIENT_V2_REAL_REST_URL: endpoint,
        AMBIENT_V2_REAL_SMOKE_LEDGER_PATH: ledgerPath,
        AMBIENT_V2_REAL_SMOKE_EXPERIMENT_ID: experimentId,
        AMBIENT_V2_REAL_SMOKE_MATRIX_RUN_ID: matrixRunId,
        AMBIENT_V2_D03_DIAGNOSTIC_REST_URL: endpoint,
        AMBIENT_V2_D03_DIAGNOSTIC_LEDGER_PATH: ledgerPath,
        AMBIENT_V2_D03_DIAGNOSTIC_EXPERIMENT_ID: experimentId,
        AMBIENT_V2_D03_DIAGNOSTIC_MATRIX_RUN_ID: matrixRunId,
        AMBIENT_V2_D04_DIAGNOSTIC_REST_URL: endpoint,
        AMBIENT_V2_D04_DIAGNOSTIC_LEDGER_PATH: ledgerPath,
        AMBIENT_V2_D04_DIAGNOSTIC_EXPERIMENT_ID: experimentId,
        AMBIENT_V2_D04_DIAGNOSTIC_MATRIX_RUN_ID: matrixRunId,
      }),
    },
  );
  let childOutput = "";
  let stderrNonempty = false;
  child.stdout?.on("data", (chunk) => {
    childOutput = `${childOutput}${String(chunk)}`.slice(-2_000_000);
  });
  child.stderr?.on("data", (chunk) => {
    stderrNonempty = true;
    childOutput = `${childOutput}${String(chunk)}`.slice(-2_000_000);
  });
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

  try {
    await markOrphans(ledgerPath, experimentId, matrixRunId, processResult);
    const afterOrphans = await readLedgerRecords(ledgerPath);
    const marker = markerFromOutput(childOutput);
    const reconstructed = reconstruct(afterOrphans.records, experimentId, matrixRunId, processResult, Boolean(marker));
    if (!afterOrphans.records.some((record) => record.recordType === "PROCESS_EXITED" && record.matrixRunId === matrixRunId)) {
      await appendLedgerRecord(ledgerPath, {
        recordType: "PROCESS_EXITED",
        experimentId,
        matrixRunId,
        timestamp: new Date().toISOString(),
        exitCode: processResult.code,
        signal: processResult.signal,
        markerSeen: Boolean(marker),
        stderrClass: stderrNonempty ? "NONEMPTY" : "EMPTY",
      });
    }
    const finalRecords = await readLedgerRecords(ledgerPath);
    const finalReconstructed = reconstruct(finalRecords.records, experimentId, matrixRunId, processResult, Boolean(marker));
    console.log(`V2_REAL_SMOKE_LEDGER_PATH_SAFE=${ledgerPath.replace(projectRoot, "<PROJECT>")}`);
    console.log(`AMBIENT_V2_REAL_SMOKE_RECONSTRUCTED_SAFE_JSON=${JSON.stringify(finalReconstructed)}`);
    if (marker) console.log(`AMBIENT_V2_REAL_SMOKE_SAFE_JSON=${JSON.stringify(marker)}`);
    if (processResult.spawnErrorClass) console.log(`V2_RUNNER_PROCESS_ERROR_CLASS=${processResult.spawnErrorClass}`);
    const wrapperDecision = evaluateWrapperExecution({
      reconstructed: finalReconstructed,
      processResult,
      markerSeen: Boolean(marker),
      maxProviderCalls,
    });
    console.log(`AMBIENT_V2_WRAPPER_STATUS=${wrapperDecision.pass ? "PASS" : "FAIL"}`);
    console.log(`AMBIENT_V2_MARKER_STATUS=${wrapperDecision.markerStatus}`);
    if (!wrapperDecision.pass) {
      console.log(`AMBIENT_V2_WRAPPER_FAILURE_CLASSES=${wrapperDecision.failureReasons.join(",")}`);
      process.exitCode = 2;
    }
  } catch {
    console.error("V2_TELEMETRY_DURABILITY=FAIL");
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await run();
