// The gap table slide (spec 0069; GLOSSARY: Slide Type, Total, Breakdown): two Metrics' Breakdowns side by side, or a row
// for each Metric a Total adds up, each with its difference as a figure and a bar. The figures are those of the gap
// table Slide Element (`gapModel`). Rows that do not fit go on to another slide. Visibility: only the slide's listed
// Metrics are read; a Total that adds up one the slide does not list is not drawn. Pure.
import { gapModel, type GapRow } from "../../slide-figures";
import { chartTitle } from "../chart";
import { textBody, type Cell, type Obj, type Row } from "../objects";
import type { Region, SlideSource, SlideType } from "../slide-type";
import type { Role } from "../theme";
import { cannotHeadline, gapHeadline } from "./headlines";
import { listedData, nameOf, NOT_THERE, periodWords, readsMore, sourceOf, unitWords, type Listed } from "./listed";

/** What a gap table slide shows. `rows` are those of this slide, from row `from` of `of`; `low` and `high` are the
 * ends of the bars' scale, the same on every slide the table goes on to. */
export type GapContent = {
  title: string;
  unit: string;
  head: [string, string, string, string];
  rows: GapRow[];
  from: number;
  of: number;
  low: number;
  high: number;
  /** Whether a higher number is the better one; null where neither is. */
  higher: boolean | null;
};

const TITLE = 32;
const HEAD = 40;
const ROW = 36;
const FOOT = 24;
const BARS = 220;

/** Why this table cannot be made from what the slide lists, before any figure is read. */
function refusal(slide: SlideSource, { metrics, data }: Listed): string | null {
  const first = metrics[0]!;
  if (slide.options.total !== true) return metrics.length === 2 ? null : "A gap table sets two Metrics side by side, or shows one Total.";
  if (!first.total) return `${nameOf(first)} is not a Total, so it has no parts to show.`;
  return data.totalLists?.[first.id]?.parts.some((p) => !slide.metrics.includes(p.part)) ? readsMore(nameOf(first)) : null;
}

/** The rows of a table, as many to a slide as the region holds. */
const perSlide = (region: Region) => Math.max(1, Math.floor((region.h - TITLE - HEAD - FOOT) / ROW));

/** The tone of a difference: good or bad where the Metric says which way is better. */
const toneOf = (gap: number, higher: boolean | null): Role => (higher === null ? "neutral2" : gap > 0 === higher ? "good" : "bad");

/** The title, the table, the differences as bars and, where the table goes on, which rows these are. */
function draw(content: GapContent, { x, y, w, pen, measure }: Region): Obj[] {
  const figures = content.rows.map((r) => [r.goal, r.actual, r.gapText]);
  const numbers = [0, 1, 2].map((i) => {
    const widest = measure.columnFor(
      figures.map((row): [string, { size: number }] => [row[i]!, { size: 13 }]),
      20,
    );
    return Math.min(190, Math.max(110, widest));
  });
  const bars = content.high > content.low ? BARS : 0;
  const cols = [w - bars - numbers.reduce((a, b) => a + b, 0), ...numbers];
  const cell = (words: string, column: number, header: boolean): Cell => {
    const size = header ? 12 : 13;
    return {
      body: textBody([measure.fit(words, cols[column]! - 16, { size, bold: header }, 2)], {
        size,
        bold: header,
        color: header ? "muted" : "ink",
        align: column ? "right" : "left",
        valign: "middle",
        inset: [8, 2, 8, 2],
        line: 1.2,
      }),
      borderBottom: { color: header ? "ink" : "rule", width: 1 },
    };
  };
  const rows: Row[] = [
    { h: HEAD, header: true, cells: content.head.map((words, i) => cell(words, i, true)) },
    ...content.rows.map((r) => ({ h: ROW, cells: [r.label, r.goal, r.actual, r.gapText].map((words, i) => cell(words, i, false)) })),
  ];
  const top = y + TITLE;
  const objects: Obj[] = [...chartTitle(pen, measure, { x, y, w }, content.title, content.unit), pen.table(x, top, cols, rows, content.title)];
  if (bars) {
    const left = x + w - bars + 16;
    const at = (v: number) => left + ((v - content.low) / (content.high - content.low)) * (bars - 16);
    const marks: Obj[] = content.rows.flatMap((r, i) => {
      if (r.gap === null || r.gap === 0) return [];
      const box = { x: Math.min(at(0), at(r.gap)), y: top + HEAD + i * ROW + 10, w: Math.max(2, Math.abs(at(r.gap) - at(0))), h: ROW - 20 };
      // A bar never reaches past the scale, also where it is widened to be seen.
      box.x = Math.min(box.x, x + w - box.w);
      return [pen.rect(box, toneOf(r.gap, content.higher), { alt: `${r.label}: ${r.gapText}` })];
    });
    marks.push(pen.line([at(0), top + HEAD], [at(0), top + HEAD + content.rows.length * ROW], { color: "ink" }));
    objects.push(pen.group("Differences", `The differences of ${content.title} as bars`, marks));
  }
  if (content.of > content.rows.length) {
    const words = `Rows ${content.from} to ${content.from + content.rows.length - 1} of ${content.of}`;
    objects.push(pen.text({ x, y: top + HEAD + content.rows.length * ROW + 4, w, h: 18 }, [words], { size: 12, color: "muted" }));
  }
  return objects;
}

/** The gap table. */
export const gapTable: SlideType<GapContent> = {
  id: "gap-table",
  section: "Performance",
  wide: true,
  /** The rows of the two Breakdowns or of the Total, and the headline that counts those below. */
  fill(slide, data) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const { metrics } = listed;
    const first = metrics[0]!;
    const total = slide.options.total === true;
    const cannot = (words: string) => ({ headline: cannotHeadline("gap table", nameOf(first)), source: sourceOf(metrics), cannot: words });
    const why = refusal(slide, listed);
    if (why) return cannot(why);
    const model = gapModel({ kind: "gap-table", total }, { data: listed.data, metrics });
    if (model.denied) return NOT_THERE;
    if (!model.rows.length) return cannot(model.empty ?? model.note ?? "No value to show yet.");
    const against = total ? "target" : nameOf(metrics[1]!);
    const period = model.period && periodWords(first, data, model.period);
    const gaps = model.rows.map((r) => r.gap ?? 0);
    const notes = [model.note, model.more ? `${model.more} more rows are not shown.` : null].filter(Boolean);
    return {
      headline: gapHeadline(
        nameOf(first),
        against,
        model.rows.map((r) => r.gap),
      ),
      source: sourceOf(metrics, period),
      note: notes.join(" ") || undefined,
      content: {
        title: `${nameOf(first)} against ${against}${period ? `, ${period}` : ""}`,
        unit: unitWords(model.unit ?? ""),
        head: [model.head.row, model.head.goal, model.head.actual, "Difference"],
        rows: model.rows,
        from: 1,
        of: model.rows.length,
        low: Math.min(0, ...gaps),
        high: Math.max(0, ...gaps),
        higher: first.polarity === "target" ? null : first.polarity === "higher",
      },
    };
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
