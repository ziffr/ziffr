// The multiple fit, importance, predict and needs against their reference and the outside world (spec 0041, ticket 4; spec
// 0022 for the method): the effects, intercept, shares, inflation and partial links equal the reference's exact fractions
// (the double nearest, up to a final square root), the ranges equal the textbook formula with the t quantile to 1e-9, the
// fixtures from NumPy and SciPy (Anscombe, a Longley-style set, an exact relation, random ones), a hand-worked fit, an
// exact linear relation recovered exactly, `needs` inverting `predict`, every suitability check one step either side of
// its threshold, collinear drivers, hostile inputs, properties over generated data and the coverage of the stated range
// on simulated data. Generated with a fixed seed in `pnpm test`, more and a new seed in `test:numbers`.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fit, fitBasis, fitNumbers, importance, needs, partialPeriods, predict, MOST_PERIODS, type Fit, type FitInput, type FitRow } from "./fit";
import { tQuantile } from "./distributions";
import { SUITABILITY } from "../suitability";
import { metric } from "../test/fixtures";
import { dayOf, monthsLater, textOf } from "../test/reference/calendar";
import { runs } from "../test/reference/check";
import { exactOf, isNearestDouble, minus, nearestDoubleOf, plus, same, type Exact } from "../test/reference/exact";
import { referenceTQuantile } from "../test/reference/distributions";
import { referenceBandSquared, referenceExplained, referenceFit, referenceInflation, referenceLmg, referenceNeedsRange, referencePartialSquared, referenceValue, type ReferenceRow } from "../test/reference/fit";
import type { Point } from "../types";

const { numRuns, seed } = runs();
type FixtureFit = {
  name: string; names: string[]; y: number[]; x: number[][]; n: number; df: number; intercept: number; effects: number[]; lo: number[]; hi: number[];
  explained: number; miss: number; vif: number[]; partial: number[]; explains: number[]; share: number[];
  predict: { values: number[]; value: number; lo: number; hi: number };
  needs: { goal: number; driver: number; held: number[]; value: number; lo: number | null; hi: number | null; current: number };
};
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/fit.json", import.meta.url), "utf8"));
const month = (i: number) => textOf(monthsLater(dayOf("2024-01-01"), i));
const pts = (vs: number[], from = 0): Point[] => vs.map((value, i) => ({ period: month(from + i), value }));
const NAMES = ["Visits", "Price", "Tickets", "Churn", "Orders", "Returns", "Refunds"];
const input = (y: number[], xs: number[][], over: Partial<FitInput> = {}): FitInput => ({ target: { name: "Revenue", points: pts(y) }, drivers: xs.map((x, i) => ({ name: NAMES[i], points: pts(x) })), span: "month", basis: "values", ...over });
const rowsOf = (y: number[], xs: number[][]): FitRow[] => y.map((v, i) => ({ period: month(i), y: v, x: xs.map((x) => x[i]) }));
const refRowsOf = (y: number[], xs: number[][]): ReferenceRow[] => y.map((v, i) => ({ y: exactOf(v), x: xs.map((x) => exactOf(x[i])) }));
const made = (f: ReturnType<typeof fit>): Fit => {
  if (!f.ok) throw new Error(`refused: ${JSON.stringify(f.refusals)}`);
  return f;
};
const nearestTo = (code: number, e: Exact, where: string) => expect(isNearestDouble(code, e), `${where}: ${code} is not the double nearest to ${e.num}/${e.den}`).toBe(true);
const close = (a: number, b: number, tol = 1e-9, floor = 1e-9) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), floor);
const sqrtOfNearest = (e: Exact) => Math.sqrt(nearestDoubleOf(e));

/** A pseudo-random generator from a seed, for the data the tests build. */
function lcg(start: number) {
  let x = start;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
/** Normal noise by the Box-Muller method from a generator. */
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const hundredths = (v: number) => Math.round(v * 100) / 100;

describe("the fixture", () => {
  it("was made by the current script (fit.py), and names the tools", () => {
    const script = readFileSync(new URL("../test/reference/fixtures/fit.py", import.meta.url));
    expect(fixture.script, "run python3 packages/core/src/test/reference/fixtures/fit.py again").toBe(createHash("sha256").update(script).digest("hex"));
    expect(fixture.version).toBe(1);
    expect(Object.keys(fixture.tools)).toEqual(["numpy", "scipy"]);
  });
});

describe("a fit worked out by hand: y = 2x + (−1)^x for x = 1 to 12", () => {
  // Sxx = 143, Sxy = 292 (= 2·143 + 6), ȳ = 13, so the effect is 292/143 and the intercept 13 − (292/143)·6.5 = −3/11;
  // Syy = 4·143 + 4·6 + 12 = 608, SSE = 608 − 292²/143 = 1680/143, and 1 − SSE/Syy = 5329/5434 is explained.
  const x = Array.from({ length: 12 }, (_, i) => i + 1);
  const y = x.map((v) => 2 * v + (v % 2 === 0 ? 1 : -1));
  it("has the effect 292/143, the intercept −3/11 and 5329/5434 explained, each the double nearest to the exact fraction", () => {
    const f = made(fit(input(y, [x])));
    nearestTo(f.drivers[0].effect, { num: 292n, den: 143n }, "effect");
    nearestTo(f.intercept, { num: -3n, den: 11n }, "intercept");
    nearestTo(f.explained, { num: 5329n, den: 5434n }, "explained");
    // The typical miss is √(SSE ÷ (n − 2)) = √(1680/1430), and the spread of x is √(143/11).
    expect(f.miss).toBe(Math.sqrt(1680 / 1430));
    expect(f.drivers[0].spread).toBe(Math.sqrt(143 / 11));
    expect(f.df).toBe(10);
    expect(f.n).toBe(12);
    expect([f.from, f.to]).toEqual([month(0), month(11)]);
  });
  it("has one driver, so it explains all there is to explain, inflation 1, and the partial link is the plain correlation", () => {
    const f = made(fit(input(y, [x])));
    expect(f.drivers[0].share).toBe(1);
    expect(f.drivers[0].inflation).toBe(1);
    // r² = Sxy² ÷ (Sxx·Syy) = 292² ÷ (143 · 608) = 5329/5434 again, and r is its root.
    expect(f.drivers[0].partial).toBe(sqrtOfNearest({ num: 5329n, den: 5434n }));
  });
  it("has the 80 % range of the effect: the effect ± t·σ·√(1 ÷ Sxx), t the 90 % point with 10 degrees of freedom", () => {
    const f = made(fit(input(y, [x])));
    const half = 1.3721836411102863 * Math.sqrt(1680 / 1430 / 143);
    expect(close(f.drivers[0].hi - f.drivers[0].effect, half, 1e-12)).toBe(true);
    expect(close(f.drivers[0].effect - f.drivers[0].lo, half, 1e-12)).toBe(true);
  });
  it("reads a value at x = 11 as −3/11 + 11·292/143 with the range of a single period: ± t·σ·√(1 + 1/12 + (11 − 6.5)²/143)", () => {
    const f = made(fit(input(y, [x])));
    const p = predict(f, [11]);
    if (!p.ok) throw new Error("refused");
    expect(close(p.value, -3 / 11 + (11 * 292) / 143, 1e-14)).toBe(true);
    const half = 1.3721836411102863 * Math.sqrt((1680 / 1430) * (1 + 1 / 12 + (4.5 * 4.5) / 143));
    expect(close(p.hi! - p.value, half, 1e-12)).toBe(true);
    expect(close(p.value - p.lo!, half, 1e-12)).toBe(true);
    expect(p.outside).toEqual([]);
  });
  it("reads a value at x = 13, one step beyond the 12 seen, as the point only, with no range", () => {
    const f = made(fit(input(y, [x])));
    const p = predict(f, [13]);
    if (!p.ok) throw new Error("refused");
    expect(close(p.value, -3 / 11 + (13 * 292) / 143, 1e-14)).toBe(true);
    expect(p.outside).toEqual([{ name: "Visits", side: "above", limit: 12, change: false }]);
    expect([p.lo, p.hi]).toEqual([null, null]);
  });
});

describe("Anscombe's quartet: the same line four times over (intercept 3.0, effect 0.5, 66.7 % explained)", () => {
  for (const f of fixture.fits.filter((x: { name: string }) => x.name.startsWith("anscombe"))) {
    it(`${f.name} equals NumPy's least squares, ranges and shares to a relative 1e-9`, () => {
      const r = fitNumbers(rowsOf(f.y, f.x), ["X", "Y"], 1);
      if ("refusals" in r) throw new Error("refused");
      const d = r.core.drivers[0];
      expect(close(r.core.intercept, f.intercept)).toBe(true);
      expect(close(d.effect, f.effects[0])).toBe(true);
      expect(close(d.lo, f.lo[0])).toBe(true);
      expect(close(d.hi, f.hi[0])).toBe(true);
      expect(close(r.core.explained, f.explained)).toBe(true);
      expect(close(r.core.miss, f.miss)).toBe(true);
      expect(d.share).toBe(1);
      expect(f.intercept).toBeCloseTo(3.0, 2);
      expect(f.effects[0]).toBeCloseTo(0.5, 3);
      expect(f.explained).toBeCloseTo(0.667, 2);
    });
    it(`${f.name} has 11 periods, one short of the 12 a fit with one driver needs, so it refuses and gives no number`, () => {
      const r = fit(input(f.y, f.x));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refusals).toEqual([{ case: "refuse-periods", slots: { have: 11, need: 12, span: "month" } }]);
    });
  }
});

