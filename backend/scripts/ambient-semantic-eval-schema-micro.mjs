import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildSafeAmbientChildEnvironment,
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const args = process.argv.slice(2);
const singleD05 = args.includes("--d05-only");
const MAX_CALLS = singleD05 ? 1 : 3;
const projectRoot = process.cwd();
const defaultLedgerPath = join(
  projectRoot,
  "forensics",
  "runtime",
  singleD05
    ? "ambient-kind-contract-fix-attempts-2026-08-27.jsonl"
    : "ambient-semantic-eval-schema-micro-attempts-2026-08-27.jsonl",
);
const childTestFile = singleD05
  ? "src/ambient-kind-contract-fix-runner.test.ts"
  : "src/ambient-semantic-eval-schema-micro-runner.test.ts";
const markerPrefix = singleD05
  ? "REAL_MODEL_KIND_FIX_SAFE_JSON="
  : "REAL_MODEL_SCHEMA_MICRO_SAFE_JSON=";

function fail(code) {
  console.error(code);
  process.exitCode = 2;
}

function maskAccountId(value) {
  return value ? value.slice(0, 6) + "…" + value.slice(-4) : null;
}

async function appendLedgerRecord(path, record) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a");
  try {
    await handle.appendFile(JSON.stringify(record) + "\n", { encoding: "utf8" });
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
    throw new Error("MICRO_LEDGER_READ_FAILURE");
  }
  const records = [];
  let invalidLineCount = 0;
  for (const line of content.split(/\r?\n/u).filter(Boolean)) {
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== "object" || typeof record.recordType !== "string" || typeof record.matrixRunId !== "string") {
        throw new Error("invalid record");
      }
      records.push(record);
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

function reconstruct(records, matrixRunId, processResult, markerSeen) {
  const scoped = records.filter((record) => record.matrixRunId === matrixRunId);
  const starts = scoped.filter(isStart);
  const terminalByAttempt = new Map();
  for (const record of scoped) if (isTerminal(record)) terminalByAttempt.set(record.attemptId, record);
  const attempts = starts.map((start) => {
    const terminal = terminalByAttempt.get(start.attemptId);
    return {
      caseId: start.caseId,
      runIndex: start.runIndex,
      terminalStatus: terminal?.recordType ?? "ORPHAN",
      transportStatus: terminal?.transportStatus ?? "unknown",
      httpStatus: terminal?.httpStatus ?? null,
      providerResponseConfirmed: terminal?.providerResponseConfirmed ?? null,
      safeMetrics: terminal?.safeMetrics ?? null,
    };
  });
  const orphanAttempts = attempts.filter((attempt) => attempt.terminalStatus === "ORPHAN").length;
  return {
    matrixRunId,
    processExitCode: processResult.code,
    processSignal: processResult.signal,
    markerSeen,
    providerAttemptCount: starts.length,
    terminalAttemptCount: attempts.length - orphanAttempts,
    orphanAttemptCount: orphanAttempts,
    attempts,
    hardLimitRemaining: Math.max(0, MAX_CALLS - starts.length),
    overallRunnerStatus: orphanAttempts > 0
      ? "orphaned"
      : processResult.code === 0
        ? "completed"
        : "abnormal_exit",
  };
}

function safeReportsFromLedger(reconstructed) {
  return reconstructed.attempts.flatMap((attempt) => {
    if (!attempt.safeMetrics) return [];
    return [{
      caseId: attempt.caseId,
      runIndex: attempt.runIndex,
      providerResponseConfirmed: attempt.providerResponseConfirmed,
      ...attempt.safeMetrics,
    }];
  });
}

function fallbackStop(reconstructed) {
  const firstFailureIndex = reconstructed.attempts.findIndex((attempt) => {
    if (attempt.terminalStatus === "ORPHAN") return true;
    if (!attempt.safeMetrics) return attempt.transportStatus !== "success";
    return !attempt.providerResponseConfirmed
      || !attempt.safeMetrics.jsonPass
      || !attempt.safeMetrics.normalizationPass
      || !attempt.safeMetrics.validationPass
      || !attempt.safeMetrics.systemBuildPass;
  });
  if (firstFailureIndex >= 0) {
    const attempt = reconstructed.attempts[firstFailureIndex];
    if (attempt.terminalStatus === "ORPHAN") return { stopAfterCall: firstFailureIndex + 1, stopReason: "RUNNER_FAILURE" };
    if (!attempt.safeMetrics || !attempt.providerResponseConfirmed || !attempt.safeMetrics.jsonPass || !attempt.safeMetrics.normalizationPass) {
      return { stopAfterCall: firstFailureIndex + 1, stopReason: "TECHNICAL_FAILURE" };
    }
    if (!attempt.safeMetrics.validationPass) return { stopAfterCall: firstFailureIndex + 1, stopReason: "SCHEMA_FAILURE" };
    if (!attempt.safeMetrics.systemBuildPass) return { stopAfterCall: firstFailureIndex + 1, stopReason: "SYSTEM_BUILD_FAILURE" };
  }
  return reconstructed.providerAttemptCount >= MAX_CALLS
    ? { stopAfterCall: MAX_CALLS, stopReason: "COMPLETED_THREE_CALLS" }
    : { stopAfterCall: null, stopReason: null };
}

