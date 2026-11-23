// The polar and radar marks of a View Design (GLOSSARY: View Design; spec 0041, ticket 10): what they draw, worked out
// once and in order, so the widget, a Snapshot, a View Link and a deck's picture all show the same numbers. The view
// only turns these into shapes. Pure: it reads the series it is given and nothing else.
//
// Two honest rules, said on the chart itself (`rule`) and in its text alternative (`alt`):
// - A polar plot's size is the distance from the centre, 0, so it refuses a value below 0 (a line shows those).
// - A radar compares Metrics counted in different units, so there is no common scale: each spoke has its own, the
//   lowest value of the periods shown at the centre and the highest at the rim. It says where a value sits in its
//   own range, never how big it is next to another Metric's.
// A value that is missing is a gap, never a 0. Spokes keep the order they were given in.
import type { Span } from "./periods";
import { periodLabel, periodsBetween, shiftPeriod } from "./periods";
import { dayAfter, heldText, isPartial, shownSeries } from "./display-periods";
import type { CanvasData, Metric, WidgetSettings } from "./types";
import { SPOKES } from "./view-design";
import { formatPercent, formatValue } from "./format";
import type { NumberStyle } from "./number-style";

export { SPOKES };

/** One value of a series, as the marks are given it. `note` says why it is not a whole, complete period ("so far", "2 of 3 months"); a Condensed Value covers several periods and is not drawn. */
export type MarkPoint = { period: string; value: number; note?: string; condensed?: boolean };

/** A spoke or period with its value written in the Metric's Number Style. `at` is how far out it is, from 0 (centre) to 1 (rim). */
export type Mark = { label: string; text: string; at: number; period?: string } | { label: string; text: string | null; at: null; gap: string; why?: string; period?: string };

/** What a polar plot draws: the periods in order as angles, or why it draws nothing. */
export type PolarModel = { ok: true; marks: Mark[]; closed: boolean; top: string; rule: string; alt: string } | { ok: false; reason: string };

/** What a radar draws: the spokes in order, one or two shapes, or why it draws nothing. */
export type RadarModel =
  | { ok: true; spokes: string[]; shapes: { name: string; marks: Mark[] }[]; rule: string; alt: string }
  | { ok: false; reason: string };

const CYCLE: Record<Span, number> = { day: 7, week: 52, month: 12, quarter: 4, half: 2, year: 0 };
const count = (n: number) => `${n} ${n === 1 ? "period" : "periods"}`;
const finite = (p: MarkPoint) => Number.isFinite(p.value);
const byPeriod = (a: MarkPoint, b: MarkPoint) => a.period.localeCompare(b.period);
const named = (label: string, p?: MarkPoint) => (p?.note ? `${label} (${p.note})` : label);
const RUNNING = "so far";
const CONDENSED = "Some of these values are Condensed Values, each standing for several periods in one value, so this chart cannot place them. Show the values by their own period instead.";
/** How far in from the rim a radar's lowest value sits, as a share of the radius: the centre itself is kept for "nothing", so a lowest value never looks like no value. */
export const RADAR_INNER = 0.12;
/** The distance from the centre, 0 to 1, at which a radar draws a place `at` (0 lowest, 1 highest): from the inner ring to the rim. */
export const radarRadius = (at: number): number => RADAR_INNER + (1 - RADAR_INNER) * at;
/** Why a window cannot be used, in words, or null when it is a whole number of periods of 1 or more. */
export const windowProblem = (window: number): string | null => (Number.isInteger(window) && window >= 1 ? null : "The number of periods to look back must be a whole number of 1 or more.");

/** Why a period is not a whole one: "so far" while it runs, "2 of 3 months" when it is over but has gaps; nothing for a whole one. */
export function pointNote(p: { held: number; length: number; toDate: boolean }, own: Span): string | undefined {
  return p.toDate ? RUNNING : isPartial(p) ? heldText(p, own) : undefined;
}

