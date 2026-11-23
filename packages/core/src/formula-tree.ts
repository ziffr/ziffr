// The formula tree of a Derived Metric (GLOSSARY: Formula Tree, Derived Metric, View Design; spec 0041, ticket 11): the
// formula is the tree, so every box is a number Ziffr already works out, and nothing here is estimated. The root is the
// Metric's value for one period; its children are the formula's parts (the terms of a sum, the factors of a product or a
// ratio), and a part that is itself a bracket has parts of its own. Pure; the one place a widget, a Snapshot, a View Link
// and a deck's picture read, so they all show the same numbers.
//
// Worked out exactly (exact.ts) on the values the Metrics show, never in the view and never from rounded text:
// - a sum's parts share the width of their box by their size, |value| over the sum of the sizes, as exact fractions that
//   add up to exactly 1; a part that is taken away counts by its size and is drawn hatched, with its sign said;
// - the factors of a product or a ratio are NOT parts of a sum (a product of 3 and 4 is not 3 plus 4 of anything), so
//   they are never given shares: they are laid side by side equally, said to be not to scale, with the operator between;
// - a box with no value is named and kept as a gap, never a 0; a period still running or with gaps in it is marked;
// - at most TREE.levels levels and TREE.boxes boxes; a formula past them, or one that reaches back a period, is refused.
//
// Visibility (AGENTS.md rule 3): a Metric the person may not see is not in the data they were given, and a formula that
// names one is refused whole. It is never drawn as an "other parts" box either: when one part is hidden, the whole minus
// the parts shown IS the hidden Metric's value (with several hidden, their sum), so any remainder would hand it over.
import { bitLength, fractionOf, fractionOfText, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "./exact";
import { formulaInputs, FORMULA_MAX_BITS, inputsProblem, readFormula, usesPrevious, type FormulaNode } from "./formula";
import { formatNumber, formatPercent, formatValue, type ValueUnit } from "./format";
import type { NumberStyle } from "./number-style";
import { dayAfter, periodCount, resolverFrom, shownSeries, valueOver, type DisplayPeriod } from "./display-periods";
import { pointNote } from "./polar-marks";
import { periodLabel } from "./periods";
import type { CanvasData, Metric, WidgetSettings } from "./types";

/** How big a formula tree may be: levels counted from the root as the first, and boxes in all. More cannot be read in a widget. */
export const TREE = { levels: 4, boxes: 24 } as const;
// A number of at most 20 decimal places is written in full by 20 more.
const MOST_DECIMALS = 20;
const CONDENSED = "Some of these values are Condensed Values, each standing for several periods in one value, so a tree of the formula cannot place them. Show the values by their own period instead.";

/** One input of the formula as the widget has it: the Metric's name and unit, its value in the period, and why that is not a whole period. `value` null is no value. */
export type TreeLeaf = { name: string; value: number | null; note?: string; unit: ValueUnit };
/** What a formula tree is made from: the Derived Metric, its formula, and its inputs by slug (`undefined` is an input that is not shared here). */
export type TreeSource = { name: string; unit: ValueUnit; formula: string; period: string; note?: string; leaves: Record<string, TreeLeaf | undefined> };

/** One box of the tree, in tree order (a box, then its parts left to right). */
export type TreeBox = {
  id: number;
  /** The id of the box above, or null for the root. */
  parent: number | null;
  /** 0 for the root. */
  level: number;
  /** The name as drawn, with its note in brackets when it is not for a whole period. */
  label: string;
  how: "root" | "term" | "factor" | "divisor";
  /** The sign written beside it: + or − before a term, × or ÷ before a factor; none for the root and the first part. */
  glyph: "+" | "−" | "×" | "÷" | null;
  /** A term that is taken away (drawn hatched; its value is still the Metric's own number). */
  taken: boolean;
  /** How its parts combine: added up, or multiplied (a ratio is a product with a divisor); null for a box without parts. */
  op: "sum" | "product" | null;
  /** The value, the double nearest to the exact one; null for none. */
  value: number | null;
  /** The value written in the Number Style (and its unit where a sum of one unit has one), or "no value". */
  text: string;
  /** Why there is no value, or null. */
  why: string | null;
  /** The part of a sum's size this box has among its siblings, 0 to 1, exact before it became a double; null for a box that is not a part of a sum, has no value, or has siblings that are all 0. */
  share: number | null;
  shareText: string | null;
  /** The box is drawn by its share of the box above (a part of a sum); false for the factors of a product, which share the width equally. */
  scaled: boolean;
  /** This box in words: its name, number and what it is to the box above. */
  alt: string;
};

/** What the `tree` mark draws, or why it does not. `alt` is the text alternative with every number in tree order. */
export type TreeModel = { ok: true; boxes: TreeBox[]; period: string; rule: string; alt: string } | { ok: false; refusal: string };

class Refused extends Error {}

type Built = {
  name: string;
  /** How a box above names it in its own name: a bracket in brackets, a number as written. */
  expr: string;
  notes: string[];
  how: TreeBox["how"];
  taken: boolean;
  op: TreeBox["op"];
  exact: Fraction | null;
  why: string | null;
  unit: ValueUnit | null;
  decimals: number;
  kids: Built[];
};
type Ctx = { leaves: Record<string, TreeLeaf | undefined>; count: number };

// Stryker disable next-line EqualityOperator: the bound is a safety limit, not a rule of results: no number a formula within its bounds comes to works out to exactly 8,192 bits, so `<` gives the same
const within = (n: bigint) => bitLength(n) <= FORMULA_MAX_BITS;
const fits = (f: Fraction) => within(f.num) && within(f.den);
const unique = (xs: string[]) => [...new Set(xs)];
// A name is somebody's text: direction controls are taken out, so one cannot turn the numbers beside it round where names and numbers are joined into one line.
/** A name as drawn: somebody's text with the characters that turn a line round taken out. */
export const plain = (name: string) => name.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
const ONE: Fraction = { num: BigInt(1), den: BigInt(1) };
// The size of a number. Shares are ratios of sizes, so a size with every sign turned round, or 0 turned round (it is 0 still), gives the same shares.
// Stryker disable next-line EqualityOperator: `<=` turns 0 into 0, and `>=` makes every size negative, which leaves every ratio of sizes as it is
const sizeOf = (f: Fraction): Fraction => (f.num < BigInt(0) ? { num: -f.num, den: f.den } : f);
// The operator of a node that has one; the kind is not checked, as any other node has none.
const opOf = (n: FormulaNode): string | undefined => (n as { op?: string }).op;
type OpNode = Extract<FormulaNode, { k: "op" }>;
const isSum = (n: FormulaNode) => n.k === "neg" || opOf(n) === "+" || opOf(n) === "-";
/** The terms of a sum through every + and − (and minus sign), each with whether it is taken away: a − (b − c) has a, b taken and c. */
function termsOf(n: FormulaNode, taken: boolean, out: { n: FormulaNode; taken: boolean }[] = []) {
  if (n.k === "neg") termsOf(n.a, !taken, out);
  else if (opOf(n) === "+" || opOf(n) === "-") {
    termsOf((n as OpNode).a, taken, out);
    termsOf((n as OpNode).b, opOf(n) === "-" ? !taken : taken, out);
  } else out.push({ n, taken });
  return out;
}
/** The factors of a product through every × and ÷, each with whether it divides: a / (b / c) has a, b dividing and c. */
function factorsOf(n: FormulaNode, divides: boolean, out: { n: FormulaNode; divides: boolean }[] = []) {
  if (opOf(n) === "*" || opOf(n) === "/") {
    factorsOf((n as OpNode).a, divides, out);
    factorsOf((n as OpNode).b, opOf(n) === "/" ? !divides : divides, out);
  } else out.push({ n, divides });
  return out;
}

/** The name of a box that is no Metric: its parts' names with the operators between them. */
function expressionName(kids: Built[], sum: boolean): string {
  const parts = kids.map((k, i) => {
    const sign = sum ? (k.taken ? "−" : i ? "+" : "") : k.how === "divisor" ? "÷" : i ? "×" : "";
    return sign ? `${sign} ${k.expr}` : k.expr;
  });
  return parts.join(" ");
}
const decimalsOfText = (t: string) => (t.split(".")[1] ?? "").length;
const same = (a: ValueUnit, b: ValueUnit) => a.unit === b.unit && a.unit_position === b.unit_position;

function make(n: FormulaNode, level: number, how: Built["how"], taken: boolean, ctx: Ctx, alone = false): Built {
  if (++ctx.count > TREE.boxes) throw new Refused(`Not drawn: the formula has more than the ${TREE.boxes} boxes that read clearly in a chart.`);
  if (level >= TREE.levels) throw new Refused(`Not drawn: the formula has more than the ${TREE.levels} levels that read clearly in a chart.`);
  const base = { how, taken, kids: [] as Built[], op: null as Built["op"], notes: [] as string[], why: null as string | null };
  // A formula that is a single value is a box with that one part: `alone` makes the root a sum of one.
  if (n.k === "num" && !alone) return { ...base, name: "Number", expr: n.v, exact: fractionOfText(n.v), unit: null, decimals: decimalsOfText(n.v) };
  if (!alone && "slug" in n) {
    // The nodes with a slug are a Metric and `back` (prev, change), which is refused before a tree is built: what is left is a Metric of the formula.
    const leaf = ctx.leaves[n.slug]!;
    const known = Number.isFinite(leaf.value);
    return { ...base, name: plain(leaf.name), expr: plain(leaf.name), notes: leaf.note ? [leaf.note] : [], exact: known ? fractionOf(leaf.value as number) : null, unit: leaf.unit, decimals: leaf.unit.decimals };
  }
  const sum = alone || isSum(n);
  const kids = sum ? termsOf(n, false).map((t) => make(t.n, level + 1, "term", t.taken, ctx)) : factorsOf(n, false).map((f) => make(f.n, level + 1, f.divides ? "divisor" : "factor", false, ctx));
  const name = expressionName(kids, sum);
  const out: Built = { ...base, op: sum ? "sum" : "product", kids, name, expr: `(${name})`, notes: unique(kids.flatMap((k) => k.notes)), exact: null, unit: null, decimals: Math.max(...kids.map((k) => k.decimals)) };
  const missing = kids.find((k) => k.exact === null);
  if (missing) return { ...out, why: "a part of it has no value" };
  if (sum) {
    // One unit when every part is a Metric of the same unit (a difference of euros is euros); a sum with a number or another unit has none.
    const units = kids.map((k) => k.unit);
    const first = units[0];
    out.unit = first && units.every((u) => u && same(u, first)) ? first : null;
    return finish(out, kids.reduce<Fraction>((acc, k) => lowestTerms(k.taken ? minus(acc, k.exact!) : plus(acc, k.exact!)), ZERO));
  }
  if (kids.some((k) => k.how === "divisor")) out.decimals = Math.max(out.decimals, 2);
  const zero = kids.find((k) => k.how === "divisor" && k.exact!.num === BigInt(0));
  if (zero) return { ...out, why: "it divides by 0" };
  return finish(out, kids.reduce<Fraction>((acc, k) => lowestTerms(k.how === "divisor" ? over(acc, k.exact!) : times(acc, k.exact!)), ONE));
}
// A result past the bounds of a formula has no value, as for `evaluate`.
function finish(b: Built, exact: Fraction): Built {
  return fits(exact) ? { ...b, exact } : { ...b, why: "it cannot be worked out exactly" };
}

/** A number written with at least `decimals` places and as many more as it takes for one that is not 0 never to be written as 0; null where even 20 do not. */
export function write(v: number | null, unit: ValueUnit | null, decimals: number, style: NumberStyle): string | null {
  for (let d = decimals; d <= MOST_DECIMALS; d++) {
    if (v === 0 || /[1-9]/.test(formatNumber(v, d, style))) return unit ? formatValue({ ...unit, decimals: d }, v, style) : formatNumber(v, d, style);
  }
  return null;
}
/** A percent written with as many decimals as it takes never to write a share that is not 0 as 0; null where even 20 do not. */
export function writePercent(p: number | null, style: NumberStyle): string | null {
  for (let d = 1; d <= MOST_DECIMALS; d++) {
    if (p === 0 || /[1-9]/.test(formatNumber(p, d, style))) return formatPercent(p, style, d);
  }
  return null;
}

/** Where a part stands to the box above, in words. */
const roleWords = (b: TreeBox) => (b.how === "divisor" ? "divides" : b.how === "factor" ? "multiplies" : b.taken ? "taken away" : "added");
/** A box named with its number, or with the words that it has none. */
const head = (b: TreeBox, why: string | null) => (b.value === null ? `${b.label}: no value${why ? ` (${why})` : ""}` : `${b.label} ${b.text}`);

/** The formula tree of a Derived Metric from the inputs the widget has: the boxes with their exact numbers, or why none is drawn. Hostile or odd formulas are refused in words; nothing is drawn from a part that could not be read whole. */
export function formulaTree(source: TreeSource, style: NumberStyle): TreeModel {
  const no = (refusal: string): TreeModel => ({ ok: false, refusal });
  if (usesPrevious(source.formula)) return no(`Not drawn: ${plain(source.name)} is worked out from the period before as well (prev or change), which a tree of parts cannot show.`);
  const slugs = formulaInputs(source.formula);
  // An input that is not shared with the person is neither named nor valued, nor drawn as "the rest": see the module's note.
  if (slugs.some((s) => source.leaves[s] === undefined)) return no(`Not drawn: ${plain(source.name)} is calculated from Metrics that are not all shared here, so its parts are not shown.`);
  const read = readFormula(source.formula);
  if (!read.ok) return no(`Not drawn: the formula of ${plain(source.name)} cannot be read. ${read.reason}`);
  let top: Built;
  try {
    top = make(read.node, 0, "root", false, { leaves: source.leaves, count: 0 }, !("a" in read.node));
  } catch (e) {
    // Only `make` throws, and only to refuse a formula that is too big.
    return no((e as Refused).message);
  }
  const boxes: TreeBox[] = [];
  const whys: (string | null)[] = [];
  let tooSmall = false;
  let noted = false;
  // A box, then its parts left to right; `share` is the part's exact share of its sum, when it is a part of one.
  const place = (b: Built, parent: number | null, share: Fraction | null, index: number): void => {
    const id = boxes.length;
    const notes = unique([...b.notes, ...(parent === null && source.note ? [source.note] : [])]);
    noted ||= notes.length > 0;
    const root = parent === null;
    const title = plain(source.name);
    const value = b.exact === null ? null : nearest(b.exact);
    // A box with no value has nothing to write: `write` says none for it.
    const written = write(value, root ? source.unit : b.unit, root ? source.unit.decimals : b.decimals, style);
    const pct = share === null ? null : nearest(times(share, { num: BigInt(100), den: BigInt(1) }));
    const shareText = writePercent(pct, style);
    // A number the doubles cannot tell from 0 (the exact value is not 0, the nearest double is) is never written as 0.
    tooSmall ||= (value !== null && written === null) || (pct !== null && shareText === null) || (value === 0 && b.exact!.num !== BigInt(0));
    const glyph = b.how === "divisor" ? "÷" : b.how === "factor" ? (index ? "×" : null) : b.taken ? "−" : index ? "+" : null;
    boxes.push({
      id, parent, level: parent === null ? 0 : boxes[parent].level + 1, label: notes.length ? `${root ? title : b.name} (${notes.join(", ")})` : root ? title : b.name, how: b.how, glyph, taken: b.taken, op: b.op, value, text: written ?? "no value", why: b.why,
      share: share === null ? null : nearest(share), shareText, scaled: b.how !== "factor" && b.how !== "divisor",
      // Written once every box is known, below.
      // Stryker disable next-line StringLiteral: a placeholder, written over below
      alt: "",
    });
    whys.push(b.why);
    // The sizes of a sum's parts and their total, exactly: each share is a size over the total, so they add up to exactly 1.
    const sizes = b.op === "sum" ? b.kids.map((k) => (k.exact === null ? null : sizeOf(k.exact))) : [];
    const total = sizes.reduce<Fraction>((acc, z) => (z === null ? acc : plus(acc, z)), ZERO);
    b.kids.forEach((k, i) => place(k, id, sizes[i] && total.num !== BigInt(0) ? lowestTerms(over(sizes[i]!, total)) : null, i));
  };
  place(top, null, null, 0);
  if (tooSmall) return no("Not drawn: some numbers are too small to write out in full.");
  for (const b of boxes) {
    const tail = [b.how === "root" ? "" : roleWords(b), b.shareText ? `${b.shareText} of the parts` : ""].filter(Boolean);
    b.alt = [head(b, whys[b.id]), ...tail].join(", ");
  }
  const lines = boxes.filter((b) => b.op !== null).map((b) => `${head(b, whys[b.id])} is ${b.op === "sum" ? "made of" : "worked out from"}: ${boxes.filter((k) => k.parent === b.id).map((k) => k.alt).join("; ")}.`);
  const has = { sum: boxes.some((b) => b.op === "sum"), product: boxes.some((b) => b.op === "product"), taken: boxes.some((b) => b.taken), gap: boxes.some((b) => b.value === null) };
  const rule = [
    "Each box is one number of the formula, worked out exactly.",
    has.sum ? `Parts that are added up share the width of the box above them by their size.${has.taken ? ` A part that is taken away is hatched and counts by its size, so its share is of the size of the parts, not of the total.${boxes[0].op === "sum" && boxes[0].value !== null && boxes.some((b) => b.parent === 0 && b.taken) ? " The top box is drawn at its own size on the same scale as its parts, so a result smaller than its parts is narrower." : ""}` : ""}` : "",
    has.product ? "The factors of a product or a ratio share the width equally and are not to scale: a product is not the sum of its factors." : "",
    has.gap ? `A box with no value is a gap, never a 0${has.sum ? ", and shares are of the parts that have a value" : ""}.` : "",
    noted ? "A note in brackets says why a number is not for a whole period." : "",
  ].filter(Boolean).join(" ");
  return { ok: true, boxes, period: source.period, rule, alt: `Formula tree of ${plain(source.name)} for ${source.period}. ${rule} ${lines.join(" ")}` };
}

const unitOf = (m: ValueUnit): ValueUnit => ({ decimals: m.decimals, unit: m.unit, unit_position: m.unit_position });

/** The widget's own settings a tree reads: the period it is shown by, and the day it counts "to date" from. */
export type TreeOptions = { display?: DisplayPeriod | null; asOf?: WidgetSettings["asOf"] };

/** The formula tree of a Derived Metric from what the widget was given: only Metrics in `data` are inputs (a Metric the person may not see, or that a View Link or Snapshot leaves out, is not there), each by the same Display Period, for the newest period any of them has a value in. */
export function treeFromData(metric: Metric | undefined, data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today" | "condensed" | "numberStyle">, opts: TreeOptions = {}): TreeModel {
  const no = (refusal: string): TreeModel => ({ ok: false, refusal });
  if (!metric) return no("There is no Metric to draw a tree of.");
  if (!metric.formula) return no(`Not drawn: ${plain(metric.name)} is not calculated from other Metrics, so it has no formula to draw.`);
  const bySlug = new Map(data.metrics.map((m) => [m.slug, m]));
  const slugs = formulaInputs(metric.formula);
  // Not named: the words are the same whichever input is missing, and for one that is withheld by its owner.
  if (metric.inputs_withheld || slugs.some((s) => !bySlug.has(s))) return no(`Not drawn: ${plain(metric.name)} is calculated from Metrics that are not all shared here, so its parts are not shown.`);
  // A part whose values were not sent (a canvas still fetching them) is not a part with no value.
  if (slugs.some((s) => data.series[s] === undefined)) return no("Not drawn: the values of its parts are not loaded yet.");
  const inputs = slugs.map((s) => bySlug.get(s)!);
  const problem = inputsProblem(metric, inputs);
  if (problem) return no(`Not drawn: ${problem}`);
  const today = opts.asOf ? dayAfter(opts.asOf) : undefined;
  // A Snapshot's day: later periods are not part of it, whatever the data holds.
  const shown = (m: Metric) => {
    const s = shownSeries(m, data, opts.display, { today });
    return opts.asOf ? { ...s, points: s.points.filter((p) => p.period <= opts.asOf!) } : s;
  };
  const own = shown(metric);
  const parts = inputs.map((m) => ({ m, shown: shown(m) }));
  if (parts.some((p) => p.shown.by !== own.by)) return no("Not drawn: the parts of the formula cannot be shown by the same period here, so they cannot be set side by side.");
  // The Metric's own newest period when it has a value; else the newest any part has, so that a part still missing is shown as the gap it is.
  const ownLatest = [...own.points].reverse().find((p) => Number.isFinite(p.value));
  const periods = [...own.points, ...parts.flatMap((p) => p.shown.points)].map((p) => p.period).sort();
  const period = ownLatest?.period ?? periods[periods.length - 1];
  if (period === undefined) return no("There are no values to draw yet.");
  const at = (points: typeof own.points) => points.find((p) => p.period === period);
  if ([at(own.points), ...parts.map((p) => at(p.shown.points))].some((p) => p?.condensed)) return no(CONDENSED);
  const resolve = resolverFrom(data.metrics, data.series);
  const leaves: Record<string, TreeLeaf> = Object.fromEntries(parts.map(({ m, shown: s }) => {
    // Over the Metric's own span, as the Metric itself is combined: a part with a value later than the Metric's own latest does not add it to a running span.
    const value = ownLatest ? valueOver(m.slug, ownLatest.period, ownLatest.through, resolve, periodCount(metric.period, ownLatest.period, ownLatest.through, data.yearStart)) : at(s.points)?.value;
    const p = ownLatest ?? at(s.points);
    return [m.slug, { name: m.name, value: value ?? null, note: p ? pointNote(p, m.period) : undefined, unit: unitOf(m) }];
  }));
  const root = at(own.points);
  return formulaTree({ name: metric.name, unit: unitOf(metric), formula: metric.formula, period: periodLabel(period, own.by, data.yearStart), note: root ? pointNote(root, metric.period) : undefined, leaves }, data.numberStyle);
}
