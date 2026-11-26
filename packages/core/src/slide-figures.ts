// What a Slide Element shows (GLOSSARY: Slide Element, Placeholder; spec 0057): its words filled from the data and the
// figures of its figure, column chart and tables, worked out here so the screen and the exports say the same thing. Pure.
// Visibility: everything is worked out from the data this viewer was sent. A Metric they may not see is `null` in the
// element's list: its Placeholders become empty words, and nothing says its name, a value or a Breakdown row of it.
import { writeNumber } from "@ziffr/figures";
import { targetFor } from "./compare";
import { formatValue } from "./format";
import { periodEnd, periodLabel, periodStart, periodsBetween, shiftPeriod } from "./periods";
import { fillWidgetText } from "./placeholders";
import type { ColumnsElement, FigureElement, GapTableElement, MetricTableElement, SlideTone } from "@ziffr/pack/slide-element";
import type { CanvasData, Metric, Period, Point, YearStart } from "./types";

/** How one element writes large numbers: as they are, in thousands or in millions. */
export type SlideScale = { div: 1 | 1000 | 1_000_000; suffix: "" | "k" | "M" };

const PLAIN_SCALE: SlideScale = { div: 1, suffix: "" };

/** The scale for numbers as large as `largest`: millions from a million, thousands from ten thousand. */
export function scaleOf(largest: number): SlideScale {
  const size = Math.abs(largest);
  if (size >= 1_000_000) return { div: 1_000_000, suffix: "M" };
  if (size >= 10_000) return { div: 1000, suffix: "k" };
  return PLAIN_SCALE;
}

/** What one element is drawn from: the data, its Metrics in Slot order (`null`: one the viewer may not see), the
 * slide's page number and the deck's footer. */
export type SlideContext = { data: CanvasData; metrics: (Metric | null)[]; slide?: number; footer?: string };

/** An element's Metrics in its Slot order; one the viewer may not see is `null`. */
export function elementMetrics(ids: readonly number[], data: CanvasData): (Metric | null)[] {
  return ids.map((id) => data.metrics.find((m) => m.id === id) ?? null);
}

const pointsOf = (m: Metric, data: CanvasData): Point[] => data.series[m.slug] ?? [];
const latest = (m: Metric, data: CanvasData): Point | undefined => pointsOf(m, data).at(-1);
const valueAt = (m: Metric, data: CanvasData, period: string): number | null => pointsOf(m, data).find((p) => p.period === period)?.value ?? null;
/** A Metric's newest value up to a period. */
const upTo = (m: Metric, data: CanvasData, period: string): Point | undefined => pointsOf(m, data).filter((p) => p.period <= period).at(-1);

/** One scale per unit for all of an element's Metrics, from the largest latest value in that unit, so that a quota and
 * the gap to it are written alike ("3.20 M€", "0.19 M€"). */
export function elementScale(m: Metric, ctx: Pick<SlideContext, "data" | "metrics">): SlideScale {
  const sizes = ctx.metrics.flatMap((x) => (x && x.unit === m.unit ? [Math.abs(latest(x, ctx.data)?.value ?? 0)] : []));
  return scaleOf(Math.max(0, Math.abs(latest(m, ctx.data)?.value ?? 0), ...sizes));
}

/** A value as a slide writes it: short in the element's scale ("3.01 M€"), or as the Metric writes it. `bare` leaves
 * the unit and the scale's letter out; `change` writes the sign of a change. A value that is not 0 never reads 0: it is
 * written in its own, smaller scale. */
