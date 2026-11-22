// Change point (spec 0041, Method `changePoint`): equal to the reference (every date tried from scratch by Cramer's rule, the chance
// rule from the F ratio) exactly on the values' text, to NumPy and SciPy (`polyfit`, `f.sf`, `t.ppf`) to a relative 1e-9, planted
// changes found, the chance rule at the bar for the dates tried one step either side, a simulation of how often noise is called a
// change, properties, hostile input, and the Takeaway with its suitability limits one step either side.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatValue, type ValueUnit } from "../format";
import type { TakeawayContext } from "../takeaways/takeaway";
import { referenceChange } from "../test/reference/before-after";
import { runs } from "../test/reference/check";
import { exactOf, nearestDoubleOf } from "../test/reference/exact";
import { close, series } from "../test/reference/methods-fixture";
import type { Point } from "../types";
import { changePoint, changePointTakeaway, MOST_VALUES, ONE_IN, type ChangePoint } from "./change-point";

const { numRuns, seed } = runs();
type ChangeCase = { values: number[]; positions?: number[]; n: number; tries: number; index: number; sse0: number; sse1: number; before: number; after: number; step: number; found: boolean; p: number | null; ratio: number; bar: number; slopeHalf?: number; kept?: number };
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/before-after.json", import.meta.url), "utf8")) as { tools: Record<string, string>; change: Record<string, ChangeCase> };
const ctx: TakeawayContext = { style: "1,234.5" };
const euro: ValueUnit = { unit: "€", unit_position: "after", decimals: 0 };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const monthStart = (i: number) => new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10);
const ok = (r: ChangePoint | { ok: false; why: string }): ChangePoint => {
  if (!r.ok) throw new Error(`no change point: ${r.why}`);
  return r;
};
const at = (positions: number[], values: number[]): Point[] => positions.map((x, i) => ({ period: monthStart(x), value: values[i] }));
const noise = (i: number) => ((i * 37) % 11) - 5;

// The code held to the reference: the date, the chance rule and the lines exactly; the root and t where they are read.
function expectReference(positions: number[], values: number[]) {
  const got = ok(changePoint(at(positions, values), "month"));
  const ref = referenceChange(positions, values.map(exactOf));
  expect(got.n, "n").toBe(ref.n);
  expect(got.tries, "tries").toBe(ref.tries);
  expect(got.index, "index").toBe(ref.index);
  expect(got.found, "found").toBe(ref.found);
  expect(got.before, "slope before").toBe(nearestDoubleOf(ref.left.slope));
  expect(got.after, "slope after").toBe(nearestDoubleOf(ref.right.slope));
  expect(got.slopeChange, "change in slope").toBe(nearestDoubleOf(ref.slopeChange));
  expect(got.step, "step").toBe(nearestDoubleOf(ref.step));
  expect(got.period).toBe(monthStart(positions[ref.index]));
  const d = ref.n - 4;
  expect(got.spread, "typical miss").toBe(Math.sqrt(nearestDoubleOf({ num: ref.sse1.num, den: ref.sse1.den * BigInt(d) })));
  expect(got.kept, "kept").toBe(ref.sse0.num === 0n ? null : nearestDoubleOf({ num: ref.sse1.num * ref.sse0.den, den: ref.sse1.den * ref.sse0.num }));
  return got;
}

