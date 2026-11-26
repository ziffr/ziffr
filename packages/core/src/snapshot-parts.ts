// Snapshot Parts and the slides that keep numbers (spec 0061; GLOSSARY: Snapshot Part, Snapshot, Deck, Slide): which
// shapes of a deck's document draw a Snapshot's kept numbers, and what such a shape may hold. Pure, so the core, the
// editor, presenting, the exports and View Links decide it the same way.
// Security: a deck's document comes from a browser and reaches everyone the deck is shared with. A part stores the
// Snapshot's id and a part number and nothing else, and no shape on a slide that keeps numbers opens a Metric through
// the deck (visibility.ts reads `liveDocument`). What is drawn there is asked of the core per viewer.
import { widgetMetricIds } from "./widget-metrics";
import type { WidgetSettings } from "./types";

/** The tldraw shape type of a Snapshot Part. */
export const SNAPSHOT_PART_SHAPE = "ziffr-snapshot-part";

/** The part number of the opening part (the dashboard's name, the period and the introduction); every other number is
 * a Widget's id in the Snapshot. */
export const OPENING_PART = 0;

/** The most Snapshot Parts and Snapshots one deck holds, and the most Metrics one read of a Snapshot names. */
export const SNAPSHOT_PART_LIMITS = { parts: 100, snapshots: 20, metrics: 500 } as const;

/** What one deck asks of one Snapshot: its parts, and the Metrics of the other shapes that keep its numbers. */
export type KeptRequest = { snapshotId: number; parts: number[]; metricIds: number[] };

/** A shape that draws kept numbers: a part (`part` set), or a Widget or Slide Element on a slide that keeps numbers.
 * `snapshotId` is null when its slide holds parts of several Snapshots and says no one of them. */
export type KeptShape = { id: string; slideId: string | null; snapshotId: number | null; part: number | null; metricIds: number[] };

type Rec = { id?: unknown; typeName?: unknown; type?: unknown; parentId?: unknown; fromId?: unknown; toId?: unknown; meta?: unknown; props?: Record<string, unknown> | null };

const MAX_PARENTS = 50;
const MAX_DEPTH = 5;
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const isPartNumber = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The records of a tldraw document by their store key, or none. */
function records(document: unknown): [string, Rec][] {
  const store = (document as { store?: unknown } | null)?.store;
  return isObject(store) ? (Object.entries(store).filter(([, r]) => isObject(r)) as [string, Rec][]) : [];
}

const idOf = (key: string, r: Rec) => (typeof r.id === "string" ? r.id : key);

/** The Snapshot a slide's own mark names: undefined without a mark, null for a mark that is not an id. */
function markOf(r: Rec): number | null | undefined {
  const mark = isObject(r.meta) ? r.meta.snapshot : undefined;
  return r.type !== "frame" || mark === undefined ? undefined : isId(mark) ? mark : null;
}

/** The shapes a record stands on, the nearest first. */
function parentsOf(byId: ReadonlyMap<string, Rec>, r: Rec): string[] {
  const out: string[] = [];
  let at = r.parentId;
  while (typeof at === "string" && byId.has(at) && out.length < MAX_PARENTS && !out.includes(at)) {
    out.push(at);
    at = byId.get(at)!.parentId;
  }
  return out;
}

/** Every Metric a widget shape draws, a free layout's included. */
const metricsOf = (r: Rec): number[] => widgetMetricIds([], { canvas: { document: { store: { shape: r } } } } as unknown as WidgetSettings);

/** Every shape of a deck that draws kept numbers. A slide keeps numbers when it holds a Snapshot Part or carries the
 * mark of the Snapshot it was made from; on it every Widget and Slide Element that draws a Metric keeps them too. */
export function keptShapes(document: unknown): KeptShape[] {
  const all = records(document).filter(([, r]) => r.typeName === "shape");
  const byId = new Map(all.map(([key, r]) => [idOf(key, r), r]));
  const parts = all.filter(([, r]) => r.type === SNAPSHOT_PART_SHAPE);
  // Per slide that keeps numbers: the Snapshots of the parts on it.
  const slides = new Map<string, Set<number>>();
  for (const [id, r] of byId) if (markOf(r) !== undefined) slides.set(id, new Set());
  for (const [, r] of parts) {
    for (const id of parentsOf(byId, r)) {
      if (byId.get(id)!.type !== "frame") continue;
      const held = slides.get(id) ?? new Set<number>();
      if (isId(r.props?.snapshotId)) held.add(r.props!.snapshotId as number);
      slides.set(id, held);
    }
  }
  const snapshotOf = (slideId: string): number | null => {
    const mark = markOf(byId.get(slideId)!);
    if (mark !== undefined) return mark;
    const held = [...slides.get(slideId)!];
    return held.length === 1 ? held[0] : null;
  };
  const out: KeptShape[] = [];
  for (const [id, r] of byId) {
    const slideId = parentsOf(byId, r).find((p) => slides.has(p)) ?? null;
    if (r.type === SNAPSHOT_PART_SHAPE) {
      const { snapshotId, part } = r.props ?? {};
      out.push({ id, slideId, snapshotId: isId(snapshotId) ? snapshotId : null, part: isPartNumber(part) ? part : null, metricIds: [] });
    } else if (r.type === "ziffr-widget" && slideId) {
      const metricIds = metricsOf(r);
      // A shape that draws no number (a headline, a logo place) is drawn as anywhere else.
      if (metricIds.length) out.push({ id, slideId, snapshotId: snapshotOf(slideId), part: null, metricIds });
    }
  }
  return out;
}

