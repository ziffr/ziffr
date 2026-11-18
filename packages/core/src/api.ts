// What a program reads and does through the API with an Access Key (spec 0002, GLOSSARY: Access Key). Each function
// takes a KeyActor (or a person's Actor, for tests and tools), checks its scope, and returns only what the key's
// creator sees, in plain shapes made for programs: no contact details, no internal rows.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { getGroups, visibleMetricIds } from "./access";
import { db } from "./db";
import { peopleIn } from "./submissions";
import { buildSeries, getBreakdowns, getLatestObservations, getMetrics, withInputs } from "./workspace-data";
import type { BreakdownRow, Metric } from "./types";

/** At most this many items in one page of a list. */
export const MAX_PAGE = 100;

/** One page of a list: the items, and where to continue after (null on the last page). */
export type Page<T, C = number> = { items: T[]; next: C | null };

/** A Metric as a program sees it in a list or on its own. */
export type ApiMetric = Pick<Metric, "slug" | "name" | "description" | "period" | "format" | "unit" | "unit_position" | "decimals" | "polarity" | "aggregation" | "target_min" | "target_max" | "attainment_method"> & { derived: boolean };

/** A Metric in the shape programs see it. */
export const toApi = (m: Metric): ApiMetric => ({
  slug: m.slug, name: m.name, description: m.description, period: m.period, format: m.format, unit: m.unit, unit_position: m.unit_position,
  decimals: m.decimals, polarity: m.polarity, aggregation: m.aggregation, target_min: m.target_min, target_max: m.target_max,
  attainment_method: m.attainment_method ?? null, derived: Boolean(m.formula),
});

/** The Metrics the key's creator sees, in a stable order (by id), one page after `after` (scope metrics:read). */
export async function listMetrics(actor: Actor | KeyActor, page: { after?: number | null; limit: number }): Promise<Page<ApiMetric>> {
  assertScope(actor, "metrics:read");
  const limit = clampLimit(page.limit);
  const after = Number.isInteger(page.after) ? (page.after as number) : 0;
  const metrics = await getMetrics(actor.workspaceId);
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const rest = metrics.filter((m) => visible.has(m.id) && m.id > after).sort((a, b) => a.id - b.id);
  const items = rest.slice(0, limit);
  return { items: items.map(toApi), next: rest.length > limit ? items[items.length - 1].id : null };
}

/** A period start as the database reads it: a real day, written YYYY-MM-DD. */
const isDay = (s: string | null | undefined): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

const clampLimit = (limit: number) => Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_PAGE);

/** The Metric with this slug if the key's creator sees it. A Metric of another workspace, a hidden one and a missing
 * one are all Forbidden, so a key cannot tell them apart. */
async function visibleMetric(actor: Actor | KeyActor, slug: string): Promise<{ metric: Metric; metrics: Metric[] }> {
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((m) => m.slug === slug);
  if (!metric || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(metric.id)) throw new Forbidden();
  return { metric, metrics };
}

/** One Metric's description (scope metrics:read). */
export async function getMetric(actor: Actor | KeyActor, slug: string): Promise<ApiMetric> {
  assertScope(actor, "metrics:read");
  return toApi((await visibleMetric(actor, String(slug))).metric);
}

/** Where a period's value stands: published as recorded, waiting for Approval, or locked (GLOSSARY: Approval, Lock). */
export type ValueState = "recorded" | "awaiting_approval" | "locked";

/** A Metric's value for one period as a program sees it: the plotted value (the latest when the Submission Rule keeps
 * both), who submitted it (a person's id, see listPeople; null for a Derived Metric or an import), and its Breakdown. */
export type ApiObservation = { period: string; value: number; state: ValueState; submitter: string | null; breakdown: BreakdownRow[] | null };

/** A Metric's values for periods from `from` to `to` (period starts, both included), oldest first, one page after the
 * period `after` (scope metrics:read). A Derived Metric's values are computed, as on its page in the app. */
