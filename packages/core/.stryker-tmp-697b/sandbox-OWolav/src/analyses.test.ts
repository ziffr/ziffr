// @ts-nocheck
// The Analyses against the references (spec 0022, Testing Decisions; GLOSSARY: Analysis): Pearson's r and Holt's
// forecast on generated series, held to the exact results, and the deck and CSV export values to the display's
// rounding. Generated with a fixed seed in `pnpm test`, more and a new seed in `test:numbers`.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pearson, strength } from "./correlation";
import { chartValue, csvNumber } from "./export-values";
import { forecast } from "./forecast";
import { NUMBER_STYLES } from "./number-style";
import type { Span } from "./periods";
import { referenceHolt, referencePearson } from "./test/reference/analyses";
import { dayOf, monthsLater, textOf } from "./test/reference/calendar";
import { periodsFrom, runs, valueText } from "./test/reference/check";
import { exactOf, exactText, isNearestDouble, nearestDoubleOf, placesOf, type Exact } from "./test/reference/exact";
import { referenceNumber } from "./test/reference/write";

const { numRuns, seed } = runs();
const SPANS: Span[] = ["day", "week", "month", "quarter", "half", "year"];
// Values with a few constant runs among them, so a flat series turns up.
const values = (min: number, max: number) => fc.oneof({ weight: 4, arbitrary: fc.array(valueText.map(Number), { minLength: min, maxLength: max }) }, { weight: 1, arbitrary: fc.tuple(valueText, fc.integer({ min, max })).map(([v, n]) => Array(n).fill(Number(v))) });
const nearest = (code: number, exact: Exact, where: string) => expect(isNearestDouble(code, exact), `${where}: ${code} is not the double nearest to ${exactText(exact)}`).toBe(true);

