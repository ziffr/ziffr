"use server";
// View Links (GLOSSARY: View Link): made, listed and revoked by the owner of the dashboard or deck, through the core.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import * as links from "@ziffr/core/view-links";

/** The View Links of a dashboard or deck, for its owner. */
export async function listViewLinks(type: "dashboard" | "deck", id: number) {
  return links.listViewLinks(await currentActor(), type, Number(id));
}

/** Makes a View Link; returns its token. */
export async function createViewLink(type: "dashboard" | "deck", id: number, input: { label: string; expires: string; frozen: boolean }) {
  // Visitors share the demo: a View Link from it would let anyone publish their own text under this site.
  if (await isDemo()) throw new Error("View Links cannot be made in the demo.");
  const token = await links.createViewLink(await currentActor(), type, Number(id), input);
  revalidatePath("/", "layout");
  return token;
}

/** Revokes a View Link. */
export async function revokeViewLink(linkId: number) {
  await links.revokeViewLink(await currentActor(), Number(linkId));
  revalidatePath("/", "layout");
}
