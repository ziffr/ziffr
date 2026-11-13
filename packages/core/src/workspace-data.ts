// Data of one Workspace (GLOSSARY: Metric, Observation, Action, Target Series, Projection, Breakdown). Every loader
// takes the workspace and reads nothing outside it; what a person may see is decided in access.ts.
import { db } from "./db";
import { evaluate, formulaInputs } from "./formula";
import { normalizeMetric } from "./metric-row";
import type { Action, BreakdownRow, Metric, Observation, Point } from "./types";

/** The Metrics of a workspace. */
export async function getMetrics(ws: string): Promise<Metric[]> {
  const { data } = await db().from("metrics").select("*").eq("workspace_id", ws).order("id");
  return (data ?? []).map((m) => normalizeMetric(m));
}

/** The values of a workspace, optionally of some Metrics only. */
export async function getObservations(ws: string, metricIds?: number[]): Promise<Observation[]> {
  let q = db().from("observations").select("*").eq("workspace_id", ws).order("period_start").order("created_at");
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

/** A workspace's Metrics, their values and their plotted series. */
export async function getAllSeries(ws: string) {
  const [metrics, observations] = await Promise.all([getMetrics(ws), getObservations(ws)]);
  return { metrics, observations, series: buildSeries(metrics, observations) };
}

/** A workspace's Actions, newest first; who may read them is decided in access.ts. */
export async function getActions(ws: string, filter?: { metricId?: number }): Promise<Action[]> {
  let q = db().from("actions").select("*").eq("workspace_id", ws).order("updated_at", { ascending: false });
  if (filter?.metricId) q = q.eq("metric_id", filter.metricId);
  const { data } = await q;
  return data ?? [];
}

/** How many Actions wait for the person in this workspace: open ones assigned to them, answered ones they asked. */
export async function openActionCount(ws: string, viewer: string) {
  // Two plain filters, never one built from a string.
  const [{ count: assigned }, { count: answered }] = await Promise.all([
    db().from("actions").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("assignee_id", viewer).eq("status", "open"),
    db().from("actions").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("asker_id", viewer).eq("status", "answered"),
  ]);
  return (assigned ?? 0) + (answered ?? 0);
}

/** Target Series and Projections per metric. */
export async function getSeriesValues(ws: string, metricIds: number[]) {
  const { data } = await db().from("series_values").select("metric_id, kind, period_start, value").eq("workspace_id", ws).in("metric_id", metricIds).order("period_start");
  const targets: Record<number, Point[]> = {};
  const projections: Record<number, Point[]> = {};
  for (const r of data ?? []) ((r.kind === "target" ? targets : projections)[r.metric_id] ??= []).push({ period: r.period_start, value: Number(r.value) });
  return { targets, projections };
}

/** Breakdowns per metric and period. When a period has several observations (keep both), the latest one with rows wins. */
export async function getBreakdowns(ws: string, metricIds: number[], observations: Observation[]): Promise<Record<number, Record<string, BreakdownRow[]>>> {
  const wanted = new Set(metricIds);
  const obs = observations.filter((o) => wanted.has(o.metric_id));
  if (!obs.length) return {};
  const { data } = await db().from("breakdown_rows").select("observation_id, label, value, position").eq("workspace_id", ws).in("observation_id", obs.map((o) => o.id)).order("position").limit(20000);
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
