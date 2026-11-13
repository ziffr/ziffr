// Checks a theme's tokens before they are stored: colours are hex, fonts are known, sizes are sane.
import { FONTS, HEX } from "./themes";
import type { FontId, ThemeTokens } from "./types";

const COLORS = ["canvas", "surface", "ink", "muted", "rule", "accent", "good", "bad", "band"] as const;

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
