// What a Slide Element starts as when someone adds one in the deck editor (GLOSSARY: Slide Element; spec 0057): its
// words, its size on the slide and how many Metrics it takes at first. Pure.
import { elementSlots, type SlideElement, type SlideElementKind } from "@ziffr/core/slide-element";

/** One kind of element as the editor offers it. */
export const ELEMENT_CHOICES: { kind: SlideElementKind; label: string; blurb: string; element: SlideElement; w: number; h: number; metrics: number }[] = [
  { kind: "words", label: "Words", blurb: "Text in the Theme's colours and fonts", element: { kind: "words", text: ["Headline"], font: "heading", size: 33, line: 1.2 }, w: 980, h: 48, metrics: 0 },
  { kind: "box", label: "Box", blurb: "A rectangle in a Theme colour", element: { kind: "box", fill: "canvas" }, w: 360, h: 200, metrics: 0 },
  { kind: "figure", label: "Figure", blurb: "One large value with a line under it", element: { kind: "figure", note: "{change} since the period before" }, w: 276, h: 112, metrics: 1 },
  { kind: "columns", label: "Column chart", blurb: "A Metric period by period", element: { kind: "columns" }, w: 1152, h: 316, metrics: 1 },
  { kind: "gap-table", label: "Gap table", blurb: "Two Breakdowns row by row, with the difference", element: { kind: "gap-table" }, w: 1152, h: 365, metrics: 2 },
  { kind: "metric-table", label: "Metric table", blurb: "A row per Metric with its change and trend", element: { kind: "metric-table" }, w: 1152, h: 380, metrics: 3 },
  { kind: "list", label: "Numbered list", blurb: "An agenda or a list of points", element: { kind: "list", title: "Agenda", items: [{ text: "First point" }, { text: "Second point" }] }, w: 420, h: 400, metrics: 0 },
  { kind: "logo", label: "Logo place", blurb: "The Theme's logo", element: { kind: "logo" }, w: 180, h: 32, metrics: 0 },
  { kind: "art", label: "Cover art", blurb: "Rings and a rising line", element: { kind: "art", art: "rings-trend" }, w: 780, h: 720, metrics: 0 },
];

/** An element's Metrics after one changes: as many as its kind takes, the first ones filled with `fallback`. */
export function fitMetrics(element: SlideElement, ids: number[], fallback: number[]): number[] {
  const { min, max } = elementSlots(element);
  const out = ids.slice(0, max);
  for (let i = 0; out.length < min && i < fallback.length; i++) if (!out.includes(fallback[i])) out.push(fallback[i]);
  return out;
}
