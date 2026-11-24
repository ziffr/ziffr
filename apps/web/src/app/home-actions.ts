"use server";
// Home (spec 0010, ticket #146; GLOSSARY: Dashboard): the person chooses which dashboard Ziffr opens on. The core
// accepts only a dashboard they may open, and only for themselves.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { attemptAsVisitor } from "@/lib/demo-write";
import { setHomeDashboard } from "@ziffr/core/home";
import { createDashboard } from "@ziffr/core/dashboards";
import { redirect } from "next/navigation";

/** Makes this dashboard the person's Home. */
export async function setHome(dashboardId: number) {
  return attempt(async () => {
    await setHomeDashboard(await currentActor(), Number(dashboardId));
    revalidatePath("/", "layout");
  });
}

/** Starts a new dashboard from the dashboards list and opens it (in edit mode, being empty). */
export async function newDashboard(_previous: unknown, form: FormData) {
  return attemptAsVisitor("home-actions:newDashboard", async () => {
    const id = await createDashboard(await currentActor(), String(form.get("name") ?? ""));
    revalidatePath("/", "layout");
    redirect(`/dashboards/${id}`);
  });
}
