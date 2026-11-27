// The driver tree slide (spec 0069; GLOSSARY: Slide Type, Derived Metric, Total, Formula Tree): a Derived Metric, the
// Metrics its formula reads and, one level further, the parts of those that are Totals (the only inputs with Metrics of
// their own: Ziffr works out formulas one level deep), each with its value and its change since the period before. The
// rules are the Formula Tree's (`treeFromData`). Visibility: only the slide's listed Metrics are read. Where one the
// formula reads is not listed or not shown, the whole tree is refused. A Total whose parts are not all listed and shown
// stays closed: no part of it is drawn beside a gap that would give a value away. Pure.
import { formulaInputs } from "../../formula";
import { treeFromData } from "../../formula-tree";
import { shiftPeriod } from "../../periods";
import { scaleOf, writeSlideValue } from "../../slide-figures";
import { countedParts } from "../../totals";
import type { CanvasData, Metric } from "../../types";
import { chartTitle } from "../chart";
import { para, textBody, type Obj, type ShapeObj } from "../objects";
import type { Region, SlideType } from "../slide-type";
import { cannotHeadline, treeHeadline } from "./headlines";
import { latestPoint, listedData, nameOf, NOT_THERE, periodWords, readsMore, sourceOf, valueIn, type Listed } from "./listed";

/** One Metric of the tree: its figures in words, whether its change is good, how it is calculated where it is opened,
 * and the Metrics that calculation reads. */
export type TreeNode = { name: string; value: string; change: string; signal: "good" | "bad" | null; formula: string | null; inputs: TreeNode[] };
/** What a driver tree slide shows. */
export type TreeContent = { title: string; root: TreeNode };

/** The most levels a driver tree has and the most boxes it holds. */
export const DRIVER_TREE = { levels: 3, boxes: 12 } as const;

/** A formula in its Metrics' names; only the signs between them are rewritten, never a name. */
function inWords(formula: string, names: Map<string, string>): string {
  return formula
    .split(/\{([^{}]*)\}/)
    .map((piece, i) => (i % 2 ? (names.get(piece.trim()) ?? "?") : piece.replaceAll("-", "−").replaceAll("*", "×").replaceAll("/", "÷")))
    .join("");
}

/** The parts of a Total where every one counting in the period, or in the one before, is listed and shown; else none,
 * so that no sum of some of them stands beside the Total. */
function openParts(total: Metric, data: CanvasData, period: string): Metric[] {
  const list = data.totalLists?.[total.id];
  const periods = [shiftPeriod(period, total.period, -1), period];
  if (!list || list.hidden || periods.some((p) => list.others.includes(p))) return [];
  const ids = [...new Set(periods.flatMap((p) => countedParts(list.parts, p)))];
  const parts = ids.flatMap((id) => data.metrics.find((m) => m.id === id) ?? []);
  return parts.length === ids.length ? parts : [];
}

/** The tree below a Metric, or the sentence that says why none of it is drawn. */
function grow(root: Metric, { data }: Listed, period: string, levels: number): TreeNode | { cannot: string } {
  const bySlug = new Map(data.metrics.map((m) => [m.slug, m]));
  const names = new Map(data.metrics.map((m) => [m.slug, nameOf(m)]));
  const read = formulaInputs(root.formula!);
  if (root.inputs_withheld || read.some((slug) => !bySlug.has(slug))) return { cannot: readsMore(nameOf(root)) };
  const rules = treeFromData(root, data, { asOf: period });
  if (!rules.ok) return { cannot: rules.refusal };
  let boxes = 0;
  const node = (metric: Metric, level: number): TreeNode => {
    boxes++;
    const value = valueIn(metric, data, period);
    const before = valueIn(metric, data, shiftPeriod(period, metric.period, -1));
    const change = value === null || before === null ? null : value - before;
    const scale = scaleOf(Math.max(Math.abs(value ?? 0), Math.abs(change ?? 0)));
    const parts = level === 1 || level >= levels || !metric.total ? [] : openParts(metric, data, period);
    const inputs = level === 1 ? read.map((slug) => bySlug.get(slug)!) : parts;
    return {
      name: nameOf(metric),
      value: value === null ? "no value" : writeSlideValue(metric, value, scale, data),
      change: change === null ? "" : writeSlideValue(metric, change, scale, data, { change: true }),
      signal: !change || metric.polarity === "target" ? null : change > 0 === (metric.polarity === "higher") ? "good" : "bad",
      formula: level === 1 ? inWords(root.formula!, names) : parts.length ? parts.map(nameOf).join(" + ") : null,
      inputs: inputs.map((m) => node(m, level + 1)),
    };
  };
  const tree = node(root, 1);
  return boxes > DRIVER_TREE.boxes ? { cannot: `Not drawn: the tree has more than the ${DRIVER_TREE.boxes} boxes that read clearly on a slide.` } : tree;
}

