// Exact arithmetic on values (spec 0022, "Exact results"; GLOSSARY: Aggregation, Comparison, Attainment). A value is
// read from its shortest text, the way it came from the database, as a fraction of two BigInts; sums, differences,
// changes and Attainment are worked out on those without loss, and only the result becomes a double, the one nearest
// to it. Adding or dividing doubles gives 0.30000000000000004 for 0.1 + 0.2 and 0.19999999999999998 for 0.3 − 0.1;
// this gives 0.3 and 0.2. Pure, so the browser computes the same numbers.
//
// BigInt(…) rather than literals such as 10n: the app's TypeScript targets a version before BigInt literals.
const [ZERO, ONE, TWO, TEN, HUNDRED] = [BigInt(0), BigInt(1), BigInt(2), BigInt(10), BigInt(100)];
const TEXT = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

/** A number held exactly as `num / den`, `den` positive. */
export type Fraction = { num: bigint; den: bigint };

/** A finite value as digits and how many of them are decimals: 1.25 is 125 and 2, 1e-7 is 1 and 7. */
export function scaled(v: number): { digits: bigint; places: number } {
  const [, sign, whole, decimals = "", exp] = TEXT.exec(String(v))!;
  const places = decimals.length - Number(exp ?? 0);
  // 1e21 has no decimals: its digits are multiplied out instead.
  return { digits: BigInt(`${sign}${whole}${decimals}`) * TEN ** BigInt(Math.max(0, -places)), places: Math.max(0, places) };
}

/** A finite value exactly as its shortest text says: 0.1 is 1/10, not the double nearest to it. */
export function fractionOf(v: number): Fraction {
  const { digits, places } = scaled(v);
  return { num: digits, den: TEN ** BigInt(places) };
}

// The size of a whole number.
// Stryker disable next-line EqualityOperator: for a BigInt, -0 and 0 are the same number, so `<=` changes nothing
const size = (n: bigint) => (n < ZERO ? -n : n);

/** How many bits a whole number's size takes (0 has one). */
export const bitLength = (n: bigint) => size(n).toString(2).length;
const TWO_53 = TWO ** BigInt(53);

/** The double nearest to num / den (den positive), ties to even: the quotient is taken to 53 bits with the
 * remainder deciding the last one, then scaled by a power of two, which is exact. Values Ziffr keeps are far from
 * the edges of the double range, so no result is subnormal or infinite. */
export function nearestDouble(num: bigint, den: bigint): number {
  const negative = num < ZERO;
  const a = size(num);
  // A first guess for the power of two that brings the quotient to 53 bits; one more when it lands on 54. A zero
  // comes out as a quotient of 0.
  let e = bitLength(a) - bitLength(den) - 53;
  const divide = (shift: number) => {
    const [top, by] = [a << BigInt(Math.max(0, -shift)), den << BigInt(Math.max(0, shift))];
    return [top / by, top % by, by];
  };
  let [q, r, d] = divide(e);
  // Stryker disable next-line EqualityOperator: a quotient of exactly 2^53 rounds to the same double either way, as 2^53 + 1 is not one
  if (q >= TWO_53) [q, r, d] = divide(++e);
  if (TWO * r > d || (TWO * r === d && (q & ONE) === ONE)) q++;
  const x = Number(q) * 2 ** e;
  return negative ? -x : x;
}

/** The sum of the values divided by `count`, as the double nearest to the exact result. A value that is not finite
 * has no exact sum: NaN, which shows as no value. */
export function exactTotal(values: readonly number[], count: number): number {
  if (!values.every((v) => Number.isFinite(v))) return NaN;
  const parts = values.map(scaled);
  const places = Math.max(...parts.map((p) => p.places));
  const sum = parts.reduce((a, p) => a + p.digits * TEN ** BigInt(places - p.places), ZERO);
  return nearestDouble(sum, TEN ** BigInt(places) * BigInt(count));
}

