"use client";
// A Slide Element on the deck canvas (GLOSSARY: Slide Element, Deck): its Metrics from the viewer's data, the slide's
// number and the deck's footer, drawn by element-view.tsx at the shape's size.
// Visibility: only Metrics in `data` are drawn; one the viewer may not see is `null`, which the element says or leaves
// empty, never naming it.
import { useContext } from "react";
import { useEditor, useValue } from "tldraw";
import { elementMetrics } from "@ziffr/core/slide-figures";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { useSeriesReady } from "@/canvas/series-store";
import { DeckMaster, deckExportMaster } from "../master";
import type { WidgetShape } from "../widget-shape";
import { SlideElementView } from "./element-view";
import { slideNumber, slideOf } from "./slide-page";

/** The element a widget shape of the view "slide" holds, drawn in place. */
export function SlideElementShape({ shape, data: live, settings }: { shape: WidgetShape; data: CanvasData; settings: WidgetSettings }) {
  const editor = useEditor();
  const master = useContext(DeckMaster) ?? deckExportMaster();
  const page = useValue("slide number", () => { const slide = slideOf(editor, shape.id); return slide ? slideNumber(editor, slide) : undefined; }, [editor, shape.id]);
  // A deck made from a Snapshot draws the values of that period only, as its Widgets do (spec 0013).
  const data = settings.asOf ? dataAsOf(live, settings.asOf) : live;
  const ready = useSeriesReady(shape.props.metricIds, data);
  const element = settings.element;
  if (!element) return null;
  if (!ready) return <div aria-busy="true" aria-label="Loading values" className="h-full w-full animate-pulse rounded-[var(--radius-input)] bg-muted/40" />;
  return <SlideElementView element={element} context={{ data, metrics: elementMetrics(shape.props.metricIds, data), slide: page, footer: master?.footer }} w={shape.props.w} h={shape.props.h} logo={master?.logo} />;
}
