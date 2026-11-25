// Are the kinds of a Look-alike clearer than chance? (GLOSSARY: Look-alike; spec 0053, ticket 2.) Pure, and exact like the Method it checks.
//
// The real kinds are put beside 99 shuffled copies of the same values. In a copy the first Metric (in the order of the ids) stays as it is and
// every other Metric's values are put in another order of the periods, by a Fisher-Yates shuffle driven by SplitMix64, so the Metrics of a copy
// have nothing to do with each other and a period's own past is broken. What a copy keeps is what the real series is read as (its basis,
// its spread: a shuffle changes neither), and the kinds, the count (the person's, or by the same rule) and the gap are worked out again.
//
//  - c is the number of copies whose gap² is at least the real gap²;
//  - the kinds are clear when (1 + c) ÷ 100 is at most 1/25 (c at most 3) and the gap is at least 3 (gap² at least 9);
//  - a Metric that changes slowly (its von Neumann ratio, Σ (x_t − x_{t−1})² over periods that follow one another divided by Σ (x_t − x̄)²,
//    is below 1/2) makes the bar 1/100 (c = 0): its periods look like their neighbours whatever the other Metrics do, and a shuffle breaks that.
// Everything is whole numbers; no decision is a double, a square root or a random draw that differs between machines.
//
// The whole run (the real kinds and the 99 copies) is bounded (`withWork`): one that would spend more is refused in words, never cut short.
import { digits, spend, WORK_BUDGET, withWork } from "../work-bound";
import { type Fraction } from "../exact";
import { periodsBetween, type Span } from "../periods";
import { choiceOf, compareGaps, kindsOf, preparedFor, type Gap, type LookAlike, type LookAlikeOptions, type LookAlikeRefusal, type LookAlikeSeries, type Prepared } from "./look-alike";

const [ZERO, ONE, TWO] = [BigInt(0), BigInt(1), BigInt(2)];

/** The numbers of the check, once: the shuffles, the largest c each bar lets through, the smallest gap² and the von Neumann ratio below which a Metric is slow (num ÷ den). */
export const CLEARNESS = {
  shuffles: 99,
  /** The most shuffles that may reach the real gap: (1 + c) ÷ 100 at most 1/25, and at most 1/100 where a Metric changes slowly. */
  allowed: { usual: 3, slow: 0 },
  /** The real gap, squared, must be at least this (a gap of 3). */
  floor: 9,
  slow: { num: 1, den: 2 },
  /** The first shuffle's number; the seed of shuffle r and Metric j (the Metrics in the order of their ids, the first is j = 1 and is not shuffled) is r · 16 + j. */
  seedStep: 16,
} as const;

// ---- SplitMix64 and Fisher-Yates, exactly ----

const WORD = (ONE << BigInt(64)) - ONE;
const [GOLDEN, MIX1, MIX2] = [BigInt("0x9e3779b97f4a7c15"), BigInt("0xbf58476d1ce4e5b9"), BigInt("0x94d049bb133111eb")];

/** SplitMix64 (Steele, Lea and Flood; Vigna's public-domain C version), the 64-bit generator: from a seed, the next 64-bit numbers as BigInt, all arithmetic modulo 2^64. */
export function splitMix64(seed: bigint): () => bigint {
  let state = seed & WORD;
  return () => {
    state = (state + GOLDEN) & WORD;
    const a = ((state ^ (state >> BigInt(30))) * MIX1) & WORD;
    const b = ((a ^ (a >> BigInt(27))) * MIX2) & WORD;
    return b ^ (b >> BigInt(31));
  };
}

