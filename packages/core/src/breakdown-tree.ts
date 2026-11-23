// The tree of a Breakdown with parents (GLOSSARY: Breakdown, Formula Tree, View Design; spec 0041, ticket 12): the `tree`
// mark with `show: "breakdown"`. The top box is the Metric's value for the period of its newest Breakdown; under it are the
// Breakdown's top-level rows, and under a row the rows that name it as their parent, down to 4 levels of rows. It makes the
// same boxes as the Formula Tree (formula-tree.ts) and is drawn by the same code, so a widget, a Snapshot, a View Link and a
// deck's picture say the same. Pure, and the only place this tree's numbers are worked out.
//
// Worked out exactly (exact.ts) from the values the Breakdown holds, never in the view:
// - the parts of a box share its width by their size, |value| over the sum of the sizes, as exact fractions that add up to
//   exactly 1; a row with a negative number is hatched, signed and counted by its size (a share is of the size of the parts);
// - a row's number is its own, as it was given: its parts may add up to another number (the Breakdown of a rate does not
//   add up at all), and then BOTH are said, in the text under the drawing and in the text alternative, never hidden and
//   never drawn as a box of "the rest"; the sum of the parts is worked out exactly from the values as their text says them;
// - at most TREE.boxes boxes: the smallest rows past that are grouped into one "Other rows" box of their parent, whose number
//   is their exact sum and whose width is their total size, and the text alternative still names every row and its number;
// - a Breakdown past 4 levels of rows, or whose rows cannot be placed, is refused in words, never drawn wrongly.
//
// Visibility (AGENTS.md rule 3): a Breakdown belongs to a Metric and is shown to whoever may see the Metric, all of its
// rows or none (there is no sharing of single rows). The loader (workspace-data.ts) leaves out a row it cannot read together
// with the rows under it, and this model draws only what it is given: it never works out a row from a difference, so it
// could not hand over a row that was left out. If rows were ever shared one by one, a parent with a withheld part would have
// to be refused whole, as the Formula Tree does, because the parent's number less the parts shown IS the withheld number.
import { BREAKDOWN_PARENTS } from "@ziffr/pack/breakdown-parents";
import { fractionOf, lowestTerms, nearest, over, plus, type Fraction } from "./exact";
import { plain, TREE, write, writePercent, type TreeBox, type TreeModel } from "./formula-tree";
import type { ValueUnit } from "./format";
import type { NumberStyle } from "./number-style";
import { periodLabel } from "./periods";
import type { CanvasData, BreakdownRow, Metric } from "./types";

// The most rows read at all: a Breakdown from a program holds at most 500; more is not one a person can read as a tree.
const MOST_ROWS = 1000;
const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
// Stryker disable next-line EqualityOperator: `<=` turns 0 into 0, which is the same size
const sizeOf = (f: Fraction): Fraction => (f.num < BigInt(0) ? { num: -f.num, den: f.den } : f);

/** What the tree is made from: the Metric's name and unit, the period written out, its value in that period (null: none), and the Breakdown's top-level rows with their parts. */
export type BreakdownTreeSource = { name: string; unit: ValueUnit; period: string; total: number | null; rows: BreakdownRow[] };

/** A row as the model works with it: its exact value, its parts, the row it is a part of and its place in the order of the tree. */
type Part = { label: string; exact: Fraction; size: Fraction; kids: Part[]; parent: Part | null; order: number };
class Refused extends Error {}

