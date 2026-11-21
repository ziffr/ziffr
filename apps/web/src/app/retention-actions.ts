"use server";
// Retention, the setting and its preview (GLOSSARY: Retention; spec 0033, ticket #381): thin calls into the core
// (@ziffr/core/retention-setting). The core checks who may set a Metric's Retention, that only Owners set the Workspace
// default, the counts a confirmation was shown, and refuses the demo. Nothing here condenses or deletes a value.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as retention from "@ziffr/core/retention-setting";

/** Where a Retention is shown: the Metric's page and the Workspace settings. */
function refresh() {
  revalidatePath("/metrics/[slug]", "page");
  revalidatePath("/settings/workspace");
}

/** What a Retention would do to one Metric, in counts (nothing is changed). */
export async function previewRetention(metricId: number, setting: unknown) {
  return attempt(async () => retention.retentionPreview(await currentActor(), Number(metricId), setting));
}

/** Sets a Metric's Retention (null turns it off). `shown` is the fingerprint of the preview the person saw, and `typed`
 * what they typed to confirm a delete; the core checks both. */
export async function setMetricRetention(metricId: number, setting: unknown, shown?: string, typed?: string) {
  return attempt(async () => {
    const r = await retention.setRetention(await currentActor(), Number(metricId), setting, shown, typed);
    refresh();
    return r;
  });
}

/** Cancels a confirmed Retention that has not started. */
export async function cancelMetricRetention(metricId: number) {
  return attempt(async () => {
    const r = await retention.cancelRetention(await currentActor(), Number(metricId));
    refresh();
    return r;
  });
}

/** Sets the Workspace's default Retention, copied into each new Metric (Owners only; null removes it). */
export async function setWorkspaceRetention(setting: unknown) {
  return attempt(async () => {
    await retention.setDefaultRetention(await currentActor(), setting);
    refresh();
  });
}

/** What the setting would do to every existing Metric that has none, in counts (Owners only; nothing is changed). */
export async function previewRetentionForAll(setting: unknown) {
  return attempt(async () => retention.retentionPreviewAll(await currentActor(), setting));
}

/** Applies the setting to every existing Metric that has none, as the preview showed (Owners only). */
export async function applyRetentionToAll(setting: unknown, shown?: string, typed?: string) {
  return attempt(async () => {
    const r = await retention.applyRetentionToExisting(await currentActor(), setting, shown, typed);
    refresh();
    return r;
  });
}
