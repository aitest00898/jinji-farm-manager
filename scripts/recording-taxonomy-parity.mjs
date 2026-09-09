import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECORDING_FAMILIES,
  RECORDING_SEXES,
  RECORDING_SOURCE_CHANNELS,
  RECORDING_TAXONOMY,
  recordingTaxonomyContractSnapshot,
  validateRecordingDraft,
  deriveRecordingFields,
} from "../src/recording-taxonomy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = process.env.JINJI_WEB_LAB_ROOT || "/Users/joe/Ai DEV/jinji-web-v14r-lab";
const webTaxonomy = createRequire(import.meta.url)(path.join(webRoot, "src/recording-taxonomy.js"));

assert.deepEqual(webTaxonomy.RECORDING_FAMILIES, RECORDING_FAMILIES);
assert.deepEqual(webTaxonomy.RECORDING_SOURCE_CHANNELS, RECORDING_SOURCE_CHANNELS);
assert.deepEqual(webTaxonomy.RECORDING_SEXES, RECORDING_SEXES);
assert.deepEqual(webTaxonomy.recordingTaxonomyContractSnapshot(), recordingTaxonomyContractSnapshot());
assert.equal(RECORDING_TAXONOMY.length, 25);
assert.equal(RECORDING_TAXONOMY.reduce((sum, item) => sum + item.canonicalSubtypes.length, 0), 46);

const base = {
  id: "parity-record-1",
  occurredAt: "2026-09-08T01:00:00.000Z",
  createdAt: "2026-09-08T01:00:00.000Z",
  farmId: "farm-test",
  sourceChannel: "web",
  rawText: "synthetic parity record",
  clientOperationId: "parity-client-1",
};
const cases = [
  {
    ...base,
    taxonomyId: "O9",
    family: "operational_event",
    type: "event",
    subtype: "mortality",
    quantity: 5,
  },
  {
    ...base,
    id: "parity-lab-1",
    clientOperationId: "parity-client-lab-1",
    taxonomyId: "O6",
    family: "operational_action",
    type: "action",
    subtype: "lab_test",
    submittedAt: "2026-09-08T01:00:00.000Z",
    content: "synthetic lab",
    workflowStatus: "waiting_result",
    lifecycleStatus: "active",
  },
  {
    ...base,
    id: "parity-invalid-1",
    clientOperationId: "parity-client-invalid-1",
    taxonomyId: "O9",
    family: "operational_event",
    type: "event",
    subtype: "mortality",
    quantity: 1.5,
  },
];

function validationOutcome(validate, value) {
  try {
    validate(value);
    return "PASS";
  } catch (error) {
    return String(error?.message || error);
  }
}

for (const value of cases) {
  assert.equal(
    validationOutcome(validateRecordingDraft, value),
    validationOutcome(webTaxonomy.validateCanonicalRecording, value),
  );
}
for (const value of [
  { subtype: "chick_in", maleCount: 6, femaleCount: 4 },
  { subtype: "shipment", quantity: 100, totalWeight: 180 },
  { subtype: "weigh", occurredAt: "2026-09-08T01:00:00.000Z", chickInDate: "2026-09-01" },
  { subtype: "lab_test", submittedAt: "2026-09-08T01:00:00.000Z" },
]) {
  assert.deepEqual(deriveRecordingFields(value), webTaxonomy.deriveCanonicalFields(value));
}

console.log("WEB_PROD_TAXONOMY_PARITY=PASS");
