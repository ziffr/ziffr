"use server";
// Snapshots (spec 0013, ticket #175; GLOSSARY: Snapshot): server actions for taking, writing, showing and deleting
// one. The core decides who may: the dashboard's owner and Editors take, write and show; only its owner deletes.
// In the demo (spec 0051, ticket 10) a visitor takes Snapshots of their own dashboards one at a time in the whole demo
// (`withSnapshotTurn`) and writes, shows and deletes those; the seed's Snapshots stay as they are.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { attemptAsVisitor } from "@/lib/demo-write";
import * as snapshots from "@ziffr/core/snapshots";
import { withSnapshotTurn } from "@ziffr/core/demo-snapshot-lock";
import * as autoSnapshots from "@ziffr/core/auto-snapshots";

const done = () => revalidatePath("/", "layout");

/** Takes a Snapshot of a dashboard for a week, month, quarter, half-year or year and opens it, to write it up. */
export async function takeSnapshot(dashboardId: number, kind: string, start: string) {
  return attemptAsVisitor("snapshot-actions:takeSnapshot", async (who) => {
    const actor = await currentActor();
    // A Snapshot certain to fail at the write is refused before the demo's one turn is taken, so it cannot keep the turn busy.
    const period = { kind: String(kind), start: String(start) };
    await snapshots.assertSnapshotRoom(actor, Number(dashboardId), period);
    const id = await withSnapshotTurn(actor, who, (turn) => snapshots.takeSnapshot(actor, Number(dashboardId), { kind: String(kind), start: String(start) }, turn ? { turn } : {}));
    done();
    redirect(`/dashboards/${Number(dashboardId)}/snapshots/${id}`);
  });
}

/** Sets whether a dashboard takes a Snapshot of every week, month, quarter, half-year or year by itself; only its
 * owner may. */
export async function setAutoSnapshots(dashboardId: number, every: string | null, waitDays: number) {
  return attempt(async () => {
    await autoSnapshots.setAutoSnapshots(await currentActor(), Number(dashboardId), { every: every || null, waitDays: Number(waitDays) });
    done();
  });
}

/** Saves what is written about a Snapshot: its introduction and its widgets' words. */
export async function editSnapshotWords(snapshotId: number, words: snapshots.SnapshotWords) {
  return attemptAsVisitor("snapshot-actions:editSnapshotWords", async () => {
    await snapshots.editSnapshotWords(await currentActor(), Number(snapshotId), words);
    done();
  });
}

/** Ends a Snapshot's draft, so everyone who may open the dashboard sees it. */
export async function showSnapshot(snapshotId: number) {
  return attemptAsVisitor("snapshot-actions:showSnapshot", async () => {
    await snapshots.showSnapshot(await currentActor(), Number(snapshotId));
    done();
  });
}

/** Deletes a Snapshot and goes back to its dashboard. */
export async function deleteSnapshot(snapshotId: number, dashboardId: number) {
  return attemptAsVisitor("snapshot-actions:deleteSnapshot", async () => {
    await snapshots.deleteSnapshot(await currentActor(), Number(snapshotId));
    done();
    redirect(`/dashboards/${Number(dashboardId)}`);
  });
}
