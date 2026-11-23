// @ts-nocheck
// The dark variant of a Theme (#583): every Standard Theme's variant keeps WCAG AA, a derived one does too (or falls
// back to the designed default), and the Appearance setting decides which colours a viewer gets.
import { describe, expect, it } from "vitest";
import { STANDARD_THEMES } from "./standard-themes";
import { cleanTokens } from "./theme-tokens";
import { DEFAULT_DARK, cleanDark, darkOf, darkProblems, followsAppearance, tokensForViewer } from "./theme-dark";
import { contrastRatio } from "./theme-look";
import { themeVars } from "./themes";
import type { ThemeTokens } from "./types";

const base = STANDARD_THEMES[0].tokens;
const without = (t: ThemeTokens): ThemeTokens => { const o = { ...t }; delete o.dark; return o; };

describe.each(STANDARD_THEMES.map((t) => [t.name, t] as const))("%s in both variants", (_n, t) => {
  const dark = darkOf(t.tokens);
  it("is dark already, or has a designed dark variant", () => {
    if (t.tokens.dark) expect(dark?.source).toBe("designed");
    else expect(dark).toBeNull();
  });
  it("keeps text and values readable in the dark variant (WCAG AA 4.5:1; data colours 3:1)", () => {
    const c = dark?.colours ?? t.tokens;
    expect(darkProblems(c)).toEqual([]);
  });
  it("is a valid Theme as stored, dark variant included", () => {
    expect(cleanTokens(t.tokens)).toEqual(t.tokens);
  });
  it("derives a variant of its own colours that passes too, or falls back to the default", () => {
    const derived = darkOf(without(t.tokens));
    if (derived) expect(darkProblems(derived.colours)).toEqual([]);
  });
});

describe("the dark variant", () => {
  it("is designed for the light Standard Themes and absent for the dark ones", () => {
    expect(STANDARD_THEMES.filter((t) => t.tokens.dark).map((t) => t.key)).toEqual(["ziffr-light", "paris", "oslo", "print"]);
  });
  it("is derived from the colours of a Theme without one, in its own hue, never inverted", () => {
    const warm: ThemeTokens = { ...without(base), canvas: "#F0EBE7", surface: "#FDFBF8", ink: "#221B19", muted: "#615955", rule: "#D9D3CF", accent: "#BB3D31", data: ["#312926", "#8C7B6E", "#C7BFBA", "#5E7C6B"], good: "#21763C", bad: "#BE2323", band: "#E8E1DD" };
    const d = darkOf(warm)!;
    expect(d.source).toBe("derived");
    expect(darkProblems(d.colours)).toEqual([]);
    expect(contrastRatio(d.colours.surface, "#000000")).toBeLessThan(2);
    expect(contrastRatio(d.colours.ink, d.colours.canvas)).toBeGreaterThan(10);
  });
  it("is the designed default when nothing can be derived from the colours (more data colours than a Theme holds)", () => {
    const d = darkOf({ ...without(base), data: Array(7).fill("#336699") })!;
    expect(d.source).toBe("default");
    expect(d.colours).toEqual(DEFAULT_DARK);
    expect(darkProblems({ ...DEFAULT_DARK, canvas: "x" })).toEqual([expect.stringContaining("six-digit")]);
  });
  it("ignores an own variant that is not valid or does not read, and derives instead", () => {
    const bad = { ...base, dark: { ...DEFAULT_DARK, ink: "#222833" } };
    expect(darkOf(bad)!.source).not.toBe("designed");
    expect(darkOf({ ...base, dark: { nope: 1 } as never })!.source).toBe("derived");
  });
  it("has none for a Theme that is dark already", () => {
    expect(darkOf(STANDARD_THEMES[1].tokens)).toBeNull();
  });
  it("cleans colours: capitals, six hex digits, at most six data colours", () => {
    expect(cleanDark({ ...DEFAULT_DARK, canvas: "#0e1014" })?.canvas).toBe("#0E1014");
    expect(cleanDark(null)).toBeNull();
    expect(cleanDark("x")).toBeNull();
    expect(cleanDark({ ...DEFAULT_DARK, ink: "red" })).toBeNull();
    expect(cleanDark({ ...DEFAULT_DARK, data: [] })).toBeNull();
    expect(cleanDark({ ...DEFAULT_DARK, data: Array(7).fill("#000000") })).toBeNull();
    expect(cleanDark({ ...DEFAULT_DARK, data: ["#12"] })).toBeNull();
    expect(cleanDark({ ...DEFAULT_DARK, data: "x" })).toBeNull();
  });
});

describe("the Appearance setting", () => {
  it("follows by default and when the Theme says so, and is fixed only when it says so", () => {
    expect(followsAppearance(base)).toBe(true);
    expect(followsAppearance({ ...base, appearance: "follow" })).toBe(true);
    expect(followsAppearance({ ...base, appearance: "fixed" })).toBe(false);
  });
  it("is kept by the Theme checks, and dropped for anything but fixed", () => {
    expect(cleanTokens({ ...base, appearance: "fixed" })?.appearance).toBe("fixed");
    expect(cleanTokens({ ...base, appearance: "follow" })).not.toHaveProperty("appearance");
    expect(cleanTokens({ ...base, appearance: "x" as never })).not.toHaveProperty("appearance");
    expect(cleanTokens({ ...base, dark: { ...DEFAULT_DARK, ink: "nope" } })).not.toHaveProperty("dark");
  });
  it("gives a dark viewer the dark colours, a light viewer or a fixed Theme the designed ones", () => {
    expect(tokensForViewer(base, true).surface).toBe(base.dark!.surface);
    expect(tokensForViewer(base, false)).toBe(base);
    expect(tokensForViewer({ ...base, appearance: "fixed" }, true).surface).toBe(base.surface);
    expect(tokensForViewer(STANDARD_THEMES[1].tokens, true).surface).toBe(STANDARD_THEMES[1].tokens.surface);
  });
  it("draws every colour as light-dark(designed, dark) when given the dark variant, and plainly without", () => {
    const v = themeVars(base, base.dark!);
    expect(v["--color-desk"]).toBe(`light-dark(${base.canvas}, ${base.dark!.canvas})`);
    expect(v["--color-data"]).toBe(`light-dark(${base.data[0]}, ${base.dark!.data[0]})`);
    expect(v.color).toContain("light-dark(");
    expect(JSON.stringify(themeVars(base))).not.toContain("light-dark");
  });
  it("copes with a dark variant that has fewer data colours than the Theme", () => {
    const v = themeVars(base, { ...base.dark!, data: ["#FFFFFF"] });
    expect(v["--color-data-4"]).toContain("#FFFFFF");
  });
});
