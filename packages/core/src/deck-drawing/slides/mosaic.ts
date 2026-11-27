// The mosaic slide (spec 0069; GLOSSARY: Slide Type, Breakdown): a Breakdown whose rows have parts, a column for each
// row as wide as its share and cut into its parts. At most six columns and five parts; the rest is "Other". Refused in
// words for negative numbers or no parts; where parts do not add up to their row, it says so. Visibility: one Metric,
// the one the slide lists, and only its Breakdown. Pure.
import { plain, writePercent } from "../../formula-tree";
import { scaleOf, scaleUnit, writeSlideValue } from "../../slide-figures";
import type { BreakdownRow } from "../../types";
import { chartTitle } from "../chart";
import type { Obj, Stroke } from "../objects";
import type { Region, SlideType } from "../slide-type";
import type { Role } from "../theme";
import { cannotHeadline, mosaicHeadline } from "./headlines";
import { breakdownPeriod, listedData, nameOf, NOT_THERE, periodWords, sourceOf, unitWords, valueIn } from "./listed";

/** One piece of a column: which part it is (null: what its row holds beyond its parts) and its share of the column. */
export type MosaicPiece = { part: number | null; share: number; text: string };
/** One column: its row's name, its share of all rows, its figure and its pieces from the top. */
export type MosaicColumn = { name: string; share: number; shareText: string; figure: string; pieces: MosaicPiece[] };
/** What a mosaic slide shows. `parts` names the parts, in the order of their colours. */
export type MosaicContent = { title: string; unit: string; parts: string[]; columns: MosaicColumn[] };

/** The most columns and the most parts of a mosaic; what is beyond them is "Other". */
export const MOSAIC = { columns: 6, parts: 5 } as const;

const OTHER = "Other";
const NOT_SPLIT = "Not in the parts";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** Whether two figures differ by more than the doubles make them. */
const differ = (a: number, b: number) => Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The largest `most - 1` of these by their figure, and the rest, where there are more than `most`. */
function largest<T>(items: T[], figure: (item: T) => number, most: number): [T[], T[]] {
  const ordered = [...items].sort((a, b) => figure(b) - figure(a));
  return ordered.length > most ? [ordered.slice(0, most - 1), ordered.slice(most - 1)] : [ordered, []];
}

type Raw = { name: string; value: number; others: boolean; parts: Map<string, number> };

/** The parts of these rows, added up by name. */
function partsByName(rows: readonly BreakdownRow[]): Map<string, number> {
  const parts = new Map<string, number>();
  for (const row of rows) for (const p of row.parts ?? []) parts.set(plain(p.label), (parts.get(plain(p.label)) ?? 0) + p.value);
  return parts;
}

/** The columns of the rows: the largest, and the rest together. */
function columnsOf(rows: readonly BreakdownRow[]): Raw[] {
  const [kept, rest] = largest([...rows], (r) => r.value, MOSAIC.columns);
  const columns = kept.map((r): Raw => ({ name: plain(r.label), value: r.value, others: false, parts: partsByName([r]) }));
  if (rest.length) columns.push({ name: `${OTHER} (${rest.length} rows)`, value: sum(rest.map((r) => r.value)), others: true, parts: partsByName(rest) });
  return columns;
}

/** How a piece is filled, by its place among the parts; the words on it are read on that fill. */
const FILLS: { fill: Role; ink: Role; stroke?: Stroke }[] = [
  { fill: "accent", ink: "onaccent" },
  { fill: "neutral", ink: "ink" },
  { fill: "accentsoft", ink: "ink" },
  { fill: "neutral2", ink: "ink" },
  { fill: "surface", ink: "ink", stroke: { color: "muted", width: 1 } },
];
const REMAINDER: (typeof FILLS)[number] = { fill: "badsoft", ink: "ink", stroke: { color: "bad", width: 1 } };

/** Columns narrower than this are named under the chart. */
const NAMED = 64;

