// The reference for the check of a Look-alike (GLOSSARY: Look-alike; spec 0053, Testing Decisions), written another way from methods/look-alike-clear.ts: SplitMix64
// on four 16-bit limbs of plain numbers (no BigInt, no `<<`), the remainder by long division over the limbs, Fisher-Yates from its published definition,
// every shuffled copy put through the reference's plain Ward search (test/reference/look-alike.ts), the von Neumann ratio from its definition on exact
// fractions, and the verdict from c. It shares nothing with the code it checks except the numbers in the spec.
import { dayOf, monthsLater } from "./calendar";
import { compareExact, fraction, type Exact } from "./exact";
import { referenceKinds, referencePrepared, type ReferenceSeries } from "./look-alike";
import type { Span } from "../../periods";

// A 64-bit number as four limbs of 16 bits, least significant first.
type Word = [number, number, number, number];

const limbsOf = (hex: string): Word => {
  const h = hex.padStart(16, "0");
  return [3, 2, 1, 0].map((k) => parseInt(h.slice(k * 4, k * 4 + 4), 16)) as Word;
};
const GOLDEN = limbsOf("9e3779b97f4a7c15");
const MIX1 = limbsOf("bf58476d1ce4e5b9");
const MIX2 = limbsOf("94d049bb133111eb");

function add(a: Word, b: Word): Word {
  const out: Word = [0, 0, 0, 0];
  let carry = 0;
  for (let k = 0; k < 4; k++) {
    const s = a[k] + b[k] + carry;
    out[k] = s % 65536;
    carry = Math.floor(s / 65536);
  }
  return out;
}

// The product modulo 2^64, limb by limb (every partial product is below 2^32, and a column of them below 2^36: exact in a double).
function times(a: Word, b: Word): Word {
  const out: Word = [0, 0, 0, 0];
  let carry = 0;
  for (let k = 0; k < 4; k++) {
    let column = carry;
    for (let i = 0; i <= k; i++) column += a[i] * b[k - i];
    out[k] = column % 65536;
    carry = Math.floor(column / 65536);
  }
  return out;
}

// x XOR (x shifted right by `by` bits), by taking the bits one at a time.
function xorShift(x: Word, by: number): Word {
  const bits = (w: Word) => w.flatMap((limb) => Array.from({ length: 16 }, (_, b) => (limb >> b) & 1));
  const [a, shifted] = [bits(x), bits(x).slice(by).concat(Array(by).fill(0))];
  const mixed = a.map((bit, i) => bit ^ shifted[i]);
  return [0, 1, 2, 3].map((k) => mixed.slice(k * 16, k * 16 + 16).reduce((v, bit, b) => v + bit * 2 ** b, 0)) as Word;
}

/** The next outputs of SplitMix64 from a seed, as 16 hex digits, by the published steps (state += golden ratio constant; two xor-shift and multiply rounds; a last xor-shift). */
export function referenceSplitMix(seed: number | string, count: number): string[] {
  let state: Word = typeof seed === "number" ? ([0, 1, 2, 3].map((k) => Math.floor(seed / 65536 ** k) % 65536) as Word) : limbsOf(seed);
  const out: string[] = [];
  for (let n = 0; n < count; n++) {
    state = add(state, GOLDEN);
    const z = xorShift(times(xorShift(times(xorShift(state, 30), MIX1), 27), MIX2), 31);
    out.push([3, 2, 1, 0].map((k) => z[k].toString(16).padStart(4, "0")).join(""));
  }
  return out;
}

// A hex number modulo a small whole number, by long division over its digits.
const modulo = (hex: string, m: number) => [...hex].reduce((r, d) => (r * 16 + parseInt(d, 16)) % m, 0);

/** The order Fisher-Yates driven by SplitMix64 gives the places 0 to n − 1: for i from n − 1 down to 1, swap place i with place j, j the next number modulo i + 1. */
export function referenceOrder(n: number, seed: number): number[] {
  const draws = referenceSplitMix(seed, Math.max(0, n - 1));
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i >= 1; i--) {
    const j = modulo(draws[n - 1 - i], i + 1);
    const held = order[i];
    order[i] = order[j];
    order[j] = held;
  }
  return order;
}