/** A number written as digits with an optional decimal part ("12", "0.5"), exactly. */
export function fractionOfText(text: string): Fraction {
  const [, sign, whole, decimals = ""] = TEXT.exec(text)!;
  return { num: BigInt(`${sign}${whole}${decimals}`), den: TEN ** BigInt(decimals.length) };
}

/** A fraction in lowest terms: numerator and denominator divided by their greatest common divisor. */
export function lowestTerms(a: Fraction): Fraction {
  let [x, y] = [size(a.num), a.den];
  while (y) [x, y] = [y, x % y];
  // x is at least 1: the denominator is.
  return { num: a.num / x, den: a.den / x };
}

/** a + b on fractions. */
export const plus = (a: Fraction, b: Fraction): Fraction => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
/** a − b on fractions. */
export const minus = (a: Fraction, b: Fraction): Fraction => ({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
/** a × b on fractions. */
export const times = (a: Fraction, b: Fraction): Fraction => ({ num: a.num * b.num, den: a.den * b.den });
/** a ÷ b on fractions, the denominator kept positive; b is not 0. */
// Stryker disable next-line EqualityOperator: b is never 0 here, so `<=` divides the same way
export const over = (a: Fraction, b: Fraction): Fraction => (b.num < ZERO ? { num: -a.num * b.den, den: a.den * -b.num } : { num: a.num * b.den, den: a.den * b.num });
/** The double nearest to a fraction. */
export const nearest = (a: Fraction) => nearestDouble(a.num, a.den);
const times100 = (a: Fraction): Fraction => ({ num: a.num * HUNDRED, den: a.den });
const plus100 = (a: Fraction): Fraction => ({ num: a.num + HUNDRED * a.den, den: a.den });
const finite = (...vs: number[]) => vs.every((v) => Number.isFinite(v));

/** a − b, exactly on the values' text, as the nearest double: 0.3 − 0.1 is 0.2. NaN for a value that is not finite. */
export function difference(a: number, b: number): number {
  return finite(a, b) ? nearest(minus(fractionOf(a), fractionOf(b))) : NaN;
}

/** The change from `previous` to `current` in % of the size of `previous`, (current − previous) ÷ |previous| × 100,
 * exactly, as the nearest double: from −10 to −5 is +50 %. Null from 0, where no share means anything. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  if (!finite(current, previous)) return NaN;
  const p = fractionOf(previous);
  return nearest(times100(over(minus(fractionOf(current), p), { num: size(p.num), den: p.den })));
}

/** a ÷ b × 100, exactly, as the nearest double: 0.1 of 0.3 is 33.333333333333336 %, 1 of 3 the same. `b` is not 0. */
export function percentOf(a: number, b: number): number {
  return finite(a, b) ? nearest(times100(over(fractionOf(a), fractionOf(b)))) : NaN;
}

/** 100 % plus `ahead` in steps of |`by`|, 100 + ahead ÷ |by| × 100, exactly, as the nearest double, with `ahead`
 * itself the exact difference `a − b`: 0.1 over 0.2 is 50 %, not 49.99…. `by` is not 0; NaN for a value that is
 * not finite. */
export function distancePct(a: number, b: number, by: number): number {
  if (!finite(a, b, by)) return NaN;
  const s = fractionOf(by);
  return nearest(plus100(times100(over(minus(fractionOf(a), fractionOf(b)), { num: size(s.num), den: s.den }))));
}

/** Whether the change from `previous` to `current` is larger in size than `limit` % of the size of `previous`, decided
 * exactly: a change of exactly the limit is not larger, however the doubles round. `previous` is not 0. */
export function changeBeyond(current: number, previous: number, limit: number): boolean {
  // A value that is not a number has no change to judge.
  if (!finite(current, previous, limit)) return false;
  const [d, p, l] = [minus(fractionOf(current), fractionOf(previous)), fractionOf(previous), fractionOf(limit)];
  // |d| × 100 > l × |p|, with every denominator multiplied out.
  return size(d.num) * HUNDRED * l.den * p.den > l.num * size(p.num) * d.den;
}