describe("the change point against NumPy and SciPy", () => {
  it.each(Object.entries(fixture.change))("%s: the date, the lines, the F ratio's chance against the bar and whether it is found equal NumPy's and SciPy's (to a relative 1e-9)", (name, c) => {
    const positions: number[] = c.positions ?? c.values.map((_: number, i: number) => i);
    const got = ok(changePoint(at(positions, c.values), "month"));
    expect([got.n, got.tries, got.index, got.found], name).toEqual([c.n, c.tries, c.index, c.found]);
    const same = (a: number, b: number, what: string) => expect(close(a, b, 1e-9), `${name} ${what}: ${a} vs ${b}`).toBe(true);
    same(got.before, c.before, "slope before");
    same(got.after, c.after, "slope after");
    same(got.step, c.step, "step");
    if (c.slopeHalf !== undefined) {
      same(got.slopeHalf, c.slopeHalf, "range of the change in slope");
      same(got.kept!, c.kept!, "kept");
      same(got.spread, Math.sqrt(c.sse1 / (c.n - 4)), "typical miss");
    }
    expectReference(positions, c.values);
  });
  it("is found just under the bar and not found just over it, as SciPy's F chance says: the pair of series differing only in how loud their noise is", () => {
    const [under, over] = [fixture.change["just-found"], fixture.change["just-not-found"]];
    expect([under.ratio < 1, over.ratio > 1, under.ratio > 0.9, over.ratio < 1.1]).toEqual([true, true, true, true]);
    expect(ok(changePoint(series(under.values), "month")).found).toBe(true);
    expect(ok(changePoint(series(over.values), "month")).found).toBe(false);
  });
  it("has the fixture made by the current script, naming its tools", () => {
    expect(Object.keys(fixture.tools).sort()).toEqual(["numpy", "scipy"]);
    expect(ONE_IN).toBe(20);
  });
});

describe("the change point, planted changes found", () => {
  const level = (n: number, k: number, jump: number) => Array.from({ length: n }, (_, i) => 100 + 2 * i + (i >= k ? jump : 0));
  const kink = (n: number, k: number, up: number, down: number) => Array.from({ length: n }, (_, i) => 50 + (i < k ? up * i : up * k + down * (i - k)));
  it("finds a planted step in level at its date, with the size, when there is no noise", () => {
    for (const [n, k] of [[12, 6], [20, 7], [20, 13], [30, 15], [40, 20], [9, 4], [8, 4]]) {
      const got = ok(changePoint(series(level(n, k, 80)), "month"));
      expect([got.index, got.found, got.step, got.before, got.after, got.kept], `n=${n} k=${k}`).toEqual([k, true, 80, 2, 2, 0]);
    }
  });
  it("finds a planted change of direction at its date, with both slopes, when there is no noise (the two lines meet, so the step is 0)", () => {
    for (const [n, k, up, down] of [[20, 10, 5, -3], [24, 8, 1, 6], [30, 20, -2, 4], [16, 8, 0, 7]] as const) {
      const got = ok(changePoint(series(kink(n, k, up, down)), "month"));
      // The two lines meet at the join, which belongs to the later part: its line is 50 + up·k at k, the earlier line's extrapolation is the same.
      expect([got.index, got.found, got.before, got.after, got.step], `n=${n} k=${k}`).toEqual([k, true, up, down, 0]);
    }
  });
  it("finds planted changes within 2 periods of their date through noise, in the fixture, and says none for noise alone", () => {
    for (const [name, planted] of [["level-step", 15], ["turn-around", 15], ["speeds-up", 18]] as const) {
      const got = ok(changePoint(series(fixture.change[name].values), "month"));
      expect(got.found, name).toBe(true);
      expect(Math.abs(got.index - planted), name).toBeLessThanOrEqual(2);
    }
    for (const name of ["noise-only", "line-and-noise", "eight-noise"]) expect(ok(changePoint(series(fixture.change[name].values), "month")).found, name).toBe(false);
  });
  it("is found at the very edge: 4 values either side (the least), and not tried with 3", () => {
    const got = ok(changePoint(series(level(8, 4, 60)), "month"));
    expect([got.index, got.tries, got.found]).toEqual([4, 1, true]);
    // A step with only 3 values after it is never a date tried: the best of the dates that are tried is at 4 (or 3 from the end, 5, whose later line is the better fit).
    const late = ok(changePoint(series(level(9, 6, 60)), "month"));
    expect(late.index).toBeGreaterThanOrEqual(4);
    expect(late.index).toBeLessThanOrEqual(5);
  });
  it("calls the change at the earliest date when two dates leave the same misses", () => {
    // Four 0s, then a step to 1 held for four values, then 2: ties between dates.
    const got = ok(changePoint(series([0, 0, 0, 0, 1, 1, 1, 1]), "month"));
    expect(got.index).toBe(4);
    expect(expectReference(Array.from({ length: 8 }, (_, i) => i), [0, 0, 0, 0, 1, 1, 1, 1]).index).toBe(4);
  });
});

