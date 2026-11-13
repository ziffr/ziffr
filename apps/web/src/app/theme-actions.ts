"use server";
// Themes (GLOSSARY: Theme): only the workspace owner changes them; dashboard editors and deck owners pick one.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { visibleDecks } from "@/lib/access";
import { assertCanEditDashboard, assertWorkspaceOwner, forbidden } from "@/lib/guards";
import { cleanSlides, cleanTokens } from "@/lib/theme-tokens";
import { ensureBaseline, recordVersion } from "@/lib/versions";
import type { ThemeSlides, ThemeTokens } from "@/lib/types";

const done = () => revalidatePath("/", "layout");

export async function saveTheme(id: number, name: string, tokens: ThemeTokens, slides: ThemeSlides) {
  const viewer = await viewerId();
  await assertWorkspaceOwner(viewer);
  const clean = cleanTokens(tokens);
  if (!clean) throw new Error("Some colours or fonts are not valid.");
  await ensureBaseline("theme", id, viewer);
  const { error } = await db.from("themes").update({ name: String(name ?? "").trim().slice(0, 60) || "Untitled theme", tokens: clean, slides: cleanSlides(slides), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Theme not saved: ${error.message}`);
  await recordVersion("theme", id, viewer);
  done();
}

/** A new theme starts as a copy of another. */
export async function duplicateTheme(fromId: number) {
  const viewer = await viewerId();
  await assertWorkspaceOwner(viewer);
  const { data: from } = await db.from("themes").select("name, tokens, slides").eq("id", fromId).single();
  if (!from) forbidden();
  const { data, error } = await db.from("themes").insert({ owner_id: viewer, name: `${from!.name} copy`, tokens: from!.tokens, slides: from!.slides }).select("id").single();
  if (error) throw new Error(`Theme not created: ${error.message}`);
  await recordVersion("theme", data!.id, viewer, { message: `Copied from ${from!.name}` });
  done();
  return data!.id as number;
}

export async function deleteTheme(id: number) {
  const viewer = await viewerId();
  await assertWorkspaceOwner(viewer);
  const { data } = await db.from("themes").select("is_default").eq("id", id).single();
  if (!data) forbidden();
  if (data!.is_default) throw new Error("The team default cannot be deleted. Make another theme the default first.");
  await db.from("themes").delete().eq("id", id); // dashboards and decks using it fall back to the default
  done();
}

export async function setDefaultTheme(id: number) {
  const viewer = await viewerId();
  await assertWorkspaceOwner(viewer);
  const { data } = await db.from("themes").select("id").eq("id", id).single();
  if (!data) forbidden();
  await db.from("themes").update({ is_default: false }).eq("is_default", true);
  await db.from("themes").update({ is_default: true }).eq("id", id);
  done();
}

/** null: follow the team default. */
export async function setDashboardTheme(dashboardId: number, themeId: number | null) {
  const viewer = await viewerId();
  await assertCanEditDashboard(dashboardId, viewer);
  if (themeId !== null && !(await db.from("themes").select("id").eq("id", themeId).single()).data) forbidden();
  await ensureBaseline("dashboard", dashboardId, viewer);
  await db.from("dashboards").update({ theme_id: themeId }).eq("id", dashboardId);
  await recordVersion("dashboard", dashboardId, viewer);
  done();
}

export async function setDeckTheme(deckId: number, themeId: number | null) {
  const viewer = await viewerId();
  const role = (await visibleDecks(viewer)).find((d) => d.id === deckId)?.role;
  if (role !== "owner" && role !== "editor") forbidden();
  if (themeId !== null && !(await db.from("themes").select("id").eq("id", themeId).single()).data) forbidden();
  await ensureBaseline("deck", deckId, viewer);
  await db.from("decks").update({ theme_id: themeId }).eq("id", deckId);
  await recordVersion("deck", deckId, viewer);
  done();
}
