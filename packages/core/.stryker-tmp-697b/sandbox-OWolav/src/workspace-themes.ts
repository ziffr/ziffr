// @ts-nocheck
// The Themes of a Workspace (GLOSSARY: Theme): owners and admins change them; dashboards and decks pick one. Every
// function takes the Actor first and works only inside the actor's workspace.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { cleanSlides, cleanTokens } from "./theme-tokens";
import { standardTheme } from "./standard-themes";
import { checkThemeFile, themeFromFile, type ThemeFile } from "./theme-file";
import type { Problem } from "./json-check";
import { ensureBaseline, recordVersion } from "./versions";
import { cleanLogo, PACK_LOGO_MAX_BYTES } from "@ziffr/pack/logo";
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
  await assertRoom(actor);
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

/** Whose logo a Theme shows when it is exactly the logo of a Pack installed here, as { pack, author }; null for any other
 * logo or none (spec 0039). Compared byte for byte on the checked pictures, so a logo the Owner chose is never named as
 * a Pack's. For the question asked before such a Theme becomes the team default. */
export async function themeLogoSource(actor: Actor, id: number): Promise<{ pack: string; author: string } | null> {
  assertCan(actor, "manage-themes");
  const t = await themeOf(actor, Number(id));
  const own = cleanLogo((t.slides as { logo?: unknown } | null)?.logo);
  if (!own) return null;
  const { data } = await db().from("pack_installs").select("manifest").eq("workspace_id", actor.workspaceId);
  for (const r of data ?? []) {
    const m = r.manifest as { name?: unknown; author?: { name?: unknown }; logo?: unknown } | null;
    if (m?.logo !== undefined && cleanLogo(m.logo, PACK_LOGO_MAX_BYTES) === own) return { pack: String(m.name ?? ""), author: String(m.author?.name ?? "") };
  }
  return null;
}

/** Makes a Theme the workspace's default. */
export async function setDefaultTheme(actor: Actor, id: number) {
  assertCan(actor, "manage-themes");
  await themeOf(actor, id);
  await db().from("themes").update({ is_default: false }).eq("is_default", true).eq("workspace_id", actor.workspaceId);
  await db().from("themes").update({ is_default: true }).eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** At most this many Themes in a Workspace, so the picker stays one people can choose from. */
export const MAX_WORKSPACE_THEMES = 50;

async function assertRoom(actor: Actor) {
  const { count } = await db().from("themes").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId);
  if ((count ?? 0) >= MAX_WORKSPACE_THEMES) throw new Error(`A Workspace keeps at most ${MAX_WORKSPACE_THEMES} Themes; delete one first.`);
}

/** Adds a standard Theme (STANDARD_THEMES) to the Workspace as an ordinary Theme of its own, which can be changed
 * like any other (Owners and Admins; audited). Returns its id. */
export async function addStandardTheme(actor: Actor, key: string): Promise<number> {
  assertCan(actor, "manage-themes");
  const std = standardTheme(key);
  if (!std) throw new Error("There is no such standard Theme.");
  await assertRoom(actor);
  const { data, error } = await db().from("themes").insert({ owner_id: actor.personId, name: std.name, tokens: std.tokens, slides: std.slides, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The theme could not be added.");
  await recordVersion("theme", data.id, actor.personId, { message: `Added the standard Theme ${std.name}` });
  await audit(actor, { kind: "theme.added", object: { type: "theme", id: Number(data.id), name: std.name }, details: { standard: std.key } });
  return Number(data.id);
}

/** Adds a Theme from the text of a Theme file (Owners and Admins; audited). The file is checked here, on the server,
 * whatever the browser checked before: size and depth, then the schema; a Theme file holds no image and no web address,
 * and its tokens go through the same checks as a Theme saved from the editor. */
export async function importTheme(actor: Actor, text: string): Promise<{ ok: true; id: number } | { ok: false; problems: Problem[] }> {
  assertCan(actor, "manage-themes");
  const res = checkThemeFile(typeof text === "string" ? text : "");
  if (!res.ok) return res;
  if (!cleanTokens(themeFromFile(res.value).tokens)) return { ok: false, problems: [{ path: "", line: null, message: "Some colours or fonts are not valid." }] };
  return { ok: true, ...(await addThemeFromFile(actor, res.value, "Imported from a Theme file")) };
}

/** Adds a Theme from a checked Theme file as a Theme of the Workspace: its tokens go through the same checks as one
 * saved from the editor, and the number of Themes is held. The caller has checked who may and the file's own schema
 * (a Workspace Export holds its Themes to the app's text rules, a Theme file to the Pack's). */
export async function addThemeFromFile(actor: Actor, file: ThemeFile, message: string): Promise<{ id: number }> {
  assertCan(actor, "manage-themes");
  const t = themeFromFile(file);
  const tokens = cleanTokens(t.tokens);
  if (!tokens) throw new Error("Some colours or fonts of a Theme are not valid.");
  await assertRoom(actor);
  const { data, error } = await db().from("themes").insert({ owner_id: actor.personId, name: t.name.slice(0, 60), tokens, slides: cleanSlides(t.slides), workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The theme could not be imported.");
  await recordVersion("theme", data.id, actor.personId, { message });
  await audit(actor, { kind: "theme.imported", object: { type: "theme", id: Number(data.id), name: t.name }, details: {} });
  return { id: Number(data.id) };
}
