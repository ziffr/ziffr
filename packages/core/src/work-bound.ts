// The work bound of the exact Methods (GLOSSARY: Method, Takeaway; spec 0041, rule 12: never a quiet number). Methods work
// exactly on the values as written (exact.ts), and the cost of that grows with how many digits the values need: a series
// that mixes 9.8e14 with 1e-300 needs numbers of 300 digits at every step, and a fit of six drivers on such values took
// seconds on the server's one event loop, where anyone who can submit a value (a submitter, a Feed, an API key) can plant
// them and a View Link visitor starts the work. So two things are decided before and while the work is done, and both end in
// a refusal in words, never in a wrong or a late number:
//
//   1. `wideFindings`: a series whose values need more than 20 decimal places, or whose largest size is more than 10^20 times
//      its smallest size that is not 0, is refused before any arithmetic. Decided exactly on the values' text, never on a
//      double. Values that a person keeps (money to the cent, a rate to ten places, a share of a million) are far inside.
//   2. `withWork` and `spend`: a Method that keeps many exact numbers at once (the multiple fit, which solves for every
//      driver, refits for each pair it merges and again without the far-off periods) counts the digit work it does and stops
//      when its budget is spent, so that even values inside the first limit (or a very large size, which no decimal place
//      catches) cannot keep the server busy for long. The count is of digits, not of seconds: the same input spends the same
//      on every machine, and stops at the same step.
//
// Pure apart from the counter of the one bound that is running, which is only touched by synchronous code.
import { readSeries } from "./basis";
import { scaled, type Fraction } from "./exact";
import type { Finding } from "./suitability";
import type { Point } from "./types";

/** The limits: decimal places in the text of a value, and orders of magnitude (powers of ten) from the smallest size that is not 0 to the largest. */
export const WORK_BOUND = { places: 20, orders: 20 } as const;
/** The digit work one bounded Method may spend, in the units of `spend`: a fraction of a second on a laptop for the multiple fit: six drivers and 120 periods of values to 6 decimal places just fit, and values to the cent need a third of it. */
export const WORK_BUDGET = 2_500_000_000;

const [ZERO, TEN] = [BigInt(0), BigInt(10)];
const SPAN = TEN ** BigInt(WORK_BOUND.orders);

/** What is too much about a list of values: the decimal places they need, or the orders of magnitude they span; null for none. */
export type Wide = "places" | "orders";

/** Whether finite values need more than 20 decimal places or span more than 20 orders of magnitude, decided exactly on their text. A value that is not a number is no value and not looked at. */
export function wideReason(values: readonly number[]): Wide | null {
  const parts = values.filter((v) => Number.isFinite(v)).map(scaled);
  if (parts.some((p) => p.places > WORK_BOUND.places)) return "places";
  // Every size on one scale of 10^-20 (no value has more places than that), so they are whole numbers and the largest over the smallest is a division-free comparison.
  // Stryker disable next-line EqualityOperator: for 0 the sign does not matter, and a size of 0 is left out below.
  const sizes = parts.map((p) => (p.digits < ZERO ? -p.digits : p.digits) * TEN ** BigInt(WORK_BOUND.places - p.places)).filter((s) => s !== ZERO);
  // Stryker disable next-line EqualityOperator: for equal sizes either is the largest (or the smallest), the same size.
  return sizes.length > 0 && sizes.reduce((a, b) => (a > b ? a : b)) > SPAN * sizes.reduce((a, b) => (a < b ? a : b)) ? "orders" : null;
}

const CASES = { places: "refuse-exact-places", orders: "refuse-exact-orders" } as const;

/** The refusals for the series that are too wide to work out exactly, one for each, in the order given; none for series that are fine. Values are read as every Method reads them (a period twice counts once). */
export function wideFindings(series: readonly { name: string; points: Point[] }[]): Finding[] {
  return series.flatMap((s) => {
    const why = wideReason(readSeries(s.points).map((p) => p.value));
    return why ? [{ case: CASES[why], slots: { name: s.name, ...WORK_BOUND } }] : [];
  });
}

/** The same for the columns of a fit's rows (the target's, then each driver's), named as given. */
export function wideColumns(names: readonly string[], columns: readonly (readonly number[])[]): Finding[] {
  return columns.flatMap((c, i) => {
    const why = wideReason(c);
    return why ? [{ case: CASES[why], slots: { name: names[i], ...WORK_BOUND } }] : [];
  });
}

// ---- the work budget ----

/** Thrown when a bounded Method has spent its budget; only `withWork` catches it. */
class OutOfWork extends Error {}
let left: number | null = null;

/** Runs `f` with a budget of digit work: its result, or null when the budget was spent first. Inside a bound that is already running there is only that one: the outer call counts and answers. */
export function withWork<T>(f: () => T, budget: number = WORK_BUDGET): T | null {
  if (left !== null) return f();
  left = budget;
  try {
    return f();
  } catch (e) {
    if (e instanceof OutOfWork) return null;
    throw e;
  } finally {
    left = null;
  }
}

/** Spends `cost` of the running budget, and stops the Method (see `withWork`) where there is not that much left; nothing is counted outside a bound. */
export function spend(cost: number): void {
  if (left === null) return;
  if (cost > left) throw new OutOfWork();
  left -= cost;
}

const LIMB = TEN ** BigInt(19);
/** How many digits a whole number takes, as a unit of work: 1 for anything that fits a machine word, so small numbers cost almost nothing to count. */
export const digits = (n: bigint): number => (n < LIMB && n > -LIMB ? 1 : n.toString(16).length);
/** The digits of the larger part of a fraction. */
export const widthOf = (f: Fraction): number => Math.max(digits(f.num), digits(f.den));

/** Spends what a product (or the sum, which is four of them) of two sizes costs, and the reduction of its result to lowest terms, which costs about the square of its size. */
export function spendOn(a: number, b: number): void {
  spend((a + b) * (a + b));
}
