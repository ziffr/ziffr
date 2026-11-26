// Slide Elements (GLOSSARY: Slide Element, Deck Template, Theme; spec 0057): the parts of a slide that draw themselves
// in the deck's Theme and fill their words from the data. This is the only definition of one: the Deck Template file
// format checks it as a Pack's words (plain text), and Ziffr checks every element a browser saves with the same schema.
// Security: an element holds words, numbers and names from fixed lists only: no address, image, code or colour value.
import type { Schema } from "./json-check.js";
import { slideWords } from "./file-text.js";

/** The colours an element may name: always a role of the deck's Theme, never a value. */
export const SLIDE_TONES = ["ink", "muted", "rule", "surface", "canvas", "band", "accent", "soft", "cover", "cover-text", "cover-accent", "good", "bad", "data"] as const;
/** One Theme colour role an element names. */
export type SlideTone = (typeof SLIDE_TONES)[number];
/** The kinds of Slide Element. */
export const SLIDE_ELEMENT_KINDS = ["words", "box", "figure", "columns", "gap-table", "metric-table", "definitions", "list", "logo", "art"] as const;
/** One kind of Slide Element. */
export type SlideElementKind = (typeof SLIDE_ELEMENT_KINDS)[number];
/** The limits an element is held to, besides the length of its words. */
export const SLIDE_ELEMENT_LIMITS = { paragraphs: 20, words: 300, label: 80, items: 8, periods: 53, slots: 12, minSize: 8, maxSize: 160 } as const;

/** How heavy words are drawn. */
export type SlideWeight = 400 | 500 | 600 | 700;
/** A side of a box words stand against. */
export type SlideAlign = "start" | "middle" | "end";

/** Paragraphs of words, with an optional lead-in in its own colour and weight. */
export type WordsElement = {
  kind: "words"; text: string[]; lead?: string; leadTone?: SlideTone; leadWeight?: SlideWeight; tone?: SlideTone; font?: "heading" | "body"; size?: number; weight?: SlideWeight;
  line?: number; tracking?: number; caps?: boolean; align?: SlideAlign; valign?: "top" | "middle" | "bottom"; opacity?: number;
  /** The slide's footer line: it shows the deck's footer after its words, in place of the Theme drawing it. */
  foot?: boolean;
  /** Shown instead of the words while a Placeholder in them has no value: a question, say, or nothing. */
  empty?: string;
};
/** A rectangle, filled or edged. */
export type BoxElement = { kind: "box"; fill?: SlideTone; edge?: SlideTone; dashed?: boolean; opacity?: number };
/** One large value with its label and a line under it. */
export type FigureElement = { kind: "figure"; label?: string; note?: string; /** The note takes the good or bad colour its first {gap} or {change} says. */ signal?: boolean; /** Drawn on the cover colour. */ strong?: boolean };
/** Columns of one Metric by period; a second Metric may fill part of each, and one more draws a reference line. */
export type ColumnsElement = { kind: "columns"; title?: string; part?: boolean; reference?: boolean; partLabel?: string; restLabel?: string; referenceLabel?: string; /** How many periods; left out, the periods of the quarter so far. */ periods?: number };
/** Two Metrics' latest Breakdowns row by row, with the difference as bars either side of zero. A headline above the
 * table and a closing line under it (after a bar, with its lead-in) move with it, however many lines they take. */
export type GapTableElement = { kind: "gap-table"; rowLabel?: string; gapLabel?: string; headline?: string; lead?: string; note?: string };
/** One row per Metric: latest value, the one before, the change, a trend and whether it is on target. */
export type MetricTableElement = { kind: "metric-table"; /** How many periods the trend shows. */ periods?: number };
/** Definitions (spec 0060): each Metric with its description and how it is calculated, for an appendix. */
export type DefinitionsElement = { kind: "definitions" };
/** Numbered rows under a heading, such as an agenda. */
export type ListElement = { kind: "list"; title?: string; items: { text: string; note?: string }[] };
/** The Theme's logo, or a dashed box with words until the Theme has one. */
export type LogoElement = { kind: "logo"; text?: string; tone?: SlideTone; size?: "s" | "m"; align?: "start" | "end" };
/** A fixed ornament in Theme colours. */
export type ArtElement = { kind: "art"; art: "rings-trend" };
/** A part of a slide drawn in the deck's Theme (GLOSSARY: Slide Element). */
export type SlideElement = WordsElement | BoxElement | FigureElement | ColumnsElement | GapTableElement | MetricTableElement | DefinitionsElement | ListElement | LogoElement | ArtElement;

