// The forms of a deck's stored slides (GLOSSARY: Deck, Deck Description; spec 0069): the slide editor's, and the
// description of a deck Ziffr makes, told apart by `format`. Every reader of `decks.document` asks here, so that a form
// no reader knows opens nothing and is never saved over. A description is read only from a deck Ziffr made
// (`decks.made`): whoever loads a document to read it loads that mark with it.
import { checkDeckDescription, type DeckDescription } from "@ziffr/pack/deck-description";
import { MADE_DECKS_ON } from "./made-decks-on";

/** Whether a stored or sent document names its own form, as a deck description does and the slide editor's never does.
 * True also for a form no reader knows. */
export function isDescribed(document: unknown): boolean {
  return !!document && typeof document === "object" && !Array.isArray(document) && "format" in document;
}

/** A document that names its own form, read: undefined for the slide editor's forms; null for one that opens nothing (an
 * unknown form, one that fails its checks, one of a deck Ziffr did not make, or any while made decks are off); else the
 * checked description, as a copy. `made` is the deck row's `made` column: anything but true, absent included, opens nothing. */
export function describedDeck(document: unknown, made: unknown): DeckDescription | null | undefined {
  if (!isDescribed(document)) return undefined;
  // Only decks Ziffr made are read as made decks, and none while made decks are off.
  if (made !== true || !MADE_DECKS_ON) return null;
  const checked = checkDeckDescription(document);
  return checked.ok ? checked.value : null;
}

/** The Metrics a description's slides list, hidden slides included: what a Share of the deck opens. */
export function describedMetricIds(description: DeckDescription): number[] {
  return [...new Set(description.slides.flatMap((s) => s.metrics))];
}

/** Why a Version of a made deck is not brought back, or null. Ziffr made the deck (`made`, the row's, which a restore
 * never changes), and both what is stored and what the Version holds are slides Ziffr reads. A restore puts every headline and answer back, also on slides the restorer is not sent, so they
 * must see every Metric of both. */
export function madeRestoreProblem(current: unknown, restored: unknown, made: unknown, seen: ReadonlySet<number>): "unreadable" | "hidden" | null {
  const now = describedDeck(current, made), then = describedDeck(restored, made);
  if (!now || !then) return "unreadable";
  return [now, then].every((d) => describedMetricIds(d).every((m) => seen.has(m))) ? null : "hidden";
}
