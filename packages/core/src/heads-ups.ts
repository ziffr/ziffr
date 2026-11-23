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
// depends on a Metric they may not see.
//
// Where a Workspace has more Metrics in use than a scan looks at, every person's list is a scan of their own Metrics: up to 200
// Metrics' values per call. heads-up-budget.ts keeps that result for a few minutes for the same set of Metrics the person sees and
// counts the scans each person starts, so the list can be opened by a page or a script without scanning again each time (ticket #707).
// A Metric that is archived or hidden since is gone from the list at once, without a new scan, because the set is part of what a
// kept result is matched against and the filter is applied at every read.
import type { Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { builtFrom } from "./correlation";
import { db } from "./db";
import { resolverFrom, seriesBy } from "./display-periods";
import { yearStartOf } from "./fiscal-year";
import { formulaInputs } from "./formula";
import { capMetrics, scanPairs, type PairRow, type Window } from "./methods/pair-scan";
import { headsUpsFrom, type HeadsUp } from "./methods/heads-up";
import { deliverHeadsUps } from "./heads-up-delivery";
import { ScanBudget, limiter } from "./heads-up-budget";
import { periodStart, shiftPeriod, type Span } from "./periods";
import { NOT_FINAL_STATES } from "./value-state";
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
export type HeadsUpJobResult = { workspaces: number; scanned: number; skipped: number; failed: number; pairs: number; expired: number; left: number; told: number };

/** What scanning one Workspace did, in counts. `capped`: it had more Metrics in use than a scan looks at. */
export type ScanResult = { metrics: number; pairs: number; capped: boolean };

// The rows of a person's own scan, kept for a few minutes (the key holds the Workspace and the person), and the one scan a person
// has under way, so two calls at once share it.
const budget = new ScanBudget<PairRow[]>();
const oneAtATime = limiter();
const underway = new Map<string, { ids: string; rows: Promise<PairRow[]> }>();

/** Forgets what the budget kept (for tests). */
export function resetHeadsUpBudget(): void {
  budget.clear();
  underway.clear();
}

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

/** Scans `subset` of a Workspace's Metrics (the ones in use) into pair rows, in memory: the 200 most recently updated of them, every
 * pair that may be compared. Nothing here looks at a Metric outside `subset`, except that a Derived Metric's values come from its
 * inputs (the values a person sees of it are those). `related` decides which pairs are left out. */
async function scanSubset(ws: string, day: string, pick: (all: Metric[]) => Metric[], relatedOver: (all: Metric[]) => (a: number, b: number) => boolean): Promise<{ rows: PairRow[]; metrics: number; capped: boolean }> {
  const [metrics, yearStart] = await Promise.all([getMetrics(ws), yearStartOf(ws)]);
  // Only values of the last ten years are read: no series is longer than 120 periods, and a yearly Metric has few values.
  // A value that is not final (waiting for Approval, or sent back; value-state.ts, the rule Alerts read too) is not used: the period is left out (a gap), so no Heads-up rests on a value not approved yet.
  const [all, waiting] = await Promise.all([
    getLatestObservations(ws, { from: shiftPeriod(day, "year", -10) }),
    // Page by page: a hosted database answers at most 1,000 rows a request, and a Workspace may have more periods waiting.
    allRows<{ metric_id: number; period_start: string }>((from, to) => db().from("period_states").select("metric_id, period_start").eq("workspace_id", ws).in("state", [...NOT_FINAL_STATES]).order("metric_id").order("period_start").range(from, to)),
  ]);
  const unapproved = new Set(waiting.map((w) => `${w.metric_id}:${w.period_start}`));
  const observations = all.filter((o) => !unapproved.has(`${o.metric_id}:${o.period_start}`));
  const series = buildSeries(metrics, observations);
  const resolve = resolverFrom(metrics, series);
  const chosen = pick(metrics);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const inputs = ingredients(chosen);
  // How recently a Metric was updated: when its latest value was recorded, a Derived Metric by its ingredients among `chosen`; this
  // decides which 200 Metrics a set with more is scanned for.
  const recorded = new Map<number, string>();
  for (const o of observations) if (!(recorded.get(o.metric_id)! >= o.created_at)) recorded.set(o.metric_id, o.created_at);
  const updated = (m: Metric) => [m.id, ...inputs.get(m.id)!].reduce((top, id) => ((recorded.get(id) ?? "") > top ? recorded.get(id)! : top), "");
  const withValues = chosen.filter((m) => (series[m.slug]?.length ?? 0) > 0).map((m) => ({ id: m.id, period: m.period as Span, latest: updated(m) }));
  const looked = capMetrics(withValues);
  // Each Metric's levels on a Common Period: only periods that are over (a period still running compares part with whole).
  const levels = (id: number, span: Span): Point[] | null => {
    const s = seriesBy(byId.get(id)!, resolve, span, { yearStart, today: day });
    // Only periods that are over: in a Metric's own Period nothing is flagged to date, so the running period is cut here.
    return s.ok ? s.points.filter((p) => !p.toDate && p.period < periodStart(day, span, yearStart)).map((p) => ({ period: p.period, value: p.value })) : null;
  };
  return { rows: scanPairs(looked, levels, relatedOver(chosen), day, yearStart), metrics: looked.length, capped: withValues.length > looked.length };
}

/** The Metrics in use: not archived, and showing values (a Derived Metric whose inputs its owner may no longer share shows none). */
const inUse = (metrics: Metric[]) => metrics.filter((m) => !m.archived_at && !m.inputs_withheld);

/** Whether two of `chosen` are related: one is worked out from the other (directly or through others of `chosen`), or both from the
 * same Metric of `chosen`. A Metric outside `chosen` is not followed, so a person's pairs never depend on one they may not see. */
function relatedAmong(chosen: Metric[]): (a: number, b: number) => boolean {
  const inputs = ingredients(chosen);
  const byId = new Map(chosen.map((m) => [m.id, m]));
  const share = (x: Set<number>, y: Set<number>) => [...x].some((id) => y.has(id));
  // A viewer of a Derived Metric already sees its formula, so two of them that name the same Metric in their formulas (even one the
  // viewer may not see: its slug is in the formula text they read) are related. Only the formulas' own words are compared: no
  // chain through a Metric outside `chosen` is followed, and nothing about such a Metric is looked at.
  const named = new Map(chosen.map((m) => [m.id, new Set(m.formula ? formulaInputs(m.formula) : [])]));
  const sameWord = (a: number, b: number) => [...named.get(a)!].some((slug) => named.get(b)!.has(slug));
  return (a, b) => builtFrom(byId.get(a)!, byId.get(b)!) || inputs.get(a)!.has(b) || inputs.get(b)!.has(a) || share(inputs.get(a)!, inputs.get(b)!) || sameWord(a, b);
}

/** Scans one Workspace and replaces its rows of the pair table: the 200 most recently updated Metrics in use and every pair that
 * may be compared (the same Period, or one step apart). Which pairs are related is NOT decided here (it is decided per person, over
 * the Metrics they may see, when the rows are read), so the rows depend on no one's sight. `today` is for tests. The caller has
 * claimed the scan. Reads and writes only this Workspace. */
export async function scanWorkspace(ws: string, scannedAt: string, today?: string, steps: { afterFlag?: () => Promise<void>; afterRows?: () => Promise<void> } = {}): Promise<ScanResult> {
  const day = today ?? (await workspaceToday(ws));
  const { rows, metrics, capped } = await scanSubset(ws, day, inUse, () => () => false);
  const record = async (flag: boolean) => {
    const { error } = await db().from("heads_up_scans").upsert({ workspace_id: ws, metrics, pairs: rows.length, capped: flag }, { onConflict: "workspace_id" });
    if (error) throw new Error("The scan could not be recorded.");
  };
  // The flag only ever gets STRICTER while rows are being replaced: a reader takes the table path only where the flag says the rows
  // were not chosen by the cap, so while the flag and the rows can disagree it must say "capped" (the safe path, a scan of the
  // person's own Metrics). It is made stricter first (old OR new), and the final value, false included, is written only after the
  // rows are all written and the stale ones deleted.
  const { data: before, error: readError } = await db().from("heads_up_scans").select("capped").eq("workspace_id", ws).maybeSingle();
  if (readError) throw new Error("The scan could not be recorded.");
  await record(Boolean(before?.capped) || capped);
  await steps.afterFlag?.();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db().from("heads_up_pairs").upsert(rows.slice(i, i + CHUNK).map((r) => rowToDb(ws, r, scannedAt)), { onConflict: "workspace_id,metric_a,metric_b" });
    if (error) throw new Error("The pair table could not be written.");
  }
  // What this scan did not refresh is gone: a pair that can no longer be compared, or a Metric no longer in use.
  const { error: staleError } = await db().from("heads_up_pairs").delete().eq("workspace_id", ws).lt("scanned_at", scannedAt);
  if (staleError) throw new Error("The pair table could not be cleaned.");
  await steps.afterRows?.();
  await record(capped);
  return { metrics, pairs: rows.length, capped };
}

