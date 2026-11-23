// The pair scan behind the Heads-ups (spec 0041, ticket 13): held to the third way it was written in Python (NumPy for the
// correlations and autocorrelations, SciPy for the chances), to a reference of its own written from the definitions on exact
// fractions, to cases worked by hand, to hostile inputs (no pairs, too few, a constant series, NaN, huge and tiny values, a
// pair that ends long before the other) and to properties (symmetry, scale, sign, bounds, determinism). What is not here: the
// correction for the number of pairs (false-discovery.test.ts), the sentences (heads-up.test.ts), and the false-discovery
// simulation (heads-up-simulation.test.ts).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { changes } from "../basis";
import { periodStart, shiftPeriod } from "../periods";
import { runs } from "../test/reference/check";
import { exactOf } from "../test/reference/exact";
import { referencePearson } from "../test/reference/analyses";
import { referenceChance, referenceEffective, referencePairs, referenceR, referenceRho } from "../test/reference/heads-up";
import { FIXTURE, HASHES } from "../test/reference/heads-up-fixture";
import { close, series } from "../test/reference/methods-fixture";
import { adjacent, autocorrelations, axisOf, capMetrics, effectiveCount, exactAtLeast, HEADS_UP, layOut, scanPair, scanPairs, strongAndAgreeing, strongInBoth, type Axis, type Laid, type PairScan } from "./pair-scan";

const { numRuns, seed } = runs();

// ---- data ----

/** A deterministic source of numbers in [0, 1). */
function rng(state: number) {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Standard normal values from a deterministic source. */
const normals = (state: number) => { const r = rng(state); return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); };
/** n normal changes. */
const noise = (state: number, n: number, sd = 1) => { const z = normals(state); return Array.from({ length: n }, () => sd * z()); };
const axisOfLength = (length: number): Axis => ({ span: "month", first: "2024-02-01", length });
/** A series of changes laid out, a null being a missing change. */
const laid = (v: readonly (number | null)[]): Laid => { const values = v.map((x) => x ?? NaN); return { values, rho: autocorrelations(values) }; };
const scan = (a: readonly (number | null)[], b: readonly (number | null)[]) => scanPair(laid(a), laid(b), axisOfLength(Math.max(a.length, b.length)));
/** `y` follows `x` by `lag` periods with some noise: y[t] = x[t − lag] + noise. */
const follows = (x: number[], lag: number, state: number, sd = 0.2) => { const z = normals(state); return x.map((_, t) => (t - lag >= 0 ? x[t - lag] : z()) + sd * z()); };
const MONTH = (k: number) => new Date(Date.UTC(2024, 1 + k, 1)).toISOString().slice(0, 10);

// ---- the fixture ----

describe("the SciPy and NumPy fixture", () => {
  it("was made by the current script (heads-up.py)", () => {
    expect(HASHES.fixture, "run python3 packages/core/src/test/reference/fixtures/heads-up.py again").toBe(HASHES.script);
  });
});

// ---- autocorrelations and the effective count ----

describe("autocorrelations", () => {
  it("are worked out by hand: 1 2 3 4 5 has ρ1 = 0.4, ρ2 = −0.1, ρ3 = ρ4 = −0.4 and none beyond", () => {
    const rho = autocorrelations([1, 2, 3, 4, 5]);
    expect(rho.length).toBe(12);
    [0.4, -0.1, -0.4, -0.4, 0, 0, 0, 0, 0, 0, 0, 0].forEach((v, i) => expect(close(rho[i], v, 1e-15), `ρ${i + 1}`).toBe(true));
  });
  it("read a series with a gap over the values it has: 1, gap, 3, 4, 5 has ρ1 = (−0.1875 + 1.3125) ÷ 8.75", () => {
    expect(close(autocorrelations([1, NaN, 3, 4, 5])[0], 1.125 / 8.75, 1e-15)).toBe(true);
  });
  it("are 0 at every delay for a series that does not vary or has no value", () => {
    expect(autocorrelations([4, 4, 4, 4])).toEqual(Array(12).fill(0));
    expect(autocorrelations([])).toEqual(Array(12).fill(0));
    expect(autocorrelations([NaN, NaN])).toEqual(Array(12).fill(0));
    expect(autocorrelations([3])).toEqual(Array(12).fill(0));
  });
  it("hold the delays asked for, and equal NumPy's np.correlate and the reference on exact fractions", () => {
    expect(autocorrelations([1, 4, 2, 8, 5, 7], 3).length).toBe(3);
    for (const c of FIXTURE.effective) {
      autocorrelations(c.x).forEach((v, i) => expect(close(v, c.rhoX[i], 1e-12), `x ρ${i + 1}`).toBe(true));
      autocorrelations(c.xg.map((v) => v ?? NaN)).forEach((v, i) => expect(close(v, c.rhoXGapped[i], 1e-12), `gapped ρ${i + 1}`).toBe(true));
      autocorrelations(c.y).forEach((v, i) => expect(close(v, c.rhoY[i], 1e-12), `y ρ${i + 1}`).toBe(true));
      for (let k = 1; k <= 12; k++) expect(close(autocorrelations(c.x)[k - 1], Number(referenceRho(c.x, k).num) / Number(referenceRho(c.x, k).den), 1e-12)).toBe(true);
    }
  });
});

