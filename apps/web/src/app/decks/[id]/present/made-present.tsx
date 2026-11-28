import { notFound } from "next/navigation";
import { Forbidden, Refused } from "@ziffr/core/actor";
import { readDeck } from "@ziffr/core/deck-read";
import { drawMadeDeck } from "@/decks/slides/made-drawing";
import { currentActor } from "@/lib/viewer";
import { Presenter } from "./presenter";

/** Present for a deck Ziffr makes: the slides this person is sent, drawn on the server by the one renderer. Someone who
 * may only present has no deck page to go back to, so they go to the list. */
export async function MadePresentation({ id, role, start }: { id: number; role: string; start: number }) {
  const read = await readDeck(await currentActor(), id).catch((err) => {
    if (err instanceof Forbidden || err instanceof Refused) return null;
    throw err;
  });
  const drawing = read && drawMadeDeck(read);
  if (!read || !drawing) notFound();
  return <Presenter name={read.deck.name} drawing={drawing} start={start} back={role === "viewer" ? "/decks" : `/decks/${id}/slides`} />;
}
