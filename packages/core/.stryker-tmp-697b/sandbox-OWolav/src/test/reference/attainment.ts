// @ts-nocheck
// The reference for Attainment (spec 0022, ticket #130; GLOSSARY: Attainment): both methods written down as plainly
// as possible, separately from compare.ts and sharing nothing with it. It works on exact fractions of the numbers'
// decimal text, so a test compares the code with the exact result and not with a floating-point neighbour.
//
// The rules, in words:
// - Ratio: "higher is better" is value ÷ target; "lower is better" is target ÷ value; a range compares with the
//   bound the value is outside of (below: value ÷ lower bound; above: upper bound ÷ value), 100 % inside. No
//   percentage for a target at or below 0, or for a value at or below 0 when lower is better.
// - Distance: 100 % plus how far the value is on the good side of the target, in steps of the target's size
//   (|target|): ahead by half a target is 150 %, short by half is 50 %. A range is 100 % inside and measured from the
//   bound it is outside of. No percentage for a target of 0.
// - Neither has a percentage without a target.

/** An exact fraction n / d with d > 0. */
type Fraction = { n: bigint; d: bigint };

/** The exact fraction a finite number's decimal text stands for, such as "-0.5" → -1/2. */
function exact(x: number): Fraction {
  const text = String(x);
  if (text.includes("e")) throw new Error(`The reference takes plain decimals only, not ${text}.`);
  const negative = text.startsWith("-");
  const [whole, part = ""] = text.replace("-", "").split(".");
  const n = BigInt(whole + part) * (negative ? -1n : 1n);
  return { n, d: 10n ** BigInt(part.length) };
}

const minus = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const plus = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const times = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.n, d: a.d * b.d });
const over = (a: Fraction, b: Fraction): Fraction => (b.n < 0n ? { n: -a.n * b.d, d: a.d * -b.n } : { n: a.n * b.d, d: a.d * b.n });
const abs = (a: Fraction): Fraction => ({ n: a.n < 0n ? -a.n : a.n, d: a.d });
const sign = (a: Fraction) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
const below = (a: Fraction, b: Fraction) => sign(minus(a, b)) < 0;
const HUNDRED: Fraction = { n: 100n, d: 1n };

/** The fraction as the nearest number, through its decimal text so nothing is lost on the way. */
function toNumber(a: Fraction): number {
  // Twenty digits after the point are more than a double holds.
  const scaled = (a.n * 10n ** 20n) / a.d;
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(21, "0");
  return Number(`${negative ? "-" : ""}${digits.slice(0, -20)}.${digits.slice(-20)}`);
}

/** Attainment in % by `method` for a value against a target, or null where the method has no percentage. */
export function referenceAttainment(method: "ratio" | "distance", polarity: "higher" | "lower" | "target", value: number, min: number | null, max: number | null): number | null {
  const a = referenceAttainmentExact(method, polarity, value, min, max);
  return a === null ? null : toNumber({ n: a.num, d: a.den });
}

/** Attainment as the exact fraction `num / den` (den positive), so a test can ask for the double nearest to it. */
export function referenceAttainmentExact(method: "ratio" | "distance", polarity: "higher" | "lower" | "target", value: number, min: number | null, max: number | null): { num: bigint; den: bigint } | null {
  const a = attainmentOf(method, polarity, value, min, max);
  return a === null ? null : { num: a.n, den: a.d };
}

function attainmentOf(method: "ratio" | "distance", polarity: "higher" | "lower" | "target", value: number, min: number | null, max: number | null): Fraction | null {
  const v = exact(value);
  const lo = min === null ? null : exact(min);
  const hi = max === null ? null : exact(max);

  // Which bound the value is measured against, and whether more is better there; "inside" is on target.
  let bound: Fraction | null;
  let moreIsBetter: boolean;
  if (polarity === "higher") { bound = lo; moreIsBetter = true; }
  else if (polarity === "lower") { bound = hi; moreIsBetter = false; }
  else {
    if (lo === null && hi === null) return null;
    if (lo !== null && below(v, lo)) { bound = lo; moreIsBetter = true; }
    else if (hi !== null && below(hi, v)) { bound = hi; moreIsBetter = false; }
    else return HUNDRED;
  }
  if (bound === null) return null;

  if (method === "ratio") {
    if (sign(bound) <= 0) return null;
    if (moreIsBetter) return times(over(v, bound), HUNDRED);
    if (sign(v) <= 0) return null;
    return times(over(bound, v), HUNDRED);
  }
  if (sign(bound) === 0) return null;
  const ahead = moreIsBetter ? minus(v, bound) : minus(bound, v);
  return plus(HUNDRED, times(over(ahead, abs(bound)), HUNDRED));
}
