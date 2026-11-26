// Slide Elements as Ziffr keeps them (GLOSSARY: Slide Element; spec 0057): the format lives in @ziffr/pack (MIT); this
// module checks an element a browser saves and walks its words. Pure.
// Security: an element comes from a browser, a Pack or an imported file. It is held to the one schema before it is
// stored: known kinds and fields only, bounded lengths and counts, colours by Theme role, no address field of any kind.
import { SLIDE_ELEMENT_LIMITS, slideElementSchema, type SlideElement } from "@ziffr/pack/slide-element";
import { appText } from "@ziffr/pack/file-text";
import { checkSchema } from "./json-check";

export * from "@ziffr/pack/slide-element";

// What a person types in their own deck follows the app's text rules, as a slide's words do.
const IN_APP = slideElementSchema(appText);

/** A slide widget's `element` as it may be stored: refused with an Error that names the first problem. */
export function checkedElement(v: unknown): SlideElement {
  const problems = checkSchema(IN_APP, v);
  if (problems.length) throw new Error(`This slide has an element Ziffr cannot keep: ${problems[0].path ? `${problems[0].path} ` : ""}${problems[0].message}`);
  return v as SlideElement;
}

// The fields of an element that hold words a person reads; every other string is one of a fixed list.
const WORD_FIELDS = ["lead", "label", "note", "empty", "headline", "title", "partLabel", "restLabel", "referenceLabel", "rowLabel", "gapLabel"] as const;

// The fields that hold a whole line of words; the others are held to a label's length.
const LINE_FIELDS = new Set<string>(["note", "empty", "headline", "gapLabel"]);

/** The element with every word a person reads through `change`: paragraphs, labels, titles and list rows. `max` is
 * the most characters the field those words stand in takes. */
export function mapElementWords(e: SlideElement, change: (text: string, max: number) => string): SlideElement {
  const { words: line, label } = SLIDE_ELEMENT_LIMITS;
  const out: Record<string, unknown> = { ...e };
  for (const k of WORD_FIELDS) if (typeof out[k] === "string") out[k] = change(out[k] as string, LINE_FIELDS.has(k) || (k === "title" && e.kind === "columns") ? line : label);
  // The logo place's words are its `text`; paragraphs are the words element's `text`.
  if (typeof out.text === "string") out.text = change(out.text, label);
  if (Array.isArray(out.text)) out.text = (out.text as string[]).map((t) => change(t, line));
  if (e.kind === "list") out.items = e.items.map((i) => ({ text: change(i.text, label), ...(i.note === undefined ? {} : { note: change(i.note, label) }) }));
  return out as SlideElement;
}