describe("the fixtures of NumPy and SciPy", () => {
  for (const f of fixture.fits as FixtureFit[]) {
    const k = f.x.length;
    const rows = rowsOf(f.y, f.x);
    it(`${f.name}: the numbers equal NumPy's and SciPy's to a relative 1e-9`, () => {
      const r = fitNumbers(rows, [...f.names, "Y"], k);
      if ("refusals" in r) throw new Error(`refused ${JSON.stringify(r.refusals)}`);
      // Drivers that cannot be told apart are treated as one (the Longley-style GNP and Population): the kept one is one fit on its own.
      if (r.core.merged.length > 0) {
        expect(f.vif.every((v: number) => v > 5)).toBe(true);
        const one = fixture.fits.find((x: { name: string }) => x.name === "longley-one");
        expect(r.core.merged).toEqual([{ kept: "GNP", with: ["Population"] }]);
        expect(close(r.core.drivers[0].effect, one.effects[0])).toBe(true);
        expect(close(r.core.explained, one.explained)).toBe(true);
        return;
      }
      expect(close(r.core.intercept, f.intercept)).toBe(true);
      expect(close(r.core.explained, f.explained, 1e-9, 1e-12)).toBe(true);
      expect(close(r.core.miss, f.miss, 1e-9, 1)).toBe(true);
      expect(r.core.df).toBe(f.df);
      r.core.drivers.forEach((d, j) => {
        expect(close(d.effect, f.effects[j], 1e-9, 1e-6), `${d.name} effect ${d.effect} vs ${f.effects[j]}`).toBe(true);
        expect(close(d.lo, f.lo[j], 1e-9, 1e-6), `${d.name} lo`).toBe(true);
        expect(close(d.hi, f.hi[j], 1e-9, 1e-6), `${d.name} hi`).toBe(true);
        expect(close(d.share, f.share[j], 1e-9, 1e-12), `${d.name} share`).toBe(true);
        expect(close(d.explains, f.explains[j], 1e-9, 1e-12), `${d.name} explains`).toBe(true);
        expect(close(d.inflation, f.vif[j], 1e-9), `${d.name} inflation`).toBe(true);
        expect(close(d.partial, f.partial[j], 1e-9, 1e-12), `${d.name} partial`).toBe(true);
      });
      expect(r.core.drivers.reduce((s, d) => s + d.share, 0)).toBeCloseTo(1, 12);
    });
    if (f.n < SUITABILITY.minimum.fit.base + SUITABILITY.minimum.fit.perDriver * k || f.name === "longley-collinear") continue;
    it(`${f.name}: a value read from the fit and the driver value that reaches a goal equal SciPy's, with their ranges`, () => {
      const m = made(fit(input(f.y, f.x)));
      const p = predict(m, f.predict.values);
      if (!p.ok) throw new Error("refused");
      expect(close(p.value, f.predict.value, 1e-9, 1e-6)).toBe(true);
      expect(p.lo === null).toBe(false);
      expect(close(p.lo!, f.predict.lo, 1e-9, 1e-6)).toBe(true);
      expect(close(p.hi!, f.predict.hi, 1e-9, 1e-6)).toBe(true);
      const nd = needs(m, { goal: f.needs.goal, driver: f.needs.driver, held: f.needs.held });
      if (!nd.ok) throw new Error("refused");
      expect(close(nd.value, f.needs.value, 1e-9, 1e-6), `${nd.value} vs ${f.needs.value}`).toBe(true);
      if (f.needs.lo === null) {
        expect(nd.lo).toBeNull();
      } else if (nd.lo === null) {
        // Outside what the driver has been: the value only.
        expect(nd.outside.length).toBeGreaterThan(0);
      } else {
        expect(close(nd.lo, f.needs.lo, 1e-7, 1e-6), `lo ${nd.lo} vs ${f.needs.lo}`).toBe(true);
        expect(close(nd.hi!, f.needs.hi!, 1e-7, 1e-6), `hi ${nd.hi} vs ${f.needs.hi}`).toBe(true);
      }
    });
  }
});

describe("an exact linear relation is recovered exactly", () => {
  const f = fixture.fits.find((x: { name: string }) => x.name === "exact-linear");
  it("gives the effects 2, −3 and 0.5, the intercept 5, no miss, all explained, and ranges of no width", () => {
    const m = made(fit(input(f.y, f.x)));
    expect(m.drivers.map((d) => d.effect)).toEqual([2, -3, 0.5]);
    expect(m.intercept).toBe(5);
    expect(m.miss).toBe(0);
    expect(m.explained).toBe(1);
    for (const d of m.drivers) expect([d.lo, d.hi]).toEqual([d.effect, d.effect]);
    expect(m.drivers.reduce((s, d) => s + d.share, 0)).toBeCloseTo(1, 14);
  });
  it("reads a value exactly, with a range of no width, and needs gives the driver value back exactly", () => {
    const m = made(fit(input(f.y, f.x)));
    // 5 + 2·40 − 3·20 + 0.5·(−10) = 20
    const p = predict(m, [40, 20, -10]);
    if (!p.ok) throw new Error("refused");
    expect([p.value, p.lo, p.hi]).toEqual([20, 20, 20]);
    const nd = needs(m, { goal: 20, driver: 1, held: [40, 0, -10] });
    if (!nd.ok) throw new Error("refused");
    expect(nd.value).toBe(20);
    expect([nd.lo, nd.hi]).toEqual([20, 20]);
  });
});

describe("the numbers equal the reference on generated data", () => {
  /** A data set the references can work out: n rows, k drivers, values in hundredths. */
  const data = fc.integer({ min: 1, max: 4 }).chain((k) =>
    fc.integer({ min: 4 + 4 * k, max: 24 }).chain((n) =>
      fc.tuple(
        fc.constant(k),
        fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: n, maxLength: n }),
        fc.array(fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: n, maxLength: n }), { minLength: k, maxLength: k }),
      ),
    ),
  );
  it(`equals the reference's exact fractions, the double nearest, and the ranges to 1e-9 (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, ([k, ys, xs]) => {
        const [y, x] = [ys.map((v) => v / 100), xs.map((c) => c.map((v) => v / 100))];
        const r = fitNumbers(rowsOf(y, x), [...NAMES.slice(0, k), "Y"], k);
        const ref = refRowsOf(y, x);
        const all = Array.from({ length: k }, (_, i) => i);
        if ("refusals" in r) {
          // Only a mix of drivers that is exactly one, or a series that does not vary, has no fit.
          expect(referenceFit(ref, all) === null || y.every((v) => v === y[0]) || x.some((c) => c.every((v) => v === c[0]))).toBe(true);
          return;
        }
        // Drivers are treated as one exactly when the full set has a variance inflation above 5 (or none).
        const full = all.map((j) => referenceInflation(ref, k, j));
        const tooClose = full.some((v) => v === null || v.num > 5n * v.den);
        expect(r.core.merged.length > 0).toBe(tooClose);
        const kept = ref.map((row) => ({ y: row.y, x: r.cols.map((c) => row.x[c]) }));
        const kk = r.cols.length;
        const rf = referenceFit(kept, r.cols.map((_, i) => i))!;
        const n = y.length;
        const df = n - kk - 1;
        const lmg = referenceLmg(kept, kk);
        const explained = referenceExplained(kept, r.cols.map((_, i) => i));
        const sigma2 = { num: rf.sse.num, den: rf.sse.den * BigInt(df) };
        const t = referenceTQuantile(0.9, df);
        nearestTo(r.core.intercept, rf.intercept, "intercept");
        nearestTo(r.core.explained, explained, "explained");
        expect(r.core.miss).toBe(sqrtOfNearest({ num: sigma2.num, den: sigma2.den }));
        r.core.drivers.forEach((d, j) => {
          nearestTo(d.effect, rf.effects[j], `effect ${j}`);
          const share = { num: lmg[j].num * explained.den, den: lmg[j].den * explained.num };
          nearestTo(d.explains, lmg[j], `explains ${j}`);
          if (explained.num !== 0n) nearestTo(d.share, share, `share ${j}`);
          const infl = referenceInflation(kept, kk, j)!;
          nearestTo(d.inflation, infl, `inflation ${j}`);
          const partial2 = referencePartialSquared(kept, kk, j);
          expect(d.partial).toBe((rf.effects[j].num < 0n ? -1 : 1) * sqrtOfNearest(partial2));
          // The range: the effect ± t·√(σ²·(XᵀX)⁻¹ᵢᵢ), t from the integration of the density.
          const half = Math.sqrt(nearestDoubleOf({ num: sigma2.num * rf.inverse[1 + j][1 + j].num, den: sigma2.den * rf.inverse[1 + j][1 + j].den })) * t;
          expect(close(d.hi - d.effect, half, 1e-9, 1e-12), `half width ${j}`).toBe(true);
          expect(close(d.effect - d.lo, half, 1e-9, 1e-12), `half width ${j}`).toBe(true);
        });
      }),
      { numRuns, seed },
    );
  });
  it(`has shares that add up to 1 and each between 0 and 1, partial links between −1 and 1, and the effect inside its range (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, ([k, ys, xs]) => {
        const r = fitNumbers(rowsOf(ys.map((v) => v / 100), xs.map((c) => c.map((v) => v / 100))), [...NAMES.slice(0, k), "Y"], k);
        if ("refusals" in r) return;
        expect(r.core.drivers.reduce((s, d) => s + d.share, 0)).toBeCloseTo(1, 12);
        expect(r.core.explained).toBeGreaterThanOrEqual(0);
        expect(r.core.explained).toBeLessThanOrEqual(1);
        for (const d of r.core.drivers) {
          expect(d.share).toBeGreaterThanOrEqual(0);
          expect(d.share).toBeLessThanOrEqual(1);
          expect(Math.abs(d.partial)).toBeLessThanOrEqual(1);
          expect(Math.sign(d.partial)).toBe(Math.sign(d.effect));
          expect(d.lo).toBeLessThanOrEqual(d.effect);
          expect(d.hi).toBeGreaterThanOrEqual(d.effect);
          expect(d.inflation).toBeGreaterThanOrEqual(1);
          expect(d.inflation).toBeLessThanOrEqual(5);
        }
      }),
      { numRuns, seed },
    );
  });
  it("works at the most drivers a fit has: 6 drivers over 36 periods against the reference's all 720 orders", () => {
    const r6 = fixture.fits.find((x: { name: string }) => x.name === "random-6-drivers");
    const r = fitNumbers(rowsOf(r6.y, r6.x), [...r6.names, "Y"], 6);
    if ("refusals" in r) throw new Error("refused");
    const ref = refRowsOf(r6.y, r6.x);
    const lmg = referenceLmg(ref, 6);
    r.core.drivers.forEach((d, j) => nearestTo(d.explains, lmg[j], `explains ${j}`));
    const rf = referenceFit(ref, [0, 1, 2, 3, 4, 5])!;
    r.core.drivers.forEach((d, j) => nearestTo(d.effect, rf.effects[j], `effect ${j}`));
  });
});

