// Heads-ups (GLOSSARY: Heads-up, Metric; spec 0041, ticket 13): the job that fills the pair table, and the one function that
// reads it for a person.
//
// The job acts for no person. For each Workspace (never the demo) it looks at the 200 most recently updated Metrics that are in use,
// compares every pair that may be compared on its Common Period (methods/pair-scan.ts) and writes what it found into
// `heads_up_pairs`, once per Workspace and at most every six hours; rows it did not refresh and rows older than 90 days go. It
// answers counts only. The pair table is derived from values, so it is read by nobody but this file, with the service key.
//
// `listHeadsUps(actor)` is where visibility is decided: it takes the Actor first, reads the Metrics the person may see (the core's
// own rule: Shares, Groups, Tokens, Stand-ins) that are in use, reads ONLY the rows whose two Metrics are among them, and gives
// methods/heads-up.ts those rows and those Metrics' names. The correction for the number of pairs is worked out there, over those
// rows alone, so nothing a person receives (not a Heads-up, not a count, not the order, not the chance in Show the numbers)
// depends on a Metric they may not see. A Metric that is archived or hidden since the last scan is gone from the list at once,
// without a new scan, because the filter is applied at every read.
import type { Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { builtFrom } from "./correlation";
import { db } from "./db";
import { resolverFrom, seriesBy } from "./display-periods";
import { yearStartOf } from "./fiscal-year";
import { formulaInputs } from "./formula";
import { capMetrics, scanPairs, type PairRow, type Window } from "./methods/pair-scan";
import { headsUpsFrom, type HeadsUp } from "./methods/heads-up";
import { shiftPeriod, type Span } from "./periods";
import { workspaceToday } from "./retention-setting";
import { DEMO_WORKSPACE_ID } from "./team";
import { allRows, buildSeries, getLatestObservations, getMetrics } from "./workspace-data";
import { numberStyleOf } from "./workspace-settings";
import type { Metric, Point } from "./types";

/** How long a Workspace's scan stands before the next may start, in hours. */
export const SCAN_EVERY_HOURS = 6;
/** How long a row of the pair table is kept without a scan refreshing it, in days. */
export const KEEP_DAYS = 90;
const CHUNK = 500;

/** The longest one call of the job starts new scans for, in milliseconds; the Workspaces not reached wait for the next call. */
export const MAX_CALL_MS = 8 * 60_000;

/** What one call of the job did, in counts. `left`: Workspaces not reached because the call ran out of time. */
export type HeadsUpJobResult = { workspaces: number; scanned: number; skipped: number; failed: number; pairs: number; expired: number; left: number };

/** What scanning one Workspace did, in counts. `capped`: it had more Metrics in use than a scan looks at. */
export type ScanResult = { metrics: number; pairs: number; capped: boolean };

const log = (what: string) => console.error(`Heads-ups: ${what}`);

// The pair table's row for a window: the columns of one window, with `prefix` ("" or "before_").
function windowColumns(w: Window, prefix: string): Record<string, unknown> {
  const cols = { lag: w.lag, r: w.r, n: w.n, n_eff: w.nEff, p_delays: w.pDelays, p: w.p, tries: w.tries, meets: w.meets, r_first: w.rFirst, n_first: w.nFirst, r_second: w.rSecond, n_second: w.nSecond };
  return Object.fromEntries(Object.entries(cols).map(([k, v]) => [`${prefix}${k}`, v]));
}

/** A pair of the scan as a row of the table. */
export function rowToDb(ws: string, row: PairRow, scannedAt: string): Record<string, unknown> {
  const { before } = row;
  return {
    workspace_id: ws, metric_a: row.a, metric_b: row.b, span: row.span, through: row.through, scanned_at: scannedAt,
    ...windowColumns(row.full, ""),
    ...(before ? windowColumns(before, "before_") : {}),
    recent_r: before?.recent?.r ?? null, recent_n: before?.recent?.n ?? null, recent_low: before?.recent?.low ?? null, recent_drop_p: before?.recent?.dropP ?? null,
  };
}

const num = (v: unknown) => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v));
const windowOf = (raw: Record<string, unknown>, prefix: string): Window => ({
  lag: num(raw[`${prefix}lag`])!, r: num(raw[`${prefix}r`])!, n: num(raw[`${prefix}n`])!, nEff: num(raw[`${prefix}n_eff`])!, pDelays: num(raw[`${prefix}p_delays`])!, p: num(raw[`${prefix}p`])!,
  tries: num(raw[`${prefix}tries`])!, meets: raw[`${prefix}meets`] as boolean, rFirst: num(raw[`${prefix}r_first`]), nFirst: num(raw[`${prefix}n_first`])!, rSecond: num(raw[`${prefix}r_second`]), nSecond: num(raw[`${prefix}n_second`])!,
});

