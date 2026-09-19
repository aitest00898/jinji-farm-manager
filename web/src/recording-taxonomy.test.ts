import { describe, expect, it } from "vitest";
import { RECORDING_TAXONOMY, deriveRecordingFields, destinationForTaxonomy, recordingDefinition } from "./recording-taxonomy";

describe("formal Web recording taxonomy", () => {
  it("covers exactly O1-O9 and A1-A16 once", () => {
    const expected = [
      "O1","O2","O3","O4","O5","O6","O7","O8","O9",
      "A1","A2","A3","A4","A5","A6","A7","A8","A9","A10","A11","A12","A13","A14","A15","A16",
    ];
    expect(RECORDING_TAXONOMY.map((item) => item.id)).toEqual(expected);
    expect(new Set(RECORDING_TAXONOMY.map((item) => item.id)).size).toBe(25);
  });

  it("preserves canonical destination mapping", () => {
    expect(destinationForTaxonomy("O1")).toBe("recording_events");
    expect(destinationForTaxonomy("O4")).toBe("recording_events");
    for (const id of ["O2","O5","O6","O7","O8"] as const) expect(destinationForTaxonomy(id)).toBe("operational_actions");
    for (const id of ["O3","O9"] as const) expect(destinationForTaxonomy(id)).toBe("operational_events");
    for (const item of RECORDING_TAXONOMY.filter((item) => item.id.startsWith("A"))) expect(item.destination).toBe("abnormal_events");
  });

  it("keeps stock effects bounded to intake, shipment, mortality and cull", () => {
    expect(recordingDefinition("O1").stockEffect).toBe(1);
    expect(recordingDefinition("O3").stockEffect).toBe(-1);
    expect(recordingDefinition("O9").stockEffect).toBe(-1);
    expect(RECORDING_TAXONOMY.filter((item) => !["O1","O3","O9"].includes(item.id)).every((item) => item.stockEffect === 0)).toBe(true);
  });

  it("derives fields without inventing unsupported observations", () => {
    expect(deriveRecordingFields({ subtype: "chick_in", maleCount: 400, femaleCount: 600 })).toEqual({ totalCount: 1000 });
    expect(deriveRecordingFields({ subtype: "shipment", quantity: 100, totalWeight: 210 })).toEqual({ averageWeight: 2.1 });
    expect(deriveRecordingFields({ subtype: "weigh", chickInDate: "2026-08-19", occurredAt: "2026-09-19T00:00:00Z" })).toEqual({ ageDays: 31 });
    expect(deriveRecordingFields({ subtype: "lab_test", submittedAt: "2026-09-19T00:00:00Z" })).toEqual({ reminderDueAt: "2026-09-22T00:00:00.000Z" });
    expect(deriveRecordingFields({ subtype: "cough", extent: "small" })).toEqual({});
  });
});