const GAP = 40;
const leaves = (n: TreeNode): number => (n.inputs.length ? n.inputs.reduce((sum, i) => sum + leaves(i), 0) : 1);
const depth = (n: TreeNode): number => 1 + Math.max(0, ...n.inputs.map(depth));

/** The boxes from left to right, each beside its inputs and joined to them. */
function draw({ title, root }: TreeContent, { x, y, w, h, pen, measure }: Region): Obj[] {
  const top = y + 36;
  const row = Math.min(84, (h - 36) / leaves(root));
  const levels = depth(root);
  const wide = Math.min(360, (w - GAP * (levels - 1)) / levels);
  const shapes: Obj[] = [];
  const links: Obj[] = [];
  /** Draws a node in the rows from `from`, and its inputs to its right. */
  const place = (node: TreeNode, level: number, from: number): ShapeObj => {
    const span = leaves(node);
    const tall = Math.min(64, span * row - 6);
    const box = { x: x + level * (wide + GAP), y: top + from * row + (span * row - tall) / 2, w: wide, h: tall };
    const room = wide - 24;
    const figures = [node.value, node.change && `${node.change} on the period before`].filter(Boolean).join(" · ");
    // The calculation is shown where the box is high enough; it is always in the description of the box.
    const formula = node.formula && tall >= 52 ? [para(measure.fit(`= ${node.formula}`, room, { size: 11 }, 1), { size: 11, color: "muted" })] : [];
    const shape = pen.shape("rect", box, {
      fill: level === 0 ? "neutral2" : node.inputs.length ? "canvas" : "surface",
      stroke: { color: "rule", width: 1 },
      body: textBody([para(measure.fit(node.name, room, { size: 12, bold: true }, 1), { bold: true }), para(measure.fit(figures, room, { size: 12 }, 1)), ...formula], {
        size: 12,
        line: 1.2,
        valign: "middle",
        inset: [14, 1, 8, 1],
      }),
      alt: [node.name, figures, node.formula && `calculated as ${node.formula}`].filter(Boolean).join(", "),
    });
    shapes.push(shape);
    if (node.signal) shapes.push(pen.rect({ x: box.x, y: box.y, w: 5, h: box.h }, node.signal));
    let next = from;
    for (const input of node.inputs) {
      links.push(pen.connector(shape, place(input, level + 1, next)));
      next += leaves(input);
    }
    return shape;
  };
  place(root, 0, 0);
  return [...chartTitle(pen, measure, { x, y, w }, title, "each in its own unit"), pen.group("Driver tree", `Driver tree: ${title}`, [...links, ...shapes])];
}

/** The driver tree. */
export const driverTree: SlideType<TreeContent> = {
  id: "driver-tree",
  section: "Drivers",
  wide: true,
  /** The tree below the first Metric for its newest period. */
  fill(slide, data) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const metric = listed.metrics[0]!;
    const name = nameOf(metric);
    const cannot = (why: string) => ({ headline: cannotHeadline("drivers", name), source: sourceOf(listed.metrics), cannot: why });
    if (!metric.formula) return cannot(metric.inputs_withheld ? readsMore(name) : `${name} is not calculated from other Metrics, so it has no drivers to draw.`);
    const period = latestPoint(metric, listed.data)?.period;
    if (!period) return cannot(`${name} has no value yet.`);
    const root = grow(metric, listed, period, slide.options.levels === 2 ? 2 : DRIVER_TREE.levels);
    if ("cannot" in root) return cannot(root.cannot);
    const words = periodWords(metric, data, period);
    return {
      headline: treeHeadline(name, root.value, words),
      source: sourceOf(listed.metrics, words),
      content: { title: `${name} and what it is calculated from, ${words}`, root },
    };
  },
  draw,
};