describe("effectiveCount", () => {
  it("is worked out by hand: 12 pairs with ρ1 = 0.5 in both series at the first of 4 delays is 12 ÷ (1 + 2·0.25) = 8", () => {
    expect(effectiveCount(12, [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(8);
  });
  it("counts only the first n ÷ 3 delays (at most 12): 11 pairs read 3, 12 read 4, 36 and 40 read 12", () => {
    const ones = Array(12).fill(0.1);
    // Σ over k delays of 0.01 is 0.01·k; the count is n ÷ (1 + 0.02·k).
    expect(close(effectiveCount(11, ones, ones), 11 / 1.06, 1e-15)).toBe(true);
    expect(close(effectiveCount(12, ones, ones), 12 / 1.08, 1e-15)).toBe(true);
    expect(close(effectiveCount(36, ones, ones), 36 / 1.24, 1e-15)).toBe(true);
    expect(close(effectiveCount(40, ones, ones), 40 / 1.24, 1e-15)).toBe(true);
  });
  it("never claims more than n: a negative sum is not used", () => {
    expect(effectiveCount(30, Array(12).fill(0.5), Array(12).fill(-0.5))).toBe(30);
    expect(effectiveCount(30, Array(12).fill(0), Array(12).fill(0.9))).toBe(30);
  });
  it("is NumPy's and the exact reference's, for series with and without gaps", () => {
    for (const c of FIXTURE.effective) {
      expect(close(effectiveCount(c.n, c.rhoX, c.rhoY), c.nEff, 1e-12), `${c.nEff}`).toBe(true);
      expect(close(effectiveCount(c.n, c.rhoXGapped, c.rhoY), c.nEffGapped, 1e-12)).toBe(true);
      expect(close(referenceEffective(c.n, c.x, c.y), c.nEff, 1e-12), "the reference against NumPy").toBe(true);
      expect(close(referenceEffective(c.n, c.xg, c.y), c.nEffGapped, 1e-12), "the reference with a gap").toBe(true);
    }
  });
});

// ---- the exact thresholds ----

describe("exactAtLeast", () => {
  // x = (7, −7, 0 × 10) and y = (7, −7, 5, −5, 5, −5, 1, −1, 0 × 4): Sxy = 98, Sxx = 98, Syy = 200, so r² = 98² ÷ (98 · 200) = 0.49 and r = 0.7 exactly.
  const x = [7, -7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const y = [7, -7, 5, -5, 5, -5, 1, -1, 0, 0, 0, 0];
  it("decides a correlation of exactly 0.7 as at least 0.7, and 0.3 a hair above 0.7 as not", () => {
    expect(exactAtLeast(x, y, 7, 10)).toEqual({ atLeast: true, sign: 1 });
    expect(exactAtLeast(x, y, 70000001, 100000000)).toEqual({ atLeast: false, sign: 1 });
    expect(exactAtLeast(x, y, 69999999, 100000000)).toEqual({ atLeast: true, sign: 1 });
    expect(exactAtLeast(x, y.map((v) => -v), 7, 10)).toEqual({ atLeast: true, sign: -1 });
    expect(exactAtLeast(x, x, 1, 1)).toEqual({ atLeast: true, sign: 1 });
    expect(exactAtLeast(x, x.map((v) => -v), 1, 1)).toEqual({ atLeast: true, sign: -1 });
  });
  it("is the reference's decision on r² (generated integers, three thresholds)", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: -9, max: 9 }), fc.integer({ min: -9, max: 9 })), { minLength: 2, maxLength: 14 }), fc.constantFrom([7, 10], [3, 10], [1, 2]), (pairs, [num, den]) => {
        const [xs, ys] = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
        const ref = referencePearson(xs.map((v) => exactOf(v)), ys.map((v) => exactOf(v)));
        const got = exactAtLeast(xs, ys, num, den);
        if (ref === null) {
          expect(got).toBeNull();
          return;
        }
        // r² ≥ (num ÷ den)², compared as whole numbers.
        const atLeast = ref.r2.num * BigInt(den) ** 2n >= BigInt(num) ** 2n * ref.r2.den;
        expect(got).toEqual({ atLeast, sign: ref.negative ? -1 : 1 });
      }),
      { numRuns, seed },
    );
  });
  it("has no answer for a series that does not vary, or no pairs", () => {
    expect(exactAtLeast([1, 1, 1], [1, 2, 3], 7, 10)).toBeNull();
    expect(exactAtLeast([1, 2, 3], [5, 5, 5], 7, 10)).toBeNull();
    expect(exactAtLeast([], [], 7, 10)).toBeNull();
    expect(exactAtLeast([3], [4], 7, 10)).toBeNull();
  });
  it("reads decimals by their text: 0.1 · 3 is 0.3 and r is exact for values like 0.1 and 0.2", () => {
    expect(exactAtLeast([0.1, 0.2, 0.3], [0.2, 0.4, 0.6], 1, 1)).toEqual({ atLeast: true, sign: 1 });
  });
});

// ---- the scan of a pair against the Python fixture ----

describe("scanPair against Python (NumPy and SciPy)", () => {
  it.each(FIXTURE.scans.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const [a, b] = [changes(series(c.a.map(Number)), "month"), changes(series(c.b.map(Number)), "month")];
    const axis = axisOf([a, b], "month")!;
    const got = scanPair(layOut(a, axis), layOut(b, axis), axis);
    if (c.scan === null) return expect(got).toBeNull();
    const want = c.scan;
    expect(got).not.toBeNull();
    // The scan runs to the last change; the script counts it from the first change, which is the period after the first level.
    expect(got!.through).toBe(MONTH(want.through));
    const same = (g: Record<string, unknown>, w: Record<string, unknown>, label: string) => {
      expect(g.lag, `${label} lag`).toBe(w.lag);
      expect(g.n, `${label} n`).toBe(w.n);
      expect(g.tries, `${label} tries`).toBe(w.tries);
      expect(close(g.r as number, w.r as number, 1e-12), `${label} r ${g.r} ${w.r}`).toBe(true);
      expect(close(g.nEff as number, w.nEff as number, 1e-12), `${label} nEff`).toBe(true);
      expect(Math.abs((g.pDelays as number) - (w.pDelays as number)) <= 1e-9 * (w.pDelays as number) + 1e-300, `${label} pDelays ${g.pDelays} ${w.pDelays}`).toBe(true);
      expect(Math.abs((g.p as number) - (w.p as number)) <= 1e-9 * (w.p as number) + 1e-300, `${label} p ${g.p} ${w.p}`).toBe(true);
    };
    same(got!.full, want.full, "full");
    for (const side of ["rFirst", "rSecond"] as const) {
      const [g, w] = [got!.full[side], want.full[side]];
      if (w === null) expect(g).toBeNull();
      else expect(close(g!, w, 1e-12), side).toBe(true);
    }
    expect(got!.full.nFirst).toBe(want.full.nFirst);
    expect(got!.full.nSecond).toBe(want.full.nSecond);
    if (want.before === null) return expect(got!.before).toBeNull();
    same(got!.before!, want.before, "before");
    if (want.before.recent === null) return expect(got!.before!.recent).toBeNull();
    const recent = got!.before!.recent!;
    expect(recent.n).toBe(6);
    expect(close(recent.r, want.before.recent.r, 1e-12)).toBe(true);
    expect(Math.abs(recent.dropP - want.before.recent.dropP) <= 1e-9 * want.before.recent.dropP + 1e-300, `drop ${recent.dropP} ${want.before.recent.dropP}`).toBe(true);
  });
});

// ---- the scan of a pair against its reference ----

const DELAYS = [0, 1, -1, 2, -2, 3, -3];

/** The whole-history window of a pair from the reference: each delay's pairs by position, r exact, the effective count from exact
 * fractions, the chance by the integral; the best is the smallest chance, the earlier in the order of delays on a tie. */
function referenceWindow(a: readonly (number | null)[], b: readonly (number | null)[]) {
  const found = DELAYS.flatMap((lag) => {
    const pairs = referencePairs(a, b, lag, 0, a.length - 1);
    if (pairs.length < 12) return [];
    const r = referenceR(pairs.map((p) => p.lead), pairs.map((p) => p.follow));
    if (Number.isNaN(r)) return [];
    const nEff = referenceEffective(pairs.length, a, b);
    return [{ lag, pairs, r, nEff, p: nEff < 4 ? 1 : referenceChance(r, nEff) }];
  });
  return { found, tries: found.length, best: found.length ? found.reduce((top, l) => (l.p < top.p ? l : top)) : null };
}

