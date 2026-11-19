"use server";
// View Links (GLOSSARY: View Link): made, listed and revoked by the owner of the dashboard or deck, through the core.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { isDemo } from "@/lib/auth";
import * as links from "@ziffr/core/view-links";
import { listSnapshots } from "@ziffr/core/snapshots";

/** The View Links of a dashboard or deck, for its owner. */
export async function listViewLinks(type: "dashboard" | "deck", id: number) {
  return links.listViewLinks(await currentActor(), type, Number(id));
}

/** Makes a View Link; returns its token. */
export async function createViewLink(type: "dashboard" | "deck", id: number, input: { label: string; expires: string; frozen: boolean; snapshotId?: number | null }) {
  return attempt(async () => {
    // Visitors share the demo: a View Link from it would let anyone publish their own text under this site.
    if (await isDemo()) throw new Error("View Links cannot be made in the demo.");
    const token = await links.createViewLink(await currentActor(), type, Number(id), { label: String(input?.label ?? ""), expires: String(input?.expires ?? ""), frozen: Boolean(input?.frozen), snapshotId: input?.snapshotId === null || input?.snapshotId === undefined ? null : Number(input.snapshotId) });
    revalidatePath("/", "layout");
    return token;
  });
}

/** A dashboard's Snapshots a View Link may show: those already shown (spec 0013). */
export async function shownSnapshots(dashboardId: number) {
  return (await listSnapshots(await currentActor(), Number(dashboardId))).filter((s) => s.shownAt).map((s) => ({ id: s.id, label: s.label }));
}

/** Revokes a View Link. */
export async function revokeViewLink(linkId: number) {
  return attempt(async () => {
    await links.revokeViewLink(await currentActor(), Number(linkId));
    revalidatePath("/", "layout");
  });
}
