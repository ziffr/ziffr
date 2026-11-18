// Plotted series (GLOSSARY: Metric, Derived Metric, Submission Rule): what a chart draws for each Metric, from the
// observations the database holds. Pure, so the series and the Derived Metrics' values are checked against the
// references (derived.test.ts) without a database. workspace-data.ts loads the observations and calls this.
import { evaluate, formulaInputs, inputsProblem } from "./formula";
import type { Metric, Observation, Point } from "./types";

/** Plotted series per metric slug. keep_both → latest value wins on the chart. Derived metrics are computed. */
export function buildSeries(metrics: Metric[], observations: Observation[]): Record<string, Point[]> {
  const bySlug: Record<string, Point[]> = {};
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const raw: Record<string, Map<string, number>> = {};
  for (const o of observations) {
    const m = byId[o.metric_id];
    if (!m) continue;
    (raw[m.slug] ??= new Map()).set(o.period_start, o.value);
  }
  for (const m of metrics) {
    if (!m.formula) {
      bySlug[m.slug] = [...(raw[m.slug] ?? new Map())].map(([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));
    }
  }
  for (const m of metrics) {
    if (!m.formula) continue;
    // Inputs of different periods meet only by chance (a day that starts a month): no series rather than a wrong one.
    // The page and widgets say why (inputsProblem).
    if (inputsProblem(m, metrics)) {
      bySlug[m.slug] = [];
      continue;
    }
    const inputs = formulaInputs(m.formula);
    const periods = [...new Set(inputs.flatMap((s) => [...(raw[s]?.keys() ?? [])]))].sort();
    bySlug[m.slug] = periods
      .map((period) => {
        const vars: Record<string, number> = {};
        for (const s of inputs) {
          const v = raw[s]?.get(period);
          if (v === undefined) return null;
          vars[s] = v;
        }
        const value = evaluate(m.formula!, vars);
        return value === null ? null : { period, value };
      })
      .filter((p): p is Point => p !== null);
  }
  return bySlug;
}
