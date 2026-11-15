"use server";
// Turning one into another (spec 0010, ticket #149): a story from a dashboard, a deck from a dashboard or a story.
// The core checks the person may open the source, may create, and sees every Metric copied.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { storyFromDashboard, deckSeed } from "@ziffr/core/conversions";
import { createDeck } from "@ziffr/core/decks";

/** Makes a story from this dashboard and opens it. */
export async function makeStory(dashboardId: number) {
  const id = await storyFromDashboard(await currentActor(), Number(dashboardId));
  revalidatePath("/", "layout");
  redirect(`/stories/${id}`);
}

/** Starts a deck named after this dashboard or story and opens it; the deck editor lays out its slides. */
export async function makeDeck(sourceId: number) {
  const actor = await currentActor();
  const seed = await deckSeed(actor, Number(sourceId));
  const id = await createDeck(actor, seed.name);
  revalidatePath("/", "layout");
  redirect(`/decks/${id}?from=${Number(sourceId)}`);
}
