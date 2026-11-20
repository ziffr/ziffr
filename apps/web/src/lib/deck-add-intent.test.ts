// "Add to deck…" adds only what the person's own menu asked for (ticket #1): the deck page needs the cookie the
// server action set and the same random value in the address; a link alone, another deck or a wrong value adds nothing.
import { describe, expect, it } from "vitest";
import { newIntent, readIntent } from "./deck-add-intent";

describe("the intent to add a widget to a deck", () => {
  it("is read back for the same deck and value, and never otherwise", () => {
    const { cookie, nonce } = newIntent(5, 42, "shape:a");
    expect(readIntent(cookie, 5, nonce)).toEqual({ widgetId: 42, slide: "shape:a" });
    expect(readIntent(undefined, 5, nonce)).toBeNull();
    expect(readIntent(cookie, 6, nonce)).toBeNull();
    expect(readIntent(cookie, 5, undefined)).toBeNull();
    expect(readIntent(cookie, 5, `${nonce}x`)).toBeNull();
    expect(readIntent(cookie, 5, newIntent(5, 42, null).nonce)).toBeNull();
    expect(readIntent("{not json", 5, nonce)).toBeNull();
    expect(readIntent(JSON.stringify({ deckId: 5, widgetId: "42", nonce }), 5, nonce)).toBeNull();
  });

  it("makes a new random value each time", () => {
    expect(newIntent(1, 1, null).nonce).not.toBe(newIntent(1, 1, null).nonce);
  });
});
