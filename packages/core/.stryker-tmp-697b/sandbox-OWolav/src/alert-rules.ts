// @ts-nocheck
// Alert rules (GLOSSARY: Alert, Attainment, Due Date, Import). Pure: when an Alert's condition holds, which values an
// Alert may look at, and when it fires. Values are read as text and compared exactly (spec 0022), Attainment comes
// from compare.ts and the change from exact.ts, so an Alert and the Metric's page never disagree about a level.
// An Alert looks at the Metric's own Period, never at a Display Period: a Display Period only changes how a chart
// groups, so it cannot make an Alert fire. The sums of an Aggregation are already in the series the caller passes.
import { methodFor, type AttainmentMethod } from "./attainment-method";
import { attainment } from "./compare";
import { changeBeyond, fractionOfText, minus } from "./exact";
import type { Metric } from "./types";

/** What an Alert waits for. A share or a value is text, such as "80" or "-0.5". */
export type AlertCondition =
  | { kind: "share_of_target"; share: string }
  | { kind: "at_or_above"; value: string }
  | { kind: "below"; value: string }
  | { kind: "changed_more"; share: string }
  | { kind: "missing_after_due" };

/** The kinds of condition. */
export const ALERT_KINDS = ["share_of_target", "at_or_above", "below", "changed_more", "missing_after_due"] as const;
/** One kind of condition. */
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Kinds that belong to a period, not to a level: they fire at most once per period. */
const PER_PERIOD: readonly AlertKind[] = ["changed_more", "missing_after_due"];

/** The smallest share, in %, a "share of target" or "changed more" Alert may take. */
export const ALERT_SHARE_MIN = 1;
/** The largest share, in %, such an Alert may take. */
export const ALERT_SHARE_MAX = 1000;

const NUMBER = /^-?\d{1,15}(\.\d{1,12})?$/;
/** Whether text is a plain decimal an Alert can compare exactly ("12", "-0.5"; no exponent, no spaces). */
const isNumberText = (t: unknown): t is string => typeof t === "string" && NUMBER.test(t);

/** Whether a condition is well formed: a known kind, a level that is a plain number, a share from 1 to 1,000 %. */
export function validCondition(c: unknown): c is AlertCondition {
  // Object(…) turns null and plain values into something that has no kind.
  const x = Object(c) as Record<string, unknown>;
  switch (x.kind) {
    case "at_or_above":
    case "below": return isNumberText(x.value);
    case "share_of_target":
    case "changed_more": {
      if (!isNumberText(x.share)) return false;
      const share = Number(x.share);
      return share >= ALERT_SHARE_MIN && share <= ALERT_SHARE_MAX;
    }
    case "missing_after_due": return true;
    default: return false;
  }
}

/** Whether the condition belongs to a period rather than to a level. */
export const isPerPeriod = (kind: AlertKind): boolean => PER_PERIOD.includes(kind);

/** What a check sees: the latest period with a value and the period before it, as the Metric's page shows them. */
export type AlertInput = {
  metric: Pick<Metric, "polarity" | "attainment_method">;
  workspaceMethod: AttainmentMethod;
  /** The latest period's value as text, or null when it has none. */
  value: string | null;
  /** The value of the period before it, or null. */
  previous: string | null;
  /** The target for the latest period (a Target Series value or the Metric's range). */
  target: { min: number | null; max: number | null };
  /** For "missing_after_due": today and the period's Due Date, both as YYYY-MM-DD. */
  today?: string;
  dueDate?: string;
};

/** Whether the condition holds now. False for no value, no percentage, no earlier value or a malformed condition. */
export function alertHolds(c: AlertCondition, i: AlertInput): boolean {
  if (!validCondition(c)) return false;
  if (c.kind === "missing_after_due") {
    // The day after the Due Date, and every day since, while there is still no value.
    return i.value === null && !!i.today && !!i.dueDate && i.today > i.dueDate;
  }
  if (!isNumberText(i.value)) return false;
  const value = fractionOfText(i.value);
  switch (c.kind) {
    case "at_or_above": return minus(value, fractionOfText(c.value)).num >= BigInt(0);
    case "below": return minus(value, fractionOfText(c.value)).num < BigInt(0);
    case "share_of_target": {
      const pct = attainment(i.metric as Metric, Number(i.value), i.target, i.workspaceMethod);
      // At or above the share. Attainment is already the double nearest to the exact percentage (exact.ts).
      return (pct ?? -Infinity) >= Number(c.share);
    }
    case "changed_more": {
      if (!isNumberText(i.previous)) return false;
      // From 0 a change away from it is more than any share and no change is none (the Unusual Value rule): that is
      // how changeBeyond decides it, too.
      return changeBeyond(Number(i.value), Number(i.previous), Number(c.share));
    }
  }
}

/** The target an Attainment-based Alert needs: false for no target or one with no percentage (at or below 0). */
export function targetAllowsShare(metric: Pick<Metric, "polarity" | "attainment_method">, target: { min: number | null; max: number | null }, workspaceMethod: AttainmentMethod): boolean {
  const bound = metric.polarity === "lower" ? target.max : target.min;
  if (metric.polarity === "target") return target.min !== null || target.max !== null;
  if (bound === null) return false;
  // Ratio has no percentage for a target at or below 0; distance has none for exactly 0.
  return methodFor(metric, workspaceMethod) === "ratio" ? bound > 0 : bound !== 0;
}

/** Whether an Alert may look at a value of this status: published or approved always, the rest only when the
 * person chose "Include values not approved yet". A value waiting for Approval or a proposal is "pending". */
export function valueCounts(status: "published" | "approved" | "pending", includeNotApproved: boolean): boolean {
  return status === "published" || status === "approved" || includeNotApproved;
}

/** An Alert's memory: armed (quiet, waiting) or fired, and the period it fired for. */
export type AlertState = { state: "armed" | "fired"; firedPeriod: string | null };

/** What a check decides: whether to send one message, and the state to keep. */
export type AlertStep = { fire: boolean; next: AlertState };

/** One check (GLOSSARY: Alert, fires once per crossing). `holds` is the condition now, `period` the latest period.
 * A level kind fires when it becomes true while armed, is re-armed silently when false, and stays quiet while true.
 * A per-period kind fires at most once per period and is armed again by the next period. An Import
 * (`silent`) sends nothing and only brings the state up to date. */
export function alertStep(kind: AlertKind, was: AlertState, holds: boolean, period: string, silent = false): AlertStep {
  // A new period arms a per-period Alert again; a level kind is armed only when its condition was false.
  const armed = was.state === "armed" || (isPerPeriod(kind) && was.firedPeriod !== period);
  if (holds) {
    if (armed && !silent) return { fire: true, next: { state: "fired", firedPeriod: period } };
    return { fire: false, next: { state: "fired", firedPeriod: armed ? period : was.firedPeriod } };
  }
  // Within the period a per-period Alert stays fired, even if a Correction makes it false; a level kind re-arms.
  if (isPerPeriod(kind) && !armed) return { fire: false, next: was };
  return { fire: false, next: { state: "armed", firedPeriod: isPerPeriod(kind) ? was.firedPeriod : null } };
}

/** The latest period with a value and the one before it, from points in any order; null without a value. */
export function latestAndPrevious<T extends { period: string; value: string | null }>(points: readonly T[]): { latest: T; previous: T | null } | null {
  const sorted = points.filter((p) => p.value !== null).sort((a, b) => b.period.localeCompare(a.period));
  return sorted[0] ? { latest: sorted[0], previous: sorted[1] ?? null } : null;
}
