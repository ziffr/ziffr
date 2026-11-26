// The Playground in the Library (Workspace settings) (spec 0024; GLOSSARY: Playground, View Design): paste or upload a View Design and see it
// drawn at once, with Sample Data or with Metrics the person sees. The page sends the visible Metrics without series;
// a Metric picked for a Slot fetches its own series through the core, so nothing arrives the person may not see.
import Link from "next/link";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { getCanvasData } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { ViewDesignGuideLink } from "@/components/view-design-guide-link";
import { PlaygroundScreen } from "./screen";
import { DesktopOnly } from "@/components/desktop-only";

export default async function PlaygroundPage() {
  const actor = await currentActor();
  const [data, demo] = await Promise.all([getCanvasData(actor.personId, []), isDemo()]);
  const manages = !demo && (actor.role === "owner" || actor.role === "admin");
  return (
    <>
      <PageHeader title="Playground" sub="Paste or upload a View Design and see it drawn as you type, with Sample Data or your own Metrics. Every mistake is named with its line.">
        <div className="flex flex-wrap gap-4"><Link href="/settings/library" className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Back to the Library</Link><ViewDesignGuideLink /></div>
      </PageHeader>
      <DesktopOnly path="/settings/library/playground" />
      <PlaygroundScreen data={data} manages={manages} />
    </>
  );
}
