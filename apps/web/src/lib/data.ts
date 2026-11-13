import "server-only";
import { db } from "./db";
import { evaluate, formulaInputs } from "@ziffr/core/formula";
import type { Action, BreakdownRow, Metric, Observation, Point, Profile } from "@ziffr/core/types";

export async function getProfiles(): Promise<Profile[]> {
  const { data } = await db.from("profiles").select("*").order("name");
  return data ?? [];
}

export async function getProfileMap() {
  return Object.fromEntries((await getProfiles()).map((p) => [p.id, p])) as Record<string, Profile>;
}

export async function getMetrics(): Promise<Metric[]> {
  const { data } = await db.from("metrics").select("*").order("id");
  return (data ?? []).map(normalizeMetric);
}

export function normalizeMetric(m: Metric): Metric {
  return {
    ...m,
    target_min: m.target_min === null ? null : Number(m.target_min),
    target_max: m.target_max === null ? null : Number(m.target_max),
  };
}

export async function getObservations(metricIds?: number[]): Promise<Observation[]> {
  let q = db.from("observations").select("*").order("period_start").order("created_at");
  if (metricIds) q = q.in("metric_id", metricIds);
  const { data } = await q.limit(20000);
  return (data ?? []).map((o) => ({ ...o, value: Number(o.value), original_value: o.original_value === null ? null : Number(o.original_value) }));
}

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

export async function getAllSeries() {
  const [metrics, observations] = await Promise.all([getMetrics(), getObservations()]);
  return { metrics, observations, series: buildSeries(metrics, observations) };
}

export async function getActions(filter?: { metricId?: number }): Promise<Action[]> {
  let q = db.from("actions").select("*").order("updated_at", { ascending: false });
  if (filter?.metricId) q = q.eq("metric_id", filter.metricId);
  const { data } = await q;
  return data ?? [];
}

export async function openActionCount(viewer: string) {
  const { count } = await db
    .from("actions")
    .select("*", { count: "exact", head: true })
    .or(`and(assignee_id.eq.${viewer},status.eq.open),and(asker_id.eq.${viewer},status.eq.answered)`);
  return count ?? 0;
}

/** Target Series and Projections per metric. */
export async function getSeriesValues(metricIds: number[]) {
  const { data } = await db.from("series_values").select("metric_id, kind, period_start, value").in("metric_id", metricIds).order("period_start");
  const targets: Record<number, Point[]> = {};
  const projections: Record<number, Point[]> = {};
  for (const r of data ?? []) ((r.kind === "target" ? targets : projections)[r.metric_id] ??= []).push({ period: r.period_start, value: Number(r.value) });
  return { targets, projections };
}

/** Breakdowns per metric and period. When a period has several observations (keep both), the latest one with rows wins. */
export async function getBreakdowns(metricIds: number[], observations: Observation[]): Promise<Record<number, Record<string, BreakdownRow[]>>> {
  const wanted = new Set(metricIds);
  const obs = observations.filter((o) => wanted.has(o.metric_id));
  if (!obs.length) return {};
  const { data } = await db.from("breakdown_rows").select("observation_id, label, value, position").in("observation_id", obs.map((o) => o.id)).order("position").limit(20000);
  const rowsByObs = new Map<number, BreakdownRow[]>();
  for (const r of data ?? []) {
    const list = rowsByObs.get(r.observation_id) ?? [];
    list.push({ label: r.label, value: Number(r.value) });
    rowsByObs.set(r.observation_id, list);
  }
  const out: Record<number, Record<string, BreakdownRow[]>> = {};
  for (const o of [...obs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const rows = rowsByObs.get(o.id);
    if (rows) (out[o.metric_id] ??= {})[o.period_start] = rows;
  }
  return out;
}
