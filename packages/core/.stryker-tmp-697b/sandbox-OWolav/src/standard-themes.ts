// @ts-nocheck
// The standard Themes (GLOSSARY: Standard Theme, Theme): six looks Ziffr delivers, so a Workspace has a good one from
// the first day. They are code, not rows: a Workspace gets a copy as an ordinary Theme only when an Owner or Admin adds
// one (addStandardTheme), so dashboards never change under anyone when Ziffr improves a standard Theme. Every one
// has a designed dark variant (#583; the two dark ones are dark already) and, in both variants, passes WCAG AA for text and values on cards and keeps Good and Bad apart for people with red-green colour blindness
// (standard-themes.test.ts computes both). Pure.
import type { ThemeSlides, ThemeTokens } from "./types";

/** A standard Theme: its key, a line on what it is for, and what a Theme stores. */
export type StandardTheme = { key: string; name: string; about: string; tokens: ThemeTokens; slides: ThemeSlides };

const slides = (o: Partial<ThemeSlides> = {}): ThemeSlides => ({ background_image: null, logo: null, logo_ratio: 3, logo_position: "top-right", logo_width: 140, footer: "", show_slide_number: true, title_size: 56, body_size: 24, ...o });

/** The standard Themes Ziffr delivers, in the order they are shown. */
export const STANDARD_THEMES: StandardTheme[] = [
  {
    key: "ziffr-light", name: "Ziffr Light", about: "Clean and neutral, with a blue accent. The safe choice for most dashboards.",
    tokens: { canvas: "#F3F4F6", surface: "#FFFFFF", ink: "#14161A", muted: "#565C66", rule: "#D8DBE0", accent: "#2F5BEA", data: ["#2F5BEA", "#6B7488", "#7C849A", "#B9690A"], good: "#0B7A55", bad: "#C8401E", band: "#E4E8F0", fontHeading: "general-sans", fontBody: "general-sans", fontFigures: "general-sans", radius: 10, cards: "flat", dark: { canvas: "#0E1014", surface: "#171A21", ink: "#ECEEF2", muted: "#9AA1AD", rule: "#2B303A", accent: "#6C8CFF", data: ["#6C8CFF", "#9AA1AD", "#6F7888", "#F2B84B"], good: "#3CCB8A", bad: "#FF7A5C", band: "#222733" } },
    slides: slides(),
  },
  {
    key: "ziffr-dark", name: "Ziffr Dark", about: "The same look on a dark ground, for screens in dim rooms.",
    tokens: { canvas: "#0E1014", surface: "#171A21", ink: "#ECEEF2", muted: "#9AA1AD", rule: "#2B303A", accent: "#6C8CFF", data: ["#6C8CFF", "#9AA1AD", "#6F7888", "#F2B84B"], good: "#3CCB8A", bad: "#FF7A5C", band: "#222733", fontHeading: "general-sans", fontBody: "general-sans", fontFigures: "general-sans", radius: 10, cards: "flat" },
    slides: slides(),
  },
  {
    key: "tokyo", name: "Tokyo", about: "Dark, with vivid pink, sky and yellow, and figures in a monospaced face. Made for a wall display.",
    tokens: { canvas: "#0B0A1A", surface: "#14122B", ink: "#F1EEFF", muted: "#A39FCC", rule: "#2E2A5A", accent: "#FF3EA5", data: ["#FF3EA5", "#38BDF8", "#FACC15", "#A78BFA"], good: "#2EE6A6", bad: "#FF4D6D", band: "#211E45", fontHeading: "inter", fontBody: "inter", fontFigures: "geist-mono", radius: 6, cards: "flat" },
    slides: slides(),
  },
  {
    key: "paris", name: "Paris", about: "Warm paper tones, a bordeaux accent and serif headlines. For reports that are read, not glanced at.",
    tokens: { canvas: "#EFE6DA", surface: "#FBF6EE", ink: "#2B1F1A", muted: "#6B5A4E", rule: "#DACBB8", accent: "#9B2C3B", data: ["#9B2C3B", "#A06A12", "#6B7F5E", "#3F4A6B"], good: "#2F6B3A", bad: "#B3261E", band: "#EADFCF", fontHeading: "playfair", fontBody: "source-serif", fontFigures: "source-serif", radius: 4, cards: "paper", dark: { canvas: "#17110E", surface: "#211914", ink: "#F1E7DA", muted: "#B5A596", rule: "#3A2D25", accent: "#E0707F", data: ["#E0707F", "#D9A441", "#8FAE80", "#8E9BD0"], good: "#8CDB9B", bad: "#EB5545", band: "#2D221B" } },
    slides: slides({ title_size: 52 }),
  },
  {
    key: "oslo", name: "Oslo", about: "Cool, quiet and restrained: slate blues and greens, hairline cards, nothing that shouts.",
    tokens: { canvas: "#E9EEF2", surface: "#F8FAFB", ink: "#1D2A33", muted: "#526571", rule: "#CCD6DD", accent: "#2B6C8F", data: ["#2B6C8F", "#5E88A0", "#7C8F9A", "#5C7C6F"], good: "#1F7A5C", bad: "#B4412E", band: "#DCE5EA", fontHeading: "ibm-plex-sans", fontBody: "ibm-plex-sans", fontFigures: "ibm-plex-sans", radius: 6, cards: "flat", dark: { canvas: "#0D1318", surface: "#151D24", ink: "#E3EAEF", muted: "#93A5B1", rule: "#2A3843", accent: "#6FB4D6", data: ["#6FB4D6", "#8FB0C2", "#8497A3", "#7FB59F"], good: "#4CC59B", bad: "#F28B73", band: "#1F2B34" } },
    slides: slides(),
  },
  {
    key: "print", name: "Print", about: "Black on white with strong contrast and fonts PowerPoint has everywhere. For PDF, paper and projectors.",
    tokens: { canvas: "#FFFFFF", surface: "#FFFFFF", ink: "#000000", muted: "#404040", rule: "#8A8A8A", accent: "#0033CC", data: ["#000000", "#0033CC", "#6B6B6B", "#B34100"], good: "#005F9E", bad: "#C2410C", band: "#E6E6E6", fontHeading: "arial", fontBody: "arial", fontFigures: "arial", radius: 0, cards: "plain", dark: { canvas: "#000000", surface: "#000000", ink: "#FFFFFF", muted: "#BFBFBF", rule: "#8A8A8A", accent: "#6E9BFF", data: ["#FFFFFF", "#6E9BFF", "#A6A6A6", "#FF9A5C"], good: "#5CC0FF", bad: "#FF9A5C", band: "#262626" } },
    slides: slides({ body_size: 28 }),
  },
];

/** A standard Theme by its key, or undefined. */
export const standardTheme = (key: unknown): StandardTheme | undefined => STANDARD_THEMES.find((t) => t.key === key);
