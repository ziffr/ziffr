// "Add to deck…" (ticket #1): what the person asked to add, kept in a cookie of this site only, not in the address.
// Security: opening a deck adds a copy and saves it, so a link someone else sends (/decks/5?add=…) must not do it.
// The server action that the person's own menu calls sets an HttpOnly cookie with a random value; the deck page
// adds only when the address carries that same value, which no other site and no link can know, and only for the
// person who asked. It is used once: the editor clears it as soon as the copy is placed (and drops the value from the
// address); unused, it runs out after two minutes.
import { randomBytes, timingSafeEqual } from "node:crypto";

/** The cookie's name. */
export const DECK_ADD_COOKIE = "ziffr-deck-add";
/** How long the person has from choosing Add to the deck opening, in seconds. */
export const DECK_ADD_SECONDS = 120;

/** What was asked for: a copy of a widget on a slide (null: a new one), or a Snapshot's slides (spec 0061). */
export type DeckAddIntent = { widgetId: number; slide: string | null } | { snapshotId: number };

/** What the cookie holds, and the random value the address must repeat. */
export function newIntent(personId: string, deckId: number, what: DeckAddIntent): { cookie: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  return { cookie: JSON.stringify({ personId, deckId, ...what, nonce }), nonce };
}

/** What to add to deck `deckId`, if the cookie asks for it for `personId` and the address repeats its value. */
export function readIntent(cookie: string | undefined, personId: string, deckId: number, nonce: string | undefined): DeckAddIntent | null {
  if (!cookie || !nonce || nonce.length > 64) return null;
  try {
    const v = JSON.parse(cookie) as { personId?: unknown; deckId?: unknown; widgetId?: unknown; slide?: unknown; snapshotId?: unknown; nonce?: unknown };
    if (v.personId !== personId || v.deckId !== deckId || typeof v.nonce !== "string") return null;
    const a = Buffer.from(v.nonce);
    const b = Buffer.from(nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Number.isSafeInteger(v.snapshotId)) return { snapshotId: v.snapshotId as number };
    return Number.isSafeInteger(v.widgetId) ? { widgetId: v.widgetId as number, slide: typeof v.slide === "string" ? v.slide : null } : null;
  } catch {
    return null;
  }
}
