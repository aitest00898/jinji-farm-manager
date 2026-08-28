import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const workerUrl = process.env.BENCHMARK_WORKER_URL ?? "https://chicken-line-production.jinji-assistant.workers.dev";
const runtimeToken = process.env.RUNTIME_TEST_TOKEN;
const reportPath = resolve(process.cwd(), "AI_MODEL_BENCHMARK.md");
const datasetPath = resolve(process.cwd(), "benchmarks/semantic-golden.json");
const currentModel = "@cf/meta/llama-3.2-3b-instruct";
const candidateModels = [...new Set([
  currentModel,
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/nvidia/nemotron-3-120b-a12b",
])];
const softNeuronLimit = Number(process.env.BENCHMARK_NEURON_SOFT_LIMIT ?? 8500);
const requestTimeoutMs = Number(process.env.BENCHMARK_REQUEST_TIMEOUT_MS ?? 20_000);
const concurrency = Math.max(1, Math.min(4, Number(process.env.BENCHMARK_CONCURRENCY ?? 2)));
const benchmarkStart = new Date().toISOString();

if (!runtimeToken) throw new Error("RUNTIME_TEST_TOKEN is required for the authorized read-only benchmark harness");

const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
if (!Array.isArray(dataset) || dataset.length < 120) throw new Error("semantic golden dataset must contain at least 120 cases");

