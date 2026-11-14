import { notFound } from "next/navigation";
import { currentActor, viewerId } from "@/lib/viewer";
import { dashboardWidgets } from "@ziffr/core/page-data";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PresentDashboard } from "@/components/present-dashboard";

export default async function PresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const [dashboards, data] = await Promise.all([visibleDashboards(viewer), getCanvasData(viewer)]);
  const current = dashboards.find((d) => d.id === id);
  if (!current) notFound();
  const widgets = await dashboardWidgets(await currentActor(), id);
  return <PresentDashboard dashboard={current} data={data} widgets={widgets} start={Number((await searchParams).at) || 0} />;
}
