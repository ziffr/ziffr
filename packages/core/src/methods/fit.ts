// The multiple fit and what follows from it (GLOSSARY: Takeaway; spec 0041, "Fit": ticket 4): which of several Metrics
// moves a target with the others held the same (`fit`, `importance`), what the target is likely to be for given values of
// the drivers (`predict`) and what a driver would need to be to reach a goal (`needs`). Pure.
//
// What is exact. A straight line a + b₁x₁ + … + b_kx_k is fitted by least squares through the normal equations, worked out
// on fractions of the values' text (exact.ts, BigInt): the sums about the means, their inverse by Gauss-Jordan elimination,
// the effects b, the sum of squared misses (SSE = Syy − b·Sxy), how much is explained, every driver's share of that by
// averaging over every order of adding the drivers (LMG, from the explained share of every subset), the variance inflation
// that says drivers cannot be told apart (above 5) and the partial correlation a strength word is read from. Only the last
// step to a double, a square root and the t quantile of a range (distributions.ts) are not exact. Where the data cannot
// carry a fit the Method says so in words (a refusal from suitability.ts, or two drivers that are exactly one), and never
// gives a number.
//
// Held fixed: an effect is the change in the target per unit of its driver with the other drivers held the same. Drivers
// that move so closely that the fit cannot tell them apart (variance inflation above 5, or exactly in step) are treated as
// one: of the pair with the closest link, the one with the weaker link to the target is left out, and the fit says so.
// Outside what was seen: a range is not offered for a value outside what the driver has been (rule 7).
//
// The ranges are the 80 % ranges ("likely between"): an effect b ± t·SE, and a value ŷ ± t·σ·√(1 + h) with h the leverage of
// the driver values (h = 1/n + (x − x̄)ᵀ·Sxx⁻¹·(x − x̄)); t is the 90 % point of the t curve with n − k − 1 degrees of freedom.
// `needs` is `predict` turned round: the goal's range is the set of driver values whose predicted range holds the goal,
// which is a quadratic in the driver value, and it is bounded only where the effect is clear (b² > t²·σ²·(Sxx⁻¹)_jj).
import { basisFor, changes, readSeries, type Basis } from "../basis";
import { fractionOf, lowestTerms, minus, nearest, over, plus, scaled, times, type Fraction } from "../exact";
import { shiftPeriod, type Span } from "../periods";
import { checkSuitability, SUITABILITY, type Finding, type SuitabilityInputs, type Verdict } from "../suitability";
import { strengthOf, type StrengthWord } from "../takeaways/strength";
import type { Point } from "../types";
import { tQuantile } from "./distributions";

/** How many periods a driver's partial link is judged on: the periods less the drivers held fixed (n − (k − 1)), so that the
 * Fisher z of the link has n − k − 2 degrees. */
export const partialPeriods = (n: number, k: number): number => n - k + 1;

/** The most periods a fit uses: the latest ones (spec 0041, "Limits"). */
export const MOST_PERIODS = 120;
/** The share of what a fit explains a driver's own range is cut at: the 80 % range is the 90 % point of the t curve. */
export const RANGE_POINT = 0.9;
/** Drivers whose variance inflation is above this cannot be told apart and are treated as one (spec 0041, rule 6). */
export const MOST_INFLATION = 5;

const [ZERO, ONE, TEN] = [BigInt(0), BigInt(1), BigInt(10)];
type F = Fraction;
const zero: F = { num: ZERO, den: ONE };
const whole = (n: number | bigint): F => ({ num: BigInt(n), den: ONE });
const add = (a: F, b: F) => lowestTerms(plus(a, b));
const sub = (a: F, b: F) => lowestTerms(minus(a, b));
const mul = (a: F, b: F) => lowestTerms(times(a, b));
const div = (a: F, b: F) => lowestTerms(over(a, b));
const total = (fs: F[]) => fs.reduce(add, zero);
const isZero = (a: F) => a.num === ZERO;
const cmp = (a: F, b: F) => {
  const [l, r] = [a.num * b.den, b.num * a.den];
  return l < r ? -1 : l > r ? 1 : 0;
};
/** A double that is exactly the nearest double of a fraction, or NaN where it is out of range (the square of a huge value). */
const dbl = nearest;
const root = (a: F) => Math.sqrt(dbl(a));

// ---- linear algebra on fractions ----

// The inverse of a square matrix by Gauss-Jordan elimination, or null where it has none (a column is a mix of the others).
function invert(m: F[][]): F[][] | null {
  const k = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? whole(1) : zero))]);
  for (let c = 0; c < k; c++) {
    let p = c;
    while (p < k && isZero(a[p][c])) p++;
    if (p === k) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const pivot = a[c];
    const scaled = pivot.map((v) => div(v, pivot[c]));
    a[c] = scaled;
    for (let r = 0; r < k; r++) {
      if (r === c || isZero(a[r][c])) continue;
      const f = a[r][c];
      a[r] = a[r].map((v, j) => sub(v, mul(f, scaled[j])));
    }
  }
  return a.map((row) => row.slice(k));
}

// How many columns of a matrix are independent, by elimination on fractions.
function rankOf(m: F[][]): number {
  const a = m.map((row) => [...row]);
  let rank = 0;
  const cols = a[0].length;
  for (let c = 0; c < cols; c++) {
    let p = rank;
    while (p < a.length && isZero(a[p][c])) p++;
    if (p === a.length) continue;
    [a[rank], a[p]] = [a[p], a[rank]];
    for (let r = rank + 1; r < a.length; r++) {
      const f = div(a[r][c], a[rank][c]);
      a[r] = a[r].map((v, j) => sub(v, mul(f, a[rank][j])));
    }
    rank++;
  }
  return rank;
}