/** A polar plot of a series over the periods `from` to `to` (a window, ends included): each period around the circle, oldest first, one with no value left as a gap, at the ends too. */
export function polarModel(input: { name: string; points: MarkPoint[]; by: Span; from: string; to: string; label: (period: string) => string; write: (value: number) => string }): PolarModel {
  const { by } = input;
  const inWindow = input.points.filter((p) => finite(p) && p.period >= input.from && p.period <= input.to);
  if (inWindow.length === 0) return { ok: false, reason: "There are no values to draw." };
  if (inWindow.some((p) => p.condensed)) return { ok: false, reason: CONDENSED };
  // The circle starts at the first period that has a value: periods before it are not "missing", the Metric had nothing yet.
  const from = inWindow.map((p) => p.period).sort()[0];
  // Every period from there: a missing one keeps its place and shows as a gap. They are counted before they are listed, so a window of any length costs no more than the refusal.
  const length = periodsBetween(from, input.to, by) + 1;
  if (length > SPOKES.max) return { ok: false, reason: `A polar plot shows ${SPOKES.min} to ${SPOKES.max} periods and there are more. Show fewer periods.` };
  if (length < SPOKES.min) return { ok: false, reason: `A polar plot needs at least ${SPOKES.min} periods and these have ${length}. A line chart shows so few periods better.` };
  const periods = Array.from({ length }, (_, i) => shiftPeriod(from, by, i));
  // A value that does not fall on the grid of periods would be left out of the circle without a word.
  if (inWindow.some((p) => !periods.includes(p.period))) return { ok: false, reason: "These values do not start at the beginning of a period, so they cannot be placed around the circle." };
  if (inWindow.some((p) => p.value < 0)) return { ok: false, reason: "A polar plot measures from the centre outward, and the centre is 0, so it cannot show a value below 0. A line chart shows these values." };
  // A period still running is written but neither sets the rim nor sits on the scale, or it would read as a collapse.
  const whole = inWindow.filter((p) => p.note !== RUNNING);
  if (whole.length === 0) return { ok: false, reason: "Every period shown is still running, so nothing can be placed on the circle yet." };
  const max = Math.max(...whole.map((p) => p.value));
  if (max === 0) return { ok: false, reason: "Every value is 0, so there is nothing to draw around the circle." };
  const at = new Map(inWindow.map((p) => [p.period, p]));
  const marks: Mark[] = periods.map((p) => {
    const v = at.get(p);
    const label = named(input.label(p), v);
    if (v === undefined) return { label, text: null, at: null, gap: "no value" };
    if (v.note === RUNNING) return { label, text: input.write(v.value), at: null, gap: "still running, so it is not placed", why: "not placed" };
    return { label, text: input.write(v.value), at: v.value / max };
  });
  const top = input.write(max);
  // The last period joins the first only for one whole cycle (12 months, 4 quarters, 2 halves, 7 days) with a value at both ends: the rule says what is drawn.
  const cycle = CYCLE[by] === length;
  const closed = cycle && marks[0].at !== null && marks[length - 1].at !== null;
  const join = closed ? " The line joins the last period to the first: these are one whole cycle." : cycle ? " These are one whole cycle, but the line is not joined across a period that is not placed." : " The line is open: these periods are not one whole cycle.";
  const start = from > input.from ? ` The circle starts at the first period with a value, ${input.label(from)}.` : "";
  const running = marks.some((m) => m.at === null && m.text !== null) ? " A period still running is written but not placed, and does not set the rim." : "";
  // A scale from 0 hides small ups and downs of a Metric that stays high: honest, and said.
  const low = Math.min(...whole.map((p) => p.value));
  const flat = (max - low) / max < 0.3 ? " The scale starts at 0, so small ups and downs look small." : "";
  const rule = `Distance from the centre is the value: 0 at the centre, ${top} at the rim. The first period is at the top and the others follow clockwise.${flat}${start}${join}${running}`;
  const alt = `${input.name}, as a polar plot of ${periods.length} periods. ${rule} ${marks.map((m) => `${m.label}: ${m.text ?? "no value"}`).join("; ")}.`;
  return { ok: true, marks, closed, top, rule, alt };
}

/** One Metric as a spoke of a radar. `points` is what the Metric shows, with their notes; the window is applied here. */
export type RadarInput = { name: string; points: MarkPoint[]; write: (value: number) => string; period: (period: string) => string; by: Span };

/** Where `v` sits between `lo` and `hi`, from 0 to 1: the value drawn, from the numbers the labels say. */
export const along = (v: number, lo: number, hi: number): number => (v - lo) / (hi - lo);

/** In words: where a position on a spoke is, never a rounded 0 or 100 for a value that is not the lowest or highest. */
export function whereWords(at: number, style: NumberStyle): string {
  if (at <= 0) return "at its lowest";
  if (at >= 1) return "at its highest";
  const pct = Math.min(99, Math.max(1, Math.round(at * 100)));
  return `${formatPercent(pct, style, 0)} of the way up its range`;
}

