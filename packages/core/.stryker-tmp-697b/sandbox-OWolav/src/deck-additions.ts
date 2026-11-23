// @ts-nocheck
// Adding a widget to a deck from its menu (ticket #1; GLOSSARY: Widget, Deck, Finding, Share): a widget of a
// dashboard or story, or one of the person's own saved widgets, goes onto a slide of a deck as an independent copy,
// as from the Pool. Every function takes the Actor first. Security: the person must be able to open the widget's
// dashboard (or own the saved widget), change the deck (its owner or an Editor), and see every Metric the copy
// draws; a deck shows its Metrics to everyone it is shared with. The deck editor places the copy and saves the deck,
// and saveDeck checks the Metrics again.
import { recordedWidgets } from "./tag-widgets";
import { db } from "./db";
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { visibleDecks } from "./access";
import { specFrom } from "./dashboards";
import { createDeck } from "./decks";
import type { Widget } from "./types";

/** A slide of a deck, by its shape id and the name the editor gave it ("Slide 3"), in reading order. */
export type DeckSlide = { id: string; name: string };
/** A deck a person may add a widget to, with its slides. */
export type DeckTarget = { id: number; name: string; slides: DeckSlide[] };
/** What the deck editor places: the copy of the widget, and the slide it goes on (null: a new slide at the end). */
export type DeckAddition = { widget: Pick<Widget, "template" | "metric_ids" | "settings" | "title">; slide: string | null };

/** Most decks offered, the most recently changed first: each is read in full for its slides. */
const MAX_DECKS = 30;
/** Most slides listed per deck in the menu: a longer deck is still offered, its later slides through New slide. */
const MAX_SLIDES = 60;
/** How a slide's id looks: a tldraw shape id. Anything else from a browser is not one. */
const SLIDE_ID = /^shape:[A-Za-z0-9_-]{1,64}$/;

/** A deck's slides from its stored document: the frames of its page, top to bottom, then left to right. */
export function slidesOf(document: unknown): DeckSlide[] {
  const store = (document as { store?: Record<string, unknown> } | null)?.store;
  if (!store || typeof store !== "object") return [];
  const frames: (DeckSlide & { x: number; y: number })[] = [];
  for (const r of Object.values(store)) {
    const f = r as { typeName?: unknown; type?: unknown; id?: unknown; x?: unknown; y?: unknown; props?: { name?: unknown } };
    if (f?.typeName !== "shape" || f.type !== "frame" || typeof f.id !== "string" || !SLIDE_ID.test(f.id)) continue;
    // Plain text only: the name shows in a menu.
    const name = typeof f.props?.name === "string" ? f.props.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) : "";
    frames.push({ id: f.id, name, x: Number(f.x) || 0, y: Number(f.y) || 0 });
  }
  return frames.sort((a, b) => a.y - b.y || a.x - b.x).map((f, i) => ({ id: f.id, name: f.name || `Slide ${i + 1}` }));
}

/** The decks the actor may add a widget to: their own and those shared with them as Editor, newest first, each with
 * its slides. Nothing for a Guest, who changes no deck. */
export async function deckTargets(actor: Actor): Promise<DeckTarget[]> {
  if (!can(actor, "create")) return [];
  const editable = (await visibleDecks(actor.workspaceId, actor.personId)).filter((d) => d.role === "owner" || d.role === "editor").slice(0, MAX_DECKS);
  if (!editable.length) return [];
  const { data } = await db().from("decks").select("id, document").eq("workspace_id", actor.workspaceId).in("id", editable.map((d) => d.id));
  const docs = new Map((data ?? []).map((d) => [d.id as number, d.document]));
  return editable.map((d) => ({ id: d.id, name: d.name, slides: slidesOf(docs.get(d.id)).slice(0, MAX_SLIDES) }));
}

/** What adding widget `widgetId` to deck `deckId` places, on slide `slide` or a new one: refused unless the actor may
 * change the deck, may open the widget, and sees every Metric it draws. A slide the deck no longer has becomes a new
 * slide. */
export async function deckAddition(actor: Actor, deckId: number, widgetId: number, slide?: string | null): Promise<DeckAddition> {
  assertCan(actor, "create");
  if (!Number.isSafeInteger(deckId) || !Number.isSafeInteger(widgetId) || widgetId <= 0) throw new Forbidden();
  const role = (await visibleDecks(actor.workspaceId, actor.personId)).find((d) => d.id === deckId)?.role;
  if (role !== "owner" && role !== "editor") throw new Forbidden("Only the deck's owner and its Editors add to it.");
  const spec = await specFrom(actor, { type: "widget", id: widgetId });
  let on: string | null = null;
  if (typeof slide === "string" && SLIDE_ID.test(slide)) {
    const { data } = await db().from("decks").select("document").eq("id", deckId).eq("workspace_id", actor.workspaceId).maybeSingle();
    on = slidesOf(data?.document).some((s) => s.id === slide) ? slide : null;
  }
  // A widget of "all Metrics tagged X" is added as the Metrics this person sees now; it follows the Tag no more (spec 0038).
  const [widget] = await recordedWidgets(actor, [{ ...spec, id: widgetId } as unknown as Widget]);
  return { widget: { template: widget.template, metric_ids: widget.metric_ids, settings: widget.settings, title: spec.title }, slide: on };
}

/** A new deck for adding widget `widgetId` to, named after it: the widget is checked first, so a refused one leaves
 * no empty deck behind. Answers the deck's id; the copy is placed as by deckAddition. */
export async function newDeckFor(actor: Actor, widgetId: number): Promise<number> {
  assertCan(actor, "create");
  if (!Number.isSafeInteger(widgetId) || widgetId <= 0) throw new Forbidden();
  const spec = await specFrom(actor, { type: "widget", id: widgetId });
  return createDeck(actor, spec.title || "New deck");
}
