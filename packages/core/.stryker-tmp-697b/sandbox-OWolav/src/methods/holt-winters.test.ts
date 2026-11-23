// @ts-nocheck
// The seasonal forecast against its references (spec 0041, ticket 6; spec 0022, Testing Decisions): the numbers worked out by
// hand, the exact references of test/reference/forecast.ts (Holt-Winters in the error-correction form, the spread from the
// impulse response), Python's fractions and NumPy's floats from fixtures/forecast.py, generated series, the properties
// (shift, scale, order, duplicates, determinism, an exact fit recovered exactly), the hostile inputs, and a simulation that
// holds the stated 80 % range to about 80 % on series the method suits.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Fraction } from "../exact";
import { shiftPeriod } from "../periods";
import { months } from "../test/fixtures";
import { runs, shuffled, valueText } from "../test/reference/check";
import { exactOf, fraction, nearestDoubleOf, type Exact } from "../test/reference/exact";
import { referenceAhead, referenceFactor, referenceFactorClosed, referenceSeasonal, referenceVariance, Z80, type Y } from "../test/reference/forecast";
import type { Point } from "../types";
import { fitHoltWinters, holtWinters, seasonalAhead, seasonalVariance, SMOOTHING } from "./holt-winters";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
type Py = { level: string; trend: string; pattern: string[]; squares: string; errors: number; trace: { t: number; predicted: string; squares: string; errors: number }[]; ahead: { h: number; exact: string; variance: string; double: number; sd: number }[]; numpy: number[] | null };
type Case = { season: number; values: (number | null)[]; periods: string[]; canRun: boolean; holtWinters?: Py };
const CASES: Record<string, Case> = fixture.cases;

const eq = (a: Fraction, b: Exact) => a.num * b.den === b.num * a.den;
const parse = (text: string): Exact => {
  const [n, d] = text.split("/");
  return fraction(BigInt(n), BigInt(d));
};
const same = (a: Fraction, text: string) => eq(a, parse(text));
const points = (c: Case): Point[] => c.values.flatMap((value, i) => (value === null ? [] : [{ period: c.periods[i], value }]));
const exactSeries = (c: Case): Y[] => c.values.map((v) => (v === null ? null : exactOf(v)));
const fitOf = (pts: Point[], m: number) => {
  const run = fitHoltWinters(pts, "month", m);
  if (!run.ok) throw new Error(`cannot run: ${run.why}`);
  return run.fit;
};
const where = (c: Case) => `${c.season}: ${c.values}`;

describe("the fixtures", () => {
  it("were made by the current script (forecast.py), and name the tools", () => {
    const script = readFileSync(new URL("../test/reference/fixtures/forecast.py", import.meta.url));
    expect(fixture.script, "run python3 packages/core/src/test/reference/fixtures/forecast.py again").toBe(createHash("sha256").update(script).digest("hex"));
    expect(fixture.version).toBe(1);
    expect(Object.keys(fixture.tools)).toEqual(["numpy", "scipy"]);
  });
  it("hold the 80 % multiplier SciPy gives, and the factor the smoothing fixes", () => {
    expect(Z80).toBe(fixture.z80);
    expect(SMOOTHING.level).toEqual({ num: 1n, den: 2n });
    expect(SMOOTHING.trend).toEqual({ num: 1n, den: 10n });
    expect(SMOOTHING.season).toEqual({ num: 3n, den: 10n });
  });
});

