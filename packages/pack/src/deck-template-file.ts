// The Deck Template file format, ziffr.deck-template/1 (GLOSSARY: Deck Template, Slot, Placeholder, Pack): a deck's
// slides with their widgets, words and boxes, the Metrics left open as Slots. The schema below is the only definition,
// checked wherever such a file is read; docs/reference is generated from it.
// Security: a slide holds only widgets, text and simple boxes: no images, no drawings, no links, and every word is
// plain text. Widgets are held to exactly what a Dashboard Template's widgets are.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { itemKey, plainText, words } from "./file-text.js";
import { checkTemplateWidget, refusedOutsidePack, TEMPLATE_SLOTS, WIDGET_DEFS, WIDGET_FIELDS, type DashboardTemplateFile, type TemplateWidgetFile } from "./dashboard-template-file.js";

/** The format this Ziffr writes; it reads every version in `DECK_TEMPLATE_FORMATS`. */
export const DECK_TEMPLATE_FORMAT = "ziffr.deck-template/1";
/** Every Deck Template file format Ziffr ever published, oldest first. */
export const DECK_TEMPLATE_FORMATS = [DECK_TEMPLATE_FORMAT] as const;
/** The exact limits a Deck Template file is held to; a slide is 1280 by 720. */
export const DECK_TEMPLATE_LIMITS = { bytes: 524_288, depth: 18, slides: 40, shapes: 40, paragraphs: 20, name: 80, description: 300, words: 300, width: 1280, height: 720 } as const;

const COLORS = ["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"] as const;
const GEOS = ["rectangle", "ellipse", "oval", "triangle", "diamond", "hexagon", "star"] as const;
type Color = (typeof COLORS)[number];

/** A widget on a slide: as on a Dashboard Template, placed in slide pixels. */
export type SlideWidgetFile = { shape: "widget"; x: number; y: number; w: number; h: number } & Omit<TemplateWidgetFile, "x" | "y" | "w" | "h">;
/** Words on a slide, a paragraph per entry. */
export type SlideTextFile = { shape: "text"; x: number; y: number; w: number; text: string[]; size?: "s" | "m" | "l" | "xl"; scale?: number; align?: "start" | "middle" | "end"; color?: Color };
/** A simple box on a slide, with words in it if wanted. */
export type SlideBoxFile = { shape: "box"; x: number; y: number; w: number; h: number; geo?: (typeof GEOS)[number]; fill?: "none" | "semi" | "solid"; color?: Color; text?: string[] };
/** A Deck Template as a file (GLOSSARY: Deck Template), in the newest format. */
export type DeckTemplateFile = {
  format: typeof DECK_TEMPLATE_FORMAT;
  name: string;
  description?: string;
  slots: DashboardTemplateFile["slots"];
  /** In a Pack: the key of one of its Themes, which a deck made from it starts with. */
  theme?: string;
  slides: { shapes: (SlideWidgetFile | SlideTextFile | SlideBoxFile)[] }[];
};

const L = DECK_TEMPLATE_LIMITS;
const place = (max: number, description: string): Schema => ({ type: "integer", minimum: 0, maximum: max, description });
const size = (max: number, min: number): Schema => ({ type: "integer", minimum: min, maximum: max });
const paragraphs: Schema = { type: "array", minItems: 1, maxItems: L.paragraphs, items: words(L.words), description: "The words, a paragraph per entry." };
const shape = (name: string, description: string, props: Record<string, Schema>, required: string[]): Schema => ({
  type: "object", description, properties: { shape: { const: name }, ...props }, required: ["shape", ...required], additionalProperties: false,
});
const at = { x: place(L.width - 1, "From the slide's left edge, in pixels."), y: place(L.height - 1, "From the slide's top edge, in pixels.") };

