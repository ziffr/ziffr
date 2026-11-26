// What a Slide Element shows (GLOSSARY: Slide Element, Placeholder; spec 0057): its words filled from the data and the
// figures of its figure, column chart and tables, worked out here so the screen and the exports say the same thing. Pure.
// Visibility: everything is worked out from the data this viewer was sent. A Metric they may not see is `null` in the
// element's list: its Placeholders become empty words, and nothing says its name, a value or a Breakdown row of it.
import { writeNumber } from "@ziffr/figures";
import { targetFor } from "./compare";
import { targetReader } from "./formula";
import { countedParts } from "./totals";
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
 * the unit and the scale's letter out; `change` writes the sign of a change; `between` says the number is what lies
 * between two values, which for a percentage is counted in points ("+4 pts"), never in percent. A value that is not 0
 * never reads 0: it is written in its own, smaller scale. */
export function writeSlideValue(m: Metric, v: number | null | undefined, scale: SlideScale, data: CanvasData, opts: { bare?: boolean; change?: boolean; between?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  let s = scale;
  // Two decimals of a million hide anything under 5,000.
  if (!opts.bare && v !== 0 && s.div > 1 && Math.abs(v) / s.div < (s.suffix === "M" ? 0.005 : 0.5)) s = scaleOf(v);
  const decimals = s.suffix === "M" ? 2 : s.suffix === "k" ? 0 : m.decimals;
  const n = v / s.div;
  if (opts.bare) return writeNumber(n, decimals, data.numberStyle, opts.change ? { change: true } : {});
  const unit = m.unit ?? "";
  if (unit === "%" && (opts.change || opts.between)) {
    const words = writeNumber(n, decimals, data.numberStyle, opts.change ? { change: true } : {});
    return `${words} ${words.replace(/^[+−±]/, "") === "1" ? "pt" : "pts"}`;
  }
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

/** The Placeholders a slide's words can hold, with up to two Slot numbers. */
export const SLIDE_PATTERN = /\{(metrics|metric|period|latest|change yoy|change prev|top row|target|calculation note|quarter weeks|quarter week|quarter|weeks left|change|scale|slide|difference|gap|left)(?:\s+(\d))?(?:\s+(\d))?\}/gi;

/** An element's words filled from the data, whether the first change or gap in them is good or bad news, and whether
 * anything in them had no value to show. A Placeholder of a Metric the viewer may not see is empty; one without a value
 * reads "–"; one that names a Slot the element does not have stays as written, so the author sees it. */
export function fillSlideWords(text: string, ctx: SlideContext): { text: string; signal: "good" | "bad" | null; missing: boolean } {
  let signal: "good" | "bad" | null = null;
  let missing = false;
  const note = (s: "good" | "bad" | null) => { signal ??= s; };
  const none = () => { missing = true; return "–"; };
  const hidden = () => { missing = true; return ""; };
  const { data } = ctx;
  const out = text.replace(SLIDE_PATTERN, (all, raw: string, a?: string, b?: string) => {
    const key = raw.toLowerCase();
    if (key === "slide") return ctx.slide === undefined ? all : String(ctx.slide);
    const i = (a ? Number(a) : 1) - 1;
    if (key === "metrics") return fillWidgetText(all, { metric_ids: ctx.metrics.map((m) => m?.id ?? -1), settings: {} }, data) ?? all;
    if (i < 0 || i >= ctx.metrics.length) return all;
    const m = ctx.metrics[i];
    if (!m) return hidden();
    const last = latest(m, data);
    if (key === "difference" || key === "gap" || key === "left") {
      const j = (b ? Number(b) : 2) - 1;
      if (j < 0 || j >= ctx.metrics.length) return all;
      const other = ctx.metrics[j];
      if (!other) return hidden();
      const v = last ? valueAt(other, data, last.period) : null;
      if (!last || v === null) return none();
      const d = last.value - v;
      // What is left of the first after the second never falls below nothing.
      // Nothing left reads "0 €", not "0.00 M€".
      if (key === "left" && d <= 0) return writeSlideValue(m, 0, scaleOf(0), data, { between: true });
      if (key !== "gap") return writeSlideValue(m, d, elementScale(m, ctx), data, { between: true });
      // A gap reads against the second Metric: at or above it is good, whatever the Metrics' own direction.
      note(d < 0 ? "bad" : "good");
      if (d === 0) return `on ${inSentence(other.name)}`;
      const size = writeSlideValue(m, Math.abs(d), elementScale(m, ctx), data, { between: true });
      return d < 0 ? `${size} short` : `${size} above ${inSentence(other.name)}`;
    }
    if (key === "metric") return m.name;
    if (key === "scale") return scaleUnit(m, elementScale(m, ctx));
    if (key === "latest") return last ? writeSlideValue(m, last.value, elementScale(m, ctx), data) : none();
    if (key === "change") {
      const before = last ? valueAt(m, data, shiftPeriod(last.period, m.period, -1)) : null;
      if (!last || before === null) return none();
      note(signalOf(m, last.value - before));
      return writeSlideValue(m, last.value - before, elementScale(m, ctx), data, { change: true });
    }
    if (key.startsWith("quarter") || key === "weeks left") {
      if (!last) return none();
      const q = quarterWeeks(last.period, m.period, data.yearStart);
      if (key === "quarter") return q.quarter;
      if (q.week === null || q.weeks === null) return none();
      return key === "quarter week" ? String(q.week) : key === "quarter weeks" ? String(q.weeks) : weeksLeft(Math.max(0, q.weeks - q.week));
    }
    // The Placeholders every text knows (period, change yoy, top row, target), for the Slot named; one they cannot fill
    // comes back as written.
    const filled = fillWidgetText(`{${key}}`, { metric_ids: [m.id], settings: {} }, data) ?? `{${key}}`;
    return filled === `{${key}}` ? none() : filled;
  });
  return { text: out, signal, missing };
}

/** What a Slide Element says, and its settings offer, while a Slot it needs has no Metric. */
export const PICK_METRIC = "Pick a Metric";

/** What a Slide Element says when it may not show a Metric it reads. */
export const NO_ACCESS = "No access to a Metric here. Ask its owner to share it.";

/** What a figure shows: its label, value and the line under them with its colour. */
export type FigureModel = { denied: true } | { denied: false; label: string; value: string; note: string; noteTone: "good" | "bad" | "muted"; strong: boolean };

/** A figure's words and value. The value is the first Metric's latest. */
export function figureModel(e: FigureElement, ctx: SlideContext): FigureModel {
  const m = ctx.metrics[0];
  if (!m || ctx.metrics.some((x) => !x)) return { denied: true };
  const last = latest(m, ctx.data);
  const filled = e.note ? fillSlideWords(e.note, ctx) : null;
  // A line that would speak of a missing value is left out.
  const note = filled && !filled.missing ? filled : { text: "", signal: null };
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
/** What a gap table shows; `empty` says why it has no rows, `more` how many rows are left out, and `note` that a
 * Total adds up Metrics the viewer is not shown. */
export type GapModel = { denied: true } | { denied: false; head: { row: string; goal: string; actual: string; gap: string }; rows: GapRow[]; empty: string | null; more: number; note: string | null };

/** The most rows a gap table holds; more are named as left out. */
export const GAP_ROWS = 30;

/** What a gap table of a Total says where it adds up Metrics the viewer is not shown. */
export const OTHERS_NOT_SHOWN = "Other Metrics of this Total are not shown to you.";

const bySurplus = (rows: GapRow[]) => rows.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity) || a.label.localeCompare(b.label));

/** Metrics' names as the rows of one list: where all begin alike up to a comma, as the Metrics of a Pack's lines do
 * (“Commit, Anna”), that beginning heads the column and each row keeps its own part. */
function rowNames(names: string[]): { head: string | null; labels: string[] } {
  const start = names[0]?.slice(0, names[0].lastIndexOf(", ") + 2) ?? "";
  return start.length > 2 && names.every((n) => n.startsWith(start) && n.length > start.length)
    ? { head: start.slice(0, -2), labels: names.map((n) => n.slice(start.length)) }
    : { head: null, labels: names };
}

/** One row for each Metric a Total adds up that the viewer sees, for the latest period one of them has a value in: its
 * target for that period, as target() gives it, its value and the gap. Nothing is added up from the rows. */
function totalGapModel(e: GapTableElement, ctx: SlideContext, total: Metric): GapModel {
  const { data } = ctx;
  const list = data.totalLists?.[total.id];
  const parts = (list?.parts ?? []).flatMap((p) => { const metric = data.metrics.find((m) => m.id === p.part); return metric ? [{ ...p, metric }] : []; });
  const valued = (period: string) => { const counted = new Set(countedParts(parts, period)); return parts.some((p) => counted.has(p.part) && valueAt(p.metric, data, period) !== null); };
  const period = [...new Set(parts.flatMap((p) => pointsOf(p.metric, data).map((x) => x.period)))].sort().filter(valued).at(-1);
  const counted = new Set(period ? countedParts(parts, period) : []);
  const figures = parts.filter((p) => counted.has(p.part)).map((p) => ({ metric: p.metric, value: valueAt(p.metric, data, period!), target: targetReader(p.metric, data.targets[p.metric.id] ?? [])(period!) ?? null }));
  // Written like the Total's own figures where the viewer has them.
  const scale = scaleOf(Math.max(0, Math.abs(latest(total, data)?.value ?? 0), ...figures.flatMap((f) => [Math.abs(f.value ?? 0), Math.abs(f.target ?? 0)])));
  const names = rowNames(figures.map((f) => f.metric.name));
  const actual = names.head ?? total.name;
  // The scale is that of the rows, also where the Total's own values are not shown.
  const gapLabel = e.gapLabel?.replace(/\{scale\}/gi, scaleUnit(total, scale));
  const head = {
    row: e.rowLabel ? fillSlideWords(e.rowLabel, ctx).text : "Name",
    goal: "Target",
    actual,
    gap: gapLabel ? fillSlideWords(gapLabel, ctx).text : `${actual} minus target${scaleUnit(total, scale) ? `, ${scaleUnit(total, scale)}` : ""}`,
  };
  const rows = bySurplus(figures.map((f, i): GapRow => {
    const gap = f.value === null || f.target === null ? null : f.value - f.target;
    return { label: names.labels[i], goal: writeSlideValue(f.metric, f.target, scale, data), actual: writeSlideValue(f.metric, f.value, scale, data), gap, gapText: gap === null ? "–" : writeSlideValue(f.metric, gap, scale, data, { bare: true, change: true }) };
  }));
  const withheld = period ? list?.others.includes(period) : list?.hidden;
  // Where the viewer is shown none of its Metrics, the note says all there is to say.
  const empty = rows.length || (!parts.length && list?.hidden) ? null : "No value to show yet.";
  return { denied: false, head, rows: rows.slice(0, GAP_ROWS), more: Math.max(0, rows.length - GAP_ROWS), empty, note: withheld ? OTHERS_NOT_SHOWN : null };
}

/** Two Metrics' latest Breakdowns side by side, the largest surplus first. The first Metric is the actual one. A gap
 * table of a Total shows a row for each Metric it adds up instead. */
export function gapModel(e: GapTableElement, ctx: SlideContext): GapModel {
  const { data } = ctx;
  const [actual, goal] = ctx.metrics;
  if (e.total) {
    if (!actual) return { denied: true };
    if (actual.total) return totalGapModel(e, ctx, actual);
    return { denied: false, head: { row: "", goal: "", actual: "", gap: "" }, rows: [], more: 0, note: null, empty: `${actual.name} is not a Total. Pick a Total for this table.` };
  }
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
  const none = (empty: string): GapModel => ({ denied: false, head, rows: [], empty, more: 0, note: null });
  if (!period) return none(`No Breakdown of ${actual.name} yet. Send it with a line for each ${inSentence(head.row)}.`);
  // The rows at the top of each Breakdown; parts under a row stay with it.
  const goals = new Map((data.breakdowns[goal.id]?.[period] ?? []).map((r) => [r.label, r.value]));
  if (!goals.size) return none(`No Breakdown of ${goal.name} for ${periodLabel(period, actual.period, data.yearStart)}. Send it with the same lines.`);
  const rows = byPeriod[period]!.map((r): GapRow => {
    const g = goals.get(r.label);
    const gap = g === undefined ? null : r.value - g;
    return { label: r.label, goal: writeSlideValue(goal, g, scale, data), actual: writeSlideValue(actual, r.value, scale, data), gap, gapText: gap === null ? "–" : writeSlideValue(actual, gap, scale, data, { bare: true, change: true }) };
  });
  return { denied: false, head, rows: bySurplus(rows), empty: null, more: 0, note: null };
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

/** One Metric of a Definitions element: what it is and how it is calculated, each empty where nothing is written. */
export type DefinitionRow = { name: string; description: string; note: string };

/** One entry per Metric the viewer may see, in Slot order; one they may not is left out whole. What goes out with a View
 * Link or a Snapshot carries neither text (view-links.ts), so only the names stand there. */
export function definitionsModel(ctx: Pick<SlideContext, "metrics">): { rows: DefinitionRow[] } {
  return { rows: ctx.metrics.flatMap((m) => (m ? [{ name: m.name, description: (m.description ?? "").trim(), note: m.calculation_note ?? "" }] : [])) };
}

/** The letter sizes a Definitions element tries, largest first, in slide pixels. */
const DEFINITION_SIZES = [17, 16, 15, 14, 13, 12, 11, 10] as const;
/** The space between two columns and between two entries, in slide pixels. */
export const DEFINITION_GAPS = { column: 40, row: 14 } as const;

/** How a Definitions element fits its box: its letter size, its entries by column, and how many do not fit. */
export type DefinitionsLayout = { size: number; columns: DefinitionRow[][]; more: number };

// About how tall an entry stands: a letter is about 0.53 of its size wide, a line 1.35 of its size high, and a line the
// writer broke starts a new one.
function entryHeight(r: DefinitionRow, size: number, width: number): number {
  const lines = (text: string, letter: number) => (text ? text.split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / Math.floor(width / (letter * 0.53)))), 0) : 0);
  return (lines(r.name, size + 1) * (size + 1) + (lines(r.description, size) + lines(r.note, size)) * size) * 1.35;
}

