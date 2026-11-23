// Student's t curve (GLOSSARY: Analysis; spec 0041, "Distributions"): the one place the before-and-after range and the
// change point's far-off check read a distribution with a small number of degrees of freedom. Pure, in doubles; checked
// against SciPy's `t.ppf` and `t.cdf` (fixtures/before-after.py) and against a reference that works the curve out another
// way (the incomplete beta function).
//
// For a whole number of degrees of freedom ν the chance of a value within ±t has a finite closed form (Abramowitz and
// Stegun 26.7.3 and 26.7.4), with s = t ÷ √(ν + t²) the sine and c = √ν ÷ √(ν + t²) the cosine of the angle θ = atan(t ÷ √ν):
//   ν even: P(|T| ≤ t) = s · [1 + ½c² + (1·3)/(2·4) c⁴ + … + (1·3···(ν−3))/(2·4···(ν−2)) c^(ν−2)];
//   ν odd:  P(|T| ≤ t) = (2/π) · [θ + s·c · (1 + ⅔c² + (2·4)/(3·5) c⁴ + … + (2·4···(ν−3))/(3·5···(ν−2)) c^(ν−3))]  (just 2θ/π for ν = 1).
// Every term is positive, so the chance within ±t loses nothing. The chance of a value far below 0 is a small difference of 0.5 and half
// of that, which a double cannot keep, so the lower tail is worked out directly: ½ · I_x(ν/2, ½), x = ν ÷ (ν + t²), the regularized
// incomplete beta function by Lentz's continued fraction (which converges fast where x is below (a + 1) ÷ (a + b + 2), the tail), with
// ln Γ at whole and half-whole numbers from Stirling's series. The quantile is found by bisection on the curve.

/** The 80 % range's tail: a chance of 0.9 below the point, so that the range around a result holds 80 %. */
export const LIKELY = 0.9;

/** The most degrees of freedom the curve is worked out for; the sum has about half as many terms. */
export const MOST_DF = 100_000;

// ln Γ(k ÷ 2) for a whole k ≥ 1 without the constant ½ ln 2π, which cancels in the difference the front factor takes: Stirling's series from 30 on
// (the next term is below 1e-16), and below that Γ(z + 1) = z·Γ(z) up to it.
function lnGammaHalf(k: number): number {
  let [z, shift] = [k / 2, 0];
  // Stryker disable next-line EqualityOperator: from 30 or from 31 the two routes agree to the last digit.
  for (; z < 30; z += 1) shift -= Math.log(z);
  return (z - 0.5) * Math.log(z) - z + 1 / (12 * z) - 1 / (360 * z ** 3) + 1 / (1260 * z ** 5) + shift;
}

// I_x(ν/2, ½) for x below (ν/2 + 1) ÷ (ν/2 + 2.5): the front factor times Lentz's continued fraction ÷ a.
function lowerBeta(x: number, df: number): number {
  const [a, b] = [df / 2, 0.5];
  const front = Math.exp(lnGammaHalf(df + 1) - lnGammaHalf(df) - 0.5 * Math.log(Math.PI) + a * Math.log(x) + b * Math.log1p(-x));
  let [c, d] = [1, 1 / (1 - ((a + b) * x) / (a + 1))];
  let h = d;
  // Each pass takes two steps of the fraction; it has converged when the factor is 1 to the last digit (a few hundred passes at most).
  for (let m = 1; ; m++) {
    const m2 = 2 * m;
    let factor = 1;
    for (const aa of [(m * (b - m) * x) / ((a - 1 + m2) * (a + m2)), (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))]) {
      d = 1 / (1 + aa * d);
      c = 1 + aa / c;
      factor = d * c;
      h *= factor;
    }
    // Stryker disable next-line EqualityOperator: a factor is never exactly 1e-16 from 1 (doubles near 1 are 1.1e-16 apart).
    if (Math.abs(factor - 1) < 1e-16) return (front * h) / a;
  }
}

/** The chance that a t value with `df` degrees of freedom lies at or below `t`; NaN for a `df` that is not a whole number from 1 to `MOST_DF`, or a `t` that is NaN. */
export function tCdf(t: number, df: number): number {
  if (!Number.isInteger(df) || df < 1 || df > MOST_DF || Number.isNaN(t)) return NaN;
  // The upper end of the line has all of the curve below it (the lower end comes out as 0 of itself).
  if (t === Infinity) return 1;
  // Far below 0 the chance is a tail: worked out directly, where x is small enough for the fraction to converge.
  const x = df / (df + t * t);
  // Stryker disable next-line EqualityOperator,ArithmeticOperator: at t = 0, x is 1, above the switch; and the switch only picks between two routes that agree to 1e-14 where a tail is above 1e-3.
  if (t < 0 && x < (df / 2 + 1) / (df / 2 + 2.5)) return 0.5 * lowerBeta(x, df);
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
    if (df === 1) return 0.5 + Math.atan(t) / Math.PI;
    let [term, sum] = [1, 1];
    for (let k = 1; k <= (df - 3) / 2; k++) {
      term *= ((2 * k) / (2 * k + 1)) * c2;
      sum += term;
    }
    within = (2 / Math.PI) * (Math.atan(Math.abs(t) / Math.sqrt(df)) + s * c * sum);
  }
  const half = Math.min(1, within) / 2;
  // The curve is symmetric: 0.5 plus half of what lies within ±|t| for t above 0, minus it for t below 0.
  return 0.5 + Math.sign(t) * half;
}

/** The point below which a t value with `df` degrees of freedom lies with chance `p`, for `p` from 0.001 to 0.999 (beyond it a
 * chance is too small for a double to tell the points apart: NaN); NaN too for a `df` that is not a whole number from 1 to `MOST_DF`. */
export function tQuantile(p: number, df: number): number {
  if (!(p >= 0.001 && p <= 0.999) || !Number.isInteger(df) || df < 1 || df > MOST_DF) return NaN;
  // The curve is symmetric: work on the upper half and mirror (the point of 1/2 is 0, whose sign is 0).
  const q = Math.max(p, 1 - p);
  // The point is below 636.62 for ν = 1 and p = 0.9995; 1e4 holds every p in range for ν = 1 (the heaviest tail).
  let [lo, hi] = [0, 1e4];
  // Halve the bracket until its middle is one of its ends, which is when no double lies between them: that happens after about 70 halvings.
  for (;;) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    // Stryker disable next-line EqualityOperator: where the curve at the middle equals the chance exactly, either end may take the middle, and the point comes out the same to a unit of its last place.
    if (tCdf(mid, df) < q) lo = mid;
    else hi = mid;
  }
  return Math.sign(p - 0.5) * ((lo + hi) / 2);
}
