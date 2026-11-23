// The cumulative mark of a View Design (GLOSSARY: View Design, Fiscal Year, Target Series, Aggregation): the running
// total of a Metric that adds up, since the start of its year, against the plan and last year. What it draws (the
// cumulative sums, where each period sits in its year, the gap to the plan and every word) is worked out here, once,
// so a widget, a Snapshot, a View Link and a deck's picture say the same; the view only turns it into a line.
// Pure: it reads the data it is given and nothing else.
//
// Honest rules, said on the chart in words:
// - Only a Metric whose Aggregation is sum can be added up; any other is refused in words.
// - A period without a value is a gap, never a 0: the line goes on and the caption names the gap.
// - The plan is the running total of the Target Series; without one, of the Metric's target when it has a single
//   bound, each period; with a range or nothing there is no plan, and the chart says "No plan set".
// - A period that is still running is drawn but not compared: the comparison is made at the last whole period.
import { parseISO, addYears, format } from "date-fns";
import { latestOfEach } from "./display-periods";
import { formatPercent, formatValue } from "./format";
import type { NumberStyle } from "./number-style";
import { periodLabel, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
import type { Metric, Point } from "./types";

/** One point of a line: `at` is the place of its period in the year (0 the first), `total` the sum so far. */
export type RunningPoint = { at: number; total: number };

/** One line, with the label at its end: the value there, and for the running total how it stands against the plan. */
export type RunningLine = { key: "now" | "plan" | "last"; name: string; points: RunningPoint[]; end: string; words: string | null };

/** What the mark draws, or why it draws nothing. `status` is the running total against the plan at the last whole period: "on" or "off", null without one. */
export type RunningModel =
  | { ok: true; slots: number; lines: RunningLine[]; ticks: { at: number; label: string }[]; status: "on" | "off" | null; notes: string[]; alt: string }
  | { ok: false; reason: string };

/** What a Metric that does not add up is told. */
export const NOT_ADDED = "A running total needs a Metric that adds up over the year (its Aggregation is sum).";
/** What a Metric counted by year or half-year is told: it has one value a year, so there is nothing to add up. */
export const TOO_COARSE = "A running total needs a Metric by day, week, month or quarter: this one has only one or two values a year.";
/** Said where there is no plan to draw. */
export const NO_PLAN = "No plan set.";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** The starts of the periods that begin in the year starting on `ys`, oldest first (a year has 12 months, 52 or 53 weeks, 365 or 366 days). */
function startsOf(ys: string, span: Span, yearStart: YearStart): string[] {
  const next = shiftPeriod(ys, "year", 1);
  let s = periodStart(ys, span, yearStart);
  if (s < ys) s = shiftPeriod(s, span, 1);
  const out: string[] = [];
  for (; s < next; s = shiftPeriod(s, span, 1)) out.push(s);
  return out;
}

/** The running totals of a year: a point at each period that has a value, and the periods before the last one that have none. */
function cumulate(starts: string[], values: Map<string, number>) {
  const points: { start: string; i: number; total: number }[] = [];
  const missing: string[] = [];
  let total = 0;
  const last = starts.reduce((k, s, i) => (values.has(s) ? i : k), -1);
  starts.forEach((s, i) => {
    if (i > last) return;
    const v = values.get(s);
    if (v === undefined) return void missing.push(s);
    total += v;
    points.push({ start: s, i, total });
  });
  return { points, missing };
}

const list = (labels: string[]) => (labels.length > 4 ? `${labels.slice(0, 4).join(", ")} and ${labels.length - 4} more` : labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0]);

/** How the running total stands against the plan, in words: "ahead of plan by 1,200 €", or "92 % of plan, 800 € behind". */
function standing(metric: Metric, total: number, plan: number, style: NumberStyle): { words: string; on: boolean } {
  const gap = total - plan;
  const size = formatValue(metric, Math.abs(gap), style);
  if (gap === 0) return { words: "on plan", on: true };
  // For a Metric where lower is better, a smaller total is ahead; where neither is better, any gap is off the plan.
  const ahead = metric.polarity === "lower" ? gap < 0 : metric.polarity === "higher" ? gap > 0 : false;
  if (ahead) return { words: `ahead of plan by ${size}`, on: true };
  const share = plan > 0 ? formatPercent((total / plan) * 100, style, 0) : null;
  if (metric.polarity === "target") return { words: `${size} ${gap > 0 ? "above" : "below"} plan`, on: false };
  return { words: share ? `${share} of plan, ${size} behind` : `${size} behind plan`, on: false };
}

