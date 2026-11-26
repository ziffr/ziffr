import { notFound } from "next/navigation";
import { currentActor, viewerId } from "@/lib/viewer";
import { deckMetricIds, getCanvasData } from "@/lib/access";
import { deckView } from "@ziffr/core/page-data";
import { SlideshowLoader } from "./loader";
import { countView } from "@/lib/count-view";
import { followDemoSuccessor } from "@/lib/demo-follow";
import { readKeptNumbers } from "@ziffr/core/deck-snapshots";
import { keptRequests } from "@ziffr/core/snapshot-parts";

export default async function DeckPresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const actor = await currentActor();
  const view = await deckView(actor, id);
  if (!view) await followDemoSuccessor("deck", id, "/present");
  const deck = view?.deck;
  if (!deck) notFound();
  void countView(actor, { kind: "deck", id });
  // A slideshow draws only the deck's widgets: only their series go to the browser.
  const data = await getCanvasData(viewer, deckMetricIds(deck.document));
  // And of the Snapshots its slides keep numbers from, what this viewer may see (spec 0061).
  const asked = keptRequests(deck.document);
  const kept = { asked, read: await readKeptNumbers(actor, asked) };
  // Someone who may only present has no deck page to go back to (it sends them here again): they go to the list.
  const back = view.role === "viewer" ? "/decks" : `/decks/${id}`;
  return <SlideshowLoader back={back} deck={{ id: deck.id, name: deck.name, document: deck.document, theme_id: deck.theme_id, footer: deck.footer }} data={data} kept={kept} start={Number((await searchParams).at) || 0} />;
}
