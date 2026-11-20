"use client";
// The Asking Schedule in the Workflow editor (GLOSSARY: Asking Schedule, Workflow, Due Date): whether the Workflow runs
// with the workspace's daily run or on its own hour and days, and what that means in words. The rules are the core's
// (asking-schedule.ts); this only draws them.
import { askingWarnings, describeAsking, EVERY_N_MAX, EVERY_N_MIN, nextAskingRun } from "@ziffr/core/asking-schedule";
import { formatDate } from "@ziffr/core/format";
import type { AskingDays, AskingSchedule, Period } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

const FIELD = "h-8 rounded-[var(--radius-input)] border border-input bg-card px-2 text-xs";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** The days a kind starts with when it is chosen. */
function starting(kind: AskingDays["kind"], today: string): AskingDays {
  switch (kind) {
    case "every_day": return { kind };
    case "weekdays": return { kind };
    case "chosen_weekdays": return { kind, days: [1] };
    case "every_n_days": return { kind, n: 3, from: today };
    case "month_day": return { kind, day: 1 };
  }
}

/** The clock a sentence is told against: the workspace's time zone and run hour, its day and hour now; null in the demo. */
export type AskingClock = { timeZone: string; runHour: number; today: string; hour: number } | null;

/** The sentence under the Ask step: when the Workflow runs and next runs. */
export function AskingSentence({ asking, clock }: { asking: AskingSchedule; clock: AskingClock }) {
  if (!clock) return <>Runs on its own days{asking.hour === null ? "" : ` at ${hh(asking.hour)}`}.</>;
  const next = nextAskingRun(asking, clock.runHour, { day: clock.today, hour: clock.hour });
  return <>{describeAsking(asking, clock.runHour, clock.timeZone)}{next ? ` Next: ${formatDate(next)}.` : ""}</>;
}

/** The editor's fields for the Asking Schedule, with its warnings. `periods` are those of the Metrics on the Workflow. */
export function AskingFields({ asking, onChange, disabled, clock, periods, dueWorkingDays }: { asking: AskingSchedule | undefined; onChange: (a: AskingSchedule | undefined) => void; disabled: boolean; clock: AskingClock; periods: Period[]; dueWorkingDays: number }) {
  const today = clock?.today ?? new Date().toISOString().slice(0, 10);
  const days = asking?.days;
  const set = (d: AskingDays) => onChange({ hour: asking?.hour ?? null, days: d });
  const warnings = asking ? askingWarnings(asking, periods, dueWorkingDays) : [];
  return (
    <fieldset className="mt-3 space-y-2 text-xs" disabled={disabled}>
      <legend className="mb-1 font-medium">Runs</legend>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="When this workflow runs" value={asking ? "own" : "workspace"} className={FIELD} onChange={(e) => onChange(e.target.value === "own" ? { hour: null, days: { kind: "every_day" } } : undefined)}>
          <option value="workspace">With the workspace&rsquo;s daily run{clock ? `, at ${hh(clock.runHour)}` : ""}</option>
          <option value="own">On its own schedule</option>
        </select>
        {asking && days && (
          <>
            <label className="flex items-center gap-1.5">at
              <select aria-label="Hour" value={asking.hour ?? ""} className={FIELD} onChange={(e) => onChange({ ...asking, hour: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">{clock ? `the workspace's hour (${hh(clock.runHour)})` : "the workspace's hour"}</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </label>
            <select aria-label="Days" value={days.kind} className={FIELD} onChange={(e) => set(starting(e.target.value as AskingDays["kind"], today))}>
              <option value="every_day">every day</option>
              <option value="weekdays">every weekday</option>
              <option value="chosen_weekdays">on chosen weekdays</option>
              <option value="every_n_days">every few days</option>
              <option value="month_day">on a day of the month</option>
            </select>
          </>
        )}
      </div>
      {asking && days?.kind === "chosen_weekdays" && (
        <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-3">
          {WEEKDAYS.map((name, i) => {
            const n = i + 1;
            return (
              <label key={n} className="flex items-center gap-1">
                <input type="checkbox" checked={days.days.includes(n)} className="size-4 accent-[var(--color-ink)]"
                  onChange={(e) => { const next = e.target.checked ? [...days.days, n] : days.days.filter((d) => d !== n); if (next.length) set({ kind: "chosen_weekdays", days: [...new Set(next)].sort((a, b) => a - b) }); }} />
                {name}
              </label>
            );
          })}
        </div>
      )}
      {asking && days?.kind === "every_n_days" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">every
            <input type="number" min={EVERY_N_MIN} max={EVERY_N_MAX} value={days.n} aria-label="Every how many days" className={cn(FIELD, "w-16")} onChange={(e) => set({ ...days, n: Math.min(EVERY_N_MAX, Math.max(EVERY_N_MIN, Math.round(Number(e.target.value) || EVERY_N_MIN))) })} /> days
          </label>
          <label className="flex items-center gap-1.5">starting
            <input type="date" value={days.from} aria-label="Starting day" className={FIELD} onChange={(e) => e.target.value && set({ ...days, from: e.target.value })} />
          </label>
        </div>
      )}
      {asking && days?.kind === "month_day" && (
        <label className="flex items-center gap-1.5">on
          <select aria-label="Day of the month" value={String(days.day)} className={FIELD} onChange={(e) => set({ kind: "month_day", day: e.target.value === "last" ? "last" : Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>day {i + 1}</option>)}
            <option value="last">the last day</option>
          </select>
          of the month; a month without that day runs on its last day
        </label>
      )}
      {asking && <p className="text-muted-foreground"><AskingSentence asking={asking} clock={clock} /> Due Dates do not move: a reminder or escalation on a day it does not run goes out on the next run day.</p>}
      {warnings.map((w) => <p key={w} role="note" className="text-[var(--color-ink)]">{w}</p>)}
    </fieldset>
  );
}
