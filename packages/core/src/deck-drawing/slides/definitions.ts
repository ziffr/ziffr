// The definitions slide (spec 0069; GLOSSARY: Slide Type, Metric, Calculation Note): each Metric the slide lists, what
// it is and how it is calculated. Rows that do not fit go on to another slide. Visibility: only the slide's listed
// Metrics are read, and a formula is never written out, as it names other Metrics; through a View Link the data carries
// no description and no Calculation Note, so none is shown. Pure.
import type { Measure } from "../measure";
import type { Metric } from "../../types";
import type { Region, SlideType } from "../slide-type";
import { listedData, nameOf, NOT_THERE, sourceOf } from "./listed";
import { FOOT, pagesOf, rowsShown } from "./rows";

/** One Metric's row. */
export type Definition = { name: string; description: string; calculated: string };

/** What a definitions slide shows. `rows` are those of this slide, from row `from` of `of`. */
export type DefinitionsContent = { rows: Definition[]; from: number; of: number };

const HEAD = 32;
const NAME = 220;
const GAP = 24;
const SIZE = 13;
/** The most lines one column of a row takes, so that one row always fits a slide. */
const MOST = 10;
const REST = "The rest is in Ziffr.";
const HEADINGS = ["Metric", "What it is", "How it is calculated"];

/** How a Metric is calculated, in the words written for it or, without any, what Ziffr itself knows. */
function howCalculated(metric: Metric) {
  const written = metric.calculation_note?.trim();
  if (written) return written;
  if (metric.total) return "Total of other Metrics.";
  return metric.formula ? "Calculated from a formula." : "No calculation described.";
}

/** The three columns: the name, and two of words, which share what the name leaves. */
function columns(x: number, w: number) {
  const each = (w - NAME - 2 * GAP) / 2;
  return [
    { x, w: NAME },
    { x: x + NAME + GAP, w: each },
    { x: x + NAME + 2 * GAP + each, w: each },
  ];
}

/** Words broken into the lines of a column, cut to what a row holds, saying where the rest is. */
function held(measure: Measure, words: string, width: number, bold: boolean) {
  const lines = measure.wrap(words.replace(/\s+/g, " ").trim(), width, { size: SIZE, bold });
  return lines.length <= MOST ? lines : [...lines.slice(0, MOST - 1), REST];
}

/** A row's words as they are written, and the height they need. */
function set({ x, w, measure }: Region, row: Definition) {
  const cells = [row.name, row.description, row.calculated].map((words, i) => held(measure, words, columns(x, w)[i]!.w, i === 0));
  const tall = Math.ceil(Math.max(...cells.map((lines) => lines.length)) * SIZE * 1.35);
  return { cells, tall, height: tall + 18 };
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
  /** The headings, each Metric over a rule and, where it goes on, which rows these are. */
  draw(content, region) {
    const { x, y, w, pen } = region;
    const cols = columns(x, w);
    const head = HEADINGS.map((words, i) => pen.text({ ...cols[i]!, y, h: 18 }, [words], { size: 12, bold: true, color: "muted" }));
    let top = y + HEAD;
    const rows = content.rows.flatMap((row) => {
      const { cells, tall, height } = set(region, row);
      const objects = [
        pen.rect({ x, y: top - 6, w, h: 1 }, "rule"),
        ...cells.map((lines, i) => pen.text({ ...cols[i]!, y: top + 2, h: tall }, [lines.join("\n")], { size: SIZE, bold: i === 0, line: 1.35 })),
      ];
      top += height;
      return objects;
    });
    return [...head, ...rows, ...rowsShown(pen, { x, y: top, w }, content.from, content.rows.length, content.of)];
  },
};
