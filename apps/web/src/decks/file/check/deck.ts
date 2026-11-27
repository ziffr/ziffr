// One deck that holds every sample of every Slide Type, for the checks of the PowerPoint file (spec 0069; GLOSSARY:
// Deck, Slide Type) and the sample files a person opens. Made-up Metrics only. Test material: no screen imports it.
import type { DeckDrawingInput } from "@ziffr/core/deck-drawing/draw-deck";
import type { SlideSource } from "@ziffr/core/deck-drawing/slide-type";
import type { CanvasData } from "@ziffr/core/types";
import { DECK, SAMPLES, slideOf, THEMES, type Sample } from "../../slides/check/samples";

const moved = <T>(record: Record<string | number, T> | undefined, key: (old: string) => string | number, value: (v: T) => T = (v) => v) =>
  Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [key(k), value(v)]));

/** A sample's slide and data with its Metrics' ids moved up by `by`, so that samples can share a deck. */
function apart(type: string, index: number, sample: Sample, by: number): { slide: SlideSource; data: Partial<CanvasData> } {
  const data = sample.data ?? {};
  const slug = (old: string) => old.replace(/\d+/, (n) => String(Number(n) + by));
  const id = (old: string) => Number(old) + by;
  return {
    slide: slideOf(type, { ...sample.slide, id: `sl_${type}_${index}`, metrics: (sample.slide?.metrics ?? []).map((m) => m + by) }),
    data: {
      // Every Metric has Sources; About these slides says them, so a sample that names none gets one.
      metrics: (data.metrics ?? []).map((m) => ({ ...m, sources: m.sources ?? ["web_form"], id: m.id + by,slug: slug(m.slug), formula: m.formula?.replace(/\{m(\d+)\}/g, (_, n: string) => `{m${Number(n) + by}}`) ?? null })),
      series: moved(data.series, slug),
      breakdowns: moved(data.breakdowns, id),
      targets: moved(data.targets, id),
      projections: moved(data.projections, id),
      totalLists: moved(data.totalLists, id, (list) => ({ ...list, parts: list.parts.map((p) => ({ ...p, part: p.part + by })) })),
    },
  };
}

/** The deck of every sample, in a Deck Design, a Theme and a set of fonts: the cover first, About these slides last. */
export function everySlide(design: DeckDrawingInput["design"], fonts: NonNullable<DeckDrawingInput["fonts"]>, theme = "ziffr-light"): DeckDrawingInput {
  const made = Object.entries(SAMPLES)
    .filter(([type]) => type !== "cover" && type !== "about")
    .flatMap(([type, samples]) => samples.map((sample, index) => ({ type, index, sample })))
    .map(({ type, index, sample }, n) => apart(type, index, sample, (n + 1) * 100));
  const merge = <K extends "series" | "breakdowns" | "targets" | "projections" | "totalLists">(key: K) => Object.assign({}, ...made.map((m) => m.data[key])) as NonNullable<CanvasData[K]>;
  const data = {
    metrics: made.flatMap((m) => m.data.metrics ?? []),
    series: merge("series"),
    breakdowns: merge("breakdowns"),
    targets: merge("targets"),
    projections: merge("projections"),
    totalLists: merge("totalLists"),
    yearStart: 1,
    numberStyle: "1,234.5",
  } as unknown as CanvasData;
  return { ...DECK, design, fonts, emphasis: "strong", theme: THEMES[theme]!, data, slides: [slideOf("cover"), ...made.map((m) => m.slide), slideOf("about")] };
}
