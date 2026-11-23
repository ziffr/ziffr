// The Usage page's numbers (GLOSSARY: Usage, View Count; spec 0031, ticket #364): what a Workspace's Owners and
// Admins can tidy: dashboards, decks and Metrics not opened for 90 days, Metrics without values, Submitters without
// values and what is looked at most, with the Metrics that are safe to archive. Counts only, never who looked.
// Only what the actor sees is listed; nothing is called unused before 90 days of counting.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { archiveMetric, archivableMetric, restoreMetric } from "./archived-metrics";
import { DEMO_WORKSPACE_ID } from "./team";
import { refuseInDemo } from "./demo";
import { inUse } from "./metric-row";
import { formulaInputs } from "./formula";
import { keptFrom, type Retention } from "./retention-rules";
import { storedPending, storedRetention, SUGGEST_KEEP_MONTHS, SUGGEST_MIN_VALUES, suggestedRetention } from "./retention-words";
import { effectiveLimit } from "./limits";
import { workspaceToday } from "./retention-setting";
import { peopleIn } from "./submissions";
import { allRows, getMetrics, getRecentObservations } from "./workspace-data";
import { widgetMetricIds } from "./widget-metrics";
import { deckMetricIds } from "./visibility";
import type { Metric, Period, WidgetSettings } from "./types";

/** Days without being opened, or without values, before something is listed: the default; a Workspace may set 30 to 365 (limits.ts). */
export const UNUSED_DAYS = 90;
/** Days the "most looked at" lists count. */
export const LOOKED_DAYS = 30;

/** A thing on one of the lists, with the reason beside its name. */
export type UsageItem = { id: number; name: string; why: string; slug?: string };
/** A Submitter who has sent no value, with the Metrics they were asked for and who owns each. */
export type IdleSubmitter = { id: string; name: string; kind: "person" | "contact" | "feed"; metrics: { id: number; name: string; slug: string; owner: string }[] };
/** A Metric the page does not suggest archiving, and why. */
export type KeptMetric = { id: number; name: string; because: string };

/** A Metric that holds many old values and nobody opened: the Retention it could have, and how many values lie past it.
 * Counts only; the page opens the Metric's Retention form with this setting and its preview, and sets nothing. */
export type RetentionSuggestion = { id: number; name: string; slug: string; values: number; suggestion: Retention; why: string };

/** What the Usage page shows an Owner or Admin. */
export type UsageReport = {
  /** The first day Ziffr counted in this Workspace (yyyy-mm-dd), or null while nothing is counted. */
  countingSince: string | null;
  /** The days without a look or a value after which something is listed, as this Workspace sets them. */
  unusedDays: number;
  /** When the lists of what is not opened fill in (counting since + the unused days), or null when they have. */
  fillsInOn: string | null;
  notOpened: { dashboards: UsageItem[]; decks: UsageItem[]; metrics: UsageItem[] };
  /** Metrics nobody opened that only a program reads: kept apart, never suggested. */
  readByProgram: UsageItem[];
  noValues: UsageItem[];
  projectionOnly: UsageItem[];
  submitters: IdleSubmitter[];
  mostLooked: { dashboards: { id: number; name: string; views: number }[]; metrics: { id: number; name: string; slug: string; views: number }[] };
  suggested: UsageItem[];
  kept: KeptMetric[];
  /** Metrics that could keep less: many old values, not opened for 90 days, no Retention yet (spec 0033). */
  retentionSuggestions: RetentionSuggestion[];
};

const DAY = 86_400_000;
/** The cadence of a Metric in days, for "the last two periods". */
const CADENCE: Record<Period, number> = { day: 1, week: 7, month: 31, quarter: 92, year: 366 };
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const words = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** Widget templates that compare or analyse: a Metric shown by one is kept from the suggestions. */
const ANALYSING = new Set(["forecast", "correlation", "matrix", "drivers", "scoreboard"]);

/** Owners and Admins only, never with a key, never in the demo (which counts nothing). */
function assertMay(actor: Actor): void {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin") || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("Only Owners and Admins see Usage.");
}

