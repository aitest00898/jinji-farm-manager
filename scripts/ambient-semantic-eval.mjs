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
const REAL_MODEL_CALL_LIMIT = 9;
const args = process.argv.slice(2);
const realModel = args.includes("--real-model") || process.env.AMBIENT_SEMANTIC_EVAL_REAL_MODEL === "1";
const runsIndex = args.indexOf("--runs");
const runs = runsIndex >= 0 ? Number(args[runsIndex + 1]) : 1;
const projectRoot = process.cwd();
const defaultLedgerPath = join(projectRoot, "forensics", "runtime", "ambient-semantic-eval-attempts-2026-08-27.jsonl");

function fail(code) {
  console.error(code);
  process.exitCode = 2;
}

function maskAccountId(value) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : null;
}

function safeClass(value, fallback = "UNKNOWN") {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,80}$/u.test(value) ? value : fallback;
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
    throw new Error("TELEMETRY_LEDGER_READ_FAILURE");
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

function orphanStarts(records) {
  const terminalIds = new Set(records.filter(isTerminal).map((record) => record.attemptId));
  return records.filter((record) => isStart(record) && !terminalIds.has(record.attemptId));
}

function reconstruct(records, matrixRunId, processExit) {
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
  const orphan = attempts.filter((attempt) => attempt.terminalStatus === "ORPHAN");
  const terminals = attempts.filter((attempt) => attempt.terminalStatus !== "ORPHAN");
  const processStarted = scoped.some((record) => record.recordType === "PROCESS_STARTED");
  const processStatus = !processStarted
    ? "not_started"
    : processExit && (processExit.signal || processExit.exitCode !== 0)
      ? "abnormal_exit"
      : processExit
        ? "completed"
        : "running";
  const caseIds = [...new Set(starts.map((start) => start.caseId))];
  const caseSummaries = caseIds.map((caseId) => {
    const caseAttempts = attempts.filter((attempt) => attempt.caseId === caseId);
    const caseTerminals = caseAttempts.filter((attempt) => attempt.terminalStatus !== "ORPHAN");
    return {
      caseId,
      attempts: caseAttempts.length,
      terminalAttempts: caseTerminals.length,
      providerResponses: caseTerminals.filter((attempt) => attempt.providerResponseConfirmed === true).length,
      technicalFailures: caseTerminals.filter((attempt) => attempt.transportStatus === "failure").length,
      semanticPasses: caseTerminals.filter((attempt) => attempt.safeMetrics?.overallPass === true).length,
      semanticEvaluable: caseTerminals.filter((attempt) => attempt.providerResponseConfirmed === true && attempt.safeMetrics?.jsonPass === true).length,
      lastRunIndex: Math.max(...caseAttempts.map((attempt) => attempt.runIndex), 0),
    };
  });
  const status = orphan.length > 0
    ? "orphaned"
    : starts.length === 0
      ? "not_started"
      : starts.length === REAL_MODEL_CALL_LIMIT && terminals.length === REAL_MODEL_CALL_LIMIT && processStatus === "completed"
        ? "completed"
        : "incomplete";
  return {
    matrixRunId,
    processStatus,
    providerAttemptCount: starts.length,
    providerSuccessCount: terminals.filter((attempt) => attempt.providerResponseConfirmed === true).length,
    providerFailureCount: terminals.filter((attempt) => attempt.transportStatus === "failure").length,
    terminalAttemptCount: terminals.length,
    orphanAttemptCount: orphan.length,
    orphanAttemptIds: starts.filter((start) => !terminalByAttempt.has(start.attemptId)).map((start) => start.attemptId),
    attempts,
    caseSummaries,
    hardLimitRemaining: Math.max(0, REAL_MODEL_CALL_LIMIT - starts.length),
    overallRunnerStatus: status,
  };
}

function markerFromOutput(output) {
  const prefix = "REAL_MODEL_MATRIX_SAFE_JSON=";
  const start = output.indexOf(prefix);
  if (start < 0) return null;
  const json = output.slice(start + prefix.length).trim();
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function runFixtureMode() {
  const child = spawn(
    "./node_modules/.bin/vitest",
    ["run", "src/ambient-semantic-eval.test.ts", "--reporter=verbose"],
    {
      stdio: "inherit",
      cwd: projectRoot,
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_SEMANTIC_EVAL_REAL_MODEL: "0",
        AMBIENT_SEMANTIC_EVAL_REPORT: "1",
        AMBIENT_SEMANTIC_EVAL_RUNS: String(runs),
      }),
    },
  );
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

let activeMatrix = null;
let fatalInProgress = false;

function installFatalHandlers() {
  const handler = (kind, error) => {
    if (fatalInProgress || !activeMatrix) return;
    fatalInProgress = true;
    const fatalClass = safeClass(error?.name, kind === "uncaughtException" ? "UNCAUGHT_EXCEPTION" : "UNHANDLED_REJECTION");
    void (async () => {
      try {
        await appendLedgerRecord(activeMatrix.ledgerPath, {
          recordType: "PROCESS_FATAL",
          matrixRunId: activeMatrix.matrixRunId,
          timestamp: new Date().toISOString(),
          fatalClass,
        });
        const { records } = await readLedgerRecords(activeMatrix.ledgerPath);
        console.log(`AMBIENT_SEMANTIC_EVAL_REPORT=${JSON.stringify(reconstruct(records, activeMatrix.matrixRunId, { exitCode: 2, signal: null }))}`);
      } catch {
        console.error("TELEMETRY_DURABILITY=FAIL");
      } finally {
        process.exit(2);
      }
    })();
  };
  process.on("uncaughtException", (error) => handler("uncaughtException", error));
  process.on("unhandledRejection", (error) => handler("unhandledRejection", error));
}

