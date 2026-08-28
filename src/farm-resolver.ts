import { normalize } from "./core";

export interface FarmRecord {
  id: string;
  name: string;
  active?: number | boolean;
  environment?: "production" | "test";
  siteName?: string | null;
  structureMode?: "whole_farm" | "multi_house";
  note?: string | null;
  version?: number;
}

export interface FarmAliasRecord {
  farmId: string;
  alias: string;
  normalizedAlias: string;
  aliasType: "manual" | "short_name" | "homophone" | "learned";
  status: "trusted" | "candidate" | "disabled";
}

export interface FarmCandidate {
  farmId: string;
  farmName: string;
  score: number;
  reason: "alias_candidate" | "fuzzy" | "substring" | "phonetic";
  environment?: "production" | "test";
}

export interface FarmResolution {
  kind: "direct" | "candidates" | "none";
  rawFarmText: string;
  normalizedFarmText: string;
  farm?: FarmRecord;
  candidates: FarmCandidate[];
}

// This is only a stable display tie-breaker. It never selects a farm for a write.
const CANONICAL_ORDER = [
  "林志騰二林場",
  "林志騰東勢場",
  "廖纔藝場",
  "陳駿榜龍潭場",
  "洪秀美場",
  "黃惠玲太保場",
  "林楷威場",
  "洪嘉卿場",
];

export function canonicalFarmKey(value: string): string {
  return normalize(value).replace(/\s+/gu, "");
}

export function normalizedFarmKey(value: string): string {
  let result = canonicalFarmKey(value);
  for (let pass = 0; pass < 2; pass += 1) {
    result = result.replace(/(?:雞場|鸡场|牧場|牧场|場|场)$/u, "");
  }
  return result;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return 0.82 + Math.min(left.length, right.length) / Math.max(left.length, right.length) * 0.12;
  }
  const distance = levenshtein(left, right);
  const editScore = 1 - distance / Math.max(left.length, right.length);
  const common = Array.from(left).filter((character) => right.includes(character)).length;
  const overlapScore = common / Math.max(left.length, right.length);
  return Math.max(editScore, overlapScore * 0.9);
}

function orderCandidates(candidates: FarmCandidate[]): FarmCandidate[] {
  return candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftOrder = CANONICAL_ORDER.indexOf(left.farmName);
    const rightOrder = CANONICAL_ORDER.indexOf(right.farmName);
    return (leftOrder < 0 ? 999 : leftOrder) - (rightOrder < 0 ? 999 : rightOrder);
  });
}

export class FarmResolver {
  constructor(
    private readonly farms: FarmRecord[],
    private readonly aliases: FarmAliasRecord[] = [],
  ) {}

  allCandidates(): FarmCandidate[] {
    return this.farms
      .filter((farm) => farm.active !== 0 && farm.active !== false)
      .map((farm) => ({
        farmId: farm.id,
        farmName: farm.name,
        score: 0,
        reason: "substring" as const,
        environment: farm.environment,
      }))
      .sort((left, right) => {
        const leftOrder = CANONICAL_ORDER.indexOf(left.farmName);
        const rightOrder = CANONICAL_ORDER.indexOf(right.farmName);
        return (leftOrder < 0 ? 999 : leftOrder) - (rightOrder < 0 ? 999 : rightOrder);
      });
  }

  resolve(rawFarmText: string): FarmResolution {
    const raw = normalize(rawFarmText);
    const normalized = normalizedFarmKey(raw);
    const activeFarms = this.farms.filter((farm) => farm.active !== 0 && farm.active !== false);
    if (!raw || normalized.length < 2) {
      return { kind: "none", rawFarmText: raw, normalizedFarmText: normalized, candidates: [] };
    }

    const canonical = activeFarms.filter((farm) => canonicalFarmKey(farm.name) === canonicalFarmKey(raw));
    if (canonical.length === 1) {
      return { kind: "direct", rawFarmText: raw, normalizedFarmText: normalized, farm: canonical[0], candidates: [] };
    }

    const normalizedMatches = activeFarms.filter((farm) => normalizedFarmKey(farm.name) === normalized);
    if (normalizedMatches.length === 1) {
      return { kind: "direct", rawFarmText: raw, normalizedFarmText: normalized, farm: normalizedMatches[0], candidates: [] };
    }

    const siteMatches = activeFarms.filter((farm) => {
      if (!farm.siteName) return false;
      return canonicalFarmKey(farm.siteName) === canonicalFarmKey(raw) || normalizedFarmKey(farm.siteName) === normalized;
    });
    if (siteMatches.length === 1) {
      return { kind: "direct", rawFarmText: raw, normalizedFarmText: normalized, farm: siteMatches[0], candidates: [] };
    }
    if (siteMatches.length > 1) {
      return {
        kind: "candidates",
        rawFarmText: raw,
        normalizedFarmText: normalized,
        candidates: orderCandidates(siteMatches.map((farm) => ({
          farmId: farm.id,
          farmName: farm.name,
          score: 1,
          reason: "substring" as const,
          environment: farm.environment,
        }))),
      };
    }

    const trustedAliases = this.aliases.filter(
      (alias) => alias.status === "trusted" && normalizedFarmKey(alias.normalizedAlias || alias.alias) === normalized,
    );
    const trustedFarms = activeFarms.filter((farm) => trustedAliases.some((alias) => alias.farmId === farm.id));
    if (trustedFarms.length === 1) {
      return { kind: "direct", rawFarmText: raw, normalizedFarmText: normalized, farm: trustedFarms[0], candidates: [] };
    }

    const candidateMap = new Map<string, FarmCandidate>();
    for (const alias of this.aliases.filter((item) => item.status === "candidate")) {
      if (normalizedFarmKey(alias.normalizedAlias || alias.alias) === normalized) {
        const farm = activeFarms.find((item) => item.id === alias.farmId);
        if (farm) candidateMap.set(farm.id, {
          farmId: farm.id,
          farmName: farm.name,
          score: 0.92,
          reason: "alias_candidate",
          environment: farm.environment,
        });
      }
    }

    for (const farm of activeFarms) {
      const farmKey = normalizedFarmKey(farm.name);
      const score = similarity(normalized, farmKey);
      const reason = normalized.includes(farmKey) || farmKey.includes(normalized) ? "substring" : "fuzzy";
      if (score >= 0.45) {
        const existing = candidateMap.get(farm.id);
        if (!existing || score > existing.score) {
          candidateMap.set(farm.id, { farmId: farm.id, farmName: farm.name, score, reason, environment: farm.environment });
        }
      }
    }

    const candidates = orderCandidates([...candidateMap.values()]);
    if (!candidates.length) {
      return { kind: "none", rawFarmText: raw, normalizedFarmText: normalized, candidates: [] };
    }
    const topScore = candidates[0].score;
    const safeCandidates = candidates.filter((candidate) => candidate.score >= topScore - 0.16).slice(0, 4);
    return { kind: "candidates", rawFarmText: raw, normalizedFarmText: normalized, candidates: safeCandidates };
  }
}
