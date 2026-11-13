"use server";
// View Links (GLOSSARY: View Link): made, listed and revoked by the owner of the dashboard or deck.
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { assertCanSeeMetrics, forbidden } from "@/lib/guards";
import { buildView } from "@/lib/view-links";

const MAX_DAYS = 90;

async function assertOwner(type: "dashboard" | "deck", id: number, viewer: string) {
  if (type !== "dashboard" && type !== "deck") forbidden();
  const { data } = await db.from(type === "deck" ? "decks" : "dashboards").select("owner_id").eq("id", id).maybeSingle();
  if (!data || data.owner_id !== viewer) forbidden();
}

export async function listViewLinks(type: "dashboard" | "deck", id: number) {
  await assertOwner(type, id, await viewerId());
  const { data } = await db.from("view_links").select("id, token, label, expires_at, revoked_at, created_at, frozen").eq("object_type", type).eq("object_id", id).order("id", { ascending: false });
  return (data ?? []).map((l) => ({ id: l.id, token: l.token, label: l.label, expires_at: l.expires_at, revoked: Boolean(l.revoked_at), created_at: l.created_at, frozen: Boolean(l.frozen) }));
}

export async function createViewLink(type: "dashboard" | "deck", id: number, input: { label: string; expires: string; frozen: boolean }) {
  const viewer = await viewerId();
  await assertOwner(type, id, viewer);
  const today = new Date().toISOString().slice(0, 10);
  const latest = new Date(Date.now() + MAX_DAYS * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expires) || input.expires < today || input.expires > latest) throw new Error(`Pick an end date within ${MAX_DAYS} days.`);
  const view = await buildView(type, id);
  if (!view) forbidden();
  // Only what its owner may see goes out.
  await assertCanSeeMetrics(view!.data.metrics.map((m) => m.id), viewer);
  const token = randomBytes(24).toString("base64url");
  await db.from("view_links").insert({ token, object_type: type, object_id: id, created_by: viewer, label: String(input.label ?? "").slice(0, 80), expires_at: input.expires, frozen: input.frozen ? view : null, metric_ids: view!.data.metrics.map((m) => m.id) });
  revalidatePath("/", "layout");
  return token;
}

export async function revokeViewLink(linkId: number) {
  const viewer = await viewerId();
  const { data: l } = await db.from("view_links").select("object_type, object_id").eq("id", linkId).maybeSingle();
  if (!l) forbidden();
  await assertOwner(l!.object_type, l!.object_id, viewer);
  await db.from("view_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId);
  revalidatePath("/", "layout");
}
