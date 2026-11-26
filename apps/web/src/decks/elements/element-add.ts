// What a Slide Element starts as when someone adds one in the deck editor (GLOSSARY: Slide Element; spec 0057), and what
// its Metrics are after a change. Pure.
// Visibility: a Metric on a slide is shown to everyone the deck is shared with and on its View Links, so the editor only
// ever holds Metrics the person picked: nothing here chooses one for them.
import { elementSlots, type SlideElement, type SlideElementKind } from "@ziffr/core/slide-element";

/** One kind of element as the editor offers it. */
export const ELEMENT_CHOICES: { kind: SlideElementKind; label: string; blurb: string; element: SlideElement; w: number; h: number }[] = [
  { kind: "words", label: "Words", blurb: "Text in the Theme's colours and fonts", element: { kind: "words", text: ["Headline"], font: "heading", size: 33, line: 1.2 }, w: 980, h: 48 },
  { kind: "box", label: "Box", blurb: "A rectangle in a Theme colour", element: { kind: "box", fill: "canvas" }, w: 360, h: 200 },
  { kind: "figure", label: "Figure", blurb: "One large value with a line under it", element: { kind: "figure", note: "{change} since the period before" }, w: 276, h: 112 },
  { kind: "columns", label: "Column chart", blurb: "A Metric period by period", element: { kind: "columns" }, w: 1152, h: 316 },
  { kind: "gap-table", label: "Gap table", blurb: "Two Breakdowns row by row, with the difference", element: { kind: "gap-table" }, w: 1152, h: 365 },
  { kind: "metric-table", label: "Metric table", blurb: "A row per Metric with its change and trend", element: { kind: "metric-table" }, w: 1152, h: 380 },
  { kind: "definitions", label: "Definitions", blurb: "Metrics with what they are and how they are calculated", element: { kind: "definitions" }, w: 1152, h: 520 },
  { kind: "list", label: "Numbered list", blurb: "An agenda or a list of points", element: { kind: "list", title: "Agenda", items: [{ text: "First point" }, { text: "Second point" }] }, w: 420, h: 400 },
  { kind: "logo", label: "Logo place", blurb: "The Theme's logo", element: { kind: "logo" }, w: 180, h: 32 },
  { kind: "art", label: "Cover art", blurb: "Rings and a rising line", element: { kind: "art", art: "rings-trend" }, w: 780, h: 720 },
];

/** An element's Metrics after its settings change: those already picked that it still reads, each in the same role.
 * Slots fill in order, so a Metric that would move into another role is taken off, to be picked again. */
export function metricsAfter(before: SlideElement, after: SlideElement, ids: number[]): number[] {
  let out = [...ids];
  if (before.kind === "columns" && after.kind === "columns") {
    // The filled part stands second and the reference line last.
    if (!before.part && after.part) out = out.slice(0, 1);
    if (before.part && !after.part) out.splice(1, 1);
    if (before.reference && !after.reference) out = out.slice(0, after.part ? 2 : 1);
  }
  return out.slice(0, elementSlots(after).max);
}

/** The element's Metrics once the person picks `id` for Slot `slot`: a filled one, or the next empty one. */
export function pickMetric(element: SlideElement, ids: number[], slot: number, id: number): number[] {
  if (!Number.isSafeInteger(id) || id <= 0 || slot < 0 || slot > ids.length || slot >= elementSlots(element).max) return ids;
  return slot === ids.length ? [...ids, id] : ids.map((x, i) => (i === slot ? id : x));
}
