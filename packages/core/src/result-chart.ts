// The chart of an analysis result (GLOSSARY: Takeaway, Method, Analysis Canvas; spec 0041; ticket #1076): the picture that stands above a
// Takeaway's words. A chart is only a reshaping of numbers the Method already worked out for its answer: it adds no calculation (the
// Method fills it from the very variables its sentence is written from), so the words and the picture can never disagree. It carries
// the periods and numbers of the result, and the names and units of the Metrics the result is about, and nothing else: no id, no
// Metric the person may not see. One renderer draws it in the browser (apps/web/src/views/result-chart.tsx). Pure.
import { periodsBetween, shiftPeriod, type Span } from "./periods";
import type { MetricDescription, Point } from "./types";

/** A Metric's name and how its numbers are written, for the axes and the labels of a chart. */
export type ChartUnit = Pick<MetricDescription, "name" | "unit" | "unit_position" | "decimals">;

/** What a line shows of its Metric, so that the screen can say so in words (the chart carries no wording of its own). */
export type LineRole = "values" | "change" | "fitted" | "fitted-change" | "trend-before" | "trend-since";

/** One line over the periods of a chart: its values in step with `periods` (null where the period has no value: a gap, never a zero). */
export type ChartLine = {
  /** The Metric's name. */
  name: string;
  unit: ChartUnit;
  role: LineRole;
  values: (number | null)[];
  /** Which axis the line is read on: two Metrics in different units each keep their own. */
  scale: "left" | "right";
  /** Drawn dashed: what a Method expects (a fit, a trend), against what was. */
  dashed?: boolean;
};

/** What a level or a band stands for. */
export type LevelKind = "trend-pointed" | "actual" | "median" | "asked" | "goal" | "usual";
/** A level held over some periods, drawn as a flat stretch from one period to another (one period: a dot). */
export type ChartLevel = { kind: LevelKind; value: number; from: string; to: string };
/** A band held over some periods (a usual range): drawn behind the line. */
export type ChartBand = { kind: "usual"; lo: number; hi: number; from: string; to: string };
/** A period that is marked with a vertical rule: the change a Method found, or the day a look at before and after starts from. */
export type ChartMark = { period: string; kind: "change" | "date"; /** The day, for a date. */ day?: string };

/** What the lines of a chart are about, for the screen's title. */
export type LinesAbout = "pair" | "pair-changes" | "fit" | "fit-changes" | "change" | "before-after" | "usual";

/** Values over time: lines (each on its own scale), levels, a band and marks. */
export type LinesChart = {
  kind: "lines";
  about: LinesAbout;
  span: Span;
  periods: string[];
  lines: ChartLine[];
  /** Flat stretches and the band are read on the left axis. */
  levels?: ChartLevel[];
  band?: ChartBand;
  marks?: ChartMark[];
};

/** A forecast: what was, what is expected with the range the Takeaway writes, and the Target the Metric is asked to reach. */
export type ForecastChart = {
  kind: "forecast";
  span: Span;
  unit: ChartUnit;
  history: { period: string; value: number }[];
  /** `lo` and `hi` are the range the Takeaway states (80 %), for each period ahead. */
  ahead: { period: string; value: number; lo: number; hi: number }[];
  /** The ends of the Target Range the Metric is asked to reach, where the question is about it. */
  target: { min: number | null; max: number | null } | null;
  /** The period the Takeaway's sentence is about. */
  asked: string;
};

/** Two Metrics against each other, one point for each period they have in common. */
export type ScatterChart = { kind: "scatter"; span: Span; x: ChartUnit; y: ChartUnit; changes: boolean; pairs: { period: string; x: number; y: number }[] };

/** What a bar is, besides its label: the one the words are about, or a kind the screen says in its words. */
export type BarTag = "best" | "top" | "appeared" | "gone" | "total" | "unexplained";
/** One bar: a label, a value, and where it has one the range it is likely between. `note` is a word the Takeaway wrote (a strength); a bar is never told apart by its colour alone. */
export type ChartBar = { label: string; value: number; tag?: BarTag; note?: string | null };

/** What the values of bars are: a correlation from -1 to 1, a delay's correlation, a share of a whole (in percent), a change in a Metric's unit, or a driver's share of what moved the Metric. */
export type BarsMeasure = "delay" | "share" | "importance" | "change" | "rows";

/** Bars, with an optional line across them (a running total) on the same scale. */
export type BarsChart = {
  kind: "bars";
  measure: BarsMeasure;
  /** The unit of the values, where they are in a Metric's unit ("change"); others are a correlation or percent. */
  unit?: ChartUnit;
  /** The Metrics the bars are about, for the title ("A comes before B"). */
  about: string[];
  /** The span of a delay. */
  span?: Span;
  bars: ChartBar[];
  /** A line over the bars, one number for each bar, on the same scale (the running share of a Pareto). */
  line?: number[];
};

/** What a what-if reaches: each Metric's own change in its own unit, with the range where it has one (rows are not on one scale). */
export type EffectsChart = { kind: "effects"; rows: { label: string; unit: ChartUnit; effect: number | null; lo: number | null; hi: number | null; note: string | null }[] };

