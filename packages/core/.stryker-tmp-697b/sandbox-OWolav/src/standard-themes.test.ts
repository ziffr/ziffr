// @ts-nocheck
// The standard Themes (GLOSSARY: Standard Theme): contrast and colour-blind checks, computed for every one.
import { describe, expect, it } from "vitest";
import { STANDARD_THEMES, standardTheme } from "./standard-themes";
import { cleanSlides, cleanTokens } from "./theme-tokens";
import { checkThemeFileValue, themeFileText, themeToFile } from "./theme-file";

const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG 2 contrast ratio. */
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
// Machado et al. (2009), severity 1: how the colours look to people without working red (protan) or green (deutan) cones.
const SIM = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
const lab = ([r, g, b]: number[]) => {
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
/** CIE76 colour difference between two colours as seen with one kind of colour blindness. */
const apart = (a: string, b: string, kind: keyof typeof SIM) => {
  const seen = (h: string) => { const l = rgb(h).map(lin); return SIM[kind].map((row) => Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))); };
  const [p, q] = [lab(seen(a)), lab(seen(b))];
  return Math.hypot(...p.map((v, i) => v - q[i]));
};

// Both variants of every Standard Theme (#583): as designed, and the dark variant laid over it where there is one.
const VARIANTS = STANDARD_THEMES.flatMap((t) => [[t.name, t, t.tokens] as const, ...(t.tokens.dark ? [[`${t.name} (dark variant)`, t, { ...t.tokens, ...t.tokens.dark }] as const] : [])]);

describe.each(VARIANTS)("%s", (_n, t, k) => {
  it("keeps text and values readable on cards and behind them (WCAG AA, 4.5:1)", () => {
    for (const c of ["ink", "muted", "accent", "good", "bad"] as const) expect(contrast(k[c], k.surface), `${c} on cards`).toBeGreaterThanOrEqual(4.5);
    for (const c of ["ink", "muted"] as const) expect(contrast(k[c], k.canvas), `${c} behind cards`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(k.ink, k.band), "text on the target band").toBeGreaterThanOrEqual(4.5);
  });
  it("draws every data colour so it can be told from the card (3:1 for graphics)", () => {
    for (const c of k.data) expect(contrast(c, k.surface), c).toBeGreaterThanOrEqual(3);
  });
  it("keeps Good and Bad apart for red-green colour blindness", () => {
    expect(apart(k.good, k.bad, "deuteranopia")).toBeGreaterThanOrEqual(20);
    expect(apart(k.good, k.bad, "protanopia")).toBeGreaterThanOrEqual(10);
  });
  it("is a Theme Ziffr itself accepts, and a valid Theme file", () => {
    expect(cleanTokens(t.tokens)).toEqual(t.tokens);
    expect(cleanSlides(t.slides)).toEqual(t.slides);
    expect(checkThemeFileValue(themeToFile(t.name, t.tokens, t.slides)).ok).toBe(true);
  });
});

describe("the list", () => {
  it("has six Themes with different keys and names, found by key", () => {
    expect(STANDARD_THEMES.map((t) => t.name)).toEqual(["Ziffr Light", "Ziffr Dark", "Tokyo", "Paris", "Oslo", "Print"]);
    expect(new Set(STANDARD_THEMES.map((t) => t.key)).size).toBe(6);
    expect(standardTheme("tokyo")?.name).toBe("Tokyo");
    expect(standardTheme("nope")).toBeUndefined();
    expect(standardTheme({})).toBeUndefined();
  });
});

describe("a Theme as a file", () => {
  const t = STANDARD_THEMES[0];
  it("leaves out a name or footer that is not plain text, and any image", () => {
    const f = themeToFile("see evil.example/x", t.tokens, { ...t.slides, footer: "<b>x</b>", logo: "data:image/png;base64,AAAA", background_image: "data:image/png;base64,AAAA" });
    expect(f.name).toBe("Theme");
    expect(f.slides).not.toHaveProperty("footer");
    expect(JSON.stringify(f)).not.toContain("data:");
    expect(checkThemeFileValue(f).ok).toBe(true);
  });
  it("keeps the slide settings that are set, and works without any", () => {
    expect(themeToFile("A", t.tokens, { footer: "Board", logo_position: "top-left", logo_width: 90, title_size: 40, body_size: 20 }).slides).toEqual({ logoPosition: "top-left", logoWidth: 90, footer: "Board", showSlideNumber: false, titleSize: 40, bodySize: 20 });
    expect(themeToFile("A", t.tokens, null).slides).toEqual({ showSlideNumber: false });
  });
  it("names the download with letters, digits and dashes", () => {
    expect(themeFileText(themeToFile("Zürich: Q4 / Plan", t.tokens, null)).name).toBe("zurich-q4-plan.ziffr-theme.json");
    expect(themeFileText({ ...themeToFile("A", t.tokens, null), name: "???" }).name).toBe("theme.ziffr-theme.json");
    expect(JSON.parse(themeFileText(themeToFile("A", t.tokens, null)).text).format).toBe("ziffr.theme/1");
  });
});
