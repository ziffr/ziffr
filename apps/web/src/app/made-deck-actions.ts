"use server";
// The deck page of a deck Ziffr makes (GLOSSARY: Deck, Deck Description; spec 0069): thin calls into the core, which
// checks who may change what. A browser sends changes only, never a whole description, and the core checks them again.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";
import { clearDeckAnswers, makeDeckFromDashboard, saveMadeDeck } from "@ziffr/core/deck-write";
import { renameDeck, setDeckFooter, setDeckTheme } from "@ziffr/core/decks";

/** Saves the form's change: design, show or hide, own headlines and answers. */
export async function saveMadeSlides(id: number, change: unknown) {
  return attempt(async () => {
    await saveMadeDeck(await currentActor(), Number(id), change as never);
    revalidatePath(`/decks/${Number(id)}/slides`);
    return { ok: true as const };
  });
}

/** Empties the answers, for the next meeting. */
export async function clearMadeAnswers(id: number) {
  return attempt(async () => {
    await clearDeckAnswers(await currentActor(), Number(id));
    revalidatePath(`/decks/${Number(id)}/slides`);
    return { ok: true as const };
  });
}

/** Renames the deck. */
export async function renameMadeDeck(id: number, name: string) {
  return attempt(async () => {
    await renameDeck(await currentActor(), Number(id), String(name ?? ""));
    revalidatePath(`/decks/${Number(id)}/slides`);
    return { ok: true as const };
  });
}

/** The deck's own footer words; empty follows the Theme's. */
export async function footerOfMadeDeck(id: number, footer: string) {
  return attempt(async () => {
    await setDeckFooter(await currentActor(), Number(id), String(footer ?? "").trim() || null);
    revalidatePath(`/decks/${Number(id)}/slides`);
    return { ok: true as const };
  });
}

/** The deck's Theme; null follows the team's default. */
export async function themeOfMadeDeck(id: number, themeId: number | null) {
  return attempt(async () => {
    await setDeckTheme(await currentActor(), Number(id), themeId === null ? null : Number(themeId));
    revalidatePath(`/decks/${Number(id)}/slides`);
    return { ok: true as const };
  });
}

/** Makes a new deck from a dashboard's Metrics and opens it; a refusal is answered as words. */
export async function makeDeckFromDashboardForm(_previous: unknown, form: FormData) {
  const made = await attempt(async () => makeDeckFromDashboard(await currentActor(), Number(form.get("dashboard")), { name: String(form.get("name") ?? "").trim() || undefined }));
  if (typeof made !== "number") return made;
  revalidatePath("/decks");
  redirect(`/decks/${made}/slides`);
}
