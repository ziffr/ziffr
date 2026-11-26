// Decks (GLOSSARY: Deck, Share, Theme): a deck's owner and its Editors change it, Viewers only present it, only the
// owner deletes it. Every function takes the Actor first and works only inside the actor's Workspace; a deck shows
// its Metrics to everyone it is shared with, so only Metrics the saver sees can be added to it.
import { withoutNestedTagSources } from "./tag-source";
import { db } from "./db";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { visibleDecks } from "./access";
import { assertSeesMetrics } from "./sharing";
import { allDeckMetricIds, deckMetricIds, deckMetricIdsAdded } from "./visibility";
import { assertWidgetDesigns } from "./widget-designs";
import { ensureBaseline, recordVersion } from "./versions";
import { assertNoOutsideContent } from "./deck-content";
import { withoutUnaskedMetrics } from "./slide-text";
import { snapshotPartProblem } from "./snapshot-parts";
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

/** What a save is refused with when it would draw live what kept a Snapshot's numbers (spec 0061). */
const GOES_LIVE = "This change would show live numbers of a Metric you cannot see: a Widget, Slide Element or text box that kept a Snapshot's numbers would no longer be on a slide that keeps them. Undo, remove it, or ask someone who sees the Metric to make this change.";

/** Refuses in plain words a save that draws live a Metric the deck named only on slides that keep numbers, by someone
 * who does not see it: a part or a slide's mark was removed, or the Widget moved to another slide. */
async function assertSeesWhatGoesLive(actor: Actor, before: unknown, after: unknown) {
  const named = new Set(allDeckMetricIds(before));
  const live = new Set(deckMetricIds(before));
  try {
    await assertSeesMetrics(actor, deckMetricIds(after).filter((m) => named.has(m) && !live.has(m)));
  } catch (err) {
    if (err instanceof Forbidden) throw new Refused(GOES_LIVE);
    throw err;
  }
}

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

/** Saves a deck's slides. Metrics added since the last save, on any slide, must be ones the actor sees. */
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
  // A Snapshot Part stores its Snapshot and part number and nothing else, and a deck holds so many (spec 0061).
  const partProblem = snapshotPartProblem(document);
  if (partProblem) throw new Refused(partProblem);
  const { data: before } = await db().from("decks").select("document").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  // In a demo visit the document is rebuilt from words and shapes the demo accepts, within its size, before the write below.
  document = await visitorDeckDocument(actor, document, before?.document);
  // A text box is stored listing only the Metrics its words ask for: those are what is checked here.
  document = withoutUnaskedMetrics(document);
  const added = deckMetricIdsAdded(before?.document, document);
  if (added.some((m) => !Number.isFinite(m))) throw new Error("A widget or text box on this deck names its metrics in a way Ziffr cannot read. Remove or recreate it, then save.");
  await assertSeesWhatGoesLive(actor, before?.document, document);
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