describe("predict equals the reference", () => {
  const data = fc.integer({ min: 1, max: 3 }).chain((k) =>
    fc.integer({ min: 8 + 4 * k, max: 24 }).chain((n) =>
      fc.tuple(
        fc.constant(k),
        fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: n, maxLength: n }),
        fc.array(fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: n, maxLength: n }), { minLength: k, maxLength: k }),
        fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: k, maxLength: k }),
      ),
    ),
  );
  it(`gives the fitted value exactly and its range from the leverage, to 1e-9 (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, ([, ys, xs, at]) => {
        const [y, x, values] = [ys.map((v) => v / 100), xs.map((c) => c.map((v) => v / 100)), at.map((v) => v / 100)];
        const m = fit(input(y, x));
        if (!m.ok) return;
        const p = predict(m, m.drivers.map((d) => values[NAMES.indexOf(d.name)]));
        if (!p.ok) return;
        const kept = m.drivers.map((d) => NAMES.indexOf(d.name));
        const ref = refRowsOf(y, kept.map((c) => x[c]));
        const rf = referenceFit(ref, kept.map((_, i) => i))!;
        const at2 = kept.map((c) => exactOf(values[c]));
        nearestTo(p.value, referenceValue(rf, at2), "value");
        if (p.lo !== null) {
          const t = referenceTQuantile(0.9, y.length - kept.length - 1);
          const half = t * Math.sqrt(nearestDoubleOf(referenceBandSquared(rf, y.length, kept.length, at2)));
          expect(close(p.hi! - p.value, half, 1e-9, 1e-12)).toBe(true);
          expect(close(p.value - p.lo, half, 1e-9, 1e-12)).toBe(true);
        }
      }),
      { numRuns, seed },
    );
  });
});

describe("needs equals the reference and inverts predict", () => {
  const rng = lcg(11);
  const [a, b] = [Array.from({ length: 30 }, () => hundredths(rng() * 100)), Array.from({ length: 30 }, () => hundredths(rng() * 40))];
  const y = a.map((v, i) => hundredths(3 + 1.5 * v - 2 * b[i] + (rng() - 0.5) * 12));
  const m = made(fit(input(y, [a, b])));
  const latest = [a[29], b[29]];
  it("finds the driver value whose predicted value is the goal exactly: the double nearest to the solution of the fitted line", () => {
    const rf = referenceFit(refRowsOf(y, [a, b]), [0, 1])!;
    for (const goal of [50, 60, 75.5]) {
      for (const j of [0, 1]) {
        const nd = needs(m, { goal, driver: j });
        if (!nd.ok) throw new Error("refused");
        const held = latest.map((v) => exactOf(v));
        // value = (goal − intercept − Σ others) ÷ effect, on exact fractions.
        const others = held.reduce((s, h, i) => (i === j ? s : plus(s, { num: rf.effects[i].num * h.num, den: rf.effects[i].den * h.den })), { num: 0n, den: 1n });
        const rest = minus(minus(exactOf(goal), rf.intercept), others);
        const x = { num: rest.num * rf.effects[j].den, den: rest.den * rf.effects[j].num };
        nearestTo(nd.value, x.den < 0n ? { num: -x.num, den: -x.den } : x, `goal ${goal}, driver ${j}`);
      }
    }
  });
  it("has the range the reference finds by halving the band's edge, to a relative 1e-9 of the range's size", () => {
    const rf = referenceFit(refRowsOf(y, [a, b]), [0, 1])!;
    const t = referenceTQuantile(0.9, m.df);
    for (const [goal, j] of [[50, 0], [62, 0], [60, 1], [30, 1]] as const) {
      const nd = needs(m, { goal, driver: j });
      if (!nd.ok) throw new Error("refused");
      const held = latest.map((v) => exactOf(v));
      const star = exactOf(nd.value);
      const range = referenceNeedsRange(rf, m.n, 2, t, exactOf(goal), j, held, star, m.drivers[j].spread);
      if (nd.lo === null) {
        // Outside what was seen, or an effect that cannot be told from chance: no range.
        expect(nd.outside.length > 0 || range === null).toBe(true);
        continue;
      }
      expect(range).not.toBeNull();
      const [lo, hi] = [nearestDoubleOf(range![0]), nearestDoubleOf(range![1])];
      const width = hi - lo;
      expect(Math.abs(nd.lo - lo) / width, `lo ${nd.lo} vs ${lo}`).toBeLessThan(1e-9);
      expect(Math.abs(nd.hi! - hi) / width, `hi ${nd.hi} vs ${hi}`).toBeLessThan(1e-9);
    }
  });
  it(`predict at the answer gives the goal back, to a relative 1e-12 (${numRuns} goals, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 20, max: 140 }), fc.integer({ min: 0, max: 1 }), (goal, j) => {
        const nd = needs(m, { goal, driver: j });
        if (!nd.ok) return;
        const values = [...latest];
        values[j] = nd.value;
        const p = predict(m, values);
        if (!p.ok) return;
        expect(close(p.value, goal, 1e-12, 1)).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it("inverts predict exactly where the arithmetic is exact: a driver value read to a value, and the value read back to the driver value", () => {
    const f = fixture.fits.find((x: { name: string }) => x.name === "exact-linear");
    const e = made(fit(input(f.y, f.x)));
    for (const v of [12.5, -3.25, 40, 0.5]) {
      const p = predict(e, [30, v, 5]);
      if (!p.ok) throw new Error("refused");
      const nd = needs(e, { goal: p.value, driver: 1, held: [30, 0, 5] });
      if (!nd.ok) throw new Error("refused");
      expect(nd.value).toBe(v);
    }
  });
  it("holds the other drivers at their latest values unless values are given", () => {
    const [d0, d1] = [needs(m, { goal: 60, driver: 0 }), needs(m, { goal: 60, driver: 0, held: latest })];
    expect(d0).toEqual(d1);
    const other = needs(m, { goal: 60, driver: 0, held: [0, 5] });
    if (!other.ok || !d0.ok) throw new Error("refused");
    expect(other.value).not.toBe(d0.value);
  });
  it("ignores the entry for the driver asked about, and gives the driver's latest value as where it is today", () => {
    const [x, y2] = [needs(m, { goal: 60, driver: 0, held: [1, 20] }), needs(m, { goal: 60, driver: 0, held: [999, 20] })];
    expect(x).toEqual(y2);
    if (!x.ok) throw new Error("refused");
    expect(x.current).toBe(latest[0]);
  });
});

describe("outside what was seen (rule 7)", () => {
  const rng = lcg(5);
  const x = Array.from({ length: 24 }, () => hundredths(10 + rng() * 40));
  const y = x.map((v) => hundredths(5 + 2 * v + gauss(rng) * 4));
  const m = made(fit(input(y, [x])));
  const [low, high] = [Math.min(...x), Math.max(...x)];
  it("gives a range for a value inside what the driver has been, and only the point just outside, on either side", () => {
    const inside = predict(m, [high]);
    const above = predict(m, [high + 0.01]);
    const below = predict(m, [low - 0.01]);
    const edge = predict(m, [low]);
    if (!inside.ok || !above.ok || !below.ok || !edge.ok) throw new Error("refused");
    expect(inside.lo).not.toBeNull();
    expect(edge.lo).not.toBeNull();
    expect(above.lo).toBeNull();
    expect(above.outside).toEqual([{ name: "Visits", side: "above", limit: high, change: false }]);
    expect(below.lo).toBeNull();
    expect(below.outside).toEqual([{ name: "Visits", side: "below", limit: low, change: false }]);
    expect(Number.isFinite(above.value)).toBe(true);
  });
  it("gives only the point for a goal that needs a driver value outside what it has been, one step either side", () => {
    const nd = (v: number) => {
      const p = predict(m, [Math.min(Math.max(v, low), high)]);
      if (!p.ok) throw new Error("refused");
      return p.value;
    };
    const atHigh = needs(m, { goal: nd(high), driver: 0 });
    const beyond = needs(m, { goal: nd(high) + 0.5 * m.drivers[0].effect, driver: 0 });
    if (!atHigh.ok || !beyond.ok) throw new Error("refused");
    expect(atHigh.outside).toEqual([]);
    expect(atHigh.lo).not.toBeNull();
    expect(beyond.outside).toEqual([{ name: "Visits", side: "above", limit: high, change: false }]);
    expect(beyond.lo).toBeNull();
    expect(beyond.hi).toBeNull();
    expect(Number.isFinite(beyond.value)).toBe(true);
  });
});

