// The reference for basis choice (spec 0041, rule 2; GLOSSARY: Analysis), written from the definitions on exact
// fractions and sharing nothing with basis.ts:
// - a change is a value minus the value one period earlier;
// - the straight line through the points (x, y) has slope Sxy ÷ Sxx and intercept ȳ − slope · x̄, with the sums taken
//   about the means; what is left of a value is y − (intercept + slope · x);
// - the line explains R² = 1 − SSE ÷ SST of the variance, SSE the sum of the squared leftovers and SST the sum of
//   the squared distances from ȳ. A series is trending when R² is above ½ (a series that does not change is not),
//   and two series are compared by change when both are.
import { compareExact, fraction, minus, plus, ZERO, type Exact } from "./exact";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const divide = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const whole = (n: number) => fraction(BigInt(n), 1n);
const total = (vs: readonly Exact[]) => vs.reduce(plus, ZERO);

/** The change from `before` to `now`. */
export const referenceChange = (before: Exact, now: Exact): Exact => minus(now, before);

/** The least-squares line through (x, y), its leftovers and how much of the variance it explains; null for fewer than
 * two points, or points all at one x. `r2` is null where the y do not vary. */
export function referenceLine(xs: readonly number[], ys: readonly Exact[]): { intercept: Exact; slope: Exact; leftovers: Exact[]; r2: Exact | null } | null {
  const n = xs.length;
  const px = xs.map(whole);
  const mean = (vs: readonly Exact[]) => divide(total(vs), whole(n));
  if (n < 2) return null;
  const [mx, my] = [mean(px), mean(ys)];
  const sxx = total(px.map((x) => times(minus(x, mx), minus(x, mx))));
  if (sxx.num === 0n) return null;
  const sxy = total(px.map((x, i) => times(minus(x, mx), minus(ys[i], my))));
  const slope = divide(sxy, sxx);
  const intercept = minus(my, times(slope, mx));
  const leftovers = px.map((x, i) => minus(ys[i], plus(intercept, times(slope, x))));
  const sst = total(ys.map((y) => times(minus(y, my), minus(y, my))));
  const sse = total(leftovers.map((e) => times(e, e)));
  return { intercept, slope, leftovers, r2: sst.num === 0n ? null : minus(whole(1), divide(sse, sst)) };
}

/** Whether the line explains more than half of the variance. */
export function referenceTrending(xs: readonly number[], ys: readonly Exact[]): boolean {
  const line = referenceLine(xs, ys);
  return !!line?.r2 && compareExact(line.r2, fraction(1n, 2n)) > 0;
}

/** "changes" where both series trend, else "values". */
export function referenceBasis(xs: readonly number[], a: readonly Exact[], b: readonly Exact[]): "changes" | "values" {
  return referenceTrending(xs, a) && referenceTrending(xs, b) ? "changes" : "values";
}
