import { currentActor, viewerId } from "@/lib/viewer";
import { closedDashboardOwner, dashboardWidgets, hasVisibleValue, savedWidgets } from "@ziffr/core/page-data";
import { getCanvasData, getRawShares, revealedBy, visibleDashboards } from "@/lib/access";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { DashboardScreen } from "@/app/dashboards/screen";
import { can } from "@ziffr/core/actor";
import { workspaceClock } from "@ziffr/core/workspace-clock";
import { isDemo } from "@/lib/auth";

/** One dashboard of the viewer's, or their first one, with everything its screen needs. */
export async function DashboardView({ id }: { id?: number }) {
  const viewer = await viewerId();
  const actor = await currentActor();
  const [dashboards, shares, saved] = await Promise.all([visibleDashboards(viewer), getRawShares(), savedWidgets(actor)]);
  const current = dashboards.find((d) => d.id === id) ?? (id ? null : dashboards[0] ?? null);
  const ws = current ? await dashboardWidgets(actor, current.id) : [];
  // Only the series this dashboard draws go to the browser; a widget placed or a Metric picked later fetches its own.
  const data = await getCanvasData(viewer, [...new Set(ws.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))]);
  // Only the owner shares, so only they need to know what a share would also show.
  const reveals = current?.role === "owner" ? await revealedBy([...new Set(ws.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))], current.owner_id) : {};
  // Opened by link but not shared: offer to ask the owner, without showing its name.
  let closed: { id: number; owner: string } | null = null;
  if (id && !current) {
    // Only a dashboard of this workspace; one elsewhere stays unknown.
    const owner = await closedDashboardOwner(actor, id);
    if (owner) closed = { id, owner };
  }
  // A workspace without dashboards gets the first-run checklist; what it may show depends on the role.
  const firstRun = !dashboards.length && !closed && !(await isDemo())
    ? { canCreate: can(actor, "create"), canManage: can(actor, "manage-members"), clockSet: can(actor, "manage-members") ? (await workspaceClock(actor)).timeZone !== "UTC" : true, hasValue: await hasVisibleValue(actor) }
    : null;
  return <DashboardScreen data={data} dashboards={dashboards} current={current} widgets={ws} saved={saved} shares={shares} reveals={reveals} closed={closed} firstRun={firstRun} />;
}
