import { canonicalDestinationForTaxonomy } from "./record-command";
import { RECORDING_TAXONOMY, type TaxonomyDefinition, type TaxonomyId } from "./recording-taxonomy";

export type WriteCoverageGap =
  | "MISSING_COMMAND_MAPPING"
  | "MISSING_VALIDATOR_MAPPING"
  | "MISSING_RESOLVER_MAPPING"
  | "MISSING_RUNTIME_ADAPTER"
  | "MISSING_API_ROUTE"
  | "MISSING_READ_BRIDGE"
  | "MISSING_CORRECTION_ROUTE"
  | "COMPLETE";

export interface CanonicalWriteCoverageRow {
  taxonomyId: TaxonomyId;
  family: TaxonomyDefinition["family"];
  type: string;
  subtype: readonly string[];
  recordCommandSupported: true;
  validatorSupported: true;
  resolverSupported: true;
  writeAdapter: "recording_event_adapter" | "operational_action_adapter" | "operational_event_legacy_authority_adapter" | "abnormal_event_adapter";
  authoritativeDestination: "recording_events" | "operational_actions" | "operational_events" | "abnormal_events";
  requiredFields: readonly string[];
  derivedFields: readonly string[];
  readBridge: "canonical_recording_events" | "operational_actions" | "legacy_operational_events" | "legacy_abnormal_events";
  correctionPath: "append_only_lineage";
  idempotencyPath: "organization_plus_client_operation_id" | "organization_plus_source_event_id";
  stockEffect: -1 | 0 | 1;
  apiExposed: "POST /api/records + GET /api/records";
  linePathExposed: "shared_adapter_command_boundary" | "existing_text_path_calls_shared_adapter";
  gapClassification: WriteCoverageGap;
}

function adapterFor(definition: TaxonomyDefinition): CanonicalWriteCoverageRow["writeAdapter"] {
  if (definition.id === "O1" || definition.id === "O4") return "recording_event_adapter";
  if (["O2", "O5", "O6", "O7", "O8"].includes(definition.id)) return "operational_action_adapter";
  if (definition.id === "O3" || definition.id === "O9") return "operational_event_legacy_authority_adapter";
  return "abnormal_event_adapter";
}

function readBridgeFor(definition: TaxonomyDefinition): CanonicalWriteCoverageRow["readBridge"] {
  if (definition.id === "O1" || definition.id === "O4") return "canonical_recording_events";
  if (["O2", "O5", "O6", "O7", "O8"].includes(definition.id)) return "operational_actions";
  if (definition.id === "O3" || definition.id === "O9") return "legacy_operational_events";
  return "legacy_abnormal_events";
}

/**
 * Authoritative post-closure matrix. It is generated from the same taxonomy
 * definitions used by validation and RecordCommand routing; no category is
 * allowed to acquire a separate persistence authority.
 */
export function canonicalWriteCoverageMatrix(): readonly CanonicalWriteCoverageRow[] {
  return Object.freeze(RECORDING_TAXONOMY.map((definition) => Object.freeze({
    taxonomyId: definition.id,
    family: definition.family,
    type: definition.canonicalType,
    subtype: [...definition.canonicalSubtypes],
    recordCommandSupported: true as const,
    validatorSupported: true as const,
    resolverSupported: true as const,
    writeAdapter: adapterFor(definition),
    authoritativeDestination: canonicalDestinationForTaxonomy(definition.id),
    requiredFields: [...definition.requiredFields],
    derivedFields: [...definition.derivedFields],
    readBridge: readBridgeFor(definition),
    correctionPath: "append_only_lineage" as const,
    idempotencyPath: definition.id === "O1" || definition.id === "O2" || definition.id === "O4" || definition.id === "O5" || definition.id === "O6" || definition.id === "O7" || definition.id === "O8"
      ? "organization_plus_client_operation_id" as const
      : "organization_plus_source_event_id" as const,
    stockEffect: definition.stockEffect,
    apiExposed: "POST /api/records + GET /api/records" as const,
    linePathExposed: definition.id === "O3" || definition.id === "O9"
      ? "existing_text_path_calls_shared_adapter" as const
      : "shared_adapter_command_boundary" as const,
    gapClassification: "COMPLETE" as const,
  })));
}

export function canonicalWriteCoverageRowFor(taxonomyId: TaxonomyId): CanonicalWriteCoverageRow {
  const row = canonicalWriteCoverageMatrix().find((candidate) => candidate.taxonomyId === taxonomyId);
  if (!row) throw new Error("CANONICAL_WRITE_MATRIX_TAXONOMY_NOT_FOUND:" + taxonomyId);
  return row;
}
