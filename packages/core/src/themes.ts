// Themes (GLOSSARY: Theme): a theme becomes CSS custom properties on the element that holds content.
// Widgets, stories and slides only use tokens, so one wrapper repaints all of them. Pure.
import type { FontId, SlideDesign, Theme, ThemeSlides, ThemeTokens } from "./types";

type Font = { label: string; stack: string; href?: string; /** The name PowerPoint looks for. */ office: string; kind: "sans" | "serif" | "mono" };
const G = (family: string) => `https://fonts.googleapis.com/css2?family=${family}&display=swap`;

/** The fonts a Theme can use, with the stylesheet that loads them and the name PowerPoint knows. */
export const FONTS: Record<FontId, Font> = {
  "general-sans": { label: "General Sans", stack: '"General Sans", ui-sans-serif, system-ui, sans-serif', href: "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap", office: "Arial", kind: "sans" },
  inter: { label: "Inter", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', href: G("Inter:wght@400;500;600;700"), office: "Inter", kind: "sans" },
  "ibm-plex-sans": { label: "IBM Plex Sans", stack: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif', href: G("IBM+Plex+Sans:wght@400;500;600"), office: "IBM Plex Sans", kind: "sans" },
  "libre-franklin": { label: "Libre Franklin", stack: '"Libre Franklin", ui-sans-serif, system-ui, sans-serif', href: G("Libre+Franklin:wght@400;500;600;700"), office: "Libre Franklin", kind: "sans" },
  "source-serif": { label: "Source Serif", stack: '"Source Serif 4", Georgia, serif', href: G("Source+Serif+4:wght@400;600;700"), office: "Source Serif 4", kind: "serif" },
  playfair: { label: "Playfair Display", stack: '"Playfair Display", Georgia, serif', href: G("Playfair+Display:wght@500;600;700"), office: "Playfair Display", kind: "serif" },
  georgia: { label: "Georgia", stack: "Georgia, serif", office: "Georgia", kind: "serif" },
  arial: { label: "Arial", stack: "Arial, Helvetica, sans-serif", office: "Arial", kind: "sans" },
  "geist-mono": { label: "Geist Mono", stack: '"Geist Mono", ui-monospace, monospace', href: G("Geist+Mono:wght@400"), office: "Consolas", kind: "mono" },
  "ibm-plex-mono": { label: "IBM Plex Mono", stack: '"IBM Plex Mono", ui-monospace, monospace', href: G("IBM+Plex+Mono:wght@400;500"), office: "IBM Plex Mono", kind: "mono" },
};

/** A colour as stored in a Theme: # and six hex digits. */
export const HEX = /^#[0-9a-fA-F]{6}$/;

/** The theme a dashboard or deck uses: its own, or the team default. */
export function themeFor(themes: Theme[], id: number | null | undefined): Theme | undefined {
  return themes.find((t) => t.id === id) ?? themes.find((t) => t.is_default) ?? themes[0];
}

/** What a deck draws behind every slide: the theme's slide part in its colours, the deck's footer if it has one. */
export function slideDesign(theme: Theme | undefined, footer?: string | null): SlideDesign | null {
  if (!theme) return null;
  return { ...theme.slides, footer: footer ?? theme.slides.footer, background_color: theme.tokens.surface, text_color: theme.tokens.ink };
}

const mix = (a: string, b: string, pct: number) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/** Every token the content uses, including the UI kit's aliases (they resolve where they are declared). */
/** CSS custom properties and the two direct styles a theme sets on the element that holds content. */
export function themeVars(t: ThemeTokens): Record<string, string | number | undefined> {
  const heading = FONTS[t.fontHeading]?.stack ?? FONTS["general-sans"].stack;
  const body = FONTS[t.fontBody]?.stack ?? FONTS["general-sans"].stack;
  const figures = FONTS[t.fontFigures]?.stack ?? FONTS["geist-mono"].stack;
  const paper2 = mix(t.ink, t.surface, 5);
  const paper3 = mix(t.ink, t.surface, 9);
  const rule2 = mix(t.ink, t.rule, 12);
  const edge = { paper: undefined, flat: `0 0 0 1px ${t.rule}`, plain: "none" }[t.cards];
  const vars: Record<string, string | number | undefined> = {
    "--color-desk": t.canvas, "--color-cotton": t.surface, "--color-paper": t.surface, "--color-paper-2": paper2, "--color-paper-3": paper3,
    "--color-ink": t.ink, "--color-ink-2": t.ink, "--color-print": t.ink, "--color-muted": t.muted,
    "--color-rule": t.rule, "--color-rule-2": rule2, "--color-accent-2": t.accent,
    "--color-error": t.bad, "--color-success": t.good, "--color-band": t.band,
    "--color-data": t.data[0] ?? t.ink, "--color-data-2": t.data[1] ?? t.muted, "--color-data-3": t.data[2] ?? t.rule, "--color-data-4": t.data[3] ?? t.muted,
    "--background": t.canvas, "--foreground": t.ink, "--card": t.surface, "--card-foreground": t.ink,
    "--muted": paper2, "--muted-foreground": t.muted, "--secondary": paper3, "--secondary-foreground": t.ink, "--accent": paper3, "--accent-foreground": t.ink,
    "--border": t.rule, "--input": t.muted, "--destructive": t.bad,
    "--chart-1": t.data[0], "--chart-2": t.data[1], "--chart-3": t.data[2], "--chart-4": t.data[3], "--chart-5": t.accent,
    "--font-display": heading, "--font-heading": heading, "--font-body": body, "--font-sans": body, "--font-outlier": figures, "--font-deck": body,
    "--tl-font-sans": body, "--tl-font-serif": heading,
    "--radius-card": `${t.radius}px`, "--radius-input": `${Math.round(t.radius * 0.75)}px`, "--radius-stock": `${t.radius}px`, "--radius": `${t.radius}px`,
    ...(t.cards === "paper" ? {} : { "--tex-cotton": "none", "--tex-desk": "none", "--edge-stock": edge, "--cast-stock": "none", "--cast-stock-lift": "none" }),
  };
  return { ...vars, color: t.ink, fontFamily: body };
}

/** Stylesheets for the theme's web fonts. */
export const fontHrefs = (t: ThemeTokens) => [...new Set([t.fontHeading, t.fontBody, t.fontFigures].map((f) => FONTS[f]?.href).filter(Boolean) as string[])];

/** Is a theme light? Decides things like the tldraw canvas mode. */
export function isDark(t: ThemeTokens) {
  const n = parseInt(t.surface.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

/** The Theme every new Workspace starts with: Coral, with nothing of any other workspace (no logo, no footer). */
export const STARTER_THEME: { name: string; tokens: ThemeTokens; slides: ThemeSlides } = {
  name: "Coral",
  tokens: {
    canvas: "#F0EBE7", surface: "#FDFBF8", ink: "#221B19", muted: "#615955", rule: "#D9D3CF", accent: "#BB3D31",
    data: ["#312926", "#8C7B6E", "#C7BFBA", "#5E7C6B"], good: "#21763C", bad: "#BE2323", band: "#E8E1DD",
    fontHeading: "general-sans", fontBody: "general-sans", fontFigures: "geist-mono", radius: 8, cards: "paper",
  },
  slides: { background_image: null, logo: null, logo_ratio: 3, logo_position: "top-right", logo_width: 140, footer: "", show_slide_number: true, title_size: 56, body_size: 24 },
};
