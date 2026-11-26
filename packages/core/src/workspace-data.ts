// Data of one Workspace (GLOSSARY: Metric, Observation, Action, Target Series, Projection, Breakdown). Every loader
// takes the workspace and reads nothing outside it; what a person may see is decided in access.ts.
import { db } from "./db";
import { openRow, openRows } from "./sealed-columns";
import { workspaceCipher } from "./workspace-keys";
import { formulaInputs } from "./formula";
import { buildSeries } from "./series";
import { withheldDerived } from "./derived-owner";
import { normalizeMetric } from "./metric-row";
import { nestRows } from "./breakdown-parts";
import type { Action, BreakdownRow, Metric, Observation, Point } from "./types";

/** Plotted series per Metric, computed from observations (series.ts). */
export { buildSeries } from "./series";

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

/** A page for allRows that must not pass for empty when it failed: it throws `words` instead. For reads whose answer
 * must be whole, such as a file handed to a person. */
export async function mustRead<T>(page: PromiseLike<{ data: T[] | null; error: unknown }>, words: string): Promise<{ data: T[] | null }> {
  const read = await page;
  if (read.error) throw new Error(words);
  return read;
}

/** The Metrics of a workspace. */
export async function getMetrics(ws: string): Promise<Metric[]> {
  const { data } = await db().from("metrics").select("*").eq("workspace_id", ws).order("id");
  // A description is sealed with the Workspace Key (spec 0028) and read opened.
  const rows = await openRows("metrics", ws, data);
  const withheld = await withheldDerived(ws, rows);
  return rows.map((m) => (withheld.has(m.id) ? { ...normalizeMetric(m), inputs_withheld: true } : normalizeMetric(m)));
}

/** A stored value with its numbers as numbers (the database sends numeric columns as text or JSON numbers). Values are
 * sealed with the Workspace Key (spec 0028): they are opened by openObservations first. */
const toObservation = (o: Record<string, unknown>, names = false): Observation =>
  ({ ...(names ? o : { ...o, submitted_by_name: undefined, entered_by_name: undefined }), value: Number(o.value), original_value: o.original_value === null || o.original_value === undefined ? null : Number(o.original_value) }) as Observation;

/** Observations as stored, their values opened and read as numbers. A value that does not open (changed in the database,
 * or under a destroyed key) is left out: a missing value, never its ciphertext or a made-up number. */
export async function openObservations(ws: string, rows: Record<string, unknown>[] | null | undefined, names = false): Promise<Observation[]> {
  const opened = await openRows("observations", ws, rows);
  // The name of an imported value's submitter is personal data that only the Metric page shows (to everyone but Guests): it stays off every other read.
  return opened.filter((o) => typeof o.value === "number" && Number.isFinite(o.value)).map((o) => toObservation(o, names));
}

/** Every value of a workspace, optionally of some Metrics only, oldest period first: all of them when the Submission
 * Rule keeps both. Charts need only the latest of each period (getLatestObservations). */
export async function getObservations(ws: string, metricIds?: number[]): Promise<Observation[]> {
  const rows = await allRows<Record<string, unknown>>((from, to) => {
    let q = db().from("observations").select("*").eq("workspace_id", ws);
    if (metricIds) q = q.in("metric_id", metricIds);
    return q.order("period_start").order("created_at").order("id").range(from, to);
  });
  return openObservations(ws, rows);
}

// The values a database function answered. On an error, the database's words stay in the server log and a person
// gets a sentence of Ziffr's own.
async function valuesRead(ws: string, { data, error }: { data: unknown; error: { message: string } | null }): Promise<Observation[]> {
  if (error) {
    console.error("Values could not be read:", error.message);
    throw new Error("Values could not be read. Try again in a moment.");
  }
  return openObservations(ws, (data ?? []) as Record<string, unknown>[]);
}

/** The latest value of each period (what a chart plots), optionally of some Metrics and periods only (period starts,
 * both included), ordered by Metric, then period. One answer from the database, so no row limit cuts it. */
export async function getLatestObservations(ws: string, filter: { metricIds?: number[]; from?: string | null; to?: string | null } = {}): Promise<Observation[]> {
  return valuesRead(ws, await db().rpc("latest_observations", { p_workspace: ws, p_metric_ids: filter.metricIds ?? null, p_from: filter.from ?? null, p_to: filter.to ?? null }));
}

