"use server";
// "Who can see this" and asking for access (GLOSSARY: Share). The owner hears about a request through their
// Connector and grants or declines it in the same panel.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { actingWorkspace, assertCanSeeMetrics, assertCanShare, forbidden } from "@/lib/guards";
import { audience, deckMetricIds, visibleDashboards, visibleDecks, visibleMetricIds, type ObjectType } from "@/lib/access";
import { getMetrics } from "@/lib/data";
import { deliverNotice } from "@/lib/deliveries";

const TYPES: ObjectType[] = ["metric", "dashboard", "deck"];
const table = (t: ObjectType) => (t === "metric" ? "metrics" : t === "deck" ? "decks" : "dashboards");
const path = (t: ObjectType, id: number, slug?: string) => (t === "metric" ? `/metrics/${slug}` : `/${t}s/${id}`);

async function canSee(type: ObjectType, id: number, viewer: string) {
  if (type === "metric") return (await visibleMetricIds(viewer, await getMetrics())).has(id);
  if (type === "dashboard") return (await visibleDashboards(viewer)).some((d) => d.id === id);
  return (await visibleDecks(viewer)).some((d) => d.id === id);
}

/** Who can see it and why. Only for people who can see it themselves; the owner also gets open requests. */
export async function whoCanSee(type: ObjectType, id: number) {
  const viewer = await viewerId();
  if (!TYPES.includes(type) || !(await canSee(type, id, viewer))) forbidden();
  const a = await audience(type, id, viewer);
  if (!a) forbidden();
  const requests = a!.owner === viewer
    ? (await db.from("access_requests").select("id, requester_id, created_at").eq("object_type", type).eq("object_id", id).eq("status", "open").order("id")).data ?? []
    : [];
  return { ...a!, isOwner: a!.owner === viewer, requests };
}

export async function requestAccess(type: ObjectType, id: number) {
  const viewer = await viewerId();
  if (!TYPES.includes(type)) forbidden();
  const { data: obj } = await db.from(table(type)).select("*").eq("id", id).eq("workspace_id", await actingWorkspace()).maybeSingle();
  if (!obj) forbidden();
  if (await canSee(type, id, viewer)) return "You can see it already.";
  const { data: open } = await db.from("access_requests").select("id").eq("requester_id", viewer).eq("object_type", type).eq("object_id", id).eq("status", "open").maybeSingle();
  if (open) return "You asked already; the owner has it.";
  await db.from("access_requests").insert({ requester_id: viewer, object_type: type, object_id: id });
  const { data: me } = await db.from("profiles").select("name").eq("id", viewer).single();
  await deliverNotice({ recipientId: obj.owner_id, senderId: viewer, subject: `${me?.name ?? "Someone"} asks to see ${obj.name}`, text: `${me?.name ?? "Someone"} asks for access to the ${type} ${obj.name}. Grant or decline it under “Who can see this”.`, link: path(type, id, obj.slug) });
  revalidatePath("/", "layout");
  return "Asked. The owner gets a message.";
}

/** The owner grants Viewer access, or declines; the requester is told either way. */
export async function decideAccess(requestId: number, grant: boolean) {
  const viewer = await viewerId();
  const { data: r } = await db.from("access_requests").select("*").eq("id", requestId).eq("status", "open").eq("workspace_id", await actingWorkspace()).maybeSingle();
  if (!r) forbidden();
  const { data: obj } = await db.from(table(r.object_type)).select("*").eq("id", r.object_id).eq("workspace_id", await actingWorkspace()).maybeSingle();
  if (!obj || obj.owner_id !== viewer) forbidden();
  if (grant) {
    await assertCanShare(); // granting is sharing
    if (r.object_type === "deck") await assertCanSeeMetrics(deckMetricIds(obj.document), viewer);
    await db.from("shares").delete().eq("object_type", r.object_type).eq("object_id", r.object_id).eq("user_id", r.requester_id);
    await db.from("shares").insert({ object_type: r.object_type, object_id: r.object_id, user_id: r.requester_id, role: "viewer" });
  }
  await db.from("access_requests").update({ status: grant ? "granted" : "declined" }).eq("id", requestId);
  await deliverNotice({ recipientId: r.requester_id, senderId: viewer, subject: grant ? `You can now see ${obj.name}` : `No access to ${obj.name}`, text: grant ? `${obj.name} is shared with you as Viewer.` : `The owner declined your request for ${obj.name}.`, link: path(r.object_type, r.object_id, obj.slug) });
  revalidatePath("/", "layout");
}
