// @ts-nocheck
// The Theme outside the app (GLOSSARY: Theme; ticket #542): what of a Workspace's default Theme leaves Ziffr in emails,
// on the form link and View Link pages and in chat messages: its name, logo, footer, accent, colours and fonts, and
// nothing else. Every colour is checked for contrast here (WCAG AA), so a brand colour that is too light to read is
// replaced by a readable shade of it. Never Appearance, which is only for Ziffr's own screens. Pure.
import { cleanLogo } from "@ziffr/pack/logo";
import { FONTS, HEX } from "./themes";
import type { FontId, Theme } from "./types";

/** The part of a Theme that may leave the app (AGENTS.md rule 3: only what is needed), with the Workspace's name. */
export type ThemeLook = {
  name: string;
  /** The logo as an inline picture the Theme checks already hold to a type and size, or null. */
  logo: string | null;
  logoRatio: number;
  logoWidth: number;
  footer: string;
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  rule: string;
  /** The accent, in a shade that reads on the surface (4.5 : 1), whatever the Theme's own accent is. */
  accent: string;
  fontHeading: FontId;
  fontBody: FontId;
};

const channel = (n: number) => { const c = n / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = ([r, g, b]: number[]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

// The logo checks live in @ziffr/pack (MIT), so `npx @ziffr/pack check` and the server run one copy (spec 0039).
export { cleanLogo, LOGO_MAX_BYTES, LOGO_MAX_PIXELS, logoOk, svgIsPlain } from "@ziffr/pack/logo";

/** The contrast ratio of two colours written as #RRGGBB (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const l = (h: string) => { const [r, g, bl] = rgb(h); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl); };
  const [hi, lo] = [l(a), l(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour, or the nearest shade of it that reads on `ground` at `min` : 1 (darker on a light ground, lighter on a
 * dark one); the plain text colour of the ground when no shade does. */
export function readableOn(color: string, ground: string, min = 4.5): string {
  if (!HEX.test(color) || !HEX.test(ground)) return "#000000";
  if (contrastRatio(color, ground) >= min) return color.toUpperCase();
  const target = contrastRatio(ground, "#FFFFFF") > contrastRatio(ground, "#000000") ? 255 : 0;
  const from = rgb(color);
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const shade = hex(from.map((v) => v + (target - v) * t));
    if (contrastRatio(shade, ground) >= min) return shade;
  }
  return target ? "#FFFFFF" : "#000000";
}

/** Black or white, whichever reads better on a fill of this colour (the text of a button in the accent). */
export const onFill = (fill: string): string => (contrastRatio("#FFFFFF", fill) >= contrastRatio("#000000", fill) ? "#FFFFFF" : "#000000");

/** What leaves for a Theme and the Workspace's name. The name goes on one line, at most 80 characters. */
export function themeLook(theme: Pick<Theme, "tokens" | "slides"> | undefined, workspaceName: string): ThemeLook {
  const t = theme?.tokens;
  const ok = (c: string | undefined, d: string) => (typeof c === "string" && HEX.test(c) ? c.toUpperCase() : d);
  const surface = ok(t?.surface, "#FFFFFF");
  const ink = readableOn(ok(t?.ink, "#14161A"), surface, 7);
  const font = (f: FontId | undefined): FontId => (f && f in FONTS ? f : "arial");
  const logo = theme?.slides?.logo ?? null;
  return {
    name: String(workspaceName ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Ziffr",
    logo: cleanLogo(logo),
    logoRatio: Number(theme?.slides?.logo_ratio) > 0 ? Math.min(20, Number(theme?.slides?.logo_ratio)) : 3,
    logoWidth: Math.min(400, Math.max(40, Math.round(Number(theme?.slides?.logo_width) || 140))),
    footer: String(theme?.slides?.footer ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim().slice(0, 120),
    canvas: ok(t?.canvas, "#F3F4F6"), surface, ink,
    muted: readableOn(ok(t?.muted, "#565C66"), surface),
    rule: ok(t?.rule, "#D8DBE0"),
    accent: readableOn(ok(t?.accent, "#2F5BEA"), surface),
    fontHeading: font(t?.fontHeading), fontBody: font(t?.fontBody),
  };
}

/** A look as a Theme, so a page that has only the look (the form link) can be painted by the same ThemeScope: its
 * colours and fonts as given, the rest neutral. The id is 0: it names no stored Theme. */
export function lookTheme(look: ThemeLook): Theme {
  return {
    id: 0, owner_id: "", name: look.name, is_default: true, updated_at: "",
    tokens: { canvas: look.canvas, surface: look.surface, ink: look.ink, muted: look.muted, rule: look.rule, accent: look.accent, data: [look.accent, look.muted, look.rule, look.ink], good: "#0B7A55", bad: "#C8401E", band: look.rule, fontHeading: look.fontHeading, fontBody: look.fontBody, fontFigures: look.fontBody, radius: 10, cards: "flat" },
    slides: { background_image: null, logo: look.logo, logo_ratio: look.logoRatio, logo_position: "top-left", logo_width: look.logoWidth, footer: look.footer, show_slide_number: false, title_size: 56, body_size: 24 },
  };
}
