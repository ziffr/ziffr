// "Add to deck…" (ticket #1): what the person asked to add, kept in a cookie of this site only, not in the address.
// Security: opening a deck adds a copy and saves it, so a link someone else sends (/decks/5?add=…) must not do it.
// The server action that the person's own menu calls sets an HttpOnly cookie with a random value; the deck page
// adds only when the address carries that same value, which no other site and no link can know. The editor then
// drops it from the address, so reloading adds nothing more; the cookie runs out after two minutes.
import { randomBytes, timingSafeEqual } from "node:crypto";

/** The cookie's name. */
export const DECK_ADD_COOKIE = "ziffr-deck-add";
/** How long the person has from choosing Add to the deck opening, in seconds. */
export const DECK_ADD_SECONDS = 120;

/** What the cookie holds, and the random value the address must repeat. */
export function newIntent(deckId: number, widgetId: number, slide: string | null): { cookie: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  return { cookie: JSON.stringify({ deckId, widgetId, slide, nonce }), nonce };
}

/** The widget and slide to add to deck `deckId`, if the cookie asks for it and the address repeats its value. */
export function readIntent(cookie: string | undefined, deckId: number, nonce: string | undefined): { widgetId: number; slide: string | null } | null {
  if (!cookie || !nonce || nonce.length > 64) return null;
  try {
    const v = JSON.parse(cookie) as { deckId?: unknown; widgetId?: unknown; slide?: unknown; nonce?: unknown };
    if (v.deckId !== deckId || typeof v.nonce !== "string" || !Number.isSafeInteger(v.widgetId)) return null;
    const a = Buffer.from(v.nonce);
    const b = Buffer.from(nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { widgetId: v.widgetId as number, slide: typeof v.slide === "string" ? v.slide : null };
  } catch {
    return null;
  }
}
