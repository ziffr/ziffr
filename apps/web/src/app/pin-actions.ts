"use server";
// Pinned dashboards (GLOSSARY: Pinned Dashboard; ticket #509): thin calls into the core (@ziffr/core/pinned-dashboards).
// The core checks that the dashboard may be opened by the acting person, the limit of eight, and refuses the demo.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as pins from "@ziffr/core/pinned-dashboards";

/** The sidebar is in the root layout, so every page shows a changed list. */
const refresh = () => revalidatePath("/", "layout");

/** Pins a dashboard for the acting person, at the end of their list. */
export async function pinDashboard(dashboardId: number) {
  return attempt(async () => {
    await pins.pinDashboard(await currentActor(), Number(dashboardId));
    refresh();
  });
}

/** Unpins a dashboard of the acting person. */
export async function unpinDashboard(dashboardId: number) {
  return attempt(async () => {
    await pins.unpinDashboard(await currentActor(), Number(dashboardId));
    refresh();
  });
}

/** Puts the acting person's pinned dashboards in the given order (by drag or Move up/down). */
export async function reorderPinned(ids: number[]) {
  return attempt(async () => {
    await pins.setPinnedOrder(await currentActor(), Array.isArray(ids) ? ids.map(Number) : []);
    refresh();
  });
}
