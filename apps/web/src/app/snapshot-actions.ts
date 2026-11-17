"use server";
// Snapshots (spec 0013, ticket #175; GLOSSARY: Snapshot): server actions for taking, writing, showing and deleting
// one. The core decides who may: the dashboard's owner and Editors take, write and show; only its owner deletes.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import * as snapshots from "@ziffr/core/snapshots";
import * as autoSnapshots from "@ziffr/core/auto-snapshots";

const done = () => revalidatePath("/", "layout");

/** Takes a Snapshot of a dashboard for a week, month, quarter, half-year or year and opens it, to write it up. */
export async function takeSnapshot(dashboardId: number, kind: string, start: string) {
  const id = await snapshots.takeSnapshot(await currentActor(), Number(dashboardId), { kind: String(kind), start: String(start) });
  done();
  redirect(`/dashboards/${Number(dashboardId)}/snapshots/${id}`);
}

/** Sets whether a dashboard takes a Snapshot of every week, month, quarter, half-year or year by itself; only its
 * owner may. */
export async function setAutoSnapshots(dashboardId: number, every: string | null, waitDays: number) {
  await autoSnapshots.setAutoSnapshots(await currentActor(), Number(dashboardId), { every: every || null, waitDays: Number(waitDays) });
  done();
}

/** Saves what is written about a Snapshot: its introduction and its widgets' words. */
export async function editSnapshotWords(snapshotId: number, words: snapshots.SnapshotWords) {
  await snapshots.editSnapshotWords(await currentActor(), Number(snapshotId), words);
  done();
}

/** Ends a Snapshot's draft, so everyone who may open the dashboard sees it. */
export async function showSnapshot(snapshotId: number) {
  await snapshots.showSnapshot(await currentActor(), Number(snapshotId));
  done();
}

/** Deletes a Snapshot and goes back to its dashboard. */
export async function deleteSnapshot(snapshotId: number, dashboardId: number) {
  await snapshots.deleteSnapshot(await currentActor(), Number(snapshotId));
  done();
  redirect(`/dashboards/${Number(dashboardId)}`);
}
