// The forecast a widget uses (spec 0041, ticket 6): Holt where the rule says Holt, exactly what forecast.ts gives plus each point's
// spread; Holt-Winters where it says so, exactly what holtWinters gives; the choice and its reason with it.
import { describe, expect, it } from "vitest";
import { forecast, HORIZON } from "../forecast";
import { months } from "../test/fixtures";
import { bestForecast } from "./forecast-choice";
import { holtWinters } from "./holt-winters";
import { chooseMethod } from "./track-record";

const season = (n: number) => months("2020-01", Array.from({ length: n }, (_, t) => 10 + 2.5 * t + [-3, 1, 4, -2][t % 4]));
const line = (n: number) => months("2020-01", Array.from({ length: n }, (_, t) => 10 + 2 * t + (t % 3)));

describe("the forecast of the Method the rule chooses", () => {
  it("is Holt's, with each point's spread, where the seasonal Method cannot run (the points of forecast.ts, untouched)", () => {
    const pts = line(10);
    const best = bestForecast(pts, "month", 12)!;
    const holt = forecast(pts, "month")!;
    expect(best.method).toBe("holt");
    expect(best.choice.why).toBe("holt-only");
    expect(best.points.map((p) => ({ period: p.period, value: p.value, lo: p.lo, hi: p.hi }))).toEqual(holt.points);
    expect(best.points.map((p) => p.sd)).toEqual(holt.points.map((_, i) => holt.sd * Math.sqrt(i + 1)));
    expect(best.trendPerPeriod).toBe(holt.trendPerPeriod);
    expect(best.sd).toBe(holt.sd);
  });
  it("is Holt-Winters', exactly, where it misses less on the last third", () => {
    const pts = season(20);
    const best = bestForecast(pts, "month", 4)!;
    const hw = holtWinters(pts, "month", 4);
    expect(best.method).toBe("holtWinters");
    expect(best.choice.why).toBe("better");
    expect(hw.ok && best.points).toEqual(hw.ok && hw.points);
    expect(best.points).toHaveLength(HORIZON.month);
    expect(hw.ok && best.sd).toBe(hw.ok && hw.sd);
  });
  it("looks as far ahead as it is asked, and by the span's own horizon where not", () => {
    expect(bestForecast(season(20), "month", 4, { horizon: 6 })!.points).toHaveLength(6);
    expect(bestForecast(line(10), "month", 12, { horizon: 5 })!.points.map((p) => p.period)).toEqual(["2020-11-01", "2020-12-01", "2021-01-01", "2021-02-01", "2021-03-01"]);
    expect(bestForecast(line(10), "quarter", 4)!.points).toHaveLength(HORIZON.quarter);
  });
  it("is Holt's where the seasonal Method is ruled out (the yearly pattern did not repeat), and says so in the choice", () => {
    const best = bestForecast(season(20), "month", 4, { seasonal: false })!;
    expect(best.method).toBe("holt");
    expect(best.choice).toEqual({ method: "holt", why: "holt-only", holt: null, seasonal: null });
    expect(best.points.map((p) => ({ period: p.period, value: p.value, lo: p.lo, hi: p.hi }))).toEqual(forecast(season(20), "month")!.points);
  });
  it("carries the choice the rule made, with both Methods' records", () => {
    const pts = season(20);
    expect(bestForecast(pts, "month", 4)!.choice).toEqual(chooseMethod(pts, "month", 4));
  });
  it("is nothing for fewer than four values, one step either side", () => {
    expect(bestForecast(line(3), "month", 12)).toBeNull();
    expect(bestForecast(line(4), "month", 12)).not.toBeNull();
    expect(bestForecast([], "month", 12)).toBeNull();
    expect(bestForecast(season(20), "month", 4, { seasonal: false })).not.toBeNull();
  });
  it("is the same twice", () => {
    expect(bestForecast(season(20), "month", 4)).toEqual(bestForecast(season(20), "month", 4));
  });
});
