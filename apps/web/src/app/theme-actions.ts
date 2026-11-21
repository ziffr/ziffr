"use server";
// Themes (GLOSSARY: Theme): thin calls into the core. Owners and admins change them; dashboard editors and deck
// editors pick one.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as themes from "@ziffr/core/workspace-themes";
import { setDashboardTheme as coreSetDashboardTheme } from "@ziffr/core/dashboards";
import { setDeckTheme as coreSetDeckTheme } from "@ziffr/core/decks";
import type { ThemeSlides, ThemeTokens } from "@ziffr/core/types";

const done = () => revalidatePath("/", "layout");
const themeId = (v: number | null) => (v === null ? null : Number(v));

/** Saves a Theme. */
export async function saveTheme(id: number, name: string, tokens: ThemeTokens, slides: ThemeSlides) {
  return attempt(async () => {
    await themes.saveTheme(await currentActor(), Number(id), String(name ?? ""), tokens, slides);
    done();
  });
}

/** A new theme starts as a copy of another. */
export async function duplicateTheme(fromId: number) {
  return attempt(async () => {
    const id = await themes.duplicateTheme(await currentActor(), Number(fromId));
    done();
    return id;
  });
}

/** Adds one of Ziffr's standard Themes to the Workspace as a Theme of its own. */
export async function addStandardTheme(key: string) {
  return attempt(async () => {
    const id = await themes.addStandardTheme(await currentActor(), String(key ?? ""));
    done();
    return id;
  });
}

/** Adds a Theme from a Theme file's text; the core checks the file again, and answers the problems with their lines. */
export async function importTheme(text: string) {
  return attempt(async () => {
    const res = await themes.importTheme(await currentActor(), String(text ?? ""));
    if (res.ok) done();
    return res;
  });
}

/** Deletes a Theme (not the default). */
export async function deleteTheme(id: number) {
  return attempt(async () => {
    await themes.deleteTheme(await currentActor(), Number(id));
    done();
  });
}

/** Makes a Theme the team default. */
export async function setDefaultTheme(id: number) {
  return attempt(async () => {
    await themes.setDefaultTheme(await currentActor(), Number(id));
    done();
  });
}

/** null: follow the team default. */
export async function setDashboardTheme(dashboardId: number, id: number | null) {
  return attempt(async () => {
    await coreSetDashboardTheme(await currentActor(), Number(dashboardId), themeId(id));
    done();
  });
}

/** null: follow the team default. */
export async function setDeckTheme(deckId: number, id: number | null) {
  return attempt(async () => {
    await coreSetDeckTheme(await currentActor(), Number(deckId), themeId(id));
    done();
  });
}
