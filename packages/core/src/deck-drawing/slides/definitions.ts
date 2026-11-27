// The definitions slide (spec 0069; GLOSSARY: Slide Type, Metric, Calculation Note): each Metric the slide lists, what
// it is and how it is calculated. Rows that do not fit go on to another slide. Visibility: only the slide's listed
// Metrics are read, and a formula is never written out, as it names other Metrics; through a View Link the data carries
// no description and no Calculation Note, so none is shown. Pure.
import type { Measure } from "../measure";
import type { Metric } from "../../types";
import type { Region, SlideType } from "../slide-type";
import { listedData, nameOf, NOT_THERE, sourceOf } from "./listed";
import { FOOT, pagesOf, rowsShown, tableCell } from "./rows";

/** One Metric's row. */
export type Definition = { name: string; description: string; calculated: string };

/** What a definitions slide shows. `rows` are those of this slide, from row `from` of `of`. */
export type DefinitionsContent = { rows: Definition[]; from: number; of: number };

const HEAD = 36;
const NAME = 220;
const SIZE = 13;
/** The most lines one cell takes, so that one row always fits a slide. */
const MOST = 10;
const REST = "The rest is in Ziffr.";

/** How a Metric is calculated, in the words written for it or, without any, what Ziffr itself knows. */
function howCalculated(metric: Metric) {
  const written = metric.calculation_note?.trim();
  if (written) return written;
  if (metric.total) return "Total of other Metrics.";
  return metric.formula ? "Calculated from a formula." : "No calculation described.";
}

/** The two columns of words, which share what the name leaves. */
const columns = (w: number) => [NAME, (w - NAME) / 2, (w - NAME) / 2];

/** The lines a cell's words take. */
const linesOf = (measure: Measure, words: string, width: number) => measure.wrap(words, width - 16, { size: SIZE });

/** Words cut to what a cell holds, saying where the rest is. */
function held(measure: Measure, words: string, width: number) {
  const plain = words.replace(/\s+/g, " ").trim();
  const lines = linesOf(measure, plain, width);
  return lines.length <= MOST ? plain : `${lines.slice(0, MOST - 2).join(" ")} ${REST}`;
}

/** A row's cells as they are written, and the height they need. */
function set({ w, measure }: Region, row: Definition) {
  const words = [row.name, row.description, row.calculated].map((text, i) => held(measure, text, columns(w)[i]!));
  const lines = Math.max(...words.map((text, i) => Math.min(MOST, linesOf(measure, text, columns(w)[i]!).length)));
  return { words, height: Math.max(36, Math.ceil(lines * SIZE * 1.2) + 14) };
}

/** The definitions. */
export const definitions: SlideType<DefinitionsContent> = {
  id: "definitions",
  section: "Definitions",
  agenda: false,
  wide: true,
  /** A row for each listed Metric. */
  fill(slide, data) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const { metrics } = listed;
    const rows = metrics.map((m) => ({ name: nameOf(m), description: m.description?.trim() || "No description.", calculated: howCalculated(m) }));
    const headline = metrics.length === 1 ? `How ${nameOf(metrics[0]!)} is calculated` : "What each Metric is and how it is calculated";
    return { headline, source: sourceOf(metrics), content: { rows, from: 1, of: rows.length } };
  },
  /** As many rows to a slide as the region holds, each as high as its words. */
  pages(content, region) {
    let from = content.from;
    return pagesOf(content.rows, (row) => set(region, row).height, () => region.h - HEAD - FOOT).map((rows) => {
      const page = { ...content, rows, from };
      from += rows.length;
      return page;
    });
  },
  /** The table and, where it goes on, which rows these are. */
  draw(content, region) {
    const { x, y, w, pen, measure } = region;
    const cols = columns(w);
    const rows = content.rows.map((row) => set(region, row));
    const table = pen.table(
      x,
      y,
      cols,
      [
        { h: HEAD, header: true, cells: ["Metric", "What it is", "How it is calculated"].map((words, i) => tableCell(measure, words, cols[i]!, { header: true })) },
        ...rows.map((row) => ({ h: row.height, cells: row.words.map((words, i) => tableCell(measure, words, cols[i]!, { lines: MOST })) })),
      ],
      "What each Metric is and how it is calculated",
    );
    const under = y + HEAD + rows.reduce((sum, row) => sum + row.height, 0) + 4;
    return [table, ...rowsShown(pen, { x, y: under, w }, content.from, content.rows.length, content.of)];
  },
};
