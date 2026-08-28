import { addIsoDays, isIsoDate, taipeiDate } from "./master-data";

export const WEATHER_PROVIDER_NAME = "open-meteo";

export interface WeatherDailySummary {
  weatherDate: string;
  condition: string | null;
  maxTemperatureC: number;
  maxTemperatureAt: string | null;
  minTemperatureC: number;
  minTemperatureAt: string | null;
}

export interface WeatherFarm {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface WeatherScope {
  id: string;
  scopeKey: string;
  label: string;
  country: string;
  latitude: number;
  longitude: number;
  provider: string;
}

export interface WeatherEnv {
  DB: D1Database;
}

export interface WeatherProvider {
  readonly name: string;
  fetchDaily(latitude: number, longitude: number, date: string): Promise<WeatherDailySummary>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OpenMeteoPayload {
  daily?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
  };
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
  };
}

function numericArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return value as number[];
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value as string[];
}

export function weatherConditionFromCode(code: number | null): string | null {
  if (code === null || !Number.isFinite(code)) return null;
  if (code === 0) return "晴";
  if (code === 1 || code === 2) return "晴時多雲";
  if (code === 3) return "陰";
  if (code === 45 || code === 48) return "霧";
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "雨";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "雪";
  if (code >= 95) return "雷雨";
  return "其他";
}

function extremumTime(times: string[], temperatures: number[], date: string, kind: "max" | "min"): string | null {
  let chosenIndex = -1;
  let chosen = kind === "max" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (let index = 0; index < Math.min(times.length, temperatures.length); index += 1) {
    if (!times[index].startsWith(`${date}T`)) continue;
    const value = temperatures[index];
    if ((kind === "max" && value > chosen) || (kind === "min" && value < chosen)) {
      chosen = value;
      chosenIndex = index;
    }
  }
  if (chosenIndex < 0) return null;
  return times[chosenIndex].slice(11, 16);
}

export function parseOpenMeteoDaily(payload: unknown, date: string): WeatherDailySummary | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) || !isIsoDate(date)) return null;
  const value = payload as OpenMeteoPayload;
  const dates = stringArray(value.daily?.time);
  const maxValues = numericArray(value.daily?.temperature_2m_max);
  const minValues = numericArray(value.daily?.temperature_2m_min);
  const weatherCodes = numericArray(value.daily?.weather_code);
  if (!dates || !maxValues || !minValues || !weatherCodes) return null;
  const dailyIndex = dates.indexOf(date);
  if (dailyIndex < 0 || maxValues[dailyIndex] === undefined || minValues[dailyIndex] === undefined) return null;
  const hourlyTimes = stringArray(value.hourly?.time) ?? [];
  const hourlyTemperatures = numericArray(value.hourly?.temperature_2m) ?? [];
  return {
    weatherDate: date,
    condition: weatherConditionFromCode(weatherCodes[dailyIndex] ?? null),
    maxTemperatureC: maxValues[dailyIndex],
    maxTemperatureAt: extremumTime(hourlyTimes, hourlyTemperatures, date, "max"),
    minTemperatureC: minValues[dailyIndex],
    minTemperatureAt: extremumTime(hourlyTimes, hourlyTemperatures, date, "min"),
  };
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = WEATHER_PROVIDER_NAME;

  constructor(private readonly fetcher: FetchLike = fetch) {}

  async fetchDaily(latitude: number, longitude: number, date: string): Promise<WeatherDailySummary> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !isIsoDate(date)) {
      throw new Error("invalid_weather_request");
    }
    const recentThreshold = addIsoDays(taipeiDate(), -5);
    const endpoint = date >= recentThreshold
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive";
    const url = new URL(endpoint);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    // Hourly temperature is used transiently only to identify the max/min
    // clock time. It is never stored in D1.
    url.searchParams.set("hourly", "temperature_2m");
    url.searchParams.set("timezone", "Asia/Taipei");
    const response = await this.fetcher(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`weather_http_${response.status}`);
    const parsed = parseOpenMeteoDaily(await response.json(), date);
    if (!parsed) throw new Error("weather_payload_invalid");
    return parsed;
  }
}

function weatherRowId(farmId: string, date: string): string {
  return `weather-${farmId}-${date}`;
}

function weatherScopeRowId(scopeId: string, date: string): string {
  return `weather-scope-${scopeId}-${date}`;
}

async function upsertWeatherStatus(
  env: WeatherEnv,
  farmId: string,
  date: string,
  status: "pending" | "captured" | "backfilled" | "failed" | "location_missing",
  summary: WeatherDailySummary | null,
  errorCode: string | null,
  provider = WEATHER_PROVIDER_NAME,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO weather_daily
      (id, farm_id, weather_date, weather_condition, max_temperature_c, max_temperature_at,
       min_temperature_c, min_temperature_at, provider, fetch_status, error_code, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IN ('captured', 'backfilled') THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
     ON CONFLICT(farm_id, weather_date) DO UPDATE SET
       weather_condition = excluded.weather_condition,
       max_temperature_c = excluded.max_temperature_c,
       max_temperature_at = excluded.max_temperature_at,
       min_temperature_c = excluded.min_temperature_c,
       min_temperature_at = excluded.min_temperature_at,
       provider = excluded.provider,
       fetch_status = excluded.fetch_status,
       error_code = excluded.error_code,
       fetched_at = excluded.fetched_at,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    weatherRowId(farmId, date),
    farmId,
    date,
    summary?.condition ?? null,
    summary?.maxTemperatureC ?? null,
    summary?.maxTemperatureAt ?? null,
    summary?.minTemperatureC ?? null,
    summary?.minTemperatureAt ?? null,
    provider,
    status,
    errorCode,
    status,
  ).run();
}

