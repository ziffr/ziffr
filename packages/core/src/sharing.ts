// Sharing (GLOSSARY: Share, Viewer, Editor, Group, View Link): sharing a Metric, dashboard or deck with a person or
// a Group, "who can see this", and asking for access. Every function takes the Actor first; only the owner shares
// their own things, only with members of the same Workspace, and Guests share nothing.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { audience, visibleDashboards, visibleDecks, visibleMetricIds, type ObjectType } from "./access";
import { deckMetricIds } from "./visibility";
import { getMetrics } from "./workspace-data";
import type { ShareRole } from "./types";
import { deliverNotice } from "./deliveries";

const TYPES: ObjectType[] = ["metric", "dashboard", "deck"];
const table = (t: ObjectType) => (t === "metric" ? "metrics" : t === "deck" ? "decks" : "dashboards");
const path = (t: ObjectType, id: number, slug?: string) => (t === "metric" ? `/metrics/${slug}` : `/${t}s/${id}`);

/** What asking for access sets off: a notice through the recipient's Connector. */
export type NoticeEffects = {
  /** Sends a person a short notice through their Connector. */
  notify: (n: { recipientId: string; senderId: string; subject: string; text: string; link: string }) => Promise<void>;
};

/** The core's own notices, in the actor's workspace. */
export const noticeEffectsFor = (actor: Actor): NoticeEffects => ({ notify: (n) => deliverNotice(actor.workspaceId, n) });

/** Refuses anything but Metrics, dashboards and decks. */
function assertType(type: ObjectType) {
  if (!TYPES.includes(type)) throw new Forbidden();
}

/** Whether the actor sees this Metric, dashboard or deck. */
export async function canSee(actor: Actor, type: ObjectType, id: number): Promise<boolean> {
  const ws = actor.workspaceId;
  if (type === "metric") return (await visibleMetricIds(ws, actor.personId, await getMetrics(ws))).has(id);
  if (type === "dashboard") return (await visibleDashboards(ws, actor.personId)).some((d) => d.id === id);
  return (await visibleDecks(ws, actor.personId)).some((d) => d.id === id);
}

/** Refuses Metrics the actor does not see. */
export async function assertSeesMetrics(actor: Actor, ids: number[]) {
  if (!ids.length) return;
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId));
  if (!ids.every((id) => visible.has(id))) throw new Forbidden();
}

/** Refuses people who are not members of the actor's workspace (Contacts are not: nothing is shared with them). */
export async function assertMembersIn(actor: Actor, personIds: string[]) {
  const ids = [...new Set(personIds.map(String))];
  if (!ids.length) return;
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", ids);
  if ((data ?? []).length !== ids.length) throw new Forbidden();
}

/** The thing to be shared, if the actor owns it in their workspace; a shared deck must only show Metrics its
 * owner sees, because whoever it is shared with sees them too. */
async function ownedForSharing(actor: Actor, type: ObjectType, id: number, role: ShareRole | null) {
  assertType(type);
  assertCan(actor, "share");
  if (role !== null && role !== "viewer" && role !== "editor") throw new Forbidden();
  if (type === "metric" && role === "editor") throw new Forbidden("Metrics are shared as Viewer only.");
  const { data: obj } = await db().from(table(type)).select("*").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!obj || obj.owner_id !== actor.personId) throw new Forbidden();
  if (type === "deck" && role) await assertSeesMetrics(actor, deckMetricIds(obj.document));
  return obj;
}

/** Shares something the actor owns with a member as Viewer or Editor; null takes the Share away. */
export async function share(actor: Actor, type: ObjectType, id: number, personId: string, role: ShareRole | null) {
  await ownedForSharing(actor, type, id, role);
  if (personId === actor.personId) throw new Forbidden();
  await assertMembersIn(actor, [personId]);
  await db().from("shares").delete().eq("workspace_id", actor.workspaceId).eq("object_type", type).eq("object_id", id).eq("user_id", personId);
  if (role) await db().from("shares").insert({ object_type: type, object_id: id, user_id: personId, role, workspace_id: actor.workspaceId });
}

