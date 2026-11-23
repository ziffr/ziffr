// @ts-nocheck
// Handing a Metric over (GLOSSARY: Metric Owner, Share, Audit Log): the Metric Owner gives it to another Member who
// already sees it; an Owner or Admin gives any Metric to any Member who can own things. A Guest, a Contact and an Access
// Key never take it or give it away. The old owner keeps seeing and filling in the Metric as its Editor, the new owner
// is told through their Delivery Preference once Quiet Hours end, and the Audit Log records from, to and by whom.
import { db } from "./db";
import { openOne } from "./sealed-columns";
import { Forbidden, type Actor } from "./actor";
import { refuseInDemo } from "./demo";
import { audit } from "./audit-log";
import { recordVersion } from "./versions";
import { deliverNotice } from "./deliveries";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { withheldDerived } from "./derived-owner";
import { queueWebhookEvent } from "./webhook-events";

/** Hands a Metric to another Member, as the Metric Owner or an Owner or Admin; the old owner stays on as Editor. */
export async function handOverMetric(actor: Actor, metricId: number, toId: string): Promise<void> {
  // An Access Key is not an Actor here and its creator's role does not carry over: only a person at the screen hands over.
  if (actor.key || actor.role === "guest" || !Number.isInteger(metricId) || typeof toId !== "string") throw new Forbidden();
  refuseInDemo(actor);
  const ws = actor.workspaceId;
  const m = await openOne("metrics", ws, (await db().from("metrics").select("id, slug, name, owner_id, formula, inputs_checked, owner_taken_by").eq("id", metricId).eq("workspace_id", ws).maybeSingle()).data);
  const mayAny = actor.role === "owner" || actor.role === "admin";
  if (!m || (m.owner_id !== actor.personId && !mayAny)) throw new Forbidden("Only the Metric's owner, an Owner or an Admin hands it over.");
  const from = m.owner_id as string;
  if (toId === from) throw new Error("It already belongs to them.");
  const { data: to } = await db().from("memberships").select("role, profiles(name)").eq("workspace_id", ws).eq("user_id", toId).maybeSingle();
  if (!to || to.role === "guest") throw new Error("Pick another Member, not a Guest, to take it over.");
  // The Metric Owner gives it only to someone who already sees it, so a hand-over shows it to nobody new.
  const all = await getMetrics(ws);
  if (!mayAny && !(await visibleMetricIds(ws, toId, all)).has(m.id as number)) throw new Error("Pick someone who already sees this Metric, or share it with them first.");
  // A Derived Metric shows its inputs: its new owner must own or edit each, or it would show no values.
  if (m.formula && m.inputs_checked) {
    const rows = all.map((x) => (x.id === m.id ? { ...x, owner_id: toId } : x));
    if ((await withheldDerived(ws, rows)).has(m.id as number)) throw new Error("Pick someone who owns or edits the Metrics this one is calculated from.");
  }
  // Taking a Metric for oneself by one's role is allowed (and audited); the Editor Share a round trip would leave goes
  // to nobody who did not really own it, and the sight such a person had before is theirs still.
  const tookIt = actor.personId !== from && toId === actor.personId;
  const keepOld = m.owner_taken_by !== m.owner_id;
  const names = new Map(((await db().from("profiles").select("id, name").in("id", [from, toId, actor.personId])).data ?? []).map((p) => [p.id as string, p.name as string]));
  const fromName = names.get(from) ?? "a former member", toName = names.get(toId) ?? "a member", byName = names.get(actor.personId) ?? "An Owner or Admin";
  // One step under a lock on the new owner's membership: the owner, the Shares and the open Questions of the owner.
  const { data: moved, error } = await db().rpc("hand_over_metric", { ws, metric: m.id, old_owner: from, new_owner: toId, keep_old: keepOld, drop_new: !tookIt, took: tookIt });
  if (error) throw new Error(/changed hands/.test(error.message) ? "The Metric changed hands meanwhile; look again." : /can own things|Guest/.test(error.message) ? "Pick another Member, not a Guest, to take it over." : "The hand-over did not work; nothing was changed.");
  // The assignee changed (spec 0034: `action.updated`): each Webhook that chose it hears it once.
  for (const a of (moved ?? []) as { action_id: number; period: string }[]) await queueWebhookEvent(ws, "action.updated", { type: "system" }, { actionId: a.action_id, metricId: m.id as number, period: a.period });
  // Recorded once the Metric has moved, so a hand-over the database refuses leaves no event; the Audit Log is add-only,
  // so an event cannot be taken back. As everywhere, a failure to record is logged and never undoes the action (spec 0008).
  await audit(actor, { kind: "metric.handed_over", object: { type: "metric", id: m.id as number, name: m.name as string }, details: { from_id: from, from_name: fromName, to_id: toId, to_name: toName } });
  await recordVersion("metric", m.id as number, actor.personId, { message: `Handed over from ${fromName} to ${toName}`, always: true });
  // Told like a reminder: by their own way, and not during their Quiet Hours; the old owner too, when someone else did it.
  const link = `/metrics/${m.slug}`;
  const lose = "If a Share of theirs on it ends, their Derived Metrics, Alerts and Personal Webhooks on it stop.";
  await deliverNotice(ws, { recipientId: toId, senderId: actor.personId, subject: `You now own ${m.name}`, text: `${actor.personId === from ? fromName : byName} handed the Metric ${m.name} over to you. You decide who sees it and who sends its values; ${fromName} stays on as Editor. ${lose}`, link, quiet: true });
  if (actor.personId !== from) await deliverNotice(ws, { recipientId: from, senderId: actor.personId, subject: `${m.name} was handed over to ${toName}`, text: `${byName} handed the Metric ${m.name} over to ${toName}.${keepOld ? ` You stay on as Editor, so you still see it and can fill in values. ${lose}` : ""}`, link, quiet: true });
}

/** The Members who could take this Metric over, for the hand-over form: empty unless the actor may hand it over. Names only. */
export async function handOverChoices(actor: Actor, metricId: number): Promise<{ id: string; name: string }[]> {
  if (actor.key || actor.role === "guest" || !Number.isInteger(metricId)) return [];
  const ws = actor.workspaceId;
  const { data: m } = await db().from("metrics").select("owner_id").eq("id", metricId).eq("workspace_id", ws).maybeSingle();
  if (!m || (m.owner_id !== actor.personId && actor.role !== "owner" && actor.role !== "admin")) return [];
  const { data } = await db().from("memberships").select("user_id, profiles(name)").eq("workspace_id", ws).neq("role", "guest").neq("user_id", m.owner_id);
  return (data ?? []).map((r) => ({ id: r.user_id as string, name: (r.profiles as unknown as { name: string } | null)?.name ?? "" })).filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name));
}
