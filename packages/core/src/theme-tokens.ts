// Theme checks (GLOSSARY: Theme): a theme's tokens and slide settings before they are stored. Colours are hex,
// fonts are known, sizes are sane, images are inline pictures of a limited size.
import { FONTS, HEX } from "./themes";
import type { FontId, LogoPosition, ThemeSlides, ThemeTokens } from "./types";

const COLORS = ["canvas", "surface", "ink", "muted", "rule", "accent", "good", "bad", "band"] as const;

/** A theme's tokens as stored, or null when any colour, font or setting is not valid. */
export function cleanTokens(t: ThemeTokens): ThemeTokens | null {
  if (!t || typeof t !== "object") return null;
  if (!COLORS.every((k) => typeof t[k] === "string" && HEX.test(t[k]))) return null;
  if (!Array.isArray(t.data) || t.data.length < 1 || t.data.length > 6 || !t.data.every((c) => typeof c === "string" && HEX.test(c))) return null;
  const font = (f: FontId) => (f in FONTS ? f : null);
  const [fontHeading, fontBody, fontFigures] = [font(t.fontHeading), font(t.fontBody), font(t.fontFigures)];
  if (!fontHeading || !fontBody || !fontFigures) return null;
  if (!["paper", "flat", "plain"].includes(t.cards)) return null;
  const radius = Math.max(0, Math.min(24, Math.round(Number(t.radius) || 0)));
  return {
    ...Object.fromEntries(COLORS.map((k) => [k, t[k].toUpperCase()])),
    data: t.data.map((c) => c.toUpperCase()),
    fontHeading, fontBody, fontFigures, radius, cards: t.cards,
  } as ThemeTokens;
}

const POSITIONS: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const DATA_IMAGE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;
const MAX_IMAGE = 3_000_000; // characters of data URL

/** The slide part of a theme: images must be inline pictures of a sane size, numbers within range. */
export function cleanSlides(s: ThemeSlides): ThemeSlides {
  const img = (v: string | null) => (v && DATA_IMAGE.test(v) && v.length <= MAX_IMAGE ? v : null);
  const int = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return {
    background_image: img(s?.background_image ?? null),
    logo: img(s?.logo ?? null),
    logo_ratio: Number(s?.logo_ratio) > 0 ? Math.min(20, Number(s.logo_ratio)) : 3,
    logo_position: POSITIONS.includes(s?.logo_position) ? s.logo_position : "top-right",
    logo_width: int(s?.logo_width, 40, 400, 140),
    footer: String(s?.footer ?? "").slice(0, 120),
    show_slide_number: Boolean(s?.show_slide_number),
    title_size: int(s?.title_size, 24, 96, 56),
    body_size: int(s?.body_size, 12, 48, 24),
  };
}
