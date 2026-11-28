import { describe, expect, it } from "vitest";

import { deckFonts, DECK_FONT_FAMILIES, type DeckFont } from "./fonts";
import { createMeasure, ROOM } from "./measure";

const arial = createMeasure({ head: "arial", body: "arial" });
const at14 = { size: 14 };

describe("the fonts a deck is drawn in", () => {
  it("are the Theme's own where Ziffr has their widths, and Arial where it has none", () => {
    expect(deckFonts({ fontHeading: "playfair", fontBody: "inter" })).toEqual({ head: "playfair", body: "inter" });
    expect(deckFonts({ fontHeading: "general-sans", fontBody: "general-sans" })).toEqual({ head: "arial", body: "arial" });
  });

  it("are Georgia for serifs and Arial for the rest in the set any computer has", () => {
    expect(deckFonts({ fontHeading: "source-serif", fontBody: "geist-mono" }, "office")).toEqual({ head: "georgia", body: "arial" });
  });

  it("each have a width for every letter, figure and the signs figures are written with", () => {
    for (const font of Object.keys(DECK_FONT_FAMILIES) as DeckFont[]) {
      const measure = createMeasure({ head: font, body: font });
      for (const c of "ABCxyzÄß0123456789 .,%€−+×") {
        // A character without a width is measured as exactly one em.
        expect(measure.width(c, { size: 100 }), `${font} ${c}`).not.toBe(100);
      }
    }
  });
});

describe("measuring words", () => {
  it("knows Arial's widths: a figure is 0.556 em, bold words are wider", () => {
    expect(arial.width("0", { size: 1000 })).toBeCloseTo(556.15, 1);
    expect(arial.width("Revenue", { ...at14, bold: true })).toBeGreaterThan(arial.width("Revenue", at14));
    expect(arial.width("Revenue", { ...at14, caps: true, track: 0.1 })).toBeGreaterThan(arial.width("REVENUE", at14));
    expect(arial.width("a\nlonger line", at14)).toBe(arial.width("longer line", at14));
  });

  it("gives a character the font lacks an em, and an emoji more", () => {
    expect(arial.width("中", { size: 10 })).toBe(10);
    expect(arial.width("🚀", { size: 10 })).toBe(14);
  });

  it("breaks lines inside the room a box has, never parting a number from its unit", () => {
    const lines = arial.wrap("Revenue reached 12.4 M€ in the third quarter and held there", 160, at14);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(arial.width(line, at14)).toBeLessThanOrEqual(160 * ROOM);
    expect(lines.some((line) => line.includes("12.4 M€"))).toBe(true);
  });

  it("cuts a word that is wider than a line, and keeps line breaks that are there", () => {
    const lines = arial.wrap("Donaudampfschifffahrtsgesellschaftskapitän", 80, at14);
    expect(lines.join("")).toBe("Donaudampfschifffahrtsgesellschaftskapitän");
    expect(lines.length).toBeGreaterThan(2);
    expect(arial.wrap("one\ntwo", 500, at14)).toEqual(["one", "two"]);
  });

  it("leaves no word alone on a last line where the line above can spare one", () => {
    const words = "alpha bravo charlie delta echo";
    const room = arial.width("alpha bravo charlie delta", at14) / ROOM + 1;
    expect(arial.wrap(words, room, at14)).toEqual(["alpha bravo charlie", "delta echo"]);
  });

  it("writes the breaks in, and ends in … where words had to be left out", () => {
    const words = "a long run of words that cannot possibly fit into two short lines of this narrow box";
    const fitted = arial.fit(words, 120, at14, 2).split("\n");
    expect(fitted).toHaveLength(2);
    expect(fitted[1]!.endsWith("…")).toBe(true);
    expect(arial.width(fitted[1]!, at14)).toBeLessThanOrEqual(120 * ROOM);
    expect(arial.fit("short", 120, at14, 2)).toBe("short");
  });

  it("balances a headline: two lines of like length, not ending on a small word", () => {
    const head = { size: 26, face: "head" as const, bold: true };
    const [first, second] = arial.balance("Revenue reached 12.4 M€ in the third quarter, 3 % above its target", 808, head).split("\n");
    expect(second).toBeDefined();
    expect(first).not.toMatch(/ (the|in|its)$/);
    expect(arial.balance("Short", 808, head)).toBe("Short");
  });

  it("sizes a column from what is in it, and shares a width so the worst cell is shortest", () => {
    expect(arial.columnFor([["Latest", at14], ["12,345.00", at14]], 16)).toBeGreaterThan(arial.width("12,345.00", at14) + 16);
    const [left, right] = arial.share(600, [["Short", at14]], [["A much longer explanation of what is behind this figure and why it moved", at14]], 16);
    expect(left + right).toBe(600);
    expect(right).toBeGreaterThan(left);
  });
});
