import {
  stockEffectForRecord,
  validateRecordingDraft,
  type RecordingDraft,
  type TaxonomyId,
} from "./recording-taxonomy";
import type { CanonicalPersistenceDestination, CanonicalPersistenceRoute } from "./recording-runtime-bridge";

/**
 * The only cross-channel representation that is allowed to reach a future
 * persistence adapter.  This module is intentionally pure: it validates and
 * describes a command, but it never writes D1, enqueues Queue work, sends
 * LINE, calls AI, or chooses a scope.
 */
export interface RecordCommand {
  kind: "record_command";
  version: 1;
  taxonomyId: TaxonomyId;
  record: RecordingDraft;
  destination: CanonicalPersistenceDestination;
  authoritativeDestination: CanonicalPersistenceDestination;
  parallelAuthoritativeDestinations: readonly [];
  stockEffect: -1 | 0 | 1;
  sourceChannel: RecordingDraft["sourceChannel"];
  clientOperationId: string;
}

export const canonicalDestinationForTaxonomy = (taxonomyId: TaxonomyId): CanonicalPersistenceDestination =>
  taxonomyId === "O1" || taxonomyId === "O4"
    ? "recording_events"
    : taxonomyId === "O2" || taxonomyId === "O5" || taxonomyId === "O6" || taxonomyId === "O7" || taxonomyId === "O8"
      ? "operational_actions"
      : taxonomyId === "O3" || taxonomyId === "O9"
        ? "operational_events"
        : "abnormal_events";

export function canonicalDestinationForRecord(record: RecordingDraft): CanonicalPersistenceDestination {
  validateRecordingDraft(record);
  return canonicalDestinationForTaxonomy(String(record.taxonomyId) as TaxonomyId);
}

export function createRecordCommand(input: RecordingDraft): RecordCommand {
  const record = { ...input };
  validateRecordingDraft(record);
  const taxonomyId = String(record.taxonomyId) as TaxonomyId;
  const destination = canonicalDestinationForTaxonomy(taxonomyId);
  const sourceChannel = record.sourceChannel;
  const clientOperationId = String(record.clientOperationId);
  return {
    kind: "record_command",
    version: 1,
    taxonomyId,
    record,
    destination,
    authoritativeDestination: destination,
    parallelAuthoritativeDestinations: [],
    stockEffect: stockEffectForRecord(record),
    sourceChannel,
    clientOperationId,
  };
}

export function routeForRecordCommand(command: RecordCommand): CanonicalPersistenceRoute {
  const record = command.record;
  const taxonomyId = command.taxonomyId;
  const legacyIntent = taxonomyId === "O9"
    ? record.subtype === "mortality" ? "mortality" : "cull"
    : taxonomyId === "O3" ? "shipment" : undefined;
  return {
    taxonomyId,
    destination: command.destination,
    authoritative: true,
    parallelAuthoritativeDestinations: [],
    legacyIntent,
    stockEffect: command.stockEffect,
    requiresHumanConfirmation: !record.confirmedBy,
  };
}
