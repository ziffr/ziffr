// A Metric's figures as the summary, chart and table slides write them (spec 0069; GLOSSARY: Metric, Period, Target):
// its latest value, the one before, the change, whether it is on target, its values over the last periods and the chart
// of them. Visibility: it reads the data it is given, which `listedData` has cut to the slide's Metrics. Pure.
import { writeNumber } from "@ziffr/figures";
import { summary, targetFor } from "../../compare";
import { latestOfEach, resolverFrom } from "../../display-periods";
import { compactValue } from "../../format";
import { shiftPeriod, periodLabel } from "../../periods";
import type { CanvasData, Metric } from "../../types";
import { chartTitle, drawChart, type ChartSeries, type ChartSpec } from "../chart";
import type { Box, Obj } from "../objects";
import type { Region, SlideSource } from "../slide-type";
import { nameOf, unitWords } from "./listed";

/** How many periods a slide shows where its description does not say. */
const PERIODS = 8;

/** The periods a slide's description asks for, kept within what the format allows. */
export function periodCount(slide: SlideSource): number {
  const asked = slide.options.periods;
  return typeof asked === "number" && Number.isInteger(asked) ? Math.min(53, Math.max(2, asked)) : PERIODS;
}

/** A figure with its unit, shortened where it is large. */
const written = (metric: Metric, data: CanvasData, value: number) => compactValue(metric, value, data.numberStyle);

/** A change since the period before: in percent, in points for a share in percent, else as a difference. */
function changeText(metric: Metric, data: CanvasData, abs: number, pct: number | null | undefined): string {
  if (metric.unit === "%") return writeNumber(abs, metric.decimals, data.numberStyle, { unit: "pts", side: "after", change: true });
  if (typeof pct === "number") return writeNumber(pct, 1, data.numberStyle, { unit: "%", side: "after", change: true });
  return writeNumber(abs, metric.decimals, data.numberStyle, { unit: metric.unit, side: metric.unit_position, change: true });
}

/** A Metric's newest figures, written. A dash stands where there is none. */
export type Figure = {
  name: string;
  unit: string;
  /** The newest period in words; empty without a value. */
  period: string;
  latest: string;
  before: string;
  change: string;
  /** The change with the period it is measured from, as a sentence's end. */
  since: string;
  /** Whether the newest value is on target; null without a target or a value. */
  onTarget: boolean | null;
};

/** The newest figures of a Metric, from the same working as its widgets. */
export function figureOf(metric: Metric, data: CanvasData): Figure {
  const found = summary(metric, resolverFrom(data.metrics, data.series, data), data.targets[metric.id], {
    keys: ["prev"],
    yearStart: data.yearStart,
    attainmentMethod: data.attainmentMethod,
  });
  const prev = found.comparisons.find((c) => c.key === "prev" && c.available);
  const change = prev?.abs === undefined ? "–" : changeText(metric, data, prev.abs, prev.pct);
  const previous = found.period ? shiftPeriod(found.period, metric.period, -1) : null;
  return {
    name: nameOf(metric),
    unit: unitWords(metric.unit),
    period: found.period ? periodLabel(found.period, metric.period, data.yearStart) : "",
    latest: found.value === undefined ? "–" : written(metric, data, found.value),
    before: prev?.previous === undefined ? "–" : written(metric, data, prev.previous),
    change,
    since: prev?.abs === undefined || !previous ? "Nothing to compare with yet" : `${change} since ${periodLabel(previous, metric.period, data.yearStart)}`,
    onTarget: found.value === undefined ? null : found.onTarget,
  };
}

/** Whether a value is on target, in words with a mark every font has. */
export const onTargetWords = (onTarget: boolean | null) => (onTarget === null ? "No target" : onTarget ? "• On target" : "× Off target");

/** A Metric's values over the periods up to its newest one, null where a period has none. */
export type History = { periods: string[]; values: (number | null)[] };

/** The last `count` periods up to `end` (the Metric's newest period with a value, unless said), starting at the first
 * of them that has a value. Empty where none has. */
