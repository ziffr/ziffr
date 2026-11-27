// When the people a guided Pack set-up names are asked, in words (spec 0068; GLOSSARY: Workflow, Asking Schedule,
// Prompt): by the Pack's Workflow from the next daily run, or on the days their period needs. Pure. It only says what
// the plan and the Workspace's clock give; the done screen says the day the server worked out.
import { addDaysTo, nextAskingDay } from "@ziffr/core/asking-schedule";
import { formatDate } from "@ziffr/core/format";
import type { StartPlan } from "@ziffr/core/pack-start-plan";
import type { StartDeclarations } from "@ziffr/core/pack-start-steps";
import type { AskingDays, Period } from "@ziffr/core/types";

/** The Workspace's day and daily run, as `startOptions` answers it. */
export type SetUpClock = { today: string; hour: number; timeZone: string; runHour: number; todayRan: boolean };

const hourWords = (clock: SetUpClock) => `about ${String(clock.runHour).padStart(2, "0")}:00 (${clock.timeZone.replace(/_/g, " ")})`;

// The same days a Metric without a Pack Workflow is joined to (the core's period-workflows).
function periodDays(period: Period): { words: string; days: AskingDays } {
  if (period === "day") return { words: "Every day", days: { kind: "every_day" } };
  if (period === "week") return { words: "Every Monday", days: { kind: "chosen_weekdays", days: [1] } };
  return { words: "On the 1st of each month", days: { kind: "month_day", day: 1 } };
}

/** One line for each rhythm somebody is asked in; empty when nobody is asked. */
export function askedWhen(plan: Pick<StartPlan, "metrics">, declarations: Pick<StartDeclarations, "metrics">, clock: SetUpClock): string[] {
  const periodOf = new Map(declarations.metrics.map((m) => [m.key, m.period]));
  const out = new Set<string>();
  for (const m of plan.metrics) {
    const period = periodOf.get(m.key);
    if (!m.submitters.length || !period) continue;
    if (m.workflow === "pack") {
      const run = clock.todayRan ? addDaysTo(clock.today, 1) : clock.today;
      out.add(`After each ${period} ends, from the daily run on ${formatDate(run)}, ${hourWords(clock)}.`);
    } else {
      const { words, days } = periodDays(period);
      // A new schedule never runs for a day that has begun.
      const first = nextAskingDay(days, addDaysTo(clock.today, 1));
      out.add(`${words}, ${hourWords(clock)}${first ? `, first on ${formatDate(first)}` : ""}.`);
    }
  }
  return [...out];
}