// ---- the moments of the rows and the solved fit ----

/** One period of a fit, in the numbers it is fitted on: the target and each driver (changes where compared by change). */
export type FitRow = { period: string; y: number; x: number[] };

// The sums about the means as fractions (`sxx`, `sxy`, `syy`), and as the whole numbers G = n·S·10^(places), whose ratios are the
// same and which need no reduction: the explained share of a subset of the drivers is worked out from their determinants.
type Moments = { n: number; mx: F[]; my: F; sxx: F[][]; sxy: F[]; syy: F; gxx: bigint[][]; gxy: bigint[]; gyy: bigint };

// The values of a column as whole numbers at one scale, so a sum of products is a BigInt sum: value = ints[i] / 10^places.
function column(values: number[]): { ints: bigint[]; places: number } {
  const parts = values.map(scaled);
  const places = Math.max(...parts.map((p) => p.places));
  return { ints: parts.map((p) => p.digits * TEN ** BigInt(places - p.places)), places };
}

// n·S_ab = n·Σ a·b − Σa·Σb on whole numbers, so S_ab = that ÷ (n · 10^(places a + places b)).
function moments(rows: FitRow[], cols: number[]): Moments {
  const n = rows.length;
  const big = BigInt(n);
  const xs = cols.map((c) => column(rows.map((r) => r.x[c])));
  const y = column(rows.map((r) => r.y));
  const all = [...xs, y];
  const sums = all.map((a) => a.ints.reduce((s, v) => s + v, ZERO));
  const cross = (i: number, j: number): bigint => big * all[i].ints.reduce((s, v, r) => s + v * all[j].ints[r], ZERO) - sums[i] * sums[j];
  const about = (i: number, j: number): F => lowestTerms({ num: cross(i, j), den: big * TEN ** BigInt(all[i].places + all[j].places) });
  const k = cols.length;
  const mean = (i: number): F => lowestTerms({ num: sums[i], den: big * TEN ** BigInt(all[i].places) });
  return {
    n,
    mx: xs.map((_, i) => mean(i)),
    my: mean(k),
    sxx: xs.map((_, i) => xs.map((_c, j) => about(i, j))),
    sxy: xs.map((_, i) => about(i, k)),
    syy: about(k, k),
    gxx: xs.map((_, i) => xs.map((_c, j) => cross(i, j))),
    gxy: xs.map((_, i) => cross(i, k)),
    gyy: cross(k, k),
  };
}

type Solved = { m: F[][]; beta: F[]; intercept: F; sse: F };

// The effects b = Sxx⁻¹·Sxy, the intercept ȳ − b·x̄ and SSE = Syy − b·Sxy; null where the drivers cannot be told apart.
function solve(mo: Moments): Solved | null {
  const m = invert(mo.sxx);
  if (!m) return null;
  const beta = m.map((row) => total(row.map((v, j) => mul(v, mo.sxy[j]))));
  const intercept = sub(mo.my, total(beta.map((b, j) => mul(b, mo.mx[j]))));
  return { m, beta, intercept, sse: sub(mo.syy, total(beta.map((b, j) => mul(b, mo.sxy[j])))) };
}

// The determinant of a symmetric matrix of sums about the means, bordered or not, by Bareiss' fraction-free elimination (every
// division is exact). The leading minors of such a matrix of drivers that cannot be told apart from none are above 0, so no
// pivot is 0 and no rows are swapped; the last number is the determinant, which is 0 for the bordered matrix of an exact fit.
function determinant(m: bigint[][]): bigint {
  const a = m.map((row) => [...row]);
  const size = a.length;
  let before = ONE;
  // Stryker disable next-line EqualityOperator: at k = size − 1 the inner loops are empty and `before` is not read again, so one more step changes nothing
  for (let k = 0; k < size - 1; k++) {
    for (let i = k + 1; i < size; i++) for (let j = k + 1; j < size; j++) a[i][j] = (a[i][j] * a[k][k] - a[i][k] * a[k][j]) / before;
    before = a[k][k];
  }
  return a[size - 1][size - 1];
}

// How much of the variation the drivers `subset` (indices) explain, exactly: 1 − SSE ÷ Syy, where the determinant of the sums
// of the drivers with the target is the determinant of the sums of the drivers times SSE (the Schur complement), so
// SSE ÷ Syy = det(with target) ÷ (det(drivers) · Gyy) on the whole numbers G.
function explained(mo: Moments, subset: number[]): F {
  if (subset.length === 0) return zero;
  const g = subset.map((i) => subset.map((j) => mo.gxx[i][j]));
  const bordered = [...g.map((row, a) => [...row, mo.gxy[subset[a]]]), [...subset.map((i) => mo.gxy[i]), mo.gyy]];
  const [top, bottom] = [determinant(bordered), determinant(g) * mo.gyy];
  return { num: bottom - top, den: bottom };
}

