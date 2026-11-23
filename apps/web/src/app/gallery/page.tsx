// The Gallery (GLOSSARY: Widget Template, View, Preview; ticket #861): every built-in way to show a Metric, drawn with one of the
// person's own Metrics (or Sample Data), to browse and then use on a dashboard. The page sends the Metrics the person sees without
// their series; the series of the one picked come through the core (canvas/series-store), so nothing arrives they may not see.
import { currentActor } from "@/lib/viewer";
import { getCanvasData } from "@/lib/access";
import { isDemo } from "@/lib/auth";
import { can } from "@ziffr/core/actor";
import { switchableDashboards } from "@ziffr/core/home";
import { PageHeader } from "@/components/page-header";
import { GalleryScreen } from "./screen";

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ metric?: string }> }) {
  const [{ metric }, actor] = await Promise.all([searchParams, currentActor()]);
  const [data, dashboards, demo] = await Promise.all([getCanvasData(actor.personId, []), switchableDashboards(actor), isDemo()]);
  // Only a Metric the person sees is taken from the address; any other value opens the Gallery with Sample Data.
  const opened = data.metrics.find((m) => m.slug === String(metric ?? "") && !m.archived_at) ?? null;
  return (
    <>
      <PageHeader title="Gallery" sub="See how a Metric can be shown. Pick one of yours, or start from a view and choose the Metric when you use it." />
      <GalleryScreen
        data={data}
        metricId={opened?.id ?? null}
        dashboards={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))}
        canCreate={can(actor, "create")}
        demo={demo}
      />
    </>
  );
}
