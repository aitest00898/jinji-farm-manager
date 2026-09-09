import {
  MODEL_KEYS,
  MODEL_REGISTRY,
  MODEL_ROLES,
  MODEL_ROLE_BINDINGS,
  isModelRole,
  modelIdForKey,
  modelIdForRole,
  modelKeyForId,
  type ModelKey,
  type ModelRole,
} from "./model-registry.ts";

export { MODEL_KEYS, MODEL_REGISTRY, MODEL_ROLES, MODEL_ROLE_BINDINGS, modelIdForKey, modelIdForRole, modelKeyForId };
export type { ModelKey, ModelRole };

export const EVIDENCE_LEVELS = Object.freeze([
  "L1_DOCUMENTED",
  "L2_STATIC_COMPATIBLE",
  "L3_BOUNDED_RUNTIME_PROVEN",
  "L4_PRODUCTION_OBSERVED",
] as const);
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const MODEL_CAPABILITIES = Object.freeze([
  "text_generation",
  "prompt_constrained_json",
  "json_mode",
  "full_structured_analysis_json_mode",
] as const);
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export type CapabilityEvidenceResult = "PASS" | "REJECTED" | "NOT_PROVEN";

export interface CapabilityRequirement {
  readonly capability: ModelCapability;
  readonly requestProfile?: string;
  readonly schemaProfile?: string;
  readonly schemaHash?: string;
  readonly adapterVersion?: string;
  readonly adapterHash?: string;
  readonly evaluatorVersion?: string;
}

export interface ModelCapabilityEvidence extends CapabilityRequirement {
  readonly evidenceId: string;
  readonly provider: "cloudflare-workers-ai";
  readonly modelKey: ModelKey;
  readonly modelId: string;
  readonly evidenceLevel: EvidenceLevel;
  readonly result: CapabilityEvidenceResult;
  readonly observedAt: string;
  readonly validUntil: string | null;
  readonly sourceRef: string;
  readonly reuseKey: string;
}

const PROVIDER = "cloudflare-workers-ai" as const;
const ADAPTER_VERSION = "workers-ai-binding-v1" as const;
const ADAPTER_HASH = "workers-ai-binding-callsite-contract-v1" as const;
const EVALUATOR_VERSION = "model-portability-v1" as const;

/**
 * The reuse key deliberately includes every contract dimension that can make
 * a model result non-transferable.  A new schema/adapter/evaluator must create
 * a new evidence record instead of overwriting this append-only history.
 */
export function capabilityEvidenceReuseKey(evidence: Omit<ModelCapabilityEvidence, "reuseKey">): string {
  return [
    evidence.provider,
    evidence.modelId,
    evidence.capability,
    evidence.requestProfile ?? "",
    evidence.schemaProfile ?? "",
    evidence.schemaHash ?? "",
    evidence.adapterVersion ?? "",
    evidence.adapterHash ?? "",
    evidence.evaluatorVersion ?? "",
    evidence.result,
  ].join("|");
}

function evidence(input: Omit<ModelCapabilityEvidence, "modelId" | "reuseKey">): ModelCapabilityEvidence {
  const modelId = modelIdForKey(input.modelKey);
  const record = { ...input, modelId };
  return Object.freeze({ ...record, reuseKey: capabilityEvidenceReuseKey(record) });
}

/**
 * Existing evidence only.  No entry in this array performs a provider call.
 * The dated records point back to the already recorded 3B/8B catalogue,
 * bounded runtime, and Production observations in current-execution-state.
 */
