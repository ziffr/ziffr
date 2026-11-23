// The chance of a correlation by luck (GLOSSARY: Heads-up, Analysis; spec 0041, "Heads-ups"): how likely a correlation r
// over n pairs this far from 0 is if the two series had nothing to do with each other (the two-sided p-value of Pearson's
// r, which is only ever shown in Show the numbers, never in a sentence). Pure, in doubles.
//
// With df = n − 2 and t = r·√(df ÷ (1 − r²)) the chance is P(|T| ≥ |t|) for Student's t with df degrees of freedom, which
// is the regularized incomplete beta function I_x(df/2, ½) at x = df ÷ (df + t²) = 1 − r². It is worked out from the
// definition of that function: the continued fraction of Lentz's method (the one the incomplete beta function is
// standardly given by) and the log of the gamma function by Lanczos's approximation (g = 7, nine terms), each side of the
// switch at x = (a + 1) ÷ (a + b + 2) where the fraction converges fast. n need not be a whole number: an effective count
// (pair-scan.ts) is not. Checked against SciPy's `scipy.stats.t.sf` and `pearsonr` (fixtures/heads-up.py) to a relative
// 1e-9 in the whole range, tiny chances included.

// Lanczos's coefficients for g = 7, nine terms: ln Γ(z) accurate to about 1e-15 for z ≥ ½.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

// ln Γ(z) for z ≥ ½ (the arguments here are df/2, ½ and df/2 + ½ with df ≥ 1).
function lnGamma(z: number): number {
  const x = z - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

// The fraction has converged when a round changes it by less than this (a few units in the last place of a double).
const EPSILON = 3e-16;
const MOST_ROUNDS = 2000;

// Lentz's modified continued fraction for the incomplete beta function (the even and odd terms of each round), for
// x on the side of (a + 1) ÷ (a + b + 2) where it converges. For the shapes used here (a ≥ ½, b > 0, 0 < x < 1) no term
// of d or c is ever 0, so none is guarded; a grid of 400,000 shapes in the tests finds no NaN.
function fraction(x: number, a: number, b: number): number {
  const [sum, plusOne, minusOne] = [a + b, a + 1, a - 1];
  let c = 1;
  let d = 1 / (1 - (sum * x) / plusOne);
  let h = d;
  // Stryker disable next-line EqualityOperator: one round more than the last changes nothing once the fraction has converged, and it always has long before.
  for (let m = 1; m <= MOST_ROUNDS; m++) {
    const m2 = 2 * m;
    const even = (m * (b - m) * x) / ((minusOne + m2) * (a + m2));
    d = 1 / (1 + even * d);
    c = 1 + even / c;
    h *= d * c;
    const odd = (-(a + m) * (sum + m) * x) / ((a + m2) * (plusOne + m2));
    d = 1 / (1 + odd * d);
    c = 1 + odd / c;
    const step = d * c;
    h *= step;
    // Stryker disable next-line EqualityOperator: a step exactly EPSILON from 1 is followed by one at the square of that, so stopping one round earlier or later differs by far less than a unit in the last place.
    if (Math.abs(step - 1) < EPSILON) break;
  }
  return h;
}

// I_x(a, b) for 0 < x < 1, with `y` = 1 − x given on its own so that neither is lost to rounding when one is tiny.
function incompleteBeta(x: number, y: number, a: number, b: number): number {
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(y));
  // Each side is worked out where the fraction converges, so a small chance keeps its digits instead of being 1 − (almost 1).
  // Stryker disable next-line EqualityOperator,ArithmeticOperator: the switch only chooses the side that converges faster; both sides are exact everywhere, so moving it (or taking the equal point either way) changes the result by rounding only.
  return x < (a + 1) / (a + b + 2) ? (front * fraction(x, a, b)) / a : 1 - (front * fraction(y, b, a)) / b;
}

/** The chance, from 0 to 1, of a correlation at least as far from 0 as `r` over `n` pairs if there were no link at all (the
 * two-sided p-value of Pearson's r, Student's t with n − 2 degrees of freedom). `n` may be a fraction (an effective count).
 * NaN where it cannot be said: `r` outside −1 to 1 or not a number (1 − r² is then negative or NaN, and the logarithm of it NaN), or `n`
 * below 3 or not a number (fewer than one degree of freedom); exactly 1 for r = 0 and exactly 0 for |r| = 1 (the front factor is then
 * exactly 0, one way or the other). */
export function pValueOfR(r: number, n: number): number {
  if (!(n >= 3) || !Number.isFinite(n)) return NaN;
  // x = 1 − r² as (1 − |r|)(1 + |r|), so it keeps its digits for r near 1; y = r² for r near 0.
  const a = Math.abs(r);
  return incompleteBeta((1 - a) * (1 + a), a * a, (n - 2) / 2, 0.5);
}
