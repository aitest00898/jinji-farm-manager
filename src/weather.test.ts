import { describe, expect, it } from "vitest";
import { parseOpenMeteoDaily, runWeatherDailyJob, weatherConditionFromCode } from "./weather";

describe("daily weather provider contract", () => {
  it("stores one daily summary and derives extrema clock labels", () => {
    const summary = parseOpenMeteoDaily({
      daily: {
        time: ["2026-08-19"],
        weather_code: [1],
        temperature_2m_max: [35.8],
        temperature_2m_min: [25.1],
      },
      hourly: {
        time: ["2026-08-19T05:00", "2026-08-19T14:00", "2026-08-19T15:00"],
        temperature_2m: [25.1, 35.8, 35.2],
      },
    }, "2026-08-19");
    expect(summary).toEqual({
      weatherDate: "2026-08-19",
      condition: "晴時多雲",
      maxTemperatureC: 35.8,
      maxTemperatureAt: "14:00",
      minTemperatureC: 25.1,
      minTemperatureAt: "05:00",
    });
  });

  it("rejects malformed or missing daily data", () => {
    expect(parseOpenMeteoDaily({}, "2026-08-19")).toBeNull();
    expect(weatherConditionFromCode(95)).toBe("雷雨");
  });

  it("fetches one shared Yunlin scope summary instead of one request per farm", async () => {
    const calls: Array<[number, number, string]> = [];
    const scope = {
      id: "weather-scope-yunlin-county-tw",
      scopeKey: "yunlin-county-tw",
      label: "雲林縣",
      country: "Taiwan",
      latitude: 23.70944,
      longitude: 120.54333,
      provider: "open-meteo",
    };
    const provider = {
      name: "open-meteo",
      async fetchDaily(latitude: number, longitude: number, date: string) {
        calls.push([latitude, longitude, date]);
        return {
          weatherDate: date,
          condition: "晴",
          maxTemperatureC: 35.8,
          maxTemperatureAt: "14:00",
          minTemperatureC: 25.1,
          minTemperatureAt: "05:00",
        };
      },
    };
    const db = {
      prepare(sql: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (sql.includes("FROM weather_scopes")) return scope as T;
            if (sql.includes("FROM weather_scope_daily")) return null;
            return null;
          },
          async run() {
            void bindings;
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    } as unknown as D1Database;

    const result = await runWeatherDailyJob(
      { DB: db },
      provider,
      new Date("2026-08-20T00:30:00+08:00"),
    );

    expect(result).toMatchObject({ targetDate: "2026-08-19", captured: 1, apiRequests: 1, scope: "雲林縣" });
    expect(calls).toEqual([[23.70944, 120.54333, "2026-08-19"]]);
  });
});
