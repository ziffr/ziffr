import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { AnalyzeScreen } from "./screen";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const viewer = await viewerId();
  const sp = await searchParams;
  const data = await getCanvasData(viewer);
  // "Analyze" from a metric page drops that metric onto the canvas.
  if (sp.add && data.metrics.some((m) => m.id === Number(sp.add))) {
    await db.from("analysis_canvas").upsert({ user_id: viewer, metric_id: Number(sp.add), position: 99 }, { onConflict: "user_id,metric_id", ignoreDuplicates: true });
  }
  const [{ data: canvas }, dashboards] = await Promise.all([
    db.from("analysis_canvas").select("metric_id").eq("user_id", viewer).order("position"),
    visibleDashboards(viewer),
  ]);
  const onCanvas = (canvas ?? []).map((c) => c.metric_id).filter((id) => data.metrics.some((m) => m.id === id));
  return (
    <>
      <PageHeader title="Analyze" sub="Drop metrics on the canvas, then pick an analysis or a ready-made recipe. Save any result as a widget." />
      <AnalyzeScreen data={data} onCanvas={onCanvas} targets={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
