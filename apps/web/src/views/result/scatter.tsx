"use client";
// Two Metrics against each other (GLOSSARY: Takeaway; ticket #1076): one point for each period they have in common, the very chart of the Metric page.
import { ScatterView } from "../scatter";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { YearStart } from "@ziffr/core/periods";
import type { ScatterChart } from "@ziffr/core/result-chart";
import { described } from "./described";

/** The scatter of a pair of Metrics. */
export function PairView({ chart: c, style, yearStart }: { chart: ScatterChart; style: NumberStyle; yearStart: YearStart }) {
  return <ScatterView x={described(c.x, c.span)} y={described(c.y, c.span)} pairs={c.pairs} height={260} yearStart={yearStart} numberStyle={style} />;
}
