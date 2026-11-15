"use client";
// GLOSSARY: Widget, View Link, Preview. A widget's card and its numbers only: no menus and nothing that calls the
// server. Kept apart from WidgetFrame's menus so a View Link or a Preview loads none of their code.
import { WidgetBody, widgetMetrics } from "@/views/widget-body";
import { TEMPLATES } from "@/views/templates";
import { CompareStrip, DEFAULT_COMPARE } from "@/components/compare-strip";
import type { CanvasData, Metric, Widget } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

/** The parts of a widget its card draws. */
export type FrameWidget = Pick<Widget, "template" | "metric_ids" | "settings" | "title"> & { id?: number; w?: number; h?: number };

const ANALYSIS_TITLE: Record<string, (ms: Metric[]) => string> = {
  forecast: (ms) => `Forecast: ${ms[0]?.name}`,
  correlation: (ms) => `${ms[0]?.name} vs. ${ms[1]?.name}`,
  drivers: (ms) => `Drivers of ${ms[0]?.name}`,
  matrix: (ms) => `Correlation matrix (${ms.length} metrics)`,
};

/** The title on a widget's card: its own, else the metric's name or what the analysis compares. Findings and free
 * layouts carry their own headline, so their header stays quiet. */
export function frameTitle(widget: FrameWidget, ms: Metric[]): string {
  if (widget.title) return widget.title;
  const kind = TEMPLATES[widget.template].kind;
  if (kind === "story" || kind === "layout") return "";
  if (kind === "analysis") return ANALYSIS_TITLE[widget.template]?.(ms) ?? "";
  return ms[0]?.name ?? "";
}

/** A widget's card without menus, as View Links and Previews show it. */
export function ReadOnlyFrame({ widget, data, className }: { widget: FrameWidget; data: CanvasData; className?: string }) {
  const ms = widgetMetrics(widget, data);
  const m = ms[0];
  const kind = TEMPLATES[widget.template].kind;
  const title = frameTitle(widget, ms);
  return (
    <div className={cn("stock flex h-full flex-col overflow-hidden rounded-[var(--radius-card)]", className)}>
      <div className="px-4 pt-3 pb-1"><span className="truncate text-sm font-semibold">{title}</span></div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 pb-3">
        <div className="@container min-h-0 flex-1"><WidgetBody widget={widget} data={data} /></div>
        {m && kind === "metric" && <CompareStrip metric={m} data={data} keys={widget.settings.compare ?? DEFAULT_COMPARE} full={widget.settings.fullPeriods} />}
      </div>
    </div>
  );
}
