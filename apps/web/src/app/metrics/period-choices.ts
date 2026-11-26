// The periods a Total's Metric can be counted from or up to (GLOSSARY: Total, Period), as a list to pick from: the
// latest two years of them by the calendar, and one older one where it is the one proposed.
import { periodLabel, periodStart, shiftPeriod, type YearStart } from "@ziffr/core/periods";
import type { Period } from "@ziffr/core/types";

/** A period to pick: its first day and how it is written. */
export type PeriodChoice = { value: string; label: string };

/** The latest periods, newest first, with `include` among them. */
export function periodChoices(period: Period, yearStart: YearStart, include?: string): PeriodChoice[] {
  const current = periodStart(new Date(), period, yearStart);
  const days = Array.from({ length: 24 }, (_, i) => shiftPeriod(current, period, -i));
  if (include && !days.includes(include)) days.push(include);
  return days.sort().reverse().map((value) => ({ value, label: periodLabel(value, period, yearStart, true) }));
}
