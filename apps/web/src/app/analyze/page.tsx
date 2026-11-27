import { currentActor } from "@/lib/viewer";
import { canvasAdd, canvasExplain, canvasState } from "@ziffr/core/dashboards";
import { getCanvasData } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { AnalyzeScreen } from "./screen";
import { HeadsUpsSection } from "./heads-ups";
import { DesktopOnly } from "@/components/desktop-only";
import { Suspense } from "react";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ add?: string; metric?: string }> }) {
  const actor = await currentActor();
  const viewer = actor.personId;
  const sp = await searchParams;
  const adding = sp.add && /^\d{1,12}$/.test(sp.add) ? Number(sp.add) : null;
  const demo = await isDemo();
  // "Analyze" from a metric page drops that metric onto the canvas (the core checks the person sees it). The demo
  // saves nothing, so there it is only drawn on the canvas this time (#827).
  // `?metric=<slug>` comes from "Pick a question for <Metric>" on a Metric page: that Metric goes on the canvas as the one to explain and the
  // picker opens. The slug is looked up among the Metrics this person sees only, so a hidden slug, an unknown one, an archived one and a
  // missing one behave the same (nothing is added, the screen is as it would be without it): the page never says whether a Metric exists.
  const slug = typeof sp.metric === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(sp.metric) ? sp.metric : null;
  const before = await canvasState(actor);
  const named = slug ? (await getCanvasData(viewer, before.ids)).metrics.find((m) => m.slug === slug && !m.archived_at)?.id ?? null : null;
  const wanted = adding ?? named;
  if (wanted !== null && !demo) { await canvasAdd(actor, [wanted]).catch(() => {}); if (named !== null) await canvasExplain(actor, named).catch(() => {}); }
  const state = wanted !== null && !demo ? await canvasState(actor) : before;
  const canvas = wanted !== null && demo && !state.ids.includes(wanted) ? [...state.ids, wanted] : state.ids;
  // The series of what is on the canvas, of Metrics the person sees; analyses of other Metrics fetch theirs.
  const data = await getCanvasData(viewer, canvas);
  const onCanvas = canvas.filter((id) => data.metrics.some((m) => m.id === id));
  return (
    <>
      <PageHeader title="Analyze" sub="Ask a question of your numbers: add a Metric, pick a question, read the answer." />
      {/* How many Heads-ups there are, in a block of its own; the list is in the side panel behind it. In a Workspace over the scan's cap
          the list scans the person's own Metrics: the page does not wait for it, and shows no block until it knows there is one. */}
      <Suspense fallback={null}>
        <HeadsUpsSection actor={actor} demo={demo} />
      </Suspense>
      <DesktopOnly path="/analyze" />
      <AnalyzeScreen data={data} demo={demo} onCanvas={onCanvas} writes={actor.role === "owner" || actor.role === "admin"} explained={demo ? named : state.explains !== null && onCanvas.includes(state.explains) ? state.explains : null} open={named !== null} />
    </>
  );
}
