// The Deck Template file format, ziffr.deck-template/1 (GLOSSARY: Deck Template, Slot, Placeholder, Pack): a deck's
// slides with their widgets, words and boxes, the Metrics left open as Slots. The schema below is the only definition,
// checked wherever such a file is read; docs/reference is generated from it.
// Format /2 (spec 0057) adds Slide Elements and cover slides. Format /3 adds live text boxes: a text or box shape names
// the Slots its Placeholders count and may use a slide's Placeholders. It also takes a gap table of a Total (spec 0058);
// what a later part of a slide needs goes into /3 too, while it is not released. /1 and /2 are read for ever and mean what they always meant, and Ziffr writes the
// oldest format that holds a deck, so an older Ziffr reads what it can and refuses the rest in words.
// Security: a slide holds only widgets, text, simple boxes and Slide Elements: no images, no drawings, no links, and
// every word is plain text. Widgets are held to exactly what a Dashboard Template's widgets are.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { VIEW_DESIGN_SCHEMA } from "./view-design.js";
import { itemKey, plainText, savedWords, slideWords } from "./file-text.js";
import { elementSlots, SLIDE_ELEMENT_LIMITS, slideElementSchema, type SlideElement } from "./slide-element.js";
import { checkTemplateWidget, refusedOutsidePack, TEMPLATE_SLOTS, WIDGET_DEFS, WIDGET_FIELDS, type DashboardTemplateFile, type TemplateWidgetFile } from "./dashboard-template-file.js";

/** The first format, which Ziffr writes for a deck without Slide Elements and cover slides, so an older Ziffr reads it. */
export const DECK_TEMPLATE_FORMAT = "ziffr.deck-template/1";
/** The format with Slide Elements and cover slides (spec 0057). */
export const DECK_TEMPLATE_FORMAT_2 = "ziffr.deck-template/2";
/** The format with live text boxes (words and boxes that name the Slots their Placeholders count) and with a gap table
 * of a Total. */
export const DECK_TEMPLATE_FORMAT_3 = "ziffr.deck-template/3";
/** Every Deck Template file format Ziffr ever published, oldest first. */
export const DECK_TEMPLATE_FORMATS = [DECK_TEMPLATE_FORMAT, DECK_TEMPLATE_FORMAT_2, DECK_TEMPLATE_FORMAT_3] as const;
/** The exact limits a Deck Template file is held to; a slide is 1280 by 720. */
export const DECK_TEMPLATE_LIMITS = { bytes: 524_288, depth: 18, slides: 40, shapes: 40, paragraphs: 20, name: 80, description: 300, words: 300, textSlots: 9, width: 1280, height: 720 } as const;

const COLORS = ["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"] as const;
const GEOS = ["rectangle", "ellipse", "oval", "triangle", "diamond", "hexagon", "star"] as const;
type Color = (typeof COLORS)[number];

/** A widget on a slide: as on a Dashboard Template, placed in slide pixels. */
export type SlideWidgetFile = { shape: "widget"; x: number; y: number; w: number; h: number } & Omit<TemplateWidgetFile, "x" | "y" | "w" | "h">;
/** Words on a slide, a paragraph per entry. `slots` (format /3): the Slots its Placeholders count, in order. */
export type SlideTextFile = { shape: "text"; x: number; y: number; w: number; slots?: number[]; text: string[]; size?: "s" | "m" | "l" | "xl"; scale?: number; align?: "start" | "middle" | "end"; color?: Color };
/** A simple box on a slide, with words in it if wanted. `slots` (format /3): as on a text shape. */
export type SlideBoxFile = { shape: "box"; x: number; y: number; w: number; h: number; slots?: number[]; geo?: (typeof GEOS)[number]; fill?: "none" | "semi" | "solid"; color?: Color; text?: string[] };
/** A Slide Element on a slide (format /2): what it draws, where, and the Slots whose Metrics it reads, in order. */
export type SlideElementFile = { shape: "element"; x: number; y: number; w: number; h: number; slots?: number[]; element: SlideElement };
/** One shape of a slide in a file. */
export type SlideShapeFile = SlideWidgetFile | SlideTextFile | SlideBoxFile | SlideElementFile;
/** A Deck Template as a file (GLOSSARY: Deck Template). */
export type DeckTemplateFile = {
  format: (typeof DECK_TEMPLATE_FORMATS)[number];
  name: string;
  description?: string;
  slots: DashboardTemplateFile["slots"];
  /** In a Pack: the key of one of its Themes, which a deck made from it starts with. */
  theme?: string;
  /** `cover` (format /2): the slide shows no logo, footer or number of the Theme and is not counted in page numbers. */
  slides: { shapes: SlideShapeFile[]; cover?: boolean }[];
};

