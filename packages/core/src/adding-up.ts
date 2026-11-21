// Adding values up exactly (GLOSSARY: Submission Rule, Observation, Breakdown; spec 0028 step 2, spec 0022). The
// "add up" rule used to be one statement in the database, `round(value + new, 6)`; with values sealed the database can no
// longer read them, so the core adds, with the same result: the sum of the two numbers as their shortest texts say
// them (0.1 + 0.2 is 0.3), rounded to 6 decimals with halves away from zero, as the database's numeric does. Pure.
import { fractionOf, nearestDouble, plus } from "./exact";

const MILLION = BigInt(1_000_000);
const ZERO = BigInt(0);
const TWO = BigInt(2);

/** `a + b` worked out exactly and rounded to 6 decimals, as the double nearest to the result; NaN when either is not a
 * finite number (a value that is not a number has no sum). */
export function addUp(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  const sum = plus(fractionOf(a), fractionOf(b));
  const scaled = sum.num * MILLION;
  // Half away from zero: half a unit more in the direction of the sign, then the quotient cut toward zero.
  // Stryker disable next-line EqualityOperator: for a sum of 0 the rounded sum is 0 whichever way the sign is read
  const half = scaled < ZERO ? -sum.den : sum.den;
  return nearestDouble((TWO * scaled + half) / (TWO * sum.den), MILLION);
}
