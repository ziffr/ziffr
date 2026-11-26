// The Theme file format, ziffr.theme/1 (GLOSSARY: Theme, Pack): a Theme's colours, fonts, cards and slide settings as
// a file. The schema below is the only definition, checked wherever such a file is read; docs/reference is generated
// from it. Security: a Theme file holds no image, no font of its own and no web address: only fonts Ziffr ships, and
// no background image (spec 0030). Its logo is only ever "pack": the one logo of the Pack it is in (spec 0039), so a
// Theme file on its own holds no image at all.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import { FONT_IDS, type FontId, type LogoPosition } from "./kinds.js";

/** The first format, which Ziffr writes for a Theme that names no colour of format /2, so an older Ziffr reads it. */
export const THEME_FILE_FORMAT = "ziffr.theme/1";
/** The format with the colours of Slide Elements (spec 0057). */
export const THEME_FILE_FORMAT_2 = "ziffr.theme/2";
/** Every Theme file format Ziffr ever published, oldest first. */
export const THEME_FILE_FORMATS = [THEME_FILE_FORMAT, THEME_FILE_FORMAT_2] as const;
/** The exact limits a Theme file is held to, as the Theme editor keeps them. */
export const THEME_FILE_LIMITS = { bytes: 8_192, depth: 4, name: 60, footer: 120 } as const;

/** The colours a Theme names, besides its data colours. */
export const COLOR_NAMES = ["canvas", "surface", "ink", "muted", "rule", "accent", "good", "bad", "band"] as const;
/** The colours format /2 may add (spec 0057): a dark panel, the words and the accent on it, and a pale accent. Each is
 * optional; a Theme without one works it out from its others. */
export const SLIDE_COLOR_NAMES = ["cover", "coverText", "coverAccent", "soft"] as const;

/** A Theme as a file (GLOSSARY: Theme). */
export type ThemeFile = {
  format: (typeof THEME_FILE_FORMATS)[number];
  name: string;
  colors: Record<(typeof COLOR_NAMES)[number], string> & Partial<Record<(typeof SLIDE_COLOR_NAMES)[number], string>> & { data: string[] };
  fonts: { heading: FontId; body: FontId; figures: FontId };
  radius: number;
  cards: "paper" | "flat" | "plain";
  slides?: { logo?: "pack"; logoPosition?: LogoPosition; logoWidth?: number; footer?: string; showSlideNumber?: boolean; titleSize?: number; bodySize?: number };
};

const HEX_COLOR: Schema = { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: "a colour as # and six hex digits, such as “#1A2B3C”" };
const FONT: Schema = { enum: [...FONT_IDS], description: "One of the fonts Ziffr ships." };
const int = (minimum: number, maximum: number, description: string): Schema => ({ type: "integer", minimum, maximum, description });

/** The JSON Schema of ziffr.theme/1: the one definition the checks run and docs/reference is generated from. */
export const THEME_FILE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.theme-1.json",
  title: "Ziffr Theme (ziffr.theme/1)",
  description: "A named look for everything that shows numbers: colours, fonts, cards and what every slide shows. It holds no image of its own, font file or web address.",
  type: "object",
  properties: {
    format: { const: THEME_FILE_FORMAT, description: "The format and its version." },
    name: { ...plainText(THEME_FILE_LIMITS.name), minLength: 1 },
    colors: {
      type: "object",
      description: "Text, surfaces, data, good, bad and the target band.",
      properties: { ...Object.fromEntries(COLOR_NAMES.map((c) => [c, HEX_COLOR])), data: { type: "array", minItems: 1, maxItems: 6, items: HEX_COLOR, description: "The data colours, the first for single series." } },
      required: [...COLOR_NAMES, "data"],
      additionalProperties: false,
    },
    fonts: { type: "object", properties: { heading: FONT, body: FONT, figures: FONT }, required: ["heading", "body", "figures"], additionalProperties: false },
    radius: int(0, 24, "How round the corners of cards are, in pixels."),
    cards: { enum: ["paper", "flat", "plain"], description: "paper: textured with a soft shadow; flat: a hairline edge; plain: no edge at all." },
    slides: {
      type: "object",
      description: "What every slide shows. A background image is set in Ziffr, never in the file; the logo is only “pack”, the logo of the Pack the Theme is in.",
      properties: {
        logo: { const: "pack", description: "Use the logo of the Pack this Theme is in. Only inside a Pack that has a logo." },
        logoPosition: { enum: ["top-left", "top-right", "bottom-left", "bottom-right"] },
        logoWidth: int(40, 400, "The logo's width on a slide, in pixels."),
        footer: plainText(THEME_FILE_LIMITS.footer),
        showSlideNumber: { type: "boolean" },
        titleSize: int(24, 96, "The size of slide titles, in pixels."),
        bodySize: int(12, 48, "The size of slide text, in pixels."),
      },
      additionalProperties: false,
    },
  },
  required: ["format", "name", "colors", "fonts", "radius", "cards"],
  additionalProperties: false,
};

/** The JSON Schema of ziffr.theme/2: schema /1 with the optional colours of Slide Elements. */
export const THEME_FILE_2_SCHEMA: Schema = (() => {
  const colors = THEME_FILE_SCHEMA.properties!.colors;
  return {
    ...THEME_FILE_SCHEMA,
    $id: "https://ziffr.net/schemas/ziffr.theme-2.json",
    title: "Ziffr Theme (ziffr.theme/2)",
    description: "A ziffr.theme/1 Theme that may also name the colours of Slide Elements: cover, coverText, coverAccent and soft.",
    properties: {
      ...THEME_FILE_SCHEMA.properties,
      format: { const: THEME_FILE_FORMAT_2, description: "The format and its version." },
      colors: { ...colors, properties: { ...colors.properties, ...Object.fromEntries(SLIDE_COLOR_NAMES.map((c) => [c, HEX_COLOR])) } },
    },
  };
})();

/** Where a Theme file is read: on its own (no logo may be named), in a Pack without a logo or in one with a logo. */
export type ThemeLogoContext = "standalone" | "pack-without-logo" | "pack-with-logo";

/** What the schema cannot say: "pack" as a logo needs a Pack with a logo. */
function logoMeaning(context: ThemeLogoContext) {
  return (t: ThemeFile, at: (path: string, message: string) => void) => {
    if (t.slides?.logo === undefined) return;
    if (context === "standalone") at("slides.logo", "a logo comes only from a Pack: a Theme file on its own holds no image.");
    else if (context === "pack-without-logo") at("slides.logo", "is “pack”, but this Pack has no logo.");
  };
}

/** Checks a Theme file's text: size and depth, then the schema. */
export function checkThemeFile(textIn: string): FormatCheck<ThemeFile> {
  const parsed = parseJson(textIn, { maxBytes: THEME_FILE_LIMITS.bytes, maxDepth: THEME_FILE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkThemeFileValue(parsed.value, parsed.lines);
}

/** Checks a Theme file already read from JSON (`lines` names where each path starts, when known). */
export function checkThemeFileValue(value: unknown, lines: Map<string, number> = new Map(), context: ThemeLogoContext = "standalone", schemas: { v1: Schema; v2: Schema } = { v1: THEME_FILE_SCHEMA, v2: THEME_FILE_2_SCHEMA }): FormatCheck<ThemeFile> {
  const schema = (value as { format?: unknown } | null)?.format === THEME_FILE_FORMAT_2 ? schemas.v2 : schemas.v1;
  return checkFormat({ family: "ziffr.theme", reads: THEME_FILE_FORMATS, schema, meaning: logoMeaning(context) }, value, lines);
}