/** A row of the table as a pair of the scan; the numbers are checked where they are used (headsUpsFrom leaves out a row that is not what a scan writes). */
export function rowFromDb(raw: Record<string, unknown>): PairRow {
  const recent = raw.recent_r === null || raw.recent_r === undefined ? null : { r: num(raw.recent_r)!, n: num(raw.recent_n)!, low: raw.recent_low as boolean, dropP: num(raw.recent_drop_p)! };
  return {
    a: num(raw.metric_a)!, b: num(raw.metric_b)!, span: raw.span as Span, through: String(raw.through),
    full: windowOf(raw, ""),
    before: raw.before_lag === null || raw.before_lag === undefined ? null : { ...windowOf(raw, "before_"), recent },
  };
}

// For each Metric in use the ids of every Metric it is worked out from, directly or through other Derived Metrics.
function ingredients(metrics: readonly Metric[]): Map<number, Set<number>> {
  const bySlug = new Map(metrics.map((m) => [m.slug, m]));
  const memo = new Map<number, Set<number>>();
  const of = (m: Metric, seen: Set<number>): Set<number> => {
    if (memo.has(m.id)) return memo.get(m.id)!;
    const out = new Set<number>();
    // A formula that reaches itself through others is cut at the repeat, not followed for ever.
    if (!seen.has(m.id) && m.formula) {
      const next = new Set(seen).add(m.id);
      for (const slug of formulaInputs(m.formula)) {
        const input = bySlug.get(slug);
        if (!input) continue;
        out.add(input.id);
        for (const deeper of of(input, next)) out.add(deeper);
      }
    }
    memo.set(m.id, out);
    return out;
  };
  return new Map(metrics.map((m) => [m.id, of(m, new Set())]));
}

/** Scans one Workspace and replaces its rows of the pair table: the 200 most recently updated Metrics in use, every pair that
 * may be compared (the same Period, or one step apart) except a Derived Metric with a Metric it is worked out from, directly
 * or through others, or with another Derived Metric worked out from the same. `today` is for tests. The caller has claimed the
 * scan. Reads and writes only this Workspace. */
export async function scanWorkspace(ws: string, scannedAt: string, today?: string): Promise<ScanResult> {
  const day = today ?? (await workspaceToday(ws));
  const [metrics, yearStart] = await Promise.all([getMetrics(ws), yearStartOf(ws)]);
  // Only values of the last ten years are read: no series is longer than 120 periods, and a yearly Metric has few values.
  const observations = await getLatestObservations(ws, { from: shiftPeriod(day, "year", -10) });
  const series = buildSeries(metrics, observations);
  const resolve = resolverFrom(metrics, series);
  // In use: not archived, and showing values (a Derived Metric whose inputs its owner may no longer share shows none).
  const live = metrics.filter((m) => !m.archived_at && !m.inputs_withheld);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const inputs = ingredients(metrics);
  // How recently a Metric was updated: when its latest value was recorded, a Derived Metric by its ingredients; this decides which
  // 200 Metrics a Workspace with more is scanned for.
  const recorded = new Map<number, string>();
  for (const o of observations) if (!(recorded.get(o.metric_id)! >= o.created_at)) recorded.set(o.metric_id, o.created_at);
  const updated = (m: Metric) => [m.id, ...inputs.get(m.id)!].reduce((top, id) => ((recorded.get(id) ?? "") > top ? recorded.get(id)! : top), "");
  const withValues = live.filter((m) => (series[m.slug]?.length ?? 0) > 0).map((m) => ({ id: m.id, period: m.period as Span, latest: updated(m) }));
  const looked = capMetrics(withValues);
  const share = (x: Set<number>, y: Set<number>) => [...x].some((id) => y.has(id));
  const related = (a: number, b: number) => {
    const [ma, mb] = [byId.get(a)!, byId.get(b)!];
    return builtFrom(ma, mb) || inputs.get(a)!.has(b) || inputs.get(b)!.has(a) || share(inputs.get(a)!, inputs.get(b)!);
  };
  // Each Metric's levels on a Common Period: only periods that are over (a period still running compares part with whole).
  const levels = (id: number, span: Span): Point[] | null => {
    const m = byId.get(id)!;
    const s = seriesBy(m, resolve, span, { yearStart, today: day });
    return s.ok ? s.points.filter((p) => !p.toDate).map((p) => ({ period: p.period, value: p.value })) : null;
  };
  const rows = scanPairs(looked, levels, related, day, yearStart);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db().from("heads_up_pairs").upsert(rows.slice(i, i + CHUNK).map((r) => rowToDb(ws, r, scannedAt)), { onConflict: "workspace_id,metric_a,metric_b" });
    if (error) throw new Error("The pair table could not be written.");
  }
  // What this scan did not refresh is gone: a pair that can no longer be compared, or a Metric no longer in use.
  const { error: staleError } = await db().from("heads_up_pairs").delete().eq("workspace_id", ws).lt("scanned_at", scannedAt);
  if (staleError) throw new Error("The pair table could not be cleaned.");
  const result = { metrics: looked.length, pairs: rows.length, capped: withValues.length > looked.length };
  await db().from("heads_up_scans").update({ metrics: result.metrics, pairs: result.pairs, capped: result.capped }).eq("workspace_id", ws);
  return result;
}

