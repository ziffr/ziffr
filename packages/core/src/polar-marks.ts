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
import { periodLabel, shiftPeriod } from "./periods";
import { dayAfter, isPartial, shownSeries } from "./display-periods";
import { formatValue } from "./format";
import type { CanvasData, Metric, WidgetSettings } from "./types";
import { SPOKES } from "./view-design";
import { formatPercent } from "./format";
import type { NumberStyle } from "./number-style";

export { SPOKES };

/** One value of a series, as the marks are given it. */
export type MarkPoint = { period: string; value: number };

/** A spoke or period with its value written in the Metric's Number Style. `at` is how far out it is, from 0 (centre) to 1 (rim). */
export type Mark = { label: string; text: string; at: number; period?: string } | { label: string; text: string | null; at: null; gap: string; period?: string };

/** What a polar plot draws: the periods in order as angles, or why it draws nothing. */
export type PolarModel = { ok: true; marks: Mark[]; top: string; rule: string; alt: string } | { ok: false; reason: string };

/** What a radar draws: the spokes in order, one or two shapes, or why it draws nothing. */
export type RadarModel =
  | { ok: true; spokes: string[]; shapes: { name: string; marks: Mark[] }[]; rule: string; alt: string }
  | { ok: false; reason: string };

const count = (n: number) => `${n} ${n === 1 ? "period" : "periods"}`;

/** A polar plot of a series: its periods around the circle, oldest first from the top, a period with no value left as a gap. */
export function polarModel(input: { name: string; points: MarkPoint[]; by: Span; label: (period: string) => string; write: (value: number) => string; partialLast?: boolean }): PolarModel {
  const { points, by } = input;
  const real = points.filter((p) => Number.isFinite(p.value));
  if (real.length === 0) return { ok: false, reason: "There are no values to draw." };
  const sorted = [...real].sort((a, b) => a.period.localeCompare(b.period));
  // Every period from the first to the last: a missing one keeps its place and shows as a gap.
  const periods: string[] = [];
  for (let p = sorted[0].period; p <= sorted[sorted.length - 1].period; p = shiftPeriod(sorted[0].period, by, periods.length)) {
    periods.push(p);
    if (periods.length > SPOKES.max) break;
  }
  if (periods.length > SPOKES.max) return { ok: false, reason: `A polar plot shows ${SPOKES.min} to ${SPOKES.max} periods and these cover more. Show fewer periods.` };
  if (periods.length < SPOKES.min) return { ok: false, reason: `A polar plot needs at least ${SPOKES.min} periods and these cover ${periods.length}: a line shows so few better.` };
  const byPeriod = new Map(sorted.map((p) => [p.period, p.value]));
  // A value that does not fall on the grid of periods would be left out of the circle without a word.
  if (sorted.some((p) => !periods.includes(p.period))) return { ok: false, reason: "These values do not fall on whole periods, so they cannot be placed around the circle." };
  if (sorted.some((p) => p.value < 0)) return { ok: false, reason: "A polar plot measures from the centre outward, which is 0, so it cannot show a value below 0. A line chart shows these values." };
  const max = Math.max(...sorted.map((p) => p.value));
  if (max === 0) return { ok: false, reason: "Every value is 0, so there is nothing to draw around the circle." };
  const last = periods[periods.length - 1];
  const marks: Mark[] = periods.map((p) => {
    const label = input.label(p) + (input.partialLast && p === last ? " (so far)" : "");
    const v = byPeriod.get(p);
    return v === undefined ? { label, text: null, at: null, gap: "no value" } : { label, text: input.write(v), at: v / max };
  });
  const top = input.write(max);
  const rule = `Distance from the centre is the value: 0 at the centre, ${top} at the rim. The first period is at the top and the others follow clockwise.`;
  const alt = `${input.name}, as a polar plot of ${periods.length} periods. ${rule} ${marks.map((m) => `${m.label}: ${m.text ?? "no value"}`).join("; ")}.`;
  return { ok: true, marks, top, rule, alt };
}

/** One Metric as a spoke of a radar. `points` is what the Metric shows, oldest first; the window is applied here. */
export type RadarInput = { name: string; points: MarkPoint[]; write: (value: number) => string; period: (period: string) => string; by: Span; partialLast?: boolean };

/** Where `v` sits between `lo` and `hi`, from 0 to 1: the value drawn, from the numbers the labels say. */
export const along = (v: number, lo: number, hi: number): number => (v - lo) / (hi - lo);

/** In words: where a position on a spoke is, never a rounded 0 or 100 for a value that is not the lowest or highest. */
export function whereWords(at: number, style: NumberStyle): string {
  if (at <= 0) return "at its lowest";
  if (at >= 1) return "at its highest";
  const pct = Math.min(99, Math.max(1, Math.round(at * 100)));
  return `${formatPercent(pct, style, 0)} of the way up its range`;
}

/** A radar of Metrics' latest values (and, with `against`, the period before), each spoke on its own scale. */
export function radarModel(inputs: RadarInput[], opts: { window: number; against?: "previous"; style: NumberStyle }): RadarModel {
  if (inputs.length < SPOKES.min) return { ok: false, reason: `A radar needs ${SPOKES.min} to ${SPOKES.max} Metrics and this has ${inputs.length}: a line or a table shows so few better.` };
  if (inputs.length > SPOKES.max) return { ok: false, reason: `A radar shows ${SPOKES.min} to ${SPOKES.max} Metrics and this has ${inputs.length}: more cannot be read. Pick fewer.` };
  const window = Math.max(1, Math.floor(opts.window));
  const now: Mark[] = [];
  const before: Mark[] = [];
  const kept: string[] = [];
  for (const i of inputs) {
    const shown = i.points.filter((p) => Number.isFinite(p.value)).sort((a, b) => a.period.localeCompare(b.period)).slice(-window);
    const latest = shown[shown.length - 1];
    // "The period before" is the one just before the latest, not the one before it that has a value.
    const prevPeriod = latest ? shiftPeriod(latest.period, i.by, -1) : null;
    const prev = opts.against && prevPeriod ? i.points.find((p) => p.period === prevPeriod && Number.isFinite(p.value)) : undefined;
    const values = [...shown.map((p) => p.value), ...(prev ? [prev.value] : [])];
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 0;
    const label = i.name + (i.partialLast && latest ? " (so far)" : "");
    // A value with no range to sit in is still said; it is just not placed on the spoke.
    const mark = (p: MarkPoint | undefined, why: string): Mark => (!p ? { label, text: null, at: null, gap: why } : hi === lo ? { label, text: i.write(p.value), at: null, gap: "the same in every period shown, so it has no range to sit in", period: i.period(p.period) } : { label, text: i.write(p.value), at: along(p.value, lo, hi), period: i.period(p.period) });
    now.push(mark(latest, "no value"));
    before.push(mark(prev, "no value in the period before"));
    kept.push(i.name);
  }
  const rule = `Each spoke has its own scale, because these Metrics are not counted in the same unit: its lowest value of the last ${count(window)} is at the centre and its highest at the rim. A radar shows where each value sits in its own range, not which Metric is larger.`;
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
    const last = shown.points[shown.points.length - 1];
    return {
      name: m.name,
      points: shown.points.map((p) => ({ period: p.period, value: p.value })),
      write: (v) => formatValue(m, v, data.numberStyle),
      period: (p) => periodLabel(p, shown.by, data.yearStart),
      by: shown.by,
      partialLast: !!last && (last.toDate || isPartial(last)),
    };
  });
}
