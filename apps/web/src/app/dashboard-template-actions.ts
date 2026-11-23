"use server";
// Dashboard Templates (spec 0014, GLOSSARY: Dashboard Template): thin calls into the core. Everyone who may create uses
// them; only the creator of a team one changes it; the core checks every Slot's Metrics against the viewer.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { createDashboardFromTemplate } from "@ziffr/core/dashboard-templates";
import { dashboardTemplateDraft, saveDashboardTemplate } from "@ziffr/core/templates";

/** Makes a dashboard of the viewer's from a template, with one list of Metric ids per Slot; returns its id. */
export async function createFromDashboardTemplate(template: number | string, name: string, fills: number[][], tagFills: (string | null)[] = []) {
  return attempt(async () => {
    const id = await createDashboardFromTemplate(await currentActor(), { template: typeof template === "number" ? template : String(template), name: String(name ?? ""), fills, tagFills });
    revalidatePath("/", "layout");
    return id;
  });
}

/** What saving this dashboard as a template would make: its Slots, the widgets left out and what changes. */
export async function draftDashboardTemplate(dashboardId: number) {
  return attempt(async () => dashboardTemplateDraft(await currentActor(), Number(dashboardId)));
}

/** Saves the dashboard as a team Dashboard Template, new or replacing one of the viewer's own. */
export async function saveAsDashboardTemplate(input: { dashboardId: number; name: string; description: string; labels: string[]; replaceId?: number | null }) {
  return attempt(async () => {
    const id = await saveDashboardTemplate(await currentActor(), input);
    revalidatePath("/", "layout");
    return id;
  });
}
