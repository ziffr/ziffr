// Live words in a slide's text boxes (GLOSSARY: Placeholder, Slide, Deck; ticket #1172): which Metrics a text box
// names and what its Placeholders say each time it is drawn. Pure, so the core, the editor, presenting, View Links and
// the exports decide it the same way.
// A text box (words, a box or a note with words, an arrow's label) keeps its Placeholders in the deck's document and
// the Metrics they count in `meta.metrics`, in Slot order: {latest 2} is the second.
// Visibility: the document holds no name and no number. They are filled from the data the viewer was sent, and a Metric
// not in it becomes empty words. Only the Metrics the words ask for count as the box's: a deck's Share opens those,
// and a deck is stored with every other place of a list empty (0).
import { fillSlideWords, SLIDE_PATTERN } from "./slide-figures";
import type { CanvasData } from "./types";

/** The shapes of a slide that hold words of their own. */
export const TEXT_SHAPE_TYPES: ReadonlySet<string> = new Set(["text", "geo", "note", "arrow"]);
/** The most Metrics one text box names: a Placeholder counts them with one digit. */
export const TEXT_METRICS_MAX = 9;
/** How deep a rich text is read; the editor nests a handful of levels. */
const MAX_DEPTH = 40;
/** The Placeholders that read two Metrics. */
const PAIRS: ReadonlySet<string> = new Set(["difference", "gap", "left"]);

/** What of a text box's record this module reads; everything in it comes from a browser and is untrusted. */
export type TextShapeLike = { type?: unknown; props?: unknown; meta?: unknown };

type RichNode = { text?: unknown; content?: unknown };

/** A rich text with every run of words changed; its structure stays. */
export function mapRichText(rich: unknown, change: (text: string) => string, depth = 0): unknown {
  if (!rich || typeof rich !== "object" || depth > MAX_DEPTH) return rich;
  const node = rich as RichNode;
  return {
    ...node,
    ...(typeof node.text === "string" ? { text: change(node.text) } : {}),
    ...(Array.isArray(node.content) ? { content: node.content.map((c) => mapRichText(c, change, depth + 1)) } : {}),
  };
}

/** The runs of words of a rich text, in order. A Placeholder is read within one run. */
export function richRuns(rich: unknown): string[] {
  const out: string[] = [];
  mapRichText(rich, (t) => (out.push(t), t));
  return out;
}

const richOf = (shape: TextShapeLike) => (shape.props as { richText?: unknown } | null | undefined)?.richText;

/** The list a text box counts its Slots in, or undefined for a box whose words stay as written. */
export function textList(shape: TextShapeLike): unknown {
  return TEXT_SHAPE_TYPES.has(String(shape.type)) ? (shape.meta as { metrics?: unknown } | null | undefined)?.metrics : undefined;
}

/** Whether any of the words holds a Placeholder a slide knows. */
export const holdsPlaceholder = (runs: readonly string[]) => runs.some((t) => t.search(SLIDE_PATTERN) >= 0);

/** The places (from 0) in a list of `count` Metrics that these words ask for. */
export function namedSlots(runs: readonly string[], count: number): Set<number> {
  const named = new Set<number>();
  const take = (i: number) => { if (i >= 0 && i < count) named.add(i); };
  for (const run of runs) {
    for (const [, raw, a, b] of run.matchAll(SLIDE_PATTERN)) {
      const key = raw.toLowerCase();
      if (key === "slide") continue;
      if (key === "metrics") { for (let i = 0; i < count; i++) take(i); continue; }
      take((a ? Number(a) : 1) - 1);
      if (PAIRS.has(key)) take((b ? Number(b) : 2) - 1);
    }
  }
  return named;
}

/** Words with their Slot numbers moved: `to` says where a place of a list of `count` goes (from 0), null for a Metric
 * that is gone, whose Placeholder becomes "…". A Placeholder naming no place of the list stays as written. */