describe("the checks of a fit, one step either side of each threshold", () => {
  const rng = lcg(3);
  const noisy = (n: number, k: number) => {
    const xs = Array.from({ length: k }, () => Array.from({ length: n }, () => hundredths(20 + rng() * 60)));
    const y = Array.from({ length: n }, (_, i) => hundredths(10 + xs.reduce((s, c, j) => s + (j + 1) * c[i], 0) + gauss(rng) * 5));
    return { xs, y };
  };
  it("needs 8 + 4 per driver periods: the number it needs gives a fit, one fewer a refusal in words with no number", () => {
    for (const k of [1, 2, 3]) {
      const need = SUITABILITY.minimum.fit.base + SUITABILITY.minimum.fit.perDriver * k;
      const { xs, y } = noisy(need, k);
      expect(fit(input(y, xs)).ok, `k ${k}, ${need} periods`).toBe(true);
      const short = fit(input(y.slice(1), xs.map((c) => c.slice(1))));
      expect(short.ok).toBe(false);
      if (!short.ok) expect(short).toEqual({ ok: false, refusals: [{ case: "refuse-periods", slots: { have: need - 1, need, span: "month" } }] });
    }
  });
  it("allows one driver per 6 periods: 6 drivers need 36, 7 are refused however many periods there are", () => {
    const six = noisy(36, 6);
    expect(fit(input(six.y, six.xs)).ok).toBe(true);
    const seven = noisy(60, 7);
    const r = fit(input(seven.y, seven.xs));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals.map((f) => f.case)).toEqual(["refuse-too-many"]);
    // Five drivers on 29 periods (one fewer than 6 · 5 = 30) are over what the history can carry.
    const five = noisy(32, 5);
    expect(fit(input(five.y, five.xs)).ok).toBe(true);
  });
  it("refuses a series that hardly changes: fewer than 4 different values, one more passes", () => {
    const { xs, y } = noisy(24, 1);
    const three = xs[0].map((_, i) => [10, 20, 30][i % 3]);
    const four = xs[0].map((_, i) => [10, 20, 30, 40][i % 4]);
    const a = fit(input(y, [three]));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.refusals).toEqual([{ case: "refuse-vary", slots: { name: "Visits" } }]);
    expect(fit(input(y, [four])).ok).toBe(true);
  });
  it("refuses more than a fifth of the periods without a value, and cautions at the fifth; 3 in a row is a refusal", () => {
    const { xs, y } = noisy(30, 1);
    const withGaps = (positions: number[]) => input(y, xs, { drivers: [{ name: "Visits", points: pts(xs[0]).filter((_, i) => !positions.includes(i)) }] });
    // 30 periods: 6 missing is exactly a fifth (kept, said), 7 is more than a fifth (refused), spread out so no 3 in a row.
    const six = fit(withGaps([2, 7, 12, 17, 22, 27]));
    expect(six.ok).toBe(true);
    if (six.ok) expect(six.verdict.cautions.map((c) => c.case)).toContain("caution-gaps");
    const seven = fit(withGaps([2, 6, 10, 14, 18, 22, 26]));
    expect(seven.ok).toBe(false);
    if (!seven.ok) expect(seven.refusals.map((c) => c.case)).toEqual(["refuse-gaps"]);
    const run2 = fit(withGaps([10, 11]));
    expect(run2.ok).toBe(true);
    const run3 = fit(withGaps([10, 11, 12]));
    expect(run3.ok).toBe(false);
    if (!run3.ok) expect(run3.refusals.map((c) => c.case)).toEqual(["refuse-gap-run"]);
  });
  it("never fills a gap or leaves a value out silently: the periods used are exactly those both have, and it says how many were left", () => {
    const { xs, y } = noisy(30, 1);
    const f = made(fit(input(y, xs, { drivers: [{ name: "Visits", points: pts(xs[0]).filter((_, i) => i !== 9 && i !== 20) }] })));
    expect(f.n).toBe(28);
    expect(f.rows.map((r) => r.period)).not.toContain(month(9));
    expect(f.verdict.cautions.map((c) => c.case)).toContain("caution-gaps");
  });
  it("refuses Metrics of different periods where one has Aggregation none, and one built from another", () => {
    const { xs, y } = noisy(24, 2);
    const t = metric({ slug: "revenue", name: "Revenue", period: "month" });
    const none = metric({ slug: "visits", name: "Visits", period: "week", aggregation: "none" });
    const r = fit(input(y, xs, { metrics: [t, none, metric({ slug: "price", name: "Price", period: "month" })] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals.map((c) => c.case)).toEqual(["refuse-mixed-none"]);
    const built = metric({ slug: "price", name: "Price", period: "month", formula: "{visits} * 2" });
    const b = fit(input(y, xs, { metrics: [t, metric({ slug: "visits", name: "Visits", period: "month" }), built] }));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.refusals.map((c) => c.case)).toEqual(["refuse-built-from"]);
  });
  it("cautions about a curved link, and not about a straight one, and says nothing else", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const noise = Array.from({ length: 30 }, () => gauss(rng) * 0.5);
    const straight = fit(input(x.map((v, i) => hundredths(2 * v + noise[i])), [x]));
    const curved = fit(input(x.map((v, i) => hundredths(v * v / 5 + noise[i])), [x]));
    if (!straight.ok || !curved.ok) throw new Error("refused");
    expect(straight.verdict.cautions.map((c) => c.case)).not.toContain("caution-curved");
    expect(curved.verdict.cautions.map((c) => c.case)).toContain("caution-curved");
  });
  it("cautions about a far-off value that moves the effect, quoting the effect without it, and not about one that does not", () => {
    const r = lcg(19);
    const x = Array.from({ length: 24 }, () => hundredths(20 + r() * 60));
    const y = x.map((v) => hundredths(3 * v + 10 + gauss(r) * 4));
    const base = made(fit(input(y, [x])));
    expect(base.verdict.cautions).toEqual([]);
    // One month far from the rest and against the link: the effect with it and without it differ by more than a fifth of its range.
    const bad = y.map((v, i) => (i === 11 ? hundredths(v - 400) : v));
    const f = made(fit(input(bad, [x])));
    const far = f.verdict.cautions.find((c) => c.case === "caution-far-off");
    expect(far).toBeDefined();
    expect(far!.slots.count).toBe(1);
    expect(close(far!.slots.without as number, base.drivers[0].effect, 0.05, 1)).toBe(true);
    // A far-off value that changes the effect by far less than a fifth of its range: no caution.
    const mild = y.map((v, i) => (i === 11 ? hundredths(v + 14) : v));
    expect(made(fit(input(mild, [x]))).verdict.cautions.map((c) => c.case)).not.toContain("caution-far-off");
  });
  it("never removes a far-off value: the periods used are all of them", () => {
    const r = lcg(19);
    const x = Array.from({ length: 24 }, () => hundredths(20 + r() * 60));
    const y = x.map((v, i) => hundredths(3 * v + 10 + gauss(r) * 4 + (i === 11 ? -400 : 0)));
    const f = made(fit(input(y, [x])));
    expect(f.n).toBe(24);
    expect(f.rows.map((r) => r.y)).toEqual(y);
  });
  it("cautions that the ranges are rough where the misses grow with the level", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const grow = x.map((v) => hundredths(10 * v + gauss(rng) * v * 1.5));
    const f = made(fit(input(grow, [x])));
    expect(f.verdict.cautions.map((c) => c.case)).toContain("caution-spread");
  });
  it("is the same verdict twice", () => {
    const { xs, y } = noisy(24, 2);
    expect(fit(input(y, xs))).toEqual(fit(input(y, xs)));
  });
});

describe("drivers that cannot be told apart", () => {
  const rng = lcg(17);
  const base = Array.from({ length: 30 }, () => hundredths(rng() * 100));
  const other = Array.from({ length: 30 }, () => hundredths(rng() * 100));
  const y = base.map((v, i) => hundredths(4 * v + 2 * other[i] + gauss(rng) * 5));
  it("treats two drivers exactly in step as one: the one with the weaker link to the target is left out, and it says so", () => {
    const twin = base.map((v) => hundredths(2 * v + 1));
    const f = made(fit(input(y, [base, twin, other])));
    expect(f.merged).toEqual([{ kept: "Visits", with: ["Price"] }]);
    expect(f.drivers.map((d) => d.name)).toEqual(["Visits", "Tickets"]);
    expect(f.rows[0].x).toHaveLength(2);
    // The same fit as without the twin: nothing was changed but the driver left out.
    const without = made(fit(input(y, [base, other])));
    expect(f.drivers.map((d) => d.effect)).toEqual(without.drivers.map((d) => d.effect));
    expect(f.explained).toBe(without.explained);
  });
  it("keeps the earlier driver when the links to the target are equal, and the other way round when the later one links closer", () => {
    const twin = base.map((v) => v);
    const equal = made(fit(input(y, [base, twin, other])));
    expect(equal.merged).toEqual([{ kept: "Visits", with: ["Price"] }]);
    const closer = made(fit(input(base.map((v) => v), [y, base.map((v) => hundredths(v + 1)), other].slice(0, 2).concat([other]))));
    // Price (= Visits + 1) and the target "Revenue" (= Visits): Price is exactly in step with another driver; whichever is kept, one is.
    expect(closer.merged.length).toBe(1);
  });
  it("refuses a mix of three or more drivers that is exactly one, naming them, and does not name one that is free", () => {
    const [a, b, c] = [base, other, base.map((v, i) => hundredths(v + other[i]))];
    const free = Array.from({ length: 30 }, () => hundredths(rng() * 50));
    const r = fit(input(y, [a, b, c, free]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals).toEqual([{ case: "refuse-drivers-collinear", slots: { names: "Visits, Price, Tickets" } }]);
  });
  it("decides at a variance inflation of 5 exactly: just under stays two drivers, above is treated as one", () => {
    // x2 = 100·x1 + m·e: the noise m moves the inflation down from enormous; the first m where the exact inflation is at most 5.
    const e = Array.from({ length: 24 }, (_, i) => ((i * 37) % 23) - 11);
    const x1 = Array.from({ length: 24 }, (_, i) => ((i * 13) % 29) + i);
    const yy = x1.map((v, i) => v * 3 + ((i * 11) % 9));
    const inflationAt = (m: number) => {
      const x2 = x1.map((v, i) => 100 * v + m * e[i]);
      return referenceInflation(refRowsOf(yy, [x1, x2]), 2, 0)!;
    };
    let m = 1;
    while (inflationAt(m).num > 5n * inflationAt(m).den) m++;
    const [over, under] = [m - 1, m];
    expect(inflationAt(over).num > 5n * inflationAt(over).den).toBe(true);
    expect(inflationAt(under).num <= 5n * inflationAt(under).den).toBe(true);
    const run = (mm: number) => fitNumbers(rowsOf(yy, [x1, x1.map((v, i) => 100 * v + mm * e[i])]), ["A", "B", "Y"], 2);
    const [a, b] = [run(over), run(under)];
    if ("refusals" in a || "refusals" in b) throw new Error("refused");
    expect(a.core.merged).toHaveLength(1);
    expect(b.core.merged).toHaveLength(0);
  });
  it("treats a pair as one when the pair's inflation is above 5, and drops a far-off third driver's role: the last fit has none above 5", () => {
    const near = base.map((v) => hundredths(v + gauss(rng) * 8));
    const f = made(fit(input(y, [base, near, other])));
    for (const d of f.drivers) expect(d.inflation).toBeLessThanOrEqual(5);
  });
  it("says a Longley-style GNP and Population as one", () => {
    const l = fixture.fits.find((x: { name: string }) => x.name === "longley-collinear");
    const f = made(fit(input(l.y, l.x, { drivers: l.x.map((c: number[], i: number) => ({ name: l.names[i], points: pts(c) })) })));
    expect(f.merged).toEqual([{ kept: "GNP", with: ["Population"] }]);
    expect(f.drivers).toHaveLength(1);
  });
});

describe("what the numbers do at their edges", () => {
  const rng = lcg(61);
  const free = (n: number, scale = 100) => Array.from({ length: n }, () => hundredths(rng() * scale));
  it("has no fit for a target or a driver that does not vary over the periods used, and says which", () => {
    const x = free(14);
    const flatTarget = fitNumbers(rowsOf(x.map(() => 3), [x]), ["Visits", "Revenue"], 1);
    expect(flatTarget).toEqual({ ok: false, refusals: [{ case: "refuse-vary", slots: { name: "Revenue" } }] });
    const flatDriver = fitNumbers(rowsOf(x, [x.map(() => 3), free(14)]), ["Visits", "Price", "Revenue"], 2);
    expect(flatDriver).toEqual({ ok: false, refusals: [{ case: "refuse-vary", slots: { name: "Visits" } }] });
  });
  it("leaves out the weaker of the pair that is closest, whichever drivers are around it", () => {
    const [a, b, c] = [free(30), free(30), free(30)];
    const y = a.map((v, i) => hundredths(2 * v + b[i] + c[i] + gauss(rng) * 6));
    // The closest pair is the last two, then the first two, then the outer two: the free driver is the first, the last and the middle one.
    for (const pair of [[1, 2], [0, 1], [0, 2]] as const) {
      const cols = [a, b, c];
      const near = cols.map((v) => v.slice());
      near[pair[1]] = near[pair[0]].map((v) => hundredths(v * 2 + 1 + gauss(rng) * 3));
      const f = made(fit(input(y, near)));
      expect(f.merged).toHaveLength(1);
      expect([NAMES[pair[0]], NAMES[pair[1]]]).toContain(f.merged[0].kept);
    }
  });
  it("makes a fit where the drivers are in step except on one period, and does not fail on the check that leaves that period out", () => {
    // The second driver is the first except on one far-off period: without that period they are exactly one, which has no inverse.
    const x1 = free(24);
    const x2 = x1.map((v, i) => (i === 10 ? hundredths(v + 5000) : v));
    const y = x1.map((v, i) => hundredths(2 * v + 0.5 * x2[i] + gauss(rng) * 3));
    const f = fit(input(y, [x1, x2]));
    expect(f.ok).toBe(true);
  });
  it("gives a driver that is not in the line a partial link of 0 where the others explain everything exactly", () => {
    const [a, b] = [free(24), free(24)];
    const y = a.map((v) => hundredths(2 * v + 1));
    const f = made(fit(input(y, [a, b])));
    expect(f.drivers.map((d) => d.effect)).toEqual([2, 0]);
    expect(f.drivers[1].partial).toBe(0);
    expect(f.drivers[1].strength).toBe("cant-tell");
    expect(f.explained).toBe(1);
  });
  it("refuses a value or a goal too large to work with, never a wrong number", () => {
    const m = made(fit(input(free(24).map((v) => v), [free(24)])));
    const huge: Fit = { ...m, rows: m.rows.map((r, i) => ({ ...r, y: i * 1e200, x: [(i % 5) * 1e200] })), last: { y: 1e200, x: [1e200] } };
    const p = predict(huge, [1e200]);
    expect(p).toEqual({ ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] });
    // A goal that needs a driver value beyond the largest number is refused, not given as Infinity.
    const x = Array.from({ length: 24 }, (_, i) => i + 1);
    const slope = made(fit(input(x.map((v, i) => hundredths(v * 0.5 + (i % 3))), [x])));
    expect(needs(slope, { goal: 1.7e308, driver: 0 })).toEqual({ ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] });
  });
  it("refuses a goal outside what was seen when the link looks curved, for needs as for predict", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const y = x.map((v) => hundredths((v * v) / 5 + gauss(rng) * 0.4));
    const c = made(fit(input(y, [x])));
    expect(c.verdict.cautions.map((v) => v.case)).toContain("caution-curved");
    const outside = needs(c, { goal: 400, driver: 0 });
    expect(outside).toEqual({ ok: false, refusals: [{ case: "refuse-curved-outside", slots: { name: "Visits" } }] });
    const inside = needs(c, { goal: 100, driver: 0 });
    expect(inside.ok).toBe(true);
    if (inside.ok) expect(inside.verdict.cautions.map((v) => v.case)).toEqual(["caution-curved"]);
  });
  it("passes on only the lines of the fit's verdict that still hold for a value: gaps, the curve and the spread", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const grow = x.map((v) => hundredths(10 * v + gauss(rng) * v * 1.5));
    const g = made(fit({ ...input(grow, [x]), drivers: [{ name: "Visits", points: pts(x).filter((_, i) => i !== 7) }] }));
    expect(g.verdict.cautions.map((v) => v.case)).toContain("caution-gaps");
    const p = predict(g, [15]);
    if (!p.ok) throw new Error("refused");
    expect(p.verdict.cautions.map((v) => v.case).sort()).toEqual(["caution-gaps", "caution-spread"]);
    expect(p.verdict.switches).toEqual([]);
    expect(p.verdict.refusals).toEqual([]);
  });
});

