// The numbers and words of the marks `range` and `bridge` (GLOSSARY: View Design, Analysis Recipe, Number Style; spec 0041, "Marks"):
// what the renderer draws is only what this module hands it. Each number comes from the table a verified function of the recipe gave
// (a bridge's parts, a fit's effects with their ranges); nothing is worked out again here beyond the running level a bar starts from,
// which is geometry and is never written as a figure. Every figure is written in the Workspace's Number Style and, for a Metric, in its
// unit, with as many decimals as it takes for a number that is not 0 never to be written as 0 and for the two ends of a range to read
// differently. A table the marks cannot draw honestly (a low end above its high end, a value that is not a number, too many rows) is
// refused in words, never drawn as a misleading chart. Pure; the one place the web app, a Snapshot, a View Link and a deck read.
import { formatNumber, formatValue, type ValueUnit } from "./format";
import type { TableRow } from "./recipe-methods";
import { listOf, sayIn, type TakeawayContext } from "./takeaways/takeaway";

/** The most rows a range or a bridge draws: more do not read clearly in a chart (a recipe has at most 6 parts, so 9 rows with a start, an end and a remainder). */
export const MARK_ROWS = 12;
// A value of a recipe has at most 20 decimal places and a change of two of them no fewer, so 20 writes any of them in full.
const MOST_DECIMALS = 20;

/** How a mark writes a number: a Metric's unit, or `null` for a plain number (two decimals to begin with). */
export type MarkUnit = ValueUnit | null;

// Decimals enough that no number but 0 is written as 0, and that the pairs given (a low end and a high end) are written differently;
// null where even the most decimals cannot (a number too small to write out in full): the mark is then refused, never drawn with a 0 that is not one.
function decimalsFor(unit: MarkUnit, values: number[], pairs: [number, number][], ctx: TakeawayContext): number | null {
  const text = (v: number, d: number) => (unit ? formatValue({ ...unit, decimals: d }, v, ctx.style) : formatNumber(v, d, ctx.style));
  // Whether a number reads as 0 is asked of the writer itself (the number alone, without its unit), never worked out from the decimals.
  const fails = (d: number) => values.some((v) => v !== 0 && !/[1-9]/.test(formatNumber(v, d, ctx.style))) || pairs.some(([x, y]) => x !== y && text(x, d) === text(y, d));
  let decimals = unit?.decimals ?? 2;
  while (decimals < MOST_DECIMALS && fails(decimals)) decimals++;
  return fails(decimals) ? null : decimals;
}
const writer = (unit: MarkUnit, decimals: number, ctx: TakeawayContext) => (v: number) => (unit ? formatValue({ ...unit, decimals }, v, ctx.style) : formatNumber(v, decimals, ctx.style));
const signed = (write: (v: number) => string, v: number) => `${v > 0 ? "+" : ""}${write(v)}`;
const isNumber = (v: unknown): v is number => Number.isFinite(v);

/** One drawn interval: its label, the middle value if it has one, the low and high ends, and each as written. */
export type RangeFigure = { label: string; centre: number | null; low: number; high: number; centreText: string | null; lowText: string; highText: string; alt: string };
/** What a `range` mark draws, or why it does not. `alt` is the text alternative: every number in words. */
export type RangeFigures = { mark: "range"; ok: true; rows: RangeFigure[]; alt: string } | { mark: "range"; ok: false; refusal: string };

/** The figures of a range mark from the rows of a table that has a low and a high end for each row (a driver's effect with its range). */
export function rangeFigures(rows: TableRow[], unit: MarkUnit, ctx: TakeawayContext): RangeFigures {
  const no = (refusal: string): RangeFigures => ({ mark: "range", ok: false, refusal });
  if (rows.length === 0) return no(sayIn("mark-empty", {}, ctx));
  if (rows.length > MARK_ROWS) return no(sayIn("mark-too-many", { n: rows.length, max: MARK_ROWS }, ctx));
  for (const r of rows) {
    if (!isNumber(r.low) || !isNumber(r.high) || (r.value !== null && !isNumber(r.value))) return no(sayIn("mark-not-a-number", { label: r.label }, ctx));
    if (r.low > r.high) return no(sayIn("mark-low-above-high", { label: r.label }, ctx));
    if (r.value !== null && (r.value < r.low || r.value > r.high)) return no(sayIn("mark-centre-outside", { label: r.label }, ctx));
  }
  const ends = rows.map((r) => ({ label: r.label, centre: r.value, low: r.low as number, high: r.high as number }));
  const decimals = decimalsFor(unit, ends.flatMap((r) => [r.low, r.high, ...(r.centre === null ? [] : [r.centre])]), ends.map((r): [number, number] => [r.low, r.high]), ctx);
  if (decimals === null) return no(sayIn("mark-too-small", {}, ctx));
  const write = writer(unit, decimals, ctx);
  const figures = ends.map((r): RangeFigure => {
    const [lowText, highText, centreText] = [write(r.low), write(r.high), r.centre === null ? null : write(r.centre)];
    const alt = centreText === null ? sayIn("mark-range-alt-bare", { label: r.label, low: lowText, high: highText }, ctx) : sayIn("mark-range-alt", { label: r.label, centre: centreText, low: lowText, high: highText }, ctx);
    return { ...r, centreText, lowText, highText, alt };
  });
  return { mark: "range", ok: true, rows: figures, alt: figures.map((f) => f.alt).join(" ") };
}

