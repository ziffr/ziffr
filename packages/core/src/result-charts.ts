// The pictures of the analysis results (GLOSSARY: Takeaway, Method, Analysis Canvas; spec 0041; ticket #1076), one builder for each kind of
// result. Each takes the numbers a Method already holds for its answer (the series it worked on, the fit it made, the delays it tried, the
// range it states) and only reshapes them into the parts of result-chart.ts: no number is worked out here beyond placing a line's own
// level and slope on its periods, so a picture can never say what the words do not. The Methods call these where the context asked for a
// chart (`ctx.charts`). Pure.
import type { Basis } from "./basis";
import type { Pair } from "./correlation";
import type { ValueUnit } from "./format";
import { withTakeawayBand } from "./methods/forecast-choice";
import type { SeasonalPoint } from "./methods/holt-winters";
import type { TargetEnds } from "./methods/reach-chance";
import { periodsBetween, type Span } from "./periods";
import { linesChart, type BarsChart, type ChartPart, type ChartUnit, type ForecastChart, type ResultChart } from "./result-chart";
import type { Point } from "./types";

/** A Metric's name and its way of writing numbers, as a chart carries them. */
export const chartUnit = (name: string, u: ValueUnit): ChartUnit => ({ name, unit: u.unit, unit_position: u.unit_position, decimals: u.decimals });

/** The values two series have on each of `periods` (each period is in both), as pairs. */
export function pairsOn(periods: readonly string[], x: readonly Point[], y: readonly Point[]): Pair[] {
  const [xs, ys] = [new Map(x.map((p) => [p.period, p.value])), new Map(y.map((p) => [p.period, p.value]))];
  return periods.map((period) => ({ period, x: xs.get(period)!, y: ys.get(period)! }));
}

/** The forecast of a Metric: the periods it was worked from, the expected values with the range the Takeaway writes (the very `withTakeawayBand` of the widget and the Metric page), and the Target ends where asked. */
export function forecastChart(o: { name: string; unit: ValueUnit; span: Span; rows: readonly Point[]; ahead: readonly SeasonalPoint[]; ends?: TargetEnds; asked: string }): ForecastChart {
  return {
    kind: "forecast",
    span: o.span,
    unit: chartUnit(o.name, o.unit),
    history: o.rows.map((p) => ({ period: p.period, value: p.value })),
    ahead: withTakeawayBand(o.ahead).map((p) => ({ period: p.period, value: p.value, lo: p.lo, hi: p.hi })),
    target: o.ends ? { min: o.ends.min, max: o.ends.max } : null,
    asked: o.asked,
  };
}

/** Two Metrics over time, each on its own axis, and (where `scatter`) against each other; the pairs are the ones the Method compared, on the basis it compared them on. */
export function pairCharts(a: ChartUnit, b: ChartUnit, span: Span, pairs: readonly Pair[], basis: Basis, scatter = true): ResultChart {
  const changes = basis === "changes";
  const role = changes ? "change" : "values";
  const lines = linesChart({
    about: changes ? "pair-changes" : "pair",
    span,
    series: [
      { name: a.name, unit: a, role, points: pairs.map((p) => ({ period: p.period, value: p.x })), scale: "left" },
      { name: b.name, unit: b, role, points: pairs.map((p) => ({ period: p.period, value: p.y })), scale: "right" },
    ],
  });
  return scatter ? [lines, { kind: "scatter", span, x: a, y: b, changes, pairs: pairs.map((p) => ({ period: p.period, x: p.x, y: p.y })) }] : [lines];
}

/** A correlation for each delay tried (a delay with no number is left out), the best one marked. */
export function lagChart(a: string, b: string, span: Span, lags: readonly { lag: number; r: number }[], best: number): ChartPart {
  return {
    kind: "bars",
    measure: "delay",
    about: [a, b],
    span,
    bars: lags.filter((l) => Number.isFinite(l.r)).map((l) => ({ label: String(l.lag), value: l.r, ...(l.lag === best ? { tag: "best" as const } : {}) })),
  };
}

