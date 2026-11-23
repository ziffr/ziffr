// Basis choice (GLOSSARY: Analysis; spec 0041, rule 2): whether two Metrics are compared on their values or on how
// they change, so that two Metrics that only share a trend are not read as related. Pure.
// - `changes`: each value minus the value of the period before, worked out on the values' text;
// - `detrended`: each value minus the Metric's own straight-line trend;
// - `basisFor`: "changes" where both series have a clear trend (the straight line through each explains more than
//   half of its variance), else "values". A function of the two series and their period, nothing else, so a Metric's
//   page, Drivers, the correlation matrix and every later Analysis agree.
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "./exact";
import { periodsBetween, type Span } from "./periods";
import type { Point } from "./types";

/** What two Metrics are compared on: how each changed from the period before, or the values as they are. */
export type Basis = "changes" | "values";

/** The words a result gives for its basis, once, wherever it is shown. */
export function basisText(basis: Basis): string {
  return basis === "changes" ? "compared by change, growth removed" : "compared by value";
}

const ONE = BigInt(1);
const whole = (n: number): Fraction => ({ num: BigInt(n), den: ONE });
const sum = (fs: Fraction[]) => fs.reduce((a, b) => lowestTerms(plus(a, b)), whole(0));
// The series as it is read: a value that is not a number (NaN, Infinity) is no value, a period given twice counts once with
// the value given last, and the periods run oldest first.
// Stryker disable next-line EqualityOperator: the periods are unique once the Map has kept one value each, so `<` and `<=` never differ.
const sorted = (a: Point[]) => [...new Map(a.filter((p) => Number.isFinite(p.value)).map((p) => [p.period, p])).values()].sort((x, y) => (x.period < y.period ? -1 : 1));

/** A series as every Method reads it: a value that is not a number is no value, a period given twice counts once with
 * the value given last, and the periods run oldest first. The input is never changed. */
export function readSeries(points: Point[]): Point[] {
  return sorted(points);
}

/** Each value's change on the period before, as a series of the later period: 12 after 10 is 2, and 0.3 after 0.1
 * is exactly 0.2. A value whose period before is missing has no change, so it is left out; the first value has none. */
export function changes(points: Point[], span: Span): Point[] {
  const s = sorted(points);
  const out: Point[] = [];
  for (let i = 1; i < s.length; i++) {
    if (periodsBetween(s[i - 1].period, s[i].period, span) !== 1) continue;
    out.push({ period: s[i].period, value: nearest(minus(fractionOf(s[i].value), fractionOf(s[i - 1].value))) });
  }
  return out;
}

// The straight line through (position, value), by least squares, on exact fractions, where position counts spans from
// the first value (so a missing period leaves a gap in the positions). `n·Sxy`, `n·Sxx` and `n·Syy` are kept as they are:
// the factor n cancels where it is a ratio.
function line(points: Point[], span: Span) {
  const s = sorted(points);
  const n = whole(s.length);
  const xs = s.map((p) => whole(periodsBetween(s[0].period, p.period, span)));
  const ys = s.map((p) => fractionOf(p.value));
  const [sx, sy] = [sum(xs), sum(ys)];
  const about = (as: Fraction[], bs: Fraction[], sa: Fraction, sb: Fraction) => lowestTerms(minus(times(n, sum(as.map((a, i) => times(a, bs[i])))), times(sa, sb)));
  return { s, n, xs, ys, sx, sy, sxy: about(xs, ys, sx, sy), sxx: about(xs, xs, sx, sx), syy: about(ys, ys, sy, sy) };
}

/** Each value minus the Metric's straight-line trend (least squares on the period's position), worked out exactly:
 * what is left when growth is taken out. None for fewer than two values. */
export function detrended(points: Point[], span: Span): Point[] {
  if (sorted(points).length < 2) return [];
  const { s, n, xs, ys, sx, sy, sxy, sxx } = line(points, span);
  const meanX = over(sx, n);
  const meanY = over(sy, n);
  // Two values or more at different periods: Sxx is above 0 (a period given twice is one value in a series).
  const slope = over(sxy, sxx);
  return s.map((p, i) => ({ period: p.period, value: nearest(minus(ys[i], plus(meanY, times(slope, minus(xs[i], meanX))))) }));
}

/** Whether the straight-line trend explains more than half of the series' variance: R² = Sxy² ÷ (Sxx · Syy) above ½,
 * decided exactly as 2 · Sxy² > Sxx · Syy. A series that does not change (Syy 0) or has fewer than two values (all three 0)
 * has no trend to speak of: the comparison is 0 > 0. */
function trends(points: Point[], span: Span): boolean {
  const { sxy, sxx, syy } = line(points, span);
  const [a, b] = [times(whole(2), times(sxy, sxy)), times(sxx, syy)];
  return a.num * b.den > b.num * a.den;
}

/** The basis two series are compared on: "changes" where both trend, else "values". `a` and `b` are on the same
 * periods, each `span` long. */
export function basisFor(a: Point[], b: Point[], span: Span): Basis {
  return trends(a, span) && trends(b, span) ? "changes" : "values";
}
