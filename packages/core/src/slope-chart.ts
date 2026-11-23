// The slope mark of a View Design (GLOSSARY: View Design, Breakdown, Comparison): two points per row joined by a line,
// who rose and who fell between two moments. What it draws (which rows, their values at both ends, the change in words,
// the two rows worth a highlight, where every label sits) is worked out here, from the core's own period and comparison
// functions, so a widget, a Snapshot, a View Link and a deck's picture say the same; the view only turns it into shapes.
// Pure: it reads the data it is given and nothing else. Direction is carried by the shape and by words, never by
// colour; the two highlighted rows say "largest rise" and "largest fall" in their labels.
import { compare, type Comparison } from "./compare";
import { latestOfEach, resolverFrom } from "./display-periods";
import { difference, changePct } from "./exact";
import { formatChange, formatValue } from "./format";
import type { NumberStyle } from "./number-style";
import { periodLabel, shiftPeriod } from "./periods";
import type { CanvasData, Metric } from "./types";
import { SLOPE_CHOICES, SLOPE_ROWS } from "./view-design";

export { SLOPE_ROWS };

/** What a person may choose when placing a slope chart: by rows of a Breakdown, against the period before or the one a year earlier, or by several Metrics. "auto" follows what was placed. */
export type SlopeChoice = (typeof SLOPE_CHOICES)[number];

/** The words when a slope chart has nothing it can compare. */
export const SLOPE_NEEDS = "Choose a Metric with a Breakdown, or several Metrics in one unit";

/** The words when the Metrics are not counted in one unit. */
export const SLOPE_UNITS = "Slope charts compare Metrics in one unit";

/** The height of the plot in layout units, and how tall one line of a label is: the view draws in the same units. */
export const SLOPE_PLOT = { height: 200, line: 9 } as const;

/** One row: its values at both ends, written, the change in words, and where its ends and labels sit (layout units from the top; the highest value is at the top). */
export type SlopeRow = {
  key: string;
  name: string;
  before: number | null;
  after: number | null;
  beforeText: string | null;
  afterText: string | null;
  /** "up", "down" or "same" with both ends; "new" with only the right one, "gone" with only the left. */
  kind: "up" | "down" | "same" | "new" | "gone";
  /** The change in words: "+1,200 € (+8.0 %)", "new", "gone". */
  change: string;
  /** The row with the largest increase or the largest decrease, as the words say it. */
  mark: "largest rise" | "largest fall" | null;
  yBefore: number | null;
  yAfter: number | null;
  labelBefore: number | null;
  labelAfter: number | null;
};

/** What a slope chart draws, or why it draws nothing. */
export type SlopeModel =
  | { ok: true; rows: SlopeRow[]; beforeLabel: string; afterLabel: string; rule: string; alt: string }
  | { ok: false; reason: string };

/** The part of a canvas's data a slope chart is made from. */
export type SlopeData = Pick<CanvasData, "series" | "breakdowns" | "numberStyle" | "yearStart">;

type Item = { at: number; size: number };

/** Moves labels apart so that none touches the next, as little as it can: labels that want the same place share the room around it, and none leaves [lo, hi]. `at` is where a label's centre wants to be, `size` how tall it is. Returns the new centres in the order given. */
export function nudgeLabels(items: Item[], lo: number, hi: number): number[] {
  if (!items.length) return [];
  const order = items.map((_, i) => i).sort((a, b) => items[a].at - items[b].at || a - b);
  const sizes = order.map((i) => items[i].size);
  const gap = (k: number) => (sizes[k - 1] + sizes[k]) / 2;
  // Pool adjacent violators: a run of labels in contact moves as one block, centred on where its members wanted to be.
  type Block = { from: number; to: number; top: number };
  const offset: number[] = [0];
  for (let k = 1; k < order.length; k++) offset[k] = offset[k - 1] + gap(k);
  const wanted = (b: Block) => {
    let sum = 0;
    for (let k = b.from; k <= b.to; k++) sum += items[order[k]].at - offset[k];
    return sum / (b.to - b.from + 1);
  };
  const blocks: Block[] = [];
  for (let k = 0; k < order.length; k++) {
    blocks.push({ from: k, to: k, top: items[order[k]].at - offset[k] });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.top + offset[a.to] + gap(b.from) <= b.top + offset[b.from] + 1e-9) break;
      blocks.splice(-2, 2, { from: a.from, to: b.to, top: 0 });
      const m = blocks[blocks.length - 1];
      m.top = wanted(m);
    }
  }
  const pos: number[] = [];
  for (const b of blocks) for (let k = b.from; k <= b.to; k++) pos[k] = b.top + offset[k];
  // Keep inside the plot: pushed up from the bottom edge first, then down from the top edge if there is not room for all.
  const last = pos.length - 1;
  if (pos[last] > hi - sizes[last] / 2) {
    pos[last] = hi - sizes[last] / 2;
    for (let k = last - 1; k >= 0; k--) pos[k] = Math.min(pos[k], pos[k + 1] - gap(k + 1));
  }
  if (pos[0] < lo + sizes[0] / 2) {
    pos[0] = lo + sizes[0] / 2;
    for (let k = 1; k <= last; k++) pos[k] = Math.max(pos[k], pos[k - 1] + gap(k));
  }
  const out: number[] = [];
  order.forEach((i, k) => (out[i] = pos[k]));
  return out;
}

