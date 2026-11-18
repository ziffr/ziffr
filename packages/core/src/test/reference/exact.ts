// Exact numbers for the references (spec 0022, Testing Decisions; GLOSSARY: Aggregation). A value is read from its
// text ("0.1", "1e-7") as a fraction of two whole numbers (BigInt), so a sum of 0.1 and 0.2 is 3/10 and nothing is
// lost. Written apart from the code under test: it shares nothing with display-periods.ts.

/** A number held exactly: `num / den`, with `den` positive and the fraction in lowest terms. */
export type Exact = { num: bigint; den: bigint };

const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a < 0n ? -a : a, b];
  while (y) [x, y] = [y, x % y];
  return x;
};

/** A fraction in lowest terms. */
export function fraction(num: bigint, den: bigint): Exact {
  if (den === 0n) throw new Error("Division by zero");
  if (den < 0n) [num, den] = [-num, -den];
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}

/** Zero. */
export const ZERO: Exact = { num: 0n, den: 1n };

/** A value as it is written, exactly: a JavaScript number by its shortest text (what the database sent), or a text
 * with an optional sign, a decimal point and an exponent. */
export function exactOf(value: number | string): Exact {
  const text = typeof value === "number" ? String(value) : value;
  const m = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!m) throw new Error(`Not a finite number: ${text}`);
  const digits = BigInt(`${m[2]}${m[3] ?? ""}`) * (m[1] === "-" ? -1n : 1n);
  const exp = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
  return exp >= 0 ? fraction(digits * 10n ** BigInt(exp), 1n) : fraction(digits, 10n ** BigInt(-exp));
}

