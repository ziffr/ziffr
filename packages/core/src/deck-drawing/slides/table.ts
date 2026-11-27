// The table slide (spec 0069; GLOSSARY: Slide Type, Metric, Target): one row for each Metric the slide lists, with its
// latest value, the one before, the change, whether it is on target and its trend. Rows that do not fit go on to
// another slide. Visibility: only the slide's listed Metrics are read. Pure.
import type { Obj, Row } from "../objects";
import type { Region, SlideType } from "../slide-type";
import { figureOf, historyOf, onTargetWords, periodCount, type Figure } from "./figures";
import { headlineOf, subjectOf } from "./headlines";
import { listedData, NOT_THERE, sourceOf } from "./listed";
import { FOOT, figureColumn, rowsShown, tableCell } from "./rows";

/** One Metric's row: its figures and the values its trend is drawn from. */
export type TableRow = Figure & { trend: (number | null)[] };

/** What a table slide shows. `rows` are those of this slide, from row `from` of `of`. */
export type TableContent = { rows: TableRow[]; from: number; of: number };

const HEAD = 40;
const ROW = 52;
const TREND = 132;
const HEADINGS = ["Metric", "Latest", "Before", "Change", "On target", "Trend"];

/** The rows of a table, as many to a slide as the region holds. */
const perSlide = (region: Region) => Math.max(1, Math.floor((region.h - HEAD - FOOT) / ROW));

/** A row's trend as a line with its newest value marked; a period without a value leaves a gap. */
function sparkline({ pen }: Region, values: (number | null)[], box: { x: number; y: number; w: number; h: number }): Obj[] {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return [];
  const [low, high] = [Math.min(...known), Math.max(...known)];
  const at = (v: number, i: number): [number, number] => [box.x + (box.w * i) / (values.length - 1), high > low ? box.y + box.h - ((v - low) / (high - low)) * box.h : box.y + box.h / 2];
  const lines = values.slice(1).flatMap((v, i) => {
    const from = values[i];
    return v === null || from === null || from === undefined ? [] : [pen.line(at(from, i), at(v, i + 1), { color: "ink", width: 1.5 })];
  });
  const last = values.at(-1);
  if (last === null || last === undefined) return lines;
  const [x, y] = at(last, values.length - 1);
  return [...lines, pen.shape("ellipse", { x: x - 3, y: y - 3, w: 6, h: 6 }, { fill: "accent" })];
}

/** The table, the trends over its last column and, where it goes on, which rows these are. */
function draw(content: TableContent, region: Region): Obj[] {
  const { x, y, w, pen, measure } = region;
  const column = (at: "latest" | "before" | "change") => figureColumn(measure, content.rows.map((r) => r[at]), 96, 160);
  const figures = [column("latest"), column("before"), column("change"), 112];
  const cols = [w - TREND - figures.reduce((a, b) => a + b, 0), ...figures, TREND];
  const rows: Row[] = [
    { h: HEAD, header: true, cells: HEADINGS.map((words, i) => tableCell(measure, words, cols[i]!, { header: true, right: i > 0 && i < 4 })) },
    ...content.rows.map((r) => {
      const name = tableCell(measure, r.name, cols[0]!);
      const when = r.period ? `${r.unit}, ${r.period}` : "No value yet";
      name.body.paras.push({ runs: [{ t: measure.fit(when, cols[0]! - 16, { size: 11 }, 1) }], size: 11, color: "muted" });
      const status = tableCell(measure, onTargetWords(r.onTarget), cols[4]!, { fill: r.onTarget === false ? "badsoft" : undefined });
      const middle = [r.latest, r.before, r.change].map((words, i) => tableCell(measure, words, cols[i + 1]!, { right: true }));
      return { h: ROW, cells: [name, ...middle, status, tableCell(measure, "", cols[5]!)] };
    }),
  ];
  const left = x + w - TREND + 12;
  const trends = content.rows.flatMap((r, i) => sparkline(region, r.trend, { x: left, y: y + HEAD + i * ROW + 14, w: TREND - 24, h: ROW - 28 }));
  return [
    pen.table(x, y, cols, rows, "The figures of each Metric"),
    ...(trends.length ? [pen.group("Trends", "The trend of each Metric as a line", trends)] : []),
    ...rowsShown(pen, { x, y: y + HEAD + content.rows.length * ROW + 4, w }, content.from, content.rows.length, content.of),
  ];
}

/** The table of figures. */
export const table: SlideType<TableContent> = {
  id: "table",
  section: "Performance",
  wide: true,
  /** A row for each listed Metric, and the headline the headline rules give for them. */
  fill(slide, data, deck) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const { metrics } = listed;
    const rows = metrics.map((m) => ({ ...figureOf(m, listed.data), trend: historyOf(m, listed.data, periodCount(slide)).values }));
    const headline = headlineOf(subjectOf(metrics), listed.data, deck.today);
    const source = sourceOf(metrics);
    if (rows.every((r) => !r.period)) return { headline, source, cannot: "No value to show yet." };
    return { headline, source, content: { rows, from: 1, of: rows.length } };
  },
  /** As many rows to a slide as the region holds. */
  pages(content, region) {
    const most = perSlide(region);
    return Array.from({ length: Math.ceil(content.rows.length / most) }, (_, i) => ({
      ...content,
      rows: content.rows.slice(i * most, (i + 1) * most),
      from: content.from + i * most,
    }));
  },
  draw,
};
