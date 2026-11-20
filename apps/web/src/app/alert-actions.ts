"use server";
// Alerts (GLOSSARY: Alert; spec 0032, ticket #375): thin calls into the core (@ziffr/core/alerts). An Alert is the
// acting person's own: the core checks sight of the Metric and the limits, and refuses the demo.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as alerts from "@ziffr/core/alerts";
import type { AlertChange, AlertInput } from "@ziffr/core/alerts";

/** Where Alerts are shown: the Metric's pages and the person's list. */
function refresh() {
  revalidatePath("/settings/alerts");
  revalidatePath("/metrics/[slug]", "page");
}

/** Makes an Alert for the acting person; the core checks the shape of every field again. */
export async function createAlert(input: AlertInput) {
  return attempt(async () => {
    await alerts.createAlert(await currentActor(), input);
    refresh();
  });
}

/** Changes one of the person's own Alerts: its condition, way of delivery, option, or the pause. */
export async function updateAlert(id: number, change: AlertChange) {
  return attempt(async () => {
    await alerts.updateAlert(await currentActor(), Number(id), change);
    refresh();
  });
}

/** Removes one of the person's own Alerts. */
export async function deleteAlert(id: number) {
  return attempt(async () => {
    await alerts.deleteAlert(await currentActor(), Number(id));
    refresh();
  });
}
