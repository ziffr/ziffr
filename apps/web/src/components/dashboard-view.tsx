import { currentActor, viewerId } from "@/lib/viewer";
import { closedDashboardOwner, dashboardWidgets, savedWidgets } from "@ziffr/core/page-data";
import { getCanvasData, getRawShares, revealedBy, visibleDashboards } from "@/lib/access";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { DashboardScreen } from "@/app/dashboards/screen";

export async function DashboardView({ id }: { id?: number }) {
  const viewer = await viewerId();
  const actor = await currentActor();
  const [dashboards, data, shares, saved] = await Promise.all([visibleDashboards(viewer), getCanvasData(viewer), getRawShares(), savedWidgets(actor)]);
  const current = dashboards.find((d) => d.id === id) ?? (id ? null : dashboards[0] ?? null);
  const ws = current ? await dashboardWidgets(actor, current.id) : [];
  // Only the owner shares, so only they need to know what a share would also show.
  const reveals = current?.role === "owner" ? await revealedBy([...new Set(ws.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))], current.owner_id) : {};
  // Opened by link but not shared: offer to ask the owner, without showing its name.
  let closed: { id: number; owner: string } | null = null;
  if (id && !current) {
    // Only a dashboard of this workspace; one elsewhere stays unknown.
    const owner = await closedDashboardOwner(actor, id);
    if (owner) closed = { id, owner };
  }
  return <DashboardScreen data={data} dashboards={dashboards} current={current} widgets={ws} saved={saved} shares={shares} reveals={reveals} closed={closed} />;
}