describe("scanPair against its reference (exact r, the exact effective count, the integral for the chance)", () => {
  const cell = fc.option(fc.integer({ min: -30, max: 30 }), { freq: 12, nil: null });
  const pair = fc.integer({ min: 14, max: 60 }).chain((n) => fc.tuple(fc.array(cell, { minLength: n, maxLength: n }), fc.array(cell, { minLength: n, maxLength: n })));
  it(`gives the reference's r, pairs, effective count and chances at the best delay, which is the reference's smallest chance (${numRuns} generated pairs of series, some with gaps)`, () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const got = scan(a, b);
        const ref = referenceWindow(a, b);
        // The ends of the two series may lie further apart than a delay, which refuses the pair.
        const ends = (v: (number | null)[]) => v.length - 1 - [...v].reverse().findIndex((x) => x !== null);
        if (a.every((x) => x === null) || b.every((x) => x === null) || Math.abs(ends(a) - ends(b)) > 3 || ref.best === null) {
          expect(got).toBeNull();
          return;
        }
        expect(got).not.toBeNull();
        const full = got!.full;
        const mine = ref.found.find((l) => l.lag === full.lag);
        expect(mine, `the delay ${full.lag} has a reference result`).toBeDefined();
        expect(full.tries).toBe(ref.tries);
        expect(full.n).toBe(mine!.pairs.length);
        expect(close(full.r, mine!.r, 1e-12), `r ${full.r} ${mine!.r}`).toBe(true);
        expect(close(full.nEff, mine!.nEff, 1e-12)).toBe(true);
        // The best delay is the reference's smallest chance (a tie of chances to a relative 1e-8 may fall either way).
        expect(mine!.p <= ref.best.p * (1 + 1e-8) + 1e-300, `the code's delay ${full.lag} has chance ${mine!.p}, the reference's best ${ref.best.p}`).toBe(true);
        expect(Math.abs(full.pDelays - Math.min(1, ref.tries * mine!.p)) <= 1e-8 * mine!.p * ref.tries + 1e-300, `pDelays ${full.pDelays} ${ref.tries * mine!.p}`).toBe(true);
        expect(full.p).toBeGreaterThanOrEqual(full.pDelays);
        // A pair that meets the conditions meets them exactly: |r| ≥ 0.7 over all of them and in each half, with the same sign.
        if (full.meets) {
          const exact = (xs: number[], ys: number[]) => referencePearson(xs.map((v) => exactOf(v)), ys.map((v) => exactOf(v)))!;
          const [x, y] = [mine!.pairs.map((p) => p.lead), mine!.pairs.map((p) => p.follow)];
          const cut = Math.floor(x.length / 2);
          for (const r of [exact(x, y), exact(x.slice(0, cut), y.slice(0, cut)), exact(x.slice(cut), y.slice(cut))]) {
            expect(r.r2.num * 100n >= 49n * r.r2.den).toBe(true);
            expect(r.negative).toBe(exact(x, y).negative);
          }
          expect(full.p).toBeLessThanOrEqual(HEADS_UP.rate);
        }
      }),
      { numRuns, seed },
    );
  });
});

// ---- cases worked out by hand ----

describe("what a pair comes to", () => {
  const base = noise(11, 47);
  const x = base;
  it("finds a pair where the first moves 2 periods before the second: the delay, its strength, and every condition met", () => {
    const got = scan(x, follows(x, 2, 12))!;
    expect(got.full).toMatchObject({ lag: 2, n: 45, tries: 7, meets: true });
    expect(got.full.r).toBeGreaterThan(0.95);
    expect(got.full.p).toBeLessThan(1e-12);
    expect(got.full.nFirst + got.full.nSecond).toBe(45);
    expect(got.before).toMatchObject({ lag: 2, meets: true });
    expect(got.before!.recent).toMatchObject({ n: 6, low: false });
    expect(got.through).toBe(MONTH(46));
  });
  it("finds it with the second moving first as a negative delay, and the opposite sign for a link that goes the other way", () => {
    const got = scan(follows(x, 1, 13), x)!;
    expect(got.full).toMatchObject({ lag: -1, meets: true });
    const opposite = scan(x, follows(x, 0, 14).map((v) => -1.2 * v))!;
    expect(opposite.full.lag).toBe(0);
    expect(opposite.full.r).toBeLessThan(-0.95);
    expect(opposite.full.meets).toBe(true);
    expect(opposite.full.rFirst!).toBeLessThan(0);
  });
  it("finds nothing in two series that have nothing to do with each other", () => {
    for (const s of [21, 22, 23, 24]) {
      const got = scan(noise(s, 47), noise(s + 100, 47))!;
      expect(got.full.meets, `seed ${s}`).toBe(false);
      expect(got.full.p).toBeGreaterThan(0.01);
    }
  });
  it("does not meet the conditions for a link that was there and has gone: strong before, the second half weak, the last 6 periods under 0.3", () => {
    const first = noise(36, 36);
    const a = [...first, ...noise(66, 11)];
    const b = [...follows(first, 0, 96, 0.1), ...noise(126, 11)];
    const got = scan(a, b)!;
    expect(got.full.meets).toBe(false);
    expect(got.before).toMatchObject({ lag: 0, meets: true });
    expect(got.before!.recent!.low).toBe(true);
    expect(got.before!.recent!.dropP).toBeLessThan(0.01);
    expect(Math.abs(got.before!.recent!.r)).toBeLessThan(0.3);
  });
  it("does not meet them when |r| is under 0.7 although the chance is small (r is about 0.6 over 47 pairs)", () => {
    const got = scan(x, follows(x, 0, 41, 1.2))!;
    expect(got.full.r).toBeGreaterThan(0.45);
    expect(got.full.r).toBeLessThan(0.69);
    expect(got.full.p).toBeLessThan(0.01);
    expect(got.full.meets).toBe(false);
  });
  it("does not meet them when the two halves are not both strong the same way: strongAndAgreeing, a step either side of 0.7 and across 0", () => {
    const edge = HEADS_UP.strong;
    expect(strongAndAgreeing(0.9, [0.8, 0.95])).toBe(true);
    expect(strongAndAgreeing(-0.9, [-0.8, -0.95])).toBe(true);
    // The whole is strong and one half is not, the other way round, or a half points the other way.
    expect(strongAndAgreeing(0.9, [0.69, 0.95])).toBe(false);
    expect(strongAndAgreeing(0.9, [0.95, 0.69])).toBe(false);
    expect(strongAndAgreeing(0.9, [0.8, -0.8])).toBe(false);
    expect(strongAndAgreeing(-0.9, [0.8, 0.8])).toBe(false);
    expect(strongAndAgreeing(0.69, [0.8, 0.8])).toBe(false);
    // A hair under the threshold is left to the exact answer; further under is not.
    expect(strongAndAgreeing(edge - 1e-10, [edge, edge])).toBe(true);
    expect(strongAndAgreeing(edge - 1e-8, [edge, edge])).toBe(false);
    expect(strongAndAgreeing(edge, [edge, edge - 1e-10])).toBe(true);
    expect(strongAndAgreeing(edge, [edge, edge - 1e-8])).toBe(false);
    expect(strongAndAgreeing(-edge, [-edge, -edge + 1e-10])).toBe(true);
    // A half that does not vary has no r.
    expect(strongAndAgreeing(0.9, [NaN, 0.9])).toBe(false);
    expect(strongAndAgreeing(0.9, [0.9, NaN])).toBe(false);
    expect(strongAndAgreeing(NaN, [0.9, 0.9])).toBe(false);
    expect(strongAndAgreeing(0, [0, 0])).toBe(false);
  });
  it("does not meet them with a missing value inside, or a far-off value: a Heads-up is only for a pair that passes every check cleanly", () => {
    const y = follows(x, 0, 61);
    expect(scan(x, y)!.full.meets).toBe(true);
    expect(scan(x, y.map((v, i) => (i === 20 ? null : v)))!.full.meets).toBe(false);
    expect(scan(x.map((v, i) => (i === 10 ? v + 400 : v)), y.map((v, i) => (i === 10 ? v + 400 : v)))!.full.meets).toBe(false);
  });
  it("counts pairs, not periods: with a gap in one series the delays have fewer pairs", () => {
    const y = follows(x, 0, 62);
    expect(scan(x, y)!.full.n).toBe(47);
    expect(scan(x, y.map((v, i) => (i === 20 ? null : v)))!.full.n).toBe(46);
  });
});