export function renumberSlots(text: string, count: number, to: (place: number) => number | null): string {
  return text.replace(SLIDE_PATTERN, (all, raw: string, a?: string, b?: string) => {
    const key = raw.toLowerCase();
    if (key === "slide" || key === "metrics") return all;
    const pair = PAIRS.has(key);
    const places = [(a ? Number(a) : 1) - 1, ...(pair ? [(b ? Number(b) : 2) - 1] : [])];
    if (places.some((i) => i < 0 || i >= count)) return all;
    const moved = places.map(to);
    if (moved.some((i) => i === null)) return "…";
    if (pair) return `{${key} ${moved.map((i) => i! + 1).join(" ")}}`;
    return placeholder(key, moved[0]!);
  });
}

/** A Placeholder for the Metric in a place of the list (from 0): the first goes without a number. */
export const placeholder = (key: string, place: number) => (place === 0 ? `{${key}}` : `{${key} ${place + 1}}`);

const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

/** A text box's list with every place its words do not ask for emptied (0). */
export function askedList(shape: TextShapeLike, list: readonly unknown[]): unknown[] {
  const named = namedSlots(richRuns(richOf(shape)), list.length);
  return list.map((id, i) => (named.has(i) ? id : 0));
}

/** The Metrics a text box names: those of its list that its words ask for, so a Metric whose Placeholder was deleted
 * counts no longer. An empty place (0) names none. A list Ziffr cannot read yields an id no visibility check
 * accepts. */
export function textMetricIds(shape: TextShapeLike): number[] {
  const list = textList(shape);
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > TEXT_METRICS_MAX) return [Number.NaN];
  const named = namedSlots(richRuns(richOf(shape)), list.length);
  return [...new Set([...named].map((i) => list[i]).filter((id) => id !== 0).map((id) => (isId(id) ? id : Number.NaN)))];
}

/** A deck's document as it is stored: every shape lists only the Metrics its words ask for. Saving checks those for
 * the person saving, so a stored deck names the Metrics its slides show and no others. The same document when
 * nothing changes. */
export function withoutUnaskedMetrics<T>(document: T): T {
  const store = (document as { store?: unknown } | null)?.store;
  if (!store || typeof store !== "object") return document;
  let changed = false;
  const entries = Object.entries(store as Record<string, unknown>).map(([key, r]): [string, unknown] => {
    const shape = r as (TextShapeLike & { typeName?: unknown; meta?: { metrics?: unknown } }) | null;
    const list = shape?.typeName === "shape" ? shape.meta?.metrics : undefined;
    // A list too long to read stays as it is: the save is refused for it.
    if (!Array.isArray(list) || list.length > TEXT_METRICS_MAX) return [key, r];
    const asked = TEXT_SHAPE_TYPES.has(String(shape!.type)) ? askedList(shape!, list) : list.map(() => 0);
    if (asked.every((id, i) => id === list[i])) return [key, r];
    changed = true;
    return [key, { ...shape, meta: { ...shape!.meta, metrics: asked } }];
  });
  return changed ? { ...(document as object), store: Object.fromEntries(entries) } as T : document;
}

/** The Metrics named by any text box of a deck's document. */
export function textBoxMetricIds(document: unknown): number[] {
  const store = (document as { store?: unknown } | null)?.store;
  if (!store || typeof store !== "object") return [];
  const shapes = Object.values(store as Record<string, unknown>).filter((r): r is TextShapeLike => (r as { typeName?: unknown } | null)?.typeName === "shape");
  return [...new Set(shapes.flatMap(textMetricIds))];
}

/** A text box's rich text as one viewer reads it, from the data they were sent: a Metric not in it (one they may not
 * see, or on a slide that keeps numbers one the Snapshot does not give them) becomes empty words, never its name.
 * Undefined for a box whose words stay as written. `slide` is the page number. */
