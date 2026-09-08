import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BENCHMARK_VERSION_V2,
  FULL_TAXONOMY_LIVE_AB_V2_CASES,
  FULL_TAXONOMY_LIVE_AB_V2_MODELS,
  aggregateFullTaxonomyV2Evaluations,
  buildFullTaxonomyV2AiRequest,
  evaluateFullTaxonomyV2Case,
  fullTaxonomyV2FingerprintMaterials,
  runFullTaxonomyV2LocalGate,
  validateFullTaxonomyV2Fixture,
} from "../src/full-taxonomy-live-ab-v2.ts";
import {
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const MAX_CONCURRENT_AI_CALLS = 1;
const RETRIES = 0;
const MAX_TOTAL_PROVIDER_CALLS = 60;
const CANARY_CASE_IDS = Object.freeze([
  "E04-mortality",
  "A01-vaccination",
  "O01-cough",
  "M01-mortality-missing-quantity",
  "C01-mortality-and-cough",
  "N01-question",
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fingerprints() {
  const materials = fullTaxonomyV2FingerprintMaterials();
  return {
    V2_CASE_SET_HASH: sha256(materials.caseSet),
    V2_PROMPT_HASH: sha256(materials.prompt),
    V2_SCHEMA_HASH: sha256(materials.schema),
    V2_EVALUATOR_HASH: sha256(materials.evaluator),
    V2_HARNESS_HASH: sha256(materials.harness),
  };
}

function sourceSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf("--report-path");
  return {
    live: args.includes("--live"),
    dryRun: args.includes("--dry-run"),
    reportPath: reportIndex >= 0 ? args[reportIndex + 1] : null,
  };
}

function fail(code) {
  console.log(JSON.stringify({
    TASK_RESULT: "FAIL",
    FAILURE: code,
    REAL_WORKERS_AI_CALLS: 0,
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    WORKER_DEPLOYMENT: "NOT_DONE",
    PAGES_DEPLOYMENT: "NOT_DONE",
  }));
  process.exitCode = 2;
}

function safeProviderCode(errors) {
  if (!Array.isArray(errors)) return null;
  const value = errors[0]?.code;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const code = String(value);
  return /^[A-Za-z0-9_.:-]{1,40}$/u.test(code) ? code : null;
}

function safeProviderClass(status, errors) {
  const message = Array.isArray(errors) && typeof errors[0]?.message === "string"
    ? errors[0].message.toLowerCase()
    : "";
  if (/(?:json mode|response_format|json_schema)/u.test(message)) return "PROVIDER_JSON_MODE_ERROR";
  if (status === 401 || status === 403 || /(?:unauthori[sz]ed|forbidden|api token|permission|authentication)/u.test(message)) return "AUTH_FAILURE";
  if (status === 404 || /(?:model|not found|unknown model)/u.test(message)) return "MODEL_NOT_FOUND_OR_NOT_ALLOWED";
  if (/(?:terms|required terms|accept.*terms)/u.test(message)) return "MODEL_TERMS_REQUIRED";
  if (/(?:paid plan|billing)/u.test(message)) return "PAID_PLAN_REQUIRED";
  if (/(?:quota|rate limit|too many requests|exhausted)/u.test(message)) return "FREE_QUOTA_EXHAUSTED";
  if (status !== null && status >= 500) return "CAPACITY_OR_PROVIDER_ERROR";
  if (status !== null && status >= 400) return "INVALID_REQUEST";
  return null;
}

function hasResult(envelope) {
  return envelope && typeof envelope === "object"
    && Object.prototype.hasOwnProperty.call(envelope, "result")
    && envelope.result !== null
    && envelope.result !== undefined;
}

function safeTransportError(error) {
  const name = typeof error?.name === "string" ? error.name : "UNKNOWN";
  const code = typeof error?.code === "string" ? error.code : null;
  if (name === "AbortError") return { errorCode: code, errorClass: "PROVIDER_TIMEOUT" };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { errorCode: code, errorClass: "NETWORK_DNS_FAILURE" };
  if (code === "ECONNREFUSED") return { errorCode: code, errorClass: "NETWORK_CONNECTION_REFUSED" };
  if (code === "ECONNRESET") return { errorCode: code, errorClass: "NETWORK_CONNECTION_RESET" };
  if (code === "ETIMEDOUT") return { errorCode: code, errorClass: "NETWORK_TIMEOUT" };
  return { errorCode: code, errorClass: "NETWORK_FAILURE" };
}

async function callWorkersAi(endpoint, request, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const safe = safeTransportError(error);
    return {
      httpStatus: null,
      providerResponseConfirmed: false,
      errorCode: safe.errorCode,
      errorClass: safe.errorClass,
    };
  }
  clearTimeout(timeout);

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    return {
      httpStatus: response.status,
      providerResponseConfirmed: false,
      errorCode: null,
      errorClass: "NON_JSON_PROVIDER_RESPONSE",
    };
  }
  const confirmed = response.ok && envelope?.success === true && hasResult(envelope);
  if (confirmed) {
    return {
      httpStatus: response.status,
      providerResponseConfirmed: true,
      providerResult: envelope.result,
      errorCode: null,
      errorClass: null,
    };
  }
  return {
    httpStatus: response.status,
    providerResponseConfirmed: false,
    errorCode: safeProviderCode(envelope?.errors),
    errorClass: safeProviderClass(response.status, envelope?.errors) ?? "PROVIDER_RESPONSE_INVALID",
  };
}

