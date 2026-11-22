// The track record and the choice between the two Methods against their references (spec 0041, ticket 6): each period forecast
// again from scratch from the values before it (the reference's literal rolling origin) against the one pass the code makes, on the
// fixtures' series (Python's fractions) and generated ones; the typical miss exactly; the choice by the smaller typical miss on the
// last third, one step either side of the three periods it needs; the properties; and the hostile inputs.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Fraction } from "../exact";
import { shiftPeriod } from "../periods";
import { months } from "../test/fixtures";
import { runs, shuffled, valueText } from "../test/reference/check";
import { exactOf, fraction, nearestDoubleOf, plus, type Exact } from "../test/reference/exact";
import { referenceChoice, referenceHoltOutcomes, referenceSeasonalOutcomes, Z80, type Outcome, type Y } from "../test/reference/forecast";
import type { Point } from "../types";
import { backtest, chooseMethod, TRACK_MIN, type TrackRecord } from "./track-record";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
type Py = { t: number; miss: string; sd: number; inBand: boolean };
type Case = { season: number; values: (number | null)[]; periods: string[]; canRun: boolean; holtWinters?: { backtest: Py[] }; holt?: { backtest: Py[] }; choice?: { method: string; why: string; tested: number; holtTotal: string; seasonalTotal: string } };
const CASES: Record<string, Case> = fixture.cases;

const eq = (a: Fraction, b: Exact) => a.num * b.den === b.num * a.den;
const parse = (text: string): Exact => {
  const [n, d] = text.split("/");
  return fraction(BigInt(n), BigInt(d));
};
const points = (c: Case): Point[] => c.values.flatMap((value, i) => (value === null ? [] : [{ period: c.periods[i], value }]));
const size = (e: Exact): Exact => (e.num < 0n ? fraction(-e.num, e.den) : e);
const AIRLINE: number[] = CASES["airline-full"].values as number[];

/** The reference's outcomes against a track record's, one by one: the period, the exact miss, the spread, and inside or not. */
function same(record: TrackRecord, ref: Outcome[], periods: string[], where: string) {
  expect(record.outcomes.map((o) => o.period), where).toEqual(ref.map((o) => periods[o.t]));
  record.outcomes.forEach((o, i) => {
    expect(eq(o.miss, ref[i].miss), `${where} miss at ${o.period}`).toBe(true);
    expect(o.sd, `${where} spread at ${o.period}`).toBe(ref[i].sd);
    expect(o.inBand, `${where} inside at ${o.period}`).toBe(ref[i].inBand);
  });
  const total = ref.reduce((s, o) => plus(s, size(o.miss)), exactOf(0));
  expect(eq(record.missTotal, total), `${where} total`).toBe(true);
  expect(record.typicalMiss, `${where} typical miss`).toBe(nearestDoubleOf(fraction(total.num, total.den * BigInt(ref.length))));
  expect(record.tested).toBe(ref.length);
  expect(record.inBand).toBe(ref.filter((o) => o.inBand).length);
}

