import { describe, expect, it } from "vitest";

import { STANDARD_THEMES } from "../standard-themes";
import { contrastRatio } from "../theme-look";
import type { ThemeTokens } from "../types";
import { deckSlots, hexOf, paintOf, roleColours, ROLES } from "./theme";

const light = STANDARD_THEMES.find((t) => t.key === "ziffr-light")!.tokens;
/** A Theme with colours too faint to read. */
const faint: ThemeTokens = { ...light, canvas: "#FFFFFF", muted: "#C4C8CE", accent: "#FFE45C", good: "#7BE0A0", bad: "#FFB3A0", ink: "#8A8F99", cover: "#8C8F94" };

/** The pairs of a role that carries words and the ground it stands on. */
const PAIRS = [
  ["ink", "surface"], ["muted", "surface"], ["accent", "surface"], ["good", "surface"], ["bad", "surface"], ["onaccent", "accent"],
  ["covertext", "cover"], ["coveraccent", "cover"], ["paneltext", "panel"], ["panelmark", "panel"], ["ink", "accentsoft"], ["bad", "badsoft"],
] as const;

describe("a deck's colours", () => {
  it.each([...STANDARD_THEMES.map((t) => [t.name, t.tokens] as const), ["a faint Theme", faint] as const])("can be read in %s, loud and quiet", (_name, tokens) => {
    for (const emphasis of ["strong", "quiet"] as const) {
      const colours = roleColours(deckSlots(tokens), emphasis);
      for (const [words, ground] of PAIRS) {
        expect(contrastRatio(colours[words], colours[ground]), `${emphasis}: ${words} on ${ground}`).toBeGreaterThanOrEqual(4.4);
      }
    }
  });

  it("are the Theme's own where they read", () => {
    const slots = deckSlots(light);
    expect(slots).toMatchObject({ lt1: "#FFFFFF", dk1: light.ink, accent1: light.accent, accent6: light.rule });
  });

  it("name a place in a PowerPoint theme for every role, pale ones as colour changes of it", () => {
    const slots = deckSlots(light);
    for (const role of ROLES) expect(slots[paintOf(slots, role, "strong").slot]).toMatch(/^#[0-9A-F]{6}$/);
    expect(paintOf(slots, "accentsoft", "strong")).toMatchObject({ slot: "accent1", lumMod: 0.12 });
    expect(hexOf(slots, "accent", "strong")).toBe(slots.accent1);
    // A pale role is light on a light Theme.
    expect(contrastRatio(hexOf(slots, "accentsoft", "strong"), slots.lt1)).toBeLessThan(1.5);
  });

  it("show the quiet panel against the slide even where the Theme's ground is the card's colour", () => {
    const print = STANDARD_THEMES.find((t) => t.key === "print")!.tokens;
    const colours = roleColours(deckSlots(print), "quiet");
    expect(colours.panel).not.toBe(colours.surface);
  });
});