/** One step of a drawn bridge: a level (the start or the end) or a signed part. `from` and `to` are where its bar starts and ends on the value axis. */
export type BridgeStep = { kind: "start" | "part" | "rest" | "end"; label: string; value: number; text: string; from: number; to: number; direction: "up" | "down" | "flat" | "level"; missing?: "appeared" | "gone" };
/** What a `bridge` mark draws, or why it does not. `notes` name the parts that had no value in one of the two periods; `alt` is the text alternative. */
export type BridgeFigures = { mark: "bridge"; ok: true; steps: BridgeStep[]; notes: string[]; alt: string } | { mark: "bridge"; ok: false; refusal: string };

/** The figures of a bridge mark from the rows the bridge Method gave: the start, the parts, what they leave out, the end. A part counts as drawn the other way when negative, and a part of 0 is drawn and written as 0. */
export function bridgeFigures(rows: TableRow[], unit: MarkUnit, ctx: TakeawayContext): BridgeFigures {
  const no = (refusal: string): BridgeFigures => ({ mark: "bridge", ok: false, refusal });
  if (rows.length === 0) return no(sayIn("mark-empty", {}, ctx));
  if (rows.length > MARK_ROWS) return no(sayIn("mark-too-many", { n: rows.length, max: MARK_ROWS }, ctx));
  const bad = rows.find((r) => !isNumber(r.value));
  if (bad) return no(sayIn("mark-not-a-number", { label: bad.label }, ctx));
  const [first, last] = [rows[0], rows[rows.length - 1]];
  if (first.role !== "start" || last.role !== "end" || rows.slice(1, -1).some((r) => r.role !== "part" && r.role !== "rest")) return no(sayIn("mark-no-ends", {}, ctx));
  const [start, end] = [first.value as number, last.value as number];
  // The same widening as the bridge's own sentence (the change and every part), and the start and the end too: no number that is not 0 is written as 0.
  const decimals = decimalsFor(unit, [end - start, ...rows.map((r) => r.value as number)], [], ctx);
  if (decimals === null) return no(sayIn("mark-too-small", {}, ctx));
  const write = writer(unit, decimals, ctx);
  let level = start;
  const steps: BridgeStep[] = rows.map((r, i): BridgeStep => {
    const value = r.value as number;
    if (i === 0 || i === rows.length - 1) return { kind: r.role as "start" | "end", label: r.label, value, text: write(value), from: 0, to: value, direction: "level" };
    const from = level;
    level += value;
    return { kind: r.role as "part" | "rest", label: r.label, value, text: signed(write, value), from, to: level, direction: value > 0 ? "up" : value < 0 ? "down" : "flat", ...(r.missing ? { missing: r.missing } : {}) };
  });
  const named = steps.filter((s) => s.missing).map((s) => s.label);
  const notes = named.length ? [sayIn("bridge-missing", { names: listOf(named, ctx) }, ctx)] : [];
  const parts = steps.slice(1, -1).map((s) => `${s.label} ${s.text}`).join(sayIn("list-comma", {}, ctx));
  const [from, to] = [`${steps[0].label} ${steps[0].text}`, `${steps[steps.length - 1].label} ${steps[steps.length - 1].text}`];
  const alt = [parts ? sayIn("mark-bridge-alt", { from, to, steps: parts }, ctx) : sayIn("mark-bridge-alt-flat", { from, to }, ctx), ...notes].join(" ");
  return { mark: "bridge", ok: true, steps, notes, alt };
}
