"use server";
// The Usage page (spec 0031, ticket #364; GLOSSARY: Usage, Archived Metric): an Owner or Admin archives the Metrics
// they ticked from the suggestions. The core checks who, and every Metric.
import { revalidatePath } from "next/cache";
import { archiveMetrics } from "@ziffr/core/usage-report";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";

/** Archives the ticked Metrics, all or none; answers how many were archived. */
export async function archiveUnused(ids: number[]) {
  return attempt(async () => {
    const n = await archiveMetrics(await currentActor(), ids);
    revalidatePath("/", "layout");
    return { archived: n };
  });
}
