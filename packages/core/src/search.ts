// Search (ticket #412; GLOSSARY: Metric, Archived Metric, Period Record, Dashboard, Deck): finds Metrics, dashboards and
// decks by name, and "Metric + period" for words such as "churn march 2026", which lead to the Period Record.
// Security: everything is chosen from what the person may see (visibleMetricIds, visibleDashboards, visibleDecks) in
// their own Workspace; a name they may not see is never compared, so it cannot be found by guessing either.
// Tags (spec 0038, GLOSSARY: Tag) come only from tag-sight.ts, so a Tag is found only through a Metric the person may see:
// a word used only on hidden Metrics answers exactly as a word nobody uses.
// Metric names may be sealed (spec 0028, step 2): this searches the visible list in the app, after the core has opened
// the names, never in the database, so it works the same sealed or plain.
import { format } from "date-fns";
import { assertScope, type Actor, type KeyActor } from "./actor";
import { getGroups, visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { yearStartOf } from "./fiscal-year";
import { periodLabel, periodStart, type Span, type YearStart } from "./periods";
import { nameScore, parseSearchQuery, recordTerms, type SearchQuery } from "./search-query";
import { db } from "./db";
import { tagSight } from "./tag-sight";
import { tagKey } from "./tag-names";
import { peopleIn } from "./submissions";
import { answerReadingOf } from "./workspace-settings";
import { getMetrics } from "./workspace-data";
import { tellApart } from "./metric-names";
import type { Metric } from "./types";

/** One thing found. A `period` result is one Metric's value for one period: `period` is its first day, `label` its
 * name ("March 2026"); it leads to the Period Record. */
export type SearchResult =
  // `tag` is the Tag that matched, when the Metric was found by one of its Tags and not by its name.
  | { kind: "metric"; slug: string; name: string; archived: boolean; hint?: string; tag?: string }
  // A Tag the person sees (through a Metric they may see) that the words name; `metrics` counts those Metrics.
  | { kind: "tag"; name: string; metrics: number }
  | { kind: "period"; slug: string; name: string; archived: boolean; period: string; label: string; hint?: string }
  | { kind: "dashboard"; id: number; name: string }
  | { kind: "deck"; id: number; name: string }
  | { kind: "workflow"; id: number; name: string }
  | { kind: "person"; id: string; name: string; contact: boolean; you: boolean }
  | { kind: "group"; id: number; name: string }
  // The person's own form for a Metric they submit: `code` is their own link's code, shown to nobody else.
  | { kind: "record"; slug: string; name: string; code: string };

/** At most this many of each kind are returned. */
export const MAX_BY_KIND = 8;
const MAX_PERIOD_RESULTS = 6;

const RANK: Record<Span, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };

/** The period of a Metric that words naming `span` from `start` mean, or null when they name none of its own: the
 * same span is that period; a shorter one ("5 March" for a monthly Metric) is the period holding it; a longer one
 * ("2026" for a monthly Metric) or a week for a longer Metric is not one value, so none. */
function periodFor(metric: Metric, span: Span, start: string, yearStart: YearStart): string | null {
  if (span === metric.period) return periodStart(start, metric.period, yearStart);
  if (RANK[span] < RANK[metric.period] && span !== "week") return periodStart(start, metric.period, yearStart);
  return null;
}

/** The Metrics whose names (or slugs) fit the words, best first, those in use before Archived Metrics. */
function matching(metrics: readonly Metric[], terms: readonly string[]): Metric[] {
  const scored: { m: Metric; score: number }[] = [];
  for (const m of metrics) {
    const score = nameScore(m.name, terms) ?? nameScore(m.slug, terms);
    if (score !== null) scored.push({ m, score });
  }
  return scored.sort((a, b) => Number(Boolean(a.m.archived_at)) - Number(Boolean(b.m.archived_at)) || a.score - b.score || a.m.name.localeCompare(b.m.name)).map((s) => s.m);
}

/** Finds Metrics, dashboards, decks, Workflows, people and Groups the person may see by name, "Metric + period" when
 * the words include a period, and the forms of the Metrics they submit; at most MAX_BY_KIND of each, the period
 * results first. A Guest sees only themselves, their own Groups and the Workflows of Metrics shared with them. */
