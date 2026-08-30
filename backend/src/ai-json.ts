/**
 * Workers AI responses are model output, not a trusted transport envelope.
 * Keep extraction tolerant of fenced JSON / short wrapper prose, while
 * leaving the actual schema decision to each feature's strict validator.
 */
export function aiResponseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return "";
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string") return response;
  return response && typeof response === "object" ? JSON.stringify(response) : "";
}

export const JSON_EXTRACTION_FAILURES = [
  "json_no_object_candidate",
  "json_object_unterminated",
  "json_object_candidate_invalid",
  "json_object_candidate_ambiguous",
] as const;

export type JsonExtractionFailure = (typeof JSON_EXTRACTION_FAILURES)[number];

export type JsonExtractionResult =
  | { ok: true; value: unknown }
  | { ok: false; failure: JsonExtractionFailure };

interface BalancedObjectScan {
  candidates: string[];
  hasOpeningBrace: boolean;
  hasUnterminatedObject: boolean;
}

/**
 * Find root-level balanced object spans without treating braces in JSON
 * strings as structure. Nested objects are tracked but are not emitted as
 * separate response candidates, so a valid object with nested fields remains
 * one deterministic candidate.
 */
function scanBalancedObjectCandidates(text: string): BalancedObjectScan {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let hasOpeningBrace = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      hasOpeningBrace = true;
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return { candidates, hasOpeningBrace, hasUnterminatedObject: depth > 0 };
}

function tryParseJson(value: string): { ok: true; value: unknown } | null {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return null;
  }
}

export function extractJsonResult(raw: string): JsonExtractionResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  if (!cleaned) return { ok: false, failure: "json_no_object_candidate" };

  const direct = tryParseJson(cleaned);
  if (direct) return direct;

  const scan = scanBalancedObjectCandidates(cleaned);
  if (!scan.hasOpeningBrace) return { ok: false, failure: "json_no_object_candidate" };
  if (scan.hasUnterminatedObject) {
    const completeCandidates = scan.candidates
      .map((candidate) => tryParseJson(candidate))
      .filter((candidate): candidate is { ok: true; value: unknown } => candidate !== null);
    if (completeCandidates.length === 1) return completeCandidates[0];
    if (completeCandidates.length > 1) return { ok: false, failure: "json_object_candidate_ambiguous" };
    return { ok: false, failure: "json_object_unterminated" };
  }

  const validCandidates = scan.candidates
    .map((candidate) => tryParseJson(candidate))
    .filter((candidate): candidate is { ok: true; value: unknown } => candidate !== null);
  if (validCandidates.length === 1) return validCandidates[0];
  if (validCandidates.length > 1) return { ok: false, failure: "json_object_candidate_ambiguous" };
  return { ok: false, failure: "json_object_candidate_invalid" };
}

export function extractJsonValue(raw: string): unknown {
  const result = extractJsonResult(raw);
  return result.ok ? result.value : null;
}