function markerFromOutput(output) {
  const start = output.indexOf(markerPrefix);
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start + markerPrefix.length).trim());
  } catch {
    return null;
  }
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
  console.log(JSON.stringify({
    ACCOUNT_ID_AVAILABLE: Boolean(account.value),
    ACCOUNT_ID_SAFE: maskAccountId(account.value),
    AUTH_TOKEN_AVAILABLE: Boolean(auth?.auth),
    AUTH_SOURCE: auth?.source ?? "UNAVAILABLE",
    MODEL,
    REAL_PROVIDER_CALL_LIMIT: MAX_CALLS,
    REST_PREFLIGHT_THIS_ROUND: "NOT_RUN_BY_POLICY",
  }));
  if (!account.value || !auth?.auth) {
    fail("REST_AUTH_BLOCKED");
    return;
  }

  const ledgerPath = process.env.AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_LEDGER_PATH || defaultLedgerPath;
  const existing = await readLedgerRecords(ledgerPath);
  if (existing.invalidLineCount > 0) {
    fail("MICRO_LEDGER_CORRUPT");
    return;
  }
  if (existing.records.length > 0) {
    fail("MICRO_LEDGER_NOT_EMPTY");
    return;
  }

  const matrixRunId = randomUUID();
  await appendLedgerRecord(ledgerPath, {
    recordType: "PROCESS_STARTED",
    matrixRunId,
    timestamp: new Date().toISOString(),
  });

  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + account.value + "/ai/run/" + MODEL;
  const child = spawn(
    "./node_modules/.bin/vitest",
    ["run", childTestFile, "--reporter=dot"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_REAL_MODEL: "1",
        AMBIENT_SEMANTIC_EVAL_REST_URL: endpoint,
        AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_LEDGER_PATH: ledgerPath,
        AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_MATRIX_RUN_ID: matrixRunId,
        AMBIENT_SEMANTIC_EVAL_SCHEMA_MICRO_SINGLE_D05: singleD05 ? "1" : "0",
      }),
    },
  );
  let stdout = "";
  let stderrNonempty = false;
  child.stdout?.on("data", (chunk) => {
    stdout = (stdout + String(chunk)).slice(-2_000_000);
  });
  child.stderr?.on("data", () => { stderrNonempty = true; });
  const processResult = await new Promise((resolve) => {
    let settled = false;
    child.once("error", () => {
      if (settled) return;
      settled = true;
      resolve({ code: null, signal: null });
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal });
    });
  });

  try {
    await appendLedgerRecord(ledgerPath, {
      recordType: "PROCESS_EXITED",
      matrixRunId,
      timestamp: new Date().toISOString(),
      exitCode: processResult.code,
      signal: processResult.signal,
      markerSeen: stdout.includes(markerPrefix),
      stderrClass: stderrNonempty ? "NONEMPTY" : "EMPTY",
    });
    let records = (await readLedgerRecords(ledgerPath)).records;
    const scoped = records.filter((record) => record.matrixRunId === matrixRunId);
    const terminalIds = new Set(scoped.filter(isTerminal).map((record) => record.attemptId));
    const orphans = scoped.filter((record) => isStart(record) && !terminalIds.has(record.attemptId));
    for (const orphan of orphans) {
      await appendLedgerRecord(ledgerPath, {
        recordType: "ATTEMPT_UNKNOWN_TERMINATION",
        matrixRunId,
        attemptId: orphan.attemptId,
        caseId: orphan.caseId,
        runIndex: orphan.runIndex,
        completedAt: new Date().toISOString(),
        transportStatus: "unknown",
        httpStatus: null,
        cloudflareSuccess: null,
        providerResponseConfirmed: null,
        jsonStatus: "unknown",
        normalizationStatus: "unknown",
        validationStatus: "unknown",
        overallPass: null,
        failureClass: "PROCESS_ABNORMAL_EXIT",
        cloudflareErrorCode: null,
        safeMetrics: null,
        processExitCode: processResult.code,
        signal: processResult.signal,
      });
    }
    records = (await readLedgerRecords(ledgerPath)).records;
    const marker = markerFromOutput(stdout);
    const reconstructed = reconstruct(
      records,
      matrixRunId,
      processResult,
      Boolean(marker),
    );
    const reconstructedReports = safeReportsFromLedger(reconstructed);
    const fallbackStopState = fallbackStop(reconstructed);
    const ledgerComplete = reconstructed.providerAttemptCount > 0
      && reconstructed.orphanAttemptCount === 0
      && reconstructed.terminalAttemptCount === reconstructed.providerAttemptCount;
    console.log("REAL_MODEL_SCHEMA_MICRO_REPORT=" + JSON.stringify({
      ...reconstructed,
      stopAfterCall: marker?.stopAfterCall ?? fallbackStopState.stopAfterCall,
      stopReason: marker?.stopReason ?? fallbackStopState.stopReason,
      reports: marker?.safeReports ?? reconstructedReports,
    }));
    if (processResult.code !== 0 || (!marker && !ledgerComplete)) process.exitCode = 2;
  } catch {
    console.error("TELEMETRY_DURABILITY=FAIL");
    process.exitCode = 2;
  }
}

await run();
