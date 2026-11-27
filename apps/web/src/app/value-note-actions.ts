"use server";
// Writing and changing Value Notes (GLOSSARY: Value Note; spec 0064) as thin calls into the core
// (@ziffr/core/value-notes). The core checks, on every call, that the signed-in person sees the value and may write or
// change this note, checks the words and the ids a browser sends, and refuses the demo.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as notes from "@ziffr/core/value-notes";

/** A note shows on the Period Record, the Metric's page, a task's page and dashboards: all are read afresh. */
async function changed(work: () => Promise<unknown>) {
  return attempt(async () => {
    await work();
    revalidatePath("/", "layout");
  });
}

/** Writes a note on a period's value. */
export async function writeNote(metricId: number, period: string, words: string) {
  return changed(async () => notes.writeValueNote(await currentActor(), { metricId: Number(metricId), period: String(period), words }));
}

/** Corrects a note: the new words show, the earlier ones stay in the history. */
export async function correctNote(noteId: number, words: string) {
  return changed(async () => notes.correctValueNote(await currentActor(), Number(noteId), words));
}

/** Removes a note: its words are hidden and the history says who removed it. */
export async function removeNote(noteId: number) {
  return changed(async () => notes.removeValueNote(await currentActor(), Number(noteId)));
}

/** Deletes a note's words for good (the Metric Owner). */
export async function deleteNoteForGood(noteId: number) {
  return changed(async () => notes.deleteValueNoteForGood(await currentActor(), Number(noteId)));
}
