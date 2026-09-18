export const OPERATIONAL_MASTER_TIME_ZONE = "Asia/Taipei";

export interface StockAdjustment {
  intent: "mortality" | "cull" | "shipment";
  quantity: number;
}

/**
 * Selects effective operational facts for read-only aggregates.
 *
 * Operational correction/reversal is append-only: the child row carries the
 * replacement or reversal relation while the original row remains in D1.
 * Aggregates must therefore ignore reversal children and superseded parents,
 * while retaining an active correction child exactly once.  The alias is a
 * source-controlled SQL alias, never user input.
 */
export function effectiveOperationalEventPredicate(alias = "e"): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(alias)) throw new Error("invalid_operational_event_sql_alias");
  const reversalChild = `${alias}_reversal_child`;
  const correctionChild = `${alias}_correction_child`;
  return [
    `${alias}.reversed_at IS NULL`,
    `${alias}.reversal_of_event_id IS NULL`,
    `NOT EXISTS (SELECT 1 FROM operational_events ${reversalChild} WHERE ${reversalChild}.reversal_of_event_id = ${alias}.id)`,
    `NOT EXISTS (SELECT 1 FROM operational_events ${correctionChild} WHERE ${correctionChild}.correction_of_event_id = ${alias}.id)`,
  ].join(" AND ");
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

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  兩: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CHINESE_UNITS: Readonly<Record<string, number>> = {
  十: 10,
  百: 100,
  千: 1_000,
  萬: 10_000,
  万: 10_000,
  億: 100_000_000,
  亿: 100_000_000,
};

function chineseNumeralToArabic(value: string): string {
  if (!value) return value;
  if ([...value].every((character) => character in CHINESE_DIGITS)) {
    return [...value].map((character) => String(CHINESE_DIGITS[character])).join("");
  }
  let total = 0;
  let section = 0;
  let number = 0;
  for (const character of value) {
    const digit = CHINESE_DIGITS[character];
    if (digit !== undefined) {
      number = digit;
      continue;
    }
    const unit = CHINESE_UNITS[character];
    if (unit === undefined) return value;
    if (unit < 10_000) {
      section += (number || 1) * unit;
      number = 0;
    } else {
      section += number;
      total += (section || 1) * unit;
      section = 0;
      number = 0;
    }
  }
  return String(total + section + number);
}

function normalizeEntityText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/[零〇一二兩两三四五六七八九十百千萬万億亿]+/gu, chineseNumeralToArabic)
    .replace(/\s+/gu, "")
    .trim();
}

/** A comparison key shared by farm, house, and active-flock resolution. */
export function canonicalEntityKey(value: string): string {
  return normalizeEntityText(value)
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLocaleLowerCase();
}

/**
 * Returns only a small, source-controlled set of common Chinese confusions.
 * This is intentionally bounded; it is not a general fuzzy-search index.
 */
export function entityVariantKeys(value: string): string[] {
  const canonical = canonicalEntityKey(value);
  const variants = new Set<string>([canonical]);
  const groups = [
    ["測", "测"],
    ["試", "试", "式"],
    ["雞", "鸡"],
    ["場", "场"],
    ["舍", "舎"],
  ];
  const characters = [...canonical];
  characters.forEach((character, index) => {
    const group = groups.find((members) => members.includes(character));
    if (!group) return;
    for (const replacement of group) {
      if (replacement === character) continue;
      variants.add(`${characters.slice(0, index).join("")}${replacement}${characters.slice(index + 1).join("")}`);
    }
  });
  return [...variants];
}

export function normalizedHouseName(value: string): string {
  const normalized = normalizeEntityText(value);
  const match = /^(\d+)舍$/iu.exec(normalized);
  return match ? `${Number(match[1])}舍` : normalized;
}

export function canonicalHouseName(value: string): string | null {
  const normalized = normalizedHouseName(value);
  return /^(?:[\p{L}\p{N}_-]{1,18})舍$/u.test(normalized) ? normalized : null;
}

const FARM_SPACED_HOUSE_TOKEN = /(?:雞場|鸡场|場|场)\s+([\p{L}_-]{1,18}\s+[0-9零〇一二兩两三四五六七八九十百千萬万億亿]+(?:\s+[0-9零〇一二兩两三四五六七八九十百千萬万億亿]+)*\s*舍)/gu;
const STANDALONE_SPACED_HOUSE_TOKEN = /^([\p{L}_-]{1,18}\s+[0-9零〇一二兩两三四五六七八九十百千萬万億亿]+(?:\s+[0-9零〇一二兩两三四五六七八九十百千萬万億亿]+)*\s*舍)$/u;
const COMPACT_HOUSE_TOKEN = /([\p{L}\p{N}_-]{1,18}\s*舍)/u;

