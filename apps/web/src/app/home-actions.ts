"use server";
// Home (spec 0010, ticket #146; GLOSSARY: Dashboard): the person chooses which dashboard Ziffr opens on. The core
// accepts only a dashboard they may open, and only for themselves.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { attemptAsVisitor } from "@/lib/demo-write";
import { setHomeDashboard } from "@ziffr/core/home";
import { createDashboard } from "@ziffr/core/dashboards";
import { chooseTrialExample, removeTrialExample } from "@ziffr/core/trial-example";
import { redirect } from "next/navigation";

/** Makes this dashboard the person's Home. */
export async function setHome(dashboardId: number) {
  return attempt(async () => {
    await setHomeDashboard(await currentActor(), Number(dashboardId));
    revalidatePath("/", "layout");
  });
}

/** "Try the example" on the start screen: the core makes it for a trial's Owner and makes its dashboard their Home. */
export async function tryExample() {
  return attempt(async () => {
    const id = await chooseTrialExample(await currentActor());
    revalidatePath("/", "layout");
    return { dashboardId: id };
  });
}

/** Removes the trial's example. Untrusted input: the core checks that the dashboard is the example and the actor's. */
export async function removeExample(dashboardId: number) {
  return attempt(async () => {
    const removed = await removeTrialExample(await currentActor(), Number(dashboardId));
    revalidatePath("/", "layout");
    return removed;
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