function canaryCases() {
  return CANARY_CASE_IDS.map((caseId) => FULL_TAXONOMY_LIVE_AB_V2_CASES.find((item) => item.caseId === caseId));
}

function remainingCases() {
  const canary = new Set(CANARY_CASE_IDS);
  return FULL_TAXONOMY_LIVE_AB_V2_CASES.filter((item) => !canary.has(item.caseId));
}

async function runCases({ model, cases, token, budget }) {
  const evaluations = [];
  let providerBoundary = null;
  for (const item of cases) {
    if (budget.calls >= MAX_TOTAL_PROVIDER_CALLS) {
      providerBoundary = "TOTAL_PROVIDER_CALL_LIMIT_REACHED";
      break;
    }
    const request = buildFullTaxonomyV2AiRequest(item);
    budget.calls += 1;
    const transport = await callWorkersAi(
      `https://api.cloudflare.com/client/v4/accounts/${budget.accountId}/ai/run/${model}`,
      request,
      token,
    );
    const evaluation = evaluateFullTaxonomyV2Case(item, model, transport);
    evaluations.push(evaluation);
    if (!transport.providerResponseConfirmed) {
      providerBoundary = transport.errorClass ?? "PROVIDER_RESPONSE_INVALID";
      break;
    }
  }
  return {
    evaluations,
    providerBoundary,
    completed: providerBoundary === null && evaluations.length === cases.length,
  };
}

function schemaPassSummary(evaluations) {
  if (!evaluations.length) return "NOT_RUN";
  const passed = evaluations.filter((item) => item.schemaValidationPass).length;
  return `${passed}/${evaluations.length}`;
}

function metricsOrNotRun(evaluations) {
  return evaluations.length ? aggregateFullTaxonomyV2Evaluations(evaluations) : "NOT_RUN";
}

function safeCaseSummary(evaluations) {
  return evaluations.map((item) => ({
    caseId: item.caseId,
    httpStatus: item.httpStatus,
    providerResponseConfirmed: item.providerResponseConfirmed,
    providerErrorCode: item.providerErrorCode,
    providerErrorClass: item.providerErrorClass,
    jsonParsed: item.jsonParsed,
    schemaValidationPass: item.schemaValidationPass,
    strictValidationErrorCode: item.strictValidationErrorCode,
    strictExact: item.strictExact,
    semanticExact: item.semanticExact,
    diagnosticStructuralFailures: item.diagnosticStructuralFailures,
    actualFactCount: item.actualFactCount,
    taxonomyCorrectCount: item.taxonomyCorrectCount,
    fieldCorrectCount: item.fieldCorrectCount,
    unsafeFieldInvention: item.unsafeFieldInvention,
    questionAsFactError: item.questionAsFactError,
    hypotheticalAsFactError: item.hypotheticalAsFactError,
    negationAsFactError: item.negationAsFactError,
    correctionAsNewEventError: item.correctionAsNewEventError,
  }));
}

