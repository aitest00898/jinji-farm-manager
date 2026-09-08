export const AMBIENT_V2_2_PARITY_PATH = "/__codex/ambient-v2-2-parity";
// Frozen developer-only 3B parity lane; preserve its historical comparison
// identity and keep it separate from the canonical Production model default.
export const AMBIENT_V2_2_PARITY_MODEL = "@cf/meta/llama-3.2-3b-instruct" as const;
export const AMBIENT_V2_2_PARITY_CASE_REF = "D03" as const;
export const AMBIENT_V2_2_PARITY_MAX_TOKENS = 1536 as const;
export const AMBIENT_V2_2_PARITY_TEMPERATURE = 0 as const;

export interface AmbientV2_2ParityWorkerEnv {
  AI: Ai;
  PARITY_LOCAL_ONLY?: string;
}