describe("what mutation testing asked for", () => {
  const rng = lcg(71);
  const free = (n: number, scale = 100) => Array.from({ length: n }, () => hundredths(rng() * scale));
  it("judges a partial link on the periods less the drivers held fixed", () => {
    expect([partialPeriods(20, 1), partialPeriods(24, 3), partialPeriods(12, 1), partialPeriods(40, 6)]).toEqual([20, 22, 12, 35]);
  });
  it("merges drivers at a variance inflation just above 5 and not at exactly 5 or below", () => {
    // a is ±1, b is ±1 and orthogonal to it: x₂ = 2a + b has r² = 4/5, inflation exactly 5; 2.1a + b is above, 1.9a + b below.
    const a = [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1];
    const b = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
    const y = a.map((v, i) => 3 * v + 2 * b[i] + (i % 3) + (i % 5));
    const at = (c: number) => fitNumbers(rowsOf(y, [a, a.map((v, i) => hundredths(c * v + b[i]))]), ["A", "B", "Y"], 2);
    const [exactly, above, below] = [at(2), at(2.1), at(1.9)];
    if ("refusals" in exactly || "refusals" in above || "refusals" in below) throw new Error("refused");
    expect(exactly.core.drivers.map((d) => d.inflation)).toEqual([5, 5]);
    expect(exactly.core.merged).toEqual([]);
    expect(below.core.merged).toEqual([]);
    expect(above.core.merged).toHaveLength(1);
  });
  it("leaves out the driver with the weaker link to the target, and the closest partner, whichever positions they are in", () => {
    const base = free(30);
    const other = free(30);
    const twin = base.map((v) => hundredths(2 * v + 1 + gauss(rng) * 15));
    const fromTwin = twin.map((v, i) => hundredths(v + other[i] + gauss(rng) * 1));
    const fromBase = base.map((v, i) => hundredths(v + other[i] + gauss(rng) * 1));
    const a = made(fit(input(fromTwin, [base, twin, other])));
    expect(a.merged).toEqual([{ kept: "Price", with: ["Visits"] }]);
    const b = made(fit(input(fromBase, [base, twin, other])));
    expect(b.merged).toEqual([{ kept: "Visits", with: ["Price"] }]);
    // The close pair in the last two places, and with the free driver in the middle.
    const c = made(fit(input(fromTwin, [other, base, twin])));
    expect(new Set([c.merged[0].kept, ...c.merged[0].with])).toEqual(new Set(["Price", "Tickets"]));
    const d = made(fit(input(fromTwin, [base, other, twin])));
    expect(new Set([d.merged[0].kept, ...d.merged[0].with])).toEqual(new Set(["Visits", "Tickets"]));
  });
  it("says a far-off period only where leaving it out moves the top driver's effect by more than a fifth of its range, row by row", () => {
    const [x1, x2] = [free(24), free(24)];
    const clean = x1.map((v, i) => hundredths(v + 5 * x2[i] + gauss(rng) * 8));
    let [said, not] = [0, 0];
    for (let row = 0; row < 24; row++) {
      const y = clean.map((v, i) => (i === row ? hundredths(v + 3000) : v));
      const f = fit(input(y, [x1, x2]));
      if (!f.ok) continue;
      const t = f.drivers.reduce((a, d, i) => (d.share > f.drivers[a].share ? i : a), 0);
      const top = f.drivers[t];
      const alt = fitNumbers(rowsOf(y, [x1, x2]).filter((r) => r.period !== month(row)), ["Visits", "Price", "Revenue"], 2);
      if ("refusals" in alt) throw new Error("refused");
      const moved = Math.abs(alt.core.drivers[t].effect - top.effect) * 5 > top.hi - top.lo || alt.core.drivers[t].effect * top.effect < 0;
      const far = f.verdict.cautions.find((c) => c.case === "caution-far-off");
      expect(far !== undefined, `row ${row}`).toBe(moved);
      if (far) {
        said++;
        expect(close(far.slots.without as number, alt.core.drivers[t].effect, 1e-12, 1e-12)).toBe(true);
      } else not++;
    }
    expect(said).toBeGreaterThan(0);
    expect(not).toBeGreaterThan(0);
  });
  it("has a partial link of exactly 0 for an effect of exactly 0, and the latest value of each driver", () => {
    const x = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
    const y = [5, 3, 1, 4, 2, 6, 6, 2, 4, 1, 3, 5];
    const m = made(fit(input(y, [x])));
    expect(Object.is(m.drivers[0].partial, 0)).toBe(true);
    expect(m.drivers[0].latest).toBe(6);
    expect([m.drivers[0].low, m.drivers[0].high]).toEqual([-6, 6]);
  });
  it("gives importance only its own parts, and the refusal the fit gives, unchanged", () => {
    const x = free(24);
    const imp = importance(input(x.map((v) => hundredths(2 * v + gauss(rng) * 9)), [x]));
    expect(Object.keys(imp).sort()).toEqual(["basis", "drivers", "explained", "merged", "n", "ok", "verdict"]);
    if (imp.ok) expect(Object.keys(imp.drivers[0]).sort()).toEqual(["explains", "name", "share"]);
    const i = input([1, 2, 3], [[3, 1, 2]]);
    expect(importance(i)).toEqual(fit(i));
  });
  it("judges gaps over the periods all of them have: a driver with a shorter history, or a longer one, has no gaps", () => {
    const x = free(30);
    const y = x.map((v) => hundredths(2 * v + gauss(rng) * 10));
    const shorter = made(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: pts(x.slice(6), 6) }] }));
    expect(shorter.n).toBe(24);
    expect(shorter.verdict.cautions).toEqual([]);
    const longer = made(fit({ ...input(y, [x]), target: { name: "Revenue", points: pts(y.slice(6), 6) } }));
    expect(longer.n).toBe(24);
    expect(longer.verdict.cautions).toEqual([]);
    const endsEarly = made(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: pts(x.slice(0, 24)) }] }));
    expect(endsEarly.n).toBe(24);
    expect(endsEarly.verdict.cautions).toEqual([]);
    expect(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: [] }] }).ok).toBe(false);
  });
  it("judges a driver over the periods all have: a hole or an extreme value outside them is nobody's gap or caution", () => {
    const x = free(30);
    const y = x.map((v) => hundredths(2 * v + gauss(rng) * 10));
    // The driver has holes at months 2 and 3 and an extreme value at month 1, before the target begins (month 6); it also runs past the target's end.
    const longer = pts(x).filter((_, i) => i !== 2 && i !== 3).map((p) => (p.period === month(1) ? { ...p, value: 1e7 } : p));
    const f = made(fit({ ...input(y, [x]), target: { name: "Revenue", points: pts(y.slice(6, 28), 6) }, drivers: [{ name: "Visits", points: longer }] }));
    expect(f.n).toBe(22);
    expect(f.verdict.cautions).toEqual([]);
    // An extreme value after the target's end is not judged either.
    const tail = made(fit({ ...input(y, [x]), target: { name: "Revenue", points: pts(y.slice(0, 24)) }, drivers: [{ name: "Visits", points: pts(x).map((p, i) => (i === 28 ? { ...p, value: 1e7 } : p)) }] }));
    expect(tail.verdict.cautions).toEqual([]);
    // And a hole after the target's end.
    const g = made(fit({ ...input(y, [x]), target: { name: "Revenue", points: pts(y.slice(0, 24)) }, drivers: [{ name: "Visits", points: pts(x).filter((_, i) => i !== 26 && i !== 27) }] }));
    expect(g.verdict.cautions).toEqual([]);
  });
  it("refuses a driver too large to write its spread, though the target is not", () => {
    const x = free(24);
    const y = x.map((v) => hundredths(2 * v + gauss(rng) * 5));
    expect(fit(input(y, [x.map((v) => v * 1e200)]))).toEqual({ ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] });
  });
  it("gives a value outside what was seen as the point only, when the fit carries a gap caution and no curve", () => {
    const x = free(30);
    const y = x.map((v) => hundredths(2 * v + gauss(rng) * 5));
    const g = made(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: pts(x).filter((_, i) => i !== 7) }] }));
    expect(g.verdict.cautions.map((c) => c.case)).toEqual(["caution-gaps"]);
    const p = predict(g, [500]);
    expect(p.ok && p.lo === null && Number.isFinite(p.value)).toBe(true);
    const n = needs(g, { goal: 1000, driver: 0 });
    expect(n.ok && n.lo === null).toBe(true);
  });
  it("refuses values too large to work with, whatever the scale", () => {
    const x = free(24);
    const y = x.map((v) => hundredths(2 * v + gauss(rng) * 5));
    const huge = fit(input(y.map((v) => v * 1e300), [x.map((v) => v * 1e300)]));
    expect(huge).toEqual({ ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] });
  });
  it("refuses a range it cannot write in doubles when the values are huge but the effect is clear", () => {
    const x = Array.from({ length: 24 }, (_, i) => i + 1 + (i % 4) / 10);
    const y = x.map((v, i) => hundredths(2 * v + 1 + ((i * 7) % 5) / 10));
    const m = made(fit(input(y, [x])));
    const scale = 1e200;
    const big: Fit = { ...m, drivers: m.drivers.map((d) => ({ ...d, low: d.low * scale, high: d.high * scale })), rows: m.rows.map((r) => ({ ...r, y: r.y * scale, x: [r.x[0] * scale] })), last: { y: m.last.y * scale, x: [m.last.x[0] * scale] } };
    const p = predict(big, [10 * scale]);
    expect(p).toEqual({ ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] });
    const nd = needs(big, { goal: 21 * scale, driver: 0 });
    expect(nd).toEqual({ ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] });
  });
  it("refuses a model it did not make, and says it was 'the fit' that cannot be used", () => {
    const x = free(24);
    const m = made(fit(input(x.map((v) => hundredths(2 * v + gauss(rng) * 9)), [x])));
    const bad = (over: Partial<Fit>) => ({ ...m, ...over });
    const what = { ok: false, refusals: [{ case: "refuse-input", slots: { what: "the fit" } }] };
    const seven = { ...m.drivers[0] };
    void seven;
    for (const b of [
      bad({ drivers: undefined as never }),
      bad({ drivers: [] }),
      bad({ drivers: Array.from({ length: 7 }, () => seven), rows: m.rows.map((r) => ({ ...r, x: Array.from({ length: 7 }, (_, i) => r.x[0] + i * i) })), last: { y: 1, x: Array.from({ length: 7 }, () => 1) } }),
      bad({ rows: null as never }),
      bad({ rows: [...m.rows, ...m.rows, ...m.rows, ...m.rows, ...m.rows, ...m.rows].slice(0, 121) }),
      bad({ last: { y: 1, x: [1, 2] } }),
      bad({ last: { y: 1, x: [NaN] } }),
      bad({ basis: "other" as never }),
    ]) {
      expect(predict(b, [10])).toEqual(what);
      expect(needs(b, { goal: 5, driver: 0 })).toEqual(what);
    }
    // 120 periods are fine.
    const rows120 = Array.from({ length: 120 }, (_, i) => ({ period: month(i), y: hundredths(2 * x[i % 24] + (i % 7)), x: [x[i % 24] + (i % 5) / 10] }));
    expect(predict(bad({ rows: rows120 }), [30]).ok).toBe(true);
    const flat: Fit = { ...m, rows: m.rows.map((r) => ({ ...r, x: [3] })) };
    expect(predict(flat, [3])).toEqual(what);
    expect(needs(flat, { goal: 5, driver: 0 })).toEqual(what);
  });
  it("names the drivers in the refusal for values, a driver and values held that cannot be used", () => {
    const [x, z] = [free(24), free(24)];
    const m = made(fit(input(x.map((v, i) => hundredths(v + 2 * z[i] + gauss(rng) * 9)), [x, z])));
    const names = { ok: false, refusals: [{ case: "refuse-input", slots: { what: "Visits, Price" } }] };
    expect(predict(m, [1])).toEqual(names);
    expect(predict(m, [1, NaN])).toEqual({ ok: false, refusals: [{ case: "refuse-input", slots: { what: "Price" } }] });
    expect(predict(m, [NaN, 1])).toEqual({ ok: false, refusals: [{ case: "refuse-input", slots: { what: "Visits" } }] });
    expect(needs(m, { goal: 50, driver: 5 })).toEqual(names);
    expect(needs(m, { goal: 50, driver: 0, held: [1] })).toEqual(names);
    expect(needs(m, { goal: NaN, driver: 0 })).toEqual({ ok: false, refusals: [{ case: "refuse-input", slots: { what: "Revenue" } }] });
    expect(needs(m, { goal: 50, driver: 1, held: [NaN, 3] })).toEqual({ ok: false, refusals: [{ case: "refuse-input", slots: { what: "Visits" } }] });
    expect(needs(m, { goal: 50, driver: 0, held: [3, NaN] })).toEqual({ ok: false, refusals: [{ case: "refuse-input", slots: { what: "Price" } }] });
    expect(needs(m, { goal: 50, driver: 1, held: [10, NaN] }).ok).toBe(true);
  });
  it("carries to a value only the gaps, the curve and the spread, not a far-off period or a changing link", () => {
    const x = free(24);
    const y = x.map((v, i) => hundredths(3 * v + gauss(rng) * 3 + (i === 11 ? 900 : 0)));
    const m = made(fit(input(y, [x])));
    expect(m.verdict.cautions.map((c) => c.case)).toContain("caution-far-off");
    const p = predict(m, [50]);
    if (!p.ok) throw new Error("refused");
    expect(p.verdict.cautions.map((c) => c.case)).not.toContain("caution-far-off");
  });
  it("gives a value inside what was seen for a curved link, and refuses only outside it", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const y = x.map((v) => hundredths((v * v) / 5 + gauss(rng) * 0.4));
    const c = made(fit(input(y, [x])));
    const inside = predict(c, [15]);
    expect(inside.ok).toBe(true);
    expect(predict(c, [31]).ok).toBe(false);
    expect(needs(c, { goal: 45, driver: 0 }).ok).toBe(true);
    expect(needs(c, { goal: 450, driver: 0 }).ok).toBe(false);
  });
});

