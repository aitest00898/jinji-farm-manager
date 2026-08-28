import { describe, expect, it } from "vitest";
import { decisionForFixtureId, smokeD03, smokeD05, smokeD05D06 } from "./ambient-semantic-eval-fixtures";
import type { AmbientSemanticEvalAiAdapter } from "./ambient-semantic-eval";
import {
  runAmbientSchemaMicroSequence,
  safeAmbientSchemaMicroReport,
} from "./ambient-semantic-eval-schema-micro";

function fixtureAdapter(responses: string[]): AmbientSemanticEvalAiAdapter {
  let callCount = 0;
  return {
    name: "fixture-schema-micro",
    get calls() {
      return callCount;
    },
    run: async () => ({
      response: responses[callCount++] ?? JSON.stringify({ decisions: [] }),
    }),
  };
}

function validD05(): string {
  return JSON.stringify({ decisions: [decisionForFixtureId("D05", () => "m1")] });
}

function validD03(): string {
  return JSON.stringify({ decisions: [decisionForFixtureId("D03", () => "m1")] });
}

function validD05D06(): string {
  return JSON.stringify({
    decisions: [
      decisionForFixtureId("D05", () => "m1"),
      decisionForFixtureId("D06", (id) => id === "D05" ? "m1" : "m2"),
    ],
  });
}

describe("Ambient schema micro sequence", () => {
  it("stops after the first schema failure and emits bounded field evidence", async () => {
    const missingRaw = JSON.stringify({
      decisions: [{
        ref: "m1",
        kind: "event",
        type: "mortality",
        quantity: 3,
        quantityConfidence: "high",
        confidence: "high",
      }],
    });
    const adapter = fixtureAdapter([missingRaw, validD03(), validD05D06()]);
    const result = await runAmbientSchemaMicroSequence({
      cases: [smokeD05, smokeD03, smokeD05D06],
      adapter,
      matrixRunId: "fixture-micro",
    });

    expect(adapter.calls).toBe(1);
    expect(result.providerCalls).toBe(1);
    expect(result.stopAfterCall).toBe(1);
    expect(result.stopReason).toBe("SCHEMA_FAILURE");
    expect(result.reports).toHaveLength(1);
    const safe = safeAmbientSchemaMicroReport(result.reports[0]!);
    expect(safe).toMatchObject({
      primarySchemaFailureClass: "MISSING_RAW",
      primarySchemaFailureField: "raw",
      diagnosticSufficiency: "PASS",
    });
    expect(JSON.stringify(safe)).not.toContain("mortality");
  });

  it("runs the three cases in order only when each schema passes", async () => {
    const adapter = fixtureAdapter([validD05(), validD03(), validD05D06()]);
    const result = await runAmbientSchemaMicroSequence({
      cases: [smokeD05, smokeD03, smokeD05D06],
      adapter,
      matrixRunId: "fixture-micro",
    });

    expect(adapter.calls).toBe(3);
    expect(result.providerCalls).toBe(3);
    expect(result.stopAfterCall).toBe(3);
    expect(result.stopReason).toBe("COMPLETED_THREE_CALLS");
    expect(result.reports.map((report) => report.testCase)).toEqual([
      "D05_ALONE",
      "D03_ALONE",
      "D05_D06",
    ]);
    expect(result.reports.every((report) => report.validationPass)).toBe(true);
  });

  it("classifies a missing decision kind as a missing required field", async () => {
    const missingKind = JSON.stringify({
      decisions: [{
        ref: "m1",
        quantity: 3,
        confidence: "high",
      }],
    });
    const adapter = fixtureAdapter([missingKind]);
    const result = await runAmbientSchemaMicroSequence({
      cases: [smokeD05, smokeD03, smokeD05D06],
      adapter,
      matrixRunId: "fixture-micro",
    });

    expect(result.providerCalls).toBe(1);
    expect(safeAmbientSchemaMicroReport(result.reports[0]!)).toMatchObject({
      primarySchemaFailureClass: "MISSING_REQUIRED_FIELD",
      primarySchemaFailureField: "kind",
    });
  });
});
