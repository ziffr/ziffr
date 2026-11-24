"use client";
// The forecast of a Metric drawn on its history (GLOSSARY: Metric, Takeaway; ticket #988): the same chart as the Overview, with the forecast
// as a dashed line and its likely range as a band. Nothing can be selected here; it is a picture for the Analysis tab's first card.
import type { ForecastPoint } from "@ziffr/core/forecast";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { YearStart } from "@ziffr/core/periods";
import type { Metric, Point } from "@ziffr/core/types";
import { MetricChart } from "@/views/metric-chart";

/** The history and the forecast of one Metric. */
export function ForecastChart({ metric, points, forecast, numberStyle, yearStart }: { metric: Metric; points: Point[]; forecast: ForecastPoint[]; numberStyle: NumberStyle; yearStart: YearStart }) {
  return <MetricChart numberStyle={numberStyle} metric={metric} points={points} forecast={forecast} yearStart={yearStart} />;
}
