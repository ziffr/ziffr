// The bridge slide (spec 0069; GLOSSARY: Slide Type, Breakdown, Total, Derived Metric; spec 0041, Method `bridge`): the
// change since the period before, a step for each part: a Breakdown's rows, a Total's parts, or the inputs of a Derived
// Metric that adds and subtracts. What the parts leave out is a step of its own. The steps are worked out by the Method.
// Visibility: only the slide's listed Metrics are read. A Total or a formula that reads a Metric not listed or not shown
// is refused whole, so that no remainder gives its value away. Pure.
import { formulaInputs, readFormula, type FormulaNode } from "../../formula";
import { bridge as workOut, type Part } from "../../methods/bridge";
import { shiftPeriod } from "../../periods";
import { scaleOf, scaleUnit, writeSlideValue } from "../../slide-figures";
import { countedParts } from "../../totals";
import type { Metric } from "../../types";
import { chartTitle } from "../chart";
import type { Obj } from "../objects";
import type { Region, SlideType } from "../slide-type";
import type { Role } from "../theme";
import { bridgeHeadline, cannotHeadline } from "./headlines";
import { latestPoint, listedData, nameOf, NOT_THERE, periodWords, readsMore, sourceOf, unitWords, valueIn, type Listed } from "./listed";

/** One column of a bridge: where it starts and ends, and its figure as written. */
export type BridgeColumn = { label: string; from: number; to: number; text: string; kind: "end" | "part" | "rest" };
/** What a bridge slide shows. */
export type BridgeContent = { title: string; unit: string; columns: BridgeColumn[]; higher: boolean | null };

/** The most steps for parts a bridge holds; the smallest beyond them are added together and said to be. */
export const BRIDGE_STEPS = 8;

/** The parts of a change, or the sentence that says why there are none to show. */
type Parts = { parts: Part[]; rest: string } | { cannot: string };

type Term = { slug: string; weight: 1 | -1 };

/** A formula's Metrics with the sign each is added with; null where it does more than add and subtract. */
function signed(node: FormulaNode, sign: 1 | -1, out: Term[]): Term[] | null {
  const flipped = sign === 1 ? -1 : 1;
  if (node.k === "num") return out;
  if (node.k === "ref") return [...out, { slug: node.slug, weight: sign }];
  if (node.k === "neg") return signed(node.a, flipped, out);
  if (node.k !== "op" || (node.op !== "+" && node.op !== "-")) return null;
  const left = signed(node.a, sign, out);
  return left && signed(node.b, node.op === "+" ? sign : flipped, left);
}

function totalParts(total: Metric, { data }: Listed, listed: number[], before: string, after: string): Parts {
  const name = nameOf(total);
  const list = data.totalLists?.[total.id];
  // One that is not shown, in either period, refuses all: what is left over must never be one Metric's value.
  if (!list || list.hidden || list.others.includes(before) || list.others.includes(after)) return { cannot: readsMore(name) };
  if (list.parts.some((p) => !listed.includes(p.part))) return { cannot: readsMore(name) };
  const then = new Set(countedParts(list.parts, before));
  const now = new Set(countedParts(list.parts, after));
  const parts = list.parts.flatMap((p): Part[] => {
    const metric = data.metrics.find((m) => m.id === p.part);
    if (!metric || (!then.has(p.part) && !now.has(p.part))) return [];
    return [{ label: nameOf(metric), before: then.has(p.part) ? valueIn(metric, data, before) : null, after: now.has(p.part) ? valueIn(metric, data, after) : null }];
  });
  return { parts, rest: "Not in the parts" };
}