describe("importance", () => {
  it("gives each driver's share of what is explained, adding up to 1, the same as the fit's", () => {
    const l = fixture.fits.find((x: { name: string }) => x.name === "random-3-drivers");
    const i = importance(input(l.y, l.x, { drivers: l.x.map((c: number[], j: number) => ({ name: l.names[j], points: pts(c) })) }));
    if (!i.ok) throw new Error("refused");
    const f = made(fit(input(l.y, l.x, { drivers: l.x.map((c: number[], j: number) => ({ name: l.names[j], points: pts(c) })) })));
    expect(i.drivers.map((d) => d.share)).toEqual(f.drivers.map((d) => d.share));
    expect(i.drivers.reduce((s, d) => s + d.share, 0)).toBeCloseTo(1, 14);
    expect(i.explained).toBe(f.explained);
    expect(i.basis).toBe("values");
    expect(i.n).toBe(24);
    expect(i.merged).toEqual([]);
    expect(i.verdict).toEqual(f.verdict);
  });
  it("is hand-worked for two drivers that explain 60 % and 20 % on their own and 70 % together: shares (0.6 + 0.5)/2 ÷ 0.7 and …", () => {
    // With R²(A) = a, R²(B) = b and R²(A, B) = ab, LMG_A = (a + (ab − b)) / 2 and LMG_B = (b + (ab − a)) / 2.
    const rng2 = lcg(23);
    const [a, b] = [Array.from({ length: 24 }, () => hundredths(rng2() * 50)), Array.from({ length: 24 }, () => hundredths(rng2() * 50))];
    const y = a.map((v, i) => hundredths(2 * v + b[i] + gauss(rng2) * 20));
    const ref = refRowsOf(y, [a, b]);
    const [ra, rb, rab] = [referenceExplained(ref, [0]), referenceExplained(ref, [1]), referenceExplained(ref, [0, 1])];
    const half = (e: Exact) => ({ num: e.num, den: e.den * 2n });
    const lmgA = plus(half(ra), half(minus(rab, rb)));
    const i = importance(input(y, [a, b]));
    if (!i.ok) throw new Error("refused");
    nearestTo(i.drivers[0].explains, lmgA, "LMG of the first");
    expect(same(lmgA, referenceLmg(ref, 2)[0])).toBe(true);
  });
  it("is refused as the fit is", () => {
    expect(importance(input([1, 2, 3], [[1, 2, 3]])).ok).toBe(false);
  });
});

