// The Themes of a Workspace (GLOSSARY: Theme): owners and admins change them; dashboards and decks pick one. Every
// function takes the Actor first and works only inside the actor's workspace.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { cleanSlides, cleanTokens } from "./theme-tokens";
import { ensureBaseline, recordVersion } from "./versions";
import type { ThemeSlides, ThemeTokens } from "./types";

/** A Theme of the actor's workspace, or Forbidden. */
async function themeOf(actor: Actor, id: number) {
  const { data } = await db().from("themes").select("id, name, tokens, slides, is_default").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return data;
}

/** Saves a Theme's name, tokens and slide settings, each checked. */
export async function saveTheme(actor: Actor, id: number, name: string, tokens: ThemeTokens, slides: ThemeSlides) {
  assertCan(actor, "manage-themes");
  const clean = cleanTokens(tokens);
  if (!clean) throw new Error("Some colours or fonts are not valid.");
  await themeOf(actor, id);
  await ensureBaseline("theme", id, actor.personId);
  const { error } = await db().from("themes").update({ name: String(name ?? "").trim().slice(0, 60) || "Untitled theme", tokens: clean, slides: cleanSlides(slides), updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The theme could not be saved.");
  await recordVersion("theme", id, actor.personId);
}

/** A new Theme starts as a copy of another of the workspace. Returns its id. */
export async function duplicateTheme(actor: Actor, fromId: number): Promise<number> {
  assertCan(actor, "manage-themes");
  const from = await themeOf(actor, fromId);
  const { data, error } = await db().from("themes").insert({ owner_id: actor.personId, name: `${from.name} copy`.slice(0, 60), tokens: from.tokens, slides: from.slides, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The theme could not be created.");
  await recordVersion("theme", data.id, actor.personId, { message: `Copied from ${from.name}` });
  return data.id;
}

/** Deletes a Theme; dashboards and decks using it fall back to the default. The default itself stays. */
export async function deleteTheme(actor: Actor, id: number) {
  assertCan(actor, "manage-themes");
  const t = await themeOf(actor, id);
  if (t.is_default) throw new Error("The team default cannot be deleted. Make another theme the default first.");
  await db().from("themes").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** Makes a Theme the workspace's default. */
export async function setDefaultTheme(actor: Actor, id: number) {
  assertCan(actor, "manage-themes");
  await themeOf(actor, id);
  await db().from("themes").update({ is_default: false }).eq("is_default", true).eq("workspace_id", actor.workspaceId);
  await db().from("themes").update({ is_default: true }).eq("id", id).eq("workspace_id", actor.workspaceId);
}
