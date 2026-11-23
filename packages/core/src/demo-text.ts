// The words a visitor may write in the demo (GLOSSARY: Demo Mode; spec 0051, Limits: Texts). Pure. What passes is
// plain text of a short length; it is drawn as text and never as markup, and an address in it is not made a link (the
// screens do that), so these rules only keep out what has no honest use: control characters, hidden direction and
// zero-width characters (which make one text read as another), tags, and web addresses in a name, title or Tag.
import { DEMO_TEXT_MAX } from "./demo-limits";
import { DEMO_TEXT_WORDS } from "./demo-words";

/** The kinds of text and their length: `name` is a name or title, `message` a Question, Task or reply. */
export type DemoTextKind = keyof typeof DEMO_TEXT_MAX;

/** The cleaned text, or the words to show a visitor. */
export type DemoTextResult = { ok: true; text: string } | { ok: false; words: string };

// Bidirectional controls, zero-width characters, the byte order mark and the Arabic letter mark: stripped, not refused.
const HIDDEN = /[؜᠎​-‏‪-‮⁠-⁩﻿]/g;
// Control characters; a message may keep a new line and a tab.
const CONTROL_SINGLE = /[\u0000-\u001F\u007F-\u009F]/;
const CONTROL_MULTI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const MARKUP = /<[a-zA-Z/!?]/;
const LINK = /(?:[a-z][a-z0-9+.-]{1,15}:\/\/|\bwww\.)/i;

/** Checks and cleans a text for the demo: strips hidden direction and zero-width characters, trims, and refuses an empty
 * text, one over the kind's length, control characters, tags, and (in a `name` or `tag`) web addresses. Answers the
 * cleaned text or the words to show. Changes nothing a visitor typed beyond the hidden characters and the edges. */
export function demoTextOk(text: string, kind: DemoTextKind): DemoTextResult {
  const clean = String(text ?? "").replace(HIDDEN, "").trim();
  if (clean.length === 0) return { ok: false, words: DEMO_TEXT_WORDS.empty };
  // Counted in characters people see, so an emoji is one; a huge text is refused before it is split.
  if (clean.length > DEMO_TEXT_MAX[kind] * 2 || Array.from(clean).length > DEMO_TEXT_MAX[kind]) return { ok: false, words: DEMO_TEXT_WORDS.long };
  if ((kind === "message" ? CONTROL_MULTI : CONTROL_SINGLE).test(clean)) return { ok: false, words: DEMO_TEXT_WORDS.characters };
  if (MARKUP.test(clean)) return { ok: false, words: DEMO_TEXT_WORDS.markup };
  if ((kind === "name" || kind === "tag") && LINK.test(clean)) return { ok: false, words: DEMO_TEXT_WORDS.link };
  return { ok: true, text: clean };
}
