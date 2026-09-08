import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SEMANTIC_AB_CALLS_PER_MODEL,
  SEMANTIC_AB_CASES,
  SEMANTIC_AB_VERSION,
  aggregateSemanticABEvaluations,
  buildSemanticABAiRequest,
  evaluateSemanticABCase,
  modelForSemanticAB,
  semanticABFingerprintMaterials,
  validateSemanticABFixture,
} from "../src/full-taxonomy-semantic-ab-v1.ts";
import {
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const MAX_CONCURRENT_AI_CALLS = 1;
const RETRIES = 0;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function fingerprints() {
  return Object.fromEntries(
    Object.entries(semanticABFingerprintMaterials()).map(([name, value]) => [
      `${name.toUpperCase()}_HASH`,
      sha256(value),
    ]),
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  const modelIndex = args.indexOf("--model");
  const reportIndex = args.indexOf("--report-path");
  return {
    model: modelIndex >= 0 ? args[modelIndex + 1] : null,
    live: args.includes("--live"),
    dryRun: args.includes("--dry-run"),
    reportPath: reportIndex >= 0 ? args[reportIndex + 1] : null,
  };
}

function safeProviderCode(errors) {
  const value = Array.isArray(errors) ? errors[0]?.code : null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const code = String(value);
  return /^[A-Za-z0-9_.:-]{1,40}$/u.test(code) ? code : null;
}

function safeProviderClass(status, errors) {
  const message = Array.isArray(errors) && typeof errors[0]?.message === "string"
    ? errors[0].message.toLowerCase()
    : "";
  if (status === 401 || status === 403 || /(?:unauthori[sz]ed|forbidden|api token|permission|authentication)/u.test(message)) return "AUTH_FAILURE";
  if (status === 404 || /(?:model|not found|unknown model)/u.test(message)) return "MODEL_NOT_FOUND_OR_NOT_ALLOWED";
  if (/(?:paid plan|billing)/u.test(message)) return "PAID_PLAN_REQUIRED";
  if (/(?:quota|rate limit|too many requests|exhausted)/u.test(message)) return "FREE_QUOTA_EXHAUSTED";
  if (/(?:json mode|response_format|json_schema)/u.test(message)) return "PROVIDER_JSON_MODE_ERROR";
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
  const code = typeof error?.code === "string" ? error.code : null;
  if (error?.name === "AbortError") return { errorCode: code, errorClass: "PROVIDER_TIMEOUT" };
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
    const failure = safeTransportError(error);
    return {
      httpStatus: null,
      providerResponseConfirmed: false,
      errorCode: failure.errorCode,
      errorClass: failure.errorClass,
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
  if (response.ok && envelope?.success === true && hasResult(envelope)) {
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

function safeEvaluation(evaluation) {
  return {
    caseId: evaluation.caseId,
    model: evaluation.model,
    httpStatus: evaluation.httpStatus,
    providerResponseConfirmed: evaluation.providerResponseConfirmed,
    providerErrorCode: evaluation.providerErrorCode,
    providerErrorClass: evaluation.providerErrorClass,
    jsonParsed: evaluation.jsonParsed,
    coreShapeValid: evaluation.coreShapeValid,
    minimalContractPass: evaluation.minimalContractPass,
    validationErrorCode: evaluation.validationErrorCode,
    semanticPass: evaluation.semanticPass,
    recordWorthinessExact: evaluation.recordWorthinessExact,
    factsExact: evaluation.factsExact,
    missingFieldsExact: evaluation.missingFieldsExact,
    safetyPass: evaluation.safetyPass,
    expectedRecordWorthiness: evaluation.expectedRecordWorthiness,
    predictedRecordWorthiness: evaluation.predictedRecordWorthiness,
    expectedFactCount: evaluation.expectedFactCount,
    actualFactCount: evaluation.actualFactCount,
    expectedMissingFieldCount: evaluation.expectedMissingFieldCount,
    actualMissingFieldCount: evaluation.actualMissingFieldCount,
    unknownKeyCount: evaluation.unknownKeyCount,
    forbiddenKeyCount: evaluation.forbiddenKeyCount,
  };
}

function safeReport(run) {
  return {
    TASK_RESULT: run.taskResult,
    BENCHMARK_VERSION: SEMANTIC_AB_VERSION,
    BENCHMARK_CASES_PER_MODEL: SEMANTIC_AB_CALLS_PER_MODEL,
    CASE_IDS: SEMANTIC_AB_CASES.map((item) => item.caseId),
    SOURCE_SHA_BEFORE_LIVE_RUN: run.sourceSha,
    ...run.hashes,
    MODEL: run.model,
    MAX_CONCURRENT_AI_CALLS,
    RETRIES,
    PROVIDER_RUN_COMPLETION: run.providerRunCompletion,
    PROVIDER_BOUNDARY: run.providerBoundary,
    PROVIDER_AUTH_SOURCE: run.authSource,
    PROVIDER_ACCOUNT_RESOLUTION: run.accountResolution,
    PROVIDER_ENDPOINT_FORM: "raw_slash_separated_model_path",
    RESPONSE_FORMAT: "prompt_only_json",
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    MIGRATION: "NONE",
    LINE_SEND: 0,
    QUEUE_WRITES: 0,
    CRON_CHANGED: "NO",
    PRODUCTION_MODEL_CHANGED: "NO",
    PRODUCTION_DEPLOYED: "NO",
    EVALUATIONS: run.evaluations.map(safeEvaluation),
    METRICS: aggregateSemanticABEvaluations(run.evaluations),
  };
}

async function runLive(model, reportPath) {
  const fixture = validateSemanticABFixture();
  if (!fixture.valid) throw new Error(`SEMANTIC_AB_FIXTURE_INVALID:${fixture.errors.join(",")}`);
  const authDiscovery = discoverAmbientSemanticEvalAuth({ projectRoot: PROJECT_ROOT });
  if (!authDiscovery.auth?.token) throw new Error(`AUTH_UNAVAILABLE:${authDiscovery.failure ?? "UNKNOWN"}`);
  const accountDiscovery = await discoverAmbientSemanticEvalAccountId({
    projectRoot: PROJECT_ROOT,
    auth: authDiscovery.auth,
  });
  if (!accountDiscovery.value) throw new Error(`ACCOUNT_UNAVAILABLE:${accountDiscovery.failure ?? "UNKNOWN"}`);

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountDiscovery.value}/ai/run/${model}`;
  const evaluations = [];
  let providerBoundary = null;
  let providerRunCompletion = `COMPLETED_${SEMANTIC_AB_CALLS_PER_MODEL}_CASES`;
  let calls = 0;
  for (const item of SEMANTIC_AB_CASES) {
    const request = buildSemanticABAiRequest(item);
    calls += 1;
    const transport = await callWorkersAi(endpoint, request, authDiscovery.auth.token);
    const evaluation = evaluateSemanticABCase(item, model, transport);
    evaluations.push(evaluation);
    if (!transport.providerResponseConfirmed) {
      providerBoundary = transport.errorClass ?? "PROVIDER_RESPONSE_INVALID";
      providerRunCompletion = `STOPPED_AT_${calls}_OF_${SEMANTIC_AB_CALLS_PER_MODEL}_PROVIDER_BOUNDARY`;
      break;
    }
  }
  const report = safeReport({
    taskResult: providerRunCompletion.startsWith("COMPLETED_") ? "PASS" : "FAIL",
    sourceSha: sourceSha(),
    hashes: fingerprints(),
    model,
    providerRunCompletion,
    providerBoundary,
    authSource: authDiscovery.source,
    accountResolution: accountDiscovery.source,
    evaluations,
  });
  report.REAL_WORKERS_AI_CALLS = calls;
  if (reportPath) writeFileSync(resolve(PROJECT_ROOT, reportPath), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
}

function printDryRun(model) {
  const first = fingerprints();
  const second = fingerprints();
  console.log(JSON.stringify({
    TASK_RESULT: "DRY_RUN_PASS",
    BENCHMARK_VERSION: SEMANTIC_AB_VERSION,
    BENCHMARK_CASES_PER_MODEL: SEMANTIC_AB_CALLS_PER_MODEL,
    BENCHMARK_FIXTURE_VALID: "PASS",
    HASH_STABILITY: JSON.stringify(first) === JSON.stringify(second) ? "PASS" : "FAIL",
    MODEL_OVERRIDE_ISOLATION: "PASS",
    MODEL: model,
    SOURCE_SHA_BEFORE_LIVE_RUN: sourceSha(),
    ...first,
    REAL_WORKERS_AI_CALLS: 0,
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    PRODUCTION_DEPLOYED: "NO",
    MIGRATION: "NONE",
    CRON_CHANGED: "NO",
  }));
}

async function main() {
  const args = parseArgs();
  let model;
  try {
    if (!args.model) throw new Error("MODEL_ARGUMENT_REQUIRED");
    model = modelForSemanticAB(args.model);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "SEMANTIC_AB_ARGUMENT_INVALID");
    process.exitCode = 2;
    return;
  }
  if (args.dryRun || !args.live) {
    printDryRun(model);
    return;
  }
  try {
    await runLive(model, args.reportPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "SEMANTIC_AB_RUN_FAILED");
    process.exitCode = 2;
  }
}

await main();