/** A radar of Metrics' latest values (and, with `against`, the period before), each spoke on its own scale. The window ends at the newest period any Metric has, so a Metric with nothing recent is a gap, not its old value passed off as the latest. */
export function radarModel(inputs: RadarInput[], opts: { window: number; against?: "previous"; style: NumberStyle }): RadarModel {
  if (inputs.length < SPOKES.min) return { ok: false, reason: `A radar needs ${SPOKES.min} to ${SPOKES.max} Metrics and this has ${inputs.length}. A line chart or a table shows so few better.` };
  if (inputs.length > SPOKES.max) return { ok: false, reason: `A radar shows ${SPOKES.min} to ${SPOKES.max} Metrics and this has ${inputs.length}. More cannot be read: pick fewer.` };
  const problem = windowProblem(opts.window);
  if (problem) return { ok: false, reason: problem };
  const window = opts.window;
  // Two Metrics with one name would draw two identical spokes: the Slot number tells them apart.
  const names = inputs.map((i, k) => (inputs.filter((o) => o.name === i.name).length > 1 ? `${i.name} (Slot ${k + 1})` : i.name));
  const lasts = inputs.flatMap((i) => i.points.filter(finite).map((p) => p.period));
  const end = [...lasts].sort().pop() as string;
  const now: Mark[] = [];
  const before: Mark[] = [];
  const kept: string[] = [];
  for (const [k, i] of inputs.entries()) {
    const all = i.points.filter(finite);
    const shown = all.filter((p) => periodsBetween(p.period, end, i.by) < window).sort(byPeriod);
    if (shown.some((p) => p.condensed)) return { ok: false, reason: CONDENSED };
    const latest = shown[shown.length - 1];
    // "The period before" is the one just before the latest, not the one before it that has a value.
    const prev = opts.against && latest ? all.find((p) => p.period === shiftPeriod(latest.period, i.by, -1)) : undefined;
    if (prev?.condensed) return { ok: false, reason: CONDENSED };
    // A period still running is not a whole one: its value is written but never sets the scale or sits on it, or it would read as a fall.
    const values = [...shown.filter((p) => p.note !== RUNNING).map((p) => p.value), ...(prev && prev.note !== RUNNING ? [prev.value] : [])];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    // A value with no range to sit in is still said; it is just not placed on the spoke.
    const why = values.length === 1 ? "only one period is shown, so it has no range to sit in" : "the same in every period shown, so it has no range to sit in";
    const mark = (p: MarkPoint | undefined, none: string): Mark => {
      if (!p) return { label: names[k], text: null, at: null, gap: none };
      const label = named(names[k], p);
      if (p.note === RUNNING) return { label, text: i.write(p.value), at: null, gap: "still running, so it is not placed on the scale", why: "not placed", period: i.period(p.period) };
      return hi === lo ? { label, text: i.write(p.value), at: null, gap: why, why: values.length === 1 ? "one period only" : "same in every period", period: i.period(p.period) } : { label, text: i.write(p.value), at: along(p.value, lo, hi), period: i.period(p.period) };
    };
    now.push(mark(latest, `no value in the last ${count(window)}`));
    before.push(mark(prev, "no value in the period before"));
    kept.push(names[k]);
  }
  const rule = `Each spoke has its own scale, so that Metrics counted in different units can stand together: its lowest value of the last ${count(window)}${opts.against ? " and the period before" : ""} is on the small inner ring and its highest at the rim. Further out means a higher value, not a better one. A radar shows where each value sits in its own range, not which Metric is larger.`;
  const shapes = [{ name: "Latest", marks: now }, ...(opts.against ? [{ name: "Period before", marks: before }] : [])];
  const said = (m: Mark) => (m.at === null ? `${m.label}: ${m.text === null ? "" : `${m.text} (${m.period}), `}${m.gap}` : `${m.label}: ${m.text} (${m.period}), ${whereWords(m.at, opts.style)}`);
  const alt = `A radar of ${kept.length} Metrics, spokes in this order: ${kept.join(", ")}. ${rule} ${shapes.map((s) => `${s.name}: ${s.marks.map(said).join("; ")}.`).join(" ")}`;
  return { ok: true, spokes: kept, shapes, rule, alt };
}

/** The Metrics of a radar as it draws them: each by the widget's Display Period when the design offers one, the Metric's own Number Style in every label.
 * Only the widget's own Metrics, as the person may see them, ever reach it. */
export function radarInputs(metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today" | "numberStyle">, settings: Pick<WidgetSettings, "display" | "asOf">, offersDisplay: boolean): RadarInput[] {
  const today = settings.asOf ? dayAfter(settings.asOf) : undefined;
  return metrics.map((m) => {
    const shown = shownSeries(m, data, offersDisplay ? settings.display : undefined, { today });
    return {
      name: m.name,
      points: shown.points.map((p) => ({ period: p.period, value: p.value, note: pointNote(p, m.period), condensed: !!p.condensed })),
      write: (v) => formatValue(m, v, data.numberStyle),
      period: (p) => periodLabel(p, shown.by, data.yearStart),
      by: shown.by,
    };
  });
}
