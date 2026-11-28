import { notFound, redirect } from "next/navigation";
import { Forbidden, Refused } from "@ziffr/core/actor";
import { readDeck } from "@ziffr/core/deck-read";
import { getCanvasData } from "@/lib/access";
import { drawMadeDeck } from "@/decks/slides/made-drawing";
import { countView } from "@/lib/count-view";
import { currentActor, viewerId } from "@/lib/viewer";
import { MadeDeckPage } from "./made-deck-page";

/** The deck page of a deck Ziffr makes. Whoever may only present it goes to the presentation; whoever has no role on it
 * or whose deck is not one Ziffr makes finds nothing, so a deck's existence is not told. */
export default async function MadeDeckSlidesPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const actor = await currentActor();
  const read = await readDeck(actor, id).catch((err) => {
    if (err instanceof Forbidden || err instanceof Refused) return null;
    throw err;
  });
  if (!read) notFound();
  if (read.deck.role === "viewer") redirect(`/decks/${id}/present`);
  void countView(actor, { kind: "deck", id });
  // The Themes to choose from: the Workspace's own, as everywhere a Theme is picked.
  const { themes } = await getCanvasData(await viewerId(), []);
  return <MadeDeckPage id={id} name={read.deck.name} footer={read.deck.footer} themeId={read.deck.themeId} themes={themes} description={read.deck.description} drawing={drawMadeDeck(read)} leftOut={read.leftOut} />;
}