const L = DECK_TEMPLATE_LIMITS;
const place = (max: number, description: string): Schema => ({ type: "integer", minimum: 0, maximum: max, description });
const size = (max: number, min: number): Schema => ({ type: "integer", minimum: min, maximum: max });
const paragraphs: Schema = { type: "array", minItems: 1, maxItems: L.paragraphs, items: savedWords(L.words), description: "The words, a paragraph per entry." };
const shape = (name: string, description: string, props: Record<string, Schema>, required: string[]): Schema => ({
  type: "object", description, properties: { shape: { const: name }, ...props }, required: ["shape", ...required], additionalProperties: false,
});
const at = { x: place(L.width - 1, "From the slide's left edge, in pixels."), y: place(L.height - 1, "From the slide's top edge, in pixels.") };

/** The JSON Schema of ziffr.deck-template/1: the one definition the checks run and docs/reference is generated from. */
export const DECK_TEMPLATE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.deck-template-1.json",
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

const elementShape = (element: Schema): Schema => shape("element", "A Slide Element: a part drawn in the deck's Theme.", {
  ...at, w: size(L.width, 4), h: size(L.height, 4),
  slots: { type: "array", maxItems: SLIDE_ELEMENT_LIMITS.slots, items: { type: "integer", minimum: 0, maximum: 11 }, description: "The Slots whose Metrics it reads, in order; {latest 2} is the second." },
  element,
}, ["x", "y", "w", "h", "element"]);

/** Schema /2 made from schema /1 and the Slide Element schema given: the same file, with element shapes and covers. */
export function deckTemplateSchema2(element: Schema = slideElementSchema(), base: Schema = DECK_TEMPLATE_SCHEMA): Schema {
  const slides = base.properties!.slides;
  return {
    ...base,
    $id: "https://ziffr.net/schemas/ziffr.deck-template-2.json",
    title: "Ziffr Deck Template (ziffr.deck-template/2)",
    description: "A starting point for a deck, as ziffr.deck-template/1, with Slide Elements that draw themselves in the deck's Theme and slides that are covers. It holds no code, image or link.",
    properties: {
      ...base.properties,
      format: { const: DECK_TEMPLATE_FORMAT_2, description: "The format and its version." },
      slides: { ...slides, items: { ...slides.items!, properties: { ...slides.items!.properties, cover: { type: "boolean", description: "A cover: no logo, footer or number of the Theme, and not counted in page numbers." } } } },
    },
    $defs: { ...base.$defs, shape: { oneOf: [...base.$defs!.shape.oneOf!, elementShape(element)] } },
  };
}

/** The JSON Schema of ziffr.deck-template/2. */
export const DECK_TEMPLATE_2_SCHEMA: Schema = deckTemplateSchema2();

/** Schema /3 made from schema /2: text and box shapes may name Slots, and their words (`paragraph`) may then hold a
 * slide's Placeholders. A later part of a slide that /3 should take, such as a gap table of a Total, is in `element`. */