/** The JSON Schema of ziffr.deck-template/1: the one definition the checks run and docs/reference is generated from. */
export const DECK_TEMPLATE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.app/schemas/ziffr.deck-template-1.json",
  title: "Ziffr Deck Template (ziffr.deck-template/1)",
  description: "A starting point for a deck: its slides with their widgets, words and boxes, with the Metrics left open as Slots. It holds no code, image or link.",
  type: "object",
  properties: {
    format: { const: DECK_TEMPLATE_FORMAT, description: "The format and its version." },
    name: { ...plainText(L.name), minLength: 1 },
    description: plainText(L.description),
    slots: TEMPLATE_SLOTS,
    theme: itemKey("in a Pack: the key of one of its Themes, which a deck made from the template starts with"),
    slides: {
      type: "array", minItems: 1, maxItems: L.slides, description: "The slides, in order, each 1280 by 720 pixels.",
      items: {
        type: "object",
        properties: { shapes: { type: "array", maxItems: L.shapes, items: { $ref: "#/$defs/shape" } } },
        required: ["shapes"],
        additionalProperties: false,
      },
    },
  },
  required: ["format", "name", "slots", "slides"],
  additionalProperties: false,
  $defs: {
    ...WIDGET_DEFS,
    shape: {
      oneOf: [
        shape("widget", "A widget, as on a Dashboard Template.", { ...WIDGET_FIELDS, ...at, w: size(L.width, 40), h: size(L.height, 40) }, ["view", "slots", "x", "y", "w", "h"]),
        shape("text", "Words, a paragraph per entry.", {
          ...at, w: size(L.width, 20), text: paragraphs,
          size: { enum: ["s", "m", "l", "xl"] }, scale: { type: "number", minimum: 0.25, maximum: 4 }, align: { enum: ["start", "middle", "end"] }, color: { enum: [...COLORS] },
        }, ["x", "y", "w", "text"]),
        shape("box", "A simple shape, with words in it if wanted.", {
          ...at, w: size(L.width, 4), h: size(L.height, 4), geo: { enum: [...GEOS] }, fill: { enum: ["none", "semi", "solid"] }, color: { enum: [...COLORS] }, text: paragraphs,
        }, ["x", "y", "w", "h"]),
      ],
    },
  },
};

/** What the schema cannot say: every widget as a Dashboard Template's, and each shape on its slide. */
function meaning(t: DeckTemplateFile, at: (path: string, message: string) => void) {
  t.slides.forEach((s, i) =>
    s.shapes.forEach((sh, k) => {
      const here = `slides[${i}].shapes[${k}]`;
      if (sh.shape === "widget") checkTemplateWidget(sh, t.slots.length, here, at);
      if (sh.x + sh.w > L.width || ("h" in sh && sh.y + sh.h > L.height)) at(here, "reaches past the edge of the slide (1280 by 720).");
    }),
  );
}

/** Checks a Deck Template file already read from JSON; which Pack items it names is checked by its Pack. */
export function checkDeckTemplateFileValue(value: unknown, lines: Map<string, number> = new Map()): FormatCheck<DeckTemplateFile> {
  return checkFormat({ family: "ziffr.deck-template", reads: DECK_TEMPLATE_FORMATS, schema: DECK_TEMPLATE_SCHEMA, meaning }, value, lines);
}

/** The keys of the Pack items a Deck Template names: the entries its Slots suggest, its widgets' View Designs, its Theme. */
export function deckTemplateReferences(t: DeckTemplateFile): { metrics: { path: string; key: string }[]; views: { path: string; key: string }[]; themes: { path: string; key: string }[] } {
  return {
    metrics: t.slots.flatMap((s, i) => (s.suggests ? [{ path: `slots[${i}].suggests`, key: s.suggests }] : [])),
    views: t.slides.flatMap((s, i) => s.shapes.flatMap((sh, k) => (sh.shape === "widget" && typeof sh.settings?.design === "string" ? [{ path: `slides[${i}].shapes[${k}].settings.design`, key: sh.settings.design }] : []))),
    themes: t.theme ? [{ path: "theme", key: t.theme }] : [],
  };
}

/** Checks a Deck Template file's text on its own, outside a Pack, where it can name no other item. */
export function checkDeckTemplateFile(textIn: string): FormatCheck<DeckTemplateFile> {
  const parsed = parseJson(textIn, { maxBytes: L.bytes, maxDepth: L.depth });
  if (!parsed.ok) return parsed;
  const res = checkDeckTemplateFileValue(parsed.value, parsed.lines);
  if (!res.ok) return res;
  return refusedOutsidePack(res, Object.values(deckTemplateReferences(res.value)).flat(), parsed.lines);
}
