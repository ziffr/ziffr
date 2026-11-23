"use server";
// View Links (GLOSSARY: View Link): made, listed and revoked by the owner of the dashboard or deck, through the core.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as links from "@ziffr/core/view-links";
import { listSnapshots } from "@ziffr/core/snapshots";
import { fixTagLists, tagWidgetCount } from "@ziffr/core/tag-lists";
import { visibleDashboards } from "@ziffr/core/access";

/** The View Links of a dashboard or deck, for its owner. */
export async function listViewLinks(type: "dashboard" | "deck", id: number) {
  return links.listViewLinks(await currentActor(), type, Number(id));
}

/** Makes a View Link; returns its token. */
export async function createViewLink(type: "dashboard" | "deck", id: number, input: { label: string; expires: string; frozen: boolean; snapshotId?: number | null; showNames?: boolean }) {
  return attempt(async () => {
    const token = await links.createViewLink(await currentActor(), type, Number(id), { label: String(input?.label ?? ""), expires: String(input?.expires ?? ""), frozen: Boolean(input?.frozen), snapshotId: input?.snapshotId === null || input?.snapshotId === undefined ? null : Number(input.snapshotId), showNames: input?.showNames === true });
    revalidatePath("/", "layout");
    return token;
  });
}

/** A dashboard's Snapshots a View Link may show: those already shown (spec 0013). */
export async function shownSnapshots(dashboardId: number) {
  return (await listSnapshots(await currentActor(), Number(dashboardId))).filter((s) => s.shownAt).map((s) => ({ id: s.id, label: s.label }));
}

/** How many widgets of the owner's dashboard show all Metrics with a Tag: a View Link needs their lists fixed first (spec 0038). */
export async function tagListsToFix(dashboardId: number): Promise<number> {
  const actor = await currentActor();
  const id = Number(dashboardId);
  // Only the dashboard's owner makes View Links; anyone else is told nothing.
  if (!(await visibleDashboards(actor.workspaceId, actor.personId)).some((d) => d.id === id && d.role === "owner")) return 0;
  return tagWidgetCount(actor.workspaceId, id);
}

/** "Fix the list": replaces each Tag widget by the Metrics the owner sees now (spec 0038). */
export async function fixListsForLink(dashboardId: number) {
  return attempt(async () => {
    const n = await fixTagLists(await currentActor(), Number(dashboardId));
    revalidatePath("/", "layout");
    return n;
  });
}

/** Switches whether a View Link shows people's names (ticket #590). */
export async function setViewLinkNames(linkId: number, showNames: boolean) {
  return attempt(async () => {
    await links.setViewLinkNames(await currentActor(), Number(linkId), showNames === true);
    revalidatePath("/", "layout");
  });
}

/** Revokes a View Link. */
export async function revokeViewLink(linkId: number) {
  return attempt(async () => {
    await links.revokeViewLink(await currentActor(), Number(linkId));
    revalidatePath("/", "layout");
  });
}
