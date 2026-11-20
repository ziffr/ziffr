"use server";
// Decks (GLOSSARY: Deck, Share): thin calls into the core (@ziffr/core/decks). A deck's owner and its Editors change
// it; Viewers only present it.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import * as decks from "@ziffr/core/decks";
import { recordDeckExport } from "@ziffr/core/audit-log";
import { attempt } from "@/lib/action-result";

/** Creates a deck and opens it. */
export async function createDeck(form: FormData) {
  const id = await decks.createDeck(await currentActor(), String(form.get("name") ?? ""));
  revalidatePath("/decks");
  redirect(`/decks/${id}`);
}

/** Saves a deck's slides. */
export async function saveDeck(id: number, document: unknown) {
  await decks.saveDeck(await currentActor(), Number(id), document);
}

/** Renames a deck. */
export async function renameDeck(id: number, name: string) {
  await decks.renameDeck(await currentActor(), Number(id), String(name ?? ""));
  revalidatePath("/decks");
}

/** The deck's own footer; null uses the theme's. */
export async function setDeckFooter(id: number, footer: string | null) {
  await decks.setDeckFooter(await currentActor(), Number(id), footer);
  revalidatePath(`/decks/${Number(id)}`);
}

/** Notes in the Audit Log that the person exported the deck; the file itself is made in the browser. */
export async function noteDeckExport(id: number, format: "pptx" | "pdf") {
  await recordDeckExport(await currentActor(), Number(id), format === "pdf" ? "pdf" : "pptx");
}

/** The deck's owner deletes it; the core refuses anyone else. */
export async function deleteDeck(id: number) {
  return attempt(async () => {
    await decks.deleteDeck(await currentActor(), Number(id));
    revalidatePath("/decks");
    return { ok: true as const };
  });
}