describe("the reference gives what was worked out by hand", () => {
  // m = 2, y = 10, 20, 12, 24, 14, 28. Means 15 and 18, so the trend starts at (18 − 15) ÷ 2 = 1.5; the line through the first
  // season is 14.25 and 15.75, so the level starts at 15.75 and the pattern at −4.25 and +4.25.
  //  y = 12: predicted 15.75 + 1.5 − 4.25 = 13,        miss −1,       level 16.75,    trend 1.45,     pattern −4.55
  //  y = 24: predicted 16.75 + 1.45 + 4.25 = 22.45,    miss 1.55,     level 18.975,   trend 1.5275,   pattern 4.715
  //  y = 14: predicted 18.975 + 1.5275 − 4.55 = 15.9525, miss −1.9525, level 19.52625, trend 1.429875, pattern −5.13575
  //  y = 28: predicted 19.52625 + 1.429875 + 4.715 = 25.671125, miss 2.328875, level 22.1205625, trend 1.54631875, pattern 5.4136625
  const y: Y[] = [10, 20, 12, 24, 14, 28].map((v) => exactOf(v));
  const text = (x: Exact) => `${x.num}/${x.den}`;
  it("the reference: level, trend, pattern, misses and the values ahead", () => {
    const r = referenceSeasonal(y, 2);
    expect(r.level).toEqual(exactOf("22.1205625"));
    expect(r.trend).toEqual(exactOf("1.54631875"));
    expect(r.pattern).toEqual([exactOf("-5.13575"), exactOf("5.4136625")]);
    expect(r.steps.map((s) => s.predicted)).toEqual(["13", "22.45", "15.9525", "25.671125"].map(exactOf));
    // 1 + 2.4025 + 3.81225625 + 5.423658765625
    expect(r.squares).toEqual(exactOf("12.638415015625"));
    expect(r.errors).toBe(4);
    expect(referenceAhead(r, 1)).toEqual(exactOf("18.53113125"));
    expect(referenceAhead(r, 2)).toEqual(exactOf("30.6268625"));
    // Three ahead: 22.1205625 + 3 · 1.54631875 − 5.13575 = 21.62376875 (the pattern starts over at its first position).
    expect(referenceAhead(r, 3)).toEqual(exactOf("21.62376875"));
  });
  it("the spread factor: 1, 1 + 0.55² = 1.3025, 1.3025 + 0.9² = 2.1125 (c(1) = ½·1.1, c(2) = ½·1.2 + 0.3, as 2 is a whole season)", () => {
    for (const [h, factor] of [[1, "1"], [2, "1.3025"], [3, "2.1125"]] as const) {
      expect(referenceFactor(h, 2), String(h)).toEqual(exactOf(factor));
      expect(referenceFactorClosed(h, 2), String(h)).toEqual(exactOf(factor));
    }
    // The variance two ahead: the mean squared miss 12.638415015625 ÷ 4 times 1.3025.
    expect(text(referenceVariance(referenceSeasonal(y, 2), 2))).toBe(text(exactOf("4.115383889462890625")));
  });
  it("the code gives the same", () => {
    const fit = fitOf(months("2024-01", [10, 20, 12, 24, 14, 28]), 2);
    expect(same(fit.level, "353929/16000")).toBe(true);
    expect(same(fit.trend, "247411/160000")).toBe(true);
    expect(fit.pattern.map((p) => `${p.num}/${p.den}`)).toEqual(["-20543/4000", "433093/80000"]);
    expect(same(fit.squares, "808858561/64000000")).toBe(true);
    expect(fit.errors).toBe(4);
    expect(nearest(seasonalAhead(fit, 1))).toBe(18.53113125);
    expect(nearest(seasonalAhead(fit, 2))).toBe(30.6268625);
    expect(nearest(seasonalAhead(fit, 3))).toBe(21.62376875);
    expect(nearest(seasonalVariance(fit, 2))).toBe(4.1153838894628905);
    const run = holtWinters(months("2024-01", [10, 20, 12, 24, 14, 28]), "month", 2, 3);
    expect(run.ok && run.points.map((p) => [p.period, p.value])).toEqual([["2024-07-01", 18.53113125], ["2024-08-01", 30.6268625], ["2024-09-01", 21.62376875]]);
  });
});
const nearest = (f: Fraction) => nearestDoubleOf({ num: f.num, den: f.den });

describe("the spread factor", () => {
  it("is the same by the impulse response and by the closed form, and the fixture's, for the seasons that matter", () => {
    for (const m of [2, 4, 7, 12]) {
      fixture.factors[String(m)].forEach((text: string, i: number) => {
        expect(referenceFactor(i + 1, m), `${m} h=${i + 1}`).toEqual(parse(text));
        expect(referenceFactorClosed(i + 1, m), `${m} h=${i + 1}`).toEqual(parse(text));
      });
    }
  });
});

