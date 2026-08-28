export const OPERATIONAL_MASTER_TIME_ZONE = "Asia/Taipei";

export interface StockAdjustment {
  intent: "mortality" | "cull" | "shipment";
  quantity: number;
}

export type ShipmentReminder = "overdue" | "today" | "one_day" | "seven_days" | null;

function isoDateParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return [year, month, day];
}

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && isoDateParts(value) !== null;
}

export function taipeiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATIONAL_MASTER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addIsoDays(value: string, days: number): string {
  const parts = isoDateParts(value);
  if (!parts) throw new Error("invalid_iso_date");
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return date.toISOString().slice(0, 10);
}

export function differenceInDays(start: string, end: string): number {
  const startParts = isoDateParts(start);
  const endParts = isoDateParts(end);
  if (!startParts || !endParts) throw new Error("invalid_iso_date");
  const startMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const endMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
  return Math.floor((endMs - startMs) / 86_400_000);
}

export function flockAgeDays(chickInDate: string, asOf = taipeiDate()): number {
  return Math.max(0, differenceInDays(chickInDate, asOf));
}

export function deriveCurrentStock(initialCount: number, adjustments: StockAdjustment[]): number {
  const removed = adjustments.reduce((sum, adjustment) => {
    if (!Number.isFinite(adjustment.quantity) || adjustment.quantity <= 0) return sum;
    return sum + adjustment.quantity;
  }, 0);
  return Math.max(0, initialCount - removed);
}

export function shipmentReminder(expectedDate: string | null | undefined, asOf = taipeiDate()): ShipmentReminder {
  if (!expectedDate || !isIsoDate(expectedDate)) return null;
  const daysUntil = differenceInDays(asOf, expectedDate);
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "one_day";
  if (daysUntil <= 7) return "seven_days";
  return null;
}

export function normalizedHouseName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/gu, "").trim();
  const match = /^(\d+)舍$/iu.exec(normalized);
  return match ? `${Number(match[1])}舍` : normalized;
}
