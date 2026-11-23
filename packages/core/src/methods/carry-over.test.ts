// Ups and downs that carry over (spec 0041, rule 12): the first-order autocorrelation of a fit's misses against 2 spreads, decided exactly,
// checked against the same rule worked out in doubles, hostile input, and what it does for the false changes of a series that
// carries over (simulated first-order noise at 0.5 and 0.8).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fractionOf } from "../exact";
import { runs } from "../test/reference/check";
import { series } from "../test/reference/methods-fixture";
import { afterDate } from "./before-after";
import { carriesOver, carryOf, CARRY_SPREADS } from "./carry-over";
import { changePoint } from "./change-point";
import { div, mul, sub, total, whole } from "./fractions";

const { numRuns, seed } = runs();
const misses = (values: number[], at = values.map((_, i) => i)) => values.map((v, i) => ({ x: at[i], miss: fractionOf(v) }));
// The rule in doubles: r₁ > 0 and m · r₁² > 4, the pairs being periods that follow one another.
function inDoubles(vs: number[], at: number[]): boolean {
  let [along, all, m] = [0, 0, 0];
  vs.forEach((v, i) => {
    all += v * v;
    if (i > 0 && at[i] - at[i - 1] === 1) [along, m] = [along + v * vs[i - 1], m + 1];
  });
  return along > 0 && m * (along / all) ** 2 > CARRY_SPREADS ** 2;
}