describe("the chance rule, at the bar for the number of dates tried", () => {
  // Two lines against one: found when (SSE₀ ÷ SSE₁)^(n − 4) > (20 · tries)², decided exactly.
  it("clears a fixed ratio of misses with few dates tried and fails it with more: the bar rises with the number of dates (n = 8: 1 date)", () => {
    const [few, many] = [fixture.change["eight-noise"], fixture.change["noise-only"]];
    expect([few.tries, many.tries]).toEqual([1, 23]);
    // The same improvement of two lines over one is judged against 20² at 1 date and against (20 · 17)² at 17: with 24 values, a ratio of misses of 1.5 clears the first (1.5²⁰ = 3325 > 400) and not the second (3325 < 115,600).
    const clears = (n: number, tries: number, r: number) => r ** (n - 4) > (ONE_IN * tries) ** 2;
    expect([clears(24, 1, 1.5), clears(24, 17, 1.5)]).toEqual([true, false]);
  });
  it("uses (20 · tries)² and not 20²: a series that clears one look's bar by a fifth fails the bar of its own number of dates (SciPy's chance on the fixture's pair says the same)", () => {
    const over = fixture.change["just-not-found"];
    // Its chance is above 1 in 20 divided by the dates tried (24 values: 17 dates), and below 1 in 20 by itself: it would be found if only one date had been looked at.
    expect(over.p).toBeLessThan(0.05);
    expect(over.p).toBeGreaterThan(over.bar);
    expect(over.tries).toBe(17);
    expect(ok(changePoint(series(over.values), "month")).found).toBe(false);
  });
  it("is decided exactly: a ratio of misses exactly at the bar is not found, and a hair above it is", () => {
    // n = 8 (4 degrees of freedom, one date, bar 20² = 400): found when (SSE₀ ÷ SSE₁)⁴ > 400, i.e. SSE₀ ÷ SSE₁ above √20 = 4.4721…, which no ratio of whole numbers equals;
    // n = 9 (5 df, 2 dates, bar 40² = 1600): (SSE₀ ÷ SSE₁)⁵ > 1600; with a ratio of 4: 1024 (not), of 5: 3125 (found).
    const eight = (v: number[]) => ok(changePoint(series(v), "month"));
    const ref = (v: number[]) => referenceChange(v.map((_, i) => i), v.map(exactOf));
    for (const v of [[0, 1, 0, 1, 10, 11, 10, 11], [0, 1, 0, 1, 3, 4, 3, 4], [5, 1, 5, 1, 9, 1, 9, 5], [0, 2, 0, 2, 5, 8, 5, 8]]) expect(eight(v).found, v.join()).toBe(ref(v).found);
  });
  it("rarely calls noise a change: of 600 series of 24 noisy values with a gentle trend, at most 5 % (the bar is shared among 17 dates; the rate is well under it)", () => {
    let state = 20_417;
    const next = () => (state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
    const gauss = () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
    let found = 0;
    for (let r = 0; r < 600; r++) {
      const values = Array.from({ length: 24 }, (_, i) => Math.round((100 + 1.5 * i + 7 * gauss()) * 100) / 100);
      if (ok(changePoint(series(values), "month")).found) found++;
    }
    expect(found).toBeLessThanOrEqual(30);
  });
  it("finds a clear planted step in nearly every noisy series: at least 99 of 100", () => {
    let state = 99;
    const next = () => (state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
    const gauss = () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
    let found = 0;
    for (let r = 0; r < 100; r++) {
      const values = Array.from({ length: 24 }, (_, i) => Math.round((100 + 1.5 * i + (i >= 12 ? 60 : 0) + 7 * gauss()) * 100) / 100);
      if (ok(changePoint(series(values), "month")).found) found++;
    }
    expect(found).toBeGreaterThanOrEqual(99);
  });
});

describe("the change point equals the reference on generated series", () => {
  const value = fc.integer({ min: -2_000_000, max: 2_000_000 }).map((v) => v / 100);
  const generated = fc.record({ values: fc.array(value, { minLength: 8, maxLength: 28 }), gaps: fc.array(fc.nat({ max: 3 }), { minLength: 0, maxLength: 28 }) }).map(({ values, gaps }) => {
    let x = 0;
    return { positions: values.map((_, i) => (x += i === 0 ? 0 : 1 + (gaps[i] === 3 ? 1 : 0))), values };
  });
  it(`holds, gaps included (${numRuns * 2} series, seed ${seed})`, () => {
    fc.assert(fc.property(generated, ({ positions, values }) => void expectReference(positions, values)), { numRuns: numRuns * 2, seed });
  });
  it(`holds on series with a planted change and noise (${numRuns} series, seed ${seed})`, () => {
    const planted = fc.record({ n: fc.integer({ min: 8, max: 40 }), k: fc.double({ min: 0.2, max: 0.8, noNaN: true }), jump: fc.integer({ min: -500, max: 500 }), turn: fc.integer({ min: -9, max: 9 }), noise: fc.array(fc.integer({ min: -300, max: 300 }), { minLength: 40, maxLength: 40 }) });
    fc.assert(
      fc.property(planted, ({ n, k, jump, turn, noise: e }) => {
        const at0 = Math.floor(n * k);
        const values = Array.from({ length: n }, (_, i) => (1000 + 3 * i + (i >= at0 ? jump + turn * (i - at0) : 0) + e[i]) / 1);
        void expectReference(values.map((_, i) => i), values);
      }),
      { numRuns, seed },
    );
  });
});

describe("the change point, properties", () => {
  const cents = fc.integer({ min: -100_000, max: 100_000 });
  const arb = fc.array(cents, { minLength: 8, maxLength: 26 });
  const run = (cs: number[]) => ok(changePoint(series(cs.map((c) => c / 100)), "month"));
  const props = (name: string, body: (cs: number[]) => void) => it(`${name} (${numRuns} series, seed ${seed})`, () => fc.assert(fc.property(arb, body), { numRuns, seed }));
  props("is unchanged by adding the same amount to every value: the same date, verdict, slopes, step and misses", (cs) => {
    const [a, b] = [run(cs), run(cs.map((c) => c + 50_000))];
    expect([b.index, b.found, b.before, b.after, b.step, b.spread, b.slopeHalf, b.kept]).toEqual([a.index, a.found, a.before, a.after, a.step, a.spread, a.slopeHalf, a.kept]);
  });
  props("scales exactly with the values: four times the values give the same date and verdict, and four times the slopes, step and miss", (cs) => {
    const [a, b] = [run(cs), run(cs.map((c) => c * 4))];
    expect([b.index, b.found, b.kept]).toEqual([a.index, a.found, a.kept]);
    expect([b.before, b.after, b.step, b.spread, b.slopeHalf]).toEqual([4 * a.before, 4 * a.after, 4 * a.step, 4 * a.spread, 4 * a.slopeHalf]);
  });
  props("is unchanged in its date, verdict and step by adding a straight trend to every value, and both slopes rise by it", (cs) => {
    const [a, b] = [run(cs), run(cs.map((c, i) => c + 300 * i))];
    expect([b.index, b.found, b.step, b.kept]).toEqual([a.index, a.found, a.step, a.kept]);
    expect(b.before).toBeCloseTo(a.before + 3, 9);
    expect(b.after).toBeCloseTo(a.after + 3, 9);
    expect(b.slopeChange).toBeCloseTo(a.slopeChange, 9);
  });
  props("keeps within bounds: the date has 4 values each side, the misses kept are between 0 and 1, the dates tried are n − 7", (cs) => {
    const a = run(cs);
    expect(a.index).toBeGreaterThanOrEqual(4);
    expect(a.index).toBeLessThanOrEqual(cs.length - 4);
    expect(a.tries).toBe(cs.length - 7);
    if (a.kept !== null) {
      expect(a.kept).toBeGreaterThanOrEqual(0);
      expect(a.kept).toBeLessThanOrEqual(1);
    }
    expect(a.slopeHalf).toBeGreaterThanOrEqual(0);
  });
  it(`finds the mirror of a change when time runs the other way (planted lines, no noise): the date n − k, the slopes swapped and negated (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 30 }), fc.double({ min: 0.3, max: 0.7, noNaN: true }), fc.integer({ min: -9, max: 9 }), fc.integer({ min: -9, max: 9 }), fc.integer({ min: 1, max: 200 }), (n, share, b1, b2, jump) => {
        // With a jump of b2 − b1 the last value before the date lies on the later line as well: two dates leave no misses, and the earlier one is called.
        fc.pre(jump !== b2 - b1);
        const k = Math.max(4, Math.min(n - 4, Math.floor(n * share)));
        const values = Array.from({ length: n }, (_, i) => 100 + (i < k ? b1 * i : b1 * k + jump + b2 * (i - k)));
        const [a, b] = [run(values.map((v) => v * 100)), run([...values].reverse().map((v) => v * 100))];
        // With exact lines on both sides the best date is unique, so the mirror is exact.
        expect([a.found, a.index]).toEqual([true, k]);
        expect([b.found, b.index]).toEqual([true, n - k]);
        expect(b.before).toBeCloseTo(-a.after, 12);
        expect(b.after).toBeCloseTo(-a.before, 12);
      }),
      { numRuns, seed },
    );
  });
  it(`gives the same bytes from the same input, from the input in any order, and with a period given twice (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(arb, (cs) => {
        const points = series(cs.map((c) => c / 100));
        const first = JSON.stringify(changePoint(points, "month"));
        expect(JSON.stringify(changePoint(points, "month"))).toBe(first);
        const twice = [{ period: points[0].period, value: 777 }, ...[...points].reverse(), { period: points[3].period, value: points[3].value }];
        expect(JSON.stringify(changePoint(twice, "month"))).toBe(first);
      }),
      { numRuns, seed },
    );
  });
  it("is the same for a Metric kept in weeks as in months, by position", () => {
    const values = [5, 7, 6, 9, 30, 33, 31, 36, 35, 38];
    const week = (i: number) => new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10);
    expect(changePoint(values.map((value, i) => ({ period: week(i), value })), "week")).toEqual({ ...ok(changePoint(series(values), "month")), period: week(4) });
  });
});

