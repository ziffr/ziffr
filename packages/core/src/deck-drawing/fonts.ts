// The fonts of a deck's slides (spec 0069; GLOSSARY: Theme): a Theme names a heading and a text font; a slide is drawn
// in them where Ziffr has a table of their widths, and in Arial where it has none, so words break the same way in the
// browser, in tests and in a file. A file for PowerPoint or Keynote uses Arial and Georgia, which any computer has. Pure.
import type { FontId, ThemeTokens } from "../types";
import { FONT_WIDTHS } from "./font-widths.generated";

/** A font Ziffr has the widths of. */
export type DeckFont = keyof typeof FONT_WIDTHS;

/** The two fonts a deck is drawn in. */
export type DeckFonts = { head: DeckFont; body: DeckFont };

/** Which fonts a drawing is made in: the Theme's own, or the ones any computer has. */
export type FontSet = "theme" | "office";

/** Each font's family name as a file writes it, and whether it has serifs. */
export const DECK_FONT_FAMILIES: Record<DeckFont, { family: string; serif?: boolean; mono?: boolean }> = {
  arial: { family: "Arial" },
  georgia: { family: "Georgia", serif: true },
  inter: { family: "Inter" },
  "ibm-plex-sans": { family: "IBM Plex Sans" },
  "libre-franklin": { family: "Libre Franklin" },
  "source-serif": { family: "Source Serif 4", serif: true },
  playfair: { family: "Playfair Display", serif: true },
  "geist-mono": { family: "Geist Mono", mono: true },
  "ibm-plex-mono": { family: "IBM Plex Mono", mono: true },
};

const hasTable = (id: FontId): id is FontId & DeckFont => Object.hasOwn(FONT_WIDTHS, id);

/** Fonts with serifs among the Theme fonts: in the office set they become Georgia, all others Arial. */
const SERIFS: FontId[] = ["georgia", "playfair", "source-serif"];

/** The fonts a Theme's slides are drawn in. */
export function deckFonts(tokens: Pick<ThemeTokens, "fontHeading" | "fontBody">, set: FontSet = "theme"): DeckFonts {
  const pick = (id: FontId): DeckFont => (set === "office" ? (SERIFS.includes(id) ? "georgia" : "arial") : hasTable(id) ? id : "arial");
  return { head: pick(tokens.fontHeading), body: pick(tokens.fontBody) };
}