/** Shares something the actor owns with a Group: everyone in it, now and later; null takes the Share away. */
export async function shareWithGroup(actor: Actor, type: ObjectType, id: number, groupId: number, role: ShareRole | null) {
  await ownedForSharing(actor, type, id, role);
  const { data: g } = await db().from("groups").select("id").eq("id", groupId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!g) throw new Forbidden();
  await db().from("shares").delete().eq("workspace_id", actor.workspaceId).eq("object_type", type).eq("object_id", id).eq("group_id", groupId);
  if (role) await db().from("shares").insert({ object_type: type, object_id: id, group_id: groupId, role, workspace_id: actor.workspaceId });
}

/** Who can see something and why; only for people who see it themselves. The owner also gets open requests. */
export async function whoCanSee(actor: Actor, type: ObjectType, id: number) {
  assertType(type);
  if (!(await canSee(actor, type, id))) throw new Forbidden();
  const a = await audience(actor.workspaceId, type, id, actor.personId);
  if (!a) throw new Forbidden();
  const isOwner = a.owner === actor.personId;
  const requests = isOwner
    ? (await db().from("access_requests").select("id, requester_id, created_at").eq("workspace_id", actor.workspaceId).eq("object_type", type).eq("object_id", id).eq("status", "open").order("id")).data ?? []
    : [];
  return { ...a, isOwner, requests };
}

/** Asks the owner for access to something in the actor's workspace; the owner hears about it. Returns what happened. */
export async function requestAccess(actor: Actor, type: ObjectType, id: number, effects: NoticeEffects = noticeEffectsFor(actor)): Promise<string> {
  assertType(type);
  const { data: obj } = await db().from(table(type)).select("*").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!obj) throw new Forbidden();
  if (await canSee(actor, type, id)) return "You can see it already.";
  const { data: open } = await db().from("access_requests").select("id").eq("workspace_id", actor.workspaceId).eq("requester_id", actor.personId).eq("object_type", type).eq("object_id", id).eq("status", "open").maybeSingle();
  if (open) return "You asked already; the owner has it.";
  await db().from("access_requests").insert({ requester_id: actor.personId, object_type: type, object_id: id, workspace_id: actor.workspaceId });
  const { data: me } = await db().from("profiles").select("name").eq("id", actor.personId).single();
  const who = me?.name ?? "Someone";
  await effects.notify({ recipientId: obj.owner_id, senderId: actor.personId, subject: `${who} asks to see ${obj.name}`, text: `${who} asks for access to the ${type} ${obj.name}. Grant or decline it under “Who can see this”.`, link: path(type, id, obj.slug) });
  return "Asked. The owner gets a message.";
}

/** The owner grants Viewer access or declines; the requester is told either way. Granting is sharing. */
export async function decideAccess(actor: Actor, requestId: number, grant: boolean, effects: NoticeEffects = noticeEffectsFor(actor)) {
  const { data: r } = await db().from("access_requests").select("*").eq("id", requestId).eq("status", "open").eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!r) throw new Forbidden();
  const { data: obj } = await db().from(table(r.object_type)).select("*").eq("id", r.object_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!obj || obj.owner_id !== actor.personId) throw new Forbidden();
  // Someone who has left the workspace since asking gets no access: the request is declined, not left open.
  const { data: stillHere } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).eq("user_id", r.requester_id).maybeSingle();
  if (!stillHere) grant = false;
  if (grant) await share(actor, r.object_type, r.object_id, r.requester_id, "viewer");
  await db().from("access_requests").update({ status: grant ? "granted" : "declined" }).eq("id", requestId).eq("workspace_id", actor.workspaceId);
  await effects.notify({ recipientId: r.requester_id, senderId: actor.personId, subject: grant ? `You can now see ${obj.name}` : `No access to ${obj.name}`, text: grant ? `${obj.name} is shared with you as Viewer.` : `The owner declined your request for ${obj.name}.`, link: path(r.object_type, r.object_id, obj.slug) });
}