describe("strongInBoth", () => {
  // r = 0.7 exactly over all 12 pairs; the halves of 6 (the first six and the last six) are checked too, so the halves are chosen to be 0.7-strong as well.
  const [lead, follow] = [[1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6], [1.2, 2, 3.1, 4.2, 5, 6.1, 1.1, 2.2, 2.9, 4, 5.2, 6]];
  it("is true for a pair that is strong in the whole and in both halves, and false when the whole, either half or the exact answer is not", () => {
    expect(strongInBoth(lead, follow)).toBe(true);
    expect(strongInBoth(lead, lead.map((v) => -v))).toBe(true);
    // Weak in the second half only.
    expect(strongInBoth(lead, [...follow.slice(0, 6), 6, 1, 4, 2, 5, 3])).toBe(false);
    // Weak in the first half only.
    expect(strongInBoth(lead, [6, 1, 4, 2, 5, 3, ...follow.slice(6)])).toBe(false);
    // A half that does not vary has no r.
    expect(strongInBoth([1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6], follow)).toBe(false);
    expect(strongInBoth([], [])).toBe(false);
  });
  it("is decided exactly at 0.7: r² = 49/100 over all of them and in each half is strong; one value moved by 1e-12 so that r² is a hair under is not, though the double is within 1e-14 of 0.7", () => {
    // x = (1, −1) three times over, twice; y = 7x + w with w orthogonal to x and to 1 and |w|² = 306 in each half: r² = 294 ÷ 600 = 49/100 exactly, whole and halves.
    const x = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
    const y = [-5, -10, 7, -7, 19, -4, -5, -10, 7, -7, 19, -4];
    expect(exactAtLeast(x, y, 7, 10)).toEqual({ atLeast: true, sign: 1 });
    expect(exactAtLeast(x.slice(0, 6), y.slice(0, 6), 7, 10)).toEqual({ atLeast: true, sign: 1 });
    expect(exactAtLeast(x, y, 70000001, 100000000)).toEqual({ atLeast: false, sign: 1 });
    expect(strongInBoth(x, y)).toBe(true);
    expect(strongInBoth(x, y.map((v) => -v))).toBe(true);
    const [lower, higher] = [[...y], [...y]];
    lower[11] = -4 + 1e-12;
    higher[11] = -4 - 1e-12;
    // Lowered: the whole and the second half are a hair under 0.7 (r² = 49/100 − 8.4e-15), the first half is untouched.
    expect(exactAtLeast(x, lower, 7, 10)!.atLeast).toBe(false);
    expect(exactAtLeast(x.slice(6), lower.slice(6), 7, 10)!.atLeast).toBe(false);
    expect(exactAtLeast(x.slice(0, 6), lower.slice(0, 6), 7, 10)!.atLeast).toBe(true);
    expect(Math.abs(referenceR(x, lower) - 0.7)).toBeLessThan(1e-13);
    expect(strongInBoth(x, lower)).toBe(false);
    // Raised: the same distance on the other side, above 0.7 in the whole and in the second half: strong.
    expect(strongInBoth(x, higher)).toBe(true);
  });
});

// ---- hostile inputs ----

