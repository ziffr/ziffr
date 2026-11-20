"use server";
// Make room (spec 0029, ticket #270; GLOSSARY: Archived Metric): an Owner or Admin archives the Metrics they ticked
// so the Workspace fits a smaller Size. The core checks who and every Metric.
import { revalidatePath } from "next/cache";
import { archiveForRoom as coreArchiveForRoom } from "@ziffr/core/make-room";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";

/** Archives the ticked Metrics; answers how many were archived. */
export async function archiveForRoom(ids: number[]) {
  return attempt(async () => {
    const n = await coreArchiveForRoom(await currentActor(), ids);
    revalidatePath("/", "layout");
    return { archived: n };
  });
}
