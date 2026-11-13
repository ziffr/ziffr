import "server-only";
// Who may do what (PROTOTYPE: identity is the "View as" cookie, so these enforce the sharing model, not real security).
// Kept out of the "use server" files: everything exported there becomes a callable action.
import { db } from "./db";
import { visibleDashboards, visibleMetricIds } from "./access";
import { getMetrics } from "./data";
import type { WidgetSettings } from "./types";

export const forbidden = () => {
  throw new Error("Forbidden");
};

export async function dashboardRole(dashboardId: number, viewer: string) {
  return (await visibleDashboards(viewer)).find((d) => d.id === dashboardId)?.role ?? null;
}

export async function assertCanEditDashboard(dashboardId: number, viewer: string) {
  const role = await dashboardRole(dashboardId, viewer);
  if (role !== "owner" && role !== "editor") forbidden();
}

export async function assertCanSeeMetrics(ids: number[], viewer: string) {
  const visible = await visibleMetricIds(viewer, await getMetrics());
  if (!ids.every((id) => visible.has(id))) forbidden();
}

/** A widget may be edited by its dashboard's owner/editors, or (saved widgets) by its owner. */
export async function assertCanEditWidget(id: number, viewer: string) {
  const { data: w } = await db.from("widgets").select("*").eq("id", id).single();
  if (!w) forbidden();
  if (w.dashboard_id === null) {
    if (w.owner_id !== viewer) forbidden();
  } else await assertCanEditDashboard(w.dashboard_id, viewer);
}


/** Every metric a widget draws: its own and its story panels'. */
export const widgetMetricIds = (ids: number[], settings?: WidgetSettings) => [...new Set([...ids, ...(settings?.panels ?? []).flatMap((p) => p.metricIds ?? [])])];