describe("a pair that cannot be scanned is no pair, and never a wrong number", () => {
  const ok = noise(71, 30);
  it("needs 12 pairs of changes at a delay: 12 at delay 0 and a pair at the other delays is the least, 11 is none", () => {
    expect(scan(noise(1, 12), noise(2, 12))).not.toBeNull();
    expect(scan(noise(1, 12), noise(2, 12))!.full.tries).toBe(1);
    expect(scan(noise(1, 11), noise(2, 11))).toBeNull();
    expect(scan(noise(1, 13), noise(2, 13))!.full.tries).toBe(3);
    expect(scan(noise(1, 14), noise(2, 14))!.full.tries).toBe(5);
    expect(scan(noise(1, 15), noise(2, 15))!.full.tries).toBe(7);
    // With one missing value the pairs at delay 0 are 11, and delay 1 has 12 only where the gap is not in its way.
    expect(scan([...noise(1, 12)].map((v, i) => (i === 5 ? null : v)), noise(2, 12))).toBeNull();
  });
  it("has nothing from empty series, series of no value or of one", () => {
    expect(scan([], [])).toBeNull();
    expect(scan([null, null], [null, null])).toBeNull();
    expect(scan(ok, [])).toBeNull();
    expect(scan([], ok)).toBeNull();
    expect(scan(ok, ok.map(() => null))).toBeNull();
    expect(scan([1], [1])).toBeNull();
    expect(scanPair({ values: [], rho: [] }, { values: [], rho: [] }, axisOfLength(0))).toBeNull();
  });
  it("has nothing from a series that does not change, and counts the other delays that do", () => {
    expect(scan(ok, ok.map(() => 5))).toBeNull();
    expect(scan(ok.map(() => 0), ok)).toBeNull();
    expect(scan(ok.map(() => 0.1), ok.map(() => 0.1))).toBeNull();
  });
  it("leaves out what is not a number: NaN and the infinities are no change", () => {
    const [a, b] = [[...ok], [...ok]];
    a[3] = Infinity;
    b[4] = -Infinity;
    a[5] = NaN;
    const got = scanPair({ values: a, rho: autocorrelations(a) }, { values: b, rho: autocorrelations(b) }, axisOfLength(30))!;
    expect(got.full.n).toBe(27);
    expect(Number.isFinite(got.full.r)).toBe(true);
  });
  it("gives no wrong number for values too large or too small to square: a refusal, not a guess", () => {
    expect(scan(ok.map((v) => v * 1e200), ok.map((v) => v * 1e200))).toBeNull();
    expect(scan(ok.map((v) => v * 1e-200), ok.map((v) => v * 1e-200))).toBeNull();
    const huge = scan(ok.map((v) => v * 1e100), ok.map((v) => v * 1e100));
    expect(huge!.full.r).toBeCloseTo(1, 12);
    const tiny = scan(ok.map((v) => v * 1e-100), ok.map((v) => v * 1e-100));
    expect(tiny!.full.r).toBeCloseTo(1, 12);
  });
  it("gives no result for a delay whose series' sum of squares is too large for a double, though its own pairs are fine", () => {
    // Metric a has a change of 1e200 at a position the other series has no value for, so at delay 0 the pairs are fine but a's autocorrelations are not a number.
    const [a, b] = [[...ok], [...ok]];
    a[10] = 1e200;
    b[10] = null as unknown as number;
    const got = scan(a, b.map((v) => (v === (null as unknown as number) ? null : v)));
    expect(got).toBeNull();
  });
  it("has no r for a half that does not vary, and says so: null, with the chance of 1", () => {
    const first = ok.map((v, i) => (i < 15 ? 0 : v));
    const got = scan(first, noise(72, 30))!;
    expect(got.full.rFirst).toBeNull();
    expect(got.full.nFirst).toBeGreaterThanOrEqual(6);
    expect(got.full.p).toBe(1);
    expect(got.full.rSecond).not.toBeNull();
  });
  it("has a chance of 1 for the drop when the earlier history is worth fewer than 4 independent pairs (two steadily climbing series)", () => {
    // Changes that climb steadily (a trend in the changes): each follows its own past so closely that 18 pairs are worth about 2.
    const ramp = (seed: number, step: number) => noise(seed, 24, 0.01).map((d, i) => step * i + d);
    const got = scan(ramp(73, 1), ramp(74, -0.5))!;
    expect(got.before!.nEff).toBeLessThan(4);
    expect(got.before!.recent!.dropP).toBe(1);
  });
  it("refuses a pair whose series end more than 3 periods apart, and takes one that ends 3 apart", () => {
    const a = noise(81, 40);
    const b = [...noise(82, 37), null, null, null];
    expect(scan(a, b)).not.toBeNull();
    expect(scan(a, [...noise(82, 36), null, null, null, null])).toBeNull();
    expect(scan([...a.slice(0, 36), null, null, null, null], noise(82, 40))).toBeNull();
    // It runs to the earlier end.
    expect(scan(a, b)!.through).toBe(MONTH(36));
  });
  it("has an earlier history only with 12 pairs before the last 6 periods: 18 changes have it, 17 do not", () => {
    expect(scan(noise(91, 18), noise(92, 18))!.before).not.toBeNull();
    expect(scan(noise(91, 17), noise(92, 17))!.before).toBeNull();
  });
  it("has no last 6 periods to judge unless every one has a pair and neither series is constant there", () => {
    const [a, b] = [noise(93, 30), noise(94, 30)];
    expect(scan(a, b)!.before!.recent).not.toBeNull();
    // A missing change among the last six leaves 5 pairs.
    expect(scan(a, b.map((v, i) => (i === 27 ? null : v)))!.before!.recent).toBeNull();
    // A series that does not move in the last six has no r.
    expect(scan(a.map((v, i) => (i >= 24 ? 1 : v)), b)!.before!.recent).toBeNull();
    expect(scan(a, b.map((v, i) => (i >= 24 ? 1 : v)))!.before!.recent).toBeNull();
  });
  // A pair related before the last 6 periods (delay 0), with the last 6 of each series replaced.
  const planted = (xTail: number[], yTail: number[]) => {
    const [a, b] = [noise(95, 30), follows(noise(95, 30), 0, 96, 0.2)];
    a.splice(24, 6, ...xTail);
    b.splice(24, 6, ...yTail);
    return scan(a, b)!;
  };
  it("decides |r| under 0.3 over the last 6 periods by the double: 0.13 is under, 0.89 is not", () => {
    const under = planted([1, 2, 3, 4, 5, 6], [1, 4.6, 2.1, 5, 1.3, 3.2]);
    expect(under.before).toMatchObject({ lag: 0, meets: true });
    expect(under.before!.recent!.r).toBeCloseTo(0.1269, 3);
    expect(under.before!.recent!.low).toBe(true);
    const over = planted([1, 2, 3, 4, 5, 6], [1, 2, 4, 3, 6, 5]);
    expect(over.before!.recent!.low).toBe(false);
  });
  it("decides a last 6 periods at exactly |r| = 0.3 as not under 0.3, by the exact answer: the double of r is 0.30000000000000004 and the exact r² is 9/100", () => {
    const exactly = planted([0, 0, 0, 1, 1, 2], [-3, -2, 3, -2, 1, -3]);
    expect(Math.abs(exactly.before!.recent!.r)).toBeCloseTo(0.3, 12);
    expect(exactly.before!.recent!.low).toBe(false);
    expect(exactAtLeast([0, 0, 0, 1, 1, 2], [-3, -2, 3, -2, 1, -3], 3, 10)).toEqual({ atLeast: true, sign: -1 });
    // One value changed by a step moves it off 0.3 to either side, decided by the double alone.
    expect(planted([0, 0, 0, 1, 1, 2], [-3, -2, 3, -2, 1, -2.9]).before!.recent!.low).toBe(true);
    expect(planted([0, 0, 0, 1, 1, 2], [-3, -2, 3, -2, 1, -3.4]).before!.recent!.low).toBe(false);
  });
});

// ---- properties ----