// Every driver's share of what is explained, averaged over every order of adding the drivers (LMG): the rise of the
// explained share when it joins a subset, weighted by how many orders put exactly that subset first, |S|!·(k − |S| − 1)! ÷ k!.
// The sums are left unreduced (no greatest common divisor of numbers hundreds of digits long: a fraction is as exact
// unreduced), and only turned into a double at the end.
function lmg(mo: Moments): { shares: F[]; all: F } {
  const k = mo.sxx.length;
  // Stryker disable next-line EqualityOperator: 0! and 1! are both 1, so `n < 1` gives the same factorials
  const fact = (n: number): bigint => (n <= 1 ? ONE : BigInt(n) * fact(n - 1));
  const r2 = Array.from({ length: 1 << k }, (_, mask) => explained(mo, Array.from({ length: k }, (_, i) => i).filter((i) => mask & (1 << i))));
  const shares = Array.from({ length: k }, (_, j) => {
    let sum = zero;
    for (let mask = 0; mask < 1 << k; mask++) {
      // Stryker disable next-line ConditionalExpression: a subset that already holds the driver adds 0 (the same share twice), so counting it changes nothing
      if (mask & (1 << j)) continue;
      const size = Array.from({ length: k }, (_, i) => mask & (1 << i)).filter(Boolean).length;
      sum = plus(sum, times({ num: fact(size) * fact(k - size - 1), den: fact(k) }, minus(r2[mask | (1 << j)], r2[mask])));
    }
    return sum;
  });
  // The shares add up to what all the drivers explain: the last subset.
  return { shares, all: r2[(1 << k) - 1] };
}

// ---- what a fit holds ----

/** One driver in a fit. Every number is in the driver's and the target's own units, per one unit of the driver. */
export type FitDriver = {
  name: string;
  /** How much the target changes per unit of this driver with the others held the same. */
  effect: number;
  /** The 80 % range of the effect ("likely between"). */
  lo: number;
  hi: number;
  /** Its share of what the fit explains, from 0 to 1; the shares add up to 1 (all 0 where nothing is explained). */
  share: number;
  /** The same as a share of all the variation, from 0 to 1. */
  explains: number;
  /** The link to the target with the other drivers held fixed (the partial correlation), from −1 to 1. */
  partial: number;
  /** The strength word of that link (rule 4), judged on the periods less the drivers held fixed. */
  strength: StrengthWord;
  /** The variance inflation: 1 for a driver that moves on its own, above 5 for one that cannot be told apart from the others. */
  inflation: number;
  /** The lowest, the highest and the latest value the driver had in the periods used. */
  low: number;
  high: number;
  latest: number;
  /** The driver's standard deviation over the periods used. */
  spread: number;
};

/** Drivers treated as one: the driver that stays and the ones that move so closely with it that they cannot be told apart. */
export type Merged = { kept: string; with: string[] };

/** A fit that was made: the model in numbers, the periods it is made of (so `predict` and `needs` work it out again
 * exactly), what the checks found, and what was left out or merged. */
export type Fit = {
  ok: true;
  basis: Basis;
  span: Span;
  target: string;
  drivers: FitDriver[];
  merged: Merged[];
  /** Drivers whose inflation is above 5 with no pair to merge them (a mix): kept in the fit, said, never strong. */
  crowded: string[];
  /** The periods used, oldest first, with the numbers they were fitted on. */
  rows: FitRow[];
  /** The levels (as the Metrics have them) at the last period: the point a change basis counts from. */
  last: { y: number; x: number[] };
  n: number;
  /** Degrees of freedom: periods less drivers less one. */
  df: number;
  from: string;
  to: string;
  intercept: number;
  /** How much of the target's variation the drivers explain, from 0 to 1. */
  explained: number;
  /** The typical miss (the standard deviation of what the fit leaves over), in the target's unit. */
  miss: number;
  verdict: Verdict;
};
/** A fit that was not made, in words (Findings the Takeaway layer writes). It carries no number. */
export type Refused = { ok: false; refusals: Finding[] };

/** What a fit takes: the target and its drivers as series, the period, and optionally the basis and the Metrics (for the
 * mixed-periods check). */
export type FitInput = {
  target: { name: string; points: Point[] };
  /** `id` (a Metric's) breaks a tie between drivers exactly in step, so that their order in the list changes nothing. */
  drivers: { name: string; points: Point[]; id?: number }[];
  span: Span;
  basis?: Basis;
  metrics?: SuitabilityInputs["metrics"];
};

/** Whether to compare on changes: the target has a clear trend and at least one driver has (only then can a shared trend make
 * a link look real); else on values. A function of the series and the period only. */
export function fitBasis(target: Point[], drivers: Point[][], span: Span): Basis {
  const trends = (p: Point[]) => basisFor(p, p, span) === "changes";
  return trends(target) && drivers.some(trends) ? "changes" : "values";
}

// A series on the basis a fit uses.
const onBasis = (points: Point[], span: Span, basis: Basis) => (basis === "changes" ? changes(points, span) : readSeries(points));

type Prepared = {
  basis: Basis;
  rows: FitRow[];
  series: { name: string; points: Point[] }[];
  last: { y: number; x: number[] };
};