export function deckTemplateSchema3(element: Schema = slideElementSchema(slideWords, { totals: true }), base: Schema = DECK_TEMPLATE_SCHEMA, paragraph: Schema = slideWords(L.words)): Schema {
  const two = deckTemplateSchema2(element, base);
  const slots: Schema = { type: "array", maxItems: L.textSlots, items: { type: "integer", minimum: 0, maximum: 11 }, description: "The Slots whose Metrics the words name, in order, filled each time the slide is shown; {latest 2} is the second." };
  const live = (s: Schema): Schema => {
    const kind = s.properties!.shape.const;
    if (kind !== "text" && kind !== "box") return s;
    const text = s.properties!.text;
    return { ...s, properties: { ...s.properties, slots, text: { ...text, items: paragraph } } };
  };
  return {
    ...two,
    $id: "https://ziffr.net/schemas/ziffr.deck-template-3.json",
    title: "Ziffr Deck Template (ziffr.deck-template/3)",
    description: "A starting point for a deck, as ziffr.deck-template/2, whose words and boxes may show live values (they name the Slots their Placeholders count) and whose gap tables may read a Total. It holds no code, image or link.",
    properties: { ...two.properties, format: { const: DECK_TEMPLATE_FORMAT_3, description: "The format and its version." } },
    $defs: { ...two.$defs, shape: { oneOf: two.$defs!.shape.oneOf!.map(live) } },
  };
}

/** The JSON Schema of ziffr.deck-template/3. */
export const DECK_TEMPLATE_3_SCHEMA: Schema = deckTemplateSchema3();

/** What the schema cannot say: every widget as a Dashboard Template's, and each shape on its slide. */
function meaning(t: DeckTemplateFile, at: (path: string, message: string) => void, designSchema: Schema = VIEW_DESIGN_SCHEMA) {
  t.slides.forEach((s, i) =>
    s.shapes.forEach((sh, k) => {
      const here = `slides[${i}].shapes[${k}]`;
      if (sh.shape === "widget") checkTemplateWidget(sh, t.slots.length, here, at, designSchema);
      if (sh.shape === "element") elementMeaning(sh, t.slots.length, here, at);
      if (sh.shape === "text" || sh.shape === "box") slotsExist(sh.slots, t.slots.length, here, at);
      if (sh.x + sh.w > L.width || ("h" in sh && sh.y + sh.h > L.height)) at(here, "reaches past the edge of the slide (1280 by 720).");
    }),
  );
}

/** The Slots a shape names are ones the template has. */
function slotsExist(used: readonly number[] | undefined, slots: number, here: string, at: (path: string, message: string) => void) {
  used?.forEach((n, k) => n >= slots && at(`${here}.slots[${k}]`, `is Slot ${n}, but the template has Slots 0 to ${slots - 1}.`));
}

/** An element's Slots: ones the template has, as many as its kind reads. */
function elementMeaning(sh: SlideElementFile, slots: number, here: string, at: (path: string, message: string) => void) {
  const used = sh.slots ?? [];
  slotsExist(used, slots, here, at);
  const { min, max } = elementSlots(sh.element);
  if (used.length < min) at(`${here}.slots`, `“${sh.element.kind}” needs ${min} ${min === 1 ? "Slot" : "Slots"}.`);
  if (used.length > max) at(`${here}.slots`, `“${sh.element.kind}” takes at most ${max} ${max === 1 ? "Slot" : "Slots"}.`);
}

/** The schemas a Deck Template file is checked against, by its format. */
export type DeckTemplateSchemas = { v1: Schema; v2: Schema; v3: Schema };

/** Checks a Deck Template file already read from JSON; which Pack items it names is checked by its Pack. */
export function checkDeckTemplateFileValue(value: unknown, lines: Map<string, number> = new Map(), schemas: DeckTemplateSchemas = { v1: DECK_TEMPLATE_SCHEMA, v2: DECK_TEMPLATE_2_SCHEMA, v3: DECK_TEMPLATE_3_SCHEMA }, designSchema: Schema = VIEW_DESIGN_SCHEMA): FormatCheck<DeckTemplateFile> {
  const format = (value as { format?: unknown } | null)?.format;
  const schema = format === DECK_TEMPLATE_FORMAT_3 ? schemas.v3 : format === DECK_TEMPLATE_FORMAT_2 ? schemas.v2 : schemas.v1;
  return checkFormat({ family: "ziffr.deck-template", reads: DECK_TEMPLATE_FORMATS, schema, meaning: (t: DeckTemplateFile, at: (path: string, message: string) => void) => meaning(t, at, designSchema) }, value, lines);
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
