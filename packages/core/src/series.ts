// Plotted series (GLOSSARY: Metric, Derived Metric, Submission Rule): what a chart draws for each Metric, from the
// observations the database holds. Pure, so the series and the Derived Metrics' values are checked against the
// references (derived.test.ts) without a database. workspace-data.ts loads the observations and calls this.
import { evaluate, formulaInputs, inputsProblem, targetInputs, targetReader, usesPrevious } from "./formula";
import { shiftPeriod } from "./periods";
import { totalSeries, type TotalsRead } from "./totals";
import type { Metric, Observation, Point } from "./types";

/** Plotted series per metric slug. keep_both → latest value wins on the chart. Derived metrics are computed.
 * `targets` are the Target Series by Metric id of every Metric a formula reads with target() (a Metric without an
 * entry has none, so its Target Range applies); left out, such a formula has no value. `totals` says what the reader of
 * these series sees and which parts each Total counts; left out, no Total has a value, nor a formula that reads one. */
export function buildSeries(metrics: Metric[], observations: Observation[], targets?: Record<number, readonly Point[]>, totals?: TotalsRead): Record<string, Point[]> {
  const bySlug: Record<string, Point[]> = {};
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const raw: Record<string, Map<string, number>> = {};
  for (const o of observations) {
    const m = byId[o.metric_id];
    if (!m) continue;
    (raw[m.slug] ??= new Map()).set(o.period_start, o.value);
  }
  // Totals first, from their parts' values, so a formula that reads one reads what this reader may see of it.
  const goals = targets ? { ...targets } : undefined;
  for (const m of metrics.filter((x) => x.total)) {
    const made = totals && !inputsProblem(m, metrics) ? totalSeries(m, totals, raw, byId, goals) : null;
    bySlug[m.slug] = made?.points ?? [];
    raw[m.slug] = new Map(bySlug[m.slug].map((p) => [p.period, p.value]));
    // Where its target is its parts' added up, that is what target() reads, and nothing where it was not worked out.
    if (goals && m.total!.targets === "parts") goals[m.id] = made?.targets ?? [];
    if (totals?.aims && m.total!.targets === "parts") totals.aims[m.id] = made?.targets ?? [];
  }
  for (const m of metrics.filter((x) => !x.total)) {
    bySlug[m.slug] = m.formula ? derivedSeries(m, m.formula, metrics, raw, goals) : [...(raw[m.slug] ?? new Map())].map(([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));
  }
  return bySlug;
}

// A Derived Metric's values: one for each period in which every input has one and the formula gives a number.
function derivedSeries(m: Metric, formula: string, metrics: Metric[], raw: Record<string, Map<string, number>>, targets?: Record<number, readonly Point[]>): Point[] {
  // Inputs of different periods meet only by chance (a day that starts a month): no series rather than a wrong one.
  // The page and widgets say why (inputsProblem).
  if (inputsProblem(m, metrics)) return [];
  const inputs = formulaInputs(formula);
  const columns = inputs.map((s) => raw[s] ?? new Map<string, number>());
  const periods = [...new Set(columns.flatMap((c) => [...c.keys()]))].sort();
  const back = usesPrevious(formula);
  // What target() reads, by input: nothing where the Target Series were not given, never the range in their place.
  const goals = targetInputs(formula).flatMap((slug) => {
    const input = metrics.find((x) => x.slug === slug);
    return input && targets ? [{ slug, read: targetReader(input, targets[input.id] ?? []) }] : [];
  });
  return periods.flatMap((period) => {
    // An input with no value in the period is NaN, which evaluate takes as missing: the period then has no value.
    const vars = Object.fromEntries(inputs.map((s, i) => [s, columns[i].get(period) ?? NaN]));
    // prev and change look at the period right before this one (one of the Metric's own, as the inputs share it): when
    // that has no value, there is no change either, never a change over a gap.
    const before = back ? Object.fromEntries(inputs.map((s, i) => [s, columns[i].get(shiftPeriod(period, m.period, -1)) ?? NaN])) : {};
    const aims = Object.fromEntries(goals.map((g) => [g.slug, g.read(period) ?? NaN]));
    const value = evaluate(formula, vars, before, aims);
    return value === null ? [] : [{ period, value }];
  });
}