describe("misses that carry over", () => {
  it("are not at an r₁ of exactly 1/2 over 16 pairs (16 · r₁² = 4 is not above 4), and are above it for a constant run", () => {
    const tie = [-1, -3, 1, -2, -2, -3, -3, -2, -2, 0, 1, -2, -2, -3, 1, 0, 0];
    expect(carriesOver(misses(tie))).toBe(false);
    expect(carriesOver(misses(Array(17).fill(1)))).toBe(true);
  });
  it("are a slow wave (each miss near the one before) and not an alternation, a constant or too little", () => {
    expect(carriesOver(misses([-5, -4, -3, -1, 0, 1, 3, 4, 5, 4, 2, 0, -2, -4]))).toBe(true);
    expect(carriesOver(misses([3, -3, 2, -4, 3, -2, 4, -3, 2, -3, 4, -2]))).toBe(false);
    expect(carriesOver(misses([0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(carriesOver(misses([]))).toBe(false);
    expect(carriesOver(misses([4]))).toBe(false);
    expect(carriesOver(misses([1, 2]))).toBe(false);
  });
  it("count only periods that follow one another: a gap between two breaks the pair, and nothing is filled in", () => {
    const wave = [-5, -4, -3, -1, 0, 1, 3, 4, 5, 4, 2, 0, -2, -4];
    expect(carriesOver(misses(wave, wave.map((_, i) => 2 * i)))).toBe(false);
    expect(carriesOver(misses(wave, wave.map((_, i) => i + (i > 6 ? 1 : 0))))).toBe(true);
  });
  it(`agree with the rule in doubles on generated misses, except within a hair of the bar (${numRuns * 2} lists, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { minLength: 0, maxLength: 30 }), fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }), (vs, jumps) => {
        let x = 0;
        const at = vs.map((_, i) => (x += i === 0 || !jumps[i] ? 1 : 2));
        const all = vs.reduce((s, v) => s + v * v, 0);
        const along = vs.reduce((s, v, i) => s + (i > 0 && at[i] - at[i - 1] === 1 ? v * vs[i - 1] : 0), 0);
        const m = vs.filter((_, i) => i > 0 && at[i] - at[i - 1] === 1).length;
        // A hair from the bar the doubles and the fractions may differ; the fractions are the exact ones.
        if (all > 0 && Math.abs(m * (along / all) ** 2 - 4) < 1e-9) return;
        expect(carriesOver(misses(vs, at))).toBe(inDoubles(vs, at));
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});

// A seeded stream of normal values, so that the simulations are the same every run.
function noise(start: number) {
  let state = start;
  const next = () => (state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
  return () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
}
const oneLineMisses = (v: number[]) => {
  const [xs, ys] = [v.map((_, i) => whole(i)), v.map((x) => fractionOf(x))];
  const [mx, my] = [div(total(xs), whole(v.length)), div(total(ys), whole(v.length))];
  const dx = xs.map((x) => sub(x, mx));
  const slope = div(total(dx.map((d, i) => mul(d, sub(ys[i], my)))), total(dx.map((d) => mul(d, d))));
  return v.map((_, i) => ({ x: i, miss: sub(sub(ys[i], my), mul(slope, dx[i])) }));
};

describe("what the check does for series that carry over (24 months, or 24 before a date and 12 after, a gentle trend, no change, noise of 7 with first-order carry-over phi)", () => {
  const rates = (phi: number, runsOf: number, start: number) => {
    const z = noise(start);
    let [found, flagged, flaggedAll] = [0, 0, 0];
    for (let r = 0; r < runsOf; r++) {
      let e = 0;
      const v = Array.from({ length: 24 }, (_, i) => Math.round((100 + 1.5 * i + 7 * (e = phi * e + z())) * 100) / 100);
      const c = changePoint(series(v), "month");
      if (carriesOver(oneLineMisses(v))) flaggedAll++;
      if (c.ok && c.found) {
        found++;
        if (c.carries) flagged++;
      }
    }
    return { found: found / runsOf, flagged: flagged / runsOf, flaggedAll: flaggedAll / runsOf };
  };
  it("independent noise: a change is found in at most 5 % of series, and the caution almost never appears", () => {
    const r = rates(0, 600, 7);
    expect(r.found).toBeLessThanOrEqual(0.05);
    expect(r.flaggedAll).toBeLessThanOrEqual(0.02);
  });
  it("phi 0.5: a change is found in a third of the series (the chance rule takes the misses as independent), and the caution marks more than half of those", () => {
    const r = rates(0.5, 600, 11);
    expect(r.found).toBeGreaterThan(0.2);
    expect(r.flagged / r.found).toBeGreaterThan(0.5);
  });
  it("phi 0.8: a change is found in more than half of the series, and the caution marks more than three in four of those", () => {
    const r = rates(0.8, 600, 13);
    expect(r.found).toBeGreaterThan(0.5);
    expect(r.flagged / r.found).toBeGreaterThan(0.75);
  });
  it("before and after reads the misses of the line before the date: carry-over there is said, and a series without it is not", () => {
    const z = noise(17);
    let [carries, none] = [0, 0];
    for (let r = 0; r < 300; r++) {
      let e = 0;
      const wave = Array.from({ length: 36 }, (_, i) => Math.round((100 + 1.5 * i + 7 * (e = 0.8 * e + z())) * 100) / 100);
      const a = afterDate(series(wave), "month", "2026-01-01");
      if (a.ok && a.carries) carries++;
      const flat = Array.from({ length: 36 }, (_, i) => Math.round((100 + 1.5 * i + 7 * z()) * 100) / 100);
      const b = afterDate(series(flat), "month", "2026-01-01");
      if (b.ok && b.carries) none++;
    }
    expect(carries / 300).toBeGreaterThan(0.2);
    expect(none / 300).toBeLessThan(0.05);
  });
});

describe("how strongly misses carry over (r₁ itself)", () => {
  it("is Σ eₜ·eₜ₊₁ ÷ Σ eₜ² over the neighbours: worked by hand, 1 for a constant run's pairs scaled by the unpaired end, -1 for a swing, 0 for none", () => {
    // 1, 2, 3: products 2 + 6 = 8 over 1 + 4 + 9 = 14.
    expect(carryOf(misses([1, 2, 3]))).toBeCloseTo(8 / 14, 15);
    expect(carryOf(misses([1, -1, 1, -1]))).toBeCloseTo(-3 / 4, 15);
    // A period without a value breaks a pair: 1, 2 · gap · 3 has the one pair 1·2 over 14.
    expect(carryOf(misses([1, 2, 3], [0, 1, 3]))).toBeCloseTo(2 / 14, 15);
    expect(carryOf(misses([0, 0, 0]))).toBe(0);
    expect(carryOf([])).toBe(0);
    expect(carryOf(misses([5]))).toBe(0);
  });
  it("agrees with the rule in doubles, and its sign is the sign carriesOver reads: positive only where the check can say so", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 2, maxLength: 24 }), (vs) => {
        const r = carryOf(misses(vs));
        const all = vs.reduce((s, v) => s + v * v, 0);
        const along = vs.slice(1).reduce((s, v, i) => s + v * vs[i], 0);
        expect(r).toBeCloseTo(all === 0 ? 0 : along / all, 12);
        if (carriesOver(misses(vs))) expect(r).toBeGreaterThan(0);
        expect(Math.abs(r)).toBeLessThanOrEqual(1);
      }),
      { numRuns, seed },
    );
  });
});