function safeWeatherError(error: unknown): string {
  const message = error instanceof Error ? error.message : "weather_unknown";
  return /^(?:weather_http_\d{3}|weather_payload_invalid|invalid_weather_request)$/u.test(message) ? message : "weather_provider_failed";
}

export async function captureWeatherDaily(
  env: WeatherEnv,
  provider: WeatherProvider,
  farm: WeatherFarm,
  date: string,
  backfill = false,
): Promise<"captured" | "backfilled" | "failed" | "location_missing"> {
  if (!isIsoDate(date)) throw new Error("invalid_weather_date");
  if (farm.latitude === null || farm.longitude === null) {
    await upsertWeatherStatus(env, farm.id, date, "location_missing", null, "WEATHER_LOCATION_MISSING", provider.name);
    return "location_missing";
  }
  await upsertWeatherStatus(env, farm.id, date, "pending", null, null, provider.name);
  try {
    const summary = await provider.fetchDaily(farm.latitude, farm.longitude, date);
    const status = backfill ? "backfilled" : "captured";
    await upsertWeatherStatus(env, farm.id, date, status, summary, null, provider.name);
    return status;
  } catch (error) {
    await upsertWeatherStatus(env, farm.id, date, "failed", null, safeWeatherError(error), provider.name);
    return "failed";
  }
}

export interface WeatherJobResult {
  targetDate: string;
  captured: number;
  backfilled: number;
  failed: number;
  locationMissing: number;
  apiRequests: number;
  scope: string;
}

export async function runWeatherDailyJob(
  env: WeatherEnv,
  provider: WeatherProvider = new OpenMeteoWeatherProvider(),
  now = new Date(),
): Promise<WeatherJobResult> {
  const targetDate = addIsoDays(taipeiDate(now), -1);
  const result: WeatherJobResult = {
    targetDate,
    captured: 0,
    backfilled: 0,
    failed: 0,
    locationMissing: 0,
    apiRequests: 0,
    scope: "雲林縣",
  };
  const scope = await env.DB.prepare(
    `SELECT id, scope_key AS scopeKey, label, country, latitude, longitude, provider
       FROM weather_scopes WHERE scope_key = 'yunlin-county-tw' AND active = 1 LIMIT 1`,
  ).first<WeatherScope>();
  if (!scope) {
    result.locationMissing = 1;
    return result;
  }

  const captureScope = async (date: string, backfill: boolean): Promise<"captured" | "backfilled" | "failed"> => {
    const pending = env.DB.prepare(
      `INSERT INTO weather_scope_daily
        (id, weather_scope_id, weather_date, provider, fetch_status, updated_at)
       VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(weather_scope_id, weather_date) DO UPDATE SET
         provider = excluded.provider, fetch_status = 'pending', error_code = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(weatherScopeRowId(scope.id, date), scope.id, date, provider.name);
    await pending.run();
    try {
      result.apiRequests += 1;
      const summary = await provider.fetchDaily(scope.latitude, scope.longitude, date);
      const status = backfill ? "backfilled" : "captured";
      await env.DB.prepare(
        `UPDATE weather_scope_daily
            SET weather_condition = ?, max_temperature_c = ?, max_temperature_at = ?,
                min_temperature_c = ?, min_temperature_at = ?, provider = ?,
                fetch_status = ?, error_code = NULL, fetched_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE weather_scope_id = ? AND weather_date = ?`,
      ).bind(summary.condition, summary.maxTemperatureC, summary.maxTemperatureAt, summary.minTemperatureC, summary.minTemperatureAt, provider.name, status, scope.id, date).run();
      return status;
    } catch (error) {
      await env.DB.prepare(
        `UPDATE weather_scope_daily
            SET fetch_status = 'failed', error_code = ?, fetched_at = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE weather_scope_id = ? AND weather_date = ?`,
      ).bind(safeWeatherError(error), scope.id, date).run();
      return "failed";
    }
  };

  const status = await captureScope(targetDate, false);
  if (status === "captured") result.captured = 1;
  if (status === "failed") result.failed = 1;

  // Retry at most one failed recent day. This remains bounded and never
  // performs one identical request per farm.
  const missing = await env.DB.prepare(
    `SELECT weather_date AS weatherDate
       FROM weather_scope_daily
      WHERE weather_scope_id = ? AND fetch_status = 'failed'
        AND weather_date < ? AND weather_date >= ?
      ORDER BY weather_date DESC LIMIT 1`,
  ).bind(scope.id, targetDate, addIsoDays(targetDate, -7)).first<{ weatherDate: string }>();
  if (missing?.weatherDate) {
    const backfillStatus = await captureScope(missing.weatherDate, true);
    if (backfillStatus === "backfilled") result.backfilled = 1;
    if (backfillStatus === "failed") result.failed += 1;
  }
  return result;
}