/** The rows read into parts with their exact values; throws Refused for a Breakdown that is too deep, too big or has a number that is not one. */
function read(rows: BreakdownRow[]): Part[] {
  const all: Part[] = [];
  const go = (level: number, list: BreakdownRow[], parent: Part | null): Part[] =>
    list.map((r) => {
      if (level > BREAKDOWN_PARENTS.depth) throw new Refused(`Not drawn: the breakdown has more than the ${BREAKDOWN_PARENTS.depth} levels of rows that read clearly in a chart.`);
      if (all.length >= MOST_ROWS) throw new Refused(`Not drawn: the breakdown has more than ${MOST_ROWS} rows.`);
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) throw new Refused("Not drawn: a row of the breakdown has no number.");
      const exact = fractionOf(r.value);
      const part: Part = { label: plain(String(r.label)), exact, size: sizeOf(exact), kids: [], parent, order: all.length };
      all.push(part);
      part.kids = go(level + 1, Array.isArray(r.parts) ? r.parts : [], part);
      return part;
    });
  return go(1, rows, null);
}

/** Which rows get a box: the largest first, a row only with its parent, until the boxes would pass the limit once each parent that has rows left out has its "Other rows" box. */
function chosen(top: Part[]): Set<Part> {
  const every: Part[] = [];
  const collect = (list: Part[]) => list.forEach((p) => { every.push(p); collect(p.kids); });
  collect(top);
  const kept = new Set<Part>();
  // How many of each parent's rows are kept (the root's key is null); a parent with some left out has one "Other rows" box.
  const keptKids = new Map<Part | null, number>();
  const rowsOf = (p: Part | null) => (p === null ? top.length : p.kids.length);
  // The top box, and the "Other rows" box the top rows would all be grouped in.
  let boxes = 1;
  let others = 1;
  const order = [...every].sort((a, b) => {
    const d = a.size.num * b.size.den - b.size.num * a.size.den;
    return d > ZERO.num ? -1 : d < ZERO.num ? 1 : a.order - b.order;
  });
  // The largest row that is eligible (its parent has a box) and fits is given one, and the search starts again: so a row larger than its parent comes after it, and a row that does not fit lets a smaller one in.
  for (let again = true; again; ) {
    again = false;
    for (const p of order) {
      if (kept.has(p) || (p.parent !== null && !kept.has(p.parent))) continue;
      // Keeping it: one more box, one "Other rows" fewer if it was its parent's last left out, one more if it has parts of its own.
      const above = keptKids.get(p.parent) ?? 0;
      const delta = 1 + (above + 1 === rowsOf(p.parent) ? -1 : 0) + (p.kids.length > 0 ? 1 : 0);
      if (boxes + others + delta > TREE.boxes) continue;
      kept.add(p);
      boxes++;
      others += delta - 1;
      keptKids.set(p.parent, above + 1);
      again = true;
      break;
    }
  }
  return kept;
}

/** The sum of some rows' values, exactly. */
const sumOf = (list: Part[]): Fraction => list.reduce<Fraction>((acc, p) => lowestTerms(plus(acc, p.exact)), ZERO);
/** The sizes of some rows or boxes added up, exactly. */
const sizesOf = (list: { size: Fraction }[]): Fraction => list.reduce<Fraction>((acc, p) => plus(acc, p.size), ZERO);

/** One box as it is built: its place, its number, and the rows grouped in it when it is the "Other rows" of its parent. */
type Draft = { label: string; exact: Fraction; size: Fraction; kids: Draft[]; grouped: Part[]; parts: Fraction | null };

/** The boxes to draw from the chosen rows: each kept row with the kept rows under it, then one box for the rest of its parent's rows. */
function draft(list: Part[], kept: Set<Part>): Draft[] {
  const shown = list.filter((p) => kept.has(p));
  const left = list.filter((p) => !kept.has(p));
  const boxes: Draft[] = shown.map((p) => ({ label: p.label, exact: p.exact, size: p.size, kids: draft(p.kids, kept), grouped: [], parts: p.kids.length ? sumOf(p.kids) : null }));
  if (left.length) boxes.push({ label: `Other rows (${left.length})`, exact: sumOf(left), size: sizesOf(left), kids: [], grouped: left, parts: null });
  return boxes;
}

