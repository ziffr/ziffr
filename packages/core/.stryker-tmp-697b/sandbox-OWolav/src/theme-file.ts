// @ts-nocheck
// The Theme file format, ziffr.theme/1 (GLOSSARY: Theme): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module adds how a checked file becomes what a Theme stores.
import { COLOR_NAMES, type ThemeFile } from "@ziffr/pack/theme-file";
import { logoRatio } from "@ziffr/pack/logo";
import { checkSchema, type Schema } from "./json-check";
import { PLAIN } from "./file-text";
import type { ThemeSlides, ThemeTokens } from "./types";

export * from "@ziffr/pack/theme-file";

/** A checked Theme file as the tokens and slide settings a Theme stores: colours in capitals as the editor keeps them,
 * never a background image, and a logo only when the file says `"logo": "pack"` and `packLogo` is the Pack's logo, as
 * `cleanLogo` wrote it (spec 0039): the caller passes nothing else, so a Theme file on its own never carries a picture. */
export function themeFromFile(t: ThemeFile, packLogo: string | null = null): { name: string; tokens: ThemeTokens; slides: ThemeSlides } {
  const s = t.slides ?? {};
  const logo = s.logo === "pack" && packLogo ? packLogo : null;
  return {
    name: t.name,
    tokens: {
      ...(Object.fromEntries(COLOR_NAMES.map((c) => [c, t.colors[c].toUpperCase()])) as Record<(typeof COLOR_NAMES)[number], string>),
      data: t.colors.data.map((c) => c.toUpperCase()),
      fontHeading: t.fonts.heading, fontBody: t.fonts.body, fontFigures: t.fonts.figures, radius: t.radius, cards: t.cards,
    },
    slides: {
      background_image: null, logo, logo_ratio: logo ? logoRatio(logo) : 3,
      logo_position: s.logoPosition ?? "top-right", logo_width: s.logoWidth ?? 140, footer: s.footer ?? "",
      show_slide_number: s.showSlideNumber ?? false, title_size: s.titleSize ?? 56, body_size: s.bodySize ?? 24,
    },
  };
}

// Plain text only: a name or footer that is not (a web address, markup) leaves the file rather than breaking it.
const plain = (s: unknown, max: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return checkSchema({ type: "string", pattern: PLAIN } as Schema, t).length ? null : t;
};

/** A stored Theme as a file. A background image never goes into a file (spec 0030) and a logo only as the word "pack",
 * when it is the Pack's one logo (`usesPackLogo`, spec 0039): no second picture is ever in a file. A name or footer that
 * is not plain text is replaced ("Theme") or left out. */
export function themeToFile(name: unknown, tokens: ThemeTokens, slides: Partial<ThemeSlides> | null | undefined, usesPackLogo = false, fit: (text: unknown, max: number) => string | null = plain): ThemeFile {
  const s = slides ?? {};
  const footer = fit(s.footer, 120);
  return {
    format: "ziffr.theme/1", name: fit(name, 60) || "Theme",
    colors: { ...Object.fromEntries(COLOR_NAMES.map((c) => [c, tokens[c]])), data: tokens.data } as ThemeFile["colors"],
    fonts: { heading: tokens.fontHeading, body: tokens.fontBody, figures: tokens.fontFigures }, radius: tokens.radius, cards: tokens.cards,
    slides: { ...(usesPackLogo ? { logo: "pack" as const } : {}), ...(s.logo_position ? { logoPosition: s.logo_position } : {}), ...(s.logo_width ? { logoWidth: s.logo_width } : {}), ...(footer ? { footer } : {}), showSlideNumber: Boolean(s.show_slide_number), ...(s.title_size ? { titleSize: s.title_size } : {}), ...(s.body_size ? { bodySize: s.body_size } : {}) },
  };
}

/** The text of a Theme's file, as it is downloaded, and a file name for it: letters, digits and dashes only. */
export function themeFileText(file: ThemeFile): { name: string; text: string } {
  const slug = file.name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "theme";
  return { name: `${slug}.ziffr-theme.json`, text: `${JSON.stringify(file, null, 2)}\n` };
}
