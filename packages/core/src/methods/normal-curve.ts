// The normal curve (GLOSSARY: Analysis; spec 0041, "Distributions"): the one place the forecast's ranges and chances read a
// distribution. Pure, in doubles; checked against SciPy's `norm.cdf` and `norm.ppf` (fixtures/forecast.py).
//
// The chance below a point z is worked out through the complementary error function, erfc, which has two documented
// forms: for x below 2.5, the all-positive series erf(x) = 2/√π · e^(−x²) · Σ 2ⁿ x^(2n+1) ÷ (1·3·5···(2n+1)) (no
// cancellation, converges everywhere), and above it Laplace's continued fraction erfc(x) = e^(−x²) ÷ (√π ·
// (x + ½/(x + 1/(x + (3/2)/(x + 2/(x + …)))))), which is accurate in the tail where 1 − erf would lose every digit.

/** The 80 % range's multiplier: the point below which 90 % of the normal curve lies (SciPy's `norm.ppf(0.9)`). A range of
 * "likely between" is the value less and plus this many standard deviations. */
export const Z80 = 1.2815515655446004;

const SERIES_UNTIL = 2.5;
// Terms of the series and of the continued fraction: enough that the next one is below 1e-18 of the sum for x up to the
// switch (the series needs 62 at 2.5) and the fraction is converged to the last digit from 2.5 on.
const SERIES_TERMS = 120;
const FRACTION_TERMS = 200;

// erfc(x) for x ≥ 0 (or NaN).
function erfcFromZero(x: number): number {
  // Stryker disable next-line EqualityOperator: at the switch itself both forms agree to 1e-13.
  if (x < SERIES_UNTIL) {
    let [term, sum] = [x, x];
    // Stryker disable next-line EqualityOperator: one more term is below 1e-18 of the sum.
    for (let n = 1; n < SERIES_TERMS; n++) {
      term *= (2 * x * x) / (2 * n + 1);
      sum += term;
    }
    return 1 - ((2 / Math.sqrt(Math.PI)) * Math.exp(-x * x) * sum);
  }
  let t = x;
  for (let k = FRACTION_TERMS; k >= 1; k--) t = x + k / 2 / t;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * t);
}

/** The chance that a standard normal value lies at or below `z`, Φ(z). Each tail is worked out on its own, so a tiny chance
 * keeps its digits: Φ(−8) is 6.22e-16, not 0. NaN for NaN. */
export function normalCdf(z: number): number {
  const tail = erfcFromZero(Math.abs(z) / Math.SQRT2) / 2;
  // Stryker disable next-line EqualityOperator: at 0 the tail is 1/2 and both sides give 1/2.
  return z >= 0 ? 1 - tail : tail;
}
