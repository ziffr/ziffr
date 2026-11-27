// A Pack Guide (spec 0058, GLOSSARY: Pack Guide): what a creator tells people about a Pack, in five set sections whose
// titles Ziffr writes, read before installing and, with the installed Pack, in Help. A field of ziffr.pack/2.
// Security: a guide is text from a stranger. It is data in a fixed shape (headings, paragraphs and lists), never a markup
// language: the only formatting inside a text is a pair of ** around bold words, which `guideRuns` splits and a page
// draws as text. Every text is plain (no link, web address, HTML, brace, bracket or backtick), also as it reads with the
// bold marks taken away, so marks cannot hide an address or an order to an assistant. Its size is bounded.
import type { Schema } from "./json-check.js";
import { PLAIN, plainText, textPasses } from "./file-text.js";

/** The sections of a Pack Guide, in the order they are shown, with the titles Ziffr writes over them. */
export const PACK_GUIDE_SECTIONS = [
  { key: "whatItsFor", title: "What it's for" },
  { key: "beforeYouStart", title: "What you need" },
  { key: "firstSteps", title: "First steps" },
  { key: "eachPart", title: "Each part" },
  { key: "questions", title: "Questions" },
] as const;
/** A section of a Pack Guide, as the file names it. */
export type PackGuideSection = (typeof PACK_GUIDE_SECTIONS)[number]["key"];

/** The limits a Pack Guide is held to: the whole guide in bytes, the blocks of a section, the entries of a list and
 * the characters of a heading and of a paragraph or list entry. */
export const PACK_GUIDE_LIMITS = { bytes: 32_768, blocks: 60, items: 20, heading: 80, text: 600 } as const;

/** One part of a section: a heading, a paragraph or a list (numbered when its order matters). */
export type PackGuideBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "list"; items: string[]; numbered?: boolean };

/** A Pack Guide as a file holds it: the sections a creator filled. */
export type PackGuide = Partial<Record<PackGuideSection, PackGuideBlock[]>>;

const L = PACK_GUIDE_LIMITS;
const filled = (max: number): Schema => ({ ...plainText(max), minLength: 1 });
const block = (type: string, description: string, props: Record<string, Schema>, required: string[]): Schema => ({
  type: "object", description, properties: { type: { const: type }, ...props }, required: ["type", ...required], additionalProperties: false,
});

/** The JSON Schema of a Pack Guide, a field of ziffr.pack/2. */
export const PACK_GUIDE_SCHEMA: Schema = {
  type: "object",
  description: `What the creator tells people about the Pack, read before installing and in Help afterwards: at most ${L.bytes.toLocaleString("en")} bytes of headings, paragraphs and lists. Texts are plain, without links, web addresses or markup; a pair of ** makes the words between them bold.`,
  properties: Object.fromEntries(PACK_GUIDE_SECTIONS.map((s) => [s.key, {
    type: "array", minItems: 1, maxItems: L.blocks, description: `The section “${s.title}”.`,
    items: {
      oneOf: [
        block("heading", "A heading within the section. It is bold already.", { text: filled(L.heading) }, ["text"]),
        block("text", "A paragraph.", { text: filled(L.text) }, ["text"]),
        block("list", "A list.", { items: { type: "array", minItems: 1, maxItems: L.items, items: filled(L.text) }, numbered: { type: "boolean", description: "Numbered, for steps in an order." } }, ["items"]),
      ],
    },
  } satisfies Schema])),
  additionalProperties: false,
};

const MARK = "**";

/** A paragraph or list entry as the runs a page draws: plain and bold, from the pairs of ** around bold words. A text
 * whose marks do not pair (which the check refuses) comes back as one plain run. */
export function guideRuns(text: string): { text: string; bold: boolean }[] {
  const parts = text.split(MARK);
  if (parts.length % 2 === 0) return [{ text, bold: false }];
  return parts.map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((r) => r.text !== "");
}

/** A text as a person reads it: without its bold marks. */
const shown = (text: string) => guideRuns(text).map((r) => r.text).join("");

/** The guide with every text as a person reads it, so that a check of its words sees past bold marks. */
export function guideAsRead(guide: PackGuide): PackGuide {
  return Object.fromEntries(Object.entries(guide).map(([k, blocks]) => [k, blocks!.map((b) => (b.type === "list" ? { ...b, items: b.items.map(shown) } : { ...b, text: shown(b.text) }))]));
}

/** What the schema cannot say of a guide: its size, that it says something, and that its bold marks pair and hide
 * nothing. */
export function checkGuide(guide: PackGuide, at: (path: string, message: string) => void): void {
  const size = new TextEncoder().encode(JSON.stringify(guide)).length;
  if (size > L.bytes) return at("guide", `is ${size.toLocaleString("en")} bytes; at most ${L.bytes.toLocaleString("en")} are allowed.`);
  if (!Object.keys(guide).length) at("guide", "says nothing: fill at least one section, or leave the guide out.");
  const marked = (path: string, text: string) => {
    const parts = text.split(MARK);
    if (parts.length % 2 === 0) return at(path, "has a ** without its pair: put ** before and after the words to show bold.");
    if (parts.some((p, i) => i % 2 === 1 && !p.trim())) return at(path, "has bold marks with no words between them.");
    if (!textPasses(PLAIN, shown(text))) at(path, "reads as a web address once its bold marks are taken away; a guide holds no link.");
  };
  for (const { key } of PACK_GUIDE_SECTIONS)
    (guide[key] ?? []).forEach((b, i) => {
      const here = `guide.${key}[${i}]`;
      if (b.type === "heading" && b.text.includes(MARK)) at(`${here}.text`, "is a heading, which is bold already: leave out the **.");
      if (b.type === "text") marked(`${here}.text`, b.text);
      if (b.type === "list") b.items.forEach((x, n) => marked(`${here}.items[${n}]`, x));
    });
}