// The series on their basis, the periods all of them have (the latest 120), the window they are judged over, and the levels at the end.
function prepare(input: FitInput): Prepared {
  const { span } = input;
  const all = [input.target, ...input.drivers];
  const basis = input.basis ?? fitBasis(input.target.points, input.drivers.map((d) => d.points), span);
  const series = all.map((s) => ({ name: s.name, points: onBasis(s.points, span, basis) }));
  const by = series.map((s) => new Map(s.points.map((p) => [p.period, p.value])));
  const common = series[0].points.map((p) => p.period).filter((p) => by.every((m) => m.has(p))).slice(-MOST_PERIODS);
  const rows = common.map((period) => ({ period, y: by[0].get(period)!, x: by.slice(1).map((m) => m.get(period)!) }));
  // Nothing in common: no rows, and the checks say how many periods that is.
  // Stryker disable next-line ArrayDeclaration,ObjectLiteral,ConditionalExpression: with no rows the checks refuse before the series or the last levels are read, so leaving this return out gives the same refusal
  if (common.length === 0) return { basis, rows, series, last: { y: NaN, x: [] } };
  // The checks judge the series over the periods all of them have, first to last (the latest 120): a gap is a period inside that
  // none of them is allowed to lack, and values outside it are nobody's to judge.
  const [from, to] = [common[0], common[common.length - 1]];
  const levels = all.map((s) => new Map(readSeries(s.points).map((p) => [p.period, p.value])));
  return {
    basis,
    rows,
    series: series.map((s) => ({ name: s.name, points: s.points.filter((p) => p.period >= from && p.period <= to) })),
    last: { y: levels[0].get(to)!, x: levels.slice(1).map((m) => m.get(to)!) },
  };
}

// The drivers that stay, and the ones left out as one with another, until none has a variance inflation above 5.
type Reduced = { cols: number[]; mo: Moments; sol: Solved; merged: Merged[]; crowded: string[] } | { refusals: Finding[] };

/** Above this inflation, drivers that no pair describes cannot be told apart at all and the fit is refused; between 5 and this it is made
 * and says which drivers are crowded (their separate effects are less certain, which their ranges show). */
export const REFUSE_INFLATION = 10;

/** The drivers that make up a near-dependency, from the inverse of the sums about the means (`m`) and their diagonal (`diag`, each
 * driver's own sum): the direction of least variance of the correlation matrix (the top direction of its inverse, by power iteration)
 * and the drivers that load on it (at least 5 % of it), never fewer than two, so that a group is never one driver alone. */
export function groupOf(m: Fraction[][], diag: Fraction[]): number[] {
  const k = m.length;
  const size = diag.map((d) => root(d));
  const inverse = m.map((row, i) => row.map((v, j) => dbl(v) * size[i] * size[j]));
  // Stryker disable next-line ArithmeticOperator: any start that is not at right angles to the top direction reaches it
  let v = Array.from({ length: k }, (_, i) => 1 + i / 100);
  // Stryker disable next-line EqualityOperator: 200 steps are far beyond convergence, so one more changes nothing
  for (let n = 0; n < 200; n++) {
    // Stryker disable next-line ArithmeticOperator: with the sign of the sum turned, every step turns v round and the squares of its entries, which are the loads, are the same
    const w = inverse.map((row) => row.reduce((t, x, j) => t + x * v[j], 0));
    const length = Math.sqrt(w.reduce((t, x) => t + x * x, 0));
    v = w.map((x) => x / length);
  }
  const load = v.map((x) => x * x);
  const order = load.map((_, i) => i).sort((a, b) => load[b] - load[a]);
  // Stryker disable next-line EqualityOperator: a load of exactly 5 % is a knife-edge no data reaches
  return order.filter((i, rank) => rank < 2 || load[i] > 0.05);
}

