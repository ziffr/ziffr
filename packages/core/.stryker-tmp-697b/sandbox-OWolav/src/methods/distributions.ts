// @ts-nocheck
// The Student t curve's quantile, for the ranges of a fit ("likely between"; GLOSSARY: Takeaway; spec 0041, "Distributions").
// It is the one number of a fit that exact fractions cannot give, so it is worked out in doubles from the curve's
// closed form for whole degrees of freedom (Abramowitz and Stegun 26.7.3 and 26.7.4): with θ = arctan(t ÷ √v), the chance of
// a value between −t and t is a finite sum of powers of cos θ, a plain sum of positive terms, so it loses nothing to
// cancelling. The quantile is found by halving the interval of θ, which needs no derivative and cannot leave the interval.
// Checked against SciPy's `t.ppf` to a relative 1e-9 (the fixture), and against an integration of the curve's density
// in test/reference/distributions.ts. Pure.

/** The most degrees of freedom a quantile is worked out for: a sum with half as many terms, so a hostile number cannot make it slow. */
export const MOST_DF = 100_000;

// The chance of a value between −t and t for t = √v · tan θ, by the closed form for odd and even v. The terms are the
// powers of cos θ of the two sums in the references above: odd v adds cos^(2j+1) with the factors 1, 2/3, (2·4)/(3·5)…
// (the first v = 1 has none), even v adds cos^2j with the factors 1, 1/2, (1·3)/(2·4)….
function between(theta: number, v: number): number {
  const [s, c] = [Math.sin(theta), Math.cos(theta)];
  const c2 = c * c;
  const odd = v % 2 === 1;
  let [inner, term] = [0, odd ? c : 1];
  for (let j = 0; j <= (v - (odd ? 3 : 2)) / 2; j++) {
    inner += term;
    term *= odd ? (c2 * (2 * j + 2)) / (2 * j + 3) : (c2 * (2 * j + 1)) / (2 * j + 2);
  }
  return odd ? (2 / Math.PI) * (theta + s * inner) : s * inner;
}

/** The point below which the share `p` (above a half, below 1) of the t curve with `df` whole degrees of freedom lies:
 * 1.372 for p = 0.9 and 10, the 80 % range's half width in typical misses. NaN for a p or df outside what is meant. */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0.5 && p < 1) || !Number.isInteger(df) || df < 1 || df > MOST_DF) return NaN;
  const want = 2 * p - 1;
  let [lo, hi] = [0, Math.PI / 2];
  // Stryker disable next-line EqualityOperator: halving 100 times is far below a double's last digit, so one more changes nothing
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    // Stryker disable next-line EqualityOperator: a chance exactly equal to the wanted one has probability 0, and either side gives the same point
    if (between(mid, df) < want) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(df) * Math.tan((lo + hi) / 2);
}

/** The half width of the 80 % range ("likely between") in typical misses, for `df` degrees of freedom. */
export function likelyBetween(df: number): number {
  return tQuantile(0.9, df);
}