export const MODEL_CAPABILITY_EVIDENCE: readonly ModelCapabilityEvidence[] = Object.freeze([
  evidence({
    evidenceId: "3b-production-text-generation-historical",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.HISTORICAL_3B,
    capability: "text_generation",
    requestProfile: "production-text-generation-v1",
    adapterVersion: ADAPTER_VERSION,
    adapterHash: ADAPTER_HASH,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceLevel: "L4_PRODUCTION_OBSERVED",
    result: "PASS",
    observedAt: "2026-09-08",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:8B Production model migration verification gate",
  }),
  evidence({
    evidenceId: "3b-json-mode-official-catalog-negative",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.HISTORICAL_3B,
    capability: "json_mode",
    requestProfile: "official-json-mode-supported-model-list",
    evidenceLevel: "L1_DOCUMENTED",
    result: "REJECTED",
    observedAt: "2026-09-08",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:Official model and JSON Mode evidence",
  }),
  evidence({
    evidenceId: "8b-production-text-generation-current",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.CURRENT_8B_FAST,
    capability: "text_generation",
    requestProfile: "production-text-generation-v1",
    adapterVersion: ADAPTER_VERSION,
    adapterHash: ADAPTER_HASH,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceLevel: "L4_PRODUCTION_OBSERVED",
    result: "PASS",
    observedAt: "2026-09-09",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:Lane A Production deployment + Model Portability framework",
  }),
  evidence({
    evidenceId: "8b-prompt-json-bounded",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.CURRENT_8B_FAST,
    capability: "prompt_constrained_json",
    requestProfile: "full-taxonomy-semantic-prompt-json-v1",
    schemaProfile: "unified-intent-v1",
    schemaHash: "4b72414ac4a776b33fed4edae15943891acd992d6712dee1de94756e9434d737",
    adapterVersion: ADAPTER_VERSION,
    adapterHash: ADAPTER_HASH,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceLevel: "L3_BOUNDED_RUNTIME_PROVEN",
    result: "PASS",
    observedAt: "2026-09-08",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:Multi-track convergence gate",
  }),
  evidence({
    evidenceId: "8b-json-mode-bounded-s0-s4",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.CURRENT_8B_FAST,
    capability: "json_mode",
    requestProfile: "json-mode-staircase-s0-s4-v1",
    schemaProfile: "bounded-s0-s4",
    schemaHash: "c70d7e66...2fed9df",
    adapterVersion: ADAPTER_VERSION,
    adapterHash: ADAPTER_HASH,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceLevel: "L3_BOUNDED_RUNTIME_PROVEN",
    result: "PASS",
    observedAt: "2026-09-08",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:Multi-track convergence gate",
  }),
  evidence({
    evidenceId: "8b-json-mode-constraints-rejected-s5",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.CURRENT_8B_FAST,
    capability: "json_mode",
    requestProfile: "json-mode-staircase-s5-constraints-v1",
    schemaProfile: "constraints-s5",
    schemaHash: "s5-8007",
    adapterVersion: ADAPTER_VERSION,
    adapterHash: ADAPTER_HASH,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceLevel: "L3_BOUNDED_RUNTIME_PROVEN",
    result: "REJECTED",
    observedAt: "2026-09-08",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:Multi-track convergence gate",
  }),
  evidence({
    evidenceId: "8b-full-structured-analysis-not-proven",
    provider: PROVIDER,
    modelKey: MODEL_KEYS.CURRENT_8B_FAST,
    capability: "full_structured_analysis_json_mode",
    requestProfile: "full-structured-analysis-json-mode-v1",
    schemaProfile: "StructuredAnalysis-current",
    schemaHash: "not-proven",
    adapterVersion: ADAPTER_VERSION,
    adapterHash: ADAPTER_HASH,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceLevel: "L3_BOUNDED_RUNTIME_PROVEN",
    result: "NOT_PROVEN",
    observedAt: "2026-09-08",
    validUntil: null,
    sourceRef: "docs/current-execution-state.md:8B Production model migration verification gate",
  }),
]);

export const MODEL_ROLE_REQUIREMENTS: Readonly<Record<ModelRole, readonly CapabilityRequirement[]>> = Object.freeze({
  ANALYSIS: Object.freeze([{ capability: "text_generation" as const }]),
  CONVERSATION: Object.freeze([{ capability: "text_generation" as const }]),
  AMBIENT_EXTRACTION: Object.freeze([{ capability: "text_generation" as const }]),
  ABNORMAL_CLASSIFICATION: Object.freeze([{ capability: "text_generation" as const }]),
});

export type CapabilityGateFailure = "UNKNOWN_ROLE" | "UNKNOWN_MODEL" | "CAPABILITY_NOT_PROVEN" | "CAPABILITY_STALE";

export type CapabilityGateResult =
  | {
      readonly ok: true;
      readonly modelId: string;
      readonly modelKey: ModelKey;
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly modelId: string | null;
      readonly code: CapabilityGateFailure;
      readonly missing: readonly string[];
      readonly stale: readonly string[];
      readonly evidenceIds: readonly string[];
    };

function requirementLabel(requirement: CapabilityRequirement): string {
  return [
    requirement.capability,
    requirement.requestProfile ?? "*",
    requirement.schemaProfile ?? "*",
    requirement.schemaHash ?? "*",
  ].join(":");
}

function requirementMatches(evidenceRecord: ModelCapabilityEvidence, requirement: CapabilityRequirement): boolean {
  return evidenceRecord.capability === requirement.capability
    && (!requirement.requestProfile || evidenceRecord.requestProfile === requirement.requestProfile)
    && (!requirement.schemaProfile || evidenceRecord.schemaProfile === requirement.schemaProfile)
    && (!requirement.schemaHash || evidenceRecord.schemaHash === requirement.schemaHash)
    && (!requirement.adapterVersion || evidenceRecord.adapterVersion === requirement.adapterVersion)
    && (!requirement.adapterHash || evidenceRecord.adapterHash === requirement.adapterHash)
    && (!requirement.evaluatorVersion || evidenceRecord.evaluatorVersion === requirement.evaluatorVersion);
}