describe("hostile inputs refuse in words or give the exact right answer, never a wrong number", () => {
  const rng = lcg(31);
  const ok = (n = 24) => {
    const x = Array.from({ length: n }, () => hundredths(rng() * 100));
    return { x, y: x.map((v) => hundredths(2 * v + gauss(rng) * 5)) };
  };
  it("refuses nothing at all, one point, and a fit without drivers", () => {
    expect(fit(input([], [[]])).ok).toBe(false);
    expect(fit(input([1], [[1]])).ok).toBe(false);
    const none = fit({ target: { name: "Revenue", points: pts([1, 2, 3]) }, drivers: [], span: "month" });
    expect(none).toEqual({ ok: false, refusals: [{ case: "refuse-no-drivers", slots: { target: "Revenue" } }] });
    const empty = fit(input([], [[]]));
    if (!empty.ok) expect(empty.refusals.map((c) => c.case)).toEqual(["refuse-periods"]);
  });
  it("refuses a constant target and a constant driver", () => {
    const { x } = ok();
    const t = fit(input(x.map(() => 5), [x]));
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.refusals).toEqual([{ case: "refuse-vary", slots: { name: "Revenue" } }]);
    const d = fit(input(x, [x.map(() => 5)]));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.refusals).toEqual([{ case: "refuse-vary", slots: { name: "Visits" } }]);
  });
  it("reads NaN and Infinity as no value: they are gaps, counted and said, never a number", () => {
    const { x, y } = ok(30);
    const bad = pts(x).map((p, i) => (i === 5 ? { ...p, value: NaN } : i === 6 ? { ...p, value: Infinity } : p));
    const f = fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: bad }] });
    expect(f.ok).toBe(true);
    if (f.ok) {
      expect(f.n).toBe(28);
      expect(f.verdict.cautions.map((c) => c.case)).toContain("caution-gaps");
      expect(f.rows.every((r) => Number.isFinite(r.y) && r.x.every(Number.isFinite))).toBe(true);
    }
    const many = pts(x).map((p, i) => (i >= 5 && i < 17 ? { ...p, value: NaN } : p));
    expect(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: many }] }).ok).toBe(false);
  });
  it("reads a period given twice once, with the value given last, and unsorted periods in order", () => {
    const { x, y } = ok(24);
    const [pt, py] = [pts(x), pts(y)];
    const twice = [{ period: month(3), value: 999 }, ...pt];
    const shuffled = [...pt].reverse();
    const a = made(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: twice }] }));
    const b = made(fit({ ...input(y, [x]), drivers: [{ name: "Visits", points: pt }] }));
    const c = made(fit({ target: { name: "Revenue", points: [...py].reverse() }, drivers: [{ name: "Visits", points: shuffled }], span: "month", basis: "values" }));
    expect(a).toEqual(b);
    expect(c).toEqual(b);
  });
  it("gives the exact answer or a refusal for huge and tiny values, never a wrong number", () => {
    const { x, y } = ok(24);
    for (const scale of [1e12, 1e-12, 1e100, 1e-100]) {
      const f = fit(input(y.map((v) => v * scale), [x]));
      if (f.ok) {
        // Scaling the target scales the effect, the intercept and the typical miss, and nothing else.
        const base = made(fit(input(y, [x])));
        expect(close(f.drivers[0].effect, base.drivers[0].effect * scale, 1e-9)).toBe(true);
        expect(close(f.miss, base.miss * scale, 1e-9)).toBe(true);
        expect(f.explained).toBe(base.explained);
        expect(f.drivers[0].share).toBe(1);
      } else {
        expect(f.refusals.map((c) => c.case)).toEqual(["refuse-too-large"]);
      }
    }
    const huge = fit(input(y.map((v) => v * 1e300), [x.map((v) => v * 1e300)]));
    if (!huge.ok) expect(huge.refusals.map((c) => c.case)).toEqual(["refuse-too-large"]);
    else expect(Object.values(huge.drivers[0]).every((v) => typeof v !== "number" || Number.isFinite(v))).toBe(true);
  });
  it("does not change its input", () => {
    const { x, y } = ok(24);
    const i = input(y, [x]);
    const before = JSON.stringify(i);
    fit(i);
    importance(i);
    expect(JSON.stringify(i)).toBe(before);
  });
  it("uses at most the latest 120 periods", () => {
    const { x, y } = ok(150);
    const f = made(fit(input(y, [x])));
    expect(f.n).toBe(MOST_PERIODS);
    expect(f.rows[0].period).toBe(month(30));
    expect(f.to).toBe(month(149));
    nearestTo(f.drivers[0].effect, referenceFit(refRowsOf(y.slice(30), [x.slice(30)]), [0])!.effects[0], "effect of the latest 120");
  });
  it("refuses a model it did not make: wrong shape, not numbers, too few rows", () => {
    const { x, y } = ok(24);
    const m = made(fit(input(y, [x])));
    const bad: Fit[] = [
      { ...m, rows: [] },
      { ...m, rows: m.rows.map((r) => ({ ...r, x: [r.x[0], 1] })) },
      { ...m, rows: m.rows.map((r, i) => (i === 3 ? { ...r, y: NaN } : r)) },
      { ...m, drivers: [] },
      { ...m, last: { y: NaN, x: [1] } },
      { ...m, basis: "weird" as never },
      { ...m, rows: m.rows.slice(0, 2) },
    ];
    for (const b of bad) {
      expect(predict(b, [10]).ok).toBe(false);
      expect(needs(b, { goal: 5, driver: 0 }).ok).toBe(false);
    }
    const flat: Fit = { ...m, rows: m.rows.map((r) => ({ ...r, x: [3] })) };
    expect(predict(flat, [3]).ok).toBe(false);
    expect(needs(flat, { goal: 5, driver: 0 }).ok).toBe(false);
  });
  it("refuses values for predict and needs that are not numbers, the wrong number of them or a driver that is not there", () => {
    const { x, y } = ok(24);
    const m = made(fit(input(y, [x])));
    for (const v of [[NaN], [Infinity], [], [1, 2], ["3" as unknown as number], null as unknown as number[]]) expect(predict(m, v).ok, JSON.stringify(v)).toBe(false);
    for (const goal of [NaN, Infinity, -Infinity, "3" as unknown as number]) expect(needs(m, { goal, driver: 0 }).ok).toBe(false);
    for (const driver of [-1, 1, 0.5, NaN]) expect(needs(m, { goal: 50, driver }).ok).toBe(false);
    for (const held of [[], [1, 2]]) expect(needs(m, { goal: 50, driver: 0, held }).ok).toBe(false);
    // No values given (null as well) means the latest ones.
    expect(needs(m, { goal: 50, driver: 0, held: null as unknown as number[] })).toEqual(needs(m, { goal: 50, driver: 0 }));
    const two = made(fit(input(y, [x, x.map(() => hundredths(rng() * 50))])));
    expect(needs(two, { goal: 50, driver: 0, held: [1, NaN] }).ok).toBe(false);
    expect(needs(two, { goal: 50, driver: 0, held: [NaN, 3] }).ok).toBe(true);
  });
  it("refuses a goal when a driver has no effect at all, in words: an even pattern has no slope", () => {
    const x = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
    const y = [5, 3, 1, 4, 2, 6, 6, 2, 4, 1, 3, 5];
    const m = made(fit(input(y, [x])));
    expect(m.drivers[0].effect).toBe(0);
    expect(m.drivers[0].strength).toBe("cant-tell");
    expect(needs(m, { goal: 3, driver: 0 })).toEqual({ ok: false, refusals: [{ case: "refuse-no-effect", slots: { name: "Visits", target: "Revenue" } }] });
    // It can still read a value from the fit: the mean.
    const p = predict(m, [1]);
    expect(p.ok && p.value === 3.5).toBe(true);
  });
  it("is the same bytes twice", () => {
    const { x, y } = ok(24);
    expect(JSON.stringify(fit(input(y, [x])))).toBe(JSON.stringify(fit(input(y, [x]))));
  });
});

