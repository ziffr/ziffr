// The slide editor's license key (spec 0025; GLOSSARY: Installation Settings, Deck). tldraw draws Decks and free
// layouts, and on a public https address it shows them only with a key from tldraw. The key is not a secret: it goes
// to the browser of whoever sees a Deck or a free layout. Pure, so the settings page and the route share it.

/** The longest key taken: a license that lists many domains is long. The table takes 4096. */
export const SLIDE_EDITOR_KEY_MAX = 4000;

// tldraw's own form: "tldraw-<…>/<license>.<signature>", both parts base64.
const KEY = /^tldraw-[^\s./]{0,100}\/[A-Za-z0-9+/=_-]+\.[A-Za-z0-9+/=_-]+$/;

/** The key as tldraw reads it (without line breaks, invisible characters or outer spaces), or null when the value does
 * not have a key's shape or length. Only tldraw says whether the key is good. */
export function slideEditorLicenseKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length > SLIDE_EDITOR_KEY_MAX * 2) return null;
  const key = value.replace(/[​-‍﻿\r\n]/g, "").trim();
  return key.length <= SLIDE_EDITOR_KEY_MAX && KEY.test(key) ? key : null;
}