/** The running total of a Metric through its current year, against its plan (unless `plan` is false) and last year's, or why there is none. */
export function runningTotal(input: { metric: Metric; points: readonly Point[]; targets?: readonly Point[]; yearStart: YearStart; today: string; style: NumberStyle; plan?: boolean }): RunningModel {
  const { metric, yearStart, style } = input;
  if (metric.aggregation !== "sum") return { ok: false, reason: NOT_ADDED };
  const span = metric.period as Span;
  if (span === "year" || span === "half") return { ok: false, reason: TOO_COARSE };
  const own = latestOfEach(input.points).filter((p) => Number.isFinite(Number(p.value)));
  if (!own.length) return { ok: false, reason: "There are no values to add up." };
  const yearOf = (d: string) => periodStart(d, "year", yearStart);
  // The current year is the one today falls in; before its first value, the year of the latest value.
  const todays = yearOf(input.today);
  const year = own.some((p) => yearOf(p.period) === todays) ? todays : yearOf(own.at(-1)!.period);
  const before = shiftPeriod(year, "year", -1);
  const starts = startsOf(year, span, yearStart);
  const lastStarts = startsOf(before, span, yearStart);
  const slotOf = new Map(starts.map((s, i) => [s, i]));
  // A day lines up by its date, so after 29 February the days are still the same days; the others by their place in the year.
  const slotLast = (s: string, i: number): number | undefined => (span === "day" ? slotOf.get(iso(addYears(parseISO(s), 1))) : i);
  const slots = span === "day" ? starts.length : Math.max(starts.length, lastStarts.length);
  const label = (s: string) => periodLabel(s, span, yearStart, true);
  const valueMap = (ss: string[]) => new Map(own.filter((p) => ss.includes(p.period)).map((p) => [p.period, Number(p.value)]));
  const notes: string[] = [];

  const now = cumulate(starts, valueMap(starts));
  const lastNow = now.points.at(-1);
  if (!lastNow) return { ok: false, reason: "There are no values to add up." };
  if (now.missing.length) notes.push(`No value for ${list(now.missing.map(label))}: the line goes on, and the total counts only the values held.`);
  // A period still running is not compared with a whole plan or a whole year: the comparison is made at the one before.
  const running = lastNow.start === periodStart(input.today, span, yearStart);
  const compare = running && now.points.length > 1 ? now.points.at(-2)! : lastNow;
  if (running) notes.push(`${label(lastNow.start)} is still running${compare === lastNow ? "" : ", so the comparison is made at " + label(compare.start)}.`);

  // The plan: the Target Series of the year's periods, else a target with one bound, counted each period.
  const series = new Map((input.targets ?? []).filter((p) => slotOf.has(p.period) && Number.isFinite(Number(p.value))).map((p) => [p.period, Number(p.value)]));
  const bound = metric.target_min !== null && metric.target_max === null ? Number(metric.target_min) : metric.target_max !== null && metric.target_min === null ? Number(metric.target_max) : null;
  const planned = input.plan === false ? null : series.size ? series : bound !== null && Number.isFinite(bound) ? new Map(starts.map((s) => [s, bound])) : null;
  const plan = planned ? cumulate(starts, planned) : null;
  const planEnd = plan?.points.at(-1);
  if (input.plan === false) {
    // The plan is switched off (the design's option showTarget): nothing is said of it.
  } else if (series.size) {
    // Only up to the last value: periods still to come have no plan yet, and that is no gap.
    const none = starts.filter((s) => !series.has(s) && s <= lastNow.start);
    if (none.length) notes.push(`No plan for ${list(none.map(label))}: the plan adds up only the periods that have one.`);
  } else if (planEnd) notes.push(`Plan: the target of ${formatValue(metric, bound as number, style)} each ${span}, added up. A Target Series would plan it period by period.`);
  else notes.push(NO_PLAN);

  const lastYear = cumulate(lastStarts, valueMap(lastStarts));
  const lastPoints = lastYear.points.flatMap((p) => { const at = slotLast(p.start, p.i); return at === undefined ? [] : [{ at, total: p.total }]; });
  if (!lastYear.points.length) notes.push("No values for last year.");

  // The running total against the plan, at the last whole period (the plan's total up to then).
  const planThen = plan?.points.filter((p) => p.i <= compare.i).at(-1);
  const stand = planThen ? standing(metric, compare.total, planThen.total, style) : null;
  const write = (n: number) => formatValue(metric, n, style);
  const lines: RunningLine[] = [{ key: "now", name: "This year", points: now.points.map((p) => ({ at: p.i, total: p.total })), end: write(lastNow.total), words: stand?.words ?? null }];
  if (plan && planEnd) lines.push({ key: "plan", name: "Plan", points: plan.points.map((p) => ({ at: p.i, total: p.total })), end: write(planEnd.total), words: null });
  if (lastPoints.length) lines.push({ key: "last", name: "Last year", points: lastPoints, end: write(lastPoints.at(-1)!.total), words: null });

  // About five labels along the way, the first period of the year among them.
  const step = Math.max(1, Math.ceil(slots / 6));
  const ticks = Array.from({ length: Math.ceil(slots / step) }, (_, k) => k * step).map((at) => ({ at, label: label(at < starts.length ? starts[at] : lastStarts[at]) }));
  const said = lines.map((l) => `${l.name}: ${l.end}${l.words ? ` (${l.words})` : ""}`).join("; ");
  const alt = `Running total of ${metric.name} since the start of ${periodLabel(year, "year", yearStart)}, through ${label(lastNow.start)}, with ${plan && planEnd ? "the plan" : "no plan"} and last year's. ${said}. ${notes.join(" ")}`;
  return { ok: true, slots, lines, ticks, status: stand ? (stand.on ? "on" : "off") : null, notes, alt };
}