/** The Usage page's lists for the actor's Workspace, or Forbidden. Reads only dashboards, decks and Metrics the
 * actor sees; what hidden dashboards show still counts as "opened", so something in use is never called unused. */
export async function workspaceUsage(actor: Actor, now: Date = new Date()): Promise<UsageReport> {
  assertMay(actor);
  const ws = actor.workspaceId;
  const today = isoDay(now.getTime());
  const unusedDays = await effectiveLimit("unusedDays", ws);
  const cutoff = isoDay(now.getTime() - unusedDays * DAY);
  const looked30 = isoDay(now.getTime() - LOOKED_DAYS * DAY);
  const [allMetrics, dashboards, decks, { data: wsRow }] = await Promise.all([
    getMetrics(ws), visibleDashboards(ws, actor.personId), visibleDecks(ws, actor.personId),
    db().from("workspaces").select("usage_since").eq("id", ws).maybeSingle(),
  ]);
  const seen = await visibleMetricIds(ws, actor.personId, allMetrics);
  const countingSince = (wsRow?.usage_since as string | null) ?? null;
  const ready = countingSince !== null && today >= isoDay(Date.parse(`${countingSince}T00:00:00Z`) + unusedDays * DAY);
  const fillsInOn = countingSince && !ready ? isoDay(Date.parse(`${countingSince}T00:00:00Z`) + unusedDays * DAY) : null;

  // Every dashboard and deck of the Workspace (not only the visible ones) with its widgets: what a hidden dashboard
  // shows is still looked at, and only ever makes a Metric look more used.
  const [counts, allDash, allDecks, widgets, tokens] = await Promise.all([
    allRows<{ day: string; subject_kind: string; subject_id: number; n_app: number; n_link: number; n_api: number }>((from, to) =>
      db().from("view_counts").select("day, subject_kind, subject_id, n_app, n_link, n_api").eq("workspace_id", ws).gte("day", cutoff).order("day").order("subject_id").range(from, to)),
    allRows<{ id: number; name: string; created_at: string }>((from, to) => db().from("dashboards").select("id, name, created_at").eq("workspace_id", ws).order("id").range(from, to)),
    allRows<{ id: number; name: string; created_at: string; document: unknown }>((from, to) => db().from("decks").select("id, name, created_at, document").eq("workspace_id", ws).order("id").range(from, to)),
    allRows<{ dashboard_id: number; template: string; metric_ids: number[]; settings: WidgetSettings }>((from, to) =>
      db().from("widgets").select("dashboard_id, template, metric_ids, settings").eq("workspace_id", ws).not("dashboard_id", "is", null).order("id").range(from, to)),
    allRows<{ metric_id: number; submitter_id: string; stands_in_for: string | null; created_at: string }>((from, to) =>
      db().from("tokens").select("metric_id, submitter_id, stands_in_for, created_at").eq("workspace_id", ws).order("id").range(from, to)),
  ]);

  // Last day each subject was opened by a person (app or View Link), and the days programs read a Metric.
  const lastOpen = new Map<string, string>();
  const programReads = new Map<number, number>();
  const views30 = new Map<string, number>();
  for (const c of counts) {
    const key = `${c.subject_kind}:${c.subject_id}`;
    if (c.n_app + c.n_link > 0 && c.day > (lastOpen.get(key) ?? "")) lastOpen.set(key, c.day);
    if (c.subject_kind === "metric" && c.n_api > 0) programReads.set(c.subject_id, (programReads.get(c.subject_id) ?? 0) + c.n_api);
    if (c.day >= looked30) views30.set(key, (views30.get(key) ?? 0) + c.n_app + c.n_link);
  }

  // The latest day a Metric was looked at, through its own page or any dashboard or deck showing it now.
  const metricLooked = new Map<number, string>();
  const bump = (id: number, day: string | undefined) => { if (day && day > (metricLooked.get(id) ?? "")) metricLooked.set(id, day); };
  for (const m of allMetrics) bump(m.id, lastOpen.get(`metric:${m.id}`));
  const analysed = new Set<number>();
  for (const w of widgets) {
    const ids = widgetMetricIds(w.metric_ids ?? [], w.settings).filter(Number.isInteger);
    const day = lastOpen.get(`dashboard:${w.dashboard_id}`);
    for (const id of ids) {
      bump(id, day);
      if (ANALYSING.has(w.template) || (w.settings?.compare?.length ?? 0) > 0) analysed.add(id);
    }
  }
  for (const d of allDecks) for (const id of deckMetricIds(d.document).filter(Number.isInteger)) bump(id, lastOpen.get(`deck:${d.id}`));

  const old = (created: string) => created.slice(0, 10) <= cutoff;
  const dashById = new Map(allDash.map((d) => [d.id, d]));
  const deckById = new Map(allDecks.map((d) => [d.id, d]));

  const notOpened = { dashboards: [] as UsageItem[], decks: [] as UsageItem[], metrics: [] as UsageItem[] };
  const readByProgram: UsageItem[] = [];
  if (ready) {
    for (const d of dashboards) if (!lastOpen.has(`dashboard:${d.id}`) && old(dashById.get(d.id)?.created_at ?? today)) notOpened.dashboards.push({ id: d.id, name: d.name, why: `Not opened for ${unusedDays} days` });
    for (const d of decks) if (!lastOpen.has(`deck:${d.id}`) && old(deckById.get(d.id)?.created_at ?? today)) notOpened.decks.push({ id: d.id, name: d.name, why: `Not opened for ${unusedDays} days` });
  }

  const visible = inUse(allMetrics).filter((m) => seen.has(m.id));
  if (ready) {
    for (const m of visible) {
      if (metricLooked.has(m.id) || !old(m.created_at)) continue;
      const reads = programReads.get(m.id);
      if (reads) readByProgram.push({ id: m.id, name: m.name, slug: m.slug, why: `Read by a program ${reads} time${reads === 1 ? "" : "s"}` });
      else notOpened.metrics.push({ id: m.id, name: m.name, slug: m.slug, why: `Not opened for ${unusedDays} days` });
    }
  }

  // Metrics without values: own values only (a Derived Metric has none of its own), a Metric younger than the
  // limit is never listed.
  const own = visible.filter((m) => !m.formula);
  const latest = new Map<number, string>();
  if (own.length) for (const o of await getRecentObservations(ws, 1, own.map((m) => m.id))) {
    if (o.period_start > (latest.get(o.metric_id) ?? "")) latest.set(o.metric_id, o.period_start);
  }
  const projections = new Set<number>();
  if (own.length) for (const r of await allRows<{ metric_id: number }>((from, to) => db().from("series_values").select("metric_id").eq("workspace_id", ws).eq("kind", "projection").in("metric_id", own.map((m) => m.id)).order("id").range(from, to))) projections.add(r.metric_id);
  const noValues: UsageItem[] = [];
  const projectionOnly: UsageItem[] = [];
  for (const m of own) {
    const days = Math.max(unusedDays, 2 * CADENCE[m.period]);
    if (m.created_at.slice(0, 10) > isoDay(now.getTime() - days * DAY)) continue;
    const at = latest.get(m.id);
    if (at && at >= isoDay(now.getTime() - days * DAY)) continue;
    if (!at && projections.has(m.id)) projectionOnly.push({ id: m.id, name: m.name, slug: m.slug, why: "Only a Projection, no values" });
    else noValues.push({ id: m.id, name: m.name, slug: m.slug, why: at ? `No value since ${words(at)}` : "No value yet" });
  }

  // Submitters without values: assigned (their own Tokens, not Stand-in ones) for over 90 days and nothing recorded
  // for 90 days, by any Source and for any Metric.
  const visibleIds = new Set(visible.map((m) => m.id));
  const byMetric = new Map(allMetrics.map((m) => [m.id, m]));
  const assigned = new Map<string, { metricIds: Set<number>; since: string }>();
  for (const t of tokens) {
    if (t.stands_in_for || !visibleIds.has(t.metric_id)) continue;
    const a = assigned.get(t.submitter_id) ?? { metricIds: new Set<number>(), since: t.created_at };
    a.metricIds.add(t.metric_id);
    if (t.created_at < a.since) a.since = t.created_at;
    assigned.set(t.submitter_id, a);
  }
  const [people, { data: feedRows }] = await Promise.all([peopleIn(ws), db().from("feeds").select("person_id, name").eq("workspace_id", ws).is("deleted_at", null)]);
  const nameOf = new Map<string, { name: string; kind: IdleSubmitter["kind"] }>(people.map((p) => [p.id, { name: p.name, kind: p.contact ? "contact" : "person" }]));
  for (const f of feedRows ?? []) nameOf.set(f.person_id as string, { name: String(f.name), kind: "feed" });
  const idle: IdleSubmitter[] = [];
  const candidates = [...assigned].filter(([id, a]) => nameOf.has(id) && old(a.since));
  const recent = new Set<string>();
  for (let i = 0; i < candidates.length; i += 20) {
    await Promise.all(candidates.slice(i, i + 20).map(async ([id]) => {
      const { data } = await db().from("observations").select("id").eq("workspace_id", ws).eq("submitter_id", id).gte("created_at", `${cutoff}T00:00:00Z`).limit(1);
      if (data?.length) recent.add(id);
    }));
  }
  for (const [id, a] of candidates) {
    if (recent.has(id)) continue;
    const who = nameOf.get(id)!;
    const metrics = [...a.metricIds].sort((x, y) => x - y).map((mid) => ({ id: mid, name: byMetric.get(mid)!.name, slug: byMetric.get(mid)!.slug, owner: nameOf.get(byMetric.get(mid)!.owner_id)?.name ?? "Someone" }));
    idle.push({ id, name: who.name, kind: who.kind, metrics });
  }
  idle.sort((a, b) => a.name.localeCompare(b.name));

  // Most looked at, in 30 days, as numbers.
  const top = <T extends { id: number; name: string; slug?: string }>(rows: T[], kind: string) => rows
    .map((r) => ({ id: r.id, name: r.name, slug: r.slug ?? "", views: views30.get(`${kind}:${r.id}`) ?? 0 })).filter((r) => r.views > 0)
    .sort((a, b) => b.views - a.views || a.id - b.id).slice(0, 10);

  // Archive suggestions: only a Metric nobody opened, and only once 90 days were counted. Left out, with the
  // reason, are those still depended on.
  const inputs = new Set<number>();
  const bySlug = new Map(allMetrics.map((m) => [m.slug, m.id]));
  for (const m of inUse(allMetrics)) if (m.formula) for (const s of formulaInputs(m.formula)) { const id = bySlug.get(s); if (id !== undefined) inputs.add(id); }
  const withTargetSeries = new Set<number>();
  const unopened = notOpened.metrics.map((m) => m.id);
  if (unopened.length) for (const r of await allRows<{ metric_id: number }>((from, to) => db().from("series_values").select("metric_id").eq("workspace_id", ws).eq("kind", "target").in("metric_id", unopened).order("id").range(from, to))) withTargetSeries.add(r.metric_id);
  const noValueIds = new Set(noValues.map((m) => m.id));
  const suggested: UsageItem[] = [];
  const kept: KeptMetric[] = [];
  for (const item of notOpened.metrics) {
    const m = byMetric.get(item.id) as Metric;
    // Its own Target is named; what depends on it may be something the actor does not see, so that says only so.
    const because = m.target_min !== null || m.target_max !== null || withTargetSeries.has(m.id) ? "It has a Target"
      : inputs.has(m.id) || analysed.has(m.id) ? "Something still depends on it" : null;
    if (because) kept.push({ id: m.id, name: m.name, because });
    else suggested.push({ id: m.id, name: m.name, slug: m.slug, why: noValueIds.has(m.id) ? `Not opened for ${unusedDays} days and no recent values` : `Not opened for ${unusedDays} days` });
  }

  return {
    countingSince, unusedDays, fillsInOn, notOpened, readByProgram, noValues, projectionOnly, submitters: idle,
    mostLooked: { dashboards: top(dashboards, "dashboard"), metrics: top(visible, "metric") },
    suggested, kept, retentionSuggestions: await retentionSuggestions(ws, notOpened.metrics, byMetric, await workspaceToday(ws, now), unusedDays),
  };
}

