// What the popup on a point of a chart tells about one Observation (GLOSSARY: Observation, Source, Submitter, Thread),
// beyond what the chart already has (period, value, target, Approval): where the value came from, who submitted it,
// and how many open Threads about it the viewer may read. Fetched for one point when a person hovers or focuses it,
// so nothing more is sent with a dashboard (#789).
// Visibility (AGENTS.md rule 3): nothing for a Metric the person does not see; the Submitter's name only where this
// person may be shown it (as peopleFor and the Period Record: a Guest is told only their own name, never a Feed's); Threads only where they may
// read them (threadReader). View Links and Snapshots never call this: they show what their data already carries.
import { db } from "./db";
import type { Actor } from "./actor";
import { getGroups, threadReader, visibleMetricIds } from "./access";
import { openNames } from "./sealed-columns";
import { getMetrics } from "./workspace-data";
import { yearStartOf } from "./fiscal-year";
import { periodStart } from "./periods";
import { SOURCE_LABEL } from "./format";

/** The details of one Observation a viewer may see. */
export type ObservationDetails = {
  /** Where the latest value came from, such as "Slack" or "Web form"; null without a value of its own (a Derived Metric). */
  source: string | null;
  /** Who submitted it, by name, as the Period Record names them; null where the viewer may not be shown it, or nobody did. */
  submitter: string | null;
  /** How many open Threads about this period the viewer may read. */
  openThreads: number;
};

/** The details of a Metric's Observation for one period, for a person who sees the Metric; null when it is not theirs
 * to see or the period is not one of the Metric's. Ids and periods come from a browser and are checked here. */
export async function observationDetails(actor: Actor, slug: unknown, period: unknown): Promise<ObservationDetails | null> {
  const ws = actor.workspaceId;
  if (typeof slug !== "string" || slug.length > 200 || typeof period !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(period) || Number.isNaN(Date.parse(`${period}T00:00:00Z`))) return null;
  const metrics = await getMetrics(ws);
  const metric = metrics.find((m) => m.slug === slug);
  if (!metric) return null;
  const [visible, yearStart] = await Promise.all([visibleMetricIds(ws, actor.personId, metrics), yearStartOf(ws)]);
  if (!visible.has(metric.id) || periodStart(period, metric.period, yearStart) !== period) return null;

  const [{ data: latest }, { data: actions }, groups] = await Promise.all([
    // The latest value's row: only who and where, never its (sealed) value, which the chart has.
    db().from("observations").select("submitter_id, source, imported").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    db().from("actions").select("id, metric_id, status, asker_id, assignee_id, read_group_id, workspace_id").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).neq("status", "closed"),
    getGroups(ws),
  ]);
  const can = threadReader(actor.personId, groups, (id) => metrics.find((x) => x.id === id)?.owner_id, ws, visible);
  const openThreads = (actions ?? []).filter((a) => can(a as never)).length;

  const by = latest?.submitter_id ? String(latest.submitter_id) : null;
  const submitter = by ? await submitterName(actor, by) : null;
  const source = !latest ? null : latest.imported ? "Import" : SOURCE_LABEL[latest.source as keyof typeof SOURCE_LABEL] ?? String(latest.source);
  return { source, submitter, openThreads };
}

/** The one submitter's name, looked up alone rather than the whole Workspace's people, as the Period Record names
 * them: a person in the Workspace now (a Member, Guest or Contact, a Contact's sealed name opened), else a Feed by its
 * name, else "A former member". A Guest is told only their own name (peopleFor's rule): anyone else is no name. */
async function submitterName(actor: Actor, id: string): Promise<string | null> {
  const ws = actor.workspaceId;
  if (actor.role === "guest" && id !== actor.personId) return null;
  const [{ data: member }, { data: contact }, { data: feed }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", id).maybeSingle(),
    db().from("contacts").select("person_id").eq("workspace_id", ws).eq("person_id", id).maybeSingle(),
    actor.role === "guest" ? Promise.resolve({ data: null }) : db().from("feeds").select("name").eq("workspace_id", ws).eq("person_id", id).maybeSingle(),
  ]);
  if (member || contact) {
    // Only the name: never the email, Slack handle or phone the profile also holds.
    const { data: p } = await db().from("profiles").select("id, name").eq("id", id).maybeSingle();
    if (p) return String((await openNames(ws, [p]))[0].name);
  }
  if (feed?.name) return String(feed.name);
  return actor.role === "guest" ? null : "A former member";
}
