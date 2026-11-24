// The words a chart of an analysis result says for itself (GLOSSARY: Takeaway; ticket #1076): its title, what each line is, what each
// level and mark stands for. The core's chart carries only structure and numbers, so the words are chosen here, in one place, from
// the names of the Metrics the result is about. The Takeaway above or below it is the chart's text alternative.
import type { BarsChart, ChartLevel, ChartLine, ChartMark, ForecastChart, LinesChart, ScatterChart } from "@ziffr/core/result-chart";
import { formatDate } from "@ziffr/core/format";

/** What a line is called in the legend: the Metric, said as what it is (its values, its change, what the fit expects, a trend). */
export function lineName(l: Pick<ChartLine, "name" | "role">): string {
  switch (l.role) {
    case "change": return `${l.name} (change from the period before)`;
    case "fitted": return `${l.name}, as the fit expects`;
    case "fitted-change": return `${l.name} (change), as the fit expects`;
    case "trend-before": return `${l.name}: the line before the change`;
    case "trend-since": return `${l.name}: the line since the change`;
    default: return l.name;
  }
}

/** What a level is called. */
export function levelName(l: Pick<ChartLevel, "kind">): string {
  return { "trend-pointed": "Where the trend pointed (on average)", actual: "Where it was (on average)", median: "The median", asked: "The value you asked about", goal: "The value you want it to reach", usual: "The usual range" }[l.kind];
}

/** What a mark is called. */
export function markName(m: ChartMark): string {
  return m.kind === "change" ? "The change" : m.day ? `From ${formatDate(m.day)}` : "The day it started";
}

const names = (l: LinesChart) => l.lines.map((x) => x.name);

/** The title of a chart of lines. */
export function linesTitle(c: LinesChart): string {
  const [a, b] = [...new Set(names(c))];
  switch (c.about) {
    case "pair": return `${a} and ${b} over time`;
    case "pair-changes": return `The change in ${a} and in ${b} over time`;
    case "fit": return `${a}: what it was, and what the fit expects`;
    case "fit-changes": return `The change in ${a}: what it was, and what the fit expects`;
    case "change": return c.marks?.length ? `${a} and where it changed` : `${a} over time`;
    case "before-after": return `${a} before and after`;
    default: return `${a} and the range it usually lies in`;
  }
}

/** The title of a forecast. */
export const forecastTitle = (c: ForecastChart): string => (c.target ? `${c.unit.name}: so far, where it is likely to go, and its Target` : `${c.unit.name}: so far, and where it is likely to go`);
/** The title of a scatter. */
export const scatterTitle = (c: ScatterChart): string => (c.changes ? `The change in ${c.y.name} against the change in ${c.x.name}` : `${c.y.name} against ${c.x.name}`);

/** The title of a chart of bars. */
export function barsTitle(c: BarsChart): string {
  const [a, b] = c.about;
  switch (c.measure) {
    case "delay": return `How closely ${b} follows ${a}, for each delay (in ${c.span}s)`;
    case "importance": return `What moves ${a}: each Metric's share`;
    case "change": return `What changed ${a}, row by row`;
    default: return `The rows of ${a}: each one's share of the whole, and the running total`;
  }
}

/** What a bar's tag says, as words under its label (a bar is never told apart by colour alone). */
export function tagWords(tag: NonNullable<BarsChart["bars"][number]["tag"]>): string {
  return { best: "best delay", top: "named in the answer", appeared: "new", gone: "gone", total: "total change" }[tag];
}
