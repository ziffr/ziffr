// Student's t curve (GLOSSARY: Analysis; spec 0041, "Distributions"): the one place the before-and-after range and the
// change point's far-off check read a distribution with a small number of degrees of freedom. Pure, in doubles; checked
// against SciPy's `t.ppf` and `t.cdf` (fixtures/before-after.py) and against a reference that works the curve out another
// way (the incomplete beta function).
//
// For a whole number of degrees of freedom ν the chance of a value within ±t has a finite closed form (Abramowitz and
// Stegun 26.7.3 and 26.7.4), with s = t ÷ √(ν + t²) the sine and c = √ν ÷ √(ν + t²) the cosine of the angle θ = atan(t ÷ √ν):
//   ν even: P(|T| ≤ t) = s · [1 + ½c² + (1·3)/(2·4) c⁴ + … + (1·3···(ν−3))/(2·4···(ν−2)) c^(ν−2)];
//   ν odd:  P(|T| ≤ t) = (2/π) · [θ + s·c · (1 + ⅔c² + (2·4)/(3·5) c⁴ + … + (2·4···(ν−3))/(3·5···(ν−2)) c^(ν−3))]  (just 2θ/π for ν = 1).
// Every term is positive, so nothing cancels. The quantile is found by bisection on that chance.

/** The 80 % range's tail: a chance of 0.9 below the point, so that the range around a result holds 80 %. */
export const LIKELY = 0.9;

/** The most degrees of freedom the curve is worked out for; the sum has about half as many terms. */
export const MOST_DF = 100_000;

/** The chance that a t value with `df` degrees of freedom lies at or below `t`; NaN for a `df` that is not a whole number from 1 to `MOST_DF`, or a `t` that is NaN. */
export function tCdf(t: number, df: number): number {
  if (!Number.isInteger(df) || df < 1 || df > MOST_DF || Number.isNaN(t)) return NaN;
  // The ends of the line: all of the curve is beyond them.
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const root = Math.sqrt(df + t * t);
  // t ÷ √(ν + t²) cannot lose a digit to the square root, even for t as large as a double goes: hypot is not needed for ν ≥ 1.
  const [s, c] = [Math.abs(t) / root, Math.sqrt(df) / root];
  const c2 = c * c;
  let within: number;
  if (df % 2 === 0) {
    let [term, sum] = [1, 1];
    for (let k = 1; k < df / 2; k++) {
      term *= ((2 * k - 1) / (2 * k)) * c2;
      sum += term;
    }
    within = s * sum;
  } else {
    // ν = 1 is the angle alone: there is no sine-and-cosine term.
    if (df === 1) return t < 0 ? 0.5 - Math.atan(Math.abs(t)) / Math.PI : 0.5 + Math.atan(Math.abs(t)) / Math.PI;
    let [term, sum] = [1, 1];
    for (let k = 1; k <= (df - 3) / 2; k++) {
      term *= ((2 * k) / (2 * k + 1)) * c2;
      sum += term;
    }
    within = (2 / Math.PI) * (Math.atan(Math.abs(t) / Math.sqrt(df)) + s * c * sum);
  }
  const half = Math.min(1, within) / 2;
  return t < 0 ? 0.5 - half : 0.5 + half;
}

/** The point below which a t value with `df` degrees of freedom lies with chance `p`, for `p` from 0.001 to 0.999 (beyond it a
 * chance is too small for a double to tell the points apart: NaN); NaN too for a `df` that is not a whole number from 1 to `MOST_DF`. */
export function tQuantile(p: number, df: number): number {
  if (!(p >= 0.001 && p <= 0.999) || !Number.isInteger(df) || df < 1 || df > MOST_DF) return NaN;
  if (p === 0.5) return 0;
  // The curve is symmetric: work on the upper half and mirror.
  const q = p > 0.5 ? p : 1 - p;
  // The point is below 636.62 for ν = 1 and p = 0.9995; 1e4 holds every p in range for ν = 1 (the heaviest tail).
  let [lo, hi] = [0, 1e4];
  // 200 halvings of an interval of 1e4 reach the spacing of doubles long before the end; the loop stops when the middle no longer moves.
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (tCdf(mid, df) < q) lo = mid;
    else hi = mid;
  }
  const point = (lo + hi) / 2;
  return p > 0.5 ? point : -point;
}
