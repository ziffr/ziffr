"use client";
// A Ziffr Widget as a tldraw shape: the same metric + template + settings as on a dashboard,
// drawn by our own WidgetBody, so decks and dashboards share one View per template.
import { createContext, useContext } from "react";
import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from "tldraw";
import { WidgetBody, widgetMetrics } from "@/views/widget-body";
import { TEMPLATES } from "@/views/templates";
import type { CanvasData, TemplateId, WidgetSettings } from "@ziffr/core/types";

export const WIDGET_SHAPE = "ziffr-widget";

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [WIDGET_SHAPE]: { w: number; h: number; template: string; metricIds: number[]; settings: string; title: string };
  }
}

export type WidgetShape = TLShape<typeof WIDGET_SHAPE>;

/** Live metric data for every widget on the deck canvas. */
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

function WidgetCard({ shape }: { shape: WidgetShape }) {
  const data = useContext(DeckData) ?? exportData;
  if (!data) return null;
  const widget = widgetFromShape(shape);
  const ms = widgetMetrics(widget, data);
  const title = widget.title ?? (TEMPLATES[widget.template].kind === "metric" ? ms[0]?.name : `${TEMPLATES[widget.template].label}: ${ms.map((m) => m.name).join(" vs. ")}`);
  const story = TEMPLATES[widget.template].kind === "story";
  return (
    <div className="stock flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] font-sans">
      {/* A story carries its own headline; other widgets get a title bar. */}
      {!story && <div className="truncate px-4 pt-3 pb-1 text-sm font-semibold">{title}</div>}
      <div className={story ? "min-h-0 flex-1 p-4" : "min-h-0 flex-1 px-4 pb-4"}>
        <WidgetBody widget={widget} data={data} />
      </div>
    </div>
  );
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

  component(shape: WidgetShape) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: shape.props.w, height: shape.props.h }}>
        <WidgetCard shape={shape} />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: WidgetShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
