// The work bound of the exact Methods (GLOSSARY: Method, Takeaway; spec 0041, rule 12: never a quiet number). Methods work
// exactly on the values as written (exact.ts), and the cost of that grows with how many digits the values need: a series
// that mixes 9.8e14 with 1e-300 needs numbers of 300 digits at every step, and a fit of six drivers on such values took
// seconds on the server's one event loop, where anyone who can submit a value (a submitter, a Feed, an API key) can plant
// them and a View Link visitor starts the work. So two things are decided before and while the work is done, and both end in
// a refusal in words, never in a wrong or a late number:
//
//   1. `wideFindings`: a series whose values need more than 40 decimal places, or whose largest size is more than 10^30 times
//      its smallest size that is not 0, is refused before any arithmetic. Decided exactly on the values' text, never on a
//      double. Values that people keep (money to the cent, a price to 8 decimals, a rate computed as a double, which has 17
//      significant digits, down to 1e-23) are far inside.
//   2. `withWork` and `spend`: a Method that keeps many exact numbers at once (the multiple fit, which solves for every
//      driver, refits for each pair it merges and again without the far-off periods; the forecast; before and after; the change
//      point; partial, lagged and rank correlation; the usual range; the ranking of Metrics) counts the digit work it does and stops
//      when its allowance is spent, so that even values inside the first limit (or a very large size, which no decimal place
//      catches) cannot keep the server busy for long. The count is of digits, not of seconds: the same input spends the same
//      on every machine, and stops at the same step.
//
// Pure apart from the counter of the one bound that is running, which is only touched by synchronous code.
import { readSeries } from "./basis";
import { scaled, type Fraction } from "./exact";
import type { Finding } from "./suitability";
import type { Point } from "./types";

/** The limits: decimal places in the text of a value, and orders of magnitude (powers of ten) from the smallest size that is not 0 to the largest. */
export const WORK_BOUND = { places: 40, orders: 30 } as const;
/** The digit work one bounded Method may spend, in the units of `spend`: about 3 seconds of a laptop under load (a fit of six drivers on 120 periods of the legitimate series measured, to the cent or to 17 digits, spends up to 1.2e10, a third of it). */
export const WORK_BUDGET = 35_000_000_000;

const [ZERO, TEN] = [BigInt(0), BigInt(10)];
const SPAN = TEN ** BigInt(WORK_BOUND.orders);

/** What is too much about a list of values: the decimal places they need, or the orders of magnitude they span; null for none. */
export type Wide = "places" | "orders";

/** Whether finite values need more than 40 decimal places or span more than 30 orders of magnitude, decided exactly on their text. A value that is not a number is no value and not looked at. */
export function wideReason(values: readonly (number | null)[]): Wide | null {
  const parts = values.filter((v): v is number => Number.isFinite(v)).map(scaled);
  if (parts.some((p) => p.places > WORK_BOUND.places)) return "places";
  // Every size on one scale of 10^-40 (no value has more places than that), so they are whole numbers and the largest over the smallest is a division-free comparison.
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
export function wideColumns(names: readonly string[], columns: readonly (readonly (number | null)[])[]): Finding[] {
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

/** The work a scan of one Workspace's Metrics for Heads-ups about one Metric may spend in all, and what one Metric of them may: the Metric's own limit is far above
 * what any ordinary series needs (3 · 10^6 for money to the cent, 3 · 10^8 for log-normal doubles) and the scan's is about eight seconds of a laptop. */
export const SCAN_BUDGET = 20_000_000_000;
/** What one call of the ranking of Metrics by correlation may spend (a fraction of a second on the worst values the bounds admit), and what all the
 * correlation work of one page may spend together. */
export const RANK_BUDGET = 4_000_000_000;
/** What all the correlation work drawn on one page (the widgets of a dashboard) may spend together: about three seconds of a laptop under load. */
export const PAGE_EXACT_BUDGET = 35_000_000_000;

/** Runs `f` under what the page has left of its exact work, at most `cap`, and charges the page what it spent (all of `cap` or of what was left where it stopped);
 * null where it stopped, and where nothing was left. A page is not inside another bound: this is the outermost. */
export function onPage<T>(page: { exact: number }, cap: number, f: () => T): T | null {
  const own = Math.min(page.exact, cap);
  if (own <= 0) return null;
  let spent = own;
  const result = withWork(() => {
    const out = f();
    spent = own - (left as number);
    return out;
  }, own);
  page.exact -= spent;
  return result;
}

/** What one scan of a Workspace's Metrics for Heads-ups about two Metrics may spend in all, in the digit work counted by `lowestTerms`: most pairs spend none (they are screened in doubles, and
 * only a pair that meets the conditions is checked exactly), so no ordinary scan comes near it; it bounds a scan of many pairs that all do. About seven seconds of a laptop under load. */
export const SCAN_PAIRS_BUDGET = 70_000_000_000;

/** What one Metric of such a scan may spend. */
export const METRIC_BUDGET = 3_000_000_000;

/** Runs `f` under a limit of its own inside a bound that is running: the work it spends counts against the bound too, and where it spends more than `cap`
 * (or the bound has less left) it answers null, having spent only that. Outside a bound `f` is simply run. */
export function capped<T>(cap: number, f: () => T): T | null {
  if (left === null) return f();
  const before = left;
  const own = Math.min(before, cap);
  left = own;
  let stopped = false;
  try {
    return f();
  } catch (e) {
    if (!(e instanceof OutOfWork)) throw e;
    stopped = true;
    return null;
  } finally {
    left = before - (stopped ? own : own - (left as number));
  }
}

/** Runs `f` inside a bound that is running, and answers null where it stopped for want of work, with nothing left for what comes after: for a loop
 * that does the work of many parts and keeps the parts that were done. What comes after is not cut off wholesale: a part that needs no counted work is still done, so the parts kept are a subset of all of them, not the first ones. Outside a bound `f` is simply run. */
export function tryWork<T>(f: () => T): T | null {
  try {
    return f();
  } catch (e) {
    if (!(e instanceof OutOfWork)) throw e;
    left = 0;
    return null;
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

/** How many of the latest periods the Methods that compare series work on: the same 120 as the forecast, before and after and the change point. */
export const MOST_PERIODS = 120;

/** The series cut to the latest `most` periods they have in common (each period once, with the value given last), and how many that is where
 * something was cut, else null: the pairs a Method works on are then a fixed few, however long the history. A series with no period in common keeps what it has. */
export function latestCommon(series: Point[][], most: number = MOST_PERIODS): { series: Point[][]; cut: number | null } {
  const read = series.map((s) => readSeries(s));
  const [first, ...others] = read.map((s) => new Set(s.map((p) => p.period)));
  // (`readSeries` gives the periods oldest first, and a set keeps the order it was given in.)
  const common = [...first].filter((period) => others.every((o) => o.has(period)));
  if (common.length <= most) return { series: read, cut: null };
  const kept = new Set(common.slice(-most));
  return { series: read.map((s) => s.filter((p) => kept.has(p.period))), cut: most };
}
