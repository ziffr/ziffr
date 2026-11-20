// The Theme file format, ziffr.theme/1 (GLOSSARY: Theme, Pack): a Theme's colours, fonts, cards and slide settings as
// a file. The schema below is the only definition, checked wherever such a file is read; docs/reference is generated
// from it. Security: a Theme file holds no image, no font of its own and no web address: only fonts Ziffr ships, and
// no logo or background image (spec 0030), which its Owner sets after installing.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import { FONT_IDS, type FontId, type LogoPosition } from "./kinds.js";

/** The format this Ziffr writes; it reads every version in `THEME_FILE_FORMATS`. */
export const THEME_FILE_FORMAT = "ziffr.theme/1";
/** Every Theme file format Ziffr ever published, oldest first. */
export const THEME_FILE_FORMATS = [THEME_FILE_FORMAT] as const;
/** The exact limits a Theme file is held to, as the Theme editor keeps them. */
export const THEME_FILE_LIMITS = { bytes: 8_192, depth: 4, name: 60, footer: 120 } as const;

/** The colours a Theme names, besides its data colours. */
export const COLOR_NAMES = ["canvas", "surface", "ink", "muted", "rule", "accent", "good", "bad", "band"] as const;

/** A Theme as a file (GLOSSARY: Theme), in the newest format. */
export type ThemeFile = {
  format: typeof THEME_FILE_FORMAT;
  name: string;
  colors: Record<(typeof COLOR_NAMES)[number], string> & { data: string[] };
  fonts: { heading: FontId; body: FontId; figures: FontId };
  radius: number;
  cards: "paper" | "flat" | "plain";
  slides?: { logoPosition?: LogoPosition; logoWidth?: number; footer?: string; showSlideNumber?: boolean; titleSize?: number; bodySize?: number };
};

const HEX_COLOR: Schema = { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: "a colour as # and six hex digits, such as “#1A2B3C”" };
const FONT: Schema = { enum: [...FONT_IDS], description: "One of the fonts Ziffr ships." };
const int = (minimum: number, maximum: number, description: string): Schema => ({ type: "integer", minimum, maximum, description });

/** The JSON Schema of ziffr.theme/1: the one definition the checks run and docs/reference is generated from. */
export const THEME_FILE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.app/schemas/ziffr.theme-1.json",
  title: "Ziffr Theme (ziffr.theme/1)",
  description: "A named look for everything that shows numbers: colours, fonts, cards and what every slide shows. It holds no image, font file or web address.",
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
      description: "What every slide shows. A logo and a background image are set in Ziffr, never in the file.",
      properties: {
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

const FORMAT = { family: "ziffr.theme", reads: THEME_FILE_FORMATS, schema: THEME_FILE_SCHEMA };

/** Checks a Theme file's text: size and depth, then the schema. */
export function checkThemeFile(textIn: string): FormatCheck<ThemeFile> {
  const parsed = parseJson(textIn, { maxBytes: THEME_FILE_LIMITS.bytes, maxDepth: THEME_FILE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkThemeFileValue(parsed.value, parsed.lines);
}

/** Checks a Theme file already read from JSON (`lines` names where each path starts, when known). */
export function checkThemeFileValue(value: unknown, lines: Map<string, number> = new Map()): FormatCheck<ThemeFile> {
  return checkFormat(FORMAT, value, lines);
}
