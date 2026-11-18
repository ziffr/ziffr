// The references for the Analysis Recipe function library (spec 0024, spec 0022 "Reference implementations"; GLOSSARY:
// Analysis Recipe), written from their textbook definitions on exact fractions, sharing nothing with
// recipe-functions.ts but the types:
// - a moving average of n is the sum of the last n values ÷ n, from the n-th value on;
// - a difference is a value minus the one before; growth is that difference ÷ |the one before| × 100, none from 0;
// - a share is the part ÷ the whole × 100 on the periods both have, none where the whole is 0;
// - the least-squares line through (i, yᵢ) for i = 0 … n − 1 has slope (n·Σiy − Σi·Σy) ÷ (n·Σi² − (Σi)²) and passes
//   through the means; its value at i is intercept + slope · i;
// - the sample variance is (Σy² − (Σy)²/n) ÷ (n − 1); the standard deviation and a z-score are given as their exact
//   squares (variance, (y − ȳ)² ÷ variance) and the z-score's sign;
// - a seasonal index of a season length L is the mean of the values in the same position (i mod L) ÷ the mean of all
//   values × 100, given at least 2·L values and a mean that is not 0.
import { exactOf, fraction, minus, plus, ZERO, type Exact } from "./exact";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const by = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const n = (k: number | bigint) => fraction(BigInt(k), 1n);
const total = (xs: readonly Exact[]) => xs.reduce((a, x) => plus(a, x), ZERO);
const average = (xs: readonly Exact[]) => by(total(xs), n(xs.length));
const HUNDRED = n(100);

/** A series as exact values in its order. */
export type RefPoint = { period: string; value: Exact };
/** Reads a series of doubles by their shortest text. */
export const exactSeries = (points: readonly { period: string; value: number }[]): RefPoint[] => points.map((p) => ({ period: p.period, value: exactOf(p.value) }));

/** The moving average of `w`. */
export function refMovingAverage(ps: readonly RefPoint[], w: number): RefPoint[] {
  const out: RefPoint[] = [];
  for (let i = w - 1; i < ps.length; i++) out.push({ period: ps[i].period, value: average(ps.slice(i - w + 1, i + 1).map((p) => p.value)) });
  return out;
}

/** Each value minus the one before. */
export function refDifference(ps: readonly RefPoint[]): RefPoint[] {
  return ps.slice(1).map((p, i) => ({ period: p.period, value: minus(p.value, ps[i].value) }));
}

/** The change on the one before in %, none from 0. */
export function refGrowth(ps: readonly RefPoint[]): RefPoint[] {
  const out: RefPoint[] = [];
  for (let i = 1; i < ps.length; i++) {
    const before = ps[i - 1].value;
    if (before.num === 0n) continue;
    const size = fraction(before.num < 0n ? -before.num : before.num, before.den);
    out.push({ period: ps[i].period, value: times(by(minus(ps[i].value, before), size), HUNDRED) });
  }
  return out;
}

/** The part as a share of the whole in %, on the periods both have. */
export function refShare(part: readonly RefPoint[], whole: readonly RefPoint[]): RefPoint[] {
  const out: RefPoint[] = [];
  for (const p of part) {
    const w = whole.find((x) => x.period === p.period);
    if (!w || w.value.num === 0n) continue;
    out.push({ period: p.period, value: times(by(p.value, w.value), HUNDRED) });
  }
  return out;
}

/** The least-squares line through (i, yᵢ): slope and intercept, or null for fewer than two values. */
export function refLine(ps: readonly RefPoint[]): { slope: Exact; intercept: Exact } | null {
  const k = ps.length;
  if (k < 2) return null;
  let [si, sy, sii, siy] = [ZERO, ZERO, ZERO, ZERO];
  ps.forEach((p, i) => {
    si = plus(si, n(i));
    sy = plus(sy, p.value);
    sii = plus(sii, n(i * i));
    siy = plus(siy, times(n(i), p.value));
  });
  const slope = by(minus(times(n(k), siy), times(si, sy)), minus(times(n(k), sii), times(si, si)));
  const intercept = minus(by(sy, n(k)), times(slope, by(si, n(k))));
  return { slope, intercept };
}

/** The sample variance, or null for fewer than two values. */
export function refVariance(ps: readonly RefPoint[]): Exact | null {
  if (ps.length < 2) return null;
  const ys = ps.map((p) => p.value);
  const s = total(ys);
  const ss = total(ys.map((y) => times(y, y)));
  return by(minus(ss, by(times(s, s), n(ys.length))), n(ys.length - 1));
}

/** Each z-score as its exact square and its sign, or null when the values do not vary. */
export function refZ(ps: readonly RefPoint[]): { period: string; z2: Exact; negative: boolean }[] | null {
  const v = refVariance(ps);
  if (!v || v.num === 0n) return null;
  const m = average(ps.map((p) => p.value));
  return ps.map((p) => {
    const d = minus(p.value, m);
    return { period: p.period, z2: by(times(d, d), v), negative: d.num < 0n };
  });
}

/** The seasonal index of each value in %, or null without two full seasons or with a mean of 0. */
export function refSeasonal(ps: readonly RefPoint[], season: number): RefPoint[] | null {
  if (ps.length < 2 * season) return null;
  const all = average(ps.map((p) => p.value));
  if (all.num === 0n) return null;
  return ps.map((p, i) => {
    const same = ps.filter((_, j) => j % season === i % season).map((q) => q.value);
    return { period: p.period, value: times(by(average(same), all), HUNDRED) };
  });
}

/** The mean, or null for no values. */
export const refMean = (ps: readonly RefPoint[]) => (ps.length ? average(ps.map((p) => p.value)) : null);
