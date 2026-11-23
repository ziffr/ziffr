// What the views that draw a Metric's Breakdown over its periods (GLOSSARY: Breakdown, View Design) are given, the same
// way for each: the window ends at the newest period the Metric has a value or a Breakdown in, and a period and a value
// are written as the Workspace writes them. The core's models take it from here.
import { formatValue } from "@ziffr/core/format";
import { periodLabel } from "@ziffr/core/periods";
import type { DesignValues } from "./design-view";

/** The input every Breakdown-over-time model shares, or null when the Metric has no period at all to end on. */
export function breakdownInput(v: DesignValues) {
  const { m, data } = v;
  const last = v.all[v.all.length - 1];
  const byPeriod = data.breakdowns[m.id] ?? {};
  // The window ends at the newest period the Metric has a value or a Breakdown in.
  const newest = [last?.period, ...Object.keys(byPeriod)].filter((p): p is string => !!p).sort().pop();
  if (!newest) return null;
  return {
    name: m.name,
    by: v.by,
    to: newest,
    window: v.win,
    byPeriod,
    periods: v.all.map((p) => p.period),
    label: (p: string) => periodLabel(p, v.by, data.yearStart, true),
    write: (x: number) => formatValue(m, x, data.numberStyle),
  };
}