export function isCapabilityEvidenceStale(record: ModelCapabilityEvidence, now = new Date()): boolean {
  return record.validUntil !== null && Date.parse(record.validUntil) < now.getTime();
}

export function checkCapabilityGate(
  modelId: unknown,
  requirements: readonly CapabilityRequirement[],
  now = new Date(),
): CapabilityGateResult {
  const modelKey = modelKeyForId(modelId);
  if (!modelKey || typeof modelId !== "string") {
    return { ok: false, modelId: typeof modelId === "string" ? modelId : null, code: "UNKNOWN_MODEL", missing: [], stale: [], evidenceIds: [] };
  }

  const missing: string[] = [];
  const stale: string[] = [];
  const evidenceIds: string[] = [];
  for (const requirement of requirements) {
    const matching = MODEL_CAPABILITY_EVIDENCE.filter((record) => record.modelId === modelId && requirementMatches(record, requirement));
    const activePass = matching.find((record) => record.result === "PASS" && !isCapabilityEvidenceStale(record, now));
    if (activePass) {
      evidenceIds.push(activePass.evidenceId);
      continue;
    }
    if (matching.some((record) => record.result === "PASS" && isCapabilityEvidenceStale(record, now))) stale.push(requirementLabel(requirement));
    else missing.push(requirementLabel(requirement));
  }
  if (stale.length) return { ok: false, modelId, code: "CAPABILITY_STALE", missing, stale, evidenceIds };
  if (missing.length) return { ok: false, modelId, code: "CAPABILITY_NOT_PROVEN", missing, stale, evidenceIds };
  return { ok: true, modelId, modelKey, evidenceIds };
}

export function checkModelForRole(role: unknown, modelId: unknown, now = new Date()): CapabilityGateResult {
  if (!isModelRole(role)) return { ok: false, modelId: typeof modelId === "string" ? modelId : null, code: "UNKNOWN_ROLE", missing: [], stale: [], evidenceIds: [] };
  return checkCapabilityGate(modelId, MODEL_ROLE_REQUIREMENTS[role], now);
}

/**
 * Resolve a Production role.  Explicit runtime overrides are accepted only
 * when they are the currently bound model and pass the same capability gate;
 * migration candidates are evaluated separately by the planner.
 */
export function resolveModelForRole(role: unknown, requestedModel?: unknown): string {
  if (!isModelRole(role)) throw new Error("MODEL_CAPABILITY_GATE_FAIL:UNKNOWN_ROLE");
  const boundModel = modelIdForRole(role);
  const candidate = requestedModel === undefined || requestedModel === null ? boundModel : requestedModel;
  const gate = checkModelForRole(role, candidate);
  if (!gate.ok) throw new Error(`MODEL_CAPABILITY_GATE_FAIL:${gate.code}`);
  if (candidate !== boundModel) throw new Error("MODEL_CAPABILITY_GATE_FAIL:MODEL_NOT_CURRENTLY_BOUND");
  return candidate;
}

export interface ProviderAdapter {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Provider-neutral text boundary; it has no fallback and never writes data. */
export function runText(
  adapter: ProviderAdapter,
  role: ModelRole,
  input: Record<string, unknown>,
  requestedModel?: string,
): Promise<unknown> {
  return adapter.run(resolveModelForRole(role, requestedModel), input);
}

/**
 * Structured output remains opt-in.  A caller must provide its existing
 * response_format and a matching proven profile; this helper never relaxes a
 * local validator and never falls back to another provider/model.
 */
export function runStructured(
  adapter: ProviderAdapter,
  role: ModelRole,
  input: Record<string, unknown>,
  profile: string,
  requestedModel?: string,
): Promise<unknown> {
  if (!Object.prototype.hasOwnProperty.call(input, "response_format")) throw new Error("MODEL_STRUCTURED_RESPONSE_FORMAT_REQUIRED");
  const model = resolveModelForRole(role, requestedModel);
  const gate = checkCapabilityGate(model, [{ capability: "json_mode", requestProfile: profile }]);
  if (!gate.ok) throw new Error(`MODEL_CAPABILITY_GATE_FAIL:${gate.code}`);
  return adapter.run(model, input);
}

export interface EvidenceReusePlan {
  readonly reused: readonly string[];
  readonly missing: readonly string[];
  readonly stale: readonly string[];
  readonly newStaticEvidence: readonly string[];
  readonly newLiveEvidence: readonly string[];
}

export function planEvidenceReuse(
  modelId: string,
  requirements: readonly CapabilityRequirement[],
  now = new Date(),
): EvidenceReusePlan {
  const gate = checkCapabilityGate(modelId, requirements, now);
  const targetEvidence = MODEL_CAPABILITY_EVIDENCE.filter((record) => record.modelId === modelId);
  return {
    reused: gate.ok ? [...gate.evidenceIds] : [],
    missing: gate.ok ? [] : [...gate.missing],
    stale: gate.ok ? [] : [...gate.stale],
    newStaticEvidence: targetEvidence.filter((record) => record.result === "PASS" && record.evidenceLevel === "L1_DOCUMENTED").map((record) => record.evidenceId),
    newLiveEvidence: targetEvidence.filter((record) => record.result === "PASS" && (record.evidenceLevel === "L3_BOUNDED_RUNTIME_PROVEN" || record.evidenceLevel === "L4_PRODUCTION_OBSERVED")).map((record) => record.evidenceId),
  };
}

function uniqueRequirements(roles: readonly ModelRole[]): CapabilityRequirement[] {
  const seen = new Set<string>();
  const result: CapabilityRequirement[] = [];
  for (const role of roles) {
    for (const requirement of MODEL_ROLE_REQUIREMENTS[role]) {
      const key = requirementLabel(requirement);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(requirement);
      }
    }
  }
  return result;
}