type Pair = { key: string; name: string; before: number | null; after: number | null };

/** Where the earlier moment of a comparison lies: the period before, or the same one a year earlier (a week a year earlier is the one 52 weeks back, as the Comparisons do). */
function earlier(latest: string, metric: Pick<Metric, "period">, against: "previous" | "year"): string {
  if (against === "previous") return shiftPeriod(latest, metric.period, -1);
  return metric.period === "week" ? shiftPeriod(latest, "week", -52) : shiftPeriod(latest, "year", -1);
}

const signed = (m: Metric, abs: number, style: NumberStyle) => (abs > 0 ? `+${formatValue(m, abs, style)}` : formatValue(m, abs, style));

/** The change between the two ends in words, with its size as a percentage where there is one. */
function changeOf(m: Metric, before: number | null, after: number | null, style: NumberStyle): { kind: SlopeRow["kind"]; change: string; abs: number } {
  if (before === null) return { kind: "new", change: "new", abs: 0 };
  if (after === null) return { kind: "gone", change: "gone", abs: 0 };
  const abs = difference(after, before);
  if (abs === 0) return { kind: "same", change: "no change", abs };
  const pct = changePct(after, before);
  return { kind: abs > 0 ? "up" : "down", change: pct === null ? signed(m, abs, style) : `${signed(m, abs, style)} (${formatChange(pct, style)})`, abs };
}

/** Lays the rows out and writes them. `m` gives the unit and decimals every value is written in. */
function build(m: Metric, pairs: Pair[], style: NumberStyle, labels: { before: string; after: string }, note: string): SlopeModel {
  const values = pairs.flatMap((p) => [p.before, p.after]).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!pairs.length || !values.length) return { ok: false, reason: SLOPE_NEEDS };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const { height, line } = SLOPE_PLOT;
  // One scale for both ends, from the lowest to the highest value: a line's slope is then the same change anywhere.
  const y = (v: number | null) => (v === null ? null : hi === lo ? height / 2 : height - ((v - lo) / (hi - lo)) * height);
  const changes = pairs.map((p) => changeOf(m, p.before, p.after, style));
  const rise = changes.reduce((best, c, i) => (c.kind === "up" && (best < 0 || c.abs > changes[best].abs) ? i : best), -1);
  const fall = changes.reduce((best, c, i) => (c.kind === "down" && (best < 0 || c.abs < changes[best].abs) ? i : best), -1);
  const rows: SlopeRow[] = pairs.map((p, i) => {
    const mark = i === rise ? "largest rise" : i === fall ? "largest fall" : null;
    return {
      key: p.key,
      name: p.name,
      before: p.before,
      after: p.after,
      beforeText: p.before === null ? null : formatValue(m, p.before, style),
      afterText: p.after === null ? null : formatValue(m, p.after, style),
      kind: changes[i].kind,
      change: changes[i].change,
      mark,
      yBefore: y(p.before),
      yAfter: y(p.after),
      labelBefore: null,
      labelAfter: null,
    };
  });
  // Each side's labels are moved apart on their own: the right ones are taller where the row carries a highlight's words.
  const place = (side: "Before" | "After") => {
    const at = rows.flatMap((r, i) => (r[`y${side}`] === null ? [] : [i]));
    const moved = nudgeLabels(at.map((i) => ({ at: rows[i][`y${side}`]!, size: side === "After" && rows[i].mark ? 2 * line : line })), 0, height);
    at.forEach((i, k) => (rows[i][`label${side}`] = moved[k]));
  };
  place("Before");
  place("After");
  const said = (r: SlopeRow) => `${r.name}: ${r.beforeText ?? "no value"} to ${r.afterText ?? "no value"}, ${r.change}${r.mark ? `, ${r.mark}` : ""}`;
  const rule = `Both sides share one scale, from the lowest to the highest value, which is not 0. ${note}`.trim();
  return { ok: true, rows, beforeLabel: labels.before, afterLabel: labels.after, rule, alt: `Slope chart of ${rows.length} rows, ${labels.before} to ${labels.after}. ${rule} ${rows.map(said).join("; ")}.` };
}

