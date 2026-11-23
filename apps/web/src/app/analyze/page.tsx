import { currentActor } from "@/lib/viewer";
import { canvasAdd, canvasMetricIds } from "@ziffr/core/dashboards";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { AnalyzeScreen } from "./screen";
import { HeadsUpsSection } from "./heads-ups";
import Link from "next/link";
import { Suspense } from "react";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const actor = await currentActor();
  const viewer = actor.personId;
  const sp = await searchParams;
  const adding = sp.add && /^\d{1,12}$/.test(sp.add) ? Number(sp.add) : null;
  const demo = await isDemo();
  // "Analyze" from a metric page drops that metric onto the canvas (the core checks the person sees it). The demo
  // saves nothing, so there it is only drawn on the canvas this time (#827).
  if (adding !== null && !demo) await canvasAdd(actor, [adding]).catch(() => {});
  const [kept, dashboards] = await Promise.all([canvasMetricIds(actor), visibleDashboards(viewer)]);
  const canvas = adding !== null && demo && !kept.includes(adding) ? [...kept, adding] : kept;
  // The series of what is on the canvas, of Metrics the person sees; analyses of other Metrics fetch theirs.
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
      {/* In a Workspace over the scan's cap the list scans the person's own Metrics: the page does not wait for it. */}
      <Suspense fallback={<p className="mb-6 text-sm text-muted-foreground">Looking for Heads-ups…</p>}>
        <HeadsUpsSection actor={actor} demo={demo} />
      </Suspense>
      <AnalyzeScreen data={data} demo={demo} onCanvas={onCanvas} targets={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