function reduce(rows: FitRow[], names: string[], k: number, ranks: number[]): Reduced {
  let cols = Array.from({ length: k }, (_, i) => i);
  const withs: string[][] = names.map(() => []);
  for (;;) {
    const mo = moments(rows, cols);
    const flat = cols.findIndex((_, i) => isZero(mo.sxx[i][i]));
    if (flat >= 0) return { refusals: [{ case: "refuse-vary", slots: { name: names[cols[flat]] } }] };
    if (isZero(mo.syy)) return { refusals: [{ case: "refuse-vary", slots: { name: names[names.length - 1] } }] };
    const sol = solve(mo);
    const idx = cols.map((_, i) => i);
    // Two drivers' link to each other, squared: S_ij² ÷ (S_ii·S_jj).
    const link = (i: number, j: number) => div(mul(mo.sxx[i][j], mo.sxx[i][j]), mul(mo.sxx[i][i], mo.sxx[j][j]));
    let pair: [number, number] | null = null;
    if (!sol) {
      // No inverse: a pair exactly in step (link 1) is one driver; a mix of three or more has no pair to name and refuses.
      pair = idx.flatMap((i) => idx.filter((j) => j > i && cmp(link(i, j), whole(1)) === 0).map((j): [number, number] => [i, j]))[0] ?? null;
      if (pair === null) {
        // A driver is part of a mix when taking its column out leaves the rank as it was (it is made of the others).
        const rank = rankOf(mo.sxx);
        const mix = idx.filter((i) => rankOf(mo.sxx.map((row) => row.filter((_, c) => c !== i))) === rank);
        return { refusals: [{ case: "refuse-drivers-collinear", slots: { names: mix.map((i) => names[cols[i]]).join(", ") } }] };
      }
    } else {
      const inflation = idx.map((i) => mul(sol.m[i][i], mo.sxx[i][i]));
      // Stryker disable next-line EqualityOperator: an inflation of exactly 5 is a knife-edge only a hand-made pair reaches, and it is tested
      const high = idx.filter((i) => cmp(inflation[i], whole(MOST_INFLATION)) > 0);
      const merged = names.flatMap((n, i) => (withs[i].length > 0 ? [{ kept: n, with: withs[i] }] : []));
      if (high.length === 0) return { cols, mo, sol, merged, crowded: [] };
      // A pair is one driver where their link alone is as close as an inflation of 5: r² above 4/5. Drivers whose inflation is high
      // only together (one is about the sum of two others, each pair linked by r² of 0.67) are a mix that no pair describes.
      // Stryker disable next-line EqualityOperator: a pair linked by exactly 4/5 (an inflation of exactly 5 for the pair alone) is on the edge, and only a third driver would make it count
      const close = idx.flatMap((i) => idx.filter((j) => j > i && cmp(link(i, j), { num: BigInt(4), den: BigInt(5) }) > 0).map((j): [number, number] => [i, j]));
      if (close.length === 0) {
        // No pair to merge. Far above 5 no effect of the group can be told apart: refused, naming every driver that loads on the
        // near-dependency. Between 5 and that the fit is made, with the crowded drivers named so that nobody reads their effects as clean.
        // Stryker disable next-line EqualityOperator: an inflation of exactly 10 is a knife-edge no data reaches
        if (inflation.some((v) => cmp(v, whole(REFUSE_INFLATION)) > 0)) return { refusals: [{ case: "refuse-drivers-mix", slots: { names: groupOf(sol.m, mo.sxx.map((r, i) => r[i])).map((i) => names[cols[i]]).sort().join(", ") } }] };
        // Named with the others that load on the same near-dependency, so that it is never one driver 'moving with' itself.
        return { cols, mo, sol, merged, crowded: [...new Set([...high, ...groupOf(sol.m, mo.sxx.map((r, i) => r[i]))])].map((i) => names[cols[i]]).sort() };
      }
      // Stryker disable next-line EqualityOperator,ConditionalExpression: of two close pairs either is merged first, and the other is merged next, to the same result
      pair = close.reduce((x, y) => (cmp(link(y[0], y[1]), link(x[0], x[1])) > 0 ? y : x));
    }
    // The pair's driver with the weaker link to the target goes; on a tie (exactly in step) the one first in `ranks` (the Metric with the
    // lower id) stays, so the order the drivers were listed in changes nothing: r² to the target is S_iy² ÷ (S_ii·Syy).
    const [a, b] = pair;
    const stronger = cmp(mul(mul(mo.sxy[a], mo.sxy[a]), mo.sxx[b][b]), mul(mul(mo.sxy[b], mo.sxy[b]), mo.sxx[a][a]));
    // Stryker disable next-line EqualityOperator: ranks differ between drivers, and a stronger link of exactly 0 is the tie handled by the first test
    const [keep, drop] = (stronger === 0 ? ranks[cols[a]] < ranks[cols[b]] : stronger > 0) ? [a, b] : [b, a];
    withs[cols[keep]] = [...withs[cols[keep]], names[cols[drop]], ...withs[cols[drop]]];
    withs[cols[drop]] = [];
    cols = cols.filter((_, i) => i !== drop);
  }
}

// The 80 % range of a driver's effect, and of a value, from the t curve and the exact variances.
function spreadOf(mo: Moments, sol: Solved) {
  const df = mo.n - mo.sxx.length - 1;
  const t = tQuantile(RANGE_POINT, df);
  // σ² = SSE ÷ df; the variance of an effect is σ²·(Sxx⁻¹)_jj.
  const sigma2 = div(sol.sse, whole(df));
  return { df, t, sigma2 };
}

const finiteAll = (xs: number[]) => xs.every((v) => Number.isFinite(v));

/** The most periods a fit with these rows may leave out when a far-off value is judged: the fit is made again without them. */
type Headline = { value: number; range: number } | null;

// The result of the fit without the periods in `left`, for the far-off check: the top driver's effect and the width of its range.
function without(rows: FitRow[], cols: number[], left: ReadonlySet<string>, top: number): Headline {
  // At most 3 periods are left out of at least 12, so degrees of freedom remain; the fit may have none without them where a driver
  // was exactly in step with another only on those periods (the inverse does not exist then).
  const mo = moments(rows.filter((r) => !left.has(r.period)), cols);
  const sol = solve(mo);
  if (!sol) return null;
  const { t, sigma2 } = spreadOf(mo, sol);
  const half = t * root(mul(sigma2, sol.m[top][top]));
  return { value: dbl(sol.beta[top]), range: 2 * half };
}

/** What a fit is made of in numbers: its drivers, what was treated as one, the periods and the totals. */
export type Core = Pick<Fit, "drivers" | "merged" | "crowded" | "rows" | "n" | "df" | "from" | "to" | "intercept" | "explained" | "miss">;

/** The numbers of a fit on rows, with no checks (the references and the textbook datasets are held to this; every Method
 * goes through `fit`, which runs the checks first): `names` are the drivers' then the target's, `k` the number of drivers.
 * `cols` are the drivers that stayed and `misses` the fit's misses with the level they belong to. */
