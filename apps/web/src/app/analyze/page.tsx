import { currentActor } from "@/lib/viewer";
import { canvasAdd, canvasExplain, canvasState } from "@ziffr/core/dashboards";
import { getCanvasData, visibleDashboards } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { AnalyzeScreen } from "./screen";
import { HeadsUpsSection } from "./heads-ups";
import Link from "next/link";
import { Suspense } from "react";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ add?: string; metric?: string }> }) {
  const actor = await currentActor();
  const viewer = actor.personId;
  const sp = await searchParams;
  const adding = sp.add && /^\d{1,12}$/.test(sp.add) ? Number(sp.add) : null;
  const demo = await isDemo();
  // "Analyze" from a metric page drops that metric onto the canvas (the core checks the person sees it). The demo
  // saves nothing, so there it is only drawn on the canvas this time (#827).
  // `?metric=<slug>` comes from "See all questions" on a Metric page: that Metric goes on the canvas as the one to explain and the
  // picker opens. The slug is looked up among the Metrics this person sees only, so a hidden slug, an unknown one and a missing one
  // behave the same (nothing is added, the picker stays as it is): the page never says whether a Metric exists.
  const slug = typeof sp.metric === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(sp.metric) ? sp.metric : null;
  const [before, dashboards] = await Promise.all([canvasState(actor), visibleDashboards(viewer)]);
  // What the person sees decides: the lookup reads Metrics from the visible set, which a first read of the canvas gives.
  const named = slug ? (await getCanvasData(viewer, before.ids)).metrics.find((m) => m.slug === slug && !m.archived_at)?.id ?? null : null;
  const wanted = adding ?? named;
  if (wanted !== null && !demo) { await canvasAdd(actor, [wanted]).catch(() => {}); if (named !== null) await canvasExplain(actor, named).catch(() => {}); }
  const state = wanted !== null && !demo ? await canvasState(actor) : before;
  const kept = state.ids;
  const canvas = wanted !== null && demo && !kept.includes(wanted) ? [...kept, wanted] : kept;
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
      <AnalyzeScreen data={data} demo={demo} onCanvas={onCanvas} explained={demo ? named : state.explains !== null && onCanvas.includes(state.explains) ? state.explains : null} open={named !== null} targets={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