describe("Pearson's r", () => {
  it(`is ±√ of the double nearest to the exact r², with its sign (${numRuns * 5} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 40 }).chain((n) => fc.tuple(values(n, n), values(n, n))), ([xs, ys]) => {
        const n = Math.min(xs.length, ys.length);
        const at = periodsFrom("2024-01-01", "month", n);
        const res = pearson(at.map((period, i) => ({ period, value: xs[i] })), at.map((period, i) => ({ period, value: ys[i] })))!;
        const ref = referencePearson(xs.slice(0, n).map(exactOf), ys.slice(0, n).map(exactOf));
        const where = `${xs.slice(0, n)} against ${ys.slice(0, n)}`;
        expect(res.n, where).toBe(n);
        if (!ref) {
          expect(res.r, where).toBeNaN();
          return;
        }
        expect(res.r, where).toBe((ref.negative ? -1 : 1) * Math.sqrt(nearestDoubleOf(ref.r2)));
        expect(Math.abs(res.r), where).toBeLessThanOrEqual(1);
        // How strong, by the thresholds on r as computed: above 0.7 strong, above 0.4 moderate, above 0.2 weak.
        const a = Math.abs(res.r);
        expect(strength(res.r), where).toBe(a <= 0.2 ? "no clear" : `${a > 0.7 ? "strong" : a > 0.4 ? "moderate" : "weak"} ${res.r >= 0 ? "positive" : "negative"}`);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("is exactly 1 and −1 for series on a line, and none with fewer than six pairs", () => {
    const pts = (vs: number[]) => vs.map((value, i) => ({ period: `2026-0${i + 1}-01`, value }));
    expect(pearson(pts([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), pts([1, 2, 3, 4, 5, 6]))!.r).toBe(1);
    expect(pearson(pts([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), pts([6, 5, 4, 3, 2, 1]))!.r).toBe(-1);
    expect(pearson(pts([1, 2, 3, 4, 5]), pts([1, 2, 3, 4, 5]))).toBeNull();
  });
  it("the reference gives what was worked out by hand", () => {
    const e = (vs: number[]) => vs.map(exactOf);
    // x = 1, 2, 3; y = 1, 3, 2: Sxy = 1, Sxx = 2, Syy = 2, so r² = 1/4.
    expect(referencePearson(e([1, 2, 3]), e([1, 3, 2]))).toEqual({ r2: exactOf("0.25"), negative: false });
    expect(referencePearson(e([1, 2, 3]), e([3, 2, 1]))).toEqual({ r2: exactOf(1), negative: true });
    expect(referencePearson(e([1, 1, 1]), e([3, 2, 1]))).toBeNull();
  });
});

/** The first day of the period h periods after `last`, by the reference calendar. */
function ahead(last: string, span: Span, h: number): string {
  const d = dayOf(last);
  if (span === "day") return textOf(d + h);
  if (span === "week") return textOf(d + 7 * h);
  return textOf(monthsLater(d, { month: 1, quarter: 3, half: 6, year: 12 }[span] * h));
}

describe("the forecast", () => {
  it(`is Holt's method on exact values, its band 1.96 · sd · √h (${numRuns * 5} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(values(4, 60), fc.constantFrom(...SPANS), fc.integer({ min: 1, max: 20 }), (vs, span, horizon) => {
        const at = periodsFrom("2025-01-01", span === "half" ? "month" : span, vs.length).map((p, i) => (span === "half" ? textOf(monthsLater(dayOf("2025-01-01"), 6 * i)) : p));
        const got = forecast(at.map((period, i) => ({ period, value: vs[i] })), span, horizon)!;
        const ref = referenceHolt(vs.map(exactOf), horizon);
        const where = `${vs} by ${span}`;
        nearest(got.trendPerPeriod, ref.trend, `${where}: trend`);
        expect(got.sd, where).toBe(Math.sqrt(nearestDoubleOf(ref.meanSquare)));
        expect(got.points, where).toHaveLength(horizon);
        got.points.forEach((p, i) => {
          const h = i + 1;
          expect(p.period, where).toBe(ahead(at[at.length - 1], span, h));
          nearest(p.value, ref.ahead[i], `${where}: ${h} ahead`);
          expect([p.lo, p.hi], where).toEqual([p.value - 1.96 * got.sd * Math.sqrt(h), p.value + 1.96 * got.sd * Math.sqrt(h)]);
        });
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("is exact where doubles were not", () => {
    // Exactly 247.03835 one month ahead: doubles gave 247.03834999999998, shown as 247.0383 at four decimals.
    const months = [366.92, 157.73, 42.88, 787.45].map((value, i) => ({ period: `2026-0${i + 1}-01`, value }));
    expect(forecast(months, "month", 1)!.points[0].value).toBe(247.03835);
    // 400 days of 0.1: the level stays 0.1 and the trend 0, exactly.
    const days = periodsFrom("2025-01-01", "day", 400).map((period) => ({ period, value: 0.1 }));
    const f = forecast(days, "day")!;
    expect([f.trendPerPeriod, f.sd, f.points[13].value]).toEqual([0, 0, 0.1]);
  });
  it("the reference gives what was worked out by hand", () => {
    // 10, 20, 30, 40: a line, predicted without error, continued by 10 a period.
    const r = referenceHolt([10, 20, 30, 40].map(exactOf), 2);
    expect([r.level, r.trend, r.meanSquare, ...r.ahead].map(exactText)).toEqual(["40", "10", "0", "50", "60"]);
    // 0, 10, 0, 10: errors 0, −20 and −7; the level goes 10, 10, 13.5 and the trend 10, 7, 5.95.
    const z = referenceHolt([0, 10, 0, 10].map(exactOf), 1);
    expect([z.level, z.trend].map(exactText)).toEqual(["13.5", "5.95"]);
  });
});

describe("the export values", () => {
  it(`write a chart value and a CSV value as the display rounds them (${numRuns * 5} values, seed ${seed})`, () => {
    fc.assert(
      fc.property(valueText, fc.integer({ min: 0, max: 6 }), fc.constantFrom(...NUMBER_STYLES), (text, decimals, style) => {
        const v = Number(text);
        const exact = exactOf(String(v));
        // The chart: the value at the Metric's decimals, as the app writes it, read back as a number.
        expect(chartValue({ decimals }, v), text).toBe(Number(referenceNumber(String(v), decimals, "1,234.5", false)));
        // The CSV: every decimal it has, at most six, in the style's decimal mark and without group marks.
        const places = Math.min(6, placesOf(exact)!);
        expect(csvNumber(v, style), text).toBe(referenceNumber(String(v), places, style, false));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("round as the app does where Math.round did not, and write the decimals of tiny and huge values", () => {
    expect([chartValue({ decimals: 2 }, 1.005), chartValue({ decimals: 2 }, -0.125), chartValue({ decimals: 0 }, -0.4)]).toEqual([1.01, -0.13, 0]);
    expect([chartValue({ decimals: 9 }, 0.1234567), chartValue({ decimals: -1 }, 2.5), chartValue({ decimals: 2 }, NaN)]).toEqual([0.123457, 3, 0]);
    expect(csvNumber(1.5e-7, "1,234.5")).toBe("0.000000");
    expect(csvNumber(1e21, "1.234,5")).toBe("1000000000000000000000");
    expect(csvNumber(-1234.5, "1.234,5")).toBe("-1234,5");
    expect(csvNumber(Infinity, "1,234.5")).toBe("");
  });
});
