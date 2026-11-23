import { notFound } from "next/navigation";
import { currentActor, viewerId } from "@/lib/viewer";
import { deckMetricIds, getCanvasData } from "@/lib/access";
import { deckView } from "@ziffr/core/page-data";
import { SlideshowLoader } from "./loader";
import { countView } from "@/lib/count-view";
import { followDemoSuccessor } from "@/lib/demo-follow";

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
  return <SlideshowLoader deck={{ id: deck.id, name: deck.name, document: deck.document, theme_id: deck.theme_id, footer: deck.footer }} data={data} start={Number((await searchParams).at) || 0} />;
}