async function runRealMode() {
  if (runs !== 3) {
    fail("REAL_MODEL_RUN_SHAPE_REQUIRED");
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
    WORKERS_AI_PERMISSION_VERIFIED: "YES_PREVIOUS_DIRECT_REST_PREFLIGHT",
    REST_PREFLIGHT_THIS_ROUND: "NOT_RUN_BY_POLICY",
  }));
  if (!account.value || !auth?.auth) {
    fail("REST_AUTH_BLOCKED");
    return;
  }

  const matrixRunId = randomUUID();
  const ledgerPath = process.env.AMBIENT_SEMANTIC_EVAL_LEDGER_PATH || defaultLedgerPath;
  activeMatrix = { matrixRunId, ledgerPath };
  installFatalHandlers();

  let existing;
  try {
    existing = await readLedgerRecords(ledgerPath);
  } catch {
    fail("TELEMETRY_LEDGER_READ_FAILURE");
    activeMatrix = null;
    return;
  }
  if (existing.invalidLineCount > 0) {
    fail("TELEMETRY_LEDGER_CORRUPT");
    activeMatrix = null;
    return;
  }
  const previousOrphans = orphanStarts(existing.records);
  if (previousOrphans.length > 0) {
    console.log(JSON.stringify({
      MATRIX_RUN_ID_SAFE: matrixRunId,
      REAL_MATRIX_ABORTED: true,
      PREVIOUS_ORPHAN_ATTEMPTS: previousOrphans.length,
      PROVIDER_ATTEMPT_COUNT: 0,
      TOTAL_PROVIDER_CALL_LIMIT: REAL_MODEL_CALL_LIMIT,
    }));
    fail("PREVIOUS_ORPHAN_ATTEMPT_REQUIRES_REVIEW");
    activeMatrix = null;
    return;
  }

  try {
    await appendLedgerRecord(ledgerPath, {
      recordType: "PROCESS_STARTED",
      matrixRunId,
      timestamp: new Date().toISOString(),
    });
  } catch {
    fail("TELEMETRY_DURABILITY_FAILURE");
    activeMatrix = null;
    return;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.value}/ai/run/${MODEL}`;
  const runner = spawn(
    "./node_modules/.bin/vitest",
    ["run", "src/ambient-semantic-eval-real-runner.test.ts", "--reporter=dot"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSafeAmbientChildEnvironment({
        AMBIENT_SEMANTIC_EVAL_REAL_MODEL: "1",
        AMBIENT_SEMANTIC_EVAL_REAL_URL: endpoint,
        AMBIENT_SEMANTIC_EVAL_REST_URL: endpoint,
        AMBIENT_SEMANTIC_EVAL_LEDGER_PATH: ledgerPath,
        AMBIENT_SEMANTIC_EVAL_MATRIX_RUN_ID: matrixRunId,
      }),
    },
  );
  let stdoutForMarker = "";
  let stderrNonempty = false;
  runner.stdout?.on("data", (chunk) => {
    stdoutForMarker = `${stdoutForMarker}${String(chunk)}`.slice(-2_000_000);
  });
  runner.stderr?.on("data", () => { stderrNonempty = true; });

  const result = await new Promise((resolve) => {
    let settled = false;
    runner.once("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ code: null, signal: null, spawnErrorClass: safeClass(error?.name, "CHILD_PROCESS_ERROR") });
    });
    runner.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal, spawnErrorClass: null });
    });
  });

  let records;
  try {
    await appendLedgerRecord(ledgerPath, {
      recordType: "PROCESS_EXITED",
      matrixRunId,
      timestamp: new Date().toISOString(),
      exitCode: result.code,
      signal: result.signal,
      markerSeen: stdoutForMarker.includes("REAL_MODEL_MATRIX_SAFE_JSON="),
      stderrClass: stderrNonempty ? "NONEMPTY" : "EMPTY",
    });
    records = (await readLedgerRecords(ledgerPath)).records;
    const matrixRecords = records.filter((record) => record.matrixRunId === matrixRunId);
    const orphanedAttempts = orphanStarts(matrixRecords);
    for (const orphan of orphanedAttempts) {
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
        processExitCode: result.code,
        signal: result.signal,
      });
    }
    if (orphanedAttempts.length > 0) records = (await readLedgerRecords(ledgerPath)).records;
  } catch {
    console.error("TELEMETRY_DURABILITY=FAIL");
    process.exitCode = 2;
    activeMatrix = null;
    return;
  }
  const reconstructed = reconstruct(records, matrixRunId, result);
  const marker = markerFromOutput(stdoutForMarker);
  console.log(`MATRIX_RUN_ID_SAFE=${matrixRunId}`);
  console.log(`DIRECT_REST_TRANSPORT=PASS_PREVIOUSLY_VERIFIED_NO_PREFLIGHT_THIS_ROUND`);
  console.log(`AMBIENT_SEMANTIC_EVAL_REPORT=${JSON.stringify(reconstructed)}`);
  if (marker) console.log(`REAL_MODEL_MATRIX_SAFE_JSON=${JSON.stringify(marker)}`);
  if (result.spawnErrorClass) console.log(`RUNNER_PROCESS_ERROR_CLASS=${result.spawnErrorClass}`);
  if (reconstructed.overallRunnerStatus !== "completed" || reconstructed.providerAttemptCount !== REAL_MODEL_CALL_LIMIT) {
    process.exitCode = 2;
  }
  activeMatrix = null;
}

if (!Number.isInteger(runs) || runs < 1 || runs > (realModel ? 3 : 10)) {
  fail(realModel ? "REAL_MODEL_RUN_SHAPE_REQUIRED" : "RUN_COUNT_OUT_OF_BOUNDS");
} else if (!realModel) {
  await runFixtureMode();
} else {
  await runRealMode();
}