describe("the change point on hostile input", () => {
  it("is none for no values, one value, 7 values and 8 (the least, one step either side), and for more than the most", () => {
    expect(changePoint([], "month")).toEqual({ ok: false, why: "few" });
    expect(changePoint(series([1]), "month")).toEqual({ ok: false, why: "few" });
    expect(changePoint(series([1, 2, 9, 4, 5, 9, 1]), "month")).toEqual({ ok: false, why: "few" });
    expect(changePoint(series([1, 2, 9, 4, 5, 9, 1, 3]), "month").ok).toBe(true);
    const many = (n: number): Point[] => Array.from({ length: n }, (_, i) => ({ period: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), value: (i * 7919) % 101 }));
    expect(changePoint(many(MOST_VALUES), "day").ok).toBe(true);
    expect(changePoint(many(MOST_VALUES + 1), "day")).toEqual({ ok: false, why: "long" });
  });
  it("leaves out values that are not numbers, counts a period twice once with the last value, and orders unsorted input", () => {
    const clean = series([4, 1, 3, 2, 9, 7, 8, 6, 5, 12]);
    const dirty = [{ period: "2031-01-01", value: NaN }, ...[...clean].reverse(), { period: clean[0].period, value: 100 }, { period: clean[0].period, value: 4 }, { period: "2031-02-01", value: Infinity }];
    expect(changePoint(dirty, "month")).toEqual(changePoint(clean, "month"));
  });
  it("is the right answer, never a wrong number, for a constant series (no misses at all: not found), huge values and tiny values", () => {
    const flat = ok(changePoint(series(Array(12).fill(5)), "month"));
    expect([flat.found, flat.kept, flat.step, flat.before, flat.after]).toEqual([false, null, 0, 0, 0]);
    const huge = ok(changePoint(series([...Array(8).fill(1e12), ...Array(8).fill(3e12)]), "month"));
    expect([huge.found, huge.index, huge.step]).toEqual([true, 8, 2e12]);
    const tiny = ok(changePoint(series([...Array(8).fill(1e-12), ...Array(8).fill(3e-12)]), "month"));
    expect([tiny.found, tiny.index, tiny.step]).toEqual([true, 8, 2e-12]);
    expect(changePoint(series(Array.from({ length: 16 }, (_, i) => 1e308 + (i % 5) * 1e307)), "month")).toEqual({ ok: false, why: "huge" });
  });
});

