// The references for the pair scan behind the Heads-ups (spec 0041, ticket 13; GLOSSARY: Heads-up), written from the
// definitions and sharing nothing with src/methods/ (p-value.ts, false-discovery.ts, pair-scan.ts):
// - the chance of a correlation by luck is the area in both tails of Student's t with n − 2 degrees of freedom. With
//   t = tan θ·√ν the density turns into a constant times cos^(ν−1) φ, so the chance is C(ν) · ∫ cos^(ν−1) φ dφ from θ to π/2 with
//   sin θ = |r|, and C(ν) = 2·Γ((ν + 1)/2) ÷ (√π · Γ(ν/2)). The integral is worked out by composite Gauss-Legendre (5 points,
//   many panels), ln Γ by Stirling's series after shifting the argument up by 12; for a whole number of degrees of freedom the
//   finite sums of Abramowitz and Stegun 26.7.3 and 26.7.4 are a second way, and df = 1 and 2 and 4 are worked out by hand
//   in the tests;
// - Benjamini and Hochberg's rule is decided on exact fractions: with m chances written as decimals, rank k is reported if
//   p(k) · m ≤ q · k exactly, and everything at or below the largest such rank;
// - the effective count is n ÷ (1 + 2 Σ ρx(k) ρy(k)) with the autocorrelations ρ(k) = Σ (v[i] − v̄)(v[i + k] − v̄) ÷ Σ (v[i] − v̄)²
//   on exact fractions, the sum as one fraction;
// - a window of pairs at each delay is read by position in a list, and r is the exact one (r² and its sign).
import { referencePearson } from "./analyses";
import { exactOf, fraction, minus, plus, type Exact } from "./exact";

// ---- the chance by luck ----

const NODES: [number, number][] = [[0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [-0.5384693101056831, 0.4786286704993665], [0.906179845938664, 0.2369268850561891], [-0.906179845938664, 0.2369268850561891]];

/** ln Γ(z) for z > 0 by Stirling's series on z + 12, with the twelve factors taken off again. */
export function lnGammaStirling(z: number): number {
  let shifted = z;
  let offset = 0;
  for (let i = 0; i < 12; i++) {
    offset += Math.log(shifted);
    shifted += 1;
  }
  const s = shifted;
  return (s - 0.5) * Math.log(s) - s + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * s) - 1 / (360 * s ** 3) + 1 / (1260 * s ** 5) - 1 / (1680 * s ** 7) + 1 / (1188 * s ** 9) - offset;
}

/** ∫ from `from` to `to` of f, by composite 5-point Gauss-Legendre over `panels` equal panels. */
export function integrate(f: (x: number) => number, from: number, to: number, panels: number): number {
  const width = (to - from) / panels;
  let total = 0;
  for (let k = 0; k < panels; k++) {
    const mid = from + (k + 0.5) * width;
    for (const [node, weight] of NODES) total += weight * f(mid + (node * width) / 2);
  }
  return (total * width) / 2;
}

/** The two-sided chance of |r| over n pairs (n may be a fraction) by the integral above. */
export function referenceChance(r: number, n: number): number {
  const a = Math.abs(r);
  if (a === 0) return 1;
  if (a === 1) return 0;
  const nu = n - 2;
  const theta = Math.asin(a);
  const c = (2 * Math.exp(lnGammaStirling((nu + 1) / 2) - lnGammaStirling(nu / 2))) / Math.sqrt(Math.PI);
  // Near r = 1 the interval is short; near 0 it is long: panels in proportion, never few.
  return c * integrate((phi) => Math.cos(phi) ** (nu - 1), theta, Math.PI / 2, 400);
}

/** The chance for a whole number of degrees of freedom ν ≥ 1 by Abramowitz and Stegun 26.7.3 (odd) and 26.7.4 (even), as 1 − A(t | ν) with sin θ = |r|. */
export function referenceChanceClosed(r: number, nu: number): number {
  const s = Math.abs(r);
  const c = Math.sqrt(1 - s * s);
  if (nu % 2 === 0) {
    let [term, sum] = [1, 1];
    for (let k = 1; k <= (nu - 2) / 2; k++) {
      term *= ((2 * k - 1) / (2 * k)) * c * c;
      sum += term;
    }
    return 1 - s * sum;
  }
  let [term, sum] = [c, c];
  for (let k = 1; k <= (nu - 3) / 2; k++) {
    term *= ((2 * k) / (2 * k + 1)) * c * c;
    sum += term;
  }
  return 1 - (2 / Math.PI) * (Math.asin(s) + s * (nu === 1 ? 0 : sum));
}