/** How many Metrics a kind of element reads: the fewest and the most. */
export function elementSlots(e: SlideElement): { min: number; max: number } {
  const L = SLIDE_ELEMENT_LIMITS;
  if (e.kind === "words") return { min: 0, max: L.slots };
  if (e.kind === "figure") return { min: 1, max: L.slots };
  if (e.kind === "columns") { const n = 1 + (e.part ? 1 : 0) + (e.reference ? 1 : 0); return { min: n, max: n }; }
  if (e.kind === "gap-table") return { min: 2, max: 2 };
  if (e.kind === "metric-table" || e.kind === "definitions") return { min: 1, max: L.slots };
  // A box, list, logo or ornament shows no number.
  return { min: 0, max: 0 };
}

const L = SLIDE_ELEMENT_LIMITS;
const tone: Schema = { enum: [...SLIDE_TONES], description: "A colour of the deck's Theme." };
const weight: Schema = { type: "integer", enum: [400, 500, 600, 700] };
const flag = (description: string): Schema => ({ type: "boolean", description });
const share: Schema = { type: "number", minimum: 0.1, maximum: 1, description: "How opaque, from 0.1 to 1." };

/** The schema of a Slide Element, its words held to `text`: a Pack's plain text (the default) or, for what a person
 * typed in the app, a looser rule. */
export function slideElementSchema(text: (max: number) => Schema = slideWords): Schema {
  const label = text(L.label);
  const line = text(L.words);
  const kind = (name: SlideElementKind, description: string, props: Record<string, Schema>, required: string[] = []): Schema => ({
    type: "object", description, properties: { kind: { const: name }, ...props }, required: ["kind", ...required], additionalProperties: false,
  });
  return {
    oneOf: [
      kind("words", "Paragraphs of words.", {
        text: { type: "array", minItems: 1, maxItems: L.paragraphs, items: line, description: "The words, a paragraph per entry; Placeholders are filled when the slide is drawn." },
        lead: label, leadTone: tone, leadWeight: weight, tone, font: { enum: ["heading", "body"] },
        size: { type: "integer", minimum: L.minSize, maximum: L.maxSize, description: "The letter size, in slide pixels." }, weight,
        line: { type: "number", minimum: 0.8, maximum: 2.5 }, tracking: { type: "number", minimum: -0.05, maximum: 0.3, description: "Space between letters, in letter sizes." },
        caps: flag("In capitals."), align: { enum: ["start", "middle", "end"] }, valign: { enum: ["top", "middle", "bottom"] }, opacity: share,
        foot: flag("The slide's footer line: shows the deck's footer after its words."),
        empty: { ...line, description: "Shown instead of the words while a Placeholder in them has no value." },
      }, ["text"]),
      kind("box", "A rectangle.", { fill: tone, edge: tone, dashed: flag("A dashed edge."), opacity: share }),
      kind("figure", "One large value with its label and a line under it.", { label, note: line, signal: flag("The note takes the good or bad colour."), strong: flag("Drawn on the cover colour.") }),
      kind("columns", "Columns of a Metric by period.", {
        title: line, part: flag("The next Metric fills part of each column."), reference: flag("One more Metric draws a reference line."),
        partLabel: label, restLabel: label, referenceLabel: label, periods: { type: "integer", minimum: 1, maximum: L.periods },
      }),
      kind("gap-table", "Two Metrics' Breakdowns row by row, with the difference.", { rowLabel: label, gapLabel: line, headline: line, lead: label, note: line }),
      kind("metric-table", "One row per Metric.", { periods: { type: "integer", minimum: 2, maximum: L.periods } }),
      kind("definitions", "Each Metric with its description and how it is calculated.", {}),
      kind("list", "Numbered rows under a heading.", {
        title: label,
        items: { type: "array", minItems: 1, maxItems: L.items, items: { type: "object", properties: { text: label, note: label }, required: ["text"], additionalProperties: false } },
      }, ["items"]),
      kind("logo", "The Theme's logo, or a dashed box until it has one.", { text: label, tone, size: { enum: ["s", "m"] }, align: { enum: ["start", "end"] } }),
      kind("art", "A fixed ornament.", { art: { enum: ["rings-trend"] } }, ["art"]),
    ],
  };
}
