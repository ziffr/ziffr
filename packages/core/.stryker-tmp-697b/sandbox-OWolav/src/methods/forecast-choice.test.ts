// @ts-nocheck
// The forecast a widget uses (spec 0041, ticket 6): Holt where the rule says Holt, exactly what forecast.ts gives plus each point's
// spread; Holt-Winters where it says so, exactly what holtWinters gives; the choice and its reason with it.
import { describe, expect, it } from "vitest";
import { forecast, HORIZON, holtSpreadFactor } from "../forecast";
import { exactOf, fraction, nearestDoubleOf, type Exact } from "../test/reference/exact";
import { referenceHoltFactor, referenceHoltFactorClosed, referenceHoltRun } from "../test/reference/forecast";
import { months } from "../test/fixtures";
import { bestForecast } from "./forecast-choice";
import { Z80 } from "./normal-curve";
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
    // Holt's own model: the one-step variance times 1 + Σ c(j)², with c(j) = α(1 + jβ), not √h (at 12 ahead 5.0 one-step spreads, not 3.46).
    const ref = referenceHoltRun(pts.map((p) => exactOf(p.value)));
    const msq = over(ref.squares, fraction(BigInt(pts.length - 1), 1n));
    expect(best.points.map((p) => p.sd)).toEqual(holt.points.map((_, i) => Math.sqrt(nearestDoubleOf(times(msq, referenceHoltFactor(i + 1))))));
    // Twelve ahead the model is wider than √12 one-step spreads.
    expect(bestForecast(pts, "month", 12, { horizon: 12 })!.points[11].sd).toBeGreaterThan(holt.sd * Math.sqrt(12));
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
  it("looks at the latest 120 periods, one step either side", () => {
    const long = line(200);
    expect(bestForecast(long, "month", 12)).toEqual(bestForecast(long.slice(-120), "month", 12));
    expect(bestForecast(long, "month", 12)).not.toEqual(bestForecast(long.slice(-119), "month", 12));
  });
  it("is the same twice", () => {
    expect(bestForecast(season(20), "month", 4)).toEqual(bestForecast(season(20), "month", 4));
  });
});

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const over = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);

describe("Holt's spread h periods ahead", () => {
  it("is the model's factor, exactly: 1, 1.4225, 2.0625 by hand (c(1) = 0.65, c(2) = 0.8), the impulse response and the closed form agreeing, and 25 at the twelfth", () => {
    const [hand2, hand3] = [exactOf("1.4225"), exactOf("2.0625")];
    expect(referenceHoltFactor(2)).toEqual(hand2);
    expect(referenceHoltFactor(3)).toEqual(hand3);
    for (let h = 1; h <= 30; h++) {
      expect(referenceHoltFactor(h), String(h)).toEqual(referenceHoltFactorClosed(h));
      const code = holtSpreadFactor(h);
      expect(code.num * referenceHoltFactor(h).den, String(h)).toBe(referenceHoltFactor(h).num * code.den);
    }
    expect(Math.sqrt(Number(holtSpreadFactor(12).num) / Number(holtSpreadFactor(12).den))).toBeCloseTo(5.0, 1);
  });
});

describe("Holt's range holds as often as it says, at every step ahead (a simulation on its own model)", () => {
  // Series made by the model itself: l ← l + b + α·e, b ← b + α·β·e, with normal misses e, seeded (Box-Muller over a 32-bit mixer).
  const normal = (seedNumber: number) => {
    let a = seedNumber >>> 0;
    const uniform = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  };
  it("an 80 % range holds for 74 % to 86 % of 800 series at 1, 3 and 12 periods ahead (the old √h range held 91 % at 3)", () => {
    const [N, n] = [800, 36];
    const draw = normal(699);
    const inside = { 1: 0, 3: 0, 12: 0 } as Record<number, number>;
    for (let r = 0; r < N; r++) {
      let [level, trend] = [50, 2];
      const ys: number[] = [];
      for (let t = 0; t < n + 12; t++) {
        const e = 3 * draw();
        ys.push(Math.round((level + trend + e) * 100) / 100);
        [level, trend] = [level + trend + 0.5 * e, trend + 0.5 * 0.3 * e];
      }
      const best = bestForecast(months("2000-01", ys.slice(0, n)), "month", 12, { horizon: 12, seasonal: false })!;
      for (const h of [1, 3, 12]) if (Math.abs(ys[n + h - 1] - best.points[h - 1].value) <= Z80 * best.points[h - 1].sd) inside[h]++;
    }
    for (const h of [1, 3, 12]) {
      expect(inside[h] / N, `h=${h}`).toBeGreaterThan(0.74);
      expect(inside[h] / N, `h=${h}`).toBeLessThan(0.86);
    }
  });
});