/** Extracts one house token while preserving enough context for farm parsing. */
export function extractHouseNameToken(value: string): string | null {
  const text = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, "");
  const farmSeparated = [...text.matchAll(FARM_SPACED_HOUSE_TOKEN)].at(-1)?.[1];
  const spaced = farmSeparated ?? text.trim().match(STANDALONE_SPACED_HOUSE_TOKEN)?.[1];
  if (spaced) return spaced;
  const farmBoundary = Math.max(text.lastIndexOf("場"), text.lastIndexOf("场"));
  if (farmBoundary >= 0) {
    const compactAfterFarm = text.slice(farmBoundary + 1).match(COMPACT_HOUSE_TOKEN)?.[1];
    if (compactAfterFarm) return compactAfterFarm;
  }
  return text.match(COMPACT_HOUSE_TOKEN)?.[1] ?? null;
}

export interface NamedMasterRecord {
  id: string;
  name: string;
}

export interface NamedMasterCandidate<T extends NamedMasterRecord = NamedMasterRecord> {
  record: T;
  score: number;
  reason: "exact" | "variant" | "fuzzy" | "substring";
}

export interface NamedMasterResolution<T extends NamedMasterRecord = NamedMasterRecord> {
  kind: "direct" | "candidates" | "none";
  rawText: string;
  normalizedText: string;
  record?: T;
  candidates: NamedMasterCandidate<T>[];
}

function namedLevenshtein(left: string, right: string): number {
  const previous = Array.from({ length: [...right].length + 1 }, (_, index) => index);
  const rightCharacters = [...right];
  const leftCharacters = [...left];
  for (let row = 1; row <= leftCharacters.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= rightCharacters.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (leftCharacters[row - 1] === rightCharacters[column - 1] ? 0 : 1),
      );
    }
    for (let column = 0; column <= rightCharacters.length; column += 1) previous[column] = current[column];
  }
  return previous[rightCharacters.length];
}

function namedSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return 0.82 + Math.min(left.length, right.length) / Math.max(left.length, right.length) * 0.12;
  }
  const distance = namedLevenshtein(left, right);
  const editScore = 1 - distance / Math.max(left.length, right.length);
  const common = [...left].filter((character) => right.includes(character)).length;
  return Math.max(editScore, common / Math.max(left.length, right.length) * 0.9);
}

function sortNamedCandidates<T extends NamedMasterRecord>(candidates: NamedMasterCandidate<T>[]): NamedMasterCandidate<T>[] {
  return candidates.sort((left, right) => right.score - left.score || left.record.name.localeCompare(right.record.name) || left.record.id.localeCompare(right.record.id));
}

/**
 * Resolves an already-loaded, organization- and lifecycle-scoped master-data
 * list. A direct result is returned only for a unique exact/controlled
 * variant or a high-confidence fuzzy match with a meaningful score margin.
 */
export function resolveNamedMasterRecord<T extends NamedMasterRecord>(records: T[], rawText: string): NamedMasterResolution<T> {
  const normalizedText = canonicalEntityKey(rawText);
  const base = { rawText, normalizedText };
  if (!normalizedText) return { ...base, kind: "none", candidates: [] };

  const exact = records.filter((record) => canonicalEntityKey(record.name) === normalizedText);
  if (exact.length === 1) return { ...base, kind: "direct", record: exact[0], candidates: [] };
  if (exact.length > 1) {
    return {
      ...base,
      kind: "candidates",
      candidates: exact.map((record) => ({ record, score: 1, reason: "exact" as const })),
    };
  }

  const variantMatches = records.filter((record) => entityVariantKeys(record.name).includes(normalizedText));
  if (variantMatches.length === 1) {
    return { ...base, kind: "direct", record: variantMatches[0], candidates: [] };
  }
  if (variantMatches.length > 1) {
    return {
      ...base,
      kind: "candidates",
      candidates: variantMatches.map((record) => ({ record, score: 0.94, reason: "variant" as const })),
    };
  }

  const scored = sortNamedCandidates(records.flatMap((record) => {
    const key = canonicalEntityKey(record.name);
    const score = namedSimilarity(normalizedText, key);
    if (score < 0.45) return [];
    const reason = normalizedText.includes(key) || key.includes(normalizedText) ? "substring" : "fuzzy";
    return [{ record, score, reason }];
  }));
  if (!scored.length) return { ...base, kind: "none", candidates: [] };
  const topScore = scored[0].score;
  const secondScore = scored[1]?.score ?? 0;
  if (topScore >= 0.9 && topScore - secondScore >= 0.12) {
    return { ...base, kind: "direct", record: scored[0].record, candidates: [] };
  }
  return {
    ...base,
    kind: "candidates",
    candidates: scored.filter((candidate) => candidate.score >= topScore - 0.16).slice(0, 4),
  };
}
