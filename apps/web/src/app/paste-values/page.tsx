// Paste values (spec 0026; GLOSSARY: Observation, Import): the page a signed-in person pastes cells from a spreadsheet
// on, reached from the Metrics list ("Paste values") and from a Metric's History tab ("Paste history", opened for that
// Metric). Only the Metrics the person submits for are offered; the core reads and checks everything else.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { currentActor } from "@/lib/viewer";
import { pasteMetrics } from "@ziffr/core/paste-values";
import { PasteScreen } from "./paste-screen";

export default async function PasteValuesPage({ searchParams }: { searchParams: Promise<{ metric?: string; from?: string }> }) {
  const [{ metric, from }, actor] = await Promise.all([searchParams, currentActor()]);
  const metrics = await pasteMetrics(actor);
  // Only a Metric the person submits for is taken from the address; any other slug opens the page without one.
  const opened = metrics.find((m) => m.slug === String(metric ?? "")) ?? null;
  // Only the one known word leads elsewhere: the address never chooses the link's target.
  const back = from === "analyze"
    ? { href: "/analyze?panel=methods", words: "Back to Analyze" }
    : { href: opened ? `/metrics/${opened.slug}?tab=history` : "/metrics", words: opened ? opened.name : "Metrics" };
  return (
    <>
      <Link href={back.href} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground max-sm:min-h-11">
        <ArrowLeft className="size-4" aria-hidden /> {back.words}
      </Link>
      <PageHeader
        title={opened ? `Paste history: ${opened.name}` : "Paste values"}
        sub="Copy cells from any spreadsheet and paste them here. Ziffr shows what each value would do before anything is recorded."
      />
      <PasteScreen metrics={metrics.map((m) => ({ id: m.id, name: m.name }))} metricId={opened?.id ?? null} />
    </>
  );
}