export async function search(actor: Actor, query: unknown): Promise<SearchResult[]> {
  const ws = actor.workspaceId;
  const [metrics, yearStart, reading] = await Promise.all([getMetrics(ws), yearStartOf(ws), answerReadingOf(ws)]);
  const q = parseSearchQuery(query, format(new Date(), "yyyy-MM-dd"), yearStart, reading.languages, reading.monthFirst);
  if (!q.all.length) return [];
  const [visible, dashboards, decks] = await Promise.all([visibleMetricIds(ws, actor.personId, metrics), visibleDashboards(ws, actor.personId), visibleDecks(ws, actor.personId)]);
  const sight = await tagSight(actor);
  const [workflows, people, groups, records] = await Promise.all([workflowResults(actor, visible, q.all), peopleResults(actor, q.all), groupResults(actor, q.all), recordResults(actor, metrics, visible, q.all)]);
  const seen = metrics.filter((m) => visible.has(m.id));
  // Same-named Metrics among those the person sees (never one they may not) get a note that tells them apart. A Guest
  // sees no other people, so their notes name the period and unit only.
  const owners = actor.role === "guest" ? [] : await peopleIn(ws);
  const notes = tellApart(seen, (id) => owners.find((p) => p.id === id)?.name.split(" ")[0] ?? "");
  const noteFor = new Map(seen.flatMap((m) => (notes.has(m.id) ? [[m.slug, notes.get(m.id)!] as const] : [])));
  const withNote = (r: SearchResult): SearchResult => ((r.kind === "metric" || r.kind === "period") && noteFor.has(r.slug) ? { ...r, hint: noteFor.get(r.slug) } : r);
  return [
    ...tagResults(sight.tags, q.all),
    ...resultsFor(seen, q, yearStart, new Date(), sight.namesByMetric).map(withNote),
    ...ranked(dashboards, q.all).map((d) => ({ kind: "dashboard" as const, id: d.id, name: d.name })),
    ...ranked(decks, q.all).map((d) => ({ kind: "deck" as const, id: d.id, name: d.name })),
    ...workflows, ...people, ...groups, ...records,
  ];
}

/** The Tags (all of them ones the person sees) whose name equals the words, or one of the words, ignoring case. */
function tagResults(tags: readonly { name: string; metrics: number }[], all: readonly string[]): SearchResult[] {
  const wanted = new Set([tagKey(all.join(" ")), ...all.map(tagKey)]);
  return tags.filter((t) => wanted.has(tagKey(t.name))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_BY_KIND).map((t) => ({ kind: "tag" as const, name: t.name, metrics: t.metrics }));
}

/** The things whose names fit the words, best first, at most MAX_BY_KIND. */
function ranked<T extends { name: string }>(items: readonly T[], terms: readonly string[]): T[] {
  return items.filter((d) => nameScore(d.name, terms) !== null).sort((a, b) => nameScore(a.name, terms)! - nameScore(b.name, terms)! || a.name.localeCompare(b.name)).slice(0, MAX_BY_KIND);
}

/** Workflows by name. A Guest gets only those of the Metrics shared with them (stricter than the Workflows page, which is being tightened to match). */
async function workflowResults(actor: Actor, visible: ReadonlySet<number>, terms: readonly string[]): Promise<SearchResult[]> {
  const [{ data: rows }, { data: assigned }] = await Promise.all([
    db().from("workflows").select("id, name").eq("workspace_id", actor.workspaceId),
    actor.role === "guest" ? db().from("metrics").select("id, workflow_id").eq("workspace_id", actor.workspaceId) : Promise.resolve({ data: null }),
  ]);
  const mine = actor.role === "guest" ? new Set((assigned ?? []).filter((m) => visible.has(m.id as number) && m.workflow_id !== null).map((m) => m.workflow_id as number)) : null;
  return ranked((rows ?? []).map((w) => ({ id: w.id as number, name: String(w.name) })).filter((w) => !mine || mine.has(w.id)), terms).map((w) => ({ kind: "workflow" as const, id: w.id, name: w.name }));
}

/** People and Contacts by name; a Guest finds only themselves (a Guest sees only what is shared with them). Names only,
 * never an email or other detail. */
async function peopleResults(actor: Actor, terms: readonly string[]): Promise<SearchResult[]> {
  const people = (await peopleIn(actor.workspaceId)).filter((p) => actor.role !== "guest" || p.id === actor.personId);
  return ranked(people, terms).map((p) => ({ kind: "person" as const, id: p.id, name: p.name, contact: Boolean(p.contact), you: p.id === actor.personId }));
}

/** Groups by name; a Guest finds only the Groups they are in. */
async function groupResults(actor: Actor, terms: readonly string[]): Promise<SearchResult[]> {
  const groups = (await getGroups(actor.workspaceId)).filter((g) => actor.role !== "guest" || g.members.includes(actor.personId));
  return ranked(groups, terms).map((g) => ({ kind: "group" as const, id: g.id, name: g.name }));
}

