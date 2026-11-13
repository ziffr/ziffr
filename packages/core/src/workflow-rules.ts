// Workflow rules (GLOSSARY: Workflow, Due Date, Unusual Value). Pure: the editor, the metric page and the
// engine compute due dates and checks the same way.
import { addDays, addMonths, addWeeks, format, isWeekend, parseISO } from "date-fns";
import { periodLabel } from "./format";
import type { Metric, Period, Profile, WorkflowConfig, WorkflowStep } from "./types";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** The start of the period n periods before or after a period start. */
export function shiftPeriod(start: string, p: Period, n: number) {
  const d = parseISO(start);
  return iso(p === "day" ? addDays(d, n) : p === "week" ? addWeeks(d, n) : addMonths(d, n));
}

/** The last day of a period. */
export const periodEnd = (start: string, p: Period) => iso(addDays(parseISO(shiftPeriod(start, p, 1)), -1));

/** A date n working days later, skipping Saturdays and Sundays. */
export function addWorkingDays(date: string, n: number) {
  let d = parseISO(date);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left--;
  }
  return iso(d);
}

/** When a period's value must be in (GLOSSARY: Due Date). */
export const dueDate = (start: string, p: Period, cfg: WorkflowConfig) => addWorkingDays(periodEnd(start, p), Math.max(0, cfg.dueWorkingDays));

/** The period a workflow works on as of a day: the last one that has ended. */
export function workingPeriod(asOf: string, p: Period, currentStart: (d: Date, p: Period) => string) {
  return shiftPeriod(currentStart(parseISO(asOf), p), p, -1);
}

/** Why a value is unusual, in words; empty when it is not (GLOSSARY: Unusual Value). */
export function unusualReasons(m: Metric, value: number, previous: number | undefined, previousPeriod: string | undefined, step: Extract<WorkflowStep, { type: "check" }>, target?: { min: number | null; max: number | null }) {
  const out: string[] = [];
  if (previous !== undefined && previous !== 0) {
    const pct = ((value - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) > step.changePct) out.push(`${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)} % on ${previousPeriod ? periodLabel(previousPeriod, m.period) : "the period before"}`);
  }
  if (step.outsideTarget && target) {
    if (target.min !== null && value < target.min) out.push("below target");
    if (target.max !== null && value > target.max) out.push("above target");
  }
  return out;
}

/** A Workflow step in words, as the editor shows it. */
export function stepLabel(s: WorkflowStep, people: Profile[]) {
  const name = (id: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  switch (s.type) {
    case "remind": return `Remind the submitter ${s.daysBefore} day${s.daysBefore === 1 ? "" : "s"} before the due date`;
    case "escalate": return `${s.daysAfter ? `${s.daysAfter} day${s.daysAfter === 1 ? "" : "s"} after` : "On"} the due date, if still missing: ${s.to === "stand-in" ? "ask the stand-in" : "tell the metric owner"}`;
    case "check": return `Unusual if it changes more than ${s.changePct} %${s.outsideTarget ? " or falls outside the target" : ""}`;
    case "approve": return s.approvers.length ? `Unusual values approved by ${s.approvers.map(name).join(", then ")}` : "Approval, nobody chosen yet";
    case "publish": return s.lock ? "Publish and lock the period" : "Publish";
  }
}

/** The short name of each kind of Workflow step. */
export const STEP_TITLE: Record<WorkflowStep["type"], string> = { remind: "Remind", escalate: "Escalate", check: "Check", approve: "Approve", publish: "Publish" };
