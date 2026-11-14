import { currentActor } from "@/lib/viewer";
import { canvasAdd, canvasMetricIds } from "@ziffr/core/dashboards";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { AnalyzeScreen } from "./screen";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const actor = await currentActor();
  const viewer = actor.personId;
  const sp = await searchParams;
  const data = await getCanvasData(viewer);
  // "Analyze" from a metric page drops that metric onto the canvas.
  if (sp.add && data.metrics.some((m) => m.id === Number(sp.add))) await canvasAdd(actor, [Number(sp.add)]);
  const [canvas, dashboards] = await Promise.all([
    canvasMetricIds(actor),
    visibleDashboards(viewer),
  ]);
  const onCanvas = canvas.filter((id) => data.metrics.some((m) => m.id === id));
  return (
    <>
      <PageHeader title="Analyze" sub="Drop metrics on the canvas, then pick an analysis or a ready-made recipe. Save any result as a widget." />
      <AnalyzeScreen data={data} onCanvas={onCanvas} targets={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
