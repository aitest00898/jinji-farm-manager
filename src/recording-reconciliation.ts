import { createRecordCommand, type RecordCommand } from "./record-command";
import { validateRecordingDraft, type RecordingDraft } from "./recording-taxonomy";

export const RECONCILIATION_STATES = [
  "NEW_INDEPENDENT_EVENT",
  "ALREADY_RECORDED",
  "POSSIBLY_RECORDED",
  "CORRECTION_OF_EXISTING",
] as const;
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

export interface ReconciliationResult {
  state: ReconciliationState;
  reason: string;
  matchedCommandIds: string[];
  semanticMatch: boolean;
}

type CommandInput = RecordCommand | RecordingDraft;

const IDENTITY_FIELDS = new Set([
  "id", "createdAt", "sourceChannel", "sourceMessageId", "sourceCandidateId",
  "rawText", "actorId", "confirmedBy", "clientOperationId", "correctionOfId",
  "reversalOfId", "replacementOfId", "lifecycleStatus",
]);

function command(input: CommandInput): RecordCommand {
  if (input && typeof input === "object" && "kind" in input && input.kind === "record_command") {
    const value = input as RecordCommand;
    return createRecordCommand(value.record);
  }
  return createRecordCommand(input as RecordingDraft);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !IDENTITY_FIELDS.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalValue(child)]));
}

function semanticSnapshot(record: RecordingDraft): string {
  return JSON.stringify(canonicalValue(record));
}

function explicitCorrection(incoming: RecordingDraft, existing: RecordingDraft): boolean {
  const incomingReferences = [incoming.correctionOfId, incoming.reversalOfId, incoming.replacementOfId]
    .map(nonEmpty).filter(Boolean);
  const existingReferences = [existing.correctionOfId, existing.reversalOfId, existing.replacementOfId]
    .map(nonEmpty).filter(Boolean);
  return incomingReferences.includes(nonEmpty(existing.id)) || existingReferences.includes(nonEmpty(incoming.id));
}

function sameProvenance(incoming: RecordingDraft, existing: RecordingDraft): boolean {
  const clientId = nonEmpty(incoming.clientOperationId);
  if (clientId && clientId === nonEmpty(existing.clientOperationId)) return true;
  const incomingMessage = nonEmpty(incoming.sourceMessageId);
  if (incomingMessage && incomingMessage === nonEmpty(existing.sourceMessageId)) return true;
  const incomingCandidate = nonEmpty(incoming.sourceCandidateId);
  return Boolean(incomingCandidate && incomingCandidate === nonEmpty(existing.sourceCandidateId));
}

function sameSemanticRecord(incoming: RecordingDraft, existing: RecordingDraft): boolean {
  return semanticSnapshot(incoming) === semanticSnapshot(existing);
}

/**
 * Reconcile only already validated canonical commands.  A semantic match from
 * a different client is deliberately POSSIBLY_RECORDED: this function never
 * suppresses a legitimate later event and never performs a destructive update.
 */
export function reconcileRecordCommand(input: CommandInput, existingInputs: CommandInput[] = []): ReconciliationResult {
  const incoming = command(input);
  const existing = existingInputs.map(command);
  const sameId = existing.filter((candidate) => candidate.record.id === incoming.record.id);
  if (sameId.length) {
    return { state: "ALREADY_RECORDED", reason: "same_record_id", matchedCommandIds: sameId.map((row) => row.record.id as string), semanticMatch: true };
  }

  const provenanceMatches = existing.filter((candidate) => sameProvenance(incoming.record, candidate.record));
  if (provenanceMatches.length) {
    return { state: "ALREADY_RECORDED", reason: "same_idempotency_or_source_provenance", matchedCommandIds: provenanceMatches.map((row) => row.record.id as string), semanticMatch: false };
  }

  const corrections = existing.filter((candidate) => explicitCorrection(incoming.record, candidate.record));
  if (corrections.length) {
    return { state: "CORRECTION_OF_EXISTING", reason: "explicit_correction_or_reversal_reference", matchedCommandIds: corrections.map((row) => row.record.id as string), semanticMatch: false };
  }

  const semanticMatches = existing.filter((candidate) => sameSemanticRecord(incoming.record, candidate.record));
  if (semanticMatches.length) {
    return {
      state: "POSSIBLY_RECORDED",
      reason: "same_canonical_content_without_same_provenance",
      matchedCommandIds: semanticMatches.map((row) => row.record.id as string),
      semanticMatch: true,
    };
  }

  return { state: "NEW_INDEPENDENT_EVENT", reason: "no_same_provenance_or_canonical_content", matchedCommandIds: [], semanticMatch: false };
}

export function validateReconciliationInputs(input: CommandInput, existingInputs: CommandInput[] = []): void {
  validateRecordingDraft(input && typeof input === "object" && "kind" in input && input.kind === "record_command"
    ? (input as RecordCommand).record : input as RecordingDraft);
  existingInputs.forEach((row) => validateRecordingDraft(row && typeof row === "object" && "kind" in row && row.kind === "record_command"
    ? (row as RecordCommand).record : row as RecordingDraft));
}
