// What a person sees of Tags (GLOSSARY: Tag; spec 0038): a Tag is shown to nobody except through a Metric they may see.
// Whoever has a Tag in front of them (the suggestions while typing, the filter list, Search, the Tags page, the API and
// the MCP Server, a dashboard's "all Metrics tagged X") got it from here, so one rule decides: a person sees a Tag when at
// least one Metric they may see carries it, and counts only those Metrics. A Tag's name alone never reveals that a private
// Metric exists or what it is about. Every function takes the Actor first and reads only the actor's Workspace.
import type { Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { isArchived } from "./metric-row";
import { readLinks, readTags } from "./tag-rows";
import { tagKey } from "./tag-names";
import { getMetrics } from "./workspace-data";

/** A Tag as one person sees it: `metrics` counts the Metrics they may see that carry it (archived ones included), and
 * `archived` how many of those are archived, so the Metrics list counts the rest. */
export type VisibleTag = { id: string; name: string; metrics: number; archived: number };

/** The Tags the actor sees, by name (ignoring case), each with the Metrics they see it on. Only Metrics the actor may see
 * are counted and a Tag none of them carries is not listed, whatever else the Workspace holds. */
export async function visibleTags(actor: Actor): Promise<VisibleTag[]> {
  return (await tagSight(actor)).tags;
}

/** The same sight with what callers filter and list by: the Tags, the Tag names of each Metric the actor sees (sorted, ignoring
 * case), and the Metrics that are archived. Loaded once for a caller that needs several of these. */
export async function tagSight(actor: Actor): Promise<{ tags: VisibleTag[]; namesByMetric: Map<number, string[]>; idsByMetric: Map<number, string[]>; seen: Set<number> }> {
  const ws = actor.workspaceId;
  const [metrics, tags, links] = await Promise.all([getMetrics(ws), readTags(ws), readLinks(ws)]);
  const seen = await visibleMetricIds(ws, actor.personId, metrics);
  const archived = new Set(metrics.filter(isArchived).map((m) => m.id));
  const byId = new Map(tags.map((t) => [t.id, t]));
  const count = new Map<string, { metrics: number; archived: number }>();
  const idsByMetric = new Map<number, string[]>();
  for (const l of links) {
    // Links to Metrics the actor does not see are not counted, not listed and not looked at again.
    if (!seen.has(l.metric_id) || !byId.has(l.tag_id)) continue;
    const c = count.get(l.tag_id) ?? { metrics: 0, archived: 0 };
    c.metrics += 1;
    if (archived.has(l.metric_id)) c.archived += 1;
    count.set(l.tag_id, c);
    idsByMetric.set(l.metric_id, [...(idsByMetric.get(l.metric_id) ?? []), l.tag_id]);
  }
  const listed = tags.filter((t) => count.has(t.id)).map((t) => ({ id: t.id, name: t.name, ...count.get(t.id)! }));
  const namesByMetric = new Map<number, string[]>();
  for (const [metric, ids] of idsByMetric) namesByMetric.set(metric, ids.map((i) => byId.get(i)!.name).sort((a, b) => tagKey(a).localeCompare(tagKey(b))));
  return { tags: listed, namesByMetric, idsByMetric, seen };
}

/** The Tag names of the Metrics the actor sees, sorted: a Metric the actor does not see is not in the answer, and a Metric
 * with no Tags is there with an empty list. With `metricIds`, only those that are among them. */
export async function metricTagNames(actor: Actor, metricIds?: readonly number[]): Promise<Map<number, string[]>> {
  const sight = await tagSight(actor);
  const wanted = metricIds ? metricIds.filter((id) => sight.seen.has(id)) : [...sight.seen];
  return new Map(wanted.map((id) => [id, sight.namesByMetric.get(id) ?? []]));
}

/** The Metrics the actor sees that carry every one of these Tags (names compared ignoring case): narrowing is the use of
 * picking several. A name that is not one of the Tags the actor sees matches nothing, so a filter says no more about a
 * Tag on Metrics the actor does not see than a name nobody uses. */
export async function metricIdsWithTags(actor: Actor, names: readonly string[]): Promise<number[]> {
  if (!names.length) return [];
  const sight = await tagSight(actor);
  const wanted = names.map((n) => sight.tags.find((t) => tagKey(t.name) === tagKey(n))?.id);
  if (wanted.some((id) => id === undefined)) return [];
  return [...sight.idsByMetric].filter(([, ids]) => wanted.every((w) => ids.includes(w as string))).map(([metric]) => metric).sort((a, b) => a - b);
}