function formulaParts(metric: Metric, { data }: Listed, before: string, after: string): Parts {
  const name = nameOf(metric);
  const bySlug = new Map(data.metrics.map((m) => [m.slug, m]));
  const formula = metric.formula!;
  if (metric.inputs_withheld || formulaInputs(formula).some((slug) => !bySlug.has(slug))) return { cannot: readsMore(name) };
  const read = readFormula(formula);
  const terms = read.ok ? signed(read.node, 1, []) : null;
  if (!terms?.length || new Set(terms.map((t) => t.slug)).size < terms.length) {
    return { cannot: `${name} is not only added and subtracted from other Metrics, each once, so a step for each would mislead.` };
  }
  const inputs = terms.map((t) => ({ metric: bySlug.get(t.slug)!, weight: t.weight }));
  if (inputs.some((i) => i.metric.period !== metric.period)) return { cannot: `The parts of ${name} have other periods than it has, so they cannot be set side by side.` };
  const parts = inputs.map((i) => ({ label: nameOf(i.metric), weight: i.weight, before: valueIn(i.metric, data, before), after: valueIn(i.metric, data, after) }));
  if (parts.some((p) => p.before === null || p.after === null)) return { cannot: `Not every part of ${name} has a value in both periods, so a step for each would mislead.` };
  return { parts, rest: "Not in the parts" };
}

function rowParts(metric: Metric, { data }: Listed, before: string, after: string): Parts {
  const rows = (period: string) => new Map((data.breakdowns[metric.id]?.[period] ?? []).map((r) => [r.label, r.value]));
  const then = rows(before);
  const now = rows(after);
  if (!then.size || !now.size) return { cannot: `${nameOf(metric)} has no Breakdown in both periods, so its change cannot be split.` };
  const labels = [...new Set([...now.keys(), ...then.keys()])];
  return { parts: labels.map((label) => ({ label, before: then.get(label) ?? null, after: now.get(label) ?? null })), rest: "Not in these rows" };
}

/** Where the parts come from: the Total's list, the formula where the slide lists its Metrics, else the Breakdown. */
function partsOf(listed: Listed, ids: number[], before: string, after: string): Parts {
  const metric = listed.metrics[0]!;
  if (metric.total) return totalParts(metric, listed, ids, before, after);
  const broken = Object.keys(listed.data.breakdowns[metric.id] ?? {}).length > 0;
  if (metric.formula && (ids.length > 1 || !broken)) return formulaParts(metric, listed, before, after);
  if (broken) return rowParts(metric, listed, before, after);
  return { cannot: `${nameOf(metric)} has no Breakdown, is no Total and is not calculated from other Metrics, so its change cannot be split.` };
}

/** A waterfall: the two ends, a step for each part, and the figure and name of each column. */
function draw({ title, unit, columns, higher }: BridgeContent, { x, y, w, h, pen, measure }: Region): Obj[] {
  const top = y + 54;
  const bottom = y + h - 74;
  const ends = columns.flatMap((c) => [c.from, c.to]);
  const low = Math.min(0, ...ends);
  const high = Math.max(0, ...ends);
  const at = (v: number) => bottom - ((v - low) / (high - low || 1)) * (bottom - top);
  const band = w / columns.length;
  const wide = Math.min(110, band * 0.64);
  const fill = (c: BridgeColumn): Role => {
    if (c.kind === "end") return "neutral";
    if (c.kind === "rest" || higher === null) return "neutral2";
    return c.to > c.from === higher ? "good" : "bad";
  };
  const marks: Obj[] = [pen.line([x, at(0)], [x + w, at(0)], { color: "ink" })];
  const words: Obj[] = [];
  for (const [i, c] of columns.entries()) {
    const left = x + i * band + (band - wide) / 2;
    const upper = Math.min(at(c.from), at(c.to));
    const tall = Math.max(2, Math.abs(at(c.from) - at(c.to)));
    marks.push(
      pen.rect({ x: left, y: Math.min(upper, bottom - 2), w: wide, h: tall }, fill(c), {
        alt: `${c.label}: ${c.text}`,
        stroke: c.kind === "rest" ? { color: "muted", width: 1 } : undefined,
      }),
    );
    // The dashed line carries the level on to the next step.
    if (i < columns.length - 1) marks.push(pen.line([left + wide, at(c.to)], [left + band, at(c.to)], { color: "muted", dash: true }));
    // A figure stands over its column, or under a total that reaches below zero.
    const under = c.kind === "end" && c.to < 0;
    words.push(
      pen.text({ x: x + i * band, y: under ? upper + tall + 2 : upper - 19, w: band, h: 17 }, [measure.fit(c.text, band, { size: 12, bold: true }, 1)], {
        size: 12,
        bold: true,
        align: "center",
        line: 1.3,
        wrap: false,
      }),
    );
    words.push(pen.text({ x: x + i * band + 2, y: y + h - 52, w: band - 4, h: 50 }, [measure.fit(c.label, band - 4, { size: 12 }, 3)], { size: 12, align: "center", line: 1.3 }));
  }
  const alt = `${title}: ${columns.map((c) => `${c.label} ${c.text}`).join(", ")}`;
  return [...chartTitle(pen, measure, { x, y, w }, title, unit), pen.group("Bridge", alt, [...marks, ...words])];
}

