// Tables of a slide (spec 0069; GLOSSARY: Slide): one way a cell is set, how wide a column of figures is, which rows
// go on which slide, and the words that say so. Shared by the slide types that draw a table. Pure.
import type { Measure } from "../measure";
import { textBody, type Cell, type Obj, type Pen } from "../objects";
import type { Role } from "../theme";

/** A cell's room, left and right of its words together. */
const PADDING = 16;
/** The height of the line under a table that goes on. */
export const FOOT = 24;

type CellLook = { header?: boolean; right?: boolean; fill?: Role; lines?: number };

/** A cell of words in a column this wide: at most two lines, unless said, over a thin rule. */
export function tableCell(measure: Measure, words: string, width: number, { header = false, right = false, fill, lines = 2 }: CellLook = {}): Cell {
  const size = header ? 12 : 13;
  return {
    body: textBody([measure.fit(words, width - PADDING, { size, bold: header }, lines)], {
      size,
      bold: header,
      color: header ? "muted" : "ink",
      align: right ? "right" : "left",
      valign: "middle",
      inset: [8, 2, 8, 2],
      line: 1.2,
    }),
    borderBottom: { color: header ? "ink" : "rule", width: 1 },
    ...(fill ? { fill } : {}),
  };
}

/** The width of a column of figures: what its widest one needs, within these bounds. */
export function figureColumn(measure: Measure, figures: string[], least: number, most: number): number {
  const widest = measure.columnFor(
    figures.map((words): [string, { size: number }] => [words, { size: 13 }]),
    PADDING + 4,
  );
  return Math.min(most, Math.max(least, widest));
}

/** Rows of these heights shared out over as many slides as they take, in order; a slide holds at least one. */
export function pagesOf<Row>(rows: Row[], height: (row: Row) => number, room: (page: number) => number): Row[][] {
  const pages: Row[][] = [];
  let used = 0;
  for (const row of rows) {
    const h = height(row);
    const page = pages.at(-1);
    if (page && used + h <= room(pages.length - 1)) {
      page.push(row);
      used += h;
    } else {
      pages.push([row]);
      used = h;
    }
  }
  return pages;
}

/** Under a table that goes on over several slides, which of its rows these are; nothing under a whole one. */
export function rowsShown(pen: Pen, at: { x: number; y: number; w: number }, from: number, count: number, of: number): Obj[] {
  if (of <= count) return [];
  const words = count === 1 ? `Row ${from} of ${of}` : `Rows ${from} to ${from + count - 1} of ${of}`;
  return [pen.text({ ...at, h: 18 }, [words], { size: 12, color: "muted" })];
}