export function fitNumbers(rows: FitRow[], names: string[], k: number, ranks: number[] = names.map((_, i) => i)): { core: Core; cols: number[]; misses: { level: number; miss: number }[] } | Refused {
  const red = reduce(rows, names, k, ranks);
  if ("refusals" in red) return { ok: false, refusals: red.refusals };
  const { cols, mo, sol, merged, crowded } = red;
  const { df, t, sigma2 } = spreadOf(mo, sol);
  const { shares, all: explainedAll } = lmg(mo);
  const n = mo.n;
  const spread = (i: number) => root(div(mo.sxx[i][i], whole(n - 1)));
  const drivers: FitDriver[] = cols.map((c, i) => {
    const effect = dbl(sol.beta[i]);
    const half = t * root(mul(sigma2, sol.m[i][i]));
    // The link with the others held fixed: r² = b² ÷ (b² + SSE·(Sxx⁻¹)_jj), with the sign of the effect.
    const b2 = mul(sol.beta[i], sol.beta[i]);
    const den = add(b2, mul(sol.sse, sol.m[i][i]));
    const partial = isZero(den) ? 0 : (sol.beta[i].num < ZERO ? -1 : 1) * root(div(b2, den));
    const xs = rows.map((r) => r.x[c]);
    return {
      name: names[c],
      effect,
      lo: effect - half,
      hi: effect + half,
      share: isZero(explainedAll) ? 0 : dbl(div(shares[i], explainedAll)),
      explains: dbl(shares[i]),
      partial,
      // The Fisher z of a partial correlation holds the other drivers fixed: n − (k − 1) − 3 degrees.
      // Never strong for a crowded driver: its effect is less certain, and whoever reads the fit reads that here.
      strength: strengthOf(partial, partialPeriods(n, cols.length), crowded.includes(names[c])),
      inflation: dbl(mul(sol.m[i][i], mo.sxx[i][i])),
      low: Math.min(...xs),
      high: Math.max(...xs),
      latest: xs[xs.length - 1],
      spread: spread(i),
    };
  });
  const miss = root(sigma2);
  const intercept = dbl(sol.intercept);
  const explainedShare = dbl(div(sub(mo.syy, sol.sse), mo.syy));
  if (!finiteAll([intercept, miss, explainedShare, ...drivers.flatMap((d) => [d.effect, d.lo, d.hi, d.share, d.explains, d.partial, d.inflation, d.spread])])) return { ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] };
  const misses = rows.map((r) => {
    // Unreduced: a fraction is as exact unreduced, and the greatest common divisor of numbers this long costs more than the sum.
    const fitted = cols.reduce((sum, c, i) => plus(sum, times(sol.beta[i], fractionOf(r.x[c]))), sol.intercept);
    return { level: dbl(fitted), miss: dbl(minus(fractionOf(r.y), fitted)) };
  });
  const core: Core = {
    drivers,
    merged,
    crowded,
    rows: rows.map((r) => ({ period: r.period, y: r.y, x: cols.map((c) => r.x[c]) })),
    n,
    df,
    from: rows[0].period,
    to: rows[rows.length - 1].period,
    intercept,
    explained: explainedShare,
    miss,
  };
  return { core, cols, misses };
}

// The words about gaps for series of changes.
const CHANGE_CASES: Record<string, Finding["case"]> = { "caution-gaps": "caution-gaps-change", "refuse-gaps": "refuse-gaps-change", "refuse-gap-run": "refuse-gap-run-change" };
// The periods of a series that have no value within the periods a fit uses.
function missingLevels(points: Point[], span: Span, rows: FitRow[]): string[] {
  const have = new Set(readSeries(points).map((p) => p.period));
  const out: string[] = [];
  // The first and the last period used always have a value (a change needs it and the one before), so the ends cannot be missing.
  // Stryker disable next-line EqualityOperator: the last period used has a value, so `<` and `<=` list the same periods
  for (let p = rows[0].period; p <= rows[rows.length - 1].period; p = shiftPeriod(p, span, 1)) if (!have.has(p)) out.push(p);
  return out;
}

/** Fits a line through several Metrics at once, with the other drivers held the same for each effect; runs the suitability
 * checks of a fit first and says what is found. An effect is per one unit of its driver. */
export function fit(input: FitInput): Fit | Refused {
  const { span } = input;
  const names = [...input.drivers.map((d) => d.name), input.target.name];
  const k = input.drivers.length;
  if (k === 0) return { ok: false, refusals: [{ case: "refuse-no-drivers", slots: { target: input.target.name } }] };
  const prep = prepare(input);
  const base: SuitabilityInputs = { series: prep.series, span, periods: prep.rows.length, drivers: k, metrics: input.metrics };
  // Where compared by change, a missing value costs two changes: the findings about gaps count changes, and say so.
  // The finding names which periods had no value (as their dates, which the Takeaway writes as names).
  const aboutChanges = (f: Finding): Finding => {
    const mine = f.case in CHANGE_CASES ? [input.target, ...input.drivers].find((d) => d.name === f.slots.name) : undefined;
    // A run of m missing periods loses m + 1 changes (into the first, between, out of the last): the finding counts changes, we say periods.
    const run: Record<string, number> = typeof f.slots.run === "number" ? { run: f.slots.run - 1 } : {};
    return mine ? { case: CHANGE_CASES[f.case], slots: { ...f.slots, ...run, periods: missingLevels(mine.points, span, prep.rows).join(",") } } : f;
  };
  const inChanges = (v: Verdict): Verdict => (prep.basis === "changes" ? { ...v, refusals: v.refusals.map(aboutChanges), cautions: v.cautions.map(aboutChanges) } : v);
  const early = inChanges(checkSuitability("fit", base));
  if (early.refusals.length > 0) return { ok: false, refusals: early.refusals };
  // Drivers exactly in step are told apart by the Metric's id, then its name: the same fit whatever order they are listed in.
  // Stryker disable next-line EqualityOperator: two drivers with the very same name and no ids are the same to the reader
  const order = input.drivers.map((d, i) => i).sort((x, y) => (input.drivers[x].id ?? Infinity) - (input.drivers[y].id ?? Infinity) || (input.drivers[x].name < input.drivers[y].name ? -1 : 1));
  const ranks = [...order.keys()].map((_, i) => order.indexOf(i));
  const made = fitNumbers(prep.rows, names, k, ranks);
  if ("refusals" in made) return made;
  const { core, cols, misses } = made;
  // Stryker disable next-line EqualityOperator: two drivers with exactly the same share are a tie, and the earlier is the top
  const top = core.drivers.reduce((a, b, i) => (b.share > core.drivers[a].share ? i : a), 0);
  const checked = inChanges(checkSuitability("fit", { ...base, misses, rerun: (left) => without(prep.rows, cols, left, top) }));
  // Crowded drivers are said above the answer, which then is never strong.
  const verdict = core.crowded.length > 0 ? { ...checked, cautions: [...checked.cautions, { case: "caution-crowded" as const, slots: { names: core.crowded.join(", ") } }] } : checked;
  return { ok: true, basis: prep.basis, span, target: input.target.name, ...core, last: { y: prep.last.y, x: cols.map((c) => prep.last.x[c]) }, verdict };
}