export function filledRichText(shape: TextShapeLike, data: CanvasData, slide?: number): unknown {
  const list = textList(shape);
  if (!Array.isArray(list)) return undefined;
  const rich = richOf(shape);
  const named = namedSlots(richRuns(rich), list.length);
  // Only what the words ask for is handed to the filling, so no other Metric shows through, not even in a scale.
  const metrics = list.map((id, i) => (named.has(i) ? data.metrics.find((m) => m.id === id) ?? null : null));
  return withoutEmptyRuns(mapRichText(rich, (t) => fillSlideWords(t, { data, metrics, slide }).text));
}

/** A rich text without runs of no words, which the editor cannot draw: a run whose values are all hidden is one. */
function withoutEmptyRuns(rich: unknown, depth = 0): unknown {
  const node = rich as RichNode | null;
  if (!node || !Array.isArray(node.content) || depth > MAX_DEPTH) return rich;
  return { ...node, content: node.content.filter((c) => (c as RichNode | null)?.text !== "").map((c) => withoutEmptyRuns(c, depth + 1)) };
}

/** A rich text with words added at its end: after a space in its last paragraph, else in a paragraph of their own. */
export function appendWords(rich: unknown, words: string): unknown {
  const doc = (rich ?? {}) as RichNode & { type?: unknown };
  const blocks = Array.isArray(doc.content) ? (doc.content as (RichNode & { type?: unknown })[]) : [];
  const last = blocks.at(-1);
  const runs = last?.type === "paragraph" ? (Array.isArray(last.content) ? (last.content as RichNode[]) : []) : null;
  const space = runs?.length && !/\s$/.test(String(runs.at(-1)!.text ?? "")) ? " " : "";
  const paragraph = { ...(runs ? last : { type: "paragraph" }), content: [...(runs ?? []), { type: "text", text: `${space}${words}` }] };
  return { ...doc, type: "doc", content: [...(runs ? blocks.slice(0, -1) : blocks), paragraph] };
}

/** What a text box can show of a Metric, as "Insert value" offers it. */
export const TEXT_VALUES = [
  { key: "latest", label: "Value", hint: "the latest value" },
  { key: "metric", label: "Name", hint: "the Metric's name" },
  { key: "period", label: "Period", hint: "the latest period" },
  { key: "target", label: "Target", hint: "the target for the latest period" },
  { key: "change", label: "Change", hint: "the change since the period before, in the Metric's unit" },
  { key: "change prev", label: "Change in %", hint: "the change on the period before, such as “up 4.0 %”" },
  { key: "change yoy", label: "Change on a year before", hint: "the change on a year before, in %" },
  { key: "difference", label: "Difference", hint: "this Metric minus another one, for the same period" },
] as const;
/** One thing "Insert value" offers. */
export type TextValueKey = (typeof TEXT_VALUES)[number]["key"];

/** The Placeholder for one more value in a text box, and the box's list with the Metrics it needs. A Metric already
 * listed keeps its place; a new one takes a place no word asks for any more, so no Metric stays behind that the words
 * dropped. Null when the box can name no more. */
export function addTextValue(runs: readonly string[], list: readonly number[], key: TextValueKey, metricIds: readonly number[]): { list: number[]; words: string } | null {
  const next = [...list].slice(0, TEXT_METRICS_MAX);
  const used = namedSlots(runs, next.length);
  const places: number[] = [];
  for (const id of metricIds) {
    let at = next.indexOf(id);
    if (at < 0) {
      const free = next.findIndex((_, i) => !used.has(i));
      if (free >= 0) next[(at = free)] = id;
      else if (next.length < TEXT_METRICS_MAX) at = next.push(id) - 1;
      else return null;
    }
    used.add(at);
    places.push(at);
  }
  const words = key === "difference" ? `{difference ${places[0] + 1} ${(places[1] ?? places[0]) + 1}}` : placeholder(key, places[0]);
  return { list: next, words };
}