function buildReport({ source, hashes, localGate, auth, account, budget, canary3, canary8, full3, full8, taskResult, blocker }) {
  const evaluations3 = [...canary3.evaluations, ...full3.evaluations];
  const evaluations8 = [...canary8.evaluations, ...full8.evaluations];
  const fullRun = full3.completed && full8.completed && evaluations3.length === 30 && evaluations8.length === 30;
  return {
    TASK_RESULT: taskResult,
    BENCHMARK_VERSION: BENCHMARK_VERSION_V2,
    BENCHMARK_CASES: FULL_TAXONOMY_LIVE_AB_V2_CASES.length,
    SOURCE_SHA_BEFORE_LIVE_RUN: source,
    ...hashes,
    V1_IMMUTABLE: "YES",
    V1_CASES_AND_GROUND_TRUTH_REUSED: "YES",
    PROMPT_CHANGED_FROM_V1: "NO",
    STRUCTURED_OUTPUT_ONLY_VARIABLE: "YES",
    RESPONSE_FORMAT: "json_schema",
    MAX_CONCURRENT_AI_CALLS,
    RETRIES,
    CANARY_CASE_IDS,
    CANARY_CASE_COUNT_PER_MODEL: 6,
    CANARY_3B_SCHEMA_PASS: schemaPassSummary(canary3.evaluations),
    CANARY_8B_SCHEMA_PASS: schemaPassSummary(canary8.evaluations),
    CANARY_3B_PROVIDER_BOUNDARY: canary3.providerBoundary,
    CANARY_8B_PROVIDER_BOUNDARY: canary8.providerBoundary,
    CANARY_THRESHOLD: "5/6",
    FULL_V2_AB_RUN: fullRun ? "COMPLETED_30_CASES_PER_MODEL" : "NOT_COMPLETED",
    FULL_3B_CASES: evaluations3.length,
    FULL_8B_CASES: evaluations8.length,
    FULL_3B_METRICS: metricsOrNotRun(evaluations3),
    FULL_8B_METRICS: metricsOrNotRun(evaluations8),
    CANARY_3B_CASE_SUMMARY: safeCaseSummary(canary3.evaluations),
    CANARY_8B_CASE_SUMMARY: safeCaseSummary(canary8.evaluations),
    FULL_3B_PROVIDER_BOUNDARY: full3.providerBoundary,
    FULL_8B_PROVIDER_BOUNDARY: full8.providerBoundary,
    AUTH_SOURCE: auth?.source ?? "NOT_RESOLVED",
    ACCOUNT_RESOLUTION: account?.source ?? "NOT_RESOLVED",
    PROVIDER_ENDPOINT_FORM: "raw_slash_separated_model_path",
    LOCAL_GATE: localGate,
    REAL_WORKERS_AI_CALLS: budget.calls,
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    AI_REPORT_WRITES: 0,
    LINE_SEND: 0,
    QUEUE_WRITES: 0,
    CRON_CHANGED: "NO",
    MIGRATION: "NONE",
    PRODUCTION_MODEL_CHANGED: "NO",
    PRODUCTION_DEPLOYED: "NO",
    MODEL_3B: FULL_TAXONOMY_LIVE_AB_V2_MODELS[0],
    MODEL_8B: FULL_TAXONOMY_LIVE_AB_V2_MODELS[1],
    BLOCKER: blocker,
  };
}

