// The words a visitor may write in the demo (GLOSSARY: Demo Mode; spec 0051, Limits: Texts). Pure. What passes is
// plain text of a short length; it is drawn as text and never as markup, and an address in it is not made a link (the
// screens do that). These rules keep out what has no honest use in a shared demo, where a stranger's words are seen by
// the next visitor: control characters, hidden or blank-looking characters (which make one text read as another or as
// nothing), piles of combining marks, tags, and anything that works as a web address, an email address or a link.
// The text is first brought to NFKC, so full-width and compatibility forms are checked as what they look like.
import { Forbidden } from "./actor";
import { DEMO_TEXT_MAX, DEMO_VALUE_LIMITS } from "./demo-limits";
import { DEMO_TEXT_WORDS, DEMO_VALUE_WORDS } from "./demo-words";

/** The kinds of text and their length: `name` is a name or title, `message` a Question, Task or reply. */
export type DemoTextKind = keyof typeof DEMO_TEXT_MAX;

/** The cleaned text, or the words to show a visitor. */
export type DemoTextResult = { ok: true; text: string } | { ok: false; words: string };


// The zero-width non-joiner and joiner as a piece of a character class, for the pattern below.
const ZW = String.fromCharCode(0x200C, 0x200D);

/** A character class of the code points and ranges given (written as numbers, so no invisible character sits in this
 * file), as a regular expression with the `u` flag, global when `global`. */
function codePoints(items: (number | [number, number])[], global = true): RegExp {
  const hex = (n: number) => String.raw`\u{${n.toString(16)}}`;
  return new RegExp(`[${items.map((i) => (typeof i === "number" ? hex(i) : `${hex(i[0])}-${hex(i[1])}`)).join("")}]`, global ? "gu" : "u");
}

// Stripped, not refused: bidirectional controls, zero-width space and marks, the byte order mark, the word joiner and
// invisible operators, the Mongolian vowel separator, the Arabic letter mark, the soft hyphen, line and paragraph
// separators, Hangul fillers and the Hangul choseong/jungseong fillers, the blank Braille pattern, and tag characters.
// The zero-width non-joiner and joiner (U+200C, U+200D) are kept where a word needs them (Persian, emoji sequences).
const HIDDEN = codePoints([0xAD, 0x61C, 0x115F, 0x1160, 0x180E, 0x200B, 0x200E, 0x200F, 0x2028, 0x2029, [0x202A, 0x202E], [0x2060, 0x2069], 0x2800, 0x3164, 0xFEFF, 0xFFA0, [0xE0000, 0xE007F]]);
// A joiner with nothing on one side (the edge of the text, a space or another joiner) joins nothing: stripped.
const LONELY_JOINER = new RegExp(String.raw`(?<=^|[\s${ZW}])[${ZW}]|[${ZW}](?=$|[\s${ZW}])`, "gu");
// Control characters; a message may keep a new line and a tab.
const CONTROL_SINGLE = codePoints([[0, 0x1F], [0x7F, 0x9F]], false);
const CONTROL_MULTI = codePoints([[0, 8], 0xB, 0xC, [0xE, 0x1F], [0x7F, 0x9F]], false);
// More than three combining marks in a row stack into a smear that runs over other lines ("zalgo").
const MARK_PILE = /\p{M}{4,}/u;
const MARKUP = /<[a-zA-Z/!?]/;
// Anything that works as a link: a scheme with // or a known scheme, `//` alone, www., a markdown link, and a
// domain-like token (name, a dot written plainly or hidden in brackets, a top-level domain, then a slash, a colon, a
// query, a space or the end). "e.g." and "Q3." pass (one letter after the dot is not a domain).
const LINK = new RegExp(
  [
    String.raw`[a-z][a-z0-9+.-]*:\/\/`,
    String.raw`\/\/`,
    String.raw`\b(?:mailto|data|javascript|vbscript|file|ftp|tel|sms|blob|about):`,
    String.raw`\bwww\.`,
    String.raw`\]\s*\(`,
    String.raw`[a-z0-9-]+(?:\.|\[\.\]|\(\.\)|\[dot\]|\(dot\))[a-z]{2,}(?:[/:?#\s]|$)`,
    String.raw`@[a-z0-9-]+(?:\.|\[\.\])[a-z]{2,}`,
  ].join("|"),
  "i",
);

/** Checks and cleans a text for the demo: brings it to NFKC, strips hidden and blank-looking characters, trims, and
 * refuses an empty text, one over the kind's length (in characters people see), control characters, a pile of more than
 * three combining marks, tags, and anything that works as a web, email or markdown link. Answers the cleaned text or
 * the words to show. */
export function demoTextOk(text: string, kind: DemoTextKind): DemoTextResult {
  const raw = String(text ?? "");
  // A huge text is refused before any normalising or splitting.
  if (raw.length > DEMO_TEXT_MAX[kind] * 8) return { ok: false, words: DEMO_TEXT_WORDS.long };
  const clean = raw.normalize("NFKC").replace(HIDDEN, "").replace(LONELY_JOINER, "").trim();
  if (clean.length === 0) return { ok: false, words: DEMO_TEXT_WORDS.empty };
  if (Array.from(clean).length > DEMO_TEXT_MAX[kind]) return { ok: false, words: DEMO_TEXT_WORDS.long };
  if ((kind === "message" ? CONTROL_MULTI : CONTROL_SINGLE).test(clean) || MARK_PILE.test(clean)) return { ok: false, words: DEMO_TEXT_WORDS.characters };
  if (MARKUP.test(clean)) return { ok: false, words: DEMO_TEXT_WORDS.markup };
  if (LINK.test(clean)) return { ok: false, words: DEMO_TEXT_WORDS.link };
  return { ok: true, text: clean };
}

/** A visitor's text refused by the rules above. A Forbidden, so every place that shows a refusal shows its words. */
export class DemoTextRefused extends Forbidden {
  constructor(words: string) {
    super(words);
    this.name = "DemoTextRefused";
  }
}

/** The cleaned text of a visitor's, or a `DemoTextRefused` with the words to show. */
function demoTextOrRefuse(text: string, kind: DemoTextKind): string {
  const r = demoTextOk(text, kind);
  if (!r.ok) throw new DemoTextRefused(r.words);
  return r.text;
}

/** What a core operation takes of a text that may come from a visitor of the demo: while `visiting` (a change of an allowed
 * action, made as a demo visit), a text that is not empty must pass the rules and is used cleaned; otherwise, and for an empty
 * one, it is used as it is (the operation checks it as it always does). */
export function demoTextForVisit(visiting: boolean, text: string, kind: DemoTextKind): string {
  return visiting && String(text ?? "").trim() !== "" ? demoTextOrRefuse(String(text), kind) : text;
}

/** A paste's cells as lines, each checked and cleaned as a message of a visitor (tabs and new lines stay; blank lines are
 * kept as they are), at most 400 lines. Refused whole with the words to show when any line is. */
export function demoPasteText(text: string): string {
  const lines = String(text ?? "").split(/\r?\n/);
  if (lines.length > DEMO_VALUE_LIMITS.pasteLines) throw new DemoTextRefused(DEMO_VALUE_WORDS.pasteLong);
  // A cell left empty at the start or end of a line is a column of its own: the tabs and spaces around a line stay as pasted.
  return lines.map((l) => (l.trim() === "" ? "" : `${/^[ \t]*/.exec(l)![0]}${demoTextOrRefuse(l, "message")}${/[ \t]*$/.exec(l)![0]}`)).join("\n");
}
