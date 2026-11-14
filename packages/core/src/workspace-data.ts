// Data of one Workspace (GLOSSARY: Metric, Observation, Action, Target Series, Projection, Breakdown). Every loader
// takes the workspace and reads nothing outside it; what a person may see is decided in access.ts.
import { db } from "./db";
import { evaluate, formulaInputs } from "./formula";
import { normalizeMetric } from "./metric-row";
import type { Action, BreakdownRow, Metric, Observation, Point } from "./types";

/** Rows a hosted database returns at most for one request (its API "Max Rows", 1000 by default). */
export const PAGE_ROWS = 1000;

/** Every row of a query, read page by page, so the database's row limit drops nothing. The query must be ordered by
 * something unique (end with the id), or a page could repeat or skip a row. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data } = await page(from, from + PAGE_ROWS - 1);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return out;
  }
}

/** The Metrics of a workspace. */
export async function getMetrics(ws: string): Promise<Metric[]> {
  const { data } = await db().from("metrics").select("*").eq("workspace_id", ws).order("id");
  return (data ?? []).map((m) => normalizeMetric(m));
}

/** A stored value with its numbers as numbers (the database sends numeric columns as text or JSON numbers). */
const toObservation = (o: Record<string, unknown>): Observation =>
  ({ ...o, value: Number(o.value), original_value: o.original_value === null || o.original_value === undefined ? null : Number(o.original_value) }) as Observation;

/** Every value of a workspace, optionally of some Metrics only, oldest period first: all of them when the Submission
 * Rule keeps both. Charts need only the latest of each period (getLatestObservations). */
export async function getObservations(ws: string, metricIds?: number[]): Promise<Observation[]> {
  const rows = await allRows<Record<string, unknown>>((from, to) => {
    let q = db().from("observations").select("*").eq("workspace_id", ws);
    if (metricIds) q = q.in("metric_id", metricIds);
    return q.order("period_start").order("created_at").order("id").range(from, to);
  });
  return rows.map(toObservation);
}

/** The latest value of each period (what a chart plots), optionally of some Metrics and periods only (period starts,
 * both included), ordered by Metric, then period. One answer from the database, so no row limit cuts it. */
export async function getLatestObservations(ws: string, filter: { metricIds?: number[]; from?: string | null; to?: string | null } = {}): Promise<Observation[]> {
  const { data, error } = await db().rpc("latest_observations", { p_workspace: ws, p_metric_ids: filter.metricIds ?? null, p_from: filter.from ?? null, p_to: filter.to ?? null });
  if (error) throw new Error(`Values could not be read: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(toObservation);
}

/** The latest value of each of a Metric's last `points` periods, for lists with a trend line. */
export async function getRecentObservations(ws: string, points: number, metricIds?: number[]): Promise<Observation[]> {
  const { data, error } = await db().rpc("recent_observations", { p_workspace: ws, p_points: Math.max(0, Math.trunc(points)), p_metric_ids: metricIds ?? null });
  if (error) throw new Error(`Values could not be read: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(toObservation);
}

/** One value of a workspace by id, or null. */
export async function getObservation(ws: string, id: number | null | undefined): Promise<Observation | null> {
  if (!Number.isInteger(id)) return null;
  const { data } = await db().from("observations").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  return data ? toObservation(data) : null;
}

/** The last `n` values of one Metric, oldest first: every one of them when the rule keeps both. */
export async function getLastValues(ws: string, metricId: number, n: number): Promise<Observation[]> {
  const { data } = await db().from("observations").select("*").eq("workspace_id", ws).eq("metric_id", metricId)
    .order("period_start", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(n);
  return (data ?? []).map(toObservation).reverse();
}

/** These Metrics and the inputs of the Derived Metrics among them: what their series are computed from. */
export function withInputs(metrics: readonly Metric[], ids: Iterable<number>): number[] {
  const bySlug = new Map(metrics.map((m) => [m.slug, m.id]));
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const out = new Set<number>();
  for (const id of ids) {
    out.add(id);
    const formula = byId.get(id)?.formula;
    if (!formula) continue;
    for (const slug of formulaInputs(formula)) {
      const input = bySlug.get(slug);
      if (input !== undefined) out.add(input);
    }
  }
  return [...out];
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

/** A workspace's Metrics and their plotted series. With `points`, each series holds only its last periods, for lists;
 * the inputs of Derived Metrics are then still read in full, so a derived series ends as it would otherwise. */
export async function getAllSeries(ws: string, opts: { points?: number } = {}) {
  const metrics = await getMetrics(ws);
  if (!opts.points) return { metrics, series: buildSeries(metrics, await getLatestObservations(ws)) };
  const inputs = new Set(withInputs(metrics, metrics.filter((m) => m.formula).map((m) => m.id)));
  const rest = metrics.filter((m) => !m.formula && !inputs.has(m.id)).map((m) => m.id);
  const [recent, full] = await Promise.all([
    rest.length ? getRecentObservations(ws, opts.points, rest) : Promise.resolve([]),
    inputs.size ? getLatestObservations(ws, { metricIds: [...inputs] }) : Promise.resolve([]),
  ]);
  const series = buildSeries(metrics, [...recent, ...full]);
  for (const slug of Object.keys(series)) series[slug] = series[slug].slice(-opts.points);
  return { metrics, series };
}

/** The plotted series of some Metrics only, read with what the Derived ones among them are computed from; optionally
 * of some periods only (period starts, both included). */
export async function getSeriesOf(ws: string, metrics: Metric[], ids: number[], window: { from?: string | null; to?: string | null } = {}) {
  const wanted = withInputs(metrics, ids);
  return buildSeries(metrics, wanted.length ? await getLatestObservations(ws, { metricIds: wanted, ...window }) : []);
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
  const data = await allRows<{ metric_id: number; kind: string; period_start: string; value: unknown }>((from, to) =>
    db().from("series_values").select("metric_id, kind, period_start, value").eq("workspace_id", ws).in("metric_id", metricIds).order("period_start").order("id").range(from, to),
  );
  const targets: Record<number, Point[]> = {};
  const projections: Record<number, Point[]> = {};
  for (const r of data) ((r.kind === "target" ? targets : projections)[r.metric_id] ??= []).push({ period: r.period_start, value: Number(r.value) });
  return { targets, projections };
}

/** Breakdowns per metric and period, optionally of some periods only (period starts, both included). When a period
 * has several values (keep both), the latest one with rows wins. */
export async function getBreakdowns(ws: string, metricIds: number[], window: { from?: string | null; to?: string | null } = {}): Promise<Record<number, Record<string, BreakdownRow[]>>> {
  const ids = metricIds.filter(Number.isInteger);
  if (!ids.length) return {};
  const { data, error } = await db().rpc("latest_breakdowns", { p_workspace: ws, p_metric_ids: ids, p_from: window.from ?? null, p_to: window.to ?? null });
  if (error) throw new Error(`Breakdowns could not be read: ${error.message}`);
  const out: Record<number, Record<string, BreakdownRow[]>> = {};
  for (const r of (data ?? []) as { metric_id: number; period_start: string; rows: { label: string; value: unknown }[] }[]) {
    (out[r.metric_id] ??= {})[r.period_start] = r.rows.map((b) => ({ label: b.label, value: Number(b.value) }));
  }
  return out;
}
