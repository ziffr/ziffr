// Decks (GLOSSARY: Deck, Share, Theme): a deck's owner and its Editors change it, Viewers only present it, only the
// owner deletes it. Every function takes the Actor first and works only inside the actor's Workspace; a deck shows
// its Metrics to everyone it is shared with, so only Metrics the saver sees can be added to it.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { visibleDecks } from "./access";
import { assertSeesMetrics } from "./sharing";
import { deckMetricIds } from "./visibility";
import { ensureBaseline, recordVersion } from "./versions";

/** The largest deck document stored, so a browser cannot fill the database. */
const MAX_DOCUMENT = 8_000_000;

/** The actor's role on a deck of their workspace, or null. */
export async function deckRole(actor: Actor, id: number) {
  return (await visibleDecks(actor.workspaceId, actor.personId)).find((d) => d.id === id)?.role ?? null;
}

/** Refuses anyone but the deck's owner and its Editors. */
async function assertCanEditDeck(actor: Actor, id: number) {
  const role = await deckRole(actor, id);
  if (role !== "owner" && role !== "editor") throw new Forbidden();
}

const touch = () => new Date().toISOString();

/** Creates an empty deck owned by the actor; Guests create nothing. */
export async function createDeck(actor: Actor, name: string): Promise<number> {
  assertCan(actor, "create");
  const { data, error } = await db().from("decks").insert({ name: String(name ?? "").trim().slice(0, 120) || "Untitled deck", owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The deck could not be created.");
  return data.id;
}

/** Saves a deck's slides. Metrics added since the last save must be ones the actor sees. */
export async function saveDeck(actor: Actor, id: number, document: unknown) {
  await assertCanEditDeck(actor, id);
  if (JSON.stringify(document ?? null).length > MAX_DOCUMENT) throw new Error("This deck is too large to save.");
  const { data: before } = await db().from("decks").select("document").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  // A malformed marker (NaN) never counts as "already there": only real ids are.
  const had = new Set(deckMetricIds(before?.document).filter(Number.isFinite));
  const added = deckMetricIds(document).filter((m) => !had.has(m));
  if (added.some((m) => !Number.isFinite(m))) throw new Error("A widget on this deck names its metrics in a way Ziffr cannot read. Remove or recreate that widget, then save.");
  await assertSeesMetrics(actor, added);
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ document, updated_at: touch() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}

/** Renames a deck. */
export async function renameDeck(actor: Actor, id: number, name: string) {
  await assertCanEditDeck(actor, id);
  await db().from("decks").update({ name: String(name ?? "").trim().slice(0, 120) || "Untitled deck", updated_at: touch() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}

/** Deletes a deck; only its owner may. */
export async function deleteDeck(actor: Actor, id: number) {
  const { data } = await db().from("decks").select("owner_id").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
  await db().from("decks").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** The deck's own footer; null uses the Theme's. */
export async function setDeckFooter(actor: Actor, id: number, footer: string | null) {
  await assertCanEditDeck(actor, id);
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ footer: footer === null ? null : String(footer).slice(0, 120), updated_at: touch() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}

/** Gives a deck a Theme of the workspace, or null to follow the team default. */
export async function setDeckTheme(actor: Actor, id: number, themeId: number | null) {
  await assertCanEditDeck(actor, id);
  if (themeId !== null && !(await db().from("themes").select("id").eq("id", themeId).eq("workspace_id", actor.workspaceId).maybeSingle()).data) throw new Forbidden();
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ theme_id: themeId }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}
