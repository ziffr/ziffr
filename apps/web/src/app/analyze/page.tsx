import { currentActor } from "@/lib/viewer";
import { canvasAdd, canvasMetricIds } from "@ziffr/core/dashboards";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { AnalyzeScreen } from "./screen";
import Link from "next/link";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const actor = await currentActor();
  const viewer = actor.personId;
  const sp = await searchParams;
  // "Analyze" from a metric page drops that metric onto the canvas (the core checks the person sees it).
  if (sp.add && /^\d{1,12}$/.test(sp.add)) await canvasAdd(actor, [Number(sp.add)]).catch(() => {});
  const [canvas, dashboards, demo] = await Promise.all([
    canvasMetricIds(actor),
    visibleDashboards(viewer),
    isDemo(),
  ]);
  // The series of what is on the canvas; analyses of other Metrics fetch theirs.
  const data = await getCanvasData(viewer, canvas);
  const onCanvas = canvas.filter((id) => data.metrics.some((m) => m.id === id));
  return (
    <>
      <PageHeader title="Analyze" sub="Drop metrics on the canvas, then pick an analysis or a ready-made recipe. Save any result as a widget.">
        <div className="flex gap-4">
          <Link href="/analyze/designs" className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">View Designs</Link>
          <Link href="/analyze/playground" className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Playground</Link>
        </div>
      </PageHeader>
      <AnalyzeScreen data={data} demo={demo}onCanvas={onCanvas} targets={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
