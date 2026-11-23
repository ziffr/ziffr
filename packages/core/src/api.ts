// What a program reads and does through the API with an Access Key (spec 0002, GLOSSARY: Access Key). Each function
// takes a KeyActor (or a person's Actor, for tests and tools), checks its scope, and returns only what the key's
// creator sees, in plain shapes made for programs: no contact details, no internal rows.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { getGroups, peopleFor, systemTextFor, threadReader, visibleMetricIds } from "./access";
import { inCondensed, partOfCondensed, valueOfParts, type CondensedPoint } from "./condensed-parts";
import { condensedFor } from "./condensed-values";
import { db } from "./db";
import { formulaInputs } from "./formula";
import { metricIdsWithTags, metricTagNames, visibleTags } from "./tag-sight";
import { normaliseTagName, tagKey } from "./tag-names";
import { retentionForApi, type ApiRetention } from "./retention-words";
import { openRows } from "./sealed-columns";
import { workflowFacts, type ApiMetricWorkflow, type ApiNextAsked, type ApiNextDue } from "./api-metric-workflow";
import { linkTo } from "./deliveries";
import { recordView } from "./usage";
import { buildSeries, getBreakdowns, getLatestObservations, getMetrics, withInputs } from "./workspace-data";
import { listRows, type ListedRow } from "./breakdown-parts";
import type { Action, BreakdownRow, Metric } from "./types";

/** At most this many items in one page of a list. */
export const MAX_PAGE = 100;

/** One page of a list: the items, and where to continue after (null on the last page). */
export type Page<T, C = number> = { items: T[]; next: C | null };

/** A Metric as a program sees it in a list or on its own. */
export type ApiMetric = Pick<Metric, "slug" | "name" | "description" | "period" | "format" | "unit" | "unit_position" | "decimals" | "polarity" | "aggregation" | "target_min" | "target_max" | "attainment_method" | "sources"> & { derived: boolean; archived: boolean; tags: string[] } & ApiRetention;

/** A Metric in the shape programs see it. `stored` is the row's Retention columns (normalizeMetric drops them from the
 * Metric): without them it reads as none. A program sees the setting and its first day only (spec 0033). */
export const toApi = (m: Metric, stored?: { retention?: unknown; retention_pending?: unknown } | null, tags: string[] = []): ApiMetric => ({
  slug: m.slug, name: m.name, description: m.description, period: m.period, format: m.format, unit: m.unit, unit_position: m.unit_position,
  decimals: m.decimals, polarity: m.polarity, aggregation: m.aggregation, target_min: m.target_min, target_max: m.target_max,
  attainment_method: m.attainment_method ?? null, sources: [...(m.sources ?? [])], derived: Boolean(m.formula),
  archived: Boolean(m.archived_at), tags, ...retentionForApi(stored?.retention, stored?.retention_pending),
});

/** The Retention columns of Metrics the caller has already checked the actor sees, by id. */
async function storedRetentions(ws: string, ids: readonly number[]): Promise<Map<number, { retention: unknown; retention_pending: unknown }>> {
  if (!ids.length) return new Map();
  const { data } = await db().from("metrics").select("id, retention, retention_pending").eq("workspace_id", ws).in("id", [...ids]);
  return new Map((data ?? []).map((r) => [r.id as number, r]));
}

