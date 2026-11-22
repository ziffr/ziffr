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

/** Hands a Metric to another Member, as the Metric Owner or an Owner or Admin; the old owner stays on as Editor. */
export async function handOverMetric(actor: Actor, metricId: number, toId: string): Promise<void> {
  // An Access Key is not an Actor here and its creator's role does not carry over: only a person at the screen hands over.
  if (actor.key || actor.role === "guest" || !Number.isInteger(metricId) || typeof toId !== "string") throw new Forbidden();
  refuseInDemo(actor);
  const ws = actor.workspaceId;
  const m = await openOne("metrics", ws, (await db().from("metrics").select("id, slug, name, owner_id, formula, inputs_checked").eq("id", metricId).eq("workspace_id", ws).maybeSingle()).data);
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
  // The owner at this moment is part of the update: two hand-overs at once cannot both succeed.
  const { data: moved } = await db().from("metrics").update({ owner_id: toId }).eq("id", m.id).eq("workspace_id", ws).eq("owner_id", from).select("id");
  if (moved?.length !== 1) throw new Error("The Metric changed hands meanwhile; look again.");
  // The old owner keeps sight and can still fill in: a direct Editor Share, in place of any weaker one. The new owner
  // needs no Share of their own any more.
  await db().from("shares").delete().eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", m.id).in("user_id", [from, toId]);
  await db().from("shares").insert({ workspace_id: ws, object_type: "metric", object_id: m.id, user_id: from, role: "editor" });
  const { data: old } = await db().from("profiles").select("name").eq("id", from).maybeSingle();
  const fromName = (old?.name as string | undefined) ?? "a former member";
  const toName = (to.profiles as unknown as { name: string } | null)?.name ?? "a member";
  await recordVersion("metric", m.id as number, actor.personId, { message: `Handed over from ${fromName} to ${toName}`, always: true });
  await audit(actor, { kind: "metric.handed_over", object: { type: "metric", id: m.id as number, name: m.name as string }, details: { from_id: from, from_name: fromName, to_id: toId, to_name: toName } });
  // Told like a reminder: by their own way, and not during their Quiet Hours.
  await deliverNotice(ws, { recipientId: toId, senderId: actor.personId, subject: `You now own ${m.name}`, text: `${actor.personId === from ? fromName : "An Owner or Admin"} handed the Metric ${m.name} over to you. You decide who sees it and who sends its values; ${fromName} stays on as Editor.`, link: `/metrics/${m.slug}`, quiet: true });
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