export interface ModelMigrationPlan {
  readonly kind: "MODEL_MIGRATION_PLAN";
  readonly provider: "cloudflare-workers-ai";
  readonly currentModel: string;
  readonly targetModel: string | null;
  readonly currentRoles: readonly ModelRole[];
  readonly targetRoles: readonly ModelRole[];
  readonly requirements: readonly CapabilityRequirement[];
  readonly capabilityGate: CapabilityGateResult;
  readonly evidenceReuse: EvidenceReusePlan;
  readonly downgradeGuard: "NOT_APPLICABLE" | "RELEASE_INTENT_REQUIRED" | "PASS";
  readonly decision: "NO_CHANGE" | "READY_FOR_REVIEW" | "BLOCKED";
  readonly providerCalls: 0;
  readonly releaseRequirements: readonly string[];
  readonly rollbackRequirements: readonly string[];
}

export function planModelMigration(
  targetModel: unknown,
  options: { readonly currentModel?: string; readonly releaseIntent?: string; readonly now?: Date } = {},
): ModelMigrationPlan {
  const currentModel = options.currentModel ?? modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST);
  const targetModelId = typeof targetModel === "string" && modelKeyForId(targetModel) ? targetModel : null;
  const roles = [...MODEL_ROLES];
  const requirements = uniqueRequirements(roles);
  const capabilityGate: CapabilityGateResult = targetModelId
    ? checkCapabilityGate(targetModelId, requirements, options.now)
    : { ok: false as const, modelId: targetModelId, code: "UNKNOWN_MODEL" as const, missing: [], stale: [], evidenceIds: [] };
  const downgrade = currentModel === modelIdForKey(MODEL_KEYS.CURRENT_8B_FAST)
    && targetModelId === modelIdForKey(MODEL_KEYS.HISTORICAL_3B);
  const downgradeGuard = !downgrade
    ? "NOT_APPLICABLE"
    : options.releaseIntent === "MODEL_MIGRATION" ? "PASS" : "RELEASE_INTENT_REQUIRED";
  const allowed = capabilityGate.ok && (!downgrade || downgradeGuard === "PASS");
  return {
    kind: "MODEL_MIGRATION_PLAN",
    provider: PROVIDER,
    currentModel,
    targetModel: targetModelId,
    currentRoles: roles,
    targetRoles: roles,
    requirements,
    capabilityGate,
    evidenceReuse: targetModelId ? planEvidenceReuse(targetModelId, requirements, options.now) : { reused: [], missing: ["UNKNOWN_MODEL"], stale: [], newStaticEvidence: [], newLiveEvidence: [] },
    downgradeGuard,
    decision: targetModelId === currentModel ? "NO_CHANGE" : allowed ? "READY_FOR_REVIEW" : "BLOCKED",
    providerCalls: 0,
    releaseRequirements: ["EXPLICIT_L3_MODEL_MIGRATION_APPROVAL", "FREE_ONLY_PLAN_RECONFIRMATION", "TARGETED_REGRESSION", "POST_RELEASE_MODEL_AND_HEALTH_VERIFICATION"],
    rollbackRequirements: ["CAPTURE_PRE_RELEASE_WORKER_VERSION", "ROLLBACK_TO_PREVIOUS_WORKER_VERSION_IF_RUNTIME_VERIFICATION_FAILS"],
  };
}
