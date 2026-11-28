// Made-up slides for the slide type tests (spec 0069; GLOSSARY: Slide Type, Metric). Test material: only tests import it.
import { expect } from "vitest";

import type { BreakdownRow, CanvasData, Metric, Point } from "../../types";
import { flatten, type Obj } from "../objects";
import type { DeckFacts, SlideSource, SlideType } from "../slide-type";

/** What the made-up deck's slides know of it. */
export const DECK: DeckFacts = { name: "Review", period: "September 2026", date: "9 October 2026", today: "2026-10-09", footer: "", agenda: [], listed: [], address: null };
/** The month before the newest. */
export const AUG = "2026-08-01";
/** The newest month. */
export const SEP = "2026-09-01";

/** A made-up Metric. */
export const metric = (id: number, name: string, more: Partial<Metric> = {}) =>
  ({ id, slug: `m${id}`, name, formula: null, polarity: "higher", period: "month", decimals: 0, unit: "", unit_position: "after", ...more }) as Metric;

const months = (before: number | null, after: number | null): Point[] =>
  [before === null ? null : { period: AUG, value: before }, after === null ? null : { period: SEP, value: after }].filter((p): p is Point => !!p);

/** The data of made-up Metrics, with their values of two months. */
export const data = (metrics: Metric[], values: Record<number, [number | null, number | null]> = {}, more: Partial<CanvasData> = {}) =>
  ({
    metrics,
    series: Object.fromEntries(metrics.map((m) => [m.slug, months(...(values[m.id] ?? [null, null]))])),
    targets: {},
    projections: {},
    breakdowns: {},
    yearStart: 1,
    numberStyle: "en",
    ...more,
  }) as unknown as CanvasData;

/** A slide as a description lists it. */
export const slide = (type: string, metrics: number[], options: Record<string, unknown> = {}): SlideSource => ({ id: `sl_${type}`, type, metrics, options, headline: null });

/** What a slide type draws; fails where it refuses. */
export function filled<C>(type: SlideType<C>, source: SlideSource, from: CanvasData) {
  const out = type.fill(source, from, DECK);
  if (!("content" in out)) throw new Error(out.cannot);
  return out;
}
/** The sentence a slide type refuses with; fails where it draws. */
export function refused<C>(type: SlideType<C>, source: SlideSource, from: CanvasData): string {
  const out = type.fill(source, from, DECK);
  if (!("cannot" in out)) throw new Error("It was drawn.");
  // A refused slide says no figure.
  expect(out.headline).not.toMatch(/\d/);
  return out.cannot;
}
/** A Metric's Breakdowns by period. */
export const breakdown = (id: number, periods: Record<string, BreakdownRow[]>) => ({ breakdowns: { [id]: periods } });
/** Every word of these objects. */
export const text = (objects: Obj[]) =>
  flatten(objects)
    .flatMap((o) => (o.type === "text" ? o.body.paras.map((p) => p.runs.map((r) => r.t).join("")) : []))
    .join(" ");
