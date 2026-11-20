// "Add to deck…" adds only what the person's own menu asked for (ticket #1): the deck page needs the cookie the
// server action set and the same random value in the address; a link alone, another deck or a wrong value adds nothing.
import { describe, expect, it } from "vitest";
import { newIntent, readIntent } from "./deck-add-intent";

describe("the intent to add a widget to a deck", () => {
  it("is read back for the same person, deck and value, and never otherwise", () => {
    const { cookie, nonce } = newIntent("sara", 5, 42, "shape:a");
    expect(readIntent(cookie, "sara", 5, nonce)).toEqual({ widgetId: 42, slide: "shape:a" });
    expect(readIntent(undefined, "sara", 5, nonce)).toBeNull();
    expect(readIntent(cookie, "sara", 6, nonce)).toBeNull();
    expect(readIntent(cookie, "sara", 5, undefined)).toBeNull();
    expect(readIntent(cookie, "sara", 5, `${nonce}x`)).toBeNull();
    expect(readIntent(cookie, "sara", 5, newIntent("sara", 5, 42, null).nonce)).toBeNull();
    expect(readIntent("{not json", "sara", 5, nonce)).toBeNull();
    expect(readIntent(JSON.stringify({ personId: "sara", deckId: 5, widgetId: "42", nonce }), "sara", 5, nonce)).toBeNull();
    // Only for the person who asked, not for whoever signs in on the same browser next.
    expect(readIntent(cookie, "ben", 5, nonce)).toBeNull();
  });

  it("makes a new random value each time", () => {
    expect(newIntent("sara", 1, 1, null).nonce).not.toBe(newIntent("sara", 1, 1, null).nonce);
  });
});
