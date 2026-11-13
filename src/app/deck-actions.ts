"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { ensureBaseline, recordVersion } from "@/lib/versions";

// PROTOTYPE: decks are private to their owner (sharing decks is not built yet).

async function ownDeck(id: number) {
  const { data } = await db.from("decks").select("id, owner_id").eq("id", id).single();
  if (!data || data.owner_id !== (await viewerId())) throw new Error("Forbidden");
}

export async function createDeck(form: FormData) {
  const name = String(form.get("name") ?? "").trim() || "Untitled deck";
  const { data: def } = await db.from("masters").select("id").eq("is_default", true).limit(1);
  const { data } = await db.from("decks").insert({ name, owner_id: await viewerId(), master_id: def?.[0]?.id ?? null }).select("id").single();
  revalidatePath("/decks");
  redirect(`/decks/${data?.id}`);
}

export async function saveDeck(id: number, document: unknown) {
  await ownDeck(id);
  await ensureBaseline("deck", id, await viewerId());
  await db.from("decks").update({ document, updated_at: new Date().toISOString() }).eq("id", id);
  await recordVersion("deck", id, await viewerId());
}

export async function renameDeck(id: number, name: string) {
  await ownDeck(id);
  await db.from("decks").update({ name: name.trim() || "Untitled deck", updated_at: new Date().toISOString() }).eq("id", id);
  await recordVersion("deck", id, await viewerId());
  revalidatePath("/decks");
}

export async function deleteDeck(id: number) {
  await ownDeck(id);
  await db.from("decks").delete().eq("id", id);
  revalidatePath("/decks");
  redirect("/decks");
}
