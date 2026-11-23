import { notFound } from "next/navigation";
import { currentActor, viewerId } from "@/lib/viewer";
import { dashboardWidgets } from "@ziffr/core/page-data";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PresentDashboard } from "@/components/present-dashboard";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { countView } from "@/lib/count-view";

export default async function PresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string; view?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const current = (await visibleDashboards(viewer)).find((d) => d.id === id);
  if (!current) notFound();
  const actor = await currentActor();
  void countView(actor, { kind: "dashboard", id });
  const widgets = await dashboardWidgets(actor, id);
  // Presenting draws only these widgets: only their series go to the browser.
  const data = await getCanvasData(viewer, [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))]);
  // `at` is a Widget's id (#826); an unknown or hidden id starts at the first Widget. Only widgets this person may see are in the list.
  const q = await searchParams;
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const start = Math.max(0, sorted.findIndex((w) => String(w.id) === q.at));
  return <PresentDashboard dashboard={current} data={data} widgets={widgets} start={start} single={q.view === "one"} />;
}
