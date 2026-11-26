"use server";
// Decks (GLOSSARY: Deck, Share): thin calls into the core (@ziffr/core/decks). A deck's owner and its Editors change
// it; Viewers only present it. In the demo (spec 0051, ticket 10) a visitor makes, changes and deletes decks of their own:
// each change runs in `attemptAsVisitor` (the write budget, the visit's scope), and the core checks the words and the size.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import * as decks from "@ziffr/core/decks";
import { deckShareGaps, readKeptNumbers } from "@ziffr/core/deck-snapshots";
import { attempt } from "@/lib/action-result";
import { recordDeckExport } from "@ziffr/core/audit-log";
import { attemptAsVisitor } from "@/lib/demo-write";
import { chargeDeckSave } from "@ziffr/core/demo-shares";
import { DEMO_BUDGET_USED } from "@ziffr/core/demo-words";

/** Creates a deck and opens it; a refusal is answered as words, shown by the form. */
export async function createDeck(_previous: unknown, form: FormData) {
  return attemptAsVisitor("deck-actions:createDeck", async () => {
    const id = await decks.createDeck(await currentActor(), String(form.get("name") ?? ""));
    revalidatePath("/decks");
    redirect(`/decks/${id}`);
  });
}

/** Saves a deck's slides. */
export async function saveDeck(id: number, document: unknown) {
  return attemptAsVisitor("deck-actions:saveDeck", async (who) => {
    const actor = await currentActor();
    // A deck saves itself after each change: in the demo the bytes of every save count against the address's, network's and demo's share.
    await chargeDeckSave(actor, who, document, DEMO_BUDGET_USED);
    await decks.saveDeck(actor, Number(id), document);
  });
}

/** Renames a deck. */
export async function renameDeck(id: number, name: string) {
  return attemptAsVisitor("deck-actions:renameDeck", async () => {
    await decks.renameDeck(await currentActor(), Number(id), String(name ?? ""));
    revalidatePath("/decks");
  });
}

/** The deck's own footer; null uses the theme's. */
export async function setDeckFooter(id: number, footer: string | null) {
  return attemptAsVisitor("deck-actions:setDeckFooter", async () => {
    await decks.setDeckFooter(await currentActor(), Number(id), footer);
    revalidatePath(`/decks/${Number(id)}`);
  });
}

/** Notes in the Audit Log that the person exported the deck; the file itself is made in the browser. */
export async function noteDeckExport(id: number, format: "pptx" | "pdf") {
  await recordDeckExport(await currentActor(), Number(id), format === "pdf" ? "pdf" : "pptx");
}

/** The Snapshot numbers the viewer gets for what a deck's slides ask now (spec 0061); the core checks the request and
 * each Snapshot for this person. */
export async function readDeckNumbers(requests: unknown) {
  return attempt(async () => readKeptNumbers(await currentActor(), requests));
}

/** Who will not see which of the deck's Snapshot Parts, for its owner's share panel (spec 0061). */
export async function deckShareLeftOut(id: number) {
  return attempt(async () => deckShareGaps(await currentActor(), Number(id)));
}

/** The deck's owner deletes it; the core refuses anyone else. */
export async function deleteDeck(id: number) {
  return attemptAsVisitor("deck-actions:deleteDeck", async () => {
    await decks.deleteDeck(await currentActor(), Number(id));
    revalidatePath("/decks");
    return { ok: true as const };
  });
}