export function writeSlideValue(m: Metric, v: number | null | undefined, scale: SlideScale, data: CanvasData, opts: { bare?: boolean; change?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  let s = scale;
  // Two decimals of a million hide anything under 5,000.
  if (!opts.bare && v !== 0 && s.div > 1 && Math.abs(v) / s.div < (s.suffix === "M" ? 0.005 : 0.5)) s = scaleOf(v);
  const decimals = s.suffix === "M" ? 2 : s.suffix === "k" ? 0 : m.decimals;
  const n = v / s.div;
  if (opts.bare) return writeNumber(n, decimals, data.numberStyle, opts.change ? { change: true } : {});
  const unit = m.unit ?? "";
  // A multiple, whether its Metric counts "times" or "×", is written as people write one on a slide: "2.3×".
  if (unit === "×" || unit === "times") return `${writeNumber(n, decimals, data.numberStyle, { suffix: s.suffix, ...(opts.change ? { change: true } : {}) })}×`;
  if (!s.suffix && !opts.change) return formatValue(m, v, data.numberStyle);
  const before = m.unit_position === "before";
  return writeNumber(n, decimals, data.numberStyle, { ...(before ? { unit, side: "before", suffix: s.suffix } : { unit: `${s.suffix}${unit}`, side: "after" }), ...(opts.change ? { change: true } : {}) });
}

/** The unit a scale writes in, for a title: "M€", "k$", "€". */
export const scaleUnit = (m: Metric, scale: SlideScale) => `${scale.suffix}${m.unit ?? ""}`;

/** Where a week stands in its quarter: the quarter's name, the week's number and how many weeks begin in the quarter.
 * A week belongs to the quarter its Monday is in. Null for anything but a weekly period. */
export function quarterWeeks(period: string, span: Period, yearStart: YearStart): { quarter: string; week: number | null; weeks: number | null } {
  const start = periodStart(period, "quarter", yearStart);
  const quarter = periodLabel(start, "quarter", yearStart).split(" ")[0];
  if (span !== "week") return { quarter, week: null, weeks: null };
  const first = periodStart(start, "week", yearStart) < start ? shiftPeriod(periodStart(start, "week", yearStart), "week", 1) : start;
  const end = periodEnd(start, "quarter");
  const lastMonday = periodStart(end, "week", yearStart);
  return { quarter, week: periodsBetween(first, period, "week") + 1, weeks: periodsBetween(first, lastMonday, "week") + 1 };
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const weeksLeft = (n: number) => `${NUMBER_WORDS[n] ?? n} ${n === 1 ? "week" : "weeks"}`;

/** Whether a change or gap is good news for a Metric: `null` for no change and for a Metric with no better side. */
const signalOf = (m: Metric, d: number): "good" | "bad" | null => (d === 0 || m.polarity === "target" ? null : d > 0 === (m.polarity === "higher") ? "good" : "bad");

// A Metric's name inside a sentence: "above quota". A name with capitals of its own (an acronym) stays as it is.
const inSentence = (name: string) => (name.slice(1) === name.slice(1).toLowerCase() ? name.toLowerCase() : name);

const SLIDE_PATTERN = /\{(metrics|metric|period|latest|change yoy|change prev|top row|target|quarter weeks|quarter week|quarter|weeks left|change|scale|slide|difference|gap)(?:\s+(\d))?(?:\s+(\d))?\}/gi;

/** An element's words filled from the data, and whether the first change or gap in them is good or bad news. A
 * Placeholder of a Metric the viewer may not see is empty; one without a value reads "–"; one that names a Slot the
 * element does not have stays as written, so the author sees it. */
export function fillSlideWords(text: string, ctx: SlideContext): { text: string; signal: "good" | "bad" | null } {
  let signal: "good" | "bad" | null = null;
  const note = (s: "good" | "bad" | null) => { signal ??= s; };
  const { data } = ctx;
  const out = text.replace(SLIDE_PATTERN, (all, raw: string, a?: string, b?: string) => {
    const key = raw.toLowerCase();
    if (key === "slide") return ctx.slide === undefined ? all : String(ctx.slide);
    const i = (a ? Number(a) : 1) - 1;
    if (key === "metrics") return fillWidgetText(all, { metric_ids: ctx.metrics.map((m) => m?.id ?? -1), settings: {} }, data) ?? all;
    if (i < 0 || i >= ctx.metrics.length) return all;
    const m = ctx.metrics[i];
    if (!m) return "";
    const last = latest(m, data);
    if (key === "difference" || key === "gap") {
      const j = (b ? Number(b) : 2) - 1;
      if (j < 0 || j >= ctx.metrics.length) return all;
      const other = ctx.metrics[j];
      if (!other) return "";
      const v = last ? valueAt(other, data, last.period) : null;
      if (!last || v === null) return "–";
      const d = last.value - v;
      if (key === "difference") return writeSlideValue(m, d, elementScale(m, ctx), data);
      // A gap reads against the second Metric: at or above it is good, whatever the Metrics' own direction.
      note(d < 0 ? "bad" : "good");
      if (d === 0) return `on ${inSentence(other.name)}`;
      const size = writeSlideValue(m, Math.abs(d), elementScale(m, ctx), data);
      return d < 0 ? `${size} short` : `${size} above ${inSentence(other.name)}`;
    }
    if (key === "metric") return m.name;
    if (key === "scale") return scaleUnit(m, elementScale(m, ctx));
    if (key === "latest") return last ? writeSlideValue(m, last.value, elementScale(m, ctx), data) : "–";
    if (key === "change") {
      const before = last ? valueAt(m, data, shiftPeriod(last.period, m.period, -1)) : null;
      if (!last || before === null) return "–";
      note(signalOf(m, last.value - before));
      return writeSlideValue(m, last.value - before, elementScale(m, ctx), data, { change: true });
    }
    if (key.startsWith("quarter") || key === "weeks left") {
      if (!last) return "–";
      const q = quarterWeeks(last.period, m.period, data.yearStart);
      if (key === "quarter") return q.quarter;
      if (q.week === null || q.weeks === null) return "–";
      return key === "quarter week" ? String(q.week) : key === "quarter weeks" ? String(q.weeks) : weeksLeft(Math.max(0, q.weeks - q.week));
    }
    // The Placeholders every text knows (period, change yoy, top row, target), for the Slot named.
    return fillWidgetText(`{${key}}`, { metric_ids: [m.id], settings: {} }, data) ?? all;
  });
  return { text: out, signal };
}

/** What a Slide Element says when it may not show a Metric it reads. */
export const NO_ACCESS = "No access to a Metric here. Ask its owner to share it.";

/** What a figure shows: its label, value and the line under them with its colour. */
export type FigureModel = { denied: true } | { denied: false; label: string; value: string; note: string; noteTone: "good" | "bad" | "muted"; strong: boolean };

/** A figure's words and value. The value is the first Metric's latest. */
export function figureModel(e: FigureElement, ctx: SlideContext): FigureModel {
  const m = ctx.metrics[0];
  if (!m || ctx.metrics.some((x) => !x)) return { denied: true };
  const last = latest(m, ctx.data);
  const note = e.note ? fillSlideWords(e.note, ctx) : { text: "", signal: null };
  return {
    denied: false,
    label: e.label ? fillSlideWords(e.label, ctx).text : m.name,
    value: last ? writeSlideValue(m, last.value, elementScale(m, ctx), ctx.data) : "–",
    note: note.text,
    noteTone: e.signal ? note.signal ?? "muted" : "muted",
    strong: Boolean(e.strong),
  };
}

/** One column: its period, the whole value, the part filled darker, and its words. */
export type Column = { period: string; label: string; total: number | null; part: number | null; text: string };
/** What a column chart shows. */
export type ColumnsModel =
  | { denied: true }
  | { denied: false; title: string; legend: { label: string; tone: SlideTone }[]; columns: Column[]; reference: { value: number; label: string } | null; description: string };

/** The periods a column chart shows: a set number up to the latest, else the weeks of the latest week's quarter so far,
 * else the last twelve. */
function columnPeriods(m: Metric, data: CanvasData, periods: number | undefined): { period: string; label: string }[] {
  const last = latest(m, data);
  if (!last) return [];
  const quarter = !periods && m.period === "week" ? quarterWeeks(last.period, m.period, data.yearStart) : null;
  const n = periods ?? quarter?.week ?? 12;
  return Array.from({ length: n }, (_, k) => {
    const period = shiftPeriod(last.period, m.period, k - n + 1);
    return { period, label: quarter ? `Week ${k + 1}` : m.period === "week" ? periodLabel(period, m.period, data.yearStart).replace(/^Week of (\d+ \w+).*$/, "$1") : periodLabel(period, m.period, data.yearStart, true) };
  });
}

/** A column chart's columns, reference line and words. */
export function columnsModel(e: ColumnsElement, ctx: SlideContext): ColumnsModel {
  const { data } = ctx;
  const total = ctx.metrics[0];
  const partOf = e.part ? ctx.metrics[1] : undefined;
  const refOf = e.reference ? ctx.metrics[e.part ? 2 : 1] : undefined;
  if (!total || (e.part && !partOf) || (e.reference && !refOf)) return { denied: true };
  const scale = elementScale(total, ctx);
  const columns = columnPeriods(total, data, e.periods).map(({ period, label }): Column => {
    const v = valueAt(total, data, period);
    return { period, label, total: v, part: partOf ? valueAt(partOf, data, period) : null, text: v === null ? "" : writeSlideValue(total, v, scale, data, { bare: true }) };
  });
  const last = latest(total, data);
  const ref = refOf && last ? upTo(refOf, data, last.period) : undefined;
  const say = (t: string) => fillSlideWords(t, ctx).text;
  const title = say(e.title ?? (scaleUnit(total, scale) ? "{metric}, {scale}" : "{metric}"));
  const legend: { label: string; tone: SlideTone }[] = partOf ? [{ label: say(e.partLabel ?? partOf.name), tone: "accent" }, { label: say(e.restLabel ?? total.name), tone: "soft" }] : [];
  const reference = refOf && ref ? { value: ref.value, label: say(e.referenceLabel ?? refOf.name) } : null;
  const description = [
    `${title}: ${columns.map((c) => `${c.label} ${c.total === null ? "no value" : c.text}${partOf && c.part !== null ? ` (${partOf.name} ${writeSlideValue(partOf, c.part, scale, data, { bare: true })})` : ""}`).join(", ") || "no values yet"}`,
    reference ? `${reference.label} ${writeSlideValue(refOf!, reference.value, scale, data)}` : "",
  ].filter(Boolean).join(". ");
  return { denied: false, title, legend, columns, reference, description };
}

/** One row of a gap table; `gap` is null when the second Metric has no row of this name. */
export type GapRow = { label: string; goal: string; actual: string; gap: number | null; gapText: string };
/** What a gap table shows; `empty` says why it has no rows. */
export type GapModel = { denied: true } | { denied: false; head: { row: string; goal: string; actual: string; gap: string }; rows: GapRow[]; empty: string | null };

/** The most rows a gap table holds; more are named as left out. */
export const GAP_ROWS = 30;

/** Two Metrics' latest Breakdowns side by side, the largest surplus first. The first Metric is the actual one. */
export function gapModel(e: GapTableElement, ctx: SlideContext): GapModel {
  const { data } = ctx;
  const [actual, goal] = ctx.metrics;
  if (!actual || !goal) return { denied: true };
  const byPeriod = data.breakdowns[actual.id] ?? {};
  const period = Object.keys(byPeriod).filter((p) => (byPeriod[p]?.length ?? 0) > 0).sort().at(-1);
  // The rows' scale follows the totals, so a person's quota is written like the team's.
  const scale = elementScale(actual, ctx);
  const head = {
    row: e.rowLabel ? fillSlideWords(e.rowLabel, ctx).text : "Name",
    goal: goal.name,
    actual: actual.name,
    gap: fillSlideWords(e.gapLabel ?? `${actual.name} minus ${inSentence(goal.name)}${scaleUnit(actual, scale) ? ", {scale}" : ""}`, ctx).text,
  };
  const none = (empty: string): GapModel => ({ denied: false, head, rows: [], empty });
  if (!period) return none(`No Breakdown of ${actual.name} yet. Send it with a line for each ${inSentence(head.row)}.`);
  // The rows at the top of each Breakdown; parts under a row stay with it.
  const goals = new Map((data.breakdowns[goal.id]?.[period] ?? []).map((r) => [r.label, r.value]));
  if (!goals.size) return none(`No Breakdown of ${goal.name} for ${periodLabel(period, actual.period, data.yearStart)}. Send it with the same lines.`);
  const rows = byPeriod[period]!.map((r): GapRow => {
    const g = goals.get(r.label);
    const gap = g === undefined ? null : r.value - g;
    return { label: r.label, goal: writeSlideValue(goal, g, scale, data), actual: writeSlideValue(actual, r.value, scale, data), gap, gapText: gap === null ? "–" : writeSlideValue(actual, gap, scale, data, { bare: true, change: true }) };
  });
  rows.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity) || a.label.localeCompare(b.label));
  return { denied: false, head, rows, empty: null };
}

