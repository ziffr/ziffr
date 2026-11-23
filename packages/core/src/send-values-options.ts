// The Metrics offered on Connectors → Send values (spec 0043, ticket 8; GLOSSARY: Metric, Feed, Access Key, Submitter): the
// ones a person may name in an example of a program sending a value. Visibility is the product: only Metrics the person sees
// (their own, Shared, through a Group), never a name or slug they have no right to; and a Guest is offered none. What a
// program may really do is decided again by the API on every call; this only fills the picker.
import type { Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { getMetrics } from "./workspace-data";

/** A Metric as the picker shows it. */
export type SendableMetric = { slug: string; name: string };

/** At most this many in each list. */
const SENDABLE_MAX = 200;

/** For a Feed Key (Owners and Admins: any Metric they see that takes values from the API) and for the person's own Access
 * Key (only the Metrics they are a Submitter of). Derived and Archived Metrics take no values and are left out. */
export async function sendableMetrics(actor: Actor): Promise<{ feed: SendableMetric[]; person: SendableMetric[] }> {
  if (actor.role === "guest") return { feed: [], person: [] };
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const eligible = metrics.filter((m) => seen.has(m.id) && !m.formula && !m.archived_at && m.sources.includes("api"));
  const { data: mine } = await db().from("tokens").select("metric_id").eq("workspace_id", actor.workspaceId).eq("submitter_id", actor.personId);
  const submits = new Set((mine ?? []).map((t) => t.metric_id as number));
  const pick = (list: typeof eligible) => list.slice(0, SENDABLE_MAX).map((m) => ({ slug: String(m.slug), name: String(m.name) }));
  return { feed: actor.role === "owner" || actor.role === "admin" ? pick(eligible) : [], person: pick(eligible.filter((m) => submits.has(m.id))) };
}
