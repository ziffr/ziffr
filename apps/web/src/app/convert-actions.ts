"use server";
// Turning one into another (spec 0010, ticket #149; spec 0013; ticket #1): a deck from a dashboard, a widget onto a deck. The core checks the person
// may open the source, may create, and sees every Metric copied.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DECK_ADD_COOKIE, DECK_ADD_SECONDS, newIntent } from "@/lib/deck-add-intent";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { deckSeed } from "@ziffr/core/conversions";
import { createDeck } from "@ziffr/core/decks";
import { snapshotDeckSeed } from "@ziffr/core/snapshots";
import { deckAddition, deckTargets, newDeckFor } from "@ziffr/core/deck-additions";

/** Starts a deck from a Snapshot (spec 0013) and opens it: its slides draw the values of the Snapshot's period. */
export async function makeDeckFromSnapshot(snapshotId: number) {
  return attempt(async () => {
    const actor = await currentActor();
    const seed = await snapshotDeckSeed(actor, Number(snapshotId));
    const id = await createDeck(actor, seed.name);
    revalidatePath("/", "layout");
    redirect(`/decks/${id}?snapshot=${Number(snapshotId)}`);
  });
}

/** Starts a deck named after this dashboard and opens it; the deck editor lays out its slides. */
export async function makeDeck(sourceId: number) {
  return attempt(async () => {
    const actor = await currentActor();
    const seed = await deckSeed(actor, Number(sourceId));
    const id = await createDeck(actor, seed.name);
    revalidatePath("/", "layout");
    redirect(`/decks/${id}?from=${Number(sourceId)}`);
  });
}

/** The decks the viewer may add a widget to, with their slides, for "Add to deck…". */
export async function deckChoices() {
  return attempt(async () => deckTargets(await currentActor()));
}

/** Adds a widget to a deck (or a new one, `deckId` null) and opens the deck, which places the copy on `slide` or a
 * new slide. The core checks the viewer may open the widget, change the deck and see every Metric, here and again
 * when the deck is opened and saved. */
export async function addToDeck(widgetId: number, deckId: number | null, slide: string | null) {
  return attempt(async () => {
    const actor = await currentActor();
    const id = deckId === null ? await newDeckFor(actor, Number(widgetId)) : Number(deckId);
    const added = await deckAddition(actor, id, Number(widgetId), slide);
    // Asked for here, by the person's own menu: a cookie of this site, which a link from elsewhere cannot set.
    const intent = newIntent(id, Number(widgetId), added.slide);
    (await cookies()).set(DECK_ADD_COOKIE, intent.cookie, { httpOnly: true, sameSite: "strict", path: "/decks", maxAge: DECK_ADD_SECONDS });
    revalidatePath("/", "layout");
    redirect(`/decks/${id}?add=${intent.nonce}`);
  });
}