/** The columns by their share, the parts stacked in each, the legend and the names of narrow columns. */
function draw({ title, unit, parts, columns }: MosaicContent, { x, y, w, h, pen, measure }: Region): Obj[] {
  const objects: Obj[] = chartTitle(pen, measure, { x, y, w }, title, unit);
  const remains = columns.some((c) => c.pieces.some((p) => p.part === null));
  const keys = [...parts.map((name, i) => ({ name, look: FILLS[i]! })), ...(remains ? [{ name: NOT_SPLIT, look: REMAINDER }] : [])];
  const step = w / Math.max(4, keys.length);
  for (const [i, key] of keys.entries()) {
    objects.push(pen.rect({ x: x + i * step, y: y + 36, w: 12, h: 12 }, key.look.fill, { stroke: key.look.stroke }));
    objects.push(pen.text({ x: x + i * step + 18, y: y + 33, w: step - 26, h: 18 }, [measure.fit(key.name, step - 26, { size: 12 }, 1)], { size: 12, line: 1.3, wrap: false }));
  }
  const head = y + 60;
  const top = head + 56;
  const tall = h - (top - y) - 40;
  const gap = 3;
  const room = w - gap * (columns.length - 1);
  const marks: Obj[] = [];
  const narrow: string[] = [];
  let left = x;
  for (const column of columns) {
    const wide = column.share * room;
    if (wide >= NAMED) {
      const name = measure.fit(column.name, wide - 4, { size: 12, bold: true }, 2);
      const figure = measure.fit(`${column.shareText} · ${column.figure}`, wide - 4, { size: 11 }, 1);
      objects.push(pen.text({ x: left, y: head, w: wide, h: 34 }, [name], { size: 12, bold: true, line: 1.3 }));
      objects.push(pen.text({ x: left, y: head + 34, w: wide, h: 17 }, [figure], { size: 11, color: "muted", line: 1.3, wrap: false }));
    } else narrow.push(`${column.name} ${column.shareText} (${column.figure})`);
    let down = top;
    for (const piece of column.pieces) {
      const look = piece.part === null ? REMAINDER : FILLS[piece.part]!;
      const label = piece.part === null ? NOT_SPLIT : parts[piece.part]!;
      const height = piece.share * tall;
      if (wide > 0 && height > 0) marks.push(pen.rect({ x: left, y: down, w: wide, h: height }, look.fill, { stroke: look.stroke, alt: `${column.name}, ${label}: ${piece.text}` }));
      if (height >= 20 && wide >= 52) marks.push(pen.text({ x: left, y: down + (height - 18) / 2, w: wide, h: 18 }, [piece.text], { size: 12, color: look.ink, align: "center", line: 1.3, wrap: false }));
      down += height;
    }
    left += wide + gap;
  }
  const said = columns.map((c) => `${c.name} ${c.shareText} (${c.pieces.map((p) => `${p.part === null ? NOT_SPLIT : parts[p.part]} ${p.text}`).join(", ")})`);
  objects.push(pen.group("Mosaic", `${title}: ${said.join("; ")}`, marks));
  if (narrow.length) {
    const words = measure.fit(`Narrow columns, left to right: ${narrow.join(", ")}`, w, { size: 12 }, 2);
    objects.push(pen.text({ x, y: y + h - 36, w, h: 34 }, [words], { size: 12, color: "muted", line: 1.3 }));
  }
  return objects;
}

/** The mosaic. */
export const mosaic: SlideType<MosaicContent> = {
  id: "mosaic",
  section: "Drivers",
  wide: true,
  /** The latest Breakdown with parts as shares, or the sentence that says why it cannot be one. */
  fill(slide, data) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const metric = listed.metrics[0]!;
    const name = nameOf(metric);
    const cannot = (why: string) => ({ headline: cannotHeadline("split", name), source: sourceOf([metric]), cannot: why });
    const period = breakdownPeriod(metric, listed.data);
    if (!period) return cannot(`${name} has no Breakdown yet.`);
    const rows = listed.data.breakdowns[metric.id]![period]!;
    const figures = rows.flatMap((r) => [r.value, ...(r.parts ?? []).map((p) => p.value)]);
    if (figures.some((v) => !Number.isFinite(v) || v < 0)) return cannot(`The Breakdown of ${name} holds negative numbers, which have no share of a whole.`);
    if (!rows.some((r) => r.parts?.length)) return cannot(`The rows of ${name} have no parts, so there is nothing to cut its columns into.`);
    const all = sum(rows.map((r) => r.value));
    if (!(all > 0)) return cannot(`Every row of ${name} is 0, so no row has a share.`);
    const raw = columnsOf(rows);
    const totals = partsByName(rows);
    const [kept, rest] = largest([...totals.keys()], (part) => totals.get(part)!, MOSAIC.parts);
    // A part of its own called "Other" takes the smallest ones in.
    const parts = rest.length ? [...new Set([...kept, OTHER])] : kept;
    const scale = scaleOf(Math.max(...raw.map((c) => c.value)));
    const percent = (share: number) => writePercent(share * 100, data.numberStyle) ?? "";
    const columns = raw.map((column): MosaicColumn => {
      const held = parts.map(() => 0);
      for (const [part, v] of column.parts) held[parts.indexOf(kept.includes(part) ? part : OTHER)]! += v;
      const split = sum(held);
      // Parts that come to more than their row fill the column between them.
      const whole = Math.max(column.value, split);
      const pieces = held.map((v, part): { part: number | null; v: number } => ({ part, v }));
      if (column.value > split && differ(column.value, split)) pieces.push({ part: null, v: column.value - split });
      return {
        name: column.name,
        share: column.value / all,
        shareText: percent(column.value / all),
        figure: writeSlideValue(metric, column.value, scale, data, { bare: true }),
        pieces: pieces.flatMap(({ part, v }) => (v > 0 ? [{ part, share: v / whole, text: percent(v / whole) }] : [])),
      };
    });
    // Named by the rows themselves, so that rows added together do not hide one that is off.
    const off = rows.filter((r) => differ(r.value, sum((r.parts ?? []).map((p) => p.value)))).map((r) => plain(r.label));
    const own = valueIn(metric, listed.data, period);
    const written = (v: number) => writeSlideValue(metric, v, scaleOf(Math.abs(v)), data);
    const notes = [
      off.length ? `The parts do not add up to their row in: ${off.join(", ")}.` : "",
      own !== null && differ(own, all) ? `The rows come to ${written(all)}, not to the ${written(own)} of ${name}.` : "",
    ].filter(Boolean);
    const widest = columns[raw.findIndex((c) => !c.others)]!;
    return {
      headline: mosaicHeadline(name, widest.name, widest.shareText),
      source: sourceOf([metric], periodWords(metric, data, period)),
      note: notes.join(" ") || undefined,
      content: { title: `${name} by row and part, ${periodWords(metric, data, period)}`, unit: unitWords(scaleUnit(metric, scale)), parts, columns },
    };
  },
  draw,
};