/** A grid of strengths: every pair of the Metrics, with the number and the word. A cell is never told apart by its colour alone. */
export type GridChart = {
  kind: "grid";
  labels: string[];
  cells: { row: number; col: number; r: number | null; word: string | null }[];
};

/** One picture of a result. */
export type ChartPart = LinesChart | ForecastChart | ScatterChart | BarsChart | EffectsChart | GridChart;
/** The pictures of a result, top to bottom. */
export type ResultChart = ChartPart[];

/** The most periods a chart draws as they are; above this a line is thinned for drawing (see `thinned`). The Methods read at most 120 periods, so only a long daily correlation reaches it. */
export const MOST_DRAWN = 200;
/** The most periods a regular grid is filled across before the periods the series have are used as they are. */
const MOST_GRID = 5000;

/** The periods from the first to the last of the series, every one of them, oldest first: a period without a value is a gap on the line. */
function gridOf(span: Span, series: readonly (readonly Point[])[]): string[] {
  const all = [...new Set(series.flatMap((s) => s.map((p) => p.period)))].sort();
  if (all.length === 0) return [];
  const [first, last] = [all[0], all[all.length - 1]];
  if (periodsBetween(first, last, span) > MOST_GRID) return all;
  const out: string[] = [];
  for (let p = first, i = 0; p <= last && i <= MOST_GRID; p = shiftPeriod(p, span, 1), i++) out.push(p);
  return out;
}

/**
 * The indices of a set of lines to draw when there are more than `limit` of them, so that nothing a person would look at is lost: the
 * first and the last, every index in `keep`, the lowest and the highest value of every line within each stretch of equal length, and the first
 * period of every gap (so a gap is still a gap). Every value drawn is the value the result holds at that period; none is averaged or made up.
 * With `limit` or fewer periods every index is kept. For 156 weekly periods and the limit of 200 nothing is left out.
 */
export function thinned(values: readonly (readonly (number | null)[])[], limit: number, keep: readonly number[] = []): number[] {
  const n = values[0]?.length ?? 0;
  if (n <= limit) return Array.from({ length: n }, (_, i) => i);
  const kept = new Set<number>([0, n - 1, ...keep]);
  // Each stretch keeps 2 indices for each line; the stretches are as many as the limit allows for.
  const stretches = Math.max(1, Math.floor(limit / (2 * Math.max(1, values.length))));
  const size = Math.ceil(n / stretches);
  for (const line of values) {
    for (let from = 0; from < n; from += size) {
      let [lo, hi] = [-1, -1];
      for (let i = from; i < Math.min(n, from + size); i++) {
        const v = line[i];
        if (v === null) {
          if (i === 0 || line[i - 1] !== null) kept.add(i);
          continue;
        }
        if (lo < 0 || v < line[lo]!) lo = i;
        if (hi < 0 || v > line[hi]!) hi = i;
      }
      if (lo >= 0) { kept.add(lo); kept.add(hi); }
    }
  }
  return [...kept].sort((a, b) => a - b);
}

/** What `linesChart` is given: each line's points are put on the periods the lines share (a missing period is a gap). */
export type LinesInput = {
  about: LinesAbout;
  span: Span;
  series: { name: string; unit: ChartUnit; role: LineRole; points: readonly Point[]; scale?: "left" | "right"; dashed?: boolean }[];
  levels?: ChartLevel[];
  band?: ChartBand;
  marks?: ChartMark[];
};

/** Values over time from the points a Method worked on: the lines share one run of periods, a period a line has no value for is a gap, and a very long run is thinned by `thinned`. */
export function linesChart(input: LinesInput): LinesChart {
  const periods = gridOf(input.span, input.series.map((s) => s.points));
  const at = (p: readonly Point[]) => new Map(p.map((x) => [x.period, x.value]));
  const maps = input.series.map((s) => at(s.points));
  const full = input.series.map((s, i) => periods.map((p) => maps[i].get(p) ?? null));
  // The periods a mark, a level or the band start or end at stay, so what they point at is drawn.
  const named = new Set([...(input.marks ?? []).map((m) => m.period), ...(input.levels ?? []).flatMap((l) => [l.from, l.to]), ...(input.band ? [input.band.from, input.band.to] : [])]);
  const keep = periods.flatMap((p, i) => (named.has(p) ? [i] : []));
  const idx = thinned(full, MOST_DRAWN, keep);
  return {
    kind: "lines",
    about: input.about,
    span: input.span,
    periods: idx.map((i) => periods[i]),
    lines: input.series.map((s, k) => ({ name: s.name, unit: s.unit, role: s.role, values: idx.map((i) => full[k][i]), scale: s.scale ?? "left", ...(s.dashed ? { dashed: true } : {}) })),
    ...(input.levels ? { levels: input.levels } : {}),
    ...(input.band ? { band: input.band } : {}),
    ...(input.marks ? { marks: input.marks } : {}),
  };
}
