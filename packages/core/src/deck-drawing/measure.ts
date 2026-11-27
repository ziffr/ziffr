// How wide the words of a slide are (spec 0069; GLOSSARY: Slide), from the width tables of the deck's fonts, so the
// drawing can break a headline, size a column from what is in it and keep words inside their box, the same way in a
// browser, in a test and in a file. Kerning is left out, which errs on the side of room. Pure.
import { FONT_WIDTHS } from "./font-widths.generated";
import type { DeckFont, DeckFonts } from "./fonts";
import { keep, type Face } from "./objects";

/** The share of a box that words may fill: PowerPoint breaks lines itself. */
export const ROOM = 0.92;

/** How words are set. */
export type Setting = { size: number; face?: Face; bold?: boolean; caps?: boolean; track?: number };

/** Words and how they are set, as a table's cells are measured. */
export type Words = [words: string, setting: Setting];

type Table = { unitsPerEm: number; widths: Map<number, number> };
const tables = new Map<string, Table>();

/** A font's width table, unpacked once (see scripts/generate-deck-font-widths.mjs for the packing). */
function tableOf(font: DeckFont, bold: boolean): Table {
  const key = `${font} ${bold}`;
  let found = tables.get(key);
  if (found) return found;
  const source = FONT_WIDTHS[font];
  const widths = new Map<number, number>();
  for (const run of (bold ? source.bold : source.regular).split(";")) {
    const [start, list] = run.split(":") as [string, string];
    let code = parseInt(start, 36);
    for (const entry of list.split(",")) {
      const [width, times = 1] = entry.split("*").map(Number);
      for (let i = 0; i < times; i++) widths.set(code++, width!);
    }
  }
  tables.set(key, (found = { unitsPerEm: source.unitsPerEm, widths }));
  return found;
}

/** A character's width in em. One the font lacks is drawn by another font: an em is room enough, an emoji a little more. */
function advance(table: Table, code: number): number {
  const width = table.widths.get(code);
  if (width !== undefined) return width / table.unitsPerEm;
  return code >= 0x1f000 ? 1.4 : 1;
}

/** The words of a line, split where a line may break. A number and its unit are held together by a space that never breaks. */
const parts = (line: string) => keep(line).split(" ");

/** Measures words in a deck's fonts. */
export function createMeasure(fonts: DeckFonts) {
  const oneLine = (words: string, s: Setting): number => {
    const table = tableOf(fonts[s.face ?? "body"], s.bold === true);
    let em = 0;
    for (const c of s.caps ? words.toUpperCase() : words) em += advance(table, c.codePointAt(0)!) + (s.track ?? 0);
    return em * s.size;
  };
  /** Width in pixels of the widest line. */
  const width = (words: string, s: Setting): number => Math.max(...words.split("\n").map((line) => oneLine(line, s)));

  /** A word wider than a whole line, cut into pieces that fit. */
  const cut = (word: string, room: number, s: Setting): string[] => {
    const pieces: string[] = [];
    let piece = "";
    for (const c of word) {
      if (piece && oneLine(piece + c, s) > room) {
        pieces.push(piece);
        piece = c;
      } else piece += c;
    }
    return [...pieces, piece];
  };

  /** The lines the words take in a box of this width. */
  const wrap = (words: string, box: number, s: Setting): string[] => {
    const room = box * ROOM;
    return words.split("\n").flatMap((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of parts(paragraph)) {
        const longer = line ? `${line} ${word}` : word;
        if (oneLine(longer, s) <= room) {
          line = longer;
          continue;
        }
        if (line) lines.push(line);
        const pieces = oneLine(word, s) > room ? cut(word, room, s) : [word];
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1]!;
      }
      lines.push(line);
      // A last line never holds one word alone where the line above can spare one for it.
      if (lines.length > 1 && parts(line).length === 1) {
        const above = parts(lines[lines.length - 2]!);
        const longer = `${above[above.length - 1]} ${line}`;
        if (above.length > 2 && oneLine(longer, s) <= room) lines.splice(-2, 2, above.slice(0, -1).join(" "), longer);
      }
      return lines;
    });
  };

  /**
   * The words as they stand in a box of this width: their line breaks written in, so a browser and a file break them
   * alike, in at most this many lines, ending in … where some had to be left out.
   */
  const fit = (words: string, box: number, s: Setting, most: number): string => {
    const lines = wrap(words, box, s);
    if (lines.length <= most) return lines.join("\n");
    const kept = lines.slice(0, most);
    let last = kept[most - 1]!;
    while (last && oneLine(`${last}…`, s) > box * ROOM) last = last.slice(0, -1);
    kept[most - 1] = `${last.trimEnd()}…`;
    return kept.join("\n");
  };

  /**
   * A headline with its line break chosen: where it needs two lines, between lines of like length and never with one
   * word alone. The break is part of the drawing, so the screen and a file show the same one.
   */
  const balance = (headline: string, box: number, s: Setting): string => {
    if (oneLine(headline, s) <= box * ROOM) return headline;
    const words = parts(headline);
    let best: { text: string; score: number } | undefined;
    for (let k = 2; k <= words.length - 2; k++) {
      const first = words.slice(0, k).join(" ");
      const second = words.slice(k).join(" ");
      const longest = Math.max(oneLine(first, s), oneLine(second, s)) / box;
      if (longest > ROOM) continue;
      // A line should not end on a short word that belongs to what follows; the upper line may be the longer one; a
      // break after the end of a clause reads best.
      const dangling = /^(a|an|the|to|of|and|or|in|on|at|by|for|is|are|its|our)$/i.test(words[k - 1]!) ? 0.15 : 0;
      const topHeavy = oneLine(second, s) > oneLine(first, s) ? 0.01 : 0;
      const clause = /[;:,]$/.test(words[k - 1]!) ? -0.05 : 0;
      const score = longest + dangling + topHeavy + clause;
      if (!best || score < best.score) best = { text: `${first}\n${second}`, score };
    }
    return best?.text ?? wrap(headline, box, s).join("\n");
  };

  /** The width a column needs to hold each of these on one line, with room to spare. */
  const columnFor = (cells: Words[], padding: number): number => Math.ceil(Math.max(...cells.map(([words, s]) => width(words, s) / ROOM)) + padding);

  /**
   * Shares a width between two columns of running words: the split with the fewest lines in the worst cell, then the
   * fewest lines in all, then the nearest to an even split.
   */
  const share = (total: number, left: Words[], right: Words[], padding: number): [number, number] => {
    let best: { split: [number, number]; score: number } | undefined;
    for (let w = 80; w <= total - 80; w += 2) {
      const lines = [
        ...left.map(([words, s]) => wrap(words, w - padding, s).length),
        ...right.map(([words, s]) => wrap(words, total - w - padding, s).length),
      ];
      const score = Math.max(...lines) * 10000 + lines.reduce((x, y) => x + y, 0) * 100 + Math.abs(w - total / 2) / 10;
      if (!best || score < best.score) best = { split: [w, total - w], score };
    }
    return best?.split ?? [total / 2, total / 2];
  };

  return { fonts, width, wrap, fit, balance, columnFor, share };
}

/** Measures words in one deck's fonts. */
export type Measure = ReturnType<typeof createMeasure>;