// ---- Benjamini and Hochberg on exact fractions ----

/** The pairs reported at the rate q (the decimal text "0.1"), by the rule on exact fractions; chances outside 0 to 1 are held to it, a chance that is not a number is 1. */
export function referenceBH(ps: readonly number[], q: string): boolean[] {
  const rate = exactOf(q);
  const exact = ps.map((p) => exactOf(Number.isNaN(p) ? 1 : Math.min(1, Math.max(0, p))));
  const m = BigInt(ps.length);
  const order = exact.map((e, i) => ({ e, i })).sort((x, y) => Number(x.e.num * y.e.den - y.e.num * x.e.den));
  // The largest rank whose chance times m is within q times the rank, scanning from the top.
  let cut: Exact | null = null;
  for (let k = order.length; k >= 1 && cut === null; k--) {
    const { e } = order[k - 1];
    if (e.num * m * rate.den <= rate.num * BigInt(k) * e.den) cut = e;
  }
  return ps.map((_, i) => cut !== null && exact[i].num * cut.den <= cut.num * exact[i].den);
}

// ---- the effective count ----

/** The exact autocorrelation at delay k of a whole series (a null is a gap): the sum of centred products k places apart over the
 * sum of squares, both over the values it has; 0 where the series does not vary. As a fraction. */
export function referenceRho(series: readonly (number | null)[], k: number): Exact {
  const have = series.filter((v): v is number => v !== null).map((v) => exactOf(v));
  if (have.length === 0) return fraction(0n, 1n);
  const total = have.reduce(plus);
  const mean = fraction(total.num, total.den * BigInt(have.length));
  const centred = series.map((v) => (v === null ? null : minus(exactOf(v), mean)));
  let [top, bottom] = [fraction(0n, 1n), fraction(0n, 1n)];
  centred.forEach((c, i) => {
    if (c === null) return;
    bottom = plus(bottom, fraction(c.num * c.num, c.den * c.den));
    const next = centred[i + k];
    if (next) top = plus(top, fraction(c.num * next.num, c.den * next.den));
  });
  return bottom.num === 0n ? fraction(0n, 1n) : fraction(top.num * bottom.den, top.den * bottom.num);
}

/** n ÷ (1 + 2 Σ ρx(k) ρy(k)) for k up to the smaller of n ÷ 3 and 12, held to at most n, as a double from exact fractions; the two
 * series are the whole series the autocorrelations are read from. */
export function referenceEffective(n: number, x: readonly (number | null)[], y: readonly (number | null)[]): number {
  let sum = fraction(0n, 1n);
  for (let k = 1; k <= Math.min(Math.floor(n / 3), 12); k++) {
    const [a, b] = [referenceRho(x, k), referenceRho(y, k)];
    sum = plus(sum, fraction(a.num * b.num, a.den * b.den));
  }
  // 1 + 2·sum as one fraction; below 1 it is held to 1.
  const factor = plus(fraction(1n, 1n), fraction(2n * sum.num, sum.den));
  const held = factor.num < factor.den ? fraction(1n, 1n) : factor;
  return (n * Number(held.den)) / Number(held.num);
}

// ---- a window's delays, by position in a list ----

/** The pairs of a delay by position: the leader's value `gap` places before the follower's, for follower places from lo to hi; null is no value. */
export function referencePairs(a: readonly (number | null)[], b: readonly (number | null)[], lag: number, lo: number, hi: number): { at: number; lead: number; follow: number }[] {
  const out: { at: number; lead: number; follow: number }[] = [];
  const [leader, follower, gap] = lag >= 0 ? [a, b, lag] : [b, a, -lag];
  for (let u = lo; u <= hi; u++) {
    if (u - gap < 0 || u >= follower.length) continue;
    const [l, f] = [leader[u - gap], follower[u]];
    if (l !== null && f !== null) out.push({ at: u, lead: l, follow: f });
  }
  return out;
}

/** r of pairs from the exact r² and sign, as a double (the double nearest the exact square, rooted); NaN where a series is constant. */
export function referenceR(lead: readonly number[], follow: readonly number[]): number {
  const r = referencePearson(lead.map((v) => exactOf(v)), follow.map((v) => exactOf(v)));
  if (!r) return NaN;
  return (r.negative ? -1 : 1) * Math.sqrt(Number(r.r2.num) / Number(r.r2.den));
}
