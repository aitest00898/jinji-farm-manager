import { describe, expect, it } from "vitest";
import { canonicalWriteCoverageMatrix } from "./recording-write-matrix";

describe("canonical write coverage matrix", () => {
  it("covers every taxonomy category with one complete shared route", () => {
    const rows = canonicalWriteCoverageMatrix();
    expect(rows).toHaveLength(25);
    expect(rows.every((row) => row.recordCommandSupported && row.validatorSupported && row.resolverSupported)).toBe(true);
    expect(rows.every((row) => row.correctionPath === "append_only_lineage")).toBe(true);
    expect(rows.every((row) => row.apiExposed === "POST /api/records + GET /api/records")).toBe(true);
    expect(rows.every((row) => row.gapClassification === "COMPLETE")).toBe(true);
  });

  it("keeps the four authoritative destinations explicit", () => {
    const rows = canonicalWriteCoverageMatrix();
    expect(rows.filter((row) => row.authoritativeDestination === "recording_events").map((row) => row.taxonomyId)).toEqual(["O1", "O4"]);
    expect(rows.filter((row) => row.authoritativeDestination === "operational_actions").map((row) => row.taxonomyId)).toEqual(["O2", "O5", "O6", "O7", "O8"]);
    expect(rows.filter((row) => row.authoritativeDestination === "operational_events").map((row) => row.taxonomyId)).toEqual(["O3", "O9"]);
    expect(rows.filter((row) => row.authoritativeDestination === "abnormal_events")).toHaveLength(16);
    expect(rows.find((row) => row.taxonomyId === "A1")?.stockEffect).toBe(0);
  });
});
