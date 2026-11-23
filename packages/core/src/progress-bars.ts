// The progress mark of a View Design (GLOSSARY: View Design, Target Range, Attainment): each Metric's latest value
// against its target, one compact bar each. What it draws (where the fill ends, where the target sits, the words that
// say how far along a Metric is) is worked out here, from the core's own functions (targetFor, attainment, targetStatus),
// so a widget, a Snapshot, a View Link and a deck's picture say the same; the view only turns it into shapes.
// Pure: it reads the data it is given and nothing else. Colour only ever means on or off target: a Metric without a
// target, or without a value, is drawn plain and says so in words.
import { attainment, attainmentShown, attainmentText, gapText, targetFor, targetGap } from "./compare";
import { latestOfEach } from "./display-periods";
import { formatValue, targetLabel, targetStatus, targetText } from "./format";
import type { NumberStyle } from "./number-style";
import type { AttainmentMethod } from "./attainment-method";
import type { CanvasData, Metric } from "./types";
import { PROGRESS_BARS } from "./view-design";

/** One bar: positions run from 0 (the start of the scale) to 1 (its end). */
export type ProgressRow = {
  id: number;
  name: string;
  /** The latest value in the Metric's Number Style; null when there is none yet. */
  value: string | null;
  /** How far the fill reaches; null without a value. */
  fill: number | null;
  /** The target as a lighter band (both bounds), as a tick (one bound), or neither. */
  band: { from: number; to: number } | null;
  tick: number | null;
  /** Where the value sits against the target; null without a target or a value. */
  status: "below" | "on" | "above" | null;
  /** In words, beside the bar: "92 % of target", "6.5 pts below target", "No target", "No value yet". */
  words: string;
  /** The target as words ("≥ 100 €"), when there is one. */
  target: string | null;
};

/** What the mark draws: one bar per Metric, in the order given, or why it draws nothing. */
export type ProgressModel = { ok: true; rows: ProgressRow[]; alt: string } | { ok: false; reason: string };

/** The part of a canvas's data the bars are made from. */
export type ProgressData = Pick<CanvasData, "series" | "targets" | "numberStyle" | "attainmentMethod">;

/** Where `x` sits on the scale from `lo` to `hi`, from 0 to 1. */
const place = (x: number, lo: number, hi: number): number => (x - lo) / (hi - lo);

/** One Metric's bar: the latest value of its own series against the target of that period. */
function row(m: Metric, data: ProgressData, method: AttainmentMethod, style: NumberStyle): ProgressRow {
  const last = latestOfEach(data.series[m.slug] ?? []).at(-1);
  const none = { id: m.id, name: m.name, value: null, fill: null, band: null, tick: null, status: null, target: null };
  if (!last) return { ...none, words: "No value yet" };
  const value = Number(last.value);
  const t = targetFor(m, last.period, data.targets[m.id]);
  const min = t.min === null ? null : Number(t.min);
  const max = t.max === null ? null : Number(t.max);
  const bounds = [min, max].filter((x): x is number => x !== null && Number.isFinite(x));
  // The scale starts at 0 (or lower, for a Metric that can be below it) and ends a little past the highest of the
  // value and the target, so neither sits on the edge; a bar has a zero, it is not a trend.
  const lo = Math.min(0, value, ...bounds);
  const top = Math.max(value, ...bounds);
  const hi = top > lo ? top + (top - lo) * 0.1 : lo + 1;
  const base = { ...none, value: formatValue(m, value, style), fill: place(value, lo, hi) };
  if (!bounds.length) return { ...base, words: "No target" };
  const status = targetStatus({ target_min: min, target_max: max }, value);
  const att = attainment(m, value, { min, max }, method);
  const gap = targetGap(m, value, { min, max });
  // A percentage says little below 0 % or where there is none: the distance to the target says it then.
  const words = attainmentShown(att) ? `${attainmentText(att, style)} of target` : gap === null ? "No target" : gapText(m, gap, style);
  return {
    ...base,
    status,
    words: status && status !== "on" ? `${words}, ${targetLabel(m.polarity, status).toLowerCase()}` : words,
    band: min !== null && max !== null ? { from: place(min, lo, hi), to: place(max, lo, hi) } : null,
    tick: min !== null && max !== null ? null : place(bounds[0], lo, hi),
    target: targetText({ ...m, target_min: min, target_max: max }, style),
  };
}

/** The bars for the Metrics a widget holds, as the person may see them: only these ever reach it. */
export function progressModel(metrics: Metric[], data: ProgressData): ProgressModel {
  if (!metrics.length) return { ok: false, reason: "Drop at least one metric." };
  if (metrics.length > PROGRESS_BARS.max) return { ok: false, reason: `Progress shows up to ${PROGRESS_BARS.max} Metrics and this has ${metrics.length}. More cannot be read: pick fewer.` };
  const rows = metrics.map((m) => row(m, data, data.attainmentMethod, data.numberStyle));
  const said = (r: ProgressRow) => `${r.name}: ${r.value ?? "no value"}${r.target ? `, target ${r.target}` : ""}, ${r.words}`;
  const rule = "Each bar starts at 0 and has its own scale; the lighter band or the tick is the target, and green or red says only whether the value is on target.";
  return { ok: true, rows, alt: `Progress against target for ${rows.length} Metrics. ${rule} ${rows.map(said).join("; ")}.` };
}
