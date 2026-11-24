// The dates and periods a visitor of the demo may enter (GLOSSARY: Demo Mode; spec 0051, Limits: Values, ticket 8). Pure:
// each function answers the plain words for a refusal, or null when the date is fine. The core asks them only for a visit
// (never for the seed or a real Workspace); the database holds the same rule for Away (migration 20270128120000), as a
// backstop. Dates are days as text ("2026-11-24"), compared as such, in UTC: a day's slack covers the visitor's clock.
import { DEMO_VALUE_LIMITS } from "./demo-limits";
import { DEMO_VALUE_WORDS } from "./demo-words";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;

/** A day as text, from a Date, in UTC. */
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
/** The day as a number of days since 1970, or NaN when it is not a day. */
const dayNumber = (day: string): number => (DAY.test(day) ? Date.parse(`${day}T00:00:00Z`) / MS_DAY : NaN);

/** The first day a value may be entered for: the first of the month `monthsBack` months before now's month. */
function demoOldestPeriod(now: Date): string {
  return dayOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - DEMO_VALUE_LIMITS.monthsBack, 1)));
}

/** Why a value for a period may not be entered in the demo: older than two years, or after the current period. `current` is
 * the first day of the Metric's current period. */
export function demoValuePeriodRefusal(period: string, current: string, now: Date): string | null {
  if (!DAY.test(period)) return DEMO_VALUE_WORDS.period;
  return period < demoOldestPeriod(now) || period > current ? DEMO_VALUE_WORDS.period : null;
}

/** Why Away dates are not accepted in the demo: not days, ending before they start, starting before today (a day's slack),
 * longer than 30 days or ending more than 90 days ahead. */
export function demoAwayRefusal(starts: string, ends: string, now: Date): string | null {
  const [from, to, today] = [dayNumber(starts), dayNumber(ends), dayNumber(dayOf(now))];
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return DEMO_VALUE_WORDS.away;
  if (from < today - 1 || to > today + DEMO_VALUE_LIMITS.awayAheadDays || to - from > DEMO_VALUE_LIMITS.awayMaxDays) return DEMO_VALUE_WORDS.away;
  return null;
}

/** Why "pretend it is this day" is not accepted in the demo: not a day, or further than 90 days from today. */
export function demoAsOfRefusal(asOf: string, now: Date): string | null {
  const [day, today] = [dayNumber(asOf), dayNumber(dayOf(now))];
  return Number.isNaN(day) || Math.abs(day - today) > DEMO_VALUE_LIMITS.asOfDays ? DEMO_VALUE_WORDS.asOf : null;
}
