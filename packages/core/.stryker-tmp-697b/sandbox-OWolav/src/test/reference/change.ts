// @ts-nocheck
// The reference for changes and for judging a value against its target (spec 0022, Testing Decisions; GLOSSARY:
// Comparison, Target Range, Unusual Value), on exact fractions, sharing nothing with compare.ts, format.ts or
// workflow-rules.ts:
// - a change is the current value minus the earlier one; in % it is that divided by the size of the earlier one, times
//   100, and there is none from 0; it is good when it goes the way the polarity likes, neither for "closer to target"
//   or no change at all;
// - a value is below its Target Range when it is under the lower bound, above it when over the upper bound, on it
//   otherwise; with no bound, or no finite value, it has no status. Health is bad outside the range, good inside,
//   neutral without a range or a finite value;
// - a value is unusual when its change in % is larger in size than the step allows (exactly: a change of exactly the
//   step is not), when it moves away from 0 at all, and, if the step says so, when it is outside the target.
import type { Polarity } from "../../types";
import { compareExact, exactOf, fraction, minus, type Exact } from "./exact";

const abs = (x: Exact): Exact => ({ num: x.num < 0n ? -x.num : x.num, den: x.den });
const sign = (x: Exact) => (x.num > 0n ? 1 : x.num < 0n ? -1 : 0);

/** A Comparison's change from `previous` to `current`: the difference, the % of the earlier value's size, good. */
export function referenceChangeOf(current: Exact, previous: Exact, polarity: Polarity): { abs: Exact; pct: Exact | null; good: boolean | null } {
  const d = minus(current, previous);
  const pct = previous.num === 0n ? null : fraction(d.num * 100n * previous.den, d.den * abs(previous).num);
  const good = polarity === "target" || sign(d) === 0 ? null : (sign(d) > 0) === (polarity === "higher");
  return { abs: d, pct, good };
}

type Bound = number | string | null;
const bound = (b: Bound) => (b === null ? null : exactOf(b));

/** Where a value sits against a Target Range. */
export function referenceStatus(value: number | null | undefined, min: Bound, max: Bound): "below" | "on" | "above" | null {
  if (value === null || value === undefined || !Number.isFinite(value) || (min === null && max === null)) return null;
  const v = exactOf(value);
  const [lo, hi] = [bound(min), bound(max)];
  if (lo && compareExact(v, lo) < 0) return "below";
  if (hi && compareExact(v, hi) > 0) return "above";
  return "on";
}

/** Health: bad outside the range, good inside it, neutral without one. */
export function referenceHealth(value: number | null | undefined, min: Bound, max: Bound): "good" | "bad" | "neutral" {
  const s = referenceStatus(value, min, max);
  return s === null ? "neutral" : s === "on" ? "good" : "bad";
}

/** What makes a value unusual, in the order the check says it: a change ("up" or "down" with its exact % of the
 * earlier value, or "from 0"), and being below or above the target when the step checks that. */
export function referenceUnusual(value: number, previous: number | undefined, step: { changePct: number; outsideTarget: boolean }, target?: { min: number | null; max: number | null }) {
  const out: ({ kind: "change"; up: boolean; pct: Exact } | { kind: "from0"; up: boolean } | { kind: "below" } | { kind: "above" })[] = [];
  const v = exactOf(value);
  if (previous !== undefined) {
    const p = exactOf(previous);
    const c = referenceChangeOf(v, p, "higher");
    if (c.pct === null) {
      if (sign(v) !== 0) out.push({ kind: "from0", up: sign(v) > 0 });
    } else if (compareExact(abs(c.pct), exactOf(step.changePct)) > 0) out.push({ kind: "change", up: sign(c.pct) > 0, pct: abs(c.pct) });
  }
  if (step.outsideTarget && target) {
    if (target.min !== null && compareExact(v, exactOf(target.min)) < 0) out.push({ kind: "below" });
    if (target.max !== null && compareExact(v, exactOf(target.max)) > 0) out.push({ kind: "above" });
  }
  return out;
}
