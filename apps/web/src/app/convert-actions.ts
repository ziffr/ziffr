"use server";
// Turning one into another (spec 0010, ticket #149; spec 0013): a deck from a dashboard. The core checks the person
// may open the source, may create, and sees every Metric copied.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { deckSeed } from "@ziffr/core/conversions";
import { createDeck } from "@ziffr/core/decks";

/** Starts a deck named after this dashboard and opens it; the deck editor lays out its slides. */
export async function makeDeck(sourceId: number) {
  const actor = await currentActor();
  const seed = await deckSeed(actor, Number(sourceId));
  const id = await createDeck(actor, seed.name);
  revalidatePath("/", "layout");
  redirect(`/decks/${id}?from=${Number(sourceId)}`);
}