describe("properties of a pair's scan", () => {
  // Values at the sizes Metrics have, to two decimals: the scale tests would otherwise meet doubles whose squares underflow.
  const real = fc.integer({ min: -5000, max: 5000 }).map((v) => v / 100);
  const pair = fc.integer({ min: 14, max: 50 }).chain((n) => fc.tuple(fc.array(real, { minLength: n, maxLength: n }), fc.array(real, { minLength: n, maxLength: n })));
  const summary = (s: PairScan | null) => s && { ...s.full, through: s.through };

  it(`is symmetric: swapping the two series flips the sign of the delay and nothing else (${numRuns} generated)`, () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const [one, two] = [scan(a, b), scan(b, a)];
        expect(one === null).toBe(two === null);
        if (!one || !two) return;
        // (+ 0 turns −0 into 0: a delay of none is the same both ways.)
        expect(two.full.lag + 0).toBe(-one.full.lag + 0);
        for (const k of ["r", "n", "nEff", "pDelays", "p", "tries"] as const) expect(close(two.full[k], one.full[k], 1e-12), k).toBe(true);
        expect(two.through).toBe(one.through);
        expect(one.before === null).toBe(two.before === null);
        if (one.before && two.before) expect(two.before.lag + 0).toBe(-one.before.lag + 0);
      }),
      { numRuns, seed },
    );
  });
  it(`is the same for series scaled by a power of 2, exactly (${numRuns} generated)`, () => {
    fc.assert(
      fc.property(pair, fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 }), ([a, b], i, j) => {
        const [k, l] = [2 ** i, 2 ** j];
        expect(summary(scan(a.map((v) => v * k), b.map((v) => v * l)))).toEqual(summary(scan(a, b)));
      }),
      { numRuns, seed },
    );
  });
  it(`flips the sign of r, and nothing else, when one series is negated (${numRuns} generated)`, () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const [one, two] = [scan(a, b), scan(a, b.map((v) => -v))];
        expect(one === null).toBe(two === null);
        if (!one || !two) return;
        expect(two.full.r).toBe(-one.full.r);
        for (const k of ["lag", "n", "nEff", "pDelays", "p", "tries"] as const) expect(two.full[k], k).toBe(one.full[k]);
      }),
      { numRuns, seed },
    );
  });
  it(`stays within its bounds and is the same twice (${numRuns} generated)`, () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const s = scan(a, b);
        expect(scan(a, b)).toEqual(s);
        if (!s) return;
        const windows = s.before ? [s.full, s.before] : [s.full];
        for (const w of windows) {
          expect(Math.abs(w.r)).toBeLessThanOrEqual(1);
          expect(w.p).toBeGreaterThanOrEqual(0);
          expect(w.p).toBeLessThanOrEqual(1);
          expect(w.pDelays).toBeLessThanOrEqual(w.p);
          expect(w.n).toBeGreaterThanOrEqual(12);
          expect(w.nFirst + w.nSecond).toBe(w.n);
          expect(w.nFirst).toBeGreaterThanOrEqual(6);
          expect(w.nEff).toBeGreaterThan(0);
          expect(w.nEff).toBeLessThanOrEqual(w.n);
          expect(w.tries).toBeGreaterThanOrEqual(1);
          expect(w.tries).toBeLessThanOrEqual(7);
          expect(Math.abs(w.lag)).toBeLessThanOrEqual(3);
          for (const r of [w.rFirst, w.rSecond]) if (r !== null) expect(Math.abs(r)).toBeLessThanOrEqual(1);
        }
        if (s.before?.recent) expect(s.before.recent.dropP).toBeGreaterThanOrEqual(0);
      }),
      { numRuns, seed },
    );
  });
  it("lowers the chance when more of the same relation is seen: a planted pair is surer over 60 pairs than over 20", () => {
    const x = noise(101, 60);
    const y = follows(x, 1, 102, 0.8);
    expect(scan(x, y)!.full.p).toBeLessThan(scan(x.slice(0, 20), y.slice(0, 20))!.full.p);
  });
});

// ---- the workspace scan ----

describe("axisOf and layOut", () => {
  it("lay the changes out by position from the earliest period, a gap being NaN", () => {
    const a = changes(series([1, 2, 4, 7]), "month");
    const b = changes(series([5, 6, 7, 9, 12, 20]), "month");
    const axis = axisOf([a, b], "month")!;
    expect(axis).toEqual({ span: "month", first: "2024-02-01", length: 5 });
    expect(layOut(a, axis).values).toEqual([1, 2, 3, NaN, NaN]);
    expect(layOut(b, axis).values).toEqual([1, 1, 2, 3, 8]);
    expect(layOut(b, axis).rho).toEqual(autocorrelations([1, 1, 2, 3, 8]));
    // The autocorrelations are read over the laid-out values: across a gap a delay of k is k periods.
    expect(layOut(a, axis).rho).toEqual(autocorrelations([1, 2, 3, NaN, NaN]));
  });
  it("have no axis for no changes, and count weeks, quarters and years by their own periods", () => {
    expect(axisOf([[], []], "month")).toBeNull();
    expect(axisOf([], "month")).toBeNull();
    const weeks = [{ period: "2026-01-05", value: 1 }, { period: "2026-02-02", value: 3 }];
    expect(axisOf([weeks], "week")).toEqual({ span: "week", first: "2026-01-05", length: 5 });
    expect(layOut(weeks, axisOf([weeks], "week")!).values).toEqual([1, NaN, NaN, NaN, 3]);
    const quarters = [{ period: "2025-01-01", value: 1 }, { period: "2026-01-01", value: 3 }];
    expect(axisOf([quarters], "quarter")!.length).toBe(5);
  });
});

describe("adjacent and capMetrics", () => {
  it("lets two Periods be compared when they are the same or one step apart, and no other", () => {
    const order = ["day", "week", "month", "quarter", "year"] as const;
    for (const x of order) for (const y of order) expect(adjacent(x, y), `${x} ${y}`).toBe(Math.abs(order.indexOf(x) - order.indexOf(y)) <= 1);
    // A half-year is a span of comparisons, not a Metric's Period.
    for (const x of order) { expect(adjacent("half", x)).toBe(false); expect(adjacent(x, "half")).toBe(false); }
    expect(adjacent("half", "half")).toBe(false);
  });
  it("keeps the most recently updated, the lower id first on a tie, and none for a count of 0 or less", () => {
    const ms = [{ id: 5, latest: "2026-01-01" }, { id: 3, latest: "2026-03-01" }, { id: 4, latest: "2026-03-01" }, { id: 1, latest: "2025-12-01" }, { id: 2, latest: "2026-02-01" }];
    expect(capMetrics(ms, 3).map((m) => m.id)).toEqual([3, 4, 2]);
    expect(capMetrics(ms, 5).map((m) => m.id)).toEqual([3, 4, 2, 5, 1]);
    expect(capMetrics(ms, 99).length).toBe(5);
    expect(capMetrics(ms, 0)).toEqual([]);
    expect(capMetrics(ms, -2)).toEqual([]);
    expect(capMetrics([], 3)).toEqual([]);
    expect(capMetrics(ms).length).toBe(5);
    expect(ms.map((m) => m.id)).toEqual([5, 3, 4, 1, 2]);
    expect(HEADS_UP.maxMetrics).toBe(200);
  });
});