/** The most Retention suggestions listed, and how many Metrics are counted at once. */
const MAX_RETENTION_SUGGESTIONS = 10;
const COUNT_AT_A_TIME = 10;

/** Which of the Metrics nobody opened could keep less: daily or weekly values that can be condensed, with no Retention in
 * force or waiting, holding at least a year of values older than the suggested keep time, most values first. `candidates`
 * are Metrics the actor sees (the caller filtered them); a program's reads keep a Metric off the list, as they do for
 * archiving. Reads counts only, never a value. */
async function retentionSuggestions(ws: string, candidates: UsageItem[], byMetric: Map<number, Metric>, today: string, unusedDays: number): Promise<RetentionSuggestion[]> {
  const fitting = candidates.flatMap((c) => {
    const m = byMetric.get(c.id);
    const suggestion = m && !m.archived_at ? suggestedRetention({ period: m.period, aggregation: m.aggregation, formula: m.formula }) : null;
    return m && suggestion ? [{ m, suggestion }] : [];
  });
  if (!fitting.length) return [];
  // The Retention columns are not part of a Metric (they say who confirmed what): read here, only to leave out Metrics that have one.
  const { data: rows } = await db().from("metrics").select("id, retention, retention_pending").eq("workspace_id", ws).in("id", fitting.map((f) => f.m.id));
  const set = new Set((rows ?? []).filter((r) => storedRetention(r.retention) || storedPending(r.retention_pending)).map((r) => r.id as number));
  const cutoff = keptFrom(today, SUGGEST_KEEP_MONTHS);
  const out: RetentionSuggestion[] = [];
  const open = fitting.filter((f) => !set.has(f.m.id));
  for (let i = 0; i < open.length; i += COUNT_AT_A_TIME) {
    await Promise.all(open.slice(i, i + COUNT_AT_A_TIME).map(async ({ m, suggestion }) => {
      const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", m.id).lt("period_start", cutoff);
      if ((count ?? 0) >= SUGGEST_MIN_VALUES) out.push({ id: m.id, name: m.name, slug: m.slug, values: count ?? 0, suggestion, why: `${(count ?? 0).toLocaleString("en-GB")} values older than ${SUGGEST_KEEP_MONTHS / 12} years, not opened for ${unusedDays} days` });
    }));
  }
  return out.sort((a, b) => b.values - a.values || a.id - b.id).slice(0, MAX_RETENTION_SUGGESTIONS);
}

/** Archives the Metrics the actor ticked, at most 200: every one must be one they see and may archive, or the
 * whole call is refused and nothing is archived; if one fails midway, those already archived are brought back. Each
 * goes through the single archive (and its Audit Log event). Returns how many were archived. */
export async function archiveMetrics(actor: Actor, ids: unknown): Promise<number> {
  // The demo says its one sentence, as every write there does.
  refuseInDemo(actor);
  assertMay(actor);
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((x) => Number.isInteger(x))) throw new Error("Tick between 1 and 200 Metrics.");
  const unique = [...new Set(ids as number[])];
  // One refused (gone, hidden, not yours to archive) refuses all, before anything changes.
  for (const id of unique) await archivableMetric(actor, id);
  const done: number[] = [];
  try {
    for (const id of unique) if ((await archiveMetric(actor, id)).archived) done.push(id);
  } catch (e) {
    let stuck = 0;
    for (const id of done) await restoreMetric(actor, id).catch(() => { stuck++; });
    // Said plainly when a Metric could not be brought back, so nobody believes nothing changed.
    if (stuck > 0) throw new Error(`Archiving stopped, and ${stuck} of the Metrics archived before could not be brought back: look under Archived on the Metrics page.`);
    throw e;
  }
  return done.length;
}
