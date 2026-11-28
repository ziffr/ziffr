// The fonts a deck's slides are drawn with on screen (spec 0069; GLOSSARY: Slide, Theme): each deck font as the browser
// asks for it, and the stylesheet that loads it. The drawing broke its lines by these fonts' widths, so they come first:
// Arimo and Gelasio, which have the widths of Arial and Georgia, stand in front of them for the devices that lack both.
import { DECK_FONT_FAMILIES, type DeckFont, type DeckFonts } from "@ziffr/core/deck-drawing/fonts";

const webFamily = (font: DeckFont) => (font === "arial" ? "Arimo" : font === "georgia" ? "Gelasio" : DECK_FONT_FAMILIES[font].family);

/** The `font-family` of a deck font. */
export function slideFontStack(font: DeckFont): string {
  const { family, serif, mono } = DECK_FONT_FAMILIES[font];
  const named = [...new Set([webFamily(font), family])].map((name) => `"${name}"`);
  return [...named, mono ? "monospace" : serif ? "serif" : "sans-serif"].join(", ");
}

/** The stylesheet that loads a deck's two fonts, regular and bold. */
export function slideFontsHref(fonts: DeckFonts): string {
  const families = [...new Set([fonts.head, fonts.body].map(webFamily))].map((name) => `family=${name.replaceAll(" ", "+")}:wght@400;700`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
