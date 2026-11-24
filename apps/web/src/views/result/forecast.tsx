"use client";
// The forecast of a result (GLOSSARY: Takeaway; ticket #1076): the Metric's values so far, the dashed forecast with the range the Takeaway writes
// and, where the question is about it, the Target Range. It is the very chart of the Metric page (MetricChart), given the core's points: one chart
// for a forecast wherever it is shown.
import { MetricChart } from "../metric-chart";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { YearStart } from "@ziffr/core/periods";
import type { ForecastChart } from "@ziffr/core/result-chart";
import { described } from "./described";

/** A forecast with its range, and the Target Range where there is one. */
export function ForecastView({ chart: c, style, yearStart }: { chart: ForecastChart; style: NumberStyle; yearStart: YearStart }) {
  return <MetricChart metric={described(c.unit, c.span, c.target)} points={c.history} forecast={c.ahead} height={260} gaps yearStart={yearStart} numberStyle={style} />;
}