export function historyOf(metric: Metric, data: CanvasData, count: number, end?: string): History {
  const points = latestOfEach(data.series[metric.slug] ?? []).filter((p) => Number.isFinite(p.value));
  const last = end ?? points.at(-1)?.period;
  if (!last) return { periods: [], values: [] };
  const known = new Map(points.map((p) => [p.period, p.value]));
  const periods = Array.from({ length: count }, (_, i) => shiftPeriod(last, metric.period, i + 1 - count));
  const first = periods.findIndex((p) => known.has(p));
  const shown = first < 0 ? [] : periods.slice(first);
  return { periods: shown, values: shown.map((p) => known.get(p) ?? null) };
}

/** How a chart of a slide draws its Metric. */
export type ChartOptions = {
  count: number;
  line: boolean;
  target: boolean;
  /** A Metric whose values fill part of each column. */
  part?: Metric;
  /** A Metric drawn as a line to read the values against. */
  reference?: Metric;
};

/** One chart of a slide: its title, and what is drawn; null where the Metric has no value to draw. */
export type Trend = { title: string; unit: string; spec: ChartSpec | null; empty: string };

/** The chart of a Metric over its last periods, the newest standing out. */
export function trendOf(metric: Metric, data: CanvasData, options: ChartOptions): Trend {
  const name = nameOf(metric);
  const { periods, values } = historyOf(metric, data, options.count);
  const title = { title: name, unit: unitWords(metric.unit), empty: `No value of ${name} to chart yet.` };
  if (!periods.length) return { ...title, spec: null };
  const bare = (v: number | null) => (v === null ? null : compactValue({ ...metric, unit: "" }, v, data.numberStyle));
  const series: ChartSeries[] = [
    options.line
      ? { name, values, color: "accent", words: values.map(bare) }
      : { name, values, color: "neutral", pointColors: values.map((_, i) => (i === values.length - 1 ? "accent" : "neutral")), words: values.map(bare) },
  ];
  /** Another Metric over the same periods, named at its end with its newest value. */
  const other = (m: Metric, look: Omit<ChartSeries, "name" | "values" | "endLabel">): ChartSeries => {
    const theirs = historyOf(m, data, periods.length, periods.at(-1));
    const known = new Map(theirs.periods.map((p, i) => [p, theirs.values[i]!]));
    const list = periods.map((p) => known.get(p) ?? null);
    const newest = list.at(-1);
    const label = newest === null || newest === undefined ? `${nameOf(m)}, no value yet` : `${nameOf(m)} ${bare(newest)}`;
    return { name: nameOf(m), values: list, endLabel: label, ...look };
  };
  if (options.part) series.push(other(options.part, { color: "accent", pointColors: values.map(() => "accent") }));
  if (options.reference) series.push(other(options.reference, { color: "ink", as: "line", dash: true }));
  if (options.part) series[0] = { ...series[0]!, color: "neutral2", pointColors: undefined };
  if (options.target) {
    const aims = periods.map((p) => {
      const t = targetFor(metric, p, data.targets[metric.id]);
      const aim = t.value ?? t.min ?? t.max ?? null;
      return aim === null ? null : Number(aim);
    });
    if (aims.some((a) => a !== null)) {
      series.push(
        options.line
          ? { name: "Target", values: aims, color: "muted", dash: true, endLabel: "Target" }
          : { name: "Target", values: aims, color: "ink", as: "marks", endLabel: "Target" },
      );
    }
  }
  return {
    ...title,
    spec: {
      kind: options.line ? "line" : "columns",
      categories: periods.map((p) => periodLabel(p, metric.period, data.yearStart, true)),
      series,
      alt: `${name} over ${periods.length === 1 ? "one period" : `${periods.length} periods`}`,
    },
  };
}

/** A chart under its title in a box, or the sentence that there is nothing to chart. */
export function drawTrend(trend: Trend, box: Box, { pen, measure }: Region): Obj[] {
  const title = chartTitle(pen, measure, box, trend.title, trend.unit);
  const under = { x: box.x, y: box.y + 32, w: box.w, h: box.h - 32 };
  if (trend.spec) return [...title, drawChart(pen, measure, under, trend.spec).object];
  const words = measure.fit(trend.empty, under.w, { size: 16 }, 3);
  return [...title, pen.text({ ...under, h: 72 }, [words], { size: 16, color: "muted" })];
}
