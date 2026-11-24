"use server";
// View Designs of the Workspace (spec 0024, GLOSSARY: View Design): thin calls into the core, which checks the file
// again on the server and who may add or remove one (Owners and Admins).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import * as designs from "@ziffr/core/view-designs";

/** Adds a View Design to the Workspace from its file's text; returns the problems with their lines when it fails. */
export async function addViewDesign(text: string) {
  const res = await designs.addViewDesign(await currentActor(), String(text ?? ""));
  if (res.ok) revalidatePath("/settings/library");
  return res;
}

/** Removes a View Design from the Workspace; widgets drawn with it keep their copy. */
export async function removeViewDesign(id: number) {
  await designs.removeViewDesign(await currentActor(), Number(id));
  revalidatePath("/settings/library");
}