/** The bridge. */
export const bridge: SlideType<BridgeContent> = {
  id: "bridge",
  section: "Drivers",
  wide: true,
  /** The change of the first Metric since the period before, split into its parts. */
  fill(slide, data) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const metric = listed.metrics[0]!;
    const name = nameOf(metric);
    const cannot = (why: string) => ({ headline: cannotHeadline("change", name), source: sourceOf(listed.metrics), cannot: why });
    const after = latestPoint(metric, listed.data)?.period;
    if (!after) return cannot(`${name} has no value yet.`);
    const before = shiftPeriod(after, metric.period, -1);
    // The parts are asked first: why they cannot be shown says more than a missing value.
    const found = partsOf(listed, slide.metrics, before, after);
    if ("cannot" in found) return cannot(found.cannot);
    const was = valueIn(metric, listed.data, before);
    const is = valueIn(metric, listed.data, after)!;
    if (was === null) return cannot(`${name} has no value for ${periodWords(metric, data, before)}, so there is no change to split.`);
    const worked = workOut(found.parts, { before: was, after: is });
    if (!worked.ok) return cannot(`${name} has no parts to show for these periods.`);
    const shown = worked.parts.length > BRIDGE_STEPS ? worked.parts.slice(0, BRIDGE_STEPS - 1) : worked.parts;
    const others = worked.parts.slice(shown.length);
    const steps: { label: string; change: number; kind: BridgeColumn["kind"] }[] = shown.map((p) => ({ label: p.label, change: p.change, kind: "part" }));
    if (others.length) steps.push({ label: `Other (${others.length})`, change: others.reduce((sum, p) => sum + p.change, 0), kind: "part" });
    // A rest the doubles make out of nothing is none.
    const left = worked.unexplained ?? 0;
    const rest = Math.abs(left) > 1e-9 * Math.max(1, Math.abs(was), Math.abs(is)) ? left : 0;
    if (rest) steps.push({ label: found.rest, change: rest, kind: "rest" });
    const scale = scaleOf(Math.max(Math.abs(was), Math.abs(is), ...steps.map((s) => Math.abs(s.change))));
    const write = (v: number, change = false) => writeSlideValue(metric, v, scale, data, { bare: true, change });
    const columns: BridgeColumn[] = [{ label: periodWords(metric, data, before), from: 0, to: was, text: write(was), kind: "end" }];
    let level = was;
    for (const s of steps) {
      columns.push({ label: s.label, from: level, to: level + s.change, text: write(s.change, true), kind: s.kind });
      level += s.change;
    }
    columns.push({ label: periodWords(metric, data, after), from: 0, to: is, text: write(is), kind: "end" });
    const oneSided = worked.parts.filter((p) => p.appeared || p.gone).map((p) => p.label);
    const notes = [
      others.length ? `Other adds together the ${others.length} smallest changes.` : "",
      oneSided.length ? `No value in one of the two periods, counted as 0 there: ${oneSided.join(", ")}.` : "",
    ].filter(Boolean);
    return {
      headline: bridgeHeadline(name, worked.change, writeSlideValue(metric, was, scale, data), writeSlideValue(metric, is, scale, data)),
      source: sourceOf(listed.metrics, `${periodWords(metric, data, before)} to ${periodWords(metric, data, after)}`),
      note: notes.join(" ") || undefined,
      content: {
        title: `${name}, change since the period before`,
        unit: unitWords(scaleUnit(metric, scale)),
        columns,
        higher: metric.polarity === "target" ? null : metric.polarity === "higher",
      },
    };
  },
  draw,
};
