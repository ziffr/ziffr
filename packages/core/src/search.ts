// Search (ticket #412; GLOSSARY: Metric, Archived Metric, Period Record, Dashboard, Deck): finds Metrics, dashboards and
// decks by name, and "Metric + period" for words such as "churn march 2026", which lead to the Period Record.
// Security: everything is chosen from what the person may see (visibleMetricIds, visibleDashboards, visibleDecks) in
// their own Workspace; a name they may not see is never compared, so it cannot be found by guessing either.
// Metric names may be sealed (spec 0028, step 2): this searches the visible list in the app, after the core has opened
// the names, never in the database, so it works the same sealed or plain.
import { format } from "date-fns";
import { assertScope, type Actor, type KeyActor } from "./actor";
import { visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { yearStartOf } from "./fiscal-year";
import { periodLabel, periodStart, type Span, type YearStart } from "./periods";
import { nameScore, parseSearchQuery, type SearchQuery } from "./search-query";
import { answerReadingOf } from "./workspace-settings";
import { getMetrics } from "./workspace-data";
import type { Metric } from "./types";

/** One thing found. A `period` result is one Metric's value for one period: `period` is its first day, `label` its
 * name ("March 2026"); it leads to the Period Record. */
export type SearchResult =
  | { kind: "metric"; slug: string; name: string; archived: boolean }
  | { kind: "period"; slug: string; name: string; archived: boolean; period: string; label: string }
  | { kind: "dashboard"; id: number; name: string }
  | { kind: "deck"; id: number; name: string };

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

/** Finds Metrics, dashboards and decks the person may see by name, and "Metric + period" when the words include a
 * period; at most MAX_BY_KIND of each, the period results first. */
export async function search(actor: Actor, query: unknown): Promise<SearchResult[]> {
  const ws = actor.workspaceId;
  const [metrics, yearStart, reading] = await Promise.all([getMetrics(ws), yearStartOf(ws), answerReadingOf(ws)]);
  const q = parseSearchQuery(query, format(new Date(), "yyyy-MM-dd"), yearStart, reading.languages, reading.monthFirst);
  if (!q.all.length) return [];
  const [visible, dashboards, decks] = await Promise.all([visibleMetricIds(ws, actor.personId, metrics), visibleDashboards(ws, actor.personId), visibleDecks(ws, actor.personId)]);
  return [
    ...resultsFor(metrics.filter((m) => visible.has(m.id)), q, yearStart, new Date()),
    ...dashboards.filter((d) => nameScore(d.name, q.all) !== null).sort((a, b) => nameScore(a.name, q.all)! - nameScore(b.name, q.all)! || a.name.localeCompare(b.name)).slice(0, MAX_BY_KIND).map((d) => ({ kind: "dashboard" as const, id: d.id, name: d.name })),
    ...decks.filter((d) => nameScore(d.name, q.all) !== null).sort((a, b) => nameScore(a.name, q.all)! - nameScore(b.name, q.all)! || a.name.localeCompare(b.name)).slice(0, MAX_BY_KIND).map((d) => ({ kind: "deck" as const, id: d.id, name: d.name })),
  ];
}

/** The Metric and "Metric + period" results among Metrics the person sees. Not past: a period that has not begun. */
function resultsFor(visible: readonly Metric[], q: SearchQuery, yearStart: YearStart, now: Date): SearchResult[] {
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
  return [...periodResults.slice(0, MAX_PERIOD_RESULTS), ...plain.slice(0, MAX_BY_KIND)];
}

/** What a program gets from `find`: a Metric, or Metric + period (`period` its first day); the slug and period are
 * what get_metric and the Period Record take. */
export type Found = { slug: string; name: string; archived: boolean; period: string | null; period_label: string | null };

/** The Metrics and Metric + period a key's creator may see that fit the words, period results first. */
export async function findMetrics(actor: Actor | KeyActor, query: unknown): Promise<Found[]> {
  assertScope(actor, "metrics:read");
  const ws = actor.workspaceId;
  const [metrics, yearStart, reading] = await Promise.all([getMetrics(ws), yearStartOf(ws), answerReadingOf(ws)]);
  const now = new Date();
  const q = parseSearchQuery(query, format(now, "yyyy-MM-dd"), yearStart, reading.languages, reading.monthFirst);
  if (!q.all.length) return [];
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  return resultsFor(metrics.filter((m) => visible.has(m.id)), q, yearStart, now).flatMap((r): Found[] =>
    r.kind === "period" ? [{ slug: r.slug, name: r.name, archived: r.archived, period: r.period, period_label: r.label }]
      : r.kind === "metric" ? [{ slug: r.slug, name: r.name, archived: r.archived, period: null, period_label: null }] : []);
}