/** The largest letters at which every entry fits the box, in one column or two (two from four entries on a wide box),
 * entries kept whole and in order. Where even the smallest do not hold them all, those that fit are shown and the rest
 * counted, never cut in the middle; the first is always shown. */
export function definitionsLayout(rows: readonly DefinitionRow[], w: number, h: number): DefinitionsLayout {
  const count = rows.length > 3 && w >= 700 ? 2 : 1;
  const width = Math.max(80, (w - (count - 1) * DEFINITION_GAPS.column) / count);
  const fill = (size: number, room: number) => {
    const columns: DefinitionRow[][] = [[]];
    let used = 0;
    let placed = 0;
    for (const r of rows) {
      const tall = entryHeight(r, size, width);
      const column = columns.at(-1)!;
      if (column.length && used + DEFINITION_GAPS.row + tall > room) {
        if (columns.length === count) break;
        columns.push([r]);
        used = tall;
      } else {
        used += (column.length ? DEFINITION_GAPS.row : 0) + tall;
        column.push(r);
      }
      placed += 1;
    }
    return { size, columns, more: rows.length - placed };
  };
  for (const size of DEFINITION_SIZES) {
    const tried = fill(size, h);
    if (!tried.more) return tried;
  }
  // The line that counts the rest takes room of its own.
  return fill(DEFINITION_SIZES.at(-1)!, h - 24);
}