/** A grouped row and its parts, in words with their numbers: every row left out of the drawing is still named. */
function groupedWords(p: Part, say: (f: Fraction) => string): string {
  return `${p.label} ${say(p.exact)}${p.kids.length ? ` (${p.kids.map((k) => groupedWords(k, say)).join(", ")})` : ""}`;
}

/**
 * The tree of a Breakdown, or why none is drawn. `rows` are the top-level rows each holding its parts; the top box is
 * `total` (the Metric's value), or the top rows added up when the Metric has none for the period.
 */
export function breakdownTree(source: BreakdownTreeSource, style: NumberStyle): TreeModel {
  const no = (refusal: string): TreeModel => ({ ok: false, refusal });
  const name = plain(source.name);
  if (source.rows.length === 0) return no(`Not drawn: ${name} has no rows to draw in this period.`);
  let top: Part[];
  try {
    top = read(source.rows);
  } catch (e) {
    // Only `read` throws, and only to refuse a Breakdown that cannot be drawn.
    return no((e as Refused).message);
  }
  const rest = draft(top, chosen(top));
  const added = sumOf(top);
  const derived = source.total === null || !Number.isFinite(source.total);
  const rootExact = derived ? added : fractionOf(source.total as number);
  const root: Draft = { label: name, exact: rootExact, size: sizeOf(rootExact), kids: rest, grouped: [], parts: added };
  const boxes: TreeBox[] = [];
  const lines: string[] = [];
  const differing: string[] = [];
  let tooSmall = false;
  const decimals = source.unit.decimals;
  // The number as written, in the Metric's unit; a number the doubles cannot tell from 0 is never written as 0.
  const say = (f: Fraction): string => {
    const v = nearest(f);
    const t = write(v, source.unit, decimals, style);
    tooSmall ||= t === null || (v === 0 && f.num !== BigInt(0));
    return t ?? "no value";
  };
  // Two different numbers written so that their texts differ: with the decimals the Metric shows, or as many more as it takes (a difference is never written as two equal numbers).
  const apart = (a: Fraction, b: Fraction): [string, string] => {
    for (let d = decimals; d <= 20; d++) {
      const [x, y] = [write(nearest(a), source.unit, d, style), write(nearest(b), source.unit, d, style)];
      if (x !== null && y !== null && x !== y) return [x, y];
    }
    return [say(a), say(b)];
  };
  const place = (d: Draft, parent: number | null, share: Fraction | null): void => {
    const id = boxes.length;
    const level = parent === null ? 0 : boxes[parent].level + 1;
    const value = nearest(d.exact);
    const written = say(d.exact);
    const pct = share === null ? null : nearest(lowestTerms({ num: share.num * BigInt(100), den: share.den }));
    const shareText = writePercent(pct, style);
    tooSmall ||= pct !== null && shareText === null;
    const negative = d.exact.num < BigInt(0);
    boxes.push({
      id, parent, level, label: d.label, how: parent === null ? "root" : "term", glyph: null, taken: negative, op: d.kids.length ? "sum" : null, value, text: written, why: null,
      share: share === null ? null : nearest(share), shareText, scaled: true,
      // Written once every box is known, below.
      // Stryker disable next-line StringLiteral: a placeholder, written over below
      alt: "",
    });
    // Both numbers, when a row's parts add up to another number than the row's own.
    const partsText = d.parts !== null && (d.parts.num * d.exact.den !== d.exact.num * d.parts.den) ? `${d.label}: its parts add up to ${apart(d.parts, d.exact)[0]}, not to ${apart(d.parts, d.exact)[1]}` : null;
    if (partsText) differing.push(partsText);
    // The sizes of the parts and their total, exactly: each share is a size over the total, so they add up to exactly 1.
    const total = sizesOf(d.kids);
    d.kids.forEach((k) => place(k, id, total.num === BigInt(0) ? null : lowestTerms(over(k.size, total))));
  };
  place(root, null, null);
  if (tooSmall) return no("Not drawn: some numbers are too small to write out in full.");
  const note = (b: TreeBox, d: Draft | null) => [b.taken ? "negative" : "", b.shareText ? `${b.shareText} of the parts` : "", d && d.grouped.length ? `made of ${d.grouped.map((p) => groupedWords(p, say)).join("; ")}` : ""].filter(Boolean);
  // The drafts in the order the boxes were placed (a box, then its parts), to name each box's own words.
  const drafts: Draft[] = [];
  const walk = (d: Draft) => { drafts.push(d); d.kids.forEach(walk); };
  walk(root);
  // A name goes between direction isolates, so a name written right to left and the number after it never run together.
  const named = (b: TreeBox) => `⁨${b.label}⁩ ${b.text}`;
  for (const b of boxes) b.alt = [named(b), ...note(b, drafts[b.id])].join(", ");
  for (const b of boxes) if (b.op !== null) lines.push(`${named(b)}${b.parent === null && b.taken ? ", negative" : ""} is made of: ${boxes.filter((k) => k.parent === b.id).map((k) => k.alt).join("; ")}.`);
  const has = { negative: boxes.some((b) => b.taken) || drafts.some((d) => d.grouped.some((p) => p.exact.num < BigInt(0))), other: drafts.some((d) => d.grouped.length > 0), differ: differing.length > 0 };
  const rule = [
    derived ? `${name} has no value for ${source.period}, so the top box is its rows added up.` : `The top box is the value of ${name} for ${source.period}; the boxes under it are the rows of its breakdown, each as it was given.`,
    "Parts share the width of the box above them by their size.",
    has.negative ? "A row with a negative number is hatched and counts by its size, so its share is of the size of the parts, not of their total." : "",
    boxes.some((b) => b.parent === 0 && b.taken) ? "The top box is drawn at its own size on the same scale as its parts, so a value smaller than its parts is narrower." : "",
    has.other ? `The smallest rows beyond ${TREE.boxes} boxes are grouped as Other rows, with their exact total, and the box is as wide as their sizes together (negative rows count by their size); the text version names each of them.` : "",
    has.differ ? `A number is a row's own, as it was given: where its parts add up to another number, both are given. ${differing.join(". ")}.` : "",
  ].filter(Boolean).join(" ");
  return { ok: true, boxes, period: source.period, rule, alt: `Breakdown tree of ${name} for ${source.period}. ${rule} ${lines.join(" ")}` };
}

