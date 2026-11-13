import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData, getRawShares, revealedBy, visibleDashboards } from "@/lib/access";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { DashboardScreen } from "@/app/dashboards/screen";
import type { Widget } from "@ziffr/core/types";

export async function DashboardView({ id }: { id?: number }) {
  const viewer = await viewerId();
  const [dashboards, data, shares, { data: saved }] = await Promise.all([
    visibleDashboards(viewer),
    getCanvasData(viewer),
    getRawShares(),
    db.from("widgets").select("*").eq("owner_id", viewer).eq("saved", true).order("id"),
  ]);
  const current = dashboards.find((d) => d.id === id) ?? (id ? null : dashboards[0] ?? null);
  const { data: widgets } = current ? await db.from("widgets").select("*").eq("dashboard_id", current.id).order("id") : { data: [] };
  const ws = (widgets ?? []) as Widget[];
  // Only the owner shares, so only they need to know what a share would also show.
  const reveals = current?.role === "owner" ? await revealedBy([...new Set(ws.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))], current.owner_id) : {};
  // Opened by link but not shared: offer to ask the owner, without showing its name.
  let closed: { id: number; owner: string } | null = null;
  if (id && !current) {
    const { data: d } = await db.from("dashboards").select("owner_id").eq("id", id).maybeSingle();
    if (d) closed = { id, owner: data.people.find((p) => p.id === d.owner_id)?.name.split(" ")[0] ?? "the owner" };
  }
  return <DashboardScreen data={data} dashboards={dashboards} current={current} widgets={ws} saved={(saved ?? []) as Widget[]} shares={shares} reveals={reveals} closed={closed} />;
}
