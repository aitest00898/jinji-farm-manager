import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BENCHMARK_VERSION,
  FULL_TAXONOMY_LIVE_AB_V1_CASES,
  MODEL_3B,
  MODEL_8B,
  benchmarkFingerprintMaterials,
  buildFullTaxonomyAiRequest,
  evaluateFullTaxonomyCase,
  modelForFullTaxonomyBenchmark,
  validateFullTaxonomyBenchmarkFixture,
  aggregateFullTaxonomyEvaluations,
} from "../src/full-taxonomy-live-ab-v1.ts";
import {
  discoverAmbientSemanticEvalAccountId,
  discoverAmbientSemanticEvalAuth,
} from "./ambient-semantic-eval-auth.mjs";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const MAX_CONCURRENT_AI_CALLS = 1;
const RETRIES = 0;

function fail(code) {
  console.error(JSON.stringify({ taskResult: "FAIL", failure: code }));
  process.exitCode = 2;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fingerprints() {
  const materials = benchmarkFingerprintMaterials();
  return {
    CASE_SET_HASH: sha256(materials.caseSet),
    PROMPT_HASH: sha256(materials.prompt),
    SCHEMA_HASH: sha256(materials.schema),
    EVALUATOR_HASH: sha256(materials.evaluator),
    PREPROCESSOR_HASH: sha256(materials.preprocessor),
    HARNESS_HASH: sha256(materials.harness),
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
  const modelIndex = args.indexOf("--model");
  const model = modelIndex >= 0 ? args[modelIndex + 1] : null;
  const reportIndex = args.indexOf("--report-path");
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  return {
    model,
    live: args.includes("--live"),
    dryRun: args.includes("--dry-run"),
    reportPath,
  };
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
  const name = typeof error?.name === "string" ? error.name : "UNKNOWN";
  const code = typeof error?.code === "string" ? error.code : null;
  if (name === "AbortError") return { errorCode: code, errorClass: "PROVIDER_TIMEOUT" };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { errorCode: code, errorClass: "NETWORK_DNS_FAILURE" };
  if (code === "ECONNREFUSED") return { errorCode: code, errorClass: "NETWORK_CONNECTION_REFUSED" };
  if (code === "ECONNRESET") return { errorCode: code, errorClass: "NETWORK_CONNECTION_RESET" };
  if (code === "ETIMEDOUT") return { errorCode: code, errorClass: "NETWORK_TIMEOUT" };
  return { errorCode: code, errorClass: "NETWORK_FAILURE" };
}

async function callWorkersAi(endpoint, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${request.__token}`,
      },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return {
      httpStatus: null,
      providerResponseConfirmed: false,
      errorCode: safeTransportError(error).errorCode,
      errorClass: safeTransportError(error).errorClass,
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

function reportSafe(run) {
  return {
    TASK_RESULT: run.taskResult,
    BENCHMARK_VERSION,
    BENCHMARK_CASES: FULL_TAXONOMY_LIVE_AB_V1_CASES.length,
    SOURCE_SHA_BEFORE_LIVE_RUN: run.sourceSha,
    ...run.hashes,
    MODEL: run.model,
    MAX_CONCURRENT_AI_CALLS,
    RETRIES,
    ONLY_MODEL_VARIABLE_CHANGED: "PENDING_SINGLE_RUN",
    PROVIDER_RUN_COMPLETION: run.providerRunCompletion,
    PROVIDER_BOUNDARY: run.providerBoundary,
    PROVIDER_AUTH_SOURCE: run.authSource,
    PROVIDER_ACCOUNT_RESOLUTION: run.accountResolution,
    PROVIDER_ENDPOINT_FORM: "raw_slash_separated_model_path",
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    MIGRATION: "NONE",
    LINE_SEND: 0,
    QUEUE_WRITES: 0,
    CRON_CHANGED: "NO",
    PRODUCTION_MODEL_CHANGED: "NO",
    PRODUCTION_DEPLOYED: "NO",
    evaluations: run.evaluations,
    metrics: aggregateFullTaxonomyEvaluations(run.evaluations),
  };
}

async function runLive(model, reportPath) {
  const fixture = validateFullTaxonomyBenchmarkFixture();
  if (!fixture.valid) {
    fail(`BENCHMARK_FIXTURE_INVALID:${fixture.errors.join(",")}`);
    return;
  }
  const source = sourceSha();
  const hashes = fingerprints();
  const authDiscovery = discoverAmbientSemanticEvalAuth({ projectRoot: PROJECT_ROOT });
  if (!authDiscovery.auth?.token) {
    fail(`AUTH_UNAVAILABLE:${authDiscovery.failure ?? "UNKNOWN"}`);
    return;
  }
  const accountDiscovery = await discoverAmbientSemanticEvalAccountId({
    projectRoot: PROJECT_ROOT,
    auth: authDiscovery.auth,
  });
  if (!accountDiscovery.value) {
    fail(`ACCOUNT_UNAVAILABLE:${accountDiscovery.failure ?? "UNKNOWN"}`);
    return;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountDiscovery.value}/ai/run/${model}`;
  const evaluations = [];
  let providerBoundary = null;
  let providerRunCompletion = "COMPLETED_30_CASES";
  let calls = 0;
  for (const item of FULL_TAXONOMY_LIVE_AB_V1_CASES) {
    const request = buildFullTaxonomyAiRequest(item);
    // Keep the bearer only in this process and never serialize it in the body.
    const transportRequest = { body: request, __token: authDiscovery.auth.token };
    calls += 1;
    const transport = await callWorkersAi(endpoint, transportRequest);
    const evaluation = evaluateFullTaxonomyCase(item, model, transport);
    evaluations.push(evaluation);
    if (!transport.providerResponseConfirmed) {
      providerBoundary = transport.errorClass ?? "PROVIDER_RESPONSE_INVALID";
      providerRunCompletion = `STOPPED_AT_${calls}_OF_30_PROVIDER_BOUNDARY`;
      break;
    }
  }
  const safeReport = reportSafe({
    taskResult: providerRunCompletion === "COMPLETED_30_CASES" ? "PASS" : "FAIL",
    sourceSha: source,
    hashes,
    model,
    providerRunCompletion,
    providerBoundary,
    authSource: authDiscovery.source,
    accountResolution: accountDiscovery.source,
    evaluations,
  });
  safeReport.REAL_WORKERS_AI_CALLS = calls;
  safeReport.PROVIDER_HTTP_200 = evaluations.filter((item) => item.httpStatus === 200).length;
  if (reportPath) writeFileSync(resolve(PROJECT_ROOT, reportPath), `${JSON.stringify(safeReport, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(safeReport));
}

async function main() {
  const args = parseArgs();
  const fixture = validateFullTaxonomyBenchmarkFixture();
  const isolation = modelForFullTaxonomyBenchmark;
  if (!fixture.valid) return fail(`BENCHMARK_FIXTURE_INVALID:${fixture.errors.join(",")}`);
  if (!args.model) return fail("MODEL_ARGUMENT_REQUIRED");
  let model;
  try {
    model = isolation(args.model);
  } catch {
    return fail("BENCHMARK_MODEL_NOT_ALLOWED");
  }
  const firstHashes = fingerprints();
  const secondHashes = fingerprints();
  const dryReport = {
    TASK_RESULT: "DRY_RUN_PASS",
    BENCHMARK_VERSION,
    BENCHMARK_CASES: FULL_TAXONOMY_LIVE_AB_V1_CASES.length,
    BENCHMARK_FIXTURE_VALID: "PASS",
    HASH_STABILITY: JSON.stringify(firstHashes) === JSON.stringify(secondHashes) ? "PASS" : "FAIL",
    MODEL_OVERRIDE_ISOLATION: "PASS",
    MODEL: model,
    SOURCE_SHA_BEFORE_LIVE_RUN: sourceSha(),
    ...firstHashes,
    REAL_WORKERS_AI_CALLS: 0,
    PRODUCTION_AI_CALLS: 0,
    PRODUCTION_D1_READS: 0,
    PRODUCTION_D1_WRITES: 0,
    PRODUCTION_DEPLOYED: "NO",
    MIGRATION: "NONE",
    LINE_SEND: 0,
    QUEUE_WRITES: 0,
    CRON_CHANGED: "NO",
  };
  if (args.dryRun || !args.live) {
    console.log(JSON.stringify(dryReport));
    return;
  }
  await runLive(model, args.reportPath);
}

await main();