/** "Record a value for <Metric>": the Metrics the person submits (and sees, not archived) whose names fit the words. */
async function recordResults(actor: Actor, metrics: readonly Metric[], visible: ReadonlySet<number>, all: readonly string[]): Promise<SearchResult[]> {
  const { asked, terms } = recordTerms(all);
  if (!asked && !terms.length) return [];
  const { data } = await db().from("tokens").select("code, metric_id").eq("workspace_id", actor.workspaceId).eq("submitter_id", actor.personId).is("stands_in_for", null);
  const mine = new Map((data ?? []).map((t) => [t.metric_id as number, String(t.code)]));
  const own = metrics.filter((m) => mine.has(m.id) && visible.has(m.id) && !m.archived_at);
  const chosen = terms.length ? ranked(own, terms) : [...own].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_BY_KIND);
  return chosen.map((m) => ({ kind: "record" as const, slug: m.slug, name: m.name, code: mine.get(m.id)! }));
}

/** The Metric and "Metric + period" results among Metrics the person sees. Not past: a period that has not begun. */
function resultsFor(visible: readonly Metric[], q: SearchQuery, yearStart: YearStart, now: Date, tagNames: ReadonlyMap<number, readonly string[]> = new Map()): SearchResult[] {
  const today = format(now, "yyyy-MM-dd");
  const byName = q.name.length ? matching(visible, q.name) : [];
  const periodResults: SearchResult[] = [];
  for (const m of byName) {
    for (const p of q.periods) {
      const period = periodFor(m, p.span, p.start, yearStart);
      if (period === null || period > periodStart(today, m.period, yearStart)) continue;
      if (periodResults.some((r) => r.kind === "period" && r.slug === m.slug && r.period === period)) continue;
      periodResults.push({ kind: "period", slug: m.slug, name: m.name, archived: Boolean(m.archived_at), period, label: periodLabel(period, m.period, yearStart) });
    }
    if (periodResults.length >= MAX_PERIOD_RESULTS) break;
  }
  const seen = new Set<string>();
  const plain: SearchResult[] = [];
  for (const m of [...byName, ...matching(visible, q.all)]) {
    if (seen.has(m.slug)) continue;
    seen.add(m.slug);
    plain.push({ kind: "metric", slug: m.slug, name: m.name, archived: Boolean(m.archived_at) });
  }
  // After the name matches: Metrics whose Tags fit the words, with the Tag that matched. `tagNames` holds only Tags of
  // Metrics the person sees, so nothing hidden can match.
  for (const { m, tag } of matchingByTag(visible, q.all, tagNames)) {
    if (seen.has(m.slug)) continue;
    seen.add(m.slug);
    plain.push({ kind: "metric", slug: m.slug, name: m.name, archived: Boolean(m.archived_at), tag });
  }
  return [...periodResults.slice(0, MAX_PERIOD_RESULTS), ...plain.slice(0, MAX_BY_KIND)];
}

/** The Metrics one of whose Tags fits the words, each with its best-fitting Tag, those in use before Archived Metrics. */
function matchingByTag(metrics: readonly Metric[], terms: readonly string[], tagNames: ReadonlyMap<number, readonly string[]>): { m: Metric; tag: string }[] {
  const scored: { m: Metric; tag: string; score: number }[] = [];
  for (const m of metrics) {
    let best: { tag: string; score: number } | null = null;
    for (const tag of tagNames.get(m.id) ?? []) {
      const score = nameScore(tag, terms);
      if (score !== null && (!best || score < best.score)) best = { tag, score };
    }
    if (best) scored.push({ m, ...best });
  }
  return scored.sort((a, b) => Number(Boolean(a.m.archived_at)) - Number(Boolean(b.m.archived_at)) || a.score - b.score || a.m.name.localeCompare(b.m.name));
}

/** What a program gets from `find`: a Metric, or Metric + period (`period` its first day); the slug and period are
 * what get_metric and the Period Record take. */
export type Found = { slug: string; name: string; archived: boolean; period: string | null; period_label: string | null; matched_by?: "tag" };

/** The Metrics and Metric + period a key's creator may see that fit the words, period results first, then Metrics found
 * by a Tag (`matched_by: "tag"`). */
export async function findMetrics(actor: Actor | KeyActor, query: unknown): Promise<Found[]> {
  assertScope(actor, "metrics:read");
  const ws = actor.workspaceId;
  const [metrics, yearStart, reading] = await Promise.all([getMetrics(ws), yearStartOf(ws), answerReadingOf(ws)]);
  const now = new Date();
  const q = parseSearchQuery(query, format(now, "yyyy-MM-dd"), yearStart, reading.languages, reading.monthFirst);
  if (!q.all.length) return [];
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  const { namesByMetric } = await tagSight({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });
  return resultsFor(metrics.filter((m) => visible.has(m.id)), q, yearStart, now, namesByMetric).flatMap((r): Found[] =>
    r.kind === "period" ? [{ slug: r.slug, name: r.name, archived: r.archived, period: r.period, period_label: r.label }]
      : r.kind === "metric" ? [{ slug: r.slug, name: r.name, archived: r.archived, period: null, period_label: null, ...(r.tag ? { matched_by: "tag" as const } : {}) }] : []);
}
