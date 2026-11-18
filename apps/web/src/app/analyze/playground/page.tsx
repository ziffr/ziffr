// The Playground under Analyze (spec 0024; GLOSSARY: Playground, View Design): paste or upload a View Design and see it
// drawn at once, with Sample Data or with Metrics the person sees. The page sends the visible Metrics without series;
// a Metric picked for a Slot fetches its own series through the core, so nothing arrives the person may not see.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { getCanvasData } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { PlaygroundScreen } from "./screen";

export default async function PlaygroundPage() {
  const actor = await currentActor();
  const [data, demo] = await Promise.all([getCanvasData(actor.personId, []), isDemo()]);
  const manages = !demo && (actor.role === "owner" || actor.role === "admin");
  return (
    <>
      <PageHeader title="Playground" sub="Paste or upload a View Design and see it drawn as you type, with Sample Data or your own Metrics. Every mistake is named with its line." />
      <PlaygroundScreen data={data} manages={manages} />
    </>
  );
}
