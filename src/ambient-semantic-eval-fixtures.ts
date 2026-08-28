import type { AmbientBufferedMessage } from "./ambient";
import type { AmbientSemanticEvalCase } from "./ambient-semantic-eval";

/**
 * Developer-only safe projections of DEV-SMOKE-8. These are not Production
 * source rows and are never sent to a business write path.
 */
const fixtureRows = [
  { id: "D01", text: "今天雞排一份85元", groundTruth: "CHAT", expectedOperational: null },
  { id: "D02", text: "金雞測試場剛剛死2隻", groundTruth: "DIRECT_OPERATIONAL", expectedOperational: { type: "mortality", quantity: 2 } },
  { id: "D03", text: "金雞測試場有幾隻一直咳，數量還不確定", groundTruth: "DIRECT_OPERATIONAL", expectedOperational: { type: "abnormal", quantity: null } },
  { id: "D04", text: "金雞測試場今天淘汰2隻，腳傷", groundTruth: "DIRECT_OPERATIONAL", expectedOperational: { type: "cull", quantity: 2 } },
  { id: "D05", text: "金雞測試場今天早上死3隻", groundTruth: "DIRECT_OPERATIONAL", expectedOperational: { type: "mortality", quantity: 3 } },
  { id: "D06", text: "那個死亡3隻先記著，不是新增一筆", groundTruth: "SUPPORT_DUPLICATE_REFERENCE", expectedOperational: { type: "mortality", quantity: 3 } },
  { id: "D07", text: "我晚點去吃飯，金雞測試場剛剛又死1隻", groundTruth: "MIXED_OPERATIONAL", expectedOperational: { type: "mortality", quantity: 1 } },
  { id: "D08", text: "4個人", groundTruth: "CHAT", expectedOperational: null },
] as const;

function messagesFor(ids: string[]): AmbientBufferedMessage[] {
  return fixtureRows.filter((row) => ids.includes(row.id)).map((row, index) => ({
    id: row.id,
    organizationId: "eval-org",
    lineGroupId: "eval-group",
    lineUserId: "eval-user",
    lineMessageId: `eval-${row.id}`,
    eventTimestamp: `2026-08-27T00:${String(index).padStart(2, "0")}:00.000Z`,
    text: row.text,
    digestHour: "2026-08-27T08:00:00+08:00",
  }));
}

function groundTruthFor(ids: string[]) {
  return {
    messages: fixtureRows
      .filter((row) => ids.includes(row.id))
      .map((row) => ({
        id: row.id,
        groundTruth: row.groundTruth,
        expectedOperational: row.expectedOperational,
        ...(row.id === "D06" ? { sameAs: "D05" } : {}),
      })),
  };
}

export function eventDecision(ref: string, type: "mortality" | "cull" | "abnormal", quantity: number | null) {
  return {
    ref,
    kind: "event" as const,
    type,
    quantity: type === "abnormal" ? null : quantity,
    quantityConfidence: quantity === null ? "unknown" as const : "high" as const,
    raw: type === "abnormal" ? "一直咳" : `${type === "cull" ? "淘汰" : "死"}${quantity}隻`,
    confidence: "high" as const,
    farmText: "金雞測試場",
  };
}

export function decisionForFixtureId(id: string, refFor: (messageId: string) => string): Record<string, unknown> {
  switch (id) {
    case "D02": return eventDecision(refFor(id), "mortality", 2);
    case "D03": return { ...eventDecision(refFor(id), "abnormal", null), confidence: "medium" };
    case "D04": return eventDecision(refFor(id), "cull", 2);
    case "D05": return eventDecision(refFor(id), "mortality", 3);
    case "D06": return { ref: refFor(id), kind: "support", targetRef: refFor("D05") };
    case "D07": return eventDecision(refFor(id), "mortality", 1);
    default: throw new Error(`no semantic fixture for ${id}`);
  }
}

function validCase(name: string, ids: string[]): AmbientSemanticEvalCase {
  const selectedIds = ids.filter((id) => id !== "D01" && id !== "D08");
  return {
    name,
    messages: messagesFor(ids),
    groundTruth: groundTruthFor(ids),
    responseForRun: ({ sourceRefFor }) => JSON.stringify({
      decisions: selectedIds.map((id) => decisionForFixtureId(id, sourceRefFor)),
    }),
  };
}

export const smokeD03 = validCase("D03_ALONE", ["D03"]);
export const smokeD05 = validCase("D05_ALONE", ["D05"]);
export const smokeD05D06 = validCase("D05_D06", ["D05", "D06"]);
export const smokeFull = validCase("FULL_SELECTED", ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08"]);
export const fixtureCases = [smokeD03, smokeD05D06, smokeFull] as const;