/** The places 0 to n − 1 in another order, by Fisher-Yates driven by SplitMix64 from `seed`: i from n − 1 down to 1 swaps place i with place (the next number mod i + 1). The remainder is not exactly even (the bias is below 2^-58), which is of no account: what matters is that the order is the same on every machine. */
export function shuffleOrder(n: number, seed: bigint): number[] {
  const next = splitMix64(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i >= 1; i--) {
    const j = Number(next() % BigInt(i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The seed of shuffle `r` (1 to 99) for the Metric in place `metric` of the ids (2 and up: the first Metric is not shuffled). */
export const seedOf = (r: number, metric: number): bigint => BigInt(r * CLEARNESS.seedStep + metric);

/** The prepared values with every Metric but the first put in the order that shuffle `r` gives: period i of a Metric takes the value the Metric had at the place `order[i]`. */
export function shuffled(prepared: Prepared, r: number): Prepared {
  const n = prepared.periods.length;
  const values = prepared.values.map((col, j) => (j === 0 ? col : shuffleOrder(n, seedOf(r, j + 1)).map((i) => col[i])));
  return { ...prepared, values };
}

// ---- Metrics that change slowly ----

// The greatest common divisor of two positive whole numbers.
const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a, b];
  while (y) [x, y] = [y, x % y];
  return x;
};

/** Whether a Metric's values (as read, by period) change slowly: Σ (x_t − x_{t−1})² over the periods that follow one another in the calendar, divided by Σ (x_t − x̄)², is below 1/2. Exactly, on whole numbers on one denominator. */
export function changesSlowly(values: readonly Fraction[], periods: readonly string[], span: Span): boolean {
  const n = values.length;
  const lcm = values.reduce((l, f) => (l / gcd(l, f.den)) * f.den, ONE);
  const a = values.map((f) => f.num * (lcm / f.den));
  // n·Σ(x − x̄)² = n·Σa² − (Σa)², on the scale of a; and Σ (a_t − a_{t−1})² on the same scale.
  const sum = a.reduce((t, x) => t + x, ZERO);
  const spread = BigInt(n) * a.reduce((t, x) => t + x * x, ZERO) - sum * sum;
  let steps = ZERO;
  for (let i = 1; i < n; i++) if (periodsBetween(periods[i - 1], periods[i], span) === 1) steps += (a[i] - a[i - 1]) ** TWO;
  // steps ÷ (spread ÷ n) < 1/2, with a spread of 0 (a Metric that does not vary, which no Look-alike has) never slow.
  return spread > ZERO && BigInt(CLEARNESS.slow.den) * steps * BigInt(n) < BigInt(CLEARNESS.slow.num) * spread;
}

// ---- the check ----

/** What the shuffles say: how many were worked out (`ran`), how many reached the real gap (`reached`, the c of the spec; with `early` only as far as it was needed), the Metrics that change slowly, the most that may reach it, and the verdicts. */
export type Clearness = {
  shuffles: number;
  ran: number;
  reached: number;
  slow: string[];
  allowed: number;
  /** The real gap beat the shuffles: c at most `allowed`. */
  beaten: boolean;
  /** The real gap is at least 3 (gap² at least 9). */
  wide: boolean;
  /** The kinds are clear: both. */
  clear: boolean;
};

/** The real gap and the shuffles' (null: a shuffle that has no count of kinds big enough, which reaches nothing). */
const reaches = (shuffle: Gap | null, real: Gap): boolean => shuffle !== null && compareGaps(shuffle, real) >= 0;

const FLOOR: Gap = { num: BigInt(CLEARNESS.floor), den: ONE };

/** The units of work one run of the Method (the real kinds, or one shuffle) is counted as: about n³ steps of the joining, each over the Metrics and as dear as the square of
 * the widest value's size in 64-bit words, the values as whole numbers on one denominator per Metric (plus one, for the rest of the number), times 20. Calibrated on the time of a run: values to the cent, to 17 digits and of 17 digits
 * over 24 orders of magnitude take 1 : 2.4 : 5.5, and (1 + words)² is 4 : 9 : 16; at 20 units for about a nanosecond a Look-alike of 6 Metrics over 60 periods to the cent
 * spends about three tenths of the allowance (a third at most), and values of 24 orders of magnitude with 17 digits each (about 2 seconds) are refused. */
export function runWork(prepared: Prepared): number {
  const n = prepared.periods.length;
  // The values as whole numbers on one denominator per Metric, as the Method works on them: those are the numbers that are multiplied.
  const widest = prepared.values.reduce((w, col) => {
    const lcm = col.reduce((l, f) => (l / gcd(l, f.den)) * f.den, ONE);
    return col.reduce((v, f) => Math.max(v, digits(f.num * (lcm / f.den))), w);
  }, 1);
  return 20 * n * n * n * prepared.ids.length * (1 + Math.ceil(widest / 16)) ** 2;
}

/** The check of kinds already found (`gap` the real kinds' gap², `kinds` the count asked for): the 99 shuffles one by one, each counted as `work` units of the running bound. With `early` it stops at the first shuffle that decides the verdict (more than `allowed` have reached the gap), so `reached` is then only as large as needed. */
export function clearnessOf(prepared: Prepared, gap: Gap, asked: number | null, early: boolean, work: number): Clearness {
  const slow = prepared.ids.filter((_, j) => changesSlowly(prepared.values[j], prepared.periods, prepared.span));
  const allowed = slow.length > 0 ? CLEARNESS.allowed.slow : CLEARNESS.allowed.usual;
  let [ran, reached] = [0, 0];
  for (let r = 1; r <= CLEARNESS.shuffles && !(early && reached > allowed); r++) {
    spend(work);
    const copy = choiceOf(shuffled(prepared, r), asked);
    ran++;
    if (reaches(copy.ok ? copy.gap : null, gap)) reached++;
  }
  const [beaten, wide] = [reached <= allowed, compareGaps(gap, FLOOR) >= 0];
  return { shuffles: CLEARNESS.shuffles, ran, reached, slow, allowed, beaten, wide, clear: beaten && wide };
}

/** What a person may ask of a checked Look-alike: as of a Look-alike, and `early` to stop the shuffles at the first that decides (the verdict is the same; the count c is then partial), `allowance` for the work bound (the default of the Methods). */
export type CheckedOptions = LookAlikeOptions & { early?: boolean; allowance?: number };

/** A Look-alike with its check. */
export type CheckedLookAlike = LookAlike & { clearness: Clearness };

/** Why there is no checked Look-alike: as for a Look-alike, or the whole run would spend more than its allowance of work. */
export type CheckedRefusal = LookAlikeRefusal | { ok: false; why: "work" };

/** The Look-alike of Metrics' series with its check against the 99 shuffles, all under one allowance of work: refused in codes as `lookAlike` refuses, or `work` where the run would spend more (never cut short, never fewer shuffles). */
export function lookAlikeChecked(series: readonly LookAlikeSeries[], span: Span, options: CheckedOptions = {}): CheckedLookAlike | CheckedRefusal {
  const prepared = preparedFor(series, span);
  if ("ok" in prepared) return prepared;
  const done = withWork(
    () => {
      const work = runWork(prepared);
      spend(work);
      const real = kindsOf(prepared, options);
      return real.ok ? { ...real, clearness: clearnessOf(prepared, real.gap, real.asked, options.early === true, work) } : real;
    },
    options.allowance ?? WORK_BUDGET,
  );
  return done ?? { ok: false, why: "work" };
}