/** The key's creator as a person's Actor (spec 0038): what the Tag functions take, with the role as it is now. */
export const creatorOf = (actor: Actor | KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

/** At most this many `tag` filters in one request, as many Tags as a Metric carries. */
export const TAG_FILTERS_MAX = 10;

/** The Metrics the key's creator sees, in a stable order (by id), one page after `after` (scope metrics:read): those
 * in use, or with `archived` only the Archived Metrics (GLOSSARY: Archived Metric), which are listed only when asked.
 * With `tags`, only the Metrics that carry every one of those Tags (GLOSSARY: Tag): a word that is not a Tag the creator
 * sees matches nothing, whatever else the Workspace holds. Each Metric lists its Tags (those the creator sees, sorted). */
export async function listMetrics(actor: Actor | KeyActor, page: { after?: number | null; limit: number; archived?: boolean; tags?: string[] }): Promise<Page<ApiMetric>> {
  assertScope(actor, "metrics:read");
  const limit = clampLimit(page.limit);
  const after = Number.isInteger(page.after) ? (page.after as number) : 0;
  const metrics = await getMetrics(actor.workspaceId);
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const archived = page.archived === true;
  // The filter is untrusted text, compared in memory over the Tags the creator sees: never a query filter.
  const asked = [...new Set((page.tags ?? []).slice(0, TAG_FILTERS_MAX).map(normaliseTagName).map(tagKey))];
  const tagged = asked.length ? new Set(await metricIdsWithTags(creatorOf(actor), asked)) : null;
  const rest = metrics.filter((m) => visible.has(m.id) && m.id > after && Boolean(m.archived_at) === archived && (!tagged || tagged.has(m.id))).sort((a, b) => a.id - b.id);
  const items = rest.slice(0, limit);
  const [stored, names] = await Promise.all([storedRetentions(actor.workspaceId, items.map((m) => m.id)), metricTagNames(creatorOf(actor), items.map((m) => m.id))]);
  return { items: items.map((m) => toApi(m, stored.get(m.id), names.get(m.id))), next: rest.length > limit ? items[items.length - 1].id : null };
}

/** A Tag as a program sees it: its name and how many Metrics the key's creator sees it on, in use and archived. */
export type ApiTag = { name: string; metrics: number; archived: number };

/** The Tags the key's creator sees (scope metrics:read), by name: a Tag is listed only through a Metric they may see, and
 * counts only those, so a name never tells that a private Metric exists. At most 200 (a Workspace's limit): no paging. */
export async function listTags(actor: Actor | KeyActor): Promise<ApiTag[]> {
  assertScope(actor, "metrics:read");
  return (await visibleTags(creatorOf(actor))).map((t) => ({ name: t.name, metrics: t.metrics - t.archived, archived: t.archived })).sort((x, y) => tagKey(x.name).localeCompare(tagKey(y.name)));
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

/** One Metric as a program sees it on its own: its description, its Workflow and the next day a value is due (ticket #612). */
export type ApiMetricDetail = ApiMetric & {
  url: string; workflow: ApiMetricWorkflow | null; next_due: ApiNextDue | null; next_asked: ApiNextAsked | null;
  /** A Derived Metric's formula, by its inputs' slugs, only when the key's creator sees every one of its inputs: else
   * null, so a formula never names a Metric they may not see (ticket #619). */
  formula: string | null;
  /** On the answer to creating a Derived Metric: what was chosen where the caller left a field out, in plain words. */
  defaults?: string[];
  /** On the answer to creating a Metric with `tags` that the Workspace's limit refused: the words left out. The Metric was made. */
  tags_left_out?: string[];
};

/** A Derived Metric's formula for someone who sees all the Metrics it is made of, else null. */
async function formulaSeen(actor: Actor | KeyActor, metric: Metric): Promise<string | null> {
  if (!metric.formula) return null;
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const bySlug = new Map(metrics.map((m) => [m.slug, m.id] as const));
  return formulaInputs(metric.formula).every((s) => seen.has(bySlug.get(s) ?? -1)) ? metric.formula : null;
}

/** A Metric the caller has checked the actor sees, with its Workflow facts. */
export async function describeMetric(actor: Actor | KeyActor, metric: Metric): Promise<ApiMetricDetail> {
  const [stored, facts, names] = await Promise.all([storedRetentions(actor.workspaceId, [metric.id]), workflowFacts(actor, metric), metricTagNames(creatorOf(actor), [metric.id])]);
  return { ...toApi(metric, stored.get(metric.id), names.get(metric.id)), url: linkTo(`/metrics/${metric.slug}`), ...facts, formula: await formulaSeen(actor, metric) };
}

/** One Metric's description with its Workflow and next Due Date (scope metrics:read). */
export async function getMetric(actor: Actor | KeyActor, slug: string): Promise<ApiMetricDetail> {
  assertScope(actor, "metrics:read");
  const { metric } = await visibleMetric(actor, String(slug));
  return describeMetric(actor, metric);
}

/** Where a period's value stands: published as recorded, waiting for Approval, or locked (GLOSSARY: Approval, Lock). */
export type ValueState = "recorded" | "awaiting_approval" | "locked";

/** A Metric's value for one period as a program sees it: the plotted value (the latest when the Submission Rule keeps
 * both), who submitted it (a person's id, see listPeople, and their name; null for a Derived Metric or an import, and for a Guest's key on everyone's values but the Guest's own), when
 * and through which Source, its Breakdown, and whether the key's creator may read a Thread on it (never says anything
 * about a Thread they may not read). */
export type ApiObservation = {
  period: string; value: number; state: ValueState; submitter: string | null; submitter_name: string | null;
  submitted_at: string | null; source: string | null; has_thread: boolean; breakdown: ListedRow[] | null;
  /** Read only (spec 0046): the id and name of the person who entered the value for its submitter (a Filled-in Value),
   * or null when the submitter entered it. Always null for a key whose creator is a Guest. */
  entered_by?: string | null; entered_by_name?: string | null;
  /** Only on a Condensed Value (spec 0033): how many of the Metric's periods it was made from, so a program never
   * mistakes it for one period; `period` is the span's first day and `period_end` its last. */
  condensed_from?: number; period_end?: string;
};

/** A Metric's values for periods from `from` to `to` (period starts, both included), oldest first, one page after the
 * period `after` (scope metrics:read). A Derived Metric's values are computed, as on its page in the app. */
export async function listObservations(actor: Actor | KeyActor, slug: string, range: { from?: string | null; to?: string | null; after?: string | null; limit: number }): Promise<Page<ApiObservation, string>> {
  assertScope(actor, "metrics:read");
  const { metric, metrics } = await visibleMetric(actor, String(slug));
  const ws = actor.workspaceId;
  // A program reading values (the API, and the MCP Server through it) keeps the Metric in use (spec 0031): counted
  // apart from views, once per read of the first page, not per page. Never waited for, never an error.
  if (actor.key && !range.after) void recordView(actor, { kind: "metric", id: metric.id }, "api");
  // A Derived Metric needs its inputs' values to be computed; only its own values leave this function. Only the
  // latest value of each period is read, and only of the periods asked for when they are real days (the comparison
  // below stays, so a malformed bound filters as before instead of reaching the query).
  // A cursor (`after`) narrows the read too; it is exclusive, so the comparison below drops that period itself.
  const lower = [range.from, range.after].filter(isDay).sort().at(-1) ?? null;
  const window = { from: lower, to: isDay(range.to) ? range.to : null };
  const observations = await getLatestObservations(ws, { metricIds: withInputs(metrics, [metric.id]), ...window });
  const inRange = (p: { period: string }) => (!range.from || p.period >= range.from) && (!range.to || p.period <= range.to) && (!range.after || p.period > range.after);
  // The Condensed Values of a Metric the key's creator sees stand among its values as the span they were made for.
  const spans = metric.formula ? [] : ((await condensedFor(ws, [metric.id]))[metric.id] ?? []);
  const condensed = spans.flatMap((c) => {
    const value = valueOfParts(metric.aggregation, [partOfCondensed(c)], c.of);
    return value === undefined ? [] : [{ period: c.period, value, condensed: c }];
  }).filter(inRange);
  // A period a Condensed Value stands for is listed once, as it, even while its originals are not deleted yet.
  const points: { period: string; value: number; condensed?: CondensedPoint }[] = [...(buildSeries(metrics, observations)[metric.slug] ?? []).filter((p) => inRange(p) && !inCondensed(spans, p.period)), ...condensed].sort((a, b) => a.period.localeCompare(b.period));
  const limit = clampLimit(range.limit);
  const page = points.slice(0, limit);
  if (!page.length) return { items: [], next: null };
  const own = observations.filter((o) => o.metric_id === metric.id);
  const [breakdowns, { data: states }] = await Promise.all([
    metric.formula ? Promise.resolve({} as Record<number, Record<string, BreakdownRow[]>>) : getBreakdowns(ws, [metric.id], { from: page[0].period, to: page[page.length - 1].period }),
    db().from("period_states").select("period_start, state").eq("workspace_id", ws).eq("metric_id", metric.id).in("state", ["approval", "locked"]).in("period_start", page.map((p) => p.period)),
  ]);
  const stateOf = new Map((states ?? []).map((r) => [r.period_start as string, r.state === "locked" ? "locked" : "awaiting_approval"] as const));
  const guest = actor.role === "guest"; // a Guest is told nothing of who entered a value, as of who submitted it
  // A Guest's key names the Guest on their own values (a Filled-in Value counts as theirs, and who entered it stays
  // hidden: entered_by is never read for a Guest) and no one else; everyone else's submitter is null for a Guest.
  const shownSubmitter = (id: string | null | undefined): string | null => (id && (!guest || id === actor.personId) ? id : null);
  const latest = new Map<string, (typeof own)[number]>();
  for (const o of own) latest.set(o.period_start, o); // one value per period: the latest
  // Who entered a value for its submitter (spec 0046) is read apart, only for the page's values and never for a Guest:
  // the latest-values function carries no such column, and a Guest is told nothing of it (rule 3).
  const enteredBy = new Map<string, string>();
  if (!guest && !metric.formula) {
    const ids = page.flatMap((p) => { const id = latest.get(p.period)?.id; return id === undefined ? [] : [id]; });
    const { data: entered } = ids.length ? await db().from("observations").select("id, entered_by").eq("workspace_id", ws).in("id", ids).not("entered_by", "is", null) : { data: [] };
    const byId = new Map((entered ?? []).map((r) => [r.id as number, r.entered_by as string]));
    for (const p of page) { const by = byId.get(latest.get(p.period)?.id as number); if (by) enteredBy.set(p.period, by); }
  }
  const [names, threads] = await Promise.all([
    namesOf(actor, [...latest.values()].map((o) => o.submitter_id).concat([...enteredBy.values()])),
    readableThreads(actor, metric, page.map((p) => p.period)),
  ]);
  const withThread = new Set(threads.map((t) => t.period_start));
  return {
    items: page.map((p) => p.condensed
      ? { period: p.period, period_end: p.condensed.periodEnd, condensed_from: p.condensed.held, value: p.value, state: "locked" as const, submitter: null, submitter_name: null, submitted_at: null, source: null, has_thread: false, breakdown: null, entered_by: null, entered_by_name: null }
      : { period: p.period, value: p.value, state: stateOf.get(p.period) ?? "recorded", submitter: shownSubmitter(latest.get(p.period)?.submitter_id), submitter_name: names.get(shownSubmitter(latest.get(p.period)?.submitter_id) ?? "") ?? null, submitted_at: latest.get(p.period)?.created_at ?? null, source: latest.get(p.period)?.source ?? null, has_thread: withThread.has(p.period), breakdown: breakdowns[metric.id]?.[p.period] ? listRows(breakdowns[metric.id][p.period]) : null, entered_by: enteredBy.get(p.period) ?? null, entered_by_name: names.get(enteredBy.get(p.period) ?? "") ?? null }),
    next: points.length > limit ? page[page.length - 1].period : null,
  };
}

/** Names by id of people who are in this Workspace now (members and Contacts, as /people lists them, a Contact's sealed
 * name opened) and of its Feeds. Anyone else, such as a former member, has no name here, as in the app. Only `id` and
 * `name` ever leave: never contact details. */
async function namesOf(actor: Actor | KeyActor, ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const ws = actor.workspaceId;
  const wanted = new Set(ids.filter((i): i is string => Boolean(i)));
  if (!wanted.size) return new Map();
  // A Guest is told only their own name (peopleFor); a Feed is no one of theirs to know either.
  const guest = actor.role === "guest";
  const [people, { data: feeds }] = await Promise.all([peopleFor(actor), guest ? Promise.resolve({ data: [] }) : db().from("feeds").select("person_id, name").eq("workspace_id", ws).in("person_id", [...wanted])]);
  const names = new Map<string, string>();
  for (const f of feeds ?? []) names.set(f.person_id as string, String(f.name));
  for (const p of people) if (wanted.has(p.id)) names.set(p.id, p.name);
  return names;
}

/** The Threads on a Metric's periods that the key's creator may read, by the app's own rule (canReadThread: the people
 * on it and the Metric's owner, others by the Metric's visibility, then its Group). Security: a Thread they may not
 * read is dropped here, before anything is counted or opened, so neither it nor its existence reaches a program. */
async function readableThreads(actor: Actor | KeyActor, metric: Metric, periods: string[]): Promise<Action[]> {
  if (!periods.length) return [];
  const ws = actor.workspaceId;
  const [{ data }, groups] = await Promise.all([
    db().from("actions").select("*").eq("workspace_id", ws).eq("metric_id", metric.id).in("period_start", periods).order("created_at").order("id"),
    getGroups(ws),
  ]);
  const can = threadReader(actor.personId, groups, () => metric.owner_id, ws, new Set([metric.id]));
  return (await openRows("actions", ws, data as Action[] | null)).filter((a) => can(a as Action & { workspace_id: string }));
}

/** One Thread as a program reads it: the question that opened it and the replies. Words are the workspace's own, data. */
export type ApiThread = {
  kind: "question" | "task"; status: "open" | "answered" | "closed"; asked_by: string | null; asked_by_name: string | null; asked_at: string; question: string;
  messages: { author: string; author_name: string | null; sent_at: string; words: string; correction: { value: number; status: "proposed" | "accepted" | "declined" } | null }[];
  /** True when older messages were left out (the newest MAX_THREAD_MESSAGES are shown). */
  truncated: boolean;
};

/** At most this many Threads on one period are returned. */
export const MAX_THREADS = 20;

/** At most this many messages of one Thread are returned, the newest. */
export const MAX_THREAD_MESSAGES = 100;

/** The Threads on one Metric's period that the key's creator may read, messages oldest first with their authors' names,
 * sealed words opened (scope metrics:read). A period with none, and one whose Threads they may not read, answer the same:
 * an empty list. A Metric they do not see is Forbidden, as everywhere in the API. */
export async function getThreads(actor: Actor | KeyActor, slug: string, period: string): Promise<{ metric: string; period: string; threads: ApiThread[] }> {
  assertScope(actor, "metrics:read");
  const { metric } = await visibleMetric(actor, String(slug));
  if (!isDay(period)) return { metric: metric.slug, period: String(period), threads: [] };
  const ws = actor.workspaceId;
  const actions = (await readableThreads(actor, metric, [period])).slice(0, MAX_THREADS);
  if (!actions.length) return { metric: metric.slug, period, threads: [] };
  const { data } = await db().from("thread_messages").select("*").eq("workspace_id", ws).in("action_id", actions.map((a) => a.id)).order("created_at").order("id");
  const messages = await openRows("thread_messages", ws, data as { action_id: number; author_id: string; body: string; created_at: string; correction_value: number | null; correction_status: "proposed" | "accepted" | "declined" | null }[] | null);
  const hideSystem = await systemTextFor(actor);
  const names = await namesOf(actor, [...actions.map((a) => a.asker_id), ...messages.map((m) => m.author_id)]);
  return {
    metric: metric.slug, period,
    threads: actions.map((a) => {
      const all = messages.filter((m) => m.action_id === a.id);
      const shown = all.slice(-MAX_THREAD_MESSAGES);
      return {
        kind: a.kind, status: a.status, asked_by: a.asker_id, asked_by_name: names.get(a.asker_id) ?? null, asked_at: a.created_at, question: hideSystem(a.question, Boolean(a.purpose)),
        messages: shown.map((m) => ({ author: m.author_id, author_name: names.get(m.author_id) ?? null, sent_at: m.created_at, words: m.body, correction: m.correction_status && m.correction_value !== null ? { value: Number(m.correction_value), status: m.correction_status } : null })),
        truncated: shown.length < all.length,
      };
    }),
  };
}

/** A person as a program sees them: id and name, never an email, Slack handle or phone. Contacts are people too. */
export type ApiPerson = { id: string; name: string; contact: boolean };

/** The workspace's people and Contacts by id, one page after the id `after` (scope metrics:read). */
export async function listPeople(actor: Actor | KeyActor, page: { after?: string | null; limit: number }): Promise<Page<ApiPerson, string>> {
  assertScope(actor, "metrics:read");
  // Loaded without contact details, so none can reach a program; a Guest's key gets only the people on what they see.
  const people = (await peopleFor(actor)).map((p) => ({ id: p.id, name: p.name, contact: Boolean(p.contact) })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  // A Guest shares nothing, so a Guest's key lists only the Groups they are in (rule 3).
  const all = await getGroups(actor.workspaceId);
  const groups = (actor.role === "guest" ? all.filter((g) => g.members.includes(actor.personId)) : all).map((g) => ({ id: g.id, name: g.name, everyone: Boolean(g.everyone) })).sort((a, b) => a.id - b.id);
  const rest = groups.filter((g) => g.id > after);
  const limit = clampLimit(page.limit);
  const items = rest.slice(0, limit);
  return { items, next: rest.length > limit ? items[items.length - 1].id : null };
}
