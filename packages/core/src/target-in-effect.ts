// The target of a Metric that counts now, in words (GLOSSARY: Target Series, Target Range, Attainment): the one for the
// latest value's period, or without a value the current period's, picked by targetFor as Attainment picks it, so a screen
// never says "No target" beside a Widget that measures against one. Pure: the caller passes only targets the person may
// see (for a Total that takes its Metrics' targets, the added-up ones worked out for them, never a series of its own).
import { targetFor } from "./compare";
import { targetText } from "./format";
import type { NumberStyle } from "./number-style";
import { periodStart, type YearStart } from "./periods";
import type { Metric, Point } from "./types";

/** Said where the period has no target but the Target Series has one for another period. */
export const TARGETS_ELSEWHERE = "Set for other periods";

/** The target in effect for one period: its bounds, whether the Target Series gave them, and the words for it. */
export type TargetInEffect = { period: string; min: number | null; max: number | null; fromSeries: boolean; words: string };

/** The target in effect for the latest value's period, or the current period of a Metric without a value. */
export function targetInEffect(metric: Metric, when: { latest?: string; today: string; yearStart: YearStart }, targets: readonly Point[] | undefined, style: NumberStyle): TargetInEffect {
  const period = when.latest ?? periodStart(when.today, metric.period, when.yearStart);
  const { min, max, fromSeries } = targetFor(metric, period, targets);
  // A period's own target is stated as it is, also on a Total whose targets are added up.
  const said = fromSeries ? { ...metric, total: undefined, target_min: min, target_max: max } : metric;
  const none = min === null && max === null && metric.total?.targets !== "parts";
  return { period, min, max, fromSeries, words: none && targets?.length ? TARGETS_ELSEWHERE : targetText(said, style) };
}