describe("scanPairs over a Workspace's Metrics", () => {
  const month = (id: number) => ({ id, period: "month" as const });
  const data = (id: number, values: number[]) => series(values.map((v) => Math.round(v * 100) / 100));
  const walks = new Map<number, number[]>();
  const level = (id: number, n = 30) => {
    if (!walks.has(id)) { let v = 100; walks.set(id, noise(1000 + id, n).map((d) => (v += d))); }
    return walks.get(id)!;
  };
  const plain = (id: number) => data(id, level(id));
  const never = () => false;

  it("scans every pair once, the lower id first, on levels turned into changes", () => {
    const rows = scanPairs([month(3), month(1), month(2)], (id) => plain(id), never, "2026-07-15", 1);
    expect(rows.map((r) => [r.a, r.b, r.span])).toEqual([[1, 2, "month"], [1, 3, "month"], [2, 3, "month"]]);
    expect(rows.every((r) => r.full.n === 29 - Math.abs(r.full.lag) && r.through === "2026-06-01")).toBe(true);
    // The same as the pair scanned on its own.
    const [x, y] = [changes(plain(1), "month"), changes(plain(2), "month")];
    const axis = axisOf([x, y], "month")!;
    expect(rows[0]).toMatchObject({ full: scanPair(layOut(x, axis), layOut(y, axis), axis)!.full });
  });
  it("leaves out a pair that may not be compared (the same Period or one apart), a pair the caller says is related, and a Metric with no values", () => {
    const week = { id: 4, period: "week" as const };
    const day = { id: 5, period: "day" as const };
    const quarter = { id: 6, period: "quarter" as const };
    // The Metrics' levels on each Common Period: the same walk, with the dates of that Period (the last one in the same month as the others).
    const quarterly = (id: number) => level(id).map((value, i) => ({ period: shiftPeriod("2019-01-01", "quarter", i), value: Math.round(value * 100) / 100 }));
    const weekly = (id: number) => level(id).map((value, i) => ({ period: shiftPeriod("2026-04-13", "week", i - 29), value: Math.round(value * 100) / 100 }));
    const levelsOf = (id: number, span: string) => (id === 9 ? null : span === "quarter" ? quarterly(id) : span === "week" || span === "day" ? weekly(id) : plain(id));
    const rows = scanPairs([month(1), month(2), week, day, quarter, month(9)], levelsOf, (a, b) => a === 1 && b === 2, "2026-04-20", 1);
    const got = rows.map((r) => `${r.a}-${r.b}:${r.span}`);
    expect(got).toContain("1-4:month");
    expect(got).toContain("1-6:quarter");
    expect(got).toContain("4-5:week");
    expect(got).not.toContain("1-2:month");
    expect(got).not.toContain("1-5:month");
    expect(got).not.toContain("4-6:quarter");
    expect(got.some((g) => g.includes("9"))).toBe(false);
    // Which Period each pair is compared on: the longer.
    expect(rows.find((r) => r.a === 1 && r.b === 4)!.span).toBe("month");
    expect(rows.find((r) => r.a === 4 && r.b === 5)!.span).toBe("week");
  });
  it("uses only the latest 120 periods of a series", () => {
    const long = (id: number) => series(noise(2000 + id, 150).map((v) => Math.round(v * 100) / 100));
    const rows = scanPairs([month(1), month(2)], (id) => long(id), never, "2036-12-15", 1);
    expect(rows[0].full.n).toBe(119 - Math.abs(rows[0].full.lag));
    const a = changes(long(1).slice(-120), "month");
    expect(a.length).toBe(119);
  });
  it("leaves out a pair that is not current: its last period must be within 6 periods of today, 6 included", () => {
    const at = (today: string) => scanPairs([month(1), month(2)], (id) => plain(id), never, today, 1).length;
    // The series end in June 2026.
    expect(at("2026-06-20")).toBe(1);
    expect(at("2026-12-01")).toBe(1);
    expect(at("2026-12-31")).toBe(1);
    expect(at("2027-01-01")).toBe(0);
    expect(at("2030-01-01")).toBe(0);
    // A day in a period before the series ends is current.
    expect(at("2026-03-10")).toBe(1);
  });
  it("starts the Fiscal Year where the Workspace does, for quarters", () => {
    const q = (id: number) => ["2023-01-01", "2023-04-01", "2023-07-01", "2023-10-01", "2024-01-01", "2024-04-01", "2024-07-01", "2024-10-01", "2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"].map((period, i) => ({ period, value: Math.round(((i * 7 + id * 13) % 11) * 100 + i * i) / 10 }));
    const rows = (yearStart: number) => scanPairs([{ id: 1, period: "quarter" }, { id: 2, period: "quarter" }], (id) => q(id), never, "2026-09-01", yearStart as 1);
    expect(rows(1).length).toBe(1);
    expect(rows(1)[0].through).toBe("2026-04-01");
  });
  it("scans at most 20,000 pairs, the pairs of the lowest ids first", () => {
    const ms = Array.from({ length: 201 }, (_, i) => month(i + 1));
    const short = (id: number) => { let v = 100; return noise(3000 + id, 14).map((d) => (v += d)); };
    const rows = scanPairs(ms, (id) => data(id, short(id)), never, "2025-03-15", 1);
    // 201 Metrics have 20,100 pairs; only the first 20,000 are looked at, so the last pairs (the highest ids) are not.
    expect(rows.length).toBeLessThanOrEqual(HEADS_UP.maxPairs);
    expect(rows.length).toBeGreaterThan(15_000);
    expect(rows.some((r) => r.a >= 200)).toBe(false);
    expect(rows[0]).toMatchObject({ a: 1, b: 2 });
    expect(rows.some((r) => r.a === 1 && r.b === 201)).toBe(true);
  }, 120_000);
  it("is the same twice, whatever order the Metrics come in", () => {
    const ms = [month(4), month(2), month(3), month(1)];
    const [one, two] = [scanPairs(ms, (id) => plain(id), never, "2026-07-15", 1), scanPairs([...ms].reverse(), (id) => plain(id), never, "2026-07-15", 1)];
    expect(one).toEqual(two);
    expect(shiftPeriod("2026-06-01", "month", 0)).toBe(periodStart("2026-06-20", "month", 1));
  });
});

// ---- what the mutation testing asked for ----

