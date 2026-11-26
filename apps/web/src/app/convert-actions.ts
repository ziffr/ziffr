"use server";
// Turning one into another (spec 0010, ticket #149; spec 0013; ticket #1): a deck from a dashboard, a widget onto a deck. The core checks the person
// may open the source, may create, and sees every Metric copied.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DECK_ADD_COOKIE, DECK_ADD_SECONDS, newIntent, type DeckAddIntent } from "@/lib/deck-add-intent";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { attemptAsVisitor } from "@/lib/demo-write";
import { deckSeed } from "@ziffr/core/conversions";
import { createDeck } from "@ziffr/core/decks";
import { newDeckFromSnapshot, snapshotAddition } from "@ziffr/core/deck-snapshots";
import type { Actor } from "@ziffr/core/actor";
import { deckAddition, deckTargets, newDeckFor } from "@ziffr/core/deck-additions";

/** Starts a deck with a Snapshot's kept numbers (spec 0061) and opens it; the deck editor places its slides. */
export async function makeDeckFromSnapshot(snapshotId: number) {
  return attemptAsVisitor("convert-actions:makeDeckFromSnapshot", async () => {
    const actor = await currentActor();
    const id = await newDeckFromSnapshot(actor, Number(snapshotId));
    return openWithSnapshot(actor, id, Number(snapshotId));
  });
}

/** Adds a shown Snapshot's slides to a deck (or a new one, `deckId` null) and opens it, which places them at the end.
 * The core checks both ends, here and again when the deck is opened. */
export async function addSnapshotToDeck(snapshotId: number, deckId: number | null) {
  return attemptAsVisitor("convert-actions:addSnapshotToDeck", async () => {
    const actor = await currentActor();
    const id = deckId === null ? await newDeckFromSnapshot(actor, Number(snapshotId)) : Number(deckId);
    return openWithSnapshot(actor, id, Number(snapshotId));
  });
}

/** Checks that the person may put the Snapshot on the deck, asks the deck to place it and opens the deck. */
async function openWithSnapshot(actor: Actor, deckId: number, snapshotId: number): Promise<never> {
  await snapshotAddition(actor, deckId, snapshotId);
  return openWith(actor.personId, deckId, { snapshotId });
}

/** Opens a deck asking it to add something once: asked for here, by the person's own menu, in a cookie of this site,
 * which a link from elsewhere cannot set. */
async function openWith(personId: string, deckId: number, what: DeckAddIntent): Promise<never> {
  const intent = newIntent(personId, deckId, what);
  (await cookies()).set(DECK_ADD_COOKIE, intent.cookie, { httpOnly: true, sameSite: "strict", path: "/decks", maxAge: DECK_ADD_SECONDS });
  revalidatePath("/", "layout");
  redirect(`/decks/${deckId}?add=${intent.nonce}`);
}

/** Starts a deck named after this dashboard and opens it; the deck editor lays out its slides. */
export async function makeDeck(sourceId: number) {
  return attemptAsVisitor("convert-actions:makeDeck", async () => {
    const actor = await currentActor();
    const seed = await deckSeed(actor, Number(sourceId));
    const id = await createDeck(actor, seed.name, { derived: true });
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
  return attemptAsVisitor("convert-actions:addToDeck", async () => {
    const actor = await currentActor();
    const id = deckId === null ? await newDeckFor(actor, Number(widgetId)) : Number(deckId);
    const added = await deckAddition(actor, id, Number(widgetId), slide);
    return openWith(actor.personId, id, { widgetId: Number(widgetId), slide: added.slide });
  });
}

/** Clears what Add to deck… asked for, once the deck editor placed the copy: the request is used once. */
export async function doneAddingToDeck() {
  return attempt(async () => {
    (await cookies()).delete({ name: DECK_ADD_COOKIE, path: "/decks" });
  });
}