describe("the track record equals the literal rolling origin", () => {
  for (const [name, c] of Object.entries(CASES)) {
    if (!c.canRun) continue;
    const y: Y[] = c.values.map((v) => (v === null ? null : exactOf(v)));
    it(`${name}: Holt-Winters from the third season on, as the reference (each prefix run again) and Python say`, () => {
      const ref = referenceSeasonalOutcomes(y, c.season);
      const record = backtest(points(c), "month", c.season, "holtWinters", c.values.length);
      expect(record === null, name).toBe(ref.length === 0);
      if (!record) return;
      same(record, ref, c.periods, name);
      // Python's, by its own literal rerun: the same periods, exact misses, spreads and insides.
      const py = c.holtWinters!.backtest;
      expect(record.outcomes.map((o) => o.period)).toEqual(py.map((o) => c.periods[o.t]));
      py.forEach((o, i) => {
        expect(eq(record.outcomes[i].miss, parse(o.miss)), `${name} python miss ${o.t}`).toBe(true);
        expect(record.outcomes[i].sd).toBe(o.sd);
        expect(record.outcomes[i].inBand).toBe(o.inBand);
      });
    });
    if (c.holt) {
      it(`${name}: Holt from the fifth value on, as the reference and Python say`, () => {
        const whole = y as Exact[];
        const ref = referenceHoltOutcomes(whole);
        const record = backtest(points(c), "month", c.season, "holt", c.values.length);
        expect(record === null).toBe(ref.length === 0);
        if (!record) return;
        same(record, ref, c.periods, name);
        const py = c.holt!.backtest;
        expect(py.map((o) => c.periods[o.t])).toEqual(record.outcomes.map((o) => o.period));
        py.forEach((o, i) => {
          expect(eq(record.outcomes[i].miss, parse(o.miss)), `${name} python miss ${o.t}`).toBe(true);
          expect(record.outcomes[i].sd).toBe(o.sd);
          expect(record.outcomes[i].inBand).toBe(o.inBand);
        });
      });
    }
  }
  it(`on generated series, whole and with gaps: both Methods (${numRuns * 2} series, seed ${seed})`, () => {
    const series = fc.constantFrom(2, 3, 4, 7).chain((m) =>
      fc.integer({ min: 2 * m, max: 2 * m + 14 }).chain((n) => fc.tuple(fc.constant(m), fc.array(valueText.map(Number), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: 0, max: 4 }), { minLength: n, maxLength: n }))),
    );
    fc.assert(
      fc.property(series, ([m, vs, dice]) => {
        const all = months("2024-01", vs);
        const keep = vs.map((_, i) => i < 2 * m || i === vs.length - 1 || dice[i] !== 0);
        const y: Y[] = vs.map((v, i) => (keep[i] ? exactOf(v) : null));
        const pts = all.filter((_, i) => keep[i]);
        const ref = referenceSeasonalOutcomes(y, m);
        const record = backtest(pts, "month", m, "holtWinters", vs.length);
        expect(record === null, `${m}: ${vs}`).toBe(ref.length === 0);
        if (record) same(record, ref, all.map((p) => p.period), `${m}: ${vs}`);
        // Holt on the same values with no gaps.
        const whole = vs.map(exactOf);
        const holtRef = referenceHoltOutcomes(whole);
        const holt = backtest(all, "month", m, "holt", vs.length);
        expect(holt === null).toBe(holtRef.length === 0);
        if (holt) same(holt, holtRef, all.map((p) => p.period), `holt ${vs}`);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});

describe("what is tested", () => {
  const air = (n: number) => months("1949-01", AIRLINE.slice(0, n));
  it("is the last `last` values, one period ahead, each from the values before it", () => {
    const [last3, last12, all] = [backtest(air(48), "month", 12, "holtWinters", 3)!, backtest(air(48), "month", 12, "holtWinters", 12)!, backtest(air(48), "month", 12, "holtWinters", 48)!];
    expect(last3.outcomes.map((o) => o.period)).toEqual(["1952-10-01", "1952-11-01", "1952-12-01"]);
    expect(last12.tested).toBe(12);
    // The seasonal Method predicts from the third season on: 48 values less the first 24.
    expect(all.tested).toBe(24);
    expect(last12.outcomes).toEqual(all.outcomes.slice(-12));
    expect(backtest(air(48), "month", 12, "holt", 48)!.tested).toBe(44);
  });
  it("needs the Method's start: Holt four values before one is predicted, Holt-Winters two seasons, one step either side", () => {
    const [holt4, holt5] = [backtest(air(4), "month", 12, "holt", 9), backtest(air(5), "month", 12, "holt", 9)];
    expect(holt4).toBeNull();
    expect(holt5?.tested).toBe(1);
    expect(backtest(air(24), "month", 12, "holtWinters", 99)).toBeNull();
    expect(backtest(air(25), "month", 12, "holtWinters", 99)?.tested).toBe(1);
    expect(backtest(air(23), "month", 12, "holtWinters", 99)).toBeNull();
  });
  it("is nothing for a window of no values, and all of them for a window longer than the series", () => {
    expect(backtest(air(48), "month", 12, "holt", 0)).toBeNull();
    expect(backtest(air(48), "month", 12, "holt", -5)).toBeNull();
    expect(backtest(air(30), "month", 12, "holt", 1000)!.tested).toBe(26);
  });
  it("counts a value only where the period before it has a value: a gap takes the value after it out of the count, nothing else", () => {
    const whole = backtest(air(40), "month", 12, "holtWinters", 40)!;
    const gap = backtest(air(40).filter((_, i) => i !== 30), "month", 12, "holtWinters", 40)!;
    // The value at 30 is missing, and the one after it (31) has no period before it with a value.
    expect(whole.tested - gap.tested).toBe(2);
    expect(gap.outcomes.some((o) => o.period === "1951-08-01" || o.period === "1951-07-01")).toBe(false);
    // Holt reads the values in their order, so a gap only takes out the one value whose period before is missing.
    const holtGap = backtest(air(40).filter((_, i) => i !== 30), "month", 12, "holt", 40)!;
    expect(holtGap.outcomes.some((o) => o.period === "1951-08-01")).toBe(false);
    expect(holtGap.outcomes.some((o) => o.period === "1951-09-01")).toBe(true);
  });
  it("calls a value inside the 80 % range when its miss is at most 1.2816 spreads, decided in doubles, a step either side", () => {
    // A series where the third season's first value is the one tested: the spread is that of the second season's misses.
    const base = [10, 12, 9, 15, 11, 14, 10, 17];
    const probe = (v: number) => backtest(months("2024-01", [...base, v]), "month", 4, "holtWinters", 1)!.outcomes[0];
    const centre = probe(10);
    // The edge: the value whose miss is Z80 spreads from the prediction (the prediction and spread come from the values before it only).
    const predicted = 10 - nearestDoubleOf({ num: centre.miss.num, den: centre.miss.den });
    expect(centre.sd).toBeGreaterThan(0);
    const edge = predicted + Z80 * centre.sd;
    expect(probe(edge - 1e-9).inBand).toBe(true);
    expect(probe(edge + 1e-9).inBand).toBe(false);
    expect(probe(predicted - Z80 * centre.sd - 1e-9).inBand).toBe(false);
    expect(probe(predicted - Z80 * centre.sd + 1e-9).inBand).toBe(true);
  });
  it("is inside only for a miss of 0 where the past had no miss", () => {
    const flat = (v: number) => backtest(months("2024-01", [3, 5, 9, 4, 3, 5, 9, 4, 3, 5, 9, v]), "month", 4, "holtWinters", 1)!.outcomes[0];
    expect(flat(4).inBand).toBe(true);
    expect(flat(4).sd).toBe(0);
    expect(flat(4.000001).inBand).toBe(false);
  });
});

describe("the choice of the Method", () => {
  for (const [name, c] of Object.entries(CASES)) {
    if (!c.choice) continue;
    it(`${name}: ${c.choice!.method} (${c.choice!.why}), as the reference and Python say`, () => {
      const y = c.values.map((v) => exactOf(v as number));
      const ref = referenceChoice(y, c.season);
      const choice = chooseMethod(points(c), "month", c.season);
      expect({ method: choice.method, why: choice.why }).toEqual({ method: c.choice!.method, why: c.choice!.why });
      expect({ method: choice.method, why: choice.why, tested: choice.seasonal?.tested ?? ref.tested }).toEqual(ref);
      if (choice.seasonal) {
        expect(choice.holt?.tested).toBe(c.choice!.tested);
        expect(eq(choice.holt!.missTotal, parse(c.choice!.holtTotal))).toBe(true);
        expect(eq(choice.seasonal.missTotal, parse(c.choice!.seasonalTotal))).toBe(true);
      }
    });
  }
  it("compares on the last third of the series, the same periods for both", () => {
    const choice = chooseMethod(months("1949-01", AIRLINE.slice(0, 48)), "month", 12);
    expect(choice.holt!.outcomes.map((o) => o.period)).toEqual(choice.seasonal!.outcomes.map((o) => o.period));
    // A third of 48 is 16: values 32 to 47.
    expect(choice.holt!.outcomes[0].period).toBe(shiftPeriod("1949-01-01", "month", 32));
    expect(choice.holt!.tested).toBe(16);
  });
  it(`needs ${TRACK_MIN} periods both can be tested on: with 2 it is Holt and says there were too few, with 3 it compares`, () => {
    const [two, three] = [chooseMethod(months("1949-01", AIRLINE.slice(0, 26)), "month", 12), chooseMethod(months("1949-01", AIRLINE.slice(0, 27)), "month", 12)];
    expect(two).toMatchObject({ method: "holt", why: "too-few", holt: null, seasonal: null });
    expect(three.why).toBe("better");
    expect(three.holt!.tested).toBe(TRACK_MIN);
    expect(referenceChoice(AIRLINE.slice(0, 26).map(exactOf), 12).why).toBe("too-few");
    expect(referenceChoice(AIRLINE.slice(0, 27).map(exactOf), 12).tested).toBe(3);
  });
  it("is Holt where the seasonal Method cannot run: too few values, a gap at the start, a season of one", () => {
    for (const [pts, m] of [[months("2024-01", [1, 2, 3, 4, 5, 6, 7]), 4], [months("2024-01", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).filter((_, i) => i !== 3), 4], [months("2024-01", [1, 2, 3, 4, 5, 6, 7, 8, 9]), 1]] as const) {
      expect(chooseMethod([...pts], "month", m)).toEqual({ method: "holt", why: "holt-only", holt: null, seasonal: null });
    }
  });
  it("is Holt on a tie: where both miss alike, the plain trend is kept", () => {
    const choice = chooseMethod(months("2024-01", Array(24).fill(7).map((v, i) => v + 0 * i)), "month", 4);
    expect(choice).toMatchObject({ method: "holt", why: "not-better" });
    expect(choice.holt!.missTotal.num).toBe(0n);
    expect(choice.seasonal!.missTotal.num).toBe(0n);
  });
  it("is the seasonal Method where it misses less, and Holt where it misses more", () => {
    expect(chooseMethod(months("2024-01", Array.from({ length: 20 }, (_, t) => 10 + 2.5 * t + [-3, 1, 4, -2][t % 4])), "month", 4).method).toBe("holtWinters");
    expect(chooseMethod(months("2024-01", CASES["noisy-line-48"].values as number[]), "month", 12).method).toBe("holt");
  });
  it("reads the reference's rule the same on generated series (and never decides on fewer than three periods)", () => {
    const series = fc.constantFrom(2, 3, 4).chain((m) => fc.integer({ min: 2 * m + 1, max: 4 * m + 12 }).chain((n) => fc.tuple(fc.constant(m), fc.array(valueText.map(Number), { minLength: n, maxLength: n }))));
    fc.assert(
      fc.property(series, ([m, vs]) => {
        const ref = referenceChoice(vs.map(exactOf), m);
        const choice = chooseMethod(months("2024-01", vs), "month", m);
        expect(choice.method, `${m}: ${vs}`).toBe(ref.method);
        expect(choice.why, `${m}: ${vs}`).toBe(ref.why);
        if (choice.why === "too-few") expect(ref.tested).toBeLessThan(TRACK_MIN);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
  it("does not change with a shift or a scale of the values, with the order of the periods, or between runs", () => {
    const series = fc.constantFrom(3, 4).chain((m) => fc.integer({ min: 3 * m, max: 3 * m + 10 }).chain((n) => fc.tuple(fc.constant(m), fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: n, maxLength: n }))));
    fc.assert(
      fc.property(series, fc.integer({ min: -500, max: 500 }), fc.constantFrom(-2, 3, 10), fc.integer({ min: 0, max: 99 }), ([m, vs], shift, k, at) => {
        const key = (v: number[], order = (p: Point[]) => p) => {
          const c = chooseMethod(order(months("2024-01", v)), "month", m);
          return JSON.stringify([c.method, c.why, c.holt?.tested, c.seasonal?.tested, c.holt?.inBand, c.seasonal?.inBand]);
        };
        const base = key(vs);
        expect(key(vs.map((v) => v + shift)), "shift").toBe(base);
        // A scale by a whole number k keeps every comparison (the misses scale together; the spread and the miss scale together).
        expect(JSON.parse(key(vs.map((v) => v * k))).slice(0, 2)).toEqual(JSON.parse(base).slice(0, 2));
        expect(key(vs, (p) => shuffled(p, at)), "order").toBe(base);
        expect(key(vs), "twice").toBe(base);
      }),
      { numRuns, seed },
    );
  });
});

describe("exact on the values' text", () => {
  it("by hand: 10, 12, 14, 16, 18 continue the line, so 18 is no miss; 19 against the predicted 20 misses by 1: tested 2, typical miss 1/2, one inside", () => {
    // Holt starts at level 10 and trend 2, and a straight line is predicted with no miss at all, so the spread is 0.
    const record = backtest(months("2024-01", [10, 12, 14, 16, 18, 19]), "month", 12, "holt", 2)!;
    expect(record.outcomes.map((o) => [o.period, Number(o.miss.num) / Number(o.miss.den), o.sd, o.inBand])).toEqual([["2024-05-01", 0, 0, true], ["2024-06-01", -1, 0, false]]);
    expect([record.tested, record.inBand, record.typicalMiss]).toEqual([2, 1, 0.5]);
  });
  it("the miss is exact on the text: 0.65 against the predicted 0.6 is 0.05, not 0.05000000000000004", () => {
    const record = backtest(months("2024-01", [0.1, 0.2, 0.3, 0.4, 0.5, 0.65]), "month", 12, "holt", 1)!;
    expect(record.typicalMiss).toBe(0.05);
    expect(record.missTotal).toEqual({ num: 1n, den: 20n });
  });
});
