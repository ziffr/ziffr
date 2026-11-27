// "Use this pack" (spec 0068; GLOSSARY: Pack): one Pack set up from its preview to done, one question per screen.
// Switched off (not found) until every entry point switches over, and never in the demo. Only an Owner or Admin runs
// it; anyone else is told to ask one. The browser gets what `startOptions` and `startDrawing` answer to this person
// (the Pack's words, the room as counts, the people of the Workspace by name), the Pack's Preview, and the names of the
// Feeds and n8n templates a template download offers.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { feedTemplates } from "@ziffr/core/feed-template-download";
import { feedChoices } from "@ziffr/core/feeds";
import { readIncludedPack } from "@ziffr/core/included-packs";
import { startDrawing, startOptions } from "@ziffr/core/pack-start";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { draftKey } from "../draft";
import { PACK_SET_UP_ON, packRefOf } from "../switch";
import { UsePack } from "../use-pack";

export const metadata: Metadata = { title: "Use this pack" };

/** For someone who may not set a Pack up here. */
function AskAnOwner() {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Ask an Owner or Admin</h1>
      <p className="text-sm text-muted-foreground">Only an Owner or Admin of this Workspace can set up a Pack.</p>
      {/* A plain link: the app is not drawn around this page, so it is loaded anew. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Go to Home</a>
    </main>
  );
}

export default async function UsePackPage({ params }: { params: Promise<{ ref: string }> }) {
  if (!PACK_SET_UP_ON || (await isDemo())) notFound();
  const segment = (await params).ref;
  const ref = packRefOf(segment);
  if (!ref) notFound();
  const actor = await currentActor();
  if (actor.role !== "owner" && actor.role !== "admin") return <AskAnOwner />;
  // A Pack that is not here, or not of this Workspace, is not found.
  const found = <T,>(read: Promise<T>) => read.catch((e: unknown) => { if (e instanceof Forbidden) notFound(); throw e; });
  const options = await found(startOptions(actor, ref));
  const [drawing, preview, feeds, numberStyle] = await Promise.all([
    found(startDrawing(actor, ref)),
    // The whole Preview only while it shows what would be installed: an installed Pack may be of another version.
    "included" in ref && options.pack.installId === null ? readIncludedPack(actor, ref.included) : null,
    feedChoices(actor),
    numberStyleOf(actor.workspaceId),
  ]);
  return (
    <UsePack
      segment={segment}
      keep={draftKey(actor.personId, actor.workspaceId, options.pack.id)}
      data={{
        options, drawing, view: preview?.ok ? preview.preview : null, feeds, numberStyle, viewer: actor.personId,
        templates: Object.fromEntries(feedTemplates().map((t) => [t.id, t.label])),
      }}
    />
  );
}
