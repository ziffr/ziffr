"use server";
// Tags on Metrics and the Tags page (GLOSSARY: Tag; spec 0038): the browser's side of the core's Tag functions. Words
// typed in a browser are untrusted: the core normalises, limits and checks every one, and who may do what. Nothing here
// queries the database.
import { revalidatePath } from "next/cache";
import { addMetricTags as coreAdd, removeMetricTags as coreRemove, deleteTag as coreDelete, mergeTags as coreMerge, renameTag as coreRename, tagImpact as coreImpact } from "@ziffr/core/tags";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";

/** Puts the typed words on a Metric as someone who may change it; answers the Metric's Tags now. */
export async function addTags(metricId: number, names: string[]) {
  return attempt(async () => {
    const tags = await coreAdd(await currentActor(), Number(metricId), Array.isArray(names) ? names.slice(0, 20).map((n) => String(n ?? "")) : []);
    revalidatePath("/", "layout");
    return { tags };
  });
}

/** Takes one Tag off a Metric as someone who may change it; answers the Metric's Tags now. */
export async function removeTag(metricId: number, name: string) {
  return attempt(async () => {
    const tags = await coreRemove(await currentActor(), Number(metricId), [String(name ?? "")]);
    revalidatePath("/", "layout");
    return { tags };
  });
}

/** What deleting a Tag touches, for its confirmation: Owners and Admins, for a Tag they see. */
export async function tagImpact(tagId: string) {
  return attempt(async () => coreImpact(await currentActor(), String(tagId ?? "")));
}

/** Renames a Tag for the whole Workspace (Owners and Admins). */
export async function renameTag(tagId: string, name: string) {
  return attempt(async () => {
    const r = await coreRename(await currentActor(), String(tagId ?? ""), String(name ?? ""));
    revalidatePath("/", "layout");
    return r;
  });
}

/** Merges one Tag into another (Owners and Admins). */
export async function mergeTags(fromId: string, intoId: string) {
  return attempt(async () => {
    const r = await coreMerge(await currentActor(), String(fromId ?? ""), String(intoId ?? ""));
    revalidatePath("/", "layout");
    return r;
  });
}

/** Deletes a Tag from every Metric (Owners and Admins). */
export async function deleteTag(tagId: string) {
  return attempt(async () => {
    const r = await coreDelete(await currentActor(), String(tagId ?? ""));
    revalidatePath("/", "layout");
    return r;
  });
}