const text = (t: ReturnType<typeof changePointTakeaway>) => [t.sentence, t.refusal, t.basis, t.footer, ...t.cautions, ...t.notes, ...t.assumptions, ...t.numbers.flatMap((n) => [n.label, n.text])].filter((x): x is string => typeof x === "string");

describe("the Takeaway of a change point", () => {
  const kink = (n: number, k: number, up: number, down: number, base = 50) => Array.from({ length: n }, (_, i) => base + (i < k ? up * i : up * k + down * (i - k)));
  it("says where, how it went before and since, and the step, in the Metric's unit and period, with no strength word, no range and no footer", () => {
    const t = changePointTakeaway("Signups", series(kink(20, 10, 5, -3)), "month", euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Around November 2024, Signups changed: before, it went up 5 € a month; since, down 3 € a month; and at that point its level was just where the earlier trend would have put it.");
    expect([t.strength, t.strengthText, t.range, t.footer]).toEqual([null, null, null, null]);
    expect(t.basis).toBe("from a straight line before the date and another after it, over 20 months, with the bar for chance raised for the dates tried (13)");
    expect(t.assumptions).toEqual(["This looks for one change only; the date is the one that fits best, and nearby dates may fit almost as well."]);
    expect(t.figures.map((f) => [f.label, f.value, f.text])).toEqual([["Trend before the date (per period)", 5, "5 €"], ["Trend after the date (per period)", 3, "3 €"], ["Step in level at the date", 0, "0 €"]]);
  });
  it("says a step up and a step down in level, and a flat before or after", () => {
    const up = changePointTakeaway("Signups", series(Array.from({ length: 16 }, (_, i) => 100 + 2 * i + (i >= 8 ? 80 : 0))), "month", euro, ctx);
    expect(up.sentence).toBe("Around September 2024, Signups changed: before, it went up 2 € a month; since, up 2 € a month; and at that point its level was 80 € higher than the earlier trend would have given.");
    const down = changePointTakeaway("Signups", series(Array.from({ length: 16 }, (_, i) => (i < 8 ? 100 : 20 - 0.5 * i))), "month", { unit: "€", unit_position: "after", decimals: 1 }, ctx);
    expect(down.sentence).toMatch(/^Around September 2024, Signups changed: before, it went neither up nor down; since, down 0\.5 € a month; and at that point its level was [\d.]+ € lower than the earlier trend would have given\.$/);
  });
  it("says that nothing stands out for noise, with the dates tried, and still shows the best date under Show the numbers", () => {
    const c = fixture.change["noise-only"];
    const t = changePointTakeaway("Signups", series(c.values), "month", euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Over 30 months, nothing in Signups stands out as a change in its level or in where it was heading.");
    expect(t.basis).toContain("(23)");
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "Periods used", "Dates tried", "Best date", "Misses left, against one line"]);
    expect(t.footer).toBeNull();
    expect(t.figures.map((f) => f.value)).toEqual([30]);
  });
  it("is a refusal in words for too few periods (7 of 8, one step either side), a series that hardly changes, too many gaps and numbers too large, with no number, range, strength or footer", () => {
    const refusal = (t: ReturnType<typeof changePointTakeaway>) => {
      expect(t.kind).toBe("refusal");
      expect([t.sentence, t.range, t.strength, t.footer, t.basis]).toEqual([null, null, null, null, null]);
      expect(t.figures).toEqual([]);
      return t.refusal;
    };
    expect(refusal(changePointTakeaway("A", series([1, 4, 2, 7, 3, 8, 2]), "month", euro, ctx))).toBe("Not enough months yet: 7 of 8 needed.");
    expect(changePointTakeaway("A", series([1, 4, 2, 7, 3, 8, 2, 9]), "month", euro, ctx).kind).toBe("answer");
    expect(refusal(changePointTakeaway("A", series(Array(12).fill(3)), "month", euro, ctx))).toBe("A has hardly changed, so there is nothing to compare.");
    expect(refusal(changePointTakeaway("A", series([1, 4, null, 7, 3, null, null, 9, 5, 6, 2, 8]), "month", euro, ctx))).toMatch(/^A: no value for 3 of 12 months, too many to go on\./);
    expect(refusal(changePointTakeaway("A", series(Array.from({ length: 16 }, (_, i) => 1e308 + (i % 5) * 1e307)), "month", euro, ctx))).toBe("The values of A are too large to work out a range from.");
  });
  it("says nothing stands out for a perfect straight line, with no misses to compare, and shows no share of misses left", () => {
    const t = changePointTakeaway("A", series(Array.from({ length: 12 }, (_, i) => 5 + 2 * i)), "month", euro, ctx);
    expect(t.sentence).toBe("Over 12 months, nothing in A stands out as a change in its level or in where it was heading.");
    expect(t.numbers.find((n) => n.label === "Misses left, against one line")!.text).toBe("–");
  });
  it("says so, in words, when a difference is too small to write out, and writes a number of Show the numbers that no digit could show in scientific form", () => {
    const tiny = Array.from({ length: 16 }, (_, i) => (i < 8 ? 1e-30 * i : 1e-30 * (50 + 3 * i)));
    expect(changePointTakeaway("A", series(tiny), "month", euro, ctx).refusal).toBe("A: the difference is too small to write out.");
    // Lines that fit but for a miss of 1e-25 (the first value is off its line by that): the typical miss is 1e-25, which no 20 decimals show.
    const t = changePointTakeaway("A", series([1e-25, 1, 2, 3, 20, 25, 30, 35, 40, 45]), "month", euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.numbers.find((n) => n.label === "Typical miss")!.text).toMatch(/^\d\.\d\de-\d+ €$/);
    expect(t.numbers.find((n) => n.label === "Misses left, against one line")!.text).toMatch(/^0\.0+\d+ %$|e-/);
  });
  it("does not judge far-off values when what is left is too few to look for a change in: 9 values with a change pulled by 3 far-off ones read as it is", () => {
    // Without the most extreme value 8 are left, still a change (not a caution); without two, 7 are left, which is too few, so nothing more is said.
    const t = changePointTakeaway("A", series([95, 99, 103, 96, 100, 104, 297, 341, 385]), "month", euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toMatch(/^Around /);
    expect(t.cautions).toEqual([]);
  });
  it("holds the minimum and the gaps to the periods used, in the sentence and the numbers alike", () => {
    const values = Array.from({ length: 24 }, (_, i) => 100 + 2 * i + (i >= 12 ? 70 : 0) + 3 * noise(i));
    const gappy = values.map((v, i): number | null => (i === 5 || i === 17 ? null : v));
    const t = changePointTakeaway("A", series(gappy), "month", euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.cautions).toEqual(["A: no value for 2 of 24 months, left out."]);
    expect(t.basis).toContain("over 22 months");
    expect(t.numbers.find((n) => n.label === "Periods used")!.text).toBe("22");
    expect(t.numbers.find((n) => n.label === "Dates tried")!.text).toBe("15");
    expect(t.basis).toContain("(15)");
  });
  it("uses the latest 120 periods, and says so, giving what the 120 give", () => {
    const long = Array.from({ length: 140 }, (_, i) => 100 + i + (i >= 100 ? 90 : 0) + 4 * noise(i));
    const t = changePointTakeaway("A", series(long), "month", euro, ctx);
    expect(t.notes).toEqual(["Only the latest 120 months are looked at."]);
    expect(t.basis).toContain("over 120 months");
    const cut = changePointTakeaway("A", series(long).slice(20), "month", euro, ctx);
    expect(t.sentence).toBe(cut.sentence);
    expect(cut.notes).toEqual([]);
  });
  it("asks the far-off check about the change itself: a spike that makes a change leaves it without them (it reads no change at all), and the answer is still given, with the caution above it", () => {
    // A flat series with one far-off value at the 13th month: two lines fit it better than one, so a change is called there.
    const flat = Array.from({ length: 16 }, (_, i) => 100 + noise(i));
    const spiky = flat.map((v, i) => (i === 12 ? v + 200 : v));
    const plain = changePointTakeaway("A", series(spiky), "month", euro, ctx);
    expect(plain.sentence).toMatch(/^Around January 2025, A changed:/);
    expect(plain.cautions).toEqual(["This result is pulled by 1 month far from the rest; without them it reads no change at all."]);
    expect(changePointTakeaway("A", series(flat), "month", euro, ctx).cautions).toEqual([]);
  });
  it("says that the change is still there without the far-off values, and where, when it is: a real step at January 2025 and a spike in April 2024 that pulls the date to May", () => {
    const v = [90, 101, 112, 401, 112, 123, 112, 123, 134, 123, 134, 123, 164, 175, 164, 175, 186, 175, 186, 197, 186, 197, 186, 197];
    const t = changePointTakeaway("A", series(v), "month", euro, ctx);
    expect(t.sentence).toMatch(/^Around May 2024, A changed:/);
    expect(t.cautions).toEqual(["This result is pulled by 1 month far from the rest; without them it reads a change around January 2025."]);
  });
  it("does not run the far-off check when no change is found, and says nothing of far-off values then", () => {
    const flat = Array.from({ length: 20 }, (_, i) => 100 + noise(i));
    expect(changePointTakeaway("A", series(flat.map((v, i) => (i === 9 ? v + 1 : v))), "month", euro, ctx).cautions).toEqual([]);
  });
  it("writes numbers in the Number Style and the Metric's unit, and no forbidden word anywhere", () => {
    const de = { style: "1.234,5" as const };
    const unit: ValueUnit = { unit: "€", unit_position: "after", decimals: 2 };
    const t = changePointTakeaway("Umsatz", series(kink(20, 10, 5.5, -3.25)), "month", unit, de);
    expect(t.sentence).toContain(formatValue(unit, 5.5, de.style));
    expect(t.sentence).toContain("up 5,50 € a month");
    for (const x of text(t)) expect(x).not.toMatch(FORBIDDEN);
  });
  it("carries the same numbers in the sentence as the Method gave: each figure's text is in the sentence and equals the Method's number to the Metric's decimals", () => {
    const c = fixture.change["turn-around"];
    const t = changePointTakeaway("Signups", series(c.values), "month", euro, ctx);
    for (const f of t.figures) expect(t.sentence, f.label).toContain(f.text);
    const [before, after, step] = [Math.abs(c.before), Math.abs(c.after), Math.abs(c.step)];
    expect(t.figures.map((f) => f.text)).toEqual([Math.round(before), Math.round(after), Math.round(step)].map((v) => `${v} €`));
    expect(t.sentence).toMatch(new RegExp(`Around ${new Date(Date.UTC(2024, c.index, 1)).toLocaleString("en", { month: "long", timeZone: "UTC" })} 202`));
  });
  it("never writes a slope or step that is not zero as zero, or loses its sign", () => {
    const tiny = Array.from({ length: 16 }, (_, i) => (i < 8 ? 100 + 0.004 * i : 100.028 + 0.3 * (i - 8)));
    const t = changePointTakeaway("Fee", series(tiny), "month", euro, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toMatch(/up 0\.004 € a month/);
    for (const f of t.figures) expect(f.text, f.label).toMatch(/[1-9]/);
    for (const n of t.numbers.filter((x) => x.label.startsWith("Trend") || x.label.startsWith("Step"))) expect(n.text, n.label).toMatch(/[+−][\d.,]*[1-9]/);
  });
});