export async function listObservations(actor: Actor | KeyActor, slug: string, range: { from?: string | null; to?: string | null; after?: string | null; limit: number }): Promise<Page<ApiObservation, string>> {
  assertScope(actor, "metrics:read");
  const { metric, metrics } = await visibleMetric(actor, String(slug));
  const ws = actor.workspaceId;
  // A Derived Metric needs its inputs' values to be computed; only its own values leave this function. Only the
  // latest value of each period is read, and only of the periods asked for when they are real days (the comparison
  // below stays, so a malformed bound filters as before instead of reaching the query).
  // A cursor (`after`) narrows the read too; it is exclusive, so the comparison below drops that period itself.
  const lower = [range.from, range.after].filter(isDay).sort().at(-1) ?? null;
  const window = { from: lower, to: isDay(range.to) ? range.to : null };
  const observations = await getLatestObservations(ws, { metricIds: withInputs(metrics, [metric.id]), ...window });
  const points = (buildSeries(metrics, observations)[metric.slug] ?? [])
    .filter((p) => (!range.from || p.period >= range.from) && (!range.to || p.period <= range.to) && (!range.after || p.period > range.after));
  const limit = clampLimit(range.limit);
  const page = points.slice(0, limit);
  if (!page.length) return { items: [], next: null };
  const own = observations.filter((o) => o.metric_id === metric.id);
  const [breakdowns, { data: states }] = await Promise.all([
    metric.formula ? Promise.resolve({} as Record<number, Record<string, BreakdownRow[]>>) : getBreakdowns(ws, [metric.id], { from: page[0].period, to: page[page.length - 1].period }),
    db().from("period_states").select("period_start, state").eq("workspace_id", ws).eq("metric_id", metric.id).in("state", ["approval", "locked"]).in("period_start", page.map((p) => p.period)),
  ]);
  const stateOf = new Map((states ?? []).map((r) => [r.period_start as string, r.state === "locked" ? "locked" : "awaiting_approval"] as const));
  const latest = new Map<string, string | null>();
  for (const o of own) latest.set(o.period_start, o.submitter_id); // one value per period: the latest
  return {
    items: page.map((p) => ({ period: p.period, value: p.value, state: stateOf.get(p.period) ?? "recorded", submitter: latest.get(p.period) ?? null, breakdown: breakdowns[metric.id]?.[p.period] ?? null })),
    next: points.length > limit ? page[page.length - 1].period : null,
  };
}

/** A person as a program sees them: id and name, never an email, Slack handle or phone. Contacts are people too. */
export type ApiPerson = { id: string; name: string; contact: boolean };

/** The workspace's people and Contacts by id, one page after the id `after` (scope metrics:read). */
export async function listPeople(actor: Actor | KeyActor, page: { after?: string | null; limit: number }): Promise<Page<ApiPerson, string>> {
  assertScope(actor, "metrics:read");
  // Loaded without contact details, so none can reach a program.
  const people = (await peopleIn(actor.workspaceId)).map((p) => ({ id: p.id, name: p.name, contact: Boolean(p.contact) })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rest = page.after ? people.filter((p) => p.id > page.after!) : people;
  const limit = clampLimit(page.limit);
  const items = rest.slice(0, limit);
  return { items, next: rest.length > limit ? items[items.length - 1].id : null };
}

/** A Group as a program sees it: id, name, and whether it is Everyone in the workspace. Not its members: a program
 * needs a Group's name to show it, nothing more. */
export type ApiGroup = { id: number; name: string; everyone: boolean };

/** The workspace's Groups by id, one page after the id `after` (scope metrics:read). */
export async function listGroups(actor: Actor | KeyActor, page: { after?: number | null; limit: number }): Promise<Page<ApiGroup>> {
  assertScope(actor, "metrics:read");
  const after = Number.isInteger(page.after) ? (page.after as number) : -Infinity;
  const groups = (await getGroups(actor.workspaceId)).map((g) => ({ id: g.id, name: g.name, everyone: Boolean(g.everyone) })).sort((a, b) => a.id - b.id);
  const rest = groups.filter((g) => g.id > after);
  const limit = clampLimit(page.limit);
  const items = rest.slice(0, limit);
  return { items, next: rest.length > limit ? items[items.length - 1].id : null };
}
