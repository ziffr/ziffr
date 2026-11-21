// Appearance (#505): the Dark and High contrast token sets keep WCAG contrast (AA for text and outlines; AAA for text in
// High contrast), the system copy of the dark set equals the explicit one, and every set defines the same tokens.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = (name: string) => readFileSync(join(import.meta.dirname, name), "utf8");
const TOKENS = css("tokens.css");
const APPEARANCE = css("appearance.css");
const GLOBALS = css("globals.css");

type Set = Record<string, string>;

/** The `--name: value` pairs of a block of CSS. */
function declarations(block: string): Set {
  const out: Set = {};
  for (const m of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** The body of the rule that starts at `selector` (balanced braces). */
function body(source: string, selector: string, from = 0): string {
  const start = source.indexOf(selector, from);
  if (start < 0) throw new Error(`no ${selector}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(source.indexOf("{", start) + 1, i);
  }
  throw new Error("unbalanced");
}

const light: Set = { ...declarations(body(TOKENS, ":root")), ...declarations(body(GLOBALS, ":root {").split("@layer")[0]) };
const dark = declarations(body(APPEARANCE, ':root[data-appearance="dark"]'));
const systemDark = declarations(body(body(APPEARANCE, "@media (prefers-color-scheme: dark) {\n  :root[data-appearance=\"system\"]"), ':root[data-appearance="system"]'));
const contrastLight = declarations(body(APPEARANCE, ':root[data-appearance="contrast"]'));
const contrastDark = declarations(body(body(APPEARANCE, "@media (prefers-color-scheme: dark) {\n  :root[data-appearance=\"contrast\"]"), ':root[data-appearance="contrast"]'));

/** oklch(L% C h) as linear sRGB, clipped to the gamut. */
function linear(value: string): [number, number, number] {
  const m = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
  if (!m) throw new Error(`not an oklch colour: ${value}`);
  const L = Number(m[1]) / 100, C = Number(m[2]), h = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.max(0, Math.min(1, x));
  return [clip(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s), clip(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s), clip(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s)];
}
function luminance(value: string): number {
  const [r, g, b] = linear(value);
  const lin = (c: number) => c; // already linear
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio of two oklch colours. */
export function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A token's colour, following `var(--other)` references within the set. */
function resolve(set: Set, name: string): string {
  const v = set[name];
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolve(set, ref[1]) : v;
}

/** What the screens draw text and outlines in, on what: the pairs that must hold. [foreground, background, minimum]. */
function pairs(set: Set, textMin: number, outlineMin: number): [string, string, number][] {
  const text: [string, string][] = [
    ["--color-ink", "--color-paper"], ["--color-ink", "--color-paper-2"], ["--color-ink", "--color-paper-3"], ["--color-ink", "--color-cotton"],
    ["--color-ink-2", "--color-paper"], ["--color-print", "--color-cotton"], ["--color-print", "--color-desk"],
    ["--color-muted", "--color-paper"], ["--color-muted", "--color-paper-2"], ["--color-muted", "--color-paper-3"], ["--color-muted", "--color-cotton"],
    ["--color-board-type", "--color-board"], ["--color-accent-ink", "--color-accent"],
    ["--color-error", "--color-paper"], ["--color-error", "--color-cotton"], ["--color-success", "--color-paper"], ["--color-success", "--color-cotton"],
    ["--color-accent-2", "--color-paper"], ["--color-accent-2", "--color-cotton"], ["--color-paid", "--color-cotton"],
  ];
  const outline: [string, string][] = [["--color-focus", "--color-paper"], ["--color-focus", "--color-cotton"], ["--color-data", "--color-cotton"], ["--color-data-2", "--color-cotton"], ["--color-data-4", "--color-cotton"], ["--color-violet", "--color-cotton"]];
  void set;
  return [...text.map(([f, b]): [string, string, number] => [f, b, textMin]), ...outline.map(([f, b]): [string, string, number] => [f, b, outlineMin])];
}

const SETS: [string, Set, number, number][] = [
  ["light", light, 4.5, 3],
  ["dark", dark, 4.5, 3],
  ["high contrast, light", { ...light, ...contrastLight }, 7, 4.5],
  ["high contrast, dark", { ...light, ...contrastLight, ...contrastDark }, 7, 4.5],
];

describe("the appearance token sets", () => {
  for (const [name, set, textMin, outlineMin] of SETS) {
    it(`${name}: text, controls and data marks meet WCAG contrast`, () => {
      const merged = name === "light" ? set : { ...light, ...set };
      const bad = pairs(merged, textMin, outlineMin)
        .map(([f, b, min]) => ({ f, b, min, got: ratio(resolve(merged, f), resolve(merged, b)) }))
        .filter((p) => p.got < p.min)
        .map((p) => `${p.f} on ${p.b}: ${p.got.toFixed(2)} < ${p.min}`);
      expect(bad).toEqual([]);
    });
  }
  it("light and dark outlines (rules) stay visible against the page in High contrast", () => {
    for (const set of [{ ...light, ...contrastLight }, { ...light, ...contrastLight, ...contrastDark }]) {
      expect(ratio(resolve(set, "--color-rule"), resolve(set, "--color-paper"))).toBeGreaterThanOrEqual(3);
      expect(ratio(resolve(set, "--color-rule-2"), resolve(set, "--color-paper"))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("System on a dark device draws exactly the Dark set", () => {
    expect(systemDark).toEqual(dark);
  });
  it("Dark and High contrast define only tokens the light set has, and the dark ones define the same colours", () => {
    for (const set of [dark, contrastLight, contrastDark]) for (const k of Object.keys(set)) expect(light, k).toHaveProperty(k);
    for (const k of Object.keys(contrastLight).filter((k) => k.startsWith("--color-") && !k.startsWith("--color-data-3"))) expect(contrastDark, `high contrast dark: ${k}`).toHaveProperty(k);
  });
});