/** The rows of one Breakdown in two periods, paired by their labels: a row in only one of them is "new" or "gone". */
function byBreakdown(m: Metric, data: SlopeData, against: "previous" | "year", asOf?: string): SlopeModel {
  const byPeriod = data.breakdowns[m.id] ?? {};
  const periods = Object.keys(byPeriod).filter((p) => !asOf || p <= asOf).sort();
  const to = periods.at(-1);
  if (!to) return { ok: false, reason: SLOPE_NEEDS };
  const from = earlier(to, m, against);
  const name = (p: string) => periodLabel(p, m.period, data.yearStart, true);
  if (!byPeriod[from]) return { ok: false, reason: `${m.name} has no Breakdown for ${name(from)} to compare ${name(to)} with.` };
  const before = new Map(byPeriod[from].map((r) => [r.label.toLowerCase(), r]));
  const after = new Map(byPeriod[to].map((r) => [r.label.toLowerCase(), r]));
  const all = [...new Set([...after.keys(), ...before.keys()])].map((k) => ({ key: k, name: (after.get(k) ?? before.get(k))!.label, before: before.get(k)?.value ?? null, after: after.get(k)?.value ?? null }));
  // The rows with the most at stake stay when there are more than can be read: the larger of the two ends decides.
  const size = (p: Pair) => Math.max(Math.abs(p.before ?? 0), Math.abs(p.after ?? 0));
  const kept = all.length > SLOPE_ROWS ? [...all].sort((a, b) => size(b) - size(a)).slice(0, SLOPE_ROWS) : all;
  const rows = kept.sort((a, b) => (b.after ?? b.before ?? 0) - (a.after ?? a.before ?? 0));
  const cut = all.length > SLOPE_ROWS ? `The ${SLOPE_ROWS} largest of ${all.length} rows are shown.` : "";
  return build(m, rows, data.numberStyle, { before: name(from), after: name(to) }, cut);
}

/** Several Metrics of one unit, each Metric's latest value against the one before it (or a year earlier). */
function byMetrics(metrics: Metric[], data: SlopeData, against: "previous" | "year", asOf?: string): SlopeModel {
  if (metrics.length < 2) return { ok: false, reason: SLOPE_NEEDS };
  if (metrics.length > SLOPE_ROWS) return { ok: false, reason: `Slope charts show up to ${SLOPE_ROWS} Metrics and this has ${metrics.length}. More cannot be read: pick fewer.` };
  if (new Set(metrics.map((m) => m.unit.trim())).size > 1) return { ok: false, reason: SLOPE_UNITS };
  const resolve = resolverFrom(metrics, data.series);
  const key = against === "year" ? "yoy" : "prev";
  const lastOf = (m: Metric) => latestOfEach(data.series[m.slug] ?? []).filter((p) => !asOf || p.period <= asOf).at(-1);
  const pairs: Pair[] = [];
  const spans = new Set<string>();
  for (const m of metrics) {
    const last = lastOf(m);
    if (!last) continue;
    spans.add(`${m.period}|${last.period}`);
    const c: Comparison | undefined = compare(m, resolve, { keys: [key], yearStart: data.yearStart, asOf })[0];
    // A Metric with no value in the earlier period is "new", never a 0.
    pairs.push({ key: String(m.id), name: m.name, before: c?.available ? c.previous ?? null : null, after: last.value });
  }
  if (!pairs.length) return { ok: false, reason: SLOPE_NEEDS };
  const same = spans.size === 1 ? [...spans][0].split("|") : null;
  const now = same ? periodLabel(same[1], same[0] as Metric["period"], data.yearStart, true) : "Latest period";
  const then = same ? periodLabel(earlier(same[1], { period: same[0] as Metric["period"] }, against), same[0] as Metric["period"], data.yearStart, true) : against === "year" ? "A year earlier" : "Period before";
  const rows = pairs.sort((a, b) => (b.after ?? 0) - (a.after ?? 0));
  const skipped = metrics.length - pairs.length;
  return build(metrics[0], rows, data.numberStyle, { before: then, after: now }, skipped ? `${skipped} Metric${skipped === 1 ? " has" : "s have"} no value yet and ${skipped === 1 ? "is" : "are"} left out.` : "");
}

/** The slope chart for the Metrics a widget holds, as the person may see them: only these ever reach it. */
export function slopeModel(metrics: Metric[], data: SlopeData, choice: SlopeChoice = "auto", opts: { asOf?: string } = {}): SlopeModel {
  const mode = choice === "auto" ? (metrics.length > 1 ? "metrics" : "previous") : choice;
  if (!metrics.length) return { ok: false, reason: SLOPE_NEEDS };
  return mode === "metrics" ? byMetrics(metrics, data, "previous", opts.asOf) : byBreakdown(metrics[0], data, mode, opts.asOf);
}