/** The Heads-up job (the route is the job secret's): for every Workspace but the demo whose scan is not recent, scans it; then
 * drops pair-table rows older than 90 days. Answers counts only; a Workspace whose scan fails is counted and the rest go on. */
export async function headsUpJob(opts: { today?: string; budgetMs?: number } = {}): Promise<HeadsUpJobResult> {
  const result: HeadsUpJobResult = { workspaces: 0, scanned: 0, skipped: 0, failed: 0, pairs: 0, expired: 0, left: 0 };
  const ids = await allRows<{ id: string }>((from, to) => db().from("workspaces").select("id").neq("id", DEMO_WORKSPACE_ID).order("id").range(from, to));
  const started = Date.now();
  for (const [i, { id }] of ids.entries()) {
    if (Date.now() - started > (opts.budgetMs ?? MAX_CALL_MS)) { result.left = ids.length - i; break; }
    result.workspaces++;
    try {
      const { data, error } = await db().rpc("claim_heads_up_scan", { p_ws: id, p_every: `${SCAN_EVERY_HOURS} hours` });
      if (error) throw new Error("The scan could not be claimed.");
      if (!data) { result.skipped++; continue; }
      const scan = await scanWorkspace(id, data as string, opts.today);
      result.scanned++;
      result.pairs += scan.pairs;
    } catch {
      // The words stay out of the log: a Workspace's own text may be in a database error.
      log("a Workspace's scan failed");
      result.failed++;
    }
  }
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { count } = await db().from("heads_up_pairs").delete({ count: "exact" }).lt("scanned_at", cutoff).neq("workspace_id", DEMO_WORKSPACE_ID);
  result.expired = count ?? 0;
  return result;
}

/** The Heads-ups a person may be told, strongest first: only about Metrics they may see that are in use, from the pair table's
 * rows for those Metrics alone (see the file's header). A person who sees fewer than two Metrics gets none. Takes the Actor
 * first; an Access Key is not an Actor here. */
export async function listHeadsUps(actor: Actor): Promise<HeadsUp[]> {
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, actor.personId, metrics);
  // In use, and showing values, exactly as the scan was: a Metric archived or hidden since the last scan is left out here.
  const mine = metrics.filter((m) => seen.has(m.id) && !m.archived_at && !m.inputs_withheld);
  if (mine.length < 2) return [];
  const ids = mine.map((m) => m.id);
  const rows = await allRows<Record<string, unknown>>((from, to) => db().rpc("visible_heads_up_pairs", { p_ws: ws, p_ids: ids }).range(from, to));
  const names = new Map(mine.map((m) => [m.id, m.name]));
  // Rows are read for these Metrics only; the filter is applied again where the rows are used (headsUpsFrom drops any naming another).
  return headsUpsFrom(rows.map(rowFromDb), names, { style: await numberStyleOf(ws), yearStart: await yearStartOf(ws) });
}