describe("Holt-Winters equals the references on the fixtures' series", () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: the state, the misses, the values ahead and their spread are exact, as Python's fractions say`, () => {
      const run = fitHoltWinters(points(c), "month", c.season);
      expect(run.ok, name).toBe(c.canRun);
      if (!run.ok) return;
      const { fit } = run;
      const py = c.holtWinters!;
      expect(same(fit.level, py.level), `${name} level`).toBe(true);
      expect(same(fit.trend, py.trend), `${name} trend`).toBe(true);
      py.pattern.forEach((p: string, j: number) => expect(same(fit.pattern[j], p), `${name} pattern ${j}`).toBe(true));
      expect(same(fit.squares, py.squares), `${name} squares`).toBe(true);
      expect(fit.errors).toBe(py.errors);
      expect(fit.steps.length).toBe(py.trace.length);
      py.trace.forEach((s, i) => {
        expect(fit.steps[i].period, `${name} step ${i}`).toBe(shiftPeriod(c.periods[0], "month", s.t));
        expect(same(fit.steps[i].predicted, s.predicted), `${name} predicted at ${s.t}`).toBe(true);
        expect(same(fit.steps[i].squares, s.squares), `${name} squares at ${s.t}`).toBe(true);
        expect(fit.steps[i].errors).toBe(s.errors);
      });
      const out = holtWinters(points(c), "month", c.season, 14);
      expect(out.ok).toBe(true);
      py.ahead.forEach((a) => {
        expect(same(seasonalAhead(fit, a.h), a.exact), `${name} h=${a.h}`).toBe(true);
        expect(same(seasonalVariance(fit, a.h), a.variance), `${name} variance h=${a.h}`).toBe(true);
        const p = out.ok && out.points[a.h - 1];
        expect(p && p.value, `${name} value h=${a.h}`).toBe(a.double);
        expect(p && p.sd, `${name} spread h=${a.h}`).toBe(a.sd);
        expect(p && p.lo, `${name} lo`).toBe(a.double - 1.96 * a.sd);
        expect(p && p.hi, `${name} hi`).toBe(a.double + 1.96 * a.sd);
      });
    });
    it(`${name}: and as the references of the tests say, and as NumPy's floats say to 1e-9`, () => {
      if (!c.canRun) return;
      const ref = referenceSeasonal(exactSeries(c), c.season);
      const fit = fitOf(points(c), c.season);
      expect(eq(fit.level, ref.level) && eq(fit.trend, ref.trend) && eq(fit.squares, ref.squares), where(c)).toBe(true);
      for (let h = 1; h <= 14; h++) {
        expect(eq(seasonalAhead(fit, h), referenceAhead(ref, h)), `${name} h=${h}`).toBe(true);
        expect(eq(seasonalVariance(fit, h), referenceVariance(ref, h)), `${name} variance h=${h}`).toBe(true);
      }
      const numpy = c.holtWinters!.numpy;
      numpy?.forEach((v, i) => expect(Math.abs(nearest(seasonalAhead(fit, i + 1)) - v) <= 1e-9 * Math.max(1, Math.abs(v)), `${name} numpy h=${i + 1}`).toBe(true));
    });
  }
});

/** A generated series: a season length, and 2 seasons or more of values, some of them (after the second season) without a value. */
const seasonal = fc.constantFrom(2, 3, 4, 7, 12).chain((m) =>
  fc.integer({ min: 2 * m, max: 2 * m + 24 }).chain((n) =>
    fc.tuple(fc.constant(m), fc.array(valueText.map(Number), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: 0, max: 4 }), { minLength: n, maxLength: n })),
  ),
);
const withGaps = (m: number, vs: number[], dice: number[]): { y: Y[]; pts: Point[] } => {
  const all = months("2024-01", vs);
  // A value after the first two seasons is missing one time in five; the last value is kept, so the series ends where it did.
  const keep = vs.map((_, i) => i < 2 * m || i === vs.length - 1 || dice[i] !== 0);
  return { y: vs.map((v, i) => (keep[i] ? exactOf(v) : null)), pts: all.filter((_, i) => keep[i]) };
};

