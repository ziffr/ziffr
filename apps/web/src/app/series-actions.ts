"use server";
// A Metric's Target Series, Projections, description and Sources (GLOSSARY: Target Series, Projection, Metric, Editor),
// changed by its owner or its Editors through the core; only the owner deletes it. Owners, Admins and the owner
// archive it and bring it back (GLOSSARY: Archived Metric).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { inDemoVisit } from "@/lib/demo-visit-action";
import { demoTextForVisit } from "@ziffr/core/demo-text";
import { askMeNow as coreAskMeNow, type AskNowResult } from "@ziffr/core/ask-now";
import { recordOwnValue } from "@ziffr/core/record-own-value";
import { handOverMetric } from "@ziffr/core/metric-owner";
import { archiveMetric as coreArchiveMetric, restoreMetric as coreRestoreMetric } from "@ziffr/core/archived-metrics";
import { sameNamedMetrics as coreSameNamedMetrics } from "@ziffr/core/metric-name-check";
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
  // In the demo the Prompt goes to the Outbox, where it can be answered as the person it went to (spec 0051).
  return attempt(() => inDemoVisit("series-actions:askMeNow", async () => {
    const r = await coreAskMeNow(await currentActor(), Number(metricId));
    revalidatePath("/", "layout");
    return r;
  }, { askNow: true }));
}

/** What the Record a value form shows after sending: the intake's own words, and whether the value counted. */
export type RecordedValue = { ok: boolean; detail: string };

/** A Submitter records a value for a Metric from its page, through the same intake as their form link (Submission Rule,
 * Locks, Approvals, Retention); the core checks they submit it and reads the text, so only strings are taken here. */
export async function recordValue(metricId: number, input: { value: string; breakdown?: string; period?: string }): Promise<RecordedValue | { error: string }> {
  // A visitor's texts (the total, the Breakdown's labels) go through the text rules first (spec 0051).
  return attempt(() => inDemoVisit("series-actions:recordValue", async (visiting) => {
    const r = await recordOwnValue(await currentActor(), Number(metricId), {
      value: demoTextForVisit(visiting, String(input?.value ?? ""), "name"), breakdown: demoTextForVisit(visiting, String(input?.breakdown ?? ""), "message"), period: input?.period ? String(input.period) : undefined,
    });
    revalidatePath("/", "layout");
    return { ok: r.ok, detail: r.detail };
  }));
}

/** Metrics the person sees that already have this name, to warn before a Metric gets it (a warning, not a refusal). */
export async function sameNamedMetrics(name: string, exceptMetricId?: number) {
  return attempt(async () => coreSameNamedMetrics(await currentActor(), String(name ?? ""), exceptMetricId === undefined ? undefined : Number(exceptMetricId)));
}

/** The Metric's owner, an Owner or an Admin hands it to another Member (GLOSSARY: Metric Owner); the core checks who. */
export async function handOverMetricTo(metricId: number, toId: string) {
  return attempt(async () => {
    await handOverMetric(await currentActor(), Number(metricId), String(toId));
    revalidatePath("/", "layout");
  });
}
