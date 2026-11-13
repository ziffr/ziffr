import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData, getRawShares, visibleDashboards } from "@/lib/access";
import { DashboardScreen } from "@/app/dashboards/screen";
import type { Widget } from "@/lib/types";

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
  return <DashboardScreen data={data} dashboards={dashboards} current={current} widgets={(widgets ?? []) as Widget[]} saved={(saved ?? []) as Widget[]} shares={shares} />;
}