describe("generated series", () => {
  it(`the state, the misses, the values ahead and their spread equal the reference exactly (${numRuns * 2} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(seasonal, ([m, vs, dice]) => {
        const { y, pts } = withGaps(m, vs, dice);
        const ref = referenceSeasonal(y, m);
        const fit = fitOf(pts, m);
        const tag = `${m}: ${vs}`;
        expect(eq(fit.level, ref.level) && eq(fit.trend, ref.trend) && eq(fit.squares, ref.squares) && fit.errors === ref.errors, tag).toBe(true);
        ref.pattern.forEach((p, j) => expect(eq(fit.pattern[j], p), `${tag} pattern ${j}`).toBe(true));
        ref.steps.forEach((s, i) => expect(eq(fit.steps[i].predicted, s.predicted) && eq(fit.steps[i].squares, s.squares) && fit.steps[i].errors === s.errors, `${tag} step ${i}`).toBe(true));
        const out = holtWinters(pts, "month", m, 2 * m + 1);
        for (let h = 1; h <= 2 * m + 1; h++) {
          const [value, variance] = [referenceAhead(ref, h), referenceVariance(ref, h)];
          const p = out.ok && out.points[h - 1];
          expect(p && p.value, `${tag} h=${h}`).toBe(nearestDoubleOf(value));
          expect(p && p.sd, `${tag} sd h=${h}`).toBe(Math.sqrt(nearestDoubleOf(variance)));
        }
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});

describe("the properties", () => {
  const whole = fc.constantFrom(2, 3, 4, 7).chain((m) =>
    fc.integer({ min: 2 * m, max: 2 * m + 15 }).chain((n) => fc.tuple(fc.constant(m), fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { minLength: n, maxLength: n }))),
  );
  const state = (vs: number[], m: number) => fitOf(months("2024-01", vs), m);
  it(`adding a constant moves the level by it and nothing else, exactly (${numRuns} series)`, () => {
    fc.assert(
      fc.property(whole, fc.integer({ min: -5000, max: 5000 }), ([m, vs], c) => {
        const [a, b] = [state(vs, m), state(vs.map((v) => v + c), m)];
        expect(eq(b.level, { num: a.level.num + BigInt(c) * a.level.den, den: a.level.den })).toBe(true);
        expect(b.trend).toEqual(a.trend);
        expect(b.pattern).toEqual(a.pattern);
        expect(b.squares).toEqual(a.squares);
        expect(b.errors).toBe(a.errors);
      }),
      { numRuns, seed },
    );
  });
  it(`multiplying by k multiplies the level, trend and pattern by k and the squared misses by k², exactly (${numRuns} series)`, () => {
    fc.assert(
      fc.property(whole, fc.constantFrom(-3, -1, 2, 3, 10), ([m, vs], k) => {
        const [a, b] = [state(vs, m), state(vs.map((v) => v * k), m)];
        const scaled = (x: Fraction, by: number): Fraction => ({ num: x.num * BigInt(by), den: x.den });
        expect(eq(b.level, scaled(a.level, k)) && eq(b.trend, scaled(a.trend, k))).toBe(true);
        b.pattern.forEach((p, j) => expect(eq(p, scaled(a.pattern[j], k))).toBe(true));
        expect(eq(b.squares, scaled(a.squares, k * k))).toBe(true);
        // The values ahead scale too, so the range does: a forecast in euros and one in cents agree.
        expect(eq(seasonalAhead(b, 3), scaled(seasonalAhead(a, 3), k))).toBe(true);
        expect(eq(seasonalVariance(b, 3), scaled(seasonalVariance(a, 3), k * k))).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it(`gives the same for the periods in any order, a period given twice (the value given last counts), and values that are no numbers (${numRuns} series)`, () => {
    fc.assert(
      fc.property(whole, fc.integer({ min: 0, max: 99 }), ([m, vs], at) => {
        const pts = months("2024-01", vs);
        const json = JSON.stringify(holtWinters(pts, "month", m));
        const i = at % pts.length;
        const [first, last] = [pts[0].period, pts[pts.length - 1].period];
        expect(JSON.stringify(holtWinters(shuffled(pts, at), "month", m))).toBe(json);
        // A wrong value for a period, given before the right one.
        expect(JSON.stringify(holtWinters([{ period: pts[i].period, value: 7 }, ...pts], "month", m))).toBe(json);
        // NaN and Infinity are no value: not for a period that has one, not for one before the first or after the last.
        const noise = [{ period: pts[i].period, value: NaN }, { period: shiftPeriod(first, "month", -1), value: Infinity }, { period: shiftPeriod(last, "month", 1), value: -Infinity }];
        expect(JSON.stringify(holtWinters([...pts, ...noise], "month", m))).toBe(json);
      }),
      { numRuns, seed },
    );
  });
  it("is the same twice, and does not change what it is given", () => {
    const pts = months("2024-01", [5, 9, 3, 12, 6, 10, 4, 14, 7, 11, 6, 15]);
    const before = JSON.stringify(pts);
    expect(JSON.stringify(holtWinters(pts, "month", 4))).toBe(JSON.stringify(holtWinters(pts, "month", 4)));
    expect(JSON.stringify(pts)).toBe(before);
  });
  it("a series that does not change is forecast as it is, with no spread", () => {
    const run = holtWinters(months("2024-01", Array(12).fill(5.25)), "month", 4, 4);
    expect(run.ok && run.points.map((p) => [p.value, p.lo, p.hi, p.sd])).toEqual(Array(4).fill([5.25, 5.25, 5.25, 0]));
    expect(run.ok && run.trendPerPeriod).toBe(0);
  });
  it("a straight line plus a repeating pattern is recovered exactly, with no miss at all, whatever the season (a = 7.3, b = −0.25)", () => {
    for (const m of [2, 3, 4, 7, 12]) {
      const S = Array.from({ length: m }, (_, j) => ((j * 37) % 11) - 5);
      // Zero-sum or not, the pattern is carried: the start takes the first season's mean as the line's, so a pattern that does not
      // sum to 0 moves its mean into the level, and the forecast is still exact.
      const vs = Array.from({ length: 3 * m + 2 }, (_, t) => 7.3 - 0.25 * t + S[t % m]).map((v) => Number(v.toFixed(2)));
      const fit = fitOf(months("2024-01", vs), m);
      expect(fit.squares.num, `m=${m}`).toBe(0n);
      for (let h = 1; h <= 2 * m; h++) {
        const t = vs.length - 1 + h;
        expect(nearest(seasonalAhead(fit, h)), `m=${m} h=${h}`).toBe(Number((7.3 - 0.25 * t + S[t % m]).toFixed(2)));
        expect(seasonalVariance(fit, h).num).toBe(0n);
      }
    }
  });
});

describe("the hostile inputs", () => {
  const run = (vs: number[], m = 4, start = "2024-01") => fitHoltWinters(months(start, vs), "month", m);
  it("refuses with too few values, one step either side of two seasons", () => {
    expect(run([])).toEqual({ ok: false, why: "short" });
    expect(run([1])).toEqual({ ok: false, why: "short" });
    expect(run([1, 2, 3, 4, 5, 6, 7])).toEqual({ ok: false, why: "short" });
    expect(run([1, 2, 3, 4, 5, 6, 7, 8]).ok).toBe(true);
    expect(run([1, 2, 3, 4, 5, 6, 7, 8, 9]).ok).toBe(true);
  });
  it("refuses a season that is not at least two periods (a yearly Metric has none), and a season of 2 runs with 4 values", () => {
    for (const m of [1, 0, -3]) expect(run([1, 2, 3, 4, 5, 6, 7, 8], m)).toEqual({ ok: false, why: "season" });
    expect(run([1, 2, 3, 4], 2).ok).toBe(true);
    expect(run([1, 2, 3], 2)).toEqual({ ok: false, why: "short" });
  });
  it("refuses a gap in the first two seasons, and runs with the gap one period later", () => {
    const eight = [1, 5, 2, 8, 3, 6, 4, 9, 5, 7];
    const without = (gap: number) => fitHoltWinters(months("2024-01", eight).filter((_, i) => i !== gap), "month", 4);
    // Nine values are enough rows, but the first two seasons (the first eight periods) are not whole.
    for (const gap of [1, 3, 4, 7]) expect(without(gap), `gap ${gap}`).toEqual({ ok: false, why: "start-gap" });
    // A value missing at the very start only moves the start; one in the ninth period or later is a period with no value.
    expect(without(0)).toMatchObject({ ok: true, fit: { first: "2024-02-01", length: 9 } });
    expect(without(8)).toMatchObject({ ok: true, fit: { first: "2024-01-01", length: 10, errors: 5 } });
  });
  it("leaves a period without a value out and says so: the level moves on by the trend, the pattern stays, and no miss is counted", () => {
    const whole = fitOf(months("2024-01", [1, 5, 2, 8, 3, 6, 4, 9, 5, 7, 3, 8]), 4);
    const gap = fitOf(months("2024-01", [1, 5, 2, 8, 3, 6, 4, 9, 5, 7, 3, 8]).filter((_, i) => i !== 9), 4);
    // One miss for every period from the second season on: twelve periods less the first season.
    expect(whole.errors).toBe(8);
    expect(gap.errors).toBe(7);
    expect(gap.length).toBe(12);
    expect(gap.steps).toHaveLength(8);
  });
  it("reads NaN and Infinity as no value, and a value that is not finite at the end moves the last period back", () => {
    const base = months("2024-01", [1, 5, 2, 8, 3, 6, 4, 9]);
    expect(fitHoltWinters([...base, { period: "2024-09-01", value: NaN }, { period: "2024-10-01", value: Infinity }], "month", 4)).toEqual(fitHoltWinters(base, "month", 4));
    expect(fitHoltWinters([{ period: "2024-01-01", value: NaN }, { period: "2024-02-01", value: Infinity }], "month", 2)).toEqual({ ok: false, why: "short" });
  });
  it("is exact on values from 0.000001 to 10^15, with no value lost to floating point", () => {
    for (const vs of [[1e15, 2e15, 3e15, 1.5e15, 1.1e15, 2.1e15, 3.2e15, 1.6e15], [0.000001, 0.000002, 0.000003, 0.0000015, 0.0000011, 0.0000021, 0.0000032, 0.0000016], [-1e15, 2e-6, -3e15, 4e-6, -5e15, 6e-6, -7e15, 8e-6]]) {
      const ref = referenceSeasonal(vs.map((v) => exactOf(v)), 4);
      const fit = fitOf(months("2024-01", vs), 4);
      expect(eq(fit.level, ref.level) && eq(fit.trend, ref.trend) && eq(fit.squares, ref.squares), String(vs)).toBe(true);
      expect(nearest(seasonalAhead(fit, 1))).toBe(nearestDoubleOf(referenceAhead(ref, 1)));
    }
  });
  it("gives a refusal with no number in it", () => {
    for (const vs of [[], [1, 2, 3]]) expect(JSON.stringify(holtWinters(months("2024-01", vs), "month", 4))).toBe('{"ok":false,"why":"short"}');
  });
  it("reads weeks, days and quarters by their own steps", () => {
    const weeks = Array.from({ length: 8 }, (_, t) => ({ period: shiftPeriod("2025-01-06", "week", t), value: [3, 5, 9, 4, 3, 6, 10, 4][t] }));
    const w = holtWinters(weeks, "week", 4, 2);
    expect(w.ok && w.points.map((p) => p.period)).toEqual(["2025-03-03", "2025-03-10"]);
    const days = Array.from({ length: 14 }, (_, t) => ({ period: shiftPeriod("2025-01-01", "day", t), value: [3, 5, 9, 4, 3, 6, 10][t % 7] + t }));
    const d = holtWinters(days, "day", 7, 1);
    expect(d.ok && d.points[0].period).toBe("2025-01-15");
    const quarters = Array.from({ length: 8 }, (_, t) => ({ period: shiftPeriod("2024-01-01", "quarter", t), value: [3, 5, 9, 4, 3, 6, 10, 4][t] }));
    const q = holtWinters(quarters, "quarter", 4);
    expect(q.ok && q.points.map((p) => p.period)).toEqual(["2026-01-01", "2026-04-01"]);
  });
});

describe("the range of a forecast holds as often as it says (a simulation)", () => {
  // A seeded normal generator (Box-Muller over a 32-bit mixer), so the same simulated series every run.
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
  const N = 600;
  // 600 series: the share inside an 80 % range has a standard error of 1.6 points; 6 points is about 4 of them.
  for (const [m, n] of [[4, 24], [12, 36]] as const) {
    it(`an 80 % range one period ahead holds for 74 % to 86 % of ${N} simulated series (season ${m}, ${n} values, trend and pattern with normal noise)`, () => {
      const draw = normal(1234 + m * 100 + n);
      const pattern = Array.from({ length: m }, (_, j) => 10 * Math.sin((2 * Math.PI * j) / m));
      let inside = 0;
      for (let r = 0; r < N; r++) {
        const ys = Array.from({ length: n + 1 }, (_, t) => Math.round((50 + 2 * t + pattern[t % m] + 3 * draw()) * 100) / 100);
        const out = holtWinters(months("2000-01", ys.slice(0, n)), "month", m, 1);
        if (out.ok && Math.abs(ys[n] - out.points[0].value) <= Z80 * out.points[0].sd) inside++;
      }
      expect(inside / N).toBeGreaterThan(0.74);
      expect(inside / N).toBeLessThan(0.86);
    });
  }
});
