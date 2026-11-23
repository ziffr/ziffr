"use client";
// Draws a Widget (GLOSSARY: Widget, View): the Views for Metrics and Analyses are View Designs drawn by one renderer
// (design-view.tsx); Findings and the free layout are drawn by their own code.
import { BUILT_IN_DESIGNS, isDesignedView } from "@ziffr/core/built-in-designs";
import { inputsProblem } from "@ziffr/core/formula";
import type { CanvasData, Metric, Widget } from "@ziffr/core/types";
import { fillSettings } from "@ziffr/core/placeholders";
import dynamic from "next/dynamic";
import { useSeriesReady } from "@/canvas/series-store";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import { DesignView } from "./design-view";
import { DesignBoundary } from "./design-boundary";


// tldraw is browser-only; free layouts load it on demand.
const LayoutView = dynamic(() => import("@/canvas/layout-view"), { ssr: false });
// Observable Plot is only needed by stories: their code loads with the first story shown (still rendered on the server).
const StoryBody = dynamic(() => import("./story").then((m) => m.StoryBody));

type Props = {
  widget: Pick<Widget, "template" | "metric_ids" | "settings">;
  data: CanvasData;
  onPointContext?: (metricId: number, period: string) => void;
  /** Right-click on one row of a breakdown. */
  onRowContext?: (metricId: number, label: string, period: string) => void;
};

/** The widget's Metrics that the viewer may see, in its order. */
export function widgetMetrics(widget: Pick<Widget, "metric_ids">, data: CanvasData) {
  return widget.metric_ids.map((id) => data.metrics.find((m) => m.id === id)).filter((m): m is Metric => !!m);
}

/** What a Tag widget says when it has no Metric to draw: the same words whether the Tag has none, or only Metrics the viewer may not see. */
function TagEmpty({ view }: { view?: Widget["settings"]["tagView"] }) {
  const words = view?.removed ? "This Tag was removed. Pick another Tag for this widget." : view?.name ? `No Metric tagged ${view.name} that you can see.` : "No Metric with this Tag that you can see.";
  return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{words}</div>;
}

/** A widget's body, drawn by its View. */
export function WidgetBody({ widget, data: live, onPointContext, onRowContext }: Props) {
  // A widget of a deck made from a Snapshot draws the values of that period only (spec 0013).
  const data = widget.settings.asOf ? dataAsOf(live, widget.settings.asOf) : live;
  const ms = widgetMetrics(widget, data);
  // A page sends only the series it draws; one placed or picked since is fetched, with a quiet placeholder meanwhile.
  const ready = useSeriesReady(widgetMetricIds(widget.metric_ids, widget.settings), data);
  // A widget of "all Metrics tagged X" with nothing this viewer may see says so, and nothing about what they may not (spec 0038).
  if (widget.settings.tagSource && widget.metric_ids.length === 0) return <TagEmpty view={widget.settings.tagView} />;
  if (!ready) return <div aria-busy="true" aria-label="Loading values" className="h-full min-h-16 w-full animate-pulse rounded-[var(--radius-input)] bg-muted/40" />;
  if (widget.template === "canvas") return <LayoutView settings={widget.settings} data={data} />;
  if (ms.length < widget.metric_ids.length) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">No access to this metric. Ask its owner to share it.</div>;
  }
  const m = ms[0];
  // A Derived Metric whose inputs are counted by different periods has no value in any period: it says why.
  const broken = inputsProblem(m, data.metrics);
  if (broken) return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{broken}</div>;
  if (isDesignedView(widget.template)) return <DesignView design={BUILT_IN_DESIGNS[widget.template]} widget={widget} metrics={ms} data={data} onPointContext={onPointContext} />;
  // A Workspace's View Design: the widget's own checked copy (the core checks it on every save).
  if (widget.template === "design") return widget.settings.design ? <DesignBoundary><DesignView design={widget.settings.design.body} widget={widget} metrics={ms} data={data} onPointContext={onPointContext} /></DesignBoundary> : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">This widget has no View Design.</div>;
  return <StoryBody widget={{ ...widget, settings: fillSettings(widget, data) }} data={data} m={m} onRowContext={onRowContext ? (l, p) => onRowContext(m.id, l, p) : undefined} />;
}
