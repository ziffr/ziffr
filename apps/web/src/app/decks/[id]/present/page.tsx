import { notFound } from "next/navigation";
import { currentActor, viewerId } from "@/lib/viewer";
import { deckMetricIds, getCanvasData } from "@/lib/access";
import { deckView } from "@ziffr/core/page-data";
import { SlideshowLoader } from "./loader";
import { countView } from "@/lib/count-view";
import { followDemoSuccessor } from "@/lib/demo-follow";
import { readKeptNumbers } from "@ziffr/core/deck-snapshots";
import { keptRequests } from "@ziffr/core/snapshot-parts";
import { MADE_DECKS_ON } from "@ziffr/core/made-decks-on";
import { MadePresentation } from "./made-present";
import { deckTemplateSeed, importSeedOf } from "@ziffr/core/deck-templates";

export default async function DeckPresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const actor = await currentActor();
  const view = await deckView(actor, id);
  if (!view) await followDemoSuccessor("deck", id, "/present");
  const deck = view?.deck;
  if (!deck) notFound();
  void countView(actor, { kind: "deck", id });
  // A deck Ziffr makes is read, drawn and presented as such: only the slides this person is sent (spec 0069).
  if (deck.made === true && MADE_DECKS_ON) return <MadePresentation id={id} role={view.role!} start={Number((await searchParams).at) || 0} />;
  // A deck made from a Deck Template that nobody opened yet holds only the template and its fills: its slides are laid
  // out now. The core gives them only to someone who sees every Metric that fills them.
  const waiting = importSeedOf(deck.document);
  const templateSeed = waiting ? await deckTemplateSeed(actor, waiting.template, waiting.fills).catch(() => null) : null;
  // A slideshow draws only the deck's widgets: only their series go to the browser.
  const data = await getCanvasData(viewer, templateSeed ? templateSeed.fills.flat() : deckMetricIds(deck.document, deck.made));
  // And of the Snapshots its slides keep numbers from, what this viewer may see (spec 0061).
  const asked = keptRequests(deck.document);
  const kept = { asked, read: await readKeptNumbers(actor, asked) };
  // Someone who may only present has no deck page to go back to (it sends them here again): they go to the list.
  const back = view.role === "viewer" ? "/decks" : `/decks/${id}`;
  const keep = view.role === "owner" || view.role === "editor";
  return <SlideshowLoader back={back} deck={{ id: deck.id, name: deck.name, document: waiting ? null : deck.document, theme_id: deck.theme_id, footer: deck.footer }} data={data} kept={kept} templateSeed={templateSeed} keep={keep} start={Number((await searchParams).at) || 0} />;
}
