/**
 * Stable model identities and the small set of model roles that actually
 * exist in the Worker.  This module contains no provider call and no runtime
 * configuration lookup; a deployment can therefore not silently invent a
 * model identity.
 */

export const MODEL_KEYS = Object.freeze({
  CURRENT_8B_FAST: "current_8b_fast",
  HISTORICAL_3B: "historical_3b",
} as const);

export type ModelKey = (typeof MODEL_KEYS)[keyof typeof MODEL_KEYS];

export interface ModelRegistryEntry {
  readonly key: ModelKey;
  readonly provider: "cloudflare-workers-ai";
  readonly modelId: string;
  readonly lifecycle: "current_production" | "historical_baseline";
  readonly freeTierEligible: true;
}

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = Object.freeze([
  Object.freeze({
    key: MODEL_KEYS.CURRENT_8B_FAST,
    provider: "cloudflare-workers-ai",
    modelId: "@cf/meta/llama-3.1-8b-instruct-fast",
    lifecycle: "current_production",
    freeTierEligible: true,
  }),
  Object.freeze({
    key: MODEL_KEYS.HISTORICAL_3B,
    provider: "cloudflare-workers-ai",
    modelId: "@cf/meta/llama-3.2-3b-instruct",
    lifecycle: "historical_baseline",
    freeTierEligible: true,
  }),
]);

export function modelIdForKey(key: ModelKey): string {
  const entry = MODEL_REGISTRY.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`MODEL_REGISTRY_KEY_UNKNOWN:${String(key)}`);
  return entry.modelId;
}

export function modelKeyForId(value: unknown): ModelKey | null {
  if (typeof value !== "string") return null;
  return MODEL_REGISTRY.find((candidate) => candidate.modelId === value)?.key ?? null;
}

export const MODEL_ROLES = Object.freeze([
  "ANALYSIS",
  "CONVERSATION",
  "AMBIENT_EXTRACTION",
  "ABNORMAL_CLASSIFICATION",
] as const);

export type ModelRole = (typeof MODEL_ROLES)[number];

export interface ModelRoleBinding {
  readonly modelKey: ModelKey;
}

export const MODEL_ROLE_BINDINGS: Readonly<Record<ModelRole, ModelRoleBinding>> = Object.freeze({
  ANALYSIS: Object.freeze({ modelKey: MODEL_KEYS.CURRENT_8B_FAST }),
  CONVERSATION: Object.freeze({ modelKey: MODEL_KEYS.CURRENT_8B_FAST }),
  AMBIENT_EXTRACTION: Object.freeze({ modelKey: MODEL_KEYS.CURRENT_8B_FAST }),
  ABNORMAL_CLASSIFICATION: Object.freeze({ modelKey: MODEL_KEYS.CURRENT_8B_FAST }),
});

export function isModelRole(value: unknown): value is ModelRole {
  return typeof value === "string" && (MODEL_ROLES as readonly string[]).includes(value);
}

export function modelIdForRole(role: ModelRole): string {
  const binding = MODEL_ROLE_BINDINGS[role];
  if (!binding) throw new Error(`MODEL_ROLE_UNKNOWN:${String(role)}`);
  return modelIdForKey(binding.modelKey);
}