/** What a deck asks of its Snapshots: one request per Snapshot, within the limits of one deck. */
export function keptRequests(document: unknown): KeptRequest[] {
  const asked = new Map<number, { parts: Set<number>; metricIds: Set<number> }>();
  for (const s of keptShapes(document)) {
    if (s.snapshotId === null) continue;
    const one = asked.get(s.snapshotId) ?? { parts: new Set<number>(), metricIds: new Set<number>() };
    if (s.part !== null) one.parts.add(s.part);
    for (const m of s.metricIds) if (isId(m)) one.metricIds.add(m);
    asked.set(s.snapshotId, one);
  }
  const { snapshots, parts, metrics } = SNAPSHOT_PART_LIMITS;
  return [...asked].slice(0, snapshots).map(([snapshotId, r]) => ({ snapshotId, parts: [...r.parts].slice(0, parts), metricIds: [...r.metricIds].slice(0, metrics) }));
}

/** The document without the shapes in `gone`, their arrow bindings and the slides' marks when `unmark`. */
function without<T>(document: T, gone: ReadonlySet<string>, unmark: boolean): T {
  const all = records(document);
  const marked = unmark && all.some(([, r]) => markOf(r) !== undefined);
  if (!gone.size && !marked) return document;
  const kept = all.flatMap(([key, r]): [string, Rec][] => {
    if (gone.has(idOf(key, r)) || (r.typeName === "binding" && (gone.has(String(r.fromId)) || gone.has(String(r.toId))))) return [];
    if (!unmark || markOf(r) === undefined) return [[key, r]];
    const meta = { ...(r.meta as Record<string, unknown>) };
    delete meta.snapshot;
    return [[key, { ...r, meta }]];
  });
  return { ...(document as object), store: Object.fromEntries(kept) } as T;
}

/** The document without the Widgets and Slide Elements of slides that keep numbers: what a deck draws live, and so
 * the Metrics its Share opens. */
export function liveDocument<T>(document: T): T {
  return without(document, new Set(keptShapes(document).filter((s) => s.part === null).map((s) => s.id)), false);
}

/** The document without any kept number, for a View Link, which shows none (spec 0061): the parts, the shapes that
 * keep a Snapshot's numbers and the slides' marks. `left` counts the shapes left out. */
export function withoutKeptNumbers<T>(document: T): { document: T; left: number } {
  const gone = new Set(keptShapes(document).map((s) => s.id));
  return { document: without(document, gone, true), left: gone.size };
}

/** The settings of a widget shape, kept as a JSON string on slides and as an object elsewhere. */
function settingsOf(r: Rec): Record<string, unknown> | null {
  const raw = r.props?.settings;
  if (typeof raw !== "string") return isObject(raw) ? raw : null;
  try {
    const v: unknown = JSON.parse(raw);
    return isObject(v) ? v : null;
  } catch {
    return null;
  }
}

/** Whether a free layout's document, or one nested in it, holds a Snapshot Part: parts stand on a deck's slides only. */
export function holdsSnapshotPart(document: unknown, depth = 0): boolean {
  return records(document).some(([, r]) => {
    if (r.type === SNAPSHOT_PART_SHAPE) return true;
    const inner = r.typeName === "shape" ? (settingsOf(r)?.canvas as { document?: unknown } | null | undefined)?.document : undefined;
    return Boolean(inner) && (depth >= MAX_DEPTH || holdsSnapshotPart(inner, depth + 1));
  });
}

const PART_PROPS = ["w", "h", "snapshotId", "part"];

/** Whether a record is a part that stores its size, its Snapshot's id and its part number, and nothing else. */
function wellFormed(r: Rec): boolean {
  const props = r.props;
  if (r.typeName !== "shape" || !isObject(props) || Object.keys(props).some((k) => !PART_PROPS.includes(k))) return false;
  if (r.meta !== undefined && !(isObject(r.meta) && Object.keys(r.meta).length === 0)) return false;
  return Number.isFinite(props.w) && Number.isFinite(props.h) && isId(props.snapshotId) && isPartNumber(props.part);
}

/** Why a deck's Snapshot Parts cannot be saved, in words for the person saving; null when they can. */
export function snapshotPartProblem(document: unknown): string | null {
  const all = records(document).map(([, r]) => r);
  const parts = all.filter((r) => r.type === SNAPSHOT_PART_SHAPE);
  const marks = all.map(markOf).filter((m) => m !== undefined);
  if (!parts.every(wellFormed) || marks.includes(null)) return "This deck has a Snapshot Part Ziffr cannot read. Remove it and add it again from its Snapshot.";
  if (all.some((r) => r.type !== SNAPSHOT_PART_SHAPE && holdsSnapshotPart({ store: { shape: r } }))) return "A Snapshot Part stands on a slide, not inside a free layout.";
  if (parts.length > SNAPSHOT_PART_LIMITS.parts) return `A deck holds ${SNAPSHOT_PART_LIMITS.parts} Snapshot Parts at most. Remove some, or make a second deck.`;
  const snapshots = new Set([...parts.map((r) => r.props!.snapshotId as number), ...(marks as number[])]);
  if (snapshots.size > SNAPSHOT_PART_LIMITS.snapshots) return `A deck draws ${SNAPSHOT_PART_LIMITS.snapshots} Snapshots at most. Remove the slides of one, or make a second deck.`;
  return null;
}
