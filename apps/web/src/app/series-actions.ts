"use server";
// A Metric's Target Series, Projections, description and Sources (GLOSSARY: Target Series, Projection, Metric, Editor),
// changed by its owner or its Editors through the core; only the owner deletes it. Owners, Admins and the owner
// archive it and bring it back (GLOSSARY: Archived Metric).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { askMeNow as coreAskMeNow, type AskNowResult } from "@ziffr/core/ask-now";
import { archiveMetric as coreArchiveMetric, restoreMetric as coreRestoreMetric } from "@ziffr/core/archived-metrics";
import { deleteMetric as coreDeleteMetric, setMetricSources as coreSetMetricSources, updateMetricDetails as coreUpdateMetricDetails, type MetricDetails, removeSeriesRows as coreRemoveSeriesRows, saveSeriesRows as coreSaveSeriesRows } from "@ziffr/core/metrics";

/** The Metric's owner or an Editor saves rows edited in the targets table; the core checks every row. */
export async function saveSeriesRows(metricId: number, kind: "target" | "projection", rows: { period: string; value: number }[], note: string) {
  return attempt(async () => {
    const r = await coreSaveSeriesRows(await currentActor(), Number(metricId), kind, rows, String(note ?? ""));
    revalidatePath("/", "layout");
    return r;
  });
}

/** The Metric's owner or an Editor removes saved rows from the targets table, by period; the core checks every period. */
export async function removeSeriesRows(metricId: number, kind: "target" | "projection", periods: string[]) {
  return attempt(async () => {
    const r = await coreRemoveSeriesRows(await currentActor(), Number(metricId), kind, periods);
    revalidatePath("/", "layout");
    return r;
  });
}

/** The Metric owner deletes it, typing its name to confirm; the core refuses while anything else uses it. */
export async function deleteMetric(metricId: number, confirmName: string) {
  return attempt(async () => {
    const r = await coreDeleteMetric(await currentActor(), Number(metricId), String(confirmName ?? ""));
    revalidatePath("/", "layout");
    return r;
  });
}

/** An Owner, an Admin or the Metric's owner archives it (GLOSSARY: Archived Metric); the core checks who. */
export async function archiveMetric(metricId: number) {
  return attempt(async () => {
    const r = await coreArchiveMetric(await currentActor(), Number(metricId));
    revalidatePath("/", "layout");
    return r;
  });
}

/** An Owner, an Admin or the Metric's owner brings an Archived Metric back; the core checks who. */
export async function restoreMetric(metricId: number) {
  return attempt(async () => {
    const r = await coreRestoreMetric(await currentActor(), Number(metricId));
    revalidatePath("/", "layout");
    return r;
  });
}

/** The Metric's owner or an Editor changes how its values may arrive; the core checks who and the list. */
export async function setMetricSources(metricId: number, sources: string[]) {
  return attempt(async () => {
    const r = await coreSetMetricSources(await currentActor(), Number(metricId), sources);
    revalidatePath("/", "layout");
    return r;
  });
}

/** The Metric's owner or an Editor changes its description; the core checks who and every field. */
export async function updateMetricDetails(metricId: number, details: MetricDetails) {
  return attempt(async () => {
    await coreUpdateMetricDetails(await currentActor(), Number(metricId), details);
    revalidatePath("/", "layout");
  });
}

/** The Metric's owner, who also submits it, asks for its current Prompt now (spec 0021); the core checks who and how
 * often, and says where the Prompt went. */
export async function askMeNow(metricId: number): Promise<AskNowResult | { error: string }> {
  // Words for the person (asked a moment ago, not theirs to ask) come back as a value: production hides thrown ones.
  return attempt(async () => {
    const r = await coreAskMeNow(await currentActor(), Number(metricId));
    revalidatePath("/", "layout");
    return r;
  });
}
