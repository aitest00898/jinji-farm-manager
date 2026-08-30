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

export type JsonExtractionResult =
  | { ok: true; value: unknown }
  | { ok: false };

export function extractJsonResult(raw: string): JsonExtractionResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  if (!cleaned) return { ok: false };
  try { return { ok: true, value: JSON.parse(cleaned) }; } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return { ok: false };
    try { return { ok: true, value: JSON.parse(cleaned.slice(start, end + 1)) }; } catch { return { ok: false }; }
  }
}

export function extractJsonValue(raw: string): unknown {
  const result = extractJsonResult(raw);
  return result.ok ? result.value : null;
}