/** The latest value of each of a Metric's last `points` periods, for lists with a trend line. */
export async function getRecentObservations(ws: string, points: number, metricIds?: number[]): Promise<Observation[]> {
  return valuesRead(ws, await db().rpc("recent_observations", { p_workspace: ws, p_points: Math.max(0, Math.trunc(points)), p_metric_ids: metricIds ?? null }));
}

/** One value of a workspace by id, or null. */
export async function getObservation(ws: string, id: number | null | undefined): Promise<Observation | null> {
  if (!Number.isInteger(id)) return null;
  const { data } = await db().from("observations").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  return data ? (await openObservations(ws, [data]))[0] ?? null : null;
}

/** The last `n` values of one Metric, oldest first: every one of them when the rule keeps both. */
export async function getLastValues(ws: string, metricId: number, n: number): Promise<Observation[]> {
  const { data } = await db().from("observations").select("*").eq("workspace_id", ws).eq("metric_id", metricId)
    .order("period_start", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(n);
  return (await openObservations(ws, data, true)).reverse();
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
  const base = () => {
    const q = db().from("actions").select("*").eq("workspace_id", ws);
    return filter?.metricId ? q.eq("metric_id", filter.metricId) : q;
  };
  // Open and answered ones are what people work on: all of them, page by page, so the row limit drops none. Closed
  // ones are history: the newest CLOSED_ACTIONS_SHOWN, so a long-lived workspace does not read years of them.
  const [live, { data: closed }] = await Promise.all([
    allRows<Action>((from, to) => base().neq("status", "closed").order("updated_at", { ascending: false }).order("id", { ascending: false }).range(from, to)),
    base().eq("status", "closed").order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(CLOSED_ACTIONS_SHOWN),
  ]);
  return (await openRows("actions", ws, [...live, ...((closed ?? []) as Action[])])).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
}

/** How many closed Actions a list reads at most: the newest ones. */
export const CLOSED_ACTIONS_SHOWN = 500;

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
  const read = await allRows<Record<string, unknown>>((from, to) =>
    db().from("series_values").select("metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws).in("metric_id", metricIds).order("period_start").order("id").range(from, to),
  );
  // Values are sealed with the Workspace Key (spec 0028); a point that does not open is left out.
  const data = (await openRows("series_values", ws, read)) as { metric_id: number; kind: string; period_start: string; value: unknown }[];
  const targets: Record<number, Point[]> = {};
  const projections: Record<number, Point[]> = {};
  for (const r of data) if (typeof r.value === "number") ((r.kind === "target" ? targets : projections)[r.metric_id] ??= []).push({ period: r.period_start, value: r.value });
  return { targets, projections };
}

/** Breakdowns per metric and period, optionally of some periods only (period starts, both included). When a period
 * has several values (keep both), the latest one with rows wins. */
export async function getBreakdowns(ws: string, metricIds: number[], window: { from?: string | null; to?: string | null } = {}): Promise<Record<number, Record<string, BreakdownRow[]>>> {
  const ids = metricIds.filter(Number.isInteger);
  if (!ids.length) return {};
  const { data, error } = await db().rpc("latest_breakdowns", { p_workspace: ws, p_metric_ids: ids, p_from: window.from ?? null, p_to: window.to ?? null });
  if (error) {
    // The database's words stay in the server log; a person gets a sentence of Ziffr's own.
    console.error("Breakdowns could not be read:", error.message);
    throw new Error("Breakdowns could not be read. Try again in a moment.");
  }
  const out: Record<number, Record<string, BreakdownRow[]>> = {};
  // Labels are sealed with the Workspace Key and open here; one that does not open reads as a dash, never as ciphertext.
  const cipher = await workspaceCipher(ws);
  for (const r of (data ?? []) as { metric_id: number; period_start: string; rows: { id: number; parent_id: number | null; label: string; value: unknown; value_sealed: unknown }[] }[]) {
    // The top-level rows, each with its parts (breakdown-parts.ts); a Breakdown without parents is the flat list it always was.
    (out[r.metric_id] ??= {})[r.period_start] = nestRows(r.rows.map((b) => openRow(cipher, "breakdown_rows", b)).filter((b) => typeof b.value === "number").map((b) => ({ id: b.id, parent_id: b.parent_id ?? null, label: b.label || "–", value: b.value as number })));
  }
  return out;
}
