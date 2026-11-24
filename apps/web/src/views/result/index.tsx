"use client";
// The chart of an analysis result (GLOSSARY: Takeaway, Analysis Canvas; ticket #1076), above its words: each picture the core gave for the result, drawn
// by the one set of chart components. The chart stands in a group that can be reached by keyboard and is described by the Takeaway (aria-describedby),
// which is its text alternative. A result with no picture shows nothing and takes no room.
import type { NumberStyle } from "@ziffr/core/number-style";
import type { YearStart } from "@ziffr/core/periods";
import type { ChartPart, ResultChart } from "@ziffr/core/result-chart";
import { BarsView } from "./bars";
import { EffectsView } from "./effects";
import { ForecastView } from "./forecast";
import { GridView } from "./grid";
import { LinesView } from "./lines";
import { PairView } from "./scatter";
import { barsTitle, forecastTitle, linesTitle, scatterTitle } from "./words";

function titleOf(p: ChartPart): string {
  switch (p.kind) {
    case "lines": return linesTitle(p);
    case "forecast": return forecastTitle(p);
    case "scatter": return scatterTitle(p);
    case "bars": return barsTitle(p);
    case "effects": return "What the change reaches, Metric by Metric (each on its own scale)";
    default: return "How the Metrics move together, pair by pair";
  }
}

function Part({ part, style, yearStart }: { part: ChartPart; style: NumberStyle; yearStart: YearStart }) {
  switch (part.kind) {
    case "lines": return <LinesView chart={part} style={style} yearStart={yearStart} />;
    case "forecast": return <ForecastView chart={part} style={style} yearStart={yearStart} />;
    case "scatter": return <PairView chart={part} style={style} yearStart={yearStart} />;
    case "bars": return <BarsView chart={part} style={style} />;
    case "effects": return <EffectsView chart={part} style={style} />;
    default: return <GridView chart={part} style={style} />;
  }
}

/** The pictures of a result; `describedBy` is the id of the Takeaway's words, which say the same in text. */
export function ResultCharts({ chart, describedBy, style, yearStart }: { chart: ResultChart | undefined; describedBy: string; style: NumberStyle; yearStart: YearStart }) {
  if (!chart || chart.length === 0) return null;
  return (
    <div className="space-y-4">
      {chart.map((part, i) => (
        <figure key={i} tabIndex={0} aria-describedby={describedBy} aria-label={titleOf(part)} className="m-0 rounded-[var(--radius-input)] outline-offset-2 focus-visible:outline focus-visible:outline-2" data-result-chart-part={part.kind}>
          <figcaption className="mb-1 text-xs font-medium text-foreground">{titleOf(part)}</figcaption>
          <Part part={part} style={style} yearStart={yearStart} />
        </figure>
      ))}
    </div>
  );
}
