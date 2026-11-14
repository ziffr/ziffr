"use server";
// Target Series and Projections (GLOSSARY: Target Series, Projection): uploaded by the Metric owner through the core.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { saveSeriesRows as coreSaveSeriesRows, uploadSeries as coreUploadSeries } from "@ziffr/core/metrics";

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