/** The Heads-up job (the route is the job secret's): for every Workspace but the demo whose scan is not recent, scans it; then
 * drops pair-table rows older than 90 days. Answers counts only; a Workspace whose scan fails is counted and the rest go on. */
export async function headsUpJob(opts: { today?: string; budgetMs?: number } = {}): Promise<HeadsUpJobResult> {
  const result: HeadsUpJobResult = { workspaces: 0, scanned: 0, skipped: 0, failed: 0, pairs: 0, expired: 0, left: 0, told: 0 };
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
      // Whoever asked for Heads-ups by message is told of what the new scan found (their own, within their week's cap).
      try {
        result.told += (await deliverHeadsUps(id, { budgetMs: Math.max(0, (opts.budgetMs ?? MAX_CALL_MS) - (Date.now() - started)) })).sent;
      } catch {
        log("a Workspace's messages failed");
      }
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

// A person's own scan, from what is kept, or one scan started within their budget (at most a few at once in this process). Over the
// budget with nothing kept for exactly the Metrics they see now, it says so and tells nothing: it never answers from a result
// worked out over other Metrics.
async function ownScan(ws: string, person: string, mine: Metric[], now: number): Promise<PairRow[]> {
  const who = `${ws}:${person}`;
  const ids = mine.map((m) => m.id);
  const kept = budget.fresh(who, ids, now);
  if (kept) return kept;
  const idsKey = [...ids].sort((a, b) => a - b).join(",");
  const running = underway.get(who);
  if (running && running.ids === idsKey) return running.rows;
  if (!budget.mayScan(who, now)) {
    const old = budget.stale(who, ids);
    if (old) return old;
    throw new Error("Heads-ups could not be read. Try again in a moment.");
  }
  budget.scanned(who, now);
  const rows = oneAtATime(async () => (await scanSubset(ws, await workspaceToday(ws), () => mine, () => () => false)).rows).then((r) => {
    budget.keep(who, ids, r, now);
    return r;
  });
  underway.set(who, { ids: idsKey, rows });
  // Whatever happens, the scan is no longer under way when it is over, so the next call starts its own.
  const done = () => { if (underway.get(who)?.rows === rows) underway.delete(who); };
  rows.then(done, done);
  return rows;
}

/** The Heads-ups a person may be told, strongest first: only about Metrics they may see that are in use, from pair rows for those
 * Metrics alone, and nothing that depends on a Metric they may not see: the cap of 200 Metrics, the pairs left out as related and
 * the count of pairs for the correction are all worked out over the Metrics they see. Where the Workspace's own scan was capped
 * (it has more than 200 Metrics in use, which a person may not see), their pairs are scanned now over their own Metrics, so the
 * cap cannot have left out a pair of theirs for the sake of one of someone else's. A person who sees fewer than two Metrics gets
 * none. Takes the Actor first; an Access Key is not an Actor here. */
export async function listHeadsUps(actor: Actor, opts: { now?: number } = {}): Promise<HeadsUp[]> {
  return (await listHeadsUpsWith(actor, opts)).heads;
}

/** The Metric a Heads-up is about, as its person may be shown it. */
export type HeadsUpMetric = { id: number; name: string; slug: string };

/** `listHeadsUps` and, with it, the name and slug of every Metric the person sees and that is in use (what a list needs to name
 * the Metrics of a Heads-up without reading them twice). Only Metrics the person may see are in `metrics`. */
export async function listHeadsUpsWith(actor: Actor, opts: { now?: number } = {}): Promise<{ heads: HeadsUp[]; metrics: Map<number, HeadsUpMetric> }> {
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, actor.personId, metrics);
  const mine = inUse(metrics.filter((m) => seen.has(m.id)));
  if (mine.length < 2) return { heads: [], metrics: new Map() };
  const names = new Map(mine.map((m) => [m.id, m.name]));
  // One statement answers both whether the table's rows were chosen by the cap and, only if not, the rows: they are read from one
  // snapshot, so a scan running meanwhile cannot make them disagree (and while it runs the flag only gets stricter).
  const { data: answer, error: readError } = await db().rpc("visible_heads_up_pairs", { p_ws: ws, p_ids: mine.map((m) => m.id) });
  // Fail closed: without the answer, nothing is told.
  if (readError || !answer) throw new Error("Heads-ups could not be read. Try again in a moment.");
  const { capped, rows: stored } = answer as { capped: boolean; rows: Record<string, unknown>[] };
  const rows: PairRow[] = capped ? await ownScan(ws, actor.personId, mine, opts.now ?? Date.now()) : stored.map(rowFromDb);
  // Pairs one of whose Metrics is worked out from the other, or both from the same, are left out: over the Metrics they see.
  const related = relatedAmong(mine);
  const kept = rows.filter((r) => names.has(r.a) && names.has(r.b) && !related(r.a, r.b));
  const heads = headsUpsFrom(kept, names, { style: await numberStyleOf(ws), yearStart: await yearStartOf(ws) });
  return { heads, metrics: new Map(mine.map((m) => [m.id, { id: m.id, name: m.name, slug: m.slug }])) };
}
