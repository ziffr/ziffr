"use server";
// Target Series and Projections (GLOSSARY: Target Series, Projection, Metric): uploaded by the Metric owner through the
// core, who can also delete the Metric there.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { deleteMetric as coreDeleteMetric, setMetricSources as coreSetMetricSources, updateMetricDetails as coreUpdateMetricDetails, type MetricDetails, removeSeriesRows as coreRemoveSeriesRows, saveSeriesRows as coreSaveSeriesRows, uploadSeries as coreUploadSeries } from "@ziffr/core/metrics";

/** The Metric owner saves rows edited in the targets table; the core checks every row. */
export async function saveSeriesRows(metricId: number, kind: "target" | "projection", rows: { period: string; value: number }[], note: string) {
  const r = await coreSaveSeriesRows(await currentActor(), Number(metricId), kind, rows, String(note ?? ""));
  revalidatePath("/", "layout");
  return r;
}

/** The Metric owner uploads a Target Series or Projection, one "period value" line each. */
export async function uploadSeries(metricId: number, kind: "target" | "projection", text: string, note: string) {
  const r = await coreUploadSeries(await currentActor(), Number(metricId), kind, String(text ?? ""), String(note ?? ""));
  revalidatePath("/", "layout");
  return r;
}

/** The Metric owner removes saved rows from the targets table, by period; the core checks every period. */
export async function removeSeriesRows(metricId: number, kind: "target" | "projection", periods: string[]) {
  const r = await coreRemoveSeriesRows(await currentActor(), Number(metricId), kind, periods);
  revalidatePath("/", "layout");
  return r;
}

/** The Metric owner deletes it, typing its name to confirm; the core refuses while anything else uses it. */
export async function deleteMetric(metricId: number, confirmName: string) {
  const r = await coreDeleteMetric(await currentActor(), Number(metricId), String(confirmName ?? ""));
  revalidatePath("/", "layout");
  return r;
}

/** The Metric's owner changes how its values may arrive; the core checks the owner and the list. */
export async function setMetricSources(metricId: number, sources: string[]) {
  const r = await coreSetMetricSources(await currentActor(), Number(metricId), sources);
  revalidatePath("/", "layout");
  return r;
}

/** The Metric's owner changes its description; the core checks the owner and every field. */
export async function updateMetricDetails(metricId: number, details: MetricDetails) {
  await coreUpdateMetricDetails(await currentActor(), Number(metricId), details);
  revalidatePath("/", "layout");
}
