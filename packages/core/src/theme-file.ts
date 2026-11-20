// The Theme file format, ziffr.theme/1 (GLOSSARY: Theme): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module adds how a checked file becomes what a Theme stores.
import { COLOR_NAMES, type ThemeFile } from "@ziffr/pack/theme-file";
import type { ThemeSlides, ThemeTokens } from "./types";

export * from "@ziffr/pack/theme-file";

/** A checked Theme file as the tokens and slide settings a Theme stores: colours in capitals as the editor keeps them,
 * and never a logo or background image. */
export function themeFromFile(t: ThemeFile): { name: string; tokens: ThemeTokens; slides: ThemeSlides } {
  const s = t.slides ?? {};
  return {
    name: t.name,
    tokens: {
      ...(Object.fromEntries(COLOR_NAMES.map((c) => [c, t.colors[c].toUpperCase()])) as Record<(typeof COLOR_NAMES)[number], string>),
      data: t.colors.data.map((c) => c.toUpperCase()),
      fontHeading: t.fonts.heading, fontBody: t.fonts.body, fontFigures: t.fonts.figures, radius: t.radius, cards: t.cards,
    },
    slides: {
      background_image: null, logo: null, logo_ratio: 3,
      logo_position: s.logoPosition ?? "top-right", logo_width: s.logoWidth ?? 140, footer: s.footer ?? "",
      show_slide_number: s.showSlideNumber ?? false, title_size: s.titleSize ?? 56, body_size: s.bodySize ?? 24,
    },
  };
}