/** One row of a metric table. */
export type MetricRow = { name: string; latest: string; previous: string; change: string; changeSignal: "good" | "bad" | null; trend: (number | null)[]; status: "on" | "off" | null };
/** What a metric table shows. */
export type MetricTableModel = { head: { metric: string; latest: string; previous: string; change: string; trend: string; status: string }; rows: MetricRow[] };

const SPAN_WORD: Record<Period, string> = { day: "day", week: "week", month: "month", quarter: "quarter", year: "year" };

/** One row per Metric the viewer may see; one they may not is left out whole, name and all. */
export function metricTableModel(e: MetricTableElement, ctx: SlideContext): MetricTableModel {
  const { data } = ctx;
  const seen = ctx.metrics.filter((m): m is Metric => !!m);
  const periods = e.periods ?? 8;
  const spans = new Set(seen.map((m) => m.period));
  const word = spans.size === 1 ? SPAN_WORD[seen[0].period] : "period";
  const today = word === "day";
  const rows = seen.map((m): MetricRow => {
    const last = latest(m, data);
    const trend = last ? Array.from({ length: periods }, (_, k) => valueAt(m, data, shiftPeriod(last.period, m.period, k - periods + 1))) : [];
    const before = last ? valueAt(m, data, shiftPeriod(last.period, m.period, -1)) : null;
    // Each row is written in its own scale: the rows of a table are different things.
    const scale = scaleOf(Math.abs(last?.value ?? 0));
    const t = last ? targetFor(m, last.period, data.targets[m.id]) : null;
    const has = t && (t.min !== null || t.max !== null);
    const off = last && has ? (t.min !== null && last.value < Number(t.min)) || (t.max !== null && last.value > Number(t.max)) : false;
    return {
      name: m.name,
      latest: last ? writeSlideValue(m, last.value, scale, data) : "–",
      previous: writeSlideValue(m, before, scale, data),
      change: last && before !== null ? writeSlideValue(m, last.value - before, scale, data, { change: true }) : "–",
      changeSignal: last && before !== null ? signalOf(m, last.value - before) : null,
      trend,
      status: has ? (off ? "off" : "on") : null,
    };
  });
  return {
    head: { metric: "Metric", latest: today ? "Today" : `This ${word}`, previous: today ? "The day before" : `Last ${word}`, change: "Change", trend: `${periods} ${word}s`, status: "Target" },
    rows,
  };
}