async function runLive(reportPath) {
  const fixture = validateFullTaxonomyV2Fixture();
  if (!fixture.valid) return fail(`BENCHMARK_FIXTURE_INVALID:${fixture.errors.join(",")}`);
  const localGate = runFullTaxonomyV2LocalGate();
  if (Object.values(localGate).some((value) => value !== "PASS")) return fail("LOCAL_GATE_FAILED");

  const authDiscovery = discoverAmbientSemanticEvalAuth({ projectRoot: PROJECT_ROOT });
  if (!authDiscovery.auth?.token) return fail(`AUTH_UNAVAILABLE:${authDiscovery.failure ?? "UNKNOWN"}`);
  const accountDiscovery = await discoverAmbientSemanticEvalAccountId({
    projectRoot: PROJECT_ROOT,
    auth: authDiscovery.auth,
  });
  if (!accountDiscovery.value) return fail(`ACCOUNT_UNAVAILABLE:${accountDiscovery.failure ?? "UNKNOWN"}`);

  const budget = { calls: 0, accountId: accountDiscovery.value };
  const canary = canaryCases();
  const rest = remainingCases();
  const canary3 = await runCases({ model: FULL_TAXONOMY_LIVE_AB_V2_MODELS[0], cases: canary, token: authDiscovery.auth.token, budget });
  let canary8 = { evaluations: [], providerBoundary: null, completed: false };
  let full3 = { evaluations: [], providerBoundary: null, completed: false };
  let full8 = { evaluations: [], providerBoundary: null, completed: false };
  let blocker = canary3.providerBoundary;

  if (!blocker) {
    canary8 = await runCases({ model: FULL_TAXONOMY_LIVE_AB_V2_MODELS[1], cases: canary, token: authDiscovery.auth.token, budget });
    blocker = canary8.providerBoundary;
  }

  const canary3Pass = canary3.evaluations.length === 6 && canary3.evaluations.filter((item) => item.schemaValidationPass).length >= 5;
  const canary8Pass = canary8.evaluations.length === 6 && canary8.evaluations.filter((item) => item.schemaValidationPass).length >= 5;
  if (!blocker && canary3Pass && canary8Pass) {
    full3 = await runCases({ model: FULL_TAXONOMY_LIVE_AB_V2_MODELS[0], cases: rest, token: authDiscovery.auth.token, budget });
    if (!full3.providerBoundary) {
      full8 = await runCases({ model: FULL_TAXONOMY_LIVE_AB_V2_MODELS[1], cases: rest, token: authDiscovery.auth.token, budget });
    }
    blocker = full3.providerBoundary ?? full8.providerBoundary;
  } else if (!blocker) {
    blocker = "CANARY_SCHEMA_THRESHOLD_NOT_MET";
  }

  const report = buildReport({
    source: sourceSha(),
    hashes: fingerprints(),
    localGate,
    auth: authDiscovery,
    account: accountDiscovery,
    budget,
    canary3,
    canary8,
    full3,
    full8,
    taskResult: blocker ? "FAIL" : "PASS",
    blocker: blocker ?? "NONE",
  });
  if (reportPath) writeFileSync(resolve(PROJECT_ROOT, reportPath), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
}

async function main() {
  const args = parseArgs();
  const fixture = validateFullTaxonomyV2Fixture();
  const localGate = runFullTaxonomyV2LocalGate();
  const dryReport = {
    TASK_RESULT: fixture.valid && Object.values(localGate).every((value) => value === "PASS") ? "DRY_RUN_PASS" : "DRY_RUN_FAIL",
    BENCHMARK_VERSION: BENCHMARK_VERSION_V2,
    BENCHMARK_CASES: FULL_TAXONOMY_LIVE_AB_V2_CASES.length,
    V1_IMMUTABLE: "YES",
    V1_CASES_AND_GROUND_TRUTH_REUSED: "YES",
    ...fingerprints(),
    LOCAL_GATE: localGate,
    REAL_WORKERS_AI_CALLS: 0,
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    PRODUCTION_DEPLOYED: "NO",
    WORKER_DEPLOYMENT: "NOT_DONE",
    PAGES_DEPLOYMENT: "NOT_DONE",
  };
  if (args.dryRun || !args.live) {
    console.log(JSON.stringify(dryReport));
    return;
  }
  await runLive(args.reportPath);
}

await main();
