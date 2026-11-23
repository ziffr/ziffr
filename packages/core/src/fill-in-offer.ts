// What the "Fill in for …" button offers one person for one Metric and period (GLOSSARY: Filled-in Value, Stand-in,
// Due Date, Away; spec 0046, ticket #801). It decides nothing of its own: for each person who submits the Metric it asks
// the one rule (mayFillIn, through fillInVerdict) and keeps what that says, so a button is shown only to someone the
// core would let fill in, or, before the Due Date, shown disabled with the reason. Rule 3: only people the viewer may
// see by name are returned, with their names and nothing else; a Guest, an Access Key and the demo are offered nothing.
import type { Actor } from "./actor";
import { peopleFor, visibleMetricIds } from "./access";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { feedIdsAmong } from "./feed-people";
import { fillInVerdict } from "./fill-in-check";
import { getMetrics } from "./workspace-data";

/** One person the viewer may fill in for. `wait` is why filling in is not open yet, in words; null when it is open now. */
type FillInPerson = { id: string; name: string; wait: string | null };

/** The people the viewer may fill in for (now or from the Due Date on) for one Metric's period. */
export type FillInOffer = { metricId: number; period: string; people: FillInPerson[] };

/** The refusals of mayFillIn that only mean "not yet": the offer is then shown disabled with the reason. Every other
 * refusal (a value is there, the period is locked, the viewer is not the one who may) shows no button. A test keeps these
 * in step with the words of fill-in-rules.ts. */
export const NOT_YET = /^(Filling in opens after the Due Date|Without a Workflow there is no Due Date)/;

/** Who the viewer may fill in for, for this Metric and period; null when there is nobody and nothing to show. */
export async function fillInOffer(actor: Actor, metricId: number, period: string): Promise<FillInOffer | null> {
  // Never an Access Key, a Guest or the demo (mayFillIn refuses them too: this only keeps a button from being drawn).
  if (actor.key || !actor.personId || actor.role === "guest" || actor.workspaceId === DEMO_WORKSPACE_ID) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(period))) return null;
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric || metric.formula || !(await visibleMetricIds(ws, actor.personId, metrics)).has(metric.id)) return null;

  // The people who submit it with a Token of their own, never the viewer and never a Feed.
  const { data: tokens } = await db().from("tokens").select("submitter_id").eq("workspace_id", ws).eq("metric_id", metric.id).is("stands_in_for", null);
  const ids = [...new Set((tokens ?? []).map((t) => String(t.submitter_id)).filter((id) => id !== actor.personId))];
  if (!ids.length) return null;
  const [feeds, shown] = await Promise.all([feedIdsAmong(ids), peopleFor(actor)]);
  const names = new Map(shown.map((p) => [p.id, p.name]));
  const by = { id: actor.personId, viaKey: false };
  const people: FillInPerson[] = [];
  for (const id of ids) {
    const name = names.get(id);
    if (!name || feeds.has(id)) continue;
    const v = await fillInVerdict(ws, metric, period, by, id);
    if (v.ok) people.push({ id, name, wait: null });
    else if (NOT_YET.test(v.refusal)) people.push({ id, name, wait: v.refusal });
  }
  return people.length ? { metricId: metric.id, period, people } : null;
}

/** The Guests already chosen as Stand-ins for this Metric, by the Submitter they stand in for (spec 0046: a Guest cannot fill
 * in for someone, and is not chosen as a Stand-in any more; one chosen before keeps being asked and records their own value).
 * For the Metric's owner only, who sees the Stand-ins list: nobody else is told who stands in for whom. */
export async function guestStandIns(actor: Actor, metricId: number): Promise<Record<string, string>> {
  if (actor.key || !actor.personId || actor.role === "guest") return {};
  const ws = actor.workspaceId;
  const metric = (await getMetrics(ws)).find((m) => m.id === metricId);
  if (!metric || metric.owner_id !== actor.personId) return {};
  const { data: tokens } = await db().from("tokens").select("submitter_id, stand_in_id").eq("workspace_id", ws).eq("metric_id", metricId).is("stands_in_for", null).not("stand_in_id", "is", null);
  const standIns = [...new Set((tokens ?? []).map((t) => String(t.stand_in_id)))];
  if (!standIns.length) return {};
  const { data: roles } = await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("role", "guest").in("user_id", standIns);
  const guests = new Set((roles ?? []).map((r) => String(r.user_id)));
  return Object.fromEntries((tokens ?? []).filter((t) => guests.has(String(t.stand_in_id))).map((t) => [String(t.submitter_id), String(t.stand_in_id)]));
}
