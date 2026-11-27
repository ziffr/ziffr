// "Use this pack" (spec 0068; GLOSSARY: Pack): one Pack set up from its preview to done, one question per screen.
// Never in the demo. Only an Owner or Admin runs it; anyone else is told to ask one. The browser gets what `startOptions` and `startDrawing` answer to this person
// (the Pack's words, the room as counts, the people of the Workspace by name), the Pack's Preview, and the names of the
// Feeds and n8n templates a template download offers.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { feedTemplates } from "@ziffr/core/feed-template-download";
import { feedChoices } from "@ziffr/core/feeds";
import { readIncludedPack } from "@ziffr/core/included-packs";
import { startDrawing, startOptions } from "@ziffr/core/pack-start";
import { trialEnded } from "@ziffr/core/trials";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { AskAnOwner } from "../ask-owner";
import { draftKey } from "../draft";
import { packRefOf } from "../paths";
import { UsePack } from "../use-pack";

export const metadata: Metadata = { title: "Use this pack" };

export default async function UsePackPage({ params }: { params: Promise<{ ref: string }> }) {
  if (await isDemo()) notFound();
  const segment = (await params).ref;
  const ref = packRefOf(segment);
  if (!ref) notFound();
  const actor = await currentActor();
  // An ended trial has only the screen that says so, which the app around Home draws.
  if (await trialEnded(actor.workspaceId)) redirect("/");
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
