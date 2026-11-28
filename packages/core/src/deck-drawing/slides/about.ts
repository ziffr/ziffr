// The about slide, About these slides (spec 0069; GLOSSARY: Slide Type, Metric, Period): that Ziffr made the slides,
// when, what a change to a file does, and for each Metric the other slides show what kind of source its numbers come
// from, its latest period and a link to it. Visibility: it names only Metrics the viewer sees on the other slides, and
// no person, Feed or email address. The only links are Ziffr's own, built from the configured address and the Metric,
// each asking for sign-in; through a View Link there is no address and so no link. Pure.
import type { CanvasData, Metric } from "../../types";
import type { Measure } from "../measure";
import type { Region, SlideType } from "../slide-type";
import { latestPoint, nameOf, periodWords } from "./listed";
import { FOOT, pagesOf, rowsShown, tableCell } from "./rows";

/** One Metric's row. `href` is null where the slides carry no links. */
export type AboutRow = { name: string; kind: string; latest: string; href: string | null };

/** What an about slide shows. The words stand on the first slide only; `rows` are this slide's, from `from` of `of`. */
export type AboutContent = { words: string[]; rows: AboutRow[]; from: number; of: number };

const HEAD = 36;
const ROW = 38;
const SIZE = 14;
const KIND = 250;
const LATEST = 150;
const LINK = 120;

/** Where a Metric's numbers come from, as a kind and never by name. */
function kindOf(metric: Metric) {
  if (metric.formula || metric.total) return "Calculated";
  if (!metric.sources.includes("api")) return "Typed in";
  return metric.sources.length === 1 ? "From a connected system" : "Typed in or from a connected system";
}

/** One Metric's row. */
function rowOf(metric: Metric, data: CanvasData, address: string | null): AboutRow {
  const point = latestPoint(metric, data);
  return {
    name: nameOf(metric),
    kind: kindOf(metric),
    latest: point ? periodWords(metric, data, point.period) : "No value yet",
    href: address ? `${address}/metrics/${encodeURIComponent(metric.slug)}` : null,
  };
}

/** The height of the words over the table; nothing where there are none. */
const wordsHeight = (measure: Measure, words: string[], w: number) =>
  words.length ? words.reduce((sum, p) => sum + Math.ceil(measure.wrap(p, w, { size: SIZE }).length * SIZE * 1.35) + 4, 16) : 0;

/** The words, and the table of this slide's Metrics under them. */
function draw(content: AboutContent, { x, y, w, pen, measure }: Region) {
  const above = wordsHeight(measure, content.words, w);
  const text = above ? [pen.text({ x, y, w, h: above - 12 }, content.words, { size: SIZE, line: 1.35 })] : [];
  if (!content.rows.length) return text;
  const links = content.rows.some((r) => r.href);
  const rest = links ? [KIND, LATEST, LINK] : [KIND, LATEST];
  const cols = [w - rest.reduce((a, b) => a + b, 0), ...rest];
  const headings = ["Metric", "Where it comes from", "Latest period", "Link"].slice(0, cols.length);
  const rows = content.rows.map((row) => {
    const cells = [row.name, row.kind, row.latest].map((words, i) => tableCell(measure, words, cols[i]!));
    if (!links) return { h: ROW, cells };
    const link = tableCell(measure, "Open in Ziffr", cols[3]!);
    const run = link.body.paras[0]?.runs[0];
    if (run && row.href) run.href = row.href;
    return { h: ROW, cells: [...cells, link] };
  });
  const head = { h: HEAD, header: true, cells: headings.map((words, i) => tableCell(measure, words, cols[i]!, { header: true })) };
  return [
    ...text,
    pen.table(x, y + above, cols, [head, ...rows], "Where each number comes from"),
    ...rowsShown(pen, { x, y: y + above + HEAD + rows.length * ROW + 4, w }, content.from, rows.length, content.of),
  ];
}

/** About these slides. */
export const about: SlideType<AboutContent> = {
  id: "about",
  section: "About",
  agenda: false,
  wide: true,
  /** What the slides are, and a row for each Metric the other shown slides list. */
  fill(_slide, data, deck) {
    const metrics = deck.listed.flatMap((id) => data.metrics.find((m) => m.id === id) ?? []);
    const rows = metrics.map((m) => rowOf(m, data, deck.address));
    const where = deck.address ? "Where each number comes from is listed below, with a link that asks you to sign in." : "Where each number comes from is listed below.";
    const words = [
      `Ziffr made these slides. They show the numbers as of ${deck.date}.`,
      "Changes made in a downloaded file stay in the file and do not go back to Ziffr. Creating the slides again makes a new file with current numbers: Ziffr never overwrites a file you may have edited, and your changes are not carried over.",
      `Charts are drawn as shapes, so numbers are changed in Ziffr.${rows.length ? ` ${where}` : ""}`,
    ];
    return { headline: "About these slides", source: "Ziffr", content: { words, rows, from: 1, of: rows.length } };
  },
  /** The words and as many rows as fit under them, then rows alone. */
  pages(content, region) {
    if (!content.rows.length) return [content];
    const above = wordsHeight(region.measure, content.words, region.w);
    let from = content.from;
    return pagesOf(content.rows, () => ROW, (page) => region.h - HEAD - FOOT - (page ? 0 : above)).map((rows, page) => {
      const piece = { ...content, words: page ? [] : content.words, rows, from };
      from += rows.length;
      return piece;
    });
  },
  draw,
};
