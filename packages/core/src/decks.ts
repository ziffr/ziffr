// Decks (GLOSSARY: Deck, Share, Theme): a deck's owner and its Editors change it, Viewers only present it, only the
// owner deletes it. Every function takes the Actor first and works only inside the actor's Workspace; a deck shows
// its Metrics to everyone it is shared with, so only Metrics the saver sees can be added to it.
import { withoutNestedTagSources } from "./tag-source";
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { visibleDecks } from "./access";
import { assertSeesMetrics } from "./sharing";
import { deckMetricIds } from "./visibility";
import { assertWidgetDesigns } from "./widget-designs";
import { ensureBaseline, recordVersion } from "./versions";
import { assertNoOutsideContent } from "./deck-content";
import { refuseSeeded } from "./demo-seeded-rows";
import { visitorDeckDocument } from "./demo-visitor-deck";
import { visitorSharedStaysSeen } from "./demo-visitor-sharing";
import { visitorOptionalText } from "./demo-visitor-words";

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

/** A deck's name as saved: cut to 120, "Untitled deck" when blank. A name a visitor of the demo typed goes through the text rules
 * first (the cleaned text is saved); `derived` is a name taken from something that exists already (a dashboard, a widget, a
 * template), whose words were checked when it was made or are the seed's, so it only has to fit. */
function deckName(actor: Actor, name: string, derived = false): string {
  const text = String(name ?? "").trim();
  return (derived ? text : String(visitorOptionalText(actor, text, "name")).trim()).slice(0, 120) || "Untitled deck";
}

/** Creates an empty deck owned by the actor; Guests create nothing. `derived`: the name comes from an object that exists already. */
export async function createDeck(actor: Actor, name: string, opts: { derived?: boolean } = {}): Promise<number> {
  assertCan(actor, "create");
  const { data, error } = await db().from("decks").insert({ name: deckName(actor, name, opts.derived), owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The deck could not be created.");
  return data.id;
}

/** Saves a deck's slides. Metrics added since the last save must be ones the actor sees. */
export async function saveDeck(actor: Actor, id: number, document: unknown) {
  await assertCanEditDeck(actor, id);
  // In the demo a deck the seed made is kept as it is (the tour opens it), refused before anything is read or written.
  await refuseSeeded(actor, "decks", id);
  // A widget on a slide has a list, never a Tag to follow or a Tag's name (spec 0038).
  document = withoutNestedTagSources(document);
  if (JSON.stringify(document ?? null).length > MAX_DOCUMENT) throw new Error("This deck is too large to save.");
  // Showing a deck, also through a View Link, must tell no other site that someone looked (spec 0009).
  assertNoOutsideContent(document, "deck");
  // A widget on a slide may carry a View Design: it is checked like a file brought in (spec 0024).
  assertWidgetDesigns(document);
  const { data: before } = await db().from("decks").select("document").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  // In a demo visit the document is rebuilt from words and shapes the demo accepts, within its size, before the write below.
  document = await visitorDeckDocument(actor, document, before?.document);
  // A malformed marker (NaN) never counts as "already there": only real ids are.
  const had = new Set(deckMetricIds(before?.document).filter(Number.isFinite));
  const added = deckMetricIds(document).filter((m) => !had.has(m));
  if (added.some((m) => !Number.isFinite(m))) throw new Error("A widget on this deck names its metrics in a way Ziffr cannot read. Remove or recreate that widget, then save.");
  await assertSeesMetrics(actor, added);
  // A deck that is shared shows only Metrics its recipients see (spec 0051, ticket 11).
  await visitorSharedStaysSeen(actor, "deck", id, deckMetricIds(document));
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ document, updated_at: touch() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}

/** Renames a deck. */
export async function renameDeck(actor: Actor, id: number, name: string) {
  await assertCanEditDeck(actor, id);
  await refuseSeeded(actor, "decks", id);
  await db().from("decks").update({ name: deckName(actor, name), updated_at: touch() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}

/** Deletes a deck; only its owner may. */
export async function deleteDeck(actor: Actor, id: number) {
  const { data } = await db().from("decks").select("owner_id").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
  await refuseSeeded(actor, "decks", id);
  await db().from("decks").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** The deck's own footer; null uses the Theme's. */
export async function setDeckFooter(actor: Actor, id: number, footer: string | null) {
  await assertCanEditDeck(actor, id);
  await refuseSeeded(actor, "decks", id);
  const words = footer === null ? null : String(visitorOptionalText(actor, String(footer), "name")).slice(0, 120);
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ footer: words, updated_at: touch() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}

/** Gives a deck a Theme of the workspace, or null to follow the team default. */
export async function setDeckTheme(actor: Actor, id: number, themeId: number | null) {
  await assertCanEditDeck(actor, id);
  await refuseSeeded(actor, "decks", id);
  if (themeId !== null && !(await db().from("themes").select("id").eq("id", themeId).eq("workspace_id", actor.workspaceId).maybeSingle()).data) throw new Forbidden();
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ theme_id: themeId }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId);
}