/** a + b. */
export function plus(a: Exact, b: Exact): Exact {
  return fraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** a − b. */
export function minus(a: Exact, b: Exact): Exact {
  return plus(a, { num: -b.num, den: b.den });
}

/** a divided by a whole number. */
export function dividedBy(a: Exact, n: number | bigint): Exact {
  return fraction(a.num, a.den * BigInt(n));
}

/** The sum of some values. */
export function sumOf(values: readonly Exact[]): Exact {
  return values.reduce(plus, ZERO);
}

/** −1, 0 or 1 as a is below, equal to or above b. */
export function compareExact(a: Exact, b: Exact): number {
  const d = a.num * b.den - b.num * a.den;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

/** Whether two exact numbers are equal. */
export function same(a: Exact, b: Exact): boolean {
  return compareExact(a, b) === 0;
}

/** The value rounded to `decimals` places, half away from zero (as Ziffr's display does), as text with exactly that
 * many decimals and no minus on a zero: 1.005 to two places is "1.01", −0.004 is "0.00". */
export function roundedText(x: Exact, decimals: number): string {
  const scaled = (x.num < 0n ? -x.num : x.num) * 10n ** BigInt(decimals);
  let q = scaled / x.den;
  if (2n * (scaled % x.den) >= x.den) q++;
  const digits = q.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const text = decimals ? `${whole}.${digits.slice(-decimals)}` : whole;
  return x.num < 0n && q !== 0n ? `-${text}` : text;
}

/** How many decimal places the exact value has when written out, or null when it never ends (1/3). */
export function placesOf(x: Exact): number | null {
  let [twos, fives, den] = [0, 0, x.den];
  while (den % 2n === 0n) [den, twos] = [den / 2n, twos + 1];
  while (den % 5n === 0n) [den, fives] = [den / 5n, fives + 1];
  return den === 1n ? Math.max(twos, fives) : null;
}

/** Whether the exact value ends and has at most `n` significant digits: a sum of values with up to six decimals
 * always ends; an average such as 1/3 does not. */
export function fitsDigits(x: Exact, n: number): boolean {
  const places = placesOf(x);
  if (places === null) return false;
  const digits = roundedText(x, places).replace(/^-/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
  return digits.length <= n;
}

// The 64 bits of a double, read and written as the IEEE 754 standard lays them out.
const view = new DataView(new ArrayBuffer(8));
const bitsOf = (x: number) => (view.setFloat64(0, x), view.getBigUint64(0));
const doubleOf = (bits: bigint) => (view.setBigUint64(0, bits), view.getFloat64(0));

/** The exact value of a double: its significand times a power of two. */
export function exactOfDouble(x: number): Exact {
  const { m, e } = dyadic(x);
  return e >= 0 ? fraction(m << BigInt(e), 1n) : fraction(m, 1n << BigInt(-e));
}

/** A finite double as m · 2^e, both whole. */
function dyadic(x: number): { m: bigint; e: number } {
  if (!Number.isFinite(x)) throw new Error(`Not finite: ${x}`);
  const bits = bitsOf(x);
  const negative = bits >> 63n === 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fractionBits = bits & ((1n << 52n) - 1n);
  const significand = exponent === 0 ? fractionBits : fractionBits | (1n << 52n);
  return { m: negative ? -significand : significand, e: (exponent === 0 ? 1 : exponent) - 1075 };
}

/** Halfway between two doubles, as m · 2^e. */
function midpoint(a: { m: bigint; e: number }, b: { m: bigint; e: number }) {
  const e = Math.min(a.e, b.e);
  return { m: (a.m << BigInt(a.e - e)) + (b.m << BigInt(b.e - e)), e: e - 1 };
}

/** −1, 0 or 1 as an exact value is below, equal to or above m · 2^e: compared as whole numbers. */
function compareDyadic(x: Exact, d: { m: bigint; e: number }): number {
  const left = d.e < 0 ? x.num << BigInt(-d.e) : x.num;
  const right = d.e > 0 ? (d.m * x.den) << BigInt(d.e) : d.m * x.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The next double above (`up`) or below a finite one. */
function neighbour(x: number, up: boolean): number {
  if (x === 0) return up ? Number.MIN_VALUE : -Number.MIN_VALUE;
  return doubleOf(bitsOf(x) + ((x > 0) === up ? 1n : -1n));
}

/** Whether `x` is the double nearest to the exact value, ties to the even one: the best any JavaScript number can be.
 * Checked by exact comparison with the midpoints to both neighbours, not by converting. */
export function isNearestDouble(x: number, exact: Exact): boolean {
  if (!Number.isFinite(x)) return false;
  const here = dyadic(x);
  const low = midpoint(dyadic(neighbour(x, false)), here);
  const high = midpoint(here, dyadic(neighbour(x, true)));
  const even = (bitsOf(x) & 1n) === 0n;
  const fromLow = compareDyadic(exact, low);
  const toHigh = compareDyadic(exact, high);
  if (fromLow < 0 || toHigh > 0) return false;
  return (fromLow > 0 && toHigh < 0) || even;
}

/** An exact value as a short text for messages: its decimals when it ends, else the fraction. */
export function exactText(x: Exact): string {
  const places = placesOf(x);
  return places === null ? `${x.num}/${x.den}` : roundedText(x, places);
}

/** The double nearest to an exact value, ties to the even one: a first guess from its decimals, then the neighbour
 * that `isNearestDouble` confirms. What Ziffr holds for a combined value that a double cannot carry (1/3). */
export function nearestDoubleOf(x: Exact): number {
  if (x.num === 0n) return 0;
  // Enough decimals for 25 significant digits, however small the value: a guess within a double's spacing.
  const size = x.num < 0n ? -x.num : x.num;
  const zeros = Math.max(0, x.den.toString().length - size.toString().length);
  let guess = Number(roundedText(x, zeros + 25));
  // Walk to the nearest one from there: a few steps at most.
  for (let step = 0; step < 8; step++) {
    if (isNearestDouble(guess, x)) return guess;
    guess = neighbour(guess, compareDyadic(x, dyadic(guess)) > 0);
  }
  throw new Error(`No double is nearest to ${exactText(x)}`);
}