/** Each driver's share of what a fit explains (LMG), with what the fit found. */
export type Importance = { ok: true; basis: Basis; n: number; explained: number; drivers: { name: string; share: number; explains: number }[]; merged: Merged[]; verdict: Verdict } | Refused;

/** Every driver's share of what moved the target, by averaging over every order of adding the drivers; the shares add up to 1. */
export function importance(input: FitInput): Importance {
  const f = fit(input);
  if (!f.ok) return f;
  return { ok: true, basis: f.basis, n: f.n, explained: f.explained, drivers: f.drivers.map((d) => ({ name: d.name, share: d.share, explains: d.explains })), merged: f.merged, verdict: f.verdict };
}

// ---- predict and needs: the fit worked out again from its periods, exactly ----

/** A value outside what a driver has been: the driver, which side, the edge of what was seen (a change, where compared by change)
 * and whether that is a change. */
export type Outside = { name: string; side: "above" | "below"; limit: number; change: boolean };

/** The lines of a fit's verdict that still hold for a value worked out from it: the gaps, the curve and the spread. */
const KEPT = new Set<string>(["caution-gaps", "caution-gaps-change", "caution-curved", "caution-spread", "caution-crowded"]);
const carried = (m: Fit): Verdict => ({ refusals: [], cautions: m.verdict.cautions.filter((f) => KEPT.has(f.case)), switches: [] });
const refuseInput = (what: string): Refused => ({ ok: false, refusals: [{ case: "refuse-input", slots: { what } }] });

// A model that a program handed over: its shape and numbers are checked, never trusted.
function modelProblem(m: Fit): string | null {
  const k = m.drivers?.length;
  if (!Number.isInteger(k) || k < 1 || k > SUITABILITY.drivers.most) return "the fit";
  const rows = m.rows;
  const sound = Array.isArray(rows) && rows.length > k + 1 && rows.length <= MOST_PERIODS && rows.every((r) => Number.isFinite(r.y) && Array.isArray(r.x) && r.x.length === k && finiteAll(r.x));
  return sound && finiteAll([...m.last.x, m.last.y]) && m.last.x.length === k && (m.basis === "values" || m.basis === "changes") ? null : "the fit";
}

type Again = { mo: Moments; sol: Solved; t: number; sigma2: F; k: number };

// The fit's moments and solution, from its rows; null where a model with rows like these has none (not one this module made).
function again(m: Fit): Again | null {
  const k = m.drivers.length;
  const mo = moments(m.rows, Array.from({ length: k }, (_, i) => i));
  const sol = solve(mo);
  return sol ? { mo, sol, k, ...spreadOf(mo, sol) } : null;
}

// Where a value of each driver lies against what it has been, in the model's numbers (changes where compared by change).
function outsideOf(m: Fit, values: number[]): Outside[] {
  const change = m.basis === "changes";
  return m.drivers.flatMap((d, j): Outside[] => (values[j] < d.low ? [{ name: d.name, side: "below", limit: d.low, change }] : values[j] > d.high ? [{ name: d.name, side: "above", limit: d.high, change }] : []));
}

/** What the target is likely to be for given values of the drivers (as the Metrics have them, in the fit's order). */
export type Predicted = { ok: true; value: number; lo: number | null; hi: number | null; outside: Outside[]; verdict: Verdict } | Refused;

/** The value of the target for values of the drivers, with its 80 % range ("likely between"). Where a value is outside what
 * its driver has been there is no range, only the point, and the Takeaway says to treat it as a guess; where the link looks
 * curved there is nothing outside what was seen. Compared by change, a driver value counts from its latest level and the
 * target from its latest level too. */
