// Workflow rules (GLOSSARY: Workflow, Due Date, Unusual Value). Pure: the editor, the metric page and the
// engine compute due dates and checks the same way.
import { addDays, format, isWeekend, parseISO } from "date-fns";
import { periodEnd, periodLabel, periodStart, shiftPeriod, type YearStart } from "./periods";
import type { Metric, Period, Profile, WorkflowConfig, WorkflowStep } from "./types";
import { formatChange } from "./format";
import { changeBeyond, changePct } from "./exact";
import type { NumberStyle } from "./number-style";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

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
export function workingPeriod(asOf: string, p: Period, yearStart: YearStart) {
  return shiftPeriod(periodStart(asOf, p, yearStart), p, -1);
}

/** Why a value is unusual, in words; empty when it is not (GLOSSARY: Unusual Value). */
export function unusualReasons(m: Metric, value: number, previous: number | undefined, previousPeriod: string | undefined, step: Extract<WorkflowStep, { type: "check" }>, yearStart: YearStart, style: NumberStyle, target?: { min: number | null; max: number | null }) {
  const out: string[] = [];
  const before = previousPeriod ? periodLabel(previousPeriod, m.period, yearStart) : "the period before";
  // Stryker disable next-line ConditionalExpression: changeBeyond is false without an earlier value (not a finite number), so this only keeps the types right.
  if (previous !== undefined && previous !== 0) {
    // The same change a Comparison shows, exact on the values' text (exact.ts), and compared with the step exactly:
    // a change of exactly the step is not unusual.
    const pct = changePct(value, previous)!;
    // A step below 0 % is taken as 0 %: an unchanged value is never unusual, whatever a Workflow holds.
    // Stryker disable next-line EqualityOperator: pct is 0 only for an unchanged value, which a step of 0 % or more (see the line above) never calls unusual.
    if (changeBeyond(value, previous, Math.max(0, step.changePct))) out.push(`${pct > 0 ? "up" : "down"} ${formatChange(pct, style, { signed: false })} on ${before}`);
  } else if (previous === 0 && value !== 0) {
    // Any change from 0 is an infinite share of it: always more than the step allows (spec 0022).
    // Stryker disable next-line EqualityOperator: the value is not 0 here, so `>` and `>=` never differ.
    out.push(`${value > 0 ? "up" : "down"} from 0 on ${before}`);
  }
  if (step.outsideTarget && target) {
    if (target.min !== null && value < target.min) out.push("below target");
    if (target.max !== null && value > target.max) out.push("above target");
  }
  return out;
}

/** A Workflow step in words, as the editor shows it. */
export function stepLabel(s: WorkflowStep, people: Profile[], groups: { id: number; name: string }[] = []) {
  const name = (id: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  switch (s.type) {
    case "remind": return `Remind the submitter ${s.daysBefore} day${s.daysBefore === 1 ? "" : "s"} before the due date`;
    case "escalate": return `${s.daysAfter ? `${s.daysAfter} day${s.daysAfter === 1 ? "" : "s"} after` : "On"} the due date, if still missing: ${s.to === "stand-in" ? "ask the stand-in" : "tell the metric owner"}`;
    case "check": return `Unusual if it changes more than ${s.changePct} %${s.outsideTarget ? " or falls outside the target" : ""}`;
    case "approve": return s.approvers.length ? `${s.values === "every" ? "Every value" : "Unusual values"} approved by ${s.approvers.map(name).join(", then ")}; when nobody else can, ${s.nobodyElse === "count" ? "it counts without approval" : "the submitter checks it"}` : "Approval, nobody chosen yet";
    case "tell": return `Tell ${s.people.length || s.groups.length ? [...s.people.map(name), ...s.groups.map((g) => groups.find((x) => x.id === g)?.name ?? "a Group")].join(", ") : "nobody yet"} when ${tellWords(s.condition)}`;
    case "publish": return s.lock ? "Publish and lock the period" : "Publish";
  }
}

/** A Tell step's condition in words: "a value reaches 80 % of its target". */
function tellWords(c: Extract<WorkflowStep, { type: "tell" }>["condition"]): string {
  switch (c.kind) {
    case "share_of_target": return `a value reaches ${c.share} % of its target`;
    case "at_or_above": return `a value reaches ${c.value}`;
    case "below": return `a value falls below ${c.value}`;
    case "changed_more": return `a value changes more than ${c.share} % on the period before`;
  }
}

/** The short name of each kind of Workflow step. */
export const STEP_TITLE: Record<WorkflowStep["type"], string> = { remind: "Remind", escalate: "Escalate", check: "Check", approve: "Approve", tell: "Tell", publish: "Publish" };