/** The target as it was and as the fit expects it, over the periods the fit used (on the basis it was made on). */
export function fitLines(name: string, unit: ValueUnit, span: Span, basis: Basis, rows: readonly { period: string; y: number }[], fitted: readonly number[], goal?: number): ChartPart {
  const changes = basis === "changes";
  const u = chartUnit(name, unit);
  const first = rows[0].period;
  const last = rows[rows.length - 1].period;
  return linesChart({
    about: changes ? "fit-changes" : "fit",
    span,
    series: [
      { name, unit: u, role: changes ? "change" : "values", points: rows.map((r) => ({ period: r.period, value: r.y })) },
      { name, unit: u, role: changes ? "fitted-change" : "fitted", points: rows.map((r, i) => ({ period: r.period, value: fitted[i] })), dashed: true },
    ],
    // A goal is a level of the Metric, so it is drawn only where the fit is on levels.
    ...(goal !== undefined && !changes ? { levels: [{ kind: "goal" as const, value: goal, from: first, to: last }] } : {}),
  });
}

/** Drivers as bars of their share of what moved the Metric, in the order the words name them; `notes` are the strength words the Takeaway wrote. */
export function importanceBars(target: string, drivers: readonly { name: string; share: number }[], notes: readonly string[]): BarsChart {
  return { kind: "bars", measure: "importance", about: [target], bars: drivers.map((d, i) => ({ label: d.name, value: d.share * 100, note: notes[i] })) };
}

/** The series a change point was found in, the two lines it fitted (each from its level at the change date, with its slope per period) and the change date. Without a change found, the series alone. */
export function changeChart(name: string, unit: ValueUnit, span: Span, rows: readonly Point[], found: { index: number; levelBefore: number; levelAfter: number; before: number; after: number } | null): ChartPart {
  const u = chartUnit(name, unit);
  const series = [{ name, unit: u, role: "values" as const, points: rows }];
  if (!found) return linesChart({ about: "change", span, series });
  const at = rows[found.index].period;
  const line = (level: number, slope: number, part: readonly Point[]) => part.map((p) => ({ period: p.period, value: level + slope * periodsBetween(at, p.period, span) }));
  return linesChart({
    about: "change",
    span,
    series: [
      ...series,
      { name, unit: u, role: "trend-before", points: line(found.levelBefore, found.before, rows.slice(0, found.index)), dashed: true },
      { name, unit: u, role: "trend-since", points: line(found.levelAfter, found.after, rows.slice(found.index)), dashed: true },
    ],
    marks: [{ period: at, kind: "change" }],
  });
}

/** The values before and after a day with the day marked, and the two levels the words compare over the periods since: where the trend pointed and where the Metric was. */
export function afterChart(name: string, unit: ValueUnit, span: Span, whole: readonly Point[], later: readonly Point[], day: string, level: { expected: number; actual: number }): ChartPart {
  const [from, to] = [later[0].period, later[later.length - 1].period];
  return linesChart({
    about: "before-after",
    span,
    series: [{ name, unit: chartUnit(name, unit), role: "values", points: whole }],
    levels: [{ kind: "trend-pointed", value: level.expected, from, to }, { kind: "actual", value: level.actual, from, to }],
    marks: [{ period: from, kind: "date", day }],
  });
}

/** The values with the range they usually lie in and their median across the periods they were taken from, and the value asked about where there is one (at the latest period). */
export function usualChart(name: string, unit: ValueUnit, span: Span, rows: readonly Point[], from: string, usual: { low: number; high: number; median: number }, asked?: number): ChartPart {
  const last = rows[rows.length - 1].period;
  return linesChart({
    about: "usual",
    span,
    series: [{ name, unit: chartUnit(name, unit), role: "values", points: rows }],
    band: { kind: "usual", lo: usual.low, hi: usual.high, from, to: last },
    levels: [{ kind: "median", value: usual.median, from, to: last }, ...(asked === undefined ? [] : [{ kind: "asked" as const, value: asked, from: last, to: last }])],
  });
}

/** What each row of a bridge added or took away, largest first, and the total change. */
export function bridgeChart(name: string, unit: ValueUnit, parts: readonly { label: string; change: number; appeared: boolean; gone: boolean }[], change: number): ChartPart {
  return {
    kind: "bars",
    measure: "change",
    unit: chartUnit(name, unit),
    about: [name],
    bars: [...parts.map((p) => ({ label: p.label, value: p.change, ...(p.appeared ? { tag: "appeared" as const } : p.gone ? { tag: "gone" as const } : {}) })), { label: "", value: change, tag: "total" as const }],
  };
}