export function predict(model: Fit, values: number[]): Predicted {
  const bad = modelProblem(model);
  if (bad) return refuseInput(bad);
  const k = model.drivers.length;
  if (!Array.isArray(values) || values.length !== k) return refuseInput(model.drivers.map((d) => d.name).join(", "));
  const nonNumber = values.findIndex((v) => !Number.isFinite(v));
  if (nonNumber >= 0) return refuseInput(model.drivers[nonNumber].name);
  const fitted = again(model);
  if (!fitted) return refuseInput(bad ?? "the fit");
  const { mo, sol, t, sigma2 } = fitted;
  // The values in the model's numbers: where compared by change, the change from the latest level.
  const xs = values.map((v, j) => (model.basis === "changes" ? sub(fractionOf(v), fractionOf(model.last.x[j])) : fractionOf(v)));
  const z = xs.map((x, j) => sub(x, mo.mx[j]));
  const mine = add(mo.my, total(sol.beta.map((b, j) => mul(b, z[j]))));
  // h = 1/n + zᵀ·Sxx⁻¹·z, the leverage of these values.
  const h = add({ num: ONE, den: BigInt(mo.n) }, total(sol.m.flatMap((row, a) => row.map((v, b) => mul(z[a], mul(v, z[b]))))));
  const point = model.basis === "changes" ? add(mine, fractionOf(model.last.y)) : mine;
  const half = t * root(mul(sigma2, add(whole(1), h)));
  const outside = outsideOf(model, xs.map(dbl));
  const verdict = carried(model);
  if (outside.length > 0 && verdict.cautions.some((f) => f.case === "caution-curved")) return { ok: false, refusals: [{ case: "refuse-curved-outside", slots: { name: outside[0].name } }] };
  const value = dbl(point);
  const [lo, hi] = [value - half, value + half];
  if (!finiteAll([value, lo, hi])) return { ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] };
  return { ok: true, value, lo: outside.length > 0 ? null : lo, hi: outside.length > 0 ? null : hi, outside, verdict };
}

/** The value a driver would need to reach a goal for the target. */
export type Needed = { ok: true; value: number; lo: number | null; hi: number | null; current: number; outside: Outside[]; verdict: Verdict } | Refused;

/** What `needs` takes: the goal for the target (a level, as the Metric has it), which driver (its index in the fit), and the
 * values the other drivers are held at (levels, in the fit's order; the entry for the driver asked about is ignored). By
 * default the others stay at their latest level. */
export type NeedsInput = { goal: number; driver: number; held?: number[] };

/** The value of one driver that reaches a goal for the target, the others held at their latest values or at the values given:
 * `predict` turned round, so that `predict` at the answer gives the goal. Its range is the driver values whose 80 % range
 * for the target holds the goal; it is offered only where the effect is clear and the value is within what was seen. */
export function needs(model: Fit, input: NeedsInput): Needed {
  const bad = modelProblem(model);
  if (bad) return refuseInput(bad);
  const k = model.drivers.length;
  const { goal, driver: j } = input;
  if (!Number.isFinite(goal)) return refuseInput(model.target);
  if (!Number.isInteger(j) || j < 0 || j >= k) return refuseInput(model.drivers.map((d) => d.name).join(", "));
  const held = input.held ?? model.last.x;
  if (!Array.isArray(held) || held.length !== k) return refuseInput(model.drivers.map((d) => d.name).join(", "));
  const nonNumber = held.findIndex((v, i) => i !== j && !Number.isFinite(v));
  if (nonNumber >= 0) return refuseInput(model.drivers[nonNumber].name);
  const fitted = again(model);
  if (!fitted) return refuseInput("the fit");
  const { mo, sol, t, sigma2 } = fitted;
  const changed = model.basis === "changes";
  // The others in the model's numbers: a change from the latest level where compared by change (so "held" is no change).
  const z0 = held.map((v, i) => (i === j ? zero : sub(changed ? sub(fractionOf(v), fractionOf(model.last.x[i])) : fractionOf(v), mo.mx[i])));
  const goalNow = changed ? sub(fractionOf(input.goal), fractionOf(model.last.y)) : fractionOf(input.goal);
  const r0 = sub(sub(goalNow, mo.my), total(sol.beta.map((b, i) => mul(b, z0[i]))));
  const bj = sol.beta[j];
  if (isZero(bj)) return { ok: false, refusals: [{ case: "refuse-no-effect", slots: { name: model.drivers[j].name, target: model.target } }] };
  // The driver's value in the model's numbers, and as a level.
  const u = div(r0, bj);
  const x = add(mo.mx[j], u);
  const shift = changed ? fractionOf(model.last.x[j]) : zero;
  const value = dbl(add(x, shift));
  const outside = outsideOf(model, held.map((_, i) => dbl(i === j ? x : add(z0[i], mo.mx[i]))));
  const verdict = carried(model);
  if (outside.length > 0 && verdict.cautions.some((f) => f.case === "caution-curved")) return { ok: false, refusals: [{ case: "refuse-curved-outside", slots: { name: outside[0].name } }] };
  // The driver values whose range for the target holds the goal: A·u² − 2B·u + C ≤ 0.
  const T = mul(fractionOf(t * t), sigma2);
  const mj = total(sol.m[j].map((v, i) => mul(v, z0[i])));
  const a = sub(mul(bj, bj), mul(T, sol.m[j][j]));
  const b = add(mul(r0, bj), mul(T, mj));
  const lever = total(sol.m.flatMap((row, p) => row.map((v, q) => mul(z0[p], mul(v, z0[q])))));
  const c = sub(mul(r0, r0), mul(T, add(add(whole(1), { num: ONE, den: BigInt(mo.n) }), lever)));
  const disc = sub(mul(b, b), mul(a, c));
  // Stryker disable next-line EqualityOperator: a is 0 only where an effect sits exactly on the edge of being clear, which no data reaches (the edge is a fraction of a double's square), and it would divide by 0 there
  const clear = outside.length === 0 && cmp(a, zero) > 0;
  const centre = dbl(add(add(mo.mx[j], div(b, a)), shift));
  const half = clear ? root(div(disc, mul(a, a))) : NaN;
  if (!finiteAll([value, ...(clear ? [centre, half] : [])])) return { ok: false, refusals: [{ case: "refuse-too-large", slots: {} }] };
  return { ok: true, value, lo: clear ? centre - half : null, hi: clear ? centre + half : null, current: model.last.x[j], outside, verdict };
}