describe("the edges of the scan, each with its expected value worked out by hand", () => {
  const tens = (n: number) => Array.from({ length: n }, () => 0.1);
  /** Changes laid out with autocorrelations given, to put the effective count exactly where a rule changes. */
  const withRho = (v: number[], rho: number[]): Laid => ({ values: v, rho });
  const flat = (...head: number[]) => [...head, ...Array(12 - head.length).fill(0)];

  it("starts an axis at the earliest period whatever order the series come in", () => {
    expect(axisOf([[{ period: "2024-03-01", value: 1 }, { period: "2024-01-01", value: 2 }]], "month")).toEqual({ span: "month", first: "2024-01-01", length: 3 });
  });
  it("finds a series that does not change although 0.1 twelve times does not add to 1.2 exactly: no pair, whichever series it is, and a half of it has no r", () => {
    const noisy = noise(5, 12);
    expect(scan(tens(12), noisy)).toBeNull();
    expect(scan(noisy, tens(12))).toBeNull();
    const [first, second] = [scan([...tens(12), ...noise(6, 12)], noise(7, 24))!, scan(noise(8, 24), [...tens(12), ...noise(9, 12)])!];
    expect(first.full.rFirst).toBeNull();
    expect(first.full.rSecond).not.toBeNull();
    expect(second.full.rFirst).toBeNull();
    expect(second.full.rSecond).not.toBeNull();
  });
  it("gives the sign of a correlation of exactly 0 as positive, and no sign where nothing changes", () => {
    // n·Σxy − Σx·Σy = 3 · 10 − 6 · 5 = 0, with Sxx = 6 and Syy = 2.
    expect(exactAtLeast([1, 2, 3], [2, 1, 2], 7, 10)).toEqual({ atLeast: false, sign: 1 });
  });
  it("counts the pairs with a number in them only: a value that is not a number takes its pair out of the halves too", () => {
    const [a, b] = [[...noise(31, 30)], [...noise(32, 30)]];
    a[3] = Infinity;
    b[4] = -Infinity;
    a[5] = NaN;
    const got = scanPair(laid(a), laid(b), axisOfLength(30))!;
    expect(got.full.rFirst).not.toBeNull();
    expect(got.full.rSecond).not.toBeNull();
    const only = [...noise(33, 30)];
    only[2] = NaN;
    expect(scanPair(laid(only), laid(noise(34, 30)), axisOfLength(30))!.full.rFirst).not.toBeNull();
  });
  it("gives a chance of 1 for a window worth under 4 independent pairs, takes the first delay when every delay says 1, and is not met", () => {
    const ramp = (seed: number, step: number) => noise(seed, 40, 0.01).map((d, i) => step * i + d);
    // Each follows its own past closely (autocorrelations of 0.9): 39 pairs are worth under 2.
    const own = Array(12).fill(0.9);
    const got = scanPair(withRho(ramp(73, 1), own), withRho(ramp(74, -0.5), own), axisOfLength(40))!;
    expect(got.full.nEff).toBeLessThan(4);
    expect(got.full.pDelays).toBe(1);
    expect(got.full.lag).toBe(0);
    // r is exactly strong in the whole and in both halves, so only the chance keeps it from meeting the conditions.
    expect(got.full.r).toBeLessThan(-0.99);
    expect(got.full.meets).toBe(false);
  });
  it("reads an effective count of exactly 4 as enough for a chance (1 − |r| with 2 degrees of freedom), the halves' too, and the drop's", () => {
    const [x, y] = [noise(41, 12), noise(42, 12)];
    // ρ = 0.5 at four delays: 12 ÷ (1 + 2 · 4 · 0.25) = 4 for the whole window.
    const whole = scanPair(withRho(x, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]), withRho(y, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]), axisOfLength(12))!;
    expect(whole.full.nEff).toBe(4);
    expect(whole.full.pDelays).toBeCloseTo(1 - Math.abs(whole.full.r), 12);
    // ρ1 = 0.5 only: 12 ÷ 1.5 = 8 for the whole, and 6 ÷ 1.5 = 4 for each half.
    const halves = scanPair(withRho(x, flat(0.5)), withRho(y, flat(0.5)), axisOfLength(12))!;
    expect(halves.full.nEff).toBe(8);
    const [h1, h2] = [halves.full.rFirst!, halves.full.rSecond!];
    expect(halves.full.p).toBeCloseTo(Math.max(halves.full.pDelays, 1 - Math.abs(h1), 1 - Math.abs(h2)), 12);
    expect(halves.full.p).toBeLessThan(1);
    // Before the last 6 periods there are 12 pairs: 12 ÷ 3 = 4, and the chance of a drop is then a number under 1.
    const [u, v] = [noise(43, 18), noise(44, 18)];
    const drop = scanPair(withRho(u, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]), withRho(v, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]), axisOfLength(18))!;
    expect(drop.before!.nEff).toBe(4);
    expect(drop.before!.recent!.dropP).toBeLessThan(1);
  });
  it("decides the last 6 periods exactly: r² = 9/100 is 0.29999999999999993 as a double and is not under 0.3; and 'low' is only worked out for an earlier history that met the conditions", () => {
    const planted = (xTail: number[], yTail: number[]) => {
      const [a, b] = [noise(95, 30), follows(noise(95, 30), 0, 96, 0.2)];
      a.splice(24, 6, ...xTail);
      b.splice(24, 6, ...yTail);
      return scan(a, b)!;
    };
    const exactly = planted([0, 0, 2, 1, 1, 0], [-3, 3, -3, -2, 1, -2]);
    expect(exactly.before!.meets).toBe(true);
    expect(Math.abs(exactly.before!.recent!.r)).toBeLessThan(0.3);
    expect(exactly.before!.recent!.low).toBe(false);
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const got = scan(noise(seed, 47), noise(seed + 100, 47))!;
      expect(got.before!.meets, `seed ${seed}`).toBe(false);
      expect(got.before!.recent!.low, `seed ${seed}`).toBe(false);
    }
  });
  it("is not made strong by values that only a far-off check sees: two huge changes of opposite sign, one in each half, make r high and leave nothing when taken out", () => {
    const z = normals(61);
    const [x, y] = [Array.from({ length: 30 }, z), Array.from({ length: 30 }, z)];
    [x[5], y[5], x[22], y[22]] = [100, 100, -100, -100];
    const got = scan(x, y)!;
    expect(got.full.r).toBeGreaterThan(0.99);
    expect(got.full.p).toBeLessThan(HEADS_UP.rate);
    expect(got.full.rFirst!).toBeGreaterThan(0.7);
    expect(got.full.rSecond!).toBeGreaterThan(0.7);
    expect(got.full.meets).toBe(false);
  });
  it("orders the Metrics to look at by how recent, then by id, whatever order they come in (generated)", () => {
    const m = fc.array(fc.record({ id: fc.integer({ min: 1, max: 40 }), latest: fc.constantFrom("2026-01-01", "2026-02-01", "2026-03-01") }), { maxLength: 25 }).map((ms) => [...new Map(ms.map((x) => [x.id, x])).values()]);
    fc.assert(
      fc.property(m, fc.integer({ min: -1, max: 30 }), (metrics, most) => {
        const want = [...metrics].sort((p, q) => (p.latest === q.latest ? p.id - q.id : p.latest < q.latest ? 1 : -1)).slice(0, Math.max(0, most));
        expect(capMetrics(metrics, most)).toEqual(want);
      }),
      { numRuns, seed },
    );
  });
  it("has no pair where no Metric of a Common Period has a change, and still pairs the rest", () => {
    const levelsOf = (id: number) => (id <= 2 ? series([5]) : series(noise(id, 30).map((v) => Math.round(v * 100) / 100)));
    const metrics = [1, 2, 3, 4].map((id) => ({ id, period: "month" as const }));
    const rows = scanPairs(metrics, (id) => levelsOf(id), () => false, "2026-07-15", 1);
    expect(rows.map((r) => [r.a, r.b])).toEqual([[3, 4]]);
    expect(scanPairs(metrics.slice(0, 2), (id) => levelsOf(id), () => false, "2026-07-15", 1)).toEqual([]);
  });
});
