// @ts-nocheck
// The dark variant of a Theme (GLOSSARY: Theme, Appearance; ticket #583): the colours a dashboard or deck wears when the
// viewer's Appearance is dark and the Theme "follows the viewer's Appearance". A Standard Theme carries a designed one;
// any other Theme gets one derived from its own colours; a derived one that fails the contrast checks is replaced by the
// designed default. Never inverted: the grounds are dark tints of the Theme's own hue, accents and data colours are
// lifted until they read. A Theme that is dark already has no variant. Pure.
import { contrastRatio, readableOn } from "./theme-look";
import type { ThemeDarkColours, ThemeTokens } from "./types";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const KEYS = ["canvas", "surface", "ink", "muted", "rule", "accent", "good", "bad", "band"] as const;

/** The designed default dark variant (Ziffr Dark's colours): where a derivation cannot be made to read. */
export const DEFAULT_DARK: ThemeDarkColours = {
  canvas: "#0E1014", surface: "#171A21", ink: "#ECEEF2", muted: "#9AA1AD", rule: "#2B303A", accent: "#6C8CFF",
  data: ["#6C8CFF", "#9AA1AD", "#6F7888", "#F2B84B"], good: "#3CCB8A", bad: "#FF7A5C", band: "#222733",
};

/** The dark colours of a stored Theme, checked and in capitals, or null when they are not valid colours. */
export function cleanDark(d: unknown): ThemeDarkColours | null {
  const o = d as Partial<ThemeDarkColours> | null;
  if (!o || typeof o !== "object") return null;
  if (!KEYS.every((k) => typeof o[k] === "string" && HEX6.test(o[k] as string))) return null;
  if (!Array.isArray(o.data) || o.data.length < 1 || o.data.length > 6 || !o.data.every((c) => typeof c === "string" && HEX6.test(c))) return null;
  return { ...(Object.fromEntries(KEYS.map((k) => [k, (o[k] as string).toUpperCase()])) as Record<(typeof KEYS)[number], string>), data: o.data.map((c) => c.toUpperCase()) };
}

/** What a set of dark colours must keep, as in the Standard Theme checks: text and values 4.5 : 1 on cards, text 4.5 : 1
 * behind them and on the target band, data colours 3 : 1 against cards (WCAG AA). Returns the failing pairs. */
export function darkProblems(d: ThemeDarkColours): string[] {
  const out: string[] = [];
  const all = [...KEYS.map((k) => d[k]), ...d.data];
  if (d.data.length < 1 || d.data.length > 6 || !all.every((c) => typeof c === "string" && HEX6.test(c))) return ["the colours are not six-digit hex colours, or there are not one to six data colours"];
  const need = (name: string, a: string, b: string, min: number) => { if (contrastRatio(a, b) < min) out.push(`${name} ${contrastRatio(a, b).toFixed(2)} < ${min}`); };
  for (const k of ["ink", "muted", "accent", "good", "bad"] as const) need(`${k} on cards`, d[k], d.surface, 4.5);
  for (const k of ["ink", "muted"] as const) need(`${k} behind cards`, d[k], d.canvas, 4.5);
  need("ink on the band", d.ink, d.band, 4.5);
  d.data.forEach((c, i) => need(`data ${i + 1} on cards`, c, d.surface, 3));
  return out;
}

const parts = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function toHsl(h: string): [number, number, number] {
  const [r, g, b] = parts(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Whether the Theme's cards are dark already (the rule `isDark` in themes.ts applies to the surface). */
const darkAlready = (surface: string) => { const [r, g, b] = parts(surface); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110; };

/** A dark variant derived from a light Theme's colours: its hue on dark grounds, its accents lifted to read. Not checked. */
function derive(t: ThemeTokens): ThemeDarkColours {
  const [hue, sat] = toHsl(t.surface);
  const tint = Math.min(sat, 0.25);
  const ground = (l: number, k = 1) => fromHsl(hue, tint * k, l);
  const surface = ground(0.105);
  const lift = (c: string, floor: number, min: number) => { const [h, s, l] = toHsl(c); return readableOn(fromHsl(h, Math.min(s, 0.85), Math.max(l, floor)), surface, min); };
  return {
    canvas: ground(0.07), surface, ink: ground(0.93, 0.5), muted: readableOn(ground(0.7, 0.6), surface), rule: ground(0.2), band: ground(0.17),
    accent: lift(t.accent, 0.66, 4.5), good: lift(t.good, 0.6, 4.5), bad: lift(t.bad, 0.66, 4.5),
    data: t.data.map((c) => lift(c, 0.62, 3)),
  };
}

/** Where a dark variant came from: the Theme's own `dark` colours, derived from its colours, or the designed default. */
export type DarkSource = "designed" | "derived" | "default";

/** The dark variant a Theme wears, or null when its cards are dark already (it looks the same in either Appearance). */
export function darkOf(t: ThemeTokens): { colours: ThemeDarkColours; source: DarkSource } | null {
  if (darkAlready(t.surface)) return null;
  const own = cleanDark(t.dark);
  if (own && darkProblems(own).length === 0) return { colours: own, source: "designed" };
  const derived = derive(t);
  if (darkProblems(derived).length === 0) return { colours: derived, source: "derived" };
  return { colours: DEFAULT_DARK, source: "default" };
}

/** Whether the Theme goes dark with the viewer's Appearance: the default, unless it says "always as designed". */
export const followsAppearance = (t: ThemeTokens): boolean => t.appearance !== "fixed";

/** The tokens to draw with for a viewer: the designed ones, or with the dark colours laid over them when the Theme follows
 * the Appearance and the viewer's is dark. Used where colours must be plain values (slides, the canvas mode). */
export function tokensForViewer(t: ThemeTokens, viewerDark: boolean): ThemeTokens {
  const d = viewerDark && followsAppearance(t) ? darkOf(t) : null;
  return d ? { ...t, ...d.colours } : t;
}