/** What the widget gives the tree: the Metric's own period for the newest Breakdown (up to a Snapshot's day), and the Metric's value in that period. */
export type BreakdownTreeOptions = { asOf?: string | null };

/** The tree of the Metric's newest Breakdown from what the widget was given: only the Breakdown of a Metric that is in `data` (one the person may not see, or that a View Link or Snapshot leaves out, is not), or why there is none. */
export function breakdownTreeFromData(metric: Metric | undefined, data: Pick<CanvasData, "series" | "breakdowns" | "yearStart" | "numberStyle">, opts: BreakdownTreeOptions = {}): TreeModel {
  const no = (refusal: string): TreeModel => ({ ok: false, refusal });
  if (!metric) return no("Drop a metric with a breakdown.");
  const byPeriod = data.breakdowns[metric.id] ?? {};
  // A Snapshot's day: later periods are not part of it, whatever the data holds.
  const period = Object.keys(byPeriod).filter((p) => !opts.asOf || p <= opts.asOf).sort().at(-1);
  if (period === undefined) return no(`${plain(metric.name)} has no breakdown yet.`);
  const point = (data.series[metric.slug] ?? []).find((p) => p.period === period);
  const unit: ValueUnit = { decimals: metric.decimals, unit: metric.unit, unit_position: metric.unit_position };
  return breakdownTree({ name: metric.name, unit, period: periodLabel(period, metric.period, data.yearStart), total: point && Number.isFinite(point.value) ? point.value : null, rows: byPeriod[period] }, data.numberStyle);
}
