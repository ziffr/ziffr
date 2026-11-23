// Handover when someone leaves (GLOSSARY: Workspace Role, Access Key, Stand-in, Version): an Owner or Admin removes a
// member and picks who takes over what they own. Nothing others built on is deleted; their Tokens, stand-in roles,
// Shares, Group memberships and Access Keys end at once; the handover shows in each object's version history.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { recordVersion, type VersionType } from "./versions";
import { audit } from "./audit-log";
import { getMetrics } from "./workspace-data";
import { queueWebhookEvent } from "./webhook-events";
import { recordPersonalWebhookEnds } from "./personal-webhooks";

/** What a leaving member owns in the workspace, by kind, for the handover dialog and the version history. */
export async function ownedBy(actor: Actor, personId: string) {
  assertCan(actor, "manage-members");
  const ws = actor.workspaceId;
  const count = async (table: string) => (await db().from(table).select("id").eq("workspace_id", ws).eq("owner_id", personId)).data?.map((r) => r.id as number) ?? [];
  const [metric, dashboard, deck, template, theme, workflow] = await Promise.all(["metrics", "dashboards", "decks", "team_templates", "themes", "workflows"].map(count));
  // A Snapshot has no owner of its own: it goes with its dashboard.
  return { metric, dashboard, deck, template, theme, workflow } satisfies Record<Exclude<VersionType, "widget" | "snapshot">, number[]>;
}

/** Removes a member and hands everything they own to a successor, in one step. Owners and Admins may; only Owners
 * remove Owners; the successor must be another member who can own things; the last Owner stays. */
export async function removeMember(actor: Actor, personId: string, successorId: string) {
  assertCan(actor, "manage-members");
  if (personId === actor.personId) throw new Forbidden("Ask another Owner or Admin to remove you.");
  const ws = actor.workspaceId;
  const { data: leaving } = await db().from("memberships").select("role, profiles(name)").eq("workspace_id", ws).eq("user_id", personId).maybeSingle();
  if (!leaving) throw new Forbidden();
  if (leaving.role === "owner" && actor.role !== "owner") throw new Forbidden("Only Owners remove an Owner.");
  const { data: successor } = await db().from("memberships").select("role, profiles(name)").eq("workspace_id", ws).eq("user_id", successorId).maybeSingle();
  if (!successor || successor.role === "guest" || successorId === personId) throw new Error("Pick another member, not a Guest, to take over.");
  const owned = await ownedBy(actor, personId);
  // The Actions waiting on them: noted before the handover moves them to the successor, who is then named in `action.updated`.
  const { data: waiting } = await db().from("actions").select("id, metric_id, period_start").eq("workspace_id", ws).eq("assignee_id", personId).in("status", ["open", "answered"]);
  // The acting role goes along: the database checks it in the same step, so a promotion in between changes nothing.
  const { error } = await db().rpc("hand_over", { ws, leaving: personId, successor: successorId, actor_role: actor.role, actor_id: actor.personId });
  if (error) {
    if (/only Owners remove an Owner/.test(error.message)) throw new Forbidden("Only Owners remove an Owner.");
    throw new Error(/at least one Owner/.test(error.message) ? "A workspace keeps at least one Owner. Make someone else Owner first." : "The handover did not work; nothing was changed.");
  }
  // The assignee changed (spec 0034: `action.updated`): each Webhook that chose it hears it once, so the external task follows to the successor.
  for (const a of waiting ?? []) await queueWebhookEvent(ws, "action.updated", { type: "system" }, { actionId: a.id as number, metricId: a.metric_id as number | null, period: a.period_start as string });
  const from = (leaving.profiles as unknown as { name: string } | null)?.name ?? "a former member";
  const to = (successor.profiles as unknown as { name: string } | null)?.name ?? "a member";
  // Automatic Snapshots are taken in the owner's name, with what they see (spec 0013): the successor chooses again.
  if (owned.dashboard.length) await db().from("dashboards").update({ snapshot_every: null }).eq("workspace_id", ws).in("id", owned.dashboard);
  // Taking someone's Metrics for oneself by one's role is a hand-over like any other: audited, so a round trip is seen.
  if (successorId === actor.personId && owned.metric.length) {
    const names = new Map((await getMetrics(ws)).map((m) => [m.id, m.name]));
    for (const id of owned.metric) await audit(actor, { kind: "metric.handed_over", object: { type: "metric", id, name: names.get(id) ?? "" }, details: { from_id: personId, from_name: from, to_id: successorId, to_name: to } });
  }
  for (const [type, ids] of Object.entries(owned) as [VersionType, number[]][]) {
    for (const id of ids) await recordVersion(type, id, actor.personId, { message: `Handed over from ${from} to ${to}`, always: true });
  }
  // Their Personal Webhooks ended with their place here (the database removed them); the Audit Log says so.
  await recordPersonalWebhookEnds({ workspaceId: ws, personId, by: actor.personId });
  await audit(actor, { kind: "member.removed", object: { type: "person", id: personId, name: from }, details: {
    role: leaving.role as string, successor_id: successorId, successor_name: to, handed_over: Object.values(owned).reduce((n, ids) => n + ids.length, 0),
  } });
}
