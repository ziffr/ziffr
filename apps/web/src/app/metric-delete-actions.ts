"use server";
// Deleting Metrics from the app (spec 0065; GLOSSARY: Metric, Metric Owner, Metric Record, Archived Metric): the
// preview, the deletion and archiving instead. The core checks who, what and that the record was downloaded; ids, ticks
// and typed words come from a browser and are passed on as they came, for it to check.
import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";
import { archiveChosenMetrics, deleteChosenMetrics, planMetricDelete, type DeleteChoices } from "@ziffr/core/metric-delete";

/** What deleting these Metrics would do with these ticks. Reading only. */
export async function previewMetricDelete(ids: number[], choices: DeleteChoices) {
  return attempt(async () => planMetricDelete(await currentActor(), ids, choices));
}

/** The Metric Owner deletes the previewed Metrics, having downloaded their record and typed the confirmation. */
export async function deleteMetrics(ids: number[], choices: DeleteChoices, confirm: string, seen: string) {
  return attempt(async () => {
    const r = await deleteChosenMetrics(await currentActor(), ids, choices, confirm, seen);
    revalidatePath("/", "layout");
    return r;
  });
}

/** Archives the picked Metrics instead: they ask for nothing more and keep everything. */
export async function archiveInstead(ids: number[]) {
  return attempt(async () => {
    const archived = await archiveChosenMetrics(await currentActor(), ids);
    revalidatePath("/", "layout");
    return { archived };
  });
}
