import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PresentDashboard } from "@/components/present-dashboard";
import type { Widget } from "@ziffr/core/types";

export default async function PresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const [dashboards, data] = await Promise.all([visibleDashboards(viewer), getCanvasData(viewer)]);
  const current = dashboards.find((d) => d.id === id);
  if (!current) notFound();
  const { data: widgets } = await db.from("widgets").select("*").eq("dashboard_id", id).order("y").order("x");
  return <PresentDashboard dashboard={current} data={data} widgets={(widgets ?? []) as Widget[]} start={Number((await searchParams).at) || 0} />;
}