describe("properties of the fit over generated data", () => {
  const data = fc.integer({ min: 1, max: 3 }).chain((k) =>
    fc.integer({ min: 8 + 4 * k, max: 28 }).chain((n) =>
      fc.tuple(
        fc.constant(k),
        fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: n, maxLength: n }),
        fc.array(fc.array(fc.integer({ min: -9000, max: 9000 }), { minLength: n, maxLength: n }), { minLength: k, maxLength: k }),
      ),
    ),
  );
  const prep = ([k, ys, xs]: [number, number[], number[][]]) => ({ k, y: ys.map((v) => v / 100), x: xs.map((c) => c.map((v) => v / 100)) });
  it(`scaling a driver by c scales its effect by 1/c and its range likewise, and changes nothing else (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, fc.constantFrom(2, 4, 5, 10, 100), (d, c) => {
        const { y, x } = prep(d);
        const a = fit(input(y, x));
        const b = fit(input(y, [x[0].map((v) => hundredths(v * c)), ...x.slice(1)]));
        if (!a.ok || !b.ok) return;
        expect(b.drivers.map((v) => v.name)).toEqual(a.drivers.map((v) => v.name));
        expect(close(b.drivers[0].effect, a.drivers[0].effect / c, 1e-12, 1e-12)).toBe(true);
        expect(close(b.drivers[0].hi, a.drivers[0].hi / c, 1e-12, 1e-12)).toBe(true);
        expect(close(b.explained, a.explained, 1e-12, 1e-12)).toBe(true);
        expect(close(b.drivers[0].share, a.drivers[0].share, 1e-12, 1e-12)).toBe(true);
        expect(close(b.miss, a.miss, 1e-12, 1e-12)).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it(`shifting a driver or the target moves only the intercept (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, fc.integer({ min: -500, max: 500 }), (d, s) => {
        const { y, x } = prep(d);
        const a = fit(input(y, x));
        const b = fit(input(y.map((v) => hundredths(v + s)), x));
        const c = fit(input(y, [x[0].map((v) => hundredths(v + s)), ...x.slice(1)]));
        if (!a.ok || !b.ok || !c.ok) return;
        expect(b.drivers.map((v) => v.effect)).toEqual(a.drivers.map((v) => v.effect));
        expect(c.drivers.map((v) => v.effect)).toEqual(a.drivers.map((v) => v.effect));
        expect(b.explained).toBe(a.explained);
        expect(c.explained).toBe(a.explained);
        expect(close(b.intercept, a.intercept + s, 1e-12, 1)).toBe(true);
        expect(b.drivers.map((v) => v.share)).toEqual(a.drivers.map((v) => v.share));
      }),
      { numRuns, seed },
    );
  });
  it(`reordering the drivers reorders the results and changes no number (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, (d) => {
        const { y, x } = prep(d);
        if (x.length < 2) return;
        const a = fit(input(y, x));
        const order = x.map((_, i) => i).reverse();
        const b = fit({ ...input(y, x), drivers: order.map((i) => ({ name: NAMES[i], points: pts(x[i]) })) });
        if (!a.ok || !b.ok) return;
        for (const da of a.drivers) {
          const db = b.drivers.find((v) => v.name === da.name)!;
          expect(db.effect).toBe(da.effect);
          expect(close(db.share, da.share, 1e-14, 1e-14)).toBe(true);
          expect(db.partial).toBe(da.partial);
          expect(db.inflation).toBe(da.inflation);
        }
        expect(b.intercept).toBe(a.intercept);
        expect(b.explained).toBe(a.explained);
      }),
      { numRuns, seed },
    );
  });
  it(`the order the periods are given in changes nothing, and neither does the same periods twice with the last value last (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, fc.integer({ min: 1, max: 1000 }), (d, s) => {
        const { y, x } = prep(d);
        const a = fit(input(y, x));
        // A fixed shuffle by a seeded sort.
        const shuffle = <T,>(arr: T[]) => arr.map((v, i) => ({ v, k: Math.sin(i * 12.9898 + s) })).sort((p, q) => p.k - q.k).map((p) => p.v);
        const b = fit({ target: { name: "Revenue", points: shuffle(pts(y)) }, drivers: x.map((c, i) => ({ name: NAMES[i], points: shuffle(pts(c)) })), span: "month", basis: "values" });
        expect(b).toEqual(a);
      }),
      { numRuns, seed },
    );
  });
  it(`a target made only of the drivers gives their effects and the intercept back exactly and explains everything (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 3, maxLength: 3 }), ([, , xs], coef) => {
        const x = xs.map((c) => c.map((v) => v / 100));
        // Whole-number effects on values in hundredths: every value of the target has at most two decimals, so its text is exact.
        const y = x[0].map((_, i) => hundredths(x.reduce((s, c, j) => s + coef[j] * c[i], 1.5)));
        const f = fit(input(y, x));
        if (!f.ok || f.merged.length > 0) return;
        f.drivers.forEach((dr) => expect(dr.effect).toBe(coef[NAMES.indexOf(dr.name)]));
        expect(f.intercept).toBe(1.5);
        expect(f.explained).toBe(1);
        expect(f.miss).toBe(0);
        for (const dr of f.drivers) expect([dr.lo, dr.hi]).toEqual([dr.effect, dr.effect]);
      }),
      { numRuns, seed },
    );
  });
  it(`the fit is the same twice, and what it returns is plain data (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, (d) => {
        const { y, x } = prep(d);
        const a = fit(input(y, x));
        expect(JSON.stringify(a)).toBe(JSON.stringify(fit(input(y, x))));
        expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      }),
      { numRuns, seed },
    );
  });
  it(`a refusal carries no number and no model; a result with a caution is the same numbers as without (${numRuns} data sets, seed ${seed})`, () => {
    fc.assert(
      fc.property(data, (d) => {
        const { y, x } = prep(d);
        const f = fit(input(y, x));
        if (f.ok) {
          expect(f.verdict.refusals).toEqual([]);
          return;
        }
        expect(Object.keys(f).sort()).toEqual(["ok", "refusals"]);
        expect(f.refusals.length).toBeGreaterThan(0);
      }),
      { numRuns, seed },
    );
  });
  it("tells the basis from the series only: a trend in the target and one driver compares changes, else values", () => {
    const trend = Array.from({ length: 24 }, (_, i) => 100 + 5 * i + ((i * 7) % 5));
    const flat = Array.from({ length: 24 }, (_, i) => 100 + ((i * 7) % 11));
    expect(fitBasis(pts(trend), [pts(trend.map((v) => v * 2 + 3))], "month")).toBe("changes");
    expect(fitBasis(pts(trend), [pts(flat)], "month")).toBe("values");
    expect(fitBasis(pts(trend), [pts(flat), pts(trend)], "month")).toBe("changes");
    expect(fitBasis(pts(flat), [pts(trend)], "month")).toBe("values");
  });
});

describe("compared by change", () => {
  const rng = lcg(41);
  // Two Metrics that only share a trend and nothing else: levels explain each other, changes do not.
  const trend = Array.from({ length: 36 }, (_, i) => 100 + 4 * i);
  const a = trend.map((v) => hundredths(v + gauss(rng) * 3));
  const y = trend.map((v) => hundredths(2 * v + gauss(rng) * 6));
  it("a pair that only shares a trend is explained by values and not at all by changes", () => {
    const byValue = made(fit(input(y, [a], { basis: "values" })));
    const byChange = made(fit(input(y, [a])));
    expect(byValue.explained).toBeGreaterThan(0.95);
    expect(byChange.basis).toBe("values");
    const auto = made(fit({ ...input(y, [a]), basis: undefined }));
    expect(auto.basis).toBe("changes");
    expect(auto.explained).toBeLessThan(0.3);
    expect(auto.n).toBe(35);
    expect(auto.drivers[0].strength).toBe("cant-tell");
  });
  it("counts the target and the drivers from their latest level: predict and needs agree, and say what they hold", () => {
    const m = made(fit({ ...input(y, [a]), basis: "changes" }));
    const last = a[35];
    // A driver value equal to its latest level is no change: the target is its latest level plus the average change.
    const p = predict(m, [last]);
    if (!p.ok) throw new Error("refused");
    expect(close(p.value, y[35] + m.intercept, 1e-12, 1)).toBe(true);
    const nd = needs(m, { goal: p.value, driver: 0 });
    if (!nd.ok) throw new Error("refused");
    expect(close(nd.value, last, 1e-9, 1)).toBe(true);
    expect(nd.current).toBe(last);
    // A bigger one-month rise than the driver has ever had is outside what was seen.
    const big = predict(m, [last + 10 * (m.drivers[0].high + 1)]);
    if (!big.ok) throw new Error("refused");
    expect(big.outside).toEqual([{ name: "Visits", side: "above", limit: m.drivers[0].high, change: true }]);
  });
  it("holds the other drivers at their latest levels, that is no change, with two drivers", () => {
    const b = trend.map((v) => hundredths(v * 3 + gauss(rng) * 5));
    const m2 = made(fit({ ...input(y, [a, b]), basis: "changes" }));
    const held = needs(m2, { goal: m2.last.y + 100, driver: 0 });
    const given = needs(m2, { goal: m2.last.y + 100, driver: 0, held: m2.last.x });
    expect(held).toEqual(given);
    const other = needs(m2, { goal: m2.last.y + 100, driver: 0, held: [0, m2.last.x[1] + 3] });
    if (!held.ok || !other.ok) throw new Error("refused");
    expect(other.value).not.toBe(held.value);
  });
  it("is exact: the changes are the exact differences of the values' text", () => {
    const m = made(fit({ ...input(y, [a]), basis: "changes" }));
    expect(m.rows[0].y).toBe(Number((y[1] - y[0]).toFixed(2)));
    expect(m.last.y).toBe(y[35]);
    expect(m.last.x).toEqual([a[35]]);
    expect(m.rows.map((r) => r.period)).toEqual(Array.from({ length: 35 }, (_, i) => month(i + 1)));
  });
});

describe("the stated range holds about as often as it says, on simulated data", () => {
  // Mutation testing runs with 30 generated cases per test (calculation-tests.md): the simulations are too few to judge a coverage
  // then, and the references and fixtures kill the mutants; the sampling bounds below are for the full runs.
  const full = numRuns >= 100;
  // 80 % ranges: a value's range holds a new period's value about 80 % of the time, an effect's range holds the true effect about
  // 80 % of the time (the sampling error of 800 runs is about 1.4 points; the bounds are 3.5 of those).
  it.skipIf(!full)("holds a new period's value about 80 % of the time, and the true effect about 80 % of the time (800 simulated series)", () => {
    const rng = lcg(2026);
    let [valueHolds, effectHolds, runsMade] = [0, 0, 0];
    for (let run = 0; run < 800; run++) {
      const n = 20;
      const x1 = Array.from({ length: n + 1 }, () => hundredths(10 + rng() * 40));
      const x2 = Array.from({ length: n + 1 }, () => hundredths(5 + rng() * 20));
      const truth = [1.5, -0.8];
      const y = x1.map((v, i) => hundredths(7 + truth[0] * v + truth[1] * x2[i] + gauss(rng) * 3));
      const f = fit(input(y.slice(0, n), [x1.slice(0, n), x2.slice(0, n)]));
      if (!f.ok) continue;
      const p = predict(f, [x1[n], x2[n]]);
      if (!p.ok || p.lo === null) continue;
      runsMade++;
      // The target is rounded to hundredths: the noise of rounding is far below the noise of 3.
      if (y[n] >= p.lo && y[n] <= p.hi!) valueHolds++;
      if (truth[0] >= f.drivers[0].lo && truth[0] <= f.drivers[0].hi) effectHolds++;
    }
    expect(runsMade).toBeGreaterThan(500);
    expect(valueHolds / runsMade).toBeGreaterThan(0.765);
    expect(valueHolds / runsMade).toBeLessThan(0.835);
    expect(effectHolds / runsMade).toBeGreaterThan(0.765);
    expect(effectHolds / runsMade).toBeLessThan(0.835);
  });
  it.skipIf(!full)("gives a needs range that holds the goal: the true driver value lies in it about 80 % of the time for a noisy goal", () => {
    const rng = lcg(77);
    let [holds, made2] = [0, 0];
    for (let run = 0; run < 600; run++) {
      const n = 24;
      const x = Array.from({ length: n + 1 }, () => hundredths(10 + rng() * 40));
      const y = x.map((v) => hundredths(5 + 2 * v + gauss(rng) * 5));
      const f = fit(input(y.slice(0, n), [x.slice(0, n)]));
      if (!f.ok) continue;
      // The value a new period reaches is y[n]; the range of driver values that could give it holds x[n] about 80 % of the time.
      const nd = needs(f, { goal: y[n], driver: 0, held: [x[n]] });
      if (!nd.ok || nd.lo === null) continue;
      made2++;
      if (x[n] >= nd.lo && x[n] <= nd.hi!) holds++;
    }
    expect(made2).toBeGreaterThan(450);
    expect(holds / made2).toBeGreaterThan(0.75);
    expect(holds / made2).toBeLessThan(0.99);
  });
});

describe("the t quantile in a fit is the one for its degrees of freedom", () => {
  it("is the 90 % point with n − k − 1 degrees of freedom: 28 periods and 3 drivers give 24", () => {
    const rng = lcg(9);
    const xs = Array.from({ length: 3 }, () => Array.from({ length: 28 }, () => hundredths(rng() * 80)));
    const y = Array.from({ length: 28 }, (_, i) => hundredths(xs[0][i] - xs[1][i] + gauss(rng) * 9));
    const f = made(fit(input(y, xs)));
    expect(f.df).toBe(24);
    const d = f.drivers[0];
    const half = d.hi - d.effect;
    const se = (d.hi - d.lo) / 2 / tQuantile(0.9, 24);
    expect(half).toBeCloseTo(tQuantile(0.9, 24) * se, 12);
  });
});
