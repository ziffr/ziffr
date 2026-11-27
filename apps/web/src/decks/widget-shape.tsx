"use client";
// A Ziffr Widget as a tldraw shape: the same metric + template + settings as on a dashboard,
// drawn by our own WidgetBody, so decks and dashboards share one View per template.
import { createContext, useContext, type ReactNode } from "react";
import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from "tldraw";
import { SeriesProvider } from "@/canvas/series-store";
import { onSlide } from "./kept/kept-drawing";
import { useKept, useKeptShape } from "./kept/kept-store";
import { ShapeNotice } from "./kept/shape-notice";
import { WidgetBody, widgetMetrics } from "@/views/widget-body";
import { templateOf } from "@/views/templates";
import type { CanvasData, TemplateId, WidgetSettings } from "@ziffr/core/types";
import { fillWidgetText } from "@ziffr/core/placeholders";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import { SlideElementShape } from "./elements/element-shape";
import { noteCardClass } from "@/views/note-view";
import { cn } from "@/lib/utils";

export const WIDGET_SHAPE = "ziffr-widget";

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [WIDGET_SHAPE]: { w: number; h: number; template: string; metricIds: number[]; settings: string; title: string };
  }
}

export type WidgetShape = TLShape<typeof WIDGET_SHAPE>;

/** Live metric data for every widget on the deck canvas; a slide that keeps numbers draws its own instead. */
export const DeckData = createContext<CanvasData | null>(null);

// tldraw renders shapes for image export in a separate React tree, outside our provider.
// The editor also parks the data here so exported widgets still have it.
let exportData: CanvasData | null = null;
export const setDeckExportData = (d: CanvasData | null) => (exportData = d);

export function widgetFromShape(shape: WidgetShape) {
  return {
    template: shape.props.template as TemplateId,
    metric_ids: shape.props.metricIds,
    settings: JSON.parse(shape.props.settings || "{}") as WidgetSettings,
    title: shape.props.title || null,
  };
}

/** Live data for shapes: the page's, or the one parked for an export. */
export const useDeckData = () => useContext(DeckData) ?? exportData;

/** A widget's card on a slide: its title and its View drawn from `data`, with room for a line under it. */
export function WidgetCard({ widget, data, footer }: { widget: ReturnType<typeof widgetFromShape>; data: CanvasData; footer?: ReactNode }) {
  const ms = widgetMetrics(widget, data);
  const t = templateOf(widget);
  const note = t.kind === "note";
  // A note's title is its heading, shown as written, or none.
  const title = note ? widget.title : (widget.title ? fillWidgetText(widget.title, widget, widget.settings.asOf ? dataAsOf(data, widget.settings.asOf) : data) : undefined) ?? (t.kind === "metric" ? ms[0]?.name : `${t.label}: ${ms.map((m) => m.name).join(" vs. ")}`);
  const story = t.kind === "story";
  const bare = story || (note && !title);
  return (
    <div className={cn("stock flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] font-sans", noteCardClass(widget))}>
      {/* A story carries its own headline; other widgets get a title bar. */}
      {!bare && <div className="truncate px-4 pt-3 pb-1 text-sm font-semibold">{title}</div>}
      <div className={bare ? "min-h-0 flex-1 p-4" : "min-h-0 flex-1 px-4 pb-4"}>
        <WidgetBody widget={widget} data={data} />
      </div>
      {footer}
    </div>
  );
}

function WidgetOnSlide({ shape }: { shape: WidgetShape }) {
  const live = useDeckData();
  const kept = useKeptShape(shape.id);
  const numbers = useKept();
  if (!live) return null;
  const widget = widgetFromShape(shape);
  // On a slide that keeps numbers: the Snapshot's, or words in their place; never the live ones (spec 0061).
  const on = onSlide(kept, numbers, live, widget.settings);
  if ("words" in on) return <ShapeNotice words={on.words} />;
  // A Slide Element is no card: it draws itself straight on the slide, in the Theme (spec 0057).
  const drawn = widget.template === "slide" ? <SlideElementShape shape={shape} data={on.data} settings={on.settings} /> : <WidgetCard widget={{ ...widget, settings: on.settings }} data={on.data} />;
  return on.kept ? <SeriesProvider ensure={null}>{drawn}</SeriesProvider> : drawn;
}

export class WidgetShapeUtil extends BaseBoxShapeUtil<WidgetShape> {
  static override type = WIDGET_SHAPE;
  static override props = {
    w: T.number,
    h: T.number,
    template: T.string,
    metricIds: T.arrayOf(T.number),
    settings: T.string,
    title: T.string,
  };

  getDefaultProps(): WidgetShape["props"] {
    return { w: 360, h: 220, template: "number", metricIds: [], settings: "{}", title: "" };
  }

  override canEdit() {
    return false;
  }

  override getText(shape: WidgetShape) {
    // What a Slide Element says, for tldraw's search and screen readers.
    const e = widgetFromShape(shape).settings.element;
    return e?.kind === "words" ? e.text.join(" ") : undefined;
  }

  component(shape: WidgetShape) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: shape.props.w, height: shape.props.h }}>
        <WidgetOnSlide shape={shape} />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: WidgetShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
