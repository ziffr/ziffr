// Paste values (spec 0026; GLOSSARY: Observation, Import): the page a signed-in person pastes cells from a spreadsheet
// on, reached from the Metrics list ("Paste values") and from a Metric's History tab ("Paste history", opened for that
// Metric). Only the Metrics the person submits for are offered; the core reads and checks everything else.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { currentActor } from "@/lib/viewer";
import { pasteMetrics } from "@ziffr/core/paste-values";
import { PasteScreen } from "./paste-screen";

export default async function PasteValuesPage({ searchParams }: { searchParams: Promise<{ metric?: string }> }) {
  const [{ metric }, actor] = await Promise.all([searchParams, currentActor()]);
  const metrics = await pasteMetrics(actor);
  // Only a Metric the person submits for is taken from the address; any other slug opens the page without one.
  const opened = metrics.find((m) => m.slug === String(metric ?? "")) ?? null;
  return (
    <>
      <Link href={opened ? `/metrics/${opened.slug}?tab=history` : "/metrics"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground max-sm:min-h-11">
        <ArrowLeft className="size-4" aria-hidden /> {opened ? opened.name : "Metrics"}
      </Link>
      <PageHeader
        title={opened ? `Paste history: ${opened.name}` : "Paste values"}
        sub="Copy cells from any spreadsheet and paste them here. Ziffr shows what each value would do before anything is recorded."
      />
      <PasteScreen metrics={metrics.map((m) => ({ id: m.id, name: m.name }))} metricId={opened?.id ?? null} />
    </>
  );
}
