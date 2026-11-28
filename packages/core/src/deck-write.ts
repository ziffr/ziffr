// Making and changing a deck Ziffr makes (GLOSSARY: Deck, Deck Description; spec 0069). The owner and Editors change
// the design, show or hide slides, write own headlines and answers and clear them; the name, Theme and footer are saved
// as for every deck (decks.ts). A deck is made only from Metrics its maker sees. Every function takes the Actor first.
import type { DeckDescription, SlideDescription } from "@ziffr/pack/deck-description";
import { visibleDashboards, visibleMetricIds } from "./access";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { changedDescription, clearedDescription, describedFrom, type DeckChange } from "./deck-edits";
import { describedDeck } from "./deck-form";
import { NOT_A_MADE_DECK } from "./deck-read";
import { deckName, deckRole } from "./decks";
import { refuseSeeded } from "./demo-seeded-rows";
import { chargeVisitorDeckGrowth } from "./demo-visitor-deck";
import { visitorOptionalText } from "./demo-visitor-words";
import { MADE_DECKS_ON } from "./made-decks-on";
import { deckWithout } from "./metric-delete-rules";
import { assertSeesMetrics } from "./sharing";
import { recordedWidgets } from "./tag-widgets";
import { ensureBaseline, recordVersion } from "./versions";
import { widgetMetricIds } from "./widget-metrics";
import { getMetrics } from "./workspace-data";
import type { Widget } from "./types";

/** A made deck the actor may change: its description, and which of its slides they are sent. */
async function writableDeck(actor: Actor, id: number) {
  if (!Number.isSafeInteger(id)) throw new Forbidden();
  const role = await deckRole(actor, id);
  if (role !== "owner" && role !== "editor") throw new Forbidden();
  // In the demo a deck the seed made is kept as it is.
  await refuseSeeded(actor, "decks", id);
  const { data } = await db().from("decks").select("document, made").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  const description = describedDeck(data?.document, data?.made);
  if (!description) throw new Refused(NOT_A_MADE_DECK);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId));
  return { description, sees: (slide: SlideDescription) => slide.metrics.every((m) => seen.has(m)) };
}

/** Stores a changed description as a Version. In a demo visit what it grows by counts against the visit's writes. */
async function store(actor: Actor, id: number, before: DeckDescription, after: DeckDescription, message?: string) {
  await chargeVisitorDeckGrowth(actor, after, before);
  await ensureBaseline("deck", id, actor.personId);
  await db().from("decks").update({ document: after, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("deck", id, actor.personId, { message });
}

/** Saves a form's change to a made deck: design, show or hide, own headlines and answers. Only slides whose every
 * Metric the actor sees are changed. `change` comes from a browser and is checked whole before anything is written. */
export async function saveMadeDeck(actor: Actor, id: number, change: DeckChange): Promise<void> {
  const { description, sees } = await writableDeck(actor, id);
  const words = (text: string) => String(visitorOptionalText(actor, text, "message"));
  const next = changedDescription(description, change, { sees, words, today: new Date().toISOString().slice(0, 10) });
  await store(actor, id, description, next);
}

/** Clear answers: empties the answers on the slides the actor is sent, for the next meeting. The message gives the
 * change a Version of its own, so the Version before still holds the words. */
export async function clearDeckAnswers(actor: Actor, id: number): Promise<void> {
  const { description, sees } = await writableDeck(actor, id);
  await store(actor, id, description, clearedDescription(description, sees), "Cleared answers");
}

/** Takes the slides that list any of these Metrics off a made deck, as deleting the Metrics does (metric-delete.ts):
 * a slide goes whole, answers included, whatever else it lists. The Version before keeps it. */
export async function dropSlidesOfMetrics(actor: Actor, id: number, gone: ReadonlySet<number>): Promise<void> {
  const { description } = await writableDeck(actor, id);
  const { document, slides } = deckWithout(description, gone, true);
  if (slides) await store(actor, id, description, document as DeckDescription, "Removed slides of deleted Metrics");
}

/** Makes a new deck, owned by the actor, about the Metrics a dashboard's Widgets draw. The actor opens the dashboard and
 * sees every one of those Metrics, or nothing is made. Guests make nothing. Answers the deck's id. */
export async function makeDeckFromDashboard(actor: Actor, dashboardId: number, opts: { name?: string } = {}): Promise<number> {
  assertCan(actor, "create");
  if (!MADE_DECKS_ON || !Number.isSafeInteger(dashboardId)) throw new Forbidden();
  const dashboard = (await visibleDashboards(actor.workspaceId, actor.personId)).find((d) => d.id === dashboardId);
  if (!dashboard) throw new Forbidden();
  const { data: rows } = await db().from("widgets").select("*").eq("dashboard_id", dashboardId).eq("workspace_id", actor.workspaceId).order("y").order("x").order("id");
  // A Widget of "all Metrics tagged X" gives the Metrics this person sees now.
  const widgets = await recordedWidgets(actor, (rows ?? []) as Widget[]);
  const ids = [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];
  try {
    await assertSeesMetrics(actor, ids);
  } catch (err) {
    if (err instanceof Forbidden) throw new Refused("This dashboard shows a Metric you cannot see, so no slides are made from it.");
    throw err;
  }
  const document = describedFrom(ids);
  // A typed name goes through the demo's text rules; the dashboard's was checked when it was written.
  const name = opts.name === undefined ? deckName(actor, dashboard.name, true) : deckName(actor, opts.name);
  await chargeVisitorDeckGrowth(actor, document, null);
  // One insert with its slides: a refused or failed deck leaves no empty one behind. The only place a deck is marked as
  // made by Ziffr.
  const { data, error } = await db().from("decks").insert({ name, document, made: true, owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The deck could not be created.");
  return data.id;
}