function catalog() {
  try {
    const raw = execFileSync("npx", ["wrangler", "ai", "models", "list", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const catalogModels = catalog();
const catalogByName = new Map(catalogModels.map((model) => [model.name, model]));

function modelPricing(modelName) {
  const model = catalogByName.get(modelName);
  const prices = model?.properties?.find((property) => property.property_id === "price")?.value;
  if (!Array.isArray(prices)) return { input: null, output: null };
  return {
    input: prices.find((price) => /input tokens/u.test(price.unit))?.price ?? null,
    output: prices.find((price) => /output tokens/u.test(price.unit))?.price ?? null,
  };
}

function tokenValue(usage, names) {
  for (const name of names) if (typeof usage?.[name] === "number" && Number.isFinite(usage[name])) return usage[name];
  return null;
}

function estimateNeurons(modelName, input, response) {
  const usage = response?.usage ?? {};
  const inputTokens = tokenValue(usage, ["prompt_tokens", "input_tokens", "promptTokens"])
    ?? Math.ceil((input.length + 1400) / 2);
  const outputTokens = tokenValue(usage, ["completion_tokens", "output_tokens", "completionTokens"])
    ?? 180;
  const reported = tokenValue(usage, ["neurons", "neuron_count", "total_neurons"]);
  if (reported !== null) return { neurons: reported, source: "reported", inputTokens, outputTokens };
  const pricing = modelPricing(modelName);
  if (pricing.input === null || pricing.output === null) return { neurons: null, source: "unavailable", inputTokens, outputTokens };
  // Cloudflare documents the token/neuron price equivalence and $0.011 per
  // 1,000 neurons. This is an estimate when the binding response omits usage.
  const neurons = ((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000) / 0.011 * 1000;
  return { neurons, source: "estimated", inputTokens, outputTokens };
}

function farmKey(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, "") : null;
}

function decision(response) {
  if (!response || response.errorKind || !response.intent) return "reject";
  if (response.wouldDirectWrite) return "direct";
  if (response.farmResolution?.kind === "waiting_farm") return "waiting_farm";
  if (response.intent.intent === "query_recent_mortality_top" && response.intent.period === "recent") return "needsClarification";
  if (response.intent.intent === "unknown") return "reject";
  if (response.intent.needsConfirmation || response.farmResolution?.kind === "candidates") return "needsConfirmation";
  return "non_write";
}

function safetyMatches(expected, actual) {
  if (expected === "direct") return actual === "direct";
  if (expected === "waiting_farm") return actual === "waiting_farm";
  if (expected === "ambiguous") return actual === "needsConfirmation";
  if (expected === "needsConfirmation") return actual === "needsConfirmation" || actual === "reject";
  if (expected === "needsClarification") return actual === "needsClarification" || actual === "non_write";
  return actual === "reject";
}

async function callModel(model, input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${workerUrl}/__codex/runtime/benchmark-ai`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-codex-runtime-token": runtimeToken,
      },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
    const body = await response.json();
    return { httpStatus: response.status, ...body };
  } catch (error) {
    return { httpStatus: 599, errorKind: error?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function scoreModel(modelName, attempts) {
  const count = attempts.length || 1;
  const expectedCount = (predicate) => attempts.filter(({ test }) => predicate(test)).length;
  const accuracy = (predicate) => {
    const relevant = attempts.filter(({ test }) => predicate(test));
    return relevant.length ? relevant.filter(({ pass }) => pass).length / relevant.length : 1;
  };
  const intentAccuracy = accuracy((test) => test.expected?.intent !== null);
  const farmAccuracy = accuracy((test) => test.expected?.farmText !== null);
  const quantityAccuracy = accuracy((test) => test.expected?.quantity !== null);
  const unitAccuracy = accuracy((test) => test.expected?.unit !== null);
  const safetyAccuracy = accuracy(() => true);
  const schemaValidity = attempts.filter(({ response }) => response?.validationResult === "schema_valid").length / count;
  const falseDirect = attempts.filter(({ test, response }) => test.expectedSafety !== "direct" && response?.wouldDirectWrite).length;
  const ambiguous = attempts.filter(({ test }) => test.expectedSafety === "ambiguous");
  const ambiguousSafe = ambiguous.length ? ambiguous.filter(({ response }) => !response?.wouldDirectWrite && response?.farmResolution?.kind === "candidates").length / ambiguous.length : 1;
  const typo = attempts.filter(({ test }) => test.category === "typo-homophone");
  const typoSafe = typo.length ? typo.filter(({ response }) => !response?.wouldDirectWrite && (response?.farmResolution?.kind === "candidates" || response?.intent?.needsConfirmation)).length / typo.length : 1;
  const unknown = attempts.filter(({ test }) => test.category === "unknown-safety");
  const unknownRejected = unknown.length ? unknown.filter(({ response }) => decision(response) === "reject").length / unknown.length : 1;
  const latencies = attempts.map(({ response }) => Number(response?.trace?.latency_ms)).filter(Number.isFinite);
  const avgLatency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null;
  const neuronValues = attempts.map(({ neurons }) => neurons).filter((value) => typeof value === "number" && Number.isFinite(value));
  const neurons = neuronValues.reduce((sum, value) => sum + value, 0);
  const hardFailures = attempts.filter(({ test, response }) => test.expectedSafety !== "direct" && response?.wouldDirectWrite);
  const runtimeErrors = attempts.filter(({ response }) => response?.errorKind || response?.httpStatus >= 500);
  const latencyScore = avgLatency === null ? 0 : Math.max(0, 1 - avgLatency / 3000);
  const neuronScore = Math.max(0, 1 - neurons / softNeuronLimit);
  const overall = safetyAccuracy * 30 + intentAccuracy * 20 + farmAccuracy * 15 + quantityAccuracy * 15 + schemaValidity * 10 + latencyScore * 5 + neuronScore * 5;
  return {
    model: modelName,
    cases: new Set(attempts.map(({ test }) => test.id)).size,
    runs: attempts.length,
    overall,
    safety: safetyAccuracy,
    intent: intentAccuracy,
    farm: farmAccuracy,
    quantity: quantityAccuracy,
    unit: unitAccuracy,
    json: schemaValidity,
    schema: schemaValidity,
    avgLatency,
    neurons,
    neuronSource: attempts.some(({ neuronSource }) => neuronSource === "reported") ? "reported" : "estimated/unavailable",
    falseDirectWriteRate: falseDirect.length / count,
    ambiguousSafety: ambiguousSafe,
    typoConfirmation: typoSafe,
    unknownRejection: unknownRejected,
    hardFailures,
    runtimeErrors,
    failures: attempts.filter(({ pass }) => !pass).sort((left, right) => Number(Boolean(right.response?.wouldDirectWrite)) - Number(Boolean(left.response?.wouldDirectWrite))).slice(0, 10),
    expectedCounts: { direct: expectedCount((test) => test.expectedSafety === "direct"), safety: count },
  };
}

const safetyRepeats = new Set([
  "typo-001", "typo-005", "ambiguous-001", "ambiguous-002", "multi-001", "multi-003",
  "negation-001", "negation-004", "correction-001", "uncertain-001", "unknown-001", "unknown-005",
]);
const results = [];
let estimatedNeurons = 0;
let budgetStopped = false;

for (const model of candidateModels) {
  const attempts = [];
  let ineligible = null;
  const tasks = dataset.flatMap((test) => Array.from({ length: safetyRepeats.has(test.id) ? 3 : 1 }, (_, repeat) => ({ test, repeat })));
  for (let offset = 0; offset < tasks.length; offset += concurrency) {
    if (estimatedNeurons >= softNeuronLimit) {
      budgetStopped = true;
      break;
    }
    const batch = tasks.slice(offset, offset + concurrency);
    const responses = await Promise.all(batch.map(({ test }) => callModel(model, test.input)));
    for (let index = 0; index < batch.length; index += 1) {
      const { test, repeat } = batch[index];
      const response = responses[index];
      if (response.errorKind === "ineligible_free") {
        ineligible = "INELIGIBLE-FREE";
        break;
      }
      if (response.errorKind === "free_budget_or_rate_limited") {
        ineligible = "FREE-BUDGET-STOP";
        budgetStopped = true;
        break;
      }
      const estimate = estimateNeurons(model, test.input, response);
      estimatedNeurons += estimate.neurons ?? 0;
      const actualDecision = decision(response);
      const expected = test.expected ?? {};
      const intentPass = response.intent?.intent === expected.intent;
      const farmPass = expected.farmText === null || farmKey(response.intent?.farmText) === farmKey(expected.farmText);
      const quantityPass = expected.quantity === null || response.intent?.quantity === expected.quantity;
      const unitPass = expected.unit === null || response.intent?.unit === expected.unit;
      const safetyPass = safetyMatches(test.expectedSafety, actualDecision);
      const pass = intentPass && farmPass && quantityPass && unitPass && safetyPass && response.validationResult === "schema_valid";
      attempts.push({ test, repeat, response, pass, intentPass, farmPass, quantityPass, unitPass, safetyPass, neurons: estimate.neurons, neuronSource: estimate.source });
    }
    console.error(`BENCHMARK_PROGRESS model=${model} completed=${Math.min(offset + batch.length, tasks.length)}/${tasks.length} runs=${attempts.length} neurons=${estimatedNeurons.toFixed(2)}`);
    if (ineligible || budgetStopped) break;
  }
  const score = ineligible
    ? { model, status: ineligible, cases: attempts.length ? new Set(attempts.map(({ test }) => test.id)).size : 0, runs: attempts.length, attempts, hardFailures: [], failures: [] }
    : { ...scoreModel(model, attempts), status: budgetStopped ? "STOPPED-NEURON-SOFT-LIMIT" : "ELIGIBLE-FREE" };
  results.push(score);
  if (budgetStopped) break;
}

function pct(value) { return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "n/a"; }
function num(value) { return typeof value === "number" ? value.toFixed(2) : "n/a"; }
function modelStatus(result) { return result.status ?? "UNKNOWN"; }

const eligible = results.filter((result) => result.status === "ELIGIBLE-FREE");
const best = (field) => eligible.slice().sort((left, right) => (right[field] ?? -Infinity) - (left[field] ?? -Infinity))[0]?.model ?? "none";
const fastest = eligible.slice().sort((left, right) => (left.avgLatency ?? Infinity) - (right.avgLatency ?? Infinity))[0]?.model ?? "none";
const efficient = eligible.slice().sort((left, right) => (left.neurons ?? Infinity) - (right.neurons ?? Infinity))[0]?.model ?? "none";
const recommended = eligible.filter((result) => result.hardFailures.length === 0).sort((left, right) => right.overall - left.overall)[0]?.model ?? currentModel;
const critical = results.flatMap((result) => result.hardFailures ?? []);

const lines = [
  "# Workers AI Semantic Model Benchmark",
  "",
  `- Run started: ${benchmarkStart}`,
  `- Worker endpoint: ${workerUrl}`,
  `- Dataset cases: ${dataset.length}`,
  `- Safety repeat cases: ${safetyRepeats.size} × 3; other cases × 1`,
  `- Request timeout: ${requestTimeoutMs} ms; concurrency: ${concurrency}`,
  `- Soft neuron budget: ${softNeuronLimit}; estimated/observed consumed: ${estimatedNeurons.toFixed(2)}`,
  `- Budget stopped: ${budgetStopped ? "YES" : "NO"}`,
  "",
  "## Score table",
  "",
  "| Model | Status | Overall | Safety | Intent | Farm | Qty | Unit | JSON/Schema | Avg latency ms | Neurons | False direct-write |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
];
for (const result of results) {
  lines.push(`| ${result.model} | ${modelStatus(result)} | ${num(result.overall)} | ${pct(result.safety)} | ${pct(result.intent)} | ${pct(result.farm)} | ${pct(result.quantity)} | ${pct(result.unit)} | ${pct(result.schema)} | ${num(result.avgLatency)} | ${num(result.neurons)} | ${pct(result.falseDirectWriteRate)} |`);
}
lines.push(
  "",
  "## Recommendations",
  "",
  `- Current production model: ${currentModel}`,
  `- Best overall: ${best("overall")}`,
  `- Best safety: ${best("safety")}`,
  `- Best Chinese semantic proxy (farm + intent + quantity): ${best("farm")}`,
  `- Best latency: ${fastest}`,
  `- Best neuron efficiency: ${efficient}`,
  `- Recommended model (no hard safety failure): ${recommended}`,
  `- Production model changed automatically: NO`,
  "",
  "## Safety metrics",
  "",
  "| Model | Ambiguous-farm safety | Typo/homophone confirmation | Unknown rejection | Hard safety failures |",
  "|---|---:|---:|---:|---:|",
);
for (const result of results) lines.push(`| ${result.model} | ${pct(result.ambiguousSafety)} | ${pct(result.typoConfirmation)} | ${pct(result.unknownRejection)} | ${(result.hardFailures ?? []).length} |`);
lines.push("", "## Top failures per model", "");
for (const result of results) {
  lines.push(`### ${result.model}`, "");
  if (!result.failures?.length) lines.push("- none", "");
  for (const failure of result.failures ?? []) {
    lines.push(`- ${failure.test.id}: ${failure.test.input} — expected ${failure.test.expectedSafety}, actual ${decision(failure.response)}, intent=${failure.response?.intent?.intent ?? "none"}`);
  }
  lines.push("");
}
lines.push(
  "## Hard-fail policy",
  "",
  "Any direct write decision for a fuzzy/ambiguous/typo, missing-farm, negated, correction, multiple-event, uncertain, or unknown case is a safety-critical failure. The benchmark endpoint only performs D1 reads and never inserts events, pending actions, farms, or LINE messages.",
  "",
  `- Safety-critical failures observed: ${critical.length}`,
  `- Runtime errors observed: ${results.reduce((sum, result) => sum + (result.runtimeErrors?.length ?? 0), 0)}`,
  `- Model switch performed: NO (current remains ${currentModel})`,
  "",
);
writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({
  datasetCases: dataset.length,
  results: results.map(({ model, status, cases, runs, overall, safety, avgLatency, neurons, hardFailures, runtimeErrors }) => ({ model, status, cases, runs, overall, safety, avgLatency, neurons, hardFailures: hardFailures?.length ?? 0, runtimeErrors: runtimeErrors?.length ?? 0 })),
  recommended,
  currentModel,
  budgetStopped,
  estimatedNeurons,
  reportPath,
}, null, 2));
