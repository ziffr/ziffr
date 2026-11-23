// The stacked mark of a View Design (GLOSSARY: View Design, Breakdown): what a Metric's Breakdowns draw over time, worked
// out once so the widget, a Snapshot, a View Link and a deck's picture show the same stack. The view only turns it into
// shapes. Pure: it reads the rows it is given and nothing else.
//
// Honest rules, said on the chart (`rule`) and in its text alternative (`alt`):
// - A stack needs positive rows, so a Breakdown with a negative row is refused in words, not drawn wrongly.
// - The segments are the largest rows of the newest period (at most STACKED_ROWS), in that order, so every bar reads the
//   same; everything else is one "Other" segment.
// - Rows need not add up to the Metric's value, so a bar is the sum of its rows and the chart says when that differs.
// - A period with no Breakdown is not drawn, and the chart says how many were left out.
import { shiftPeriod, type Span } from "./periods";
import type { BreakdownRow } from "./types";
import { windowProblem } from "./polar-marks";

/** How many rows get a segment of their own; the rest are gathered in Other. */
export const STACKED_ROWS = 5;
/** The name of the segment that gathers the rows without a segment of their own. */
export const OTHER = "Other";

/** One segment of the stack, from the bottom: a row label, or Other. */
export type Segment = { label: string; other: boolean };
/** One bar: a period, the size of each segment (in the order of the segments) and the sum of its rows. */
export type Bar = { period: string; label: string; parts: number[]; total: number; totalText: string };
/** What a stacked chart draws: the segments, the bars oldest first, or why it draws nothing. */
export type StackedModel =
  | { ok: true; segments: Segment[]; bars: Bar[]; max: number; leftOut: number; rule: string; alt: string; latest: { label: string; value: string }[] }
  | { ok: false; reason: string };

/** What the model is given: the Metric's Breakdown per period, its own values, and how to write a period and a value. */
export type StackedInput = {
  name: string;
  by: Span;
  /** The newest period the chart may end on and how many periods it looks back (this one included). */
  to: string;
  window: number;
  byPeriod: Record<string, BreakdownRow[]>;
  /** The Metric's own value per period, to say when the rows do not add up to it. */
  values: Record<string, number>;
  /** Periods the Metric has a value in, so a period with a value and no Breakdown is counted as left out. */
  periods: string[];
  label: (period: string) => string;
  write: (value: number) => string;
};

/** "3 periods", "1 period". */
export const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
// Rows add up to the value when they are within this share of it (as a Finding's share panel reads them).
const NEAR = 0.02;

/** Rows by label, a label that appears twice added up, a value that is not a number left out. */
export function merged(rows: BreakdownRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (Number.isFinite(r.value)) out.set(r.label, (out.get(r.label) ?? 0) + r.value);
  return out;
}

/** The periods of the window (the last `window` ending at `to`) that have a Breakdown, oldest first, or why there is none: what every chart of a Breakdown over time starts from. */
export function drawnPeriods(input: { by: Span; to: string; window: number; byPeriod: Record<string, BreakdownRow[]>; periods: string[] }): { ok: true; drawn: string[]; leftOut: number } | { ok: false; reason: string } {
  const problem = windowProblem(input.window);
  if (problem) return { ok: false, reason: problem };
  const from = shiftPeriod(input.to, input.by, 1 - input.window);
  const inWindow = (p: string) => p >= from && p <= input.to;
  const drawn = Object.keys(input.byPeriod).filter((p) => inWindow(p) && merged(input.byPeriod[p]).size > 0).sort();
  if (drawn.length === 0) return { ok: false, reason: "No period shown has a breakdown to draw." };
  // Periods the Metric has a value in, or a Breakdown that did not draw, but that have no Breakdown rows.
  const leftOut = new Set([...input.periods.filter(inWindow), ...Object.keys(input.byPeriod).filter(inWindow)].filter((p) => !drawn.includes(p))).size;
  return { ok: true, drawn, leftOut };
}

/** The stack of a Metric's Breakdowns over the last `window` periods ending at `to`, or why there is none. */
export function stackedModel(input: StackedInput): StackedModel {
  const window = drawnPeriods(input);
  if (!window.ok) return window;
  const { drawn, leftOut } = window;
  const rowsOf = new Map(drawn.map((p) => [p, merged(input.byPeriod[p])]));
  if ([...rowsOf.values()].some((m) => [...m.values()].some((v) => v < 0))) return { ok: false, reason: "This Breakdown has negative rows; stacked bars need positive ones." };
  const latestPeriod = drawn[drawn.length - 1];
  // The largest rows of the newest period, biggest first (ties by label, so the order never depends on how rows arrived).
  const ranked = [...rowsOf.get(latestPeriod)!].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return { ok: false, reason: "Every row of the newest breakdown is 0, so there is nothing to stack." };
  const named = ranked.slice(0, STACKED_ROWS).map(([label]) => label);
  const rest = (m: Map<string, number>) => [...m].filter(([label]) => !named.includes(label)).reduce((a, [, v]) => a + v, 0);
  const hasOther = drawn.some((p) => rest(rowsOf.get(p)!) > 0);
  const segments: Segment[] = [...named.map((label) => ({ label, other: false })), ...(hasOther ? [{ label: OTHER, other: true }] : [])];
  const bars: Bar[] = drawn.map((period) => {
    const m = rowsOf.get(period)!;
    const parts = [...named.map((l) => m.get(l) ?? 0), ...(hasOther ? [rest(m)] : [])];
    const total = parts.reduce((a, b) => a + b, 0);
    return { period, label: input.label(period), parts, total, totalText: input.write(total) };
  });
  const differs = bars.some((b) => {
    const v = input.values[b.period];
    return v !== undefined && Math.abs(b.total - v) > Math.abs(v) * NEAR;
  });
  const first = bars[0];
  const last = bars[bars.length - 1];
  const rule = [
    `Each bar stacks that period's rows; its height is their sum.`,
    differs ? `The rows do not add up to ${input.name}'s value in every period, so a bar's height can differ from it.` : "",
    hasOther ? `${OTHER} gathers every row that is not one of the ${named.length === 1 ? "largest" : `${named.length} largest`} of ${last.label}.` : "",
    leftOut ? `${count(leftOut, "period")} left out: no breakdown.` : "",
  ].filter(Boolean).join(" ");
  const alt = [
    `Stacked bars of ${input.name}, ${count(bars.length, "period")}, ${first.label}${bars.length > 1 ? ` to ${last.label}` : ""}.`,
    `Segments from the bottom: ${segments.map((s) => s.label).join(", ")}.`,
    ...bars.map((b) => `${b.label}: total ${b.totalText}; ${segments.map((s, i) => `${s.label} ${input.write(b.parts[i])}`).join("; ")}.`),
    rule,
  ].join(" ");
  const latest = segments.map((s, i) => ({ label: s.label, value: input.write(last.parts[i]) }));
  return { ok: true, segments, bars, max: Math.max(...bars.map((b) => b.total)), leftOut, rule, alt, latest };
}