// ---- Metrics that change slowly, from the definition ----

const follows = (a: string, b: string, span: Span): boolean => {
  const [x, y] = [dayOf(a), dayOf(b)];
  if (span === "day") return y === x + 1;
  if (span === "week") return y === x + 7;
  const months = { month: 1, quarter: 3, half: 6, year: 12 }[span];
  return y === monthsLater(x, months);
};

/** Whether Σ (x_t − x_{t−1})² over periods that follow one another is below half of Σ (x_t − x̄)²: the column's values by period, exactly. */
export function referenceSlow(column: readonly Exact[], periods: readonly string[], span: Span): boolean {
  const n = column.length;
  const sub = (a: Exact, b: Exact) => fraction(a.num * b.den - b.num * a.den, a.den * b.den);
  const mul = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
  const sum = (xs: Exact[]) => xs.reduce((s, x) => fraction(s.num * x.den + x.num * s.den, s.den * x.den), fraction(0n, 1n));
  const mean = fraction(sum([...column]).num, sum([...column]).den * BigInt(n));
  const spread = sum(column.map((x) => mul(sub(x, mean), sub(x, mean))));
  const steps = sum(column.flatMap((x, i) => (i > 0 && follows(periods[i - 1], periods[i], span) ? [mul(sub(x, column[i - 1]), sub(x, column[i - 1]))] : [])));
  return compareExact(steps, mul(spread, fraction(1n, 2n))) < 0;
}

// ---- the check ----

/** What the reference says of the shuffles: c, the Metrics that change slowly (their ids), the most that may reach the gap, and the verdict. */
export type ReferenceClearness = { reached: number; slow: string[]; allowed: number; beaten: boolean; wide: boolean; clear: boolean; gap: string };

const parts = (g: string): Exact | "endless" => {
  if (g === "endless") return g;
  const [p, q] = g.split("/");
  return fraction(BigInt(p), BigInt(q));
};
// Whether the gap a is at least the gap b (an endless gap is at least every gap, and only an endless one is at least an endless one).
const atLeast = (a: string, b: string | Exact): boolean => {
  const [x, y] = [parts(a), typeof b === "string" ? parts(b) : b];
  if (x === "endless") return true;
  if (y === "endless") return false;
  return compareExact(x, y) >= 0;
};

/** The check of a Look-alike by the definitions in the spec, all 99 shuffles and no early stop: the series are read, put into kinds, shuffled as the spec says (the first Metric stays, Metric j of the others has seed r · 16 + j) and the kinds worked out again for each; null where there is no Look-alike to check (a refusal of the Method, or no count of kinds big enough). */
export function referenceClearness(series: readonly ReferenceSeries[], span: Span, asked: number | null): ReferenceClearness | null {
  const prepared = referencePrepared(series, span);
  if (series.length < 2 || series.length > 6 || prepared.periods.length < 24 || series.length * 6 > prepared.periods.length) return null;
  const real = referenceKinds(prepared, asked);
  if ("refused" in real) return null;
  const n = prepared.periods.length;
  let reached = 0;
  for (let r = 1; r <= 99; r++) {
    const orders = prepared.ids.map((_, j) => (j === 0 ? null : referenceOrder(n, r * 16 + j + 1)));
    const values = prepared.values.map((_, i) => prepared.values[0].map((__, j) => prepared.values[orders[j] === null ? i : orders[j]![i]][j]));
    const copy = referenceKinds({ ...prepared, values }, asked);
    if (!("refused" in copy) && atLeast(copy.gap, real.gap)) reached++;
  }
  const slow = prepared.ids.filter((_, j) =>
    referenceSlow(
      prepared.values.map((row) => row[j]),
      prepared.periods,
      span,
    ),
  );
  const allowed = slow.length > 0 ? 0 : 3;
  const wide = atLeast(real.gap, fraction(9n, 1n));
  return { reached, slow, allowed, beaten: reached <= allowed, wide, clear: reached <= allowed && wide, gap: real.gap };
}
