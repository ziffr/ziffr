"use client";
// GLOSSARY: Widget, View Link, Preview. A widget's card and its numbers only: no menus and nothing that calls the
// server. Kept apart from WidgetFrame's menus so a View Link or a Preview loads none of their code.
import { WidgetBody, widgetMetrics } from "@/views/widget-body";
import { noteCardClass } from "@/views/note-view";
import { templateOf } from "@/views/templates";
import { CompareStrip, DEFAULT_COMPARE } from "@/components/compare-strip";
import type { CanvasData, Metric, Widget } from "@ziffr/core/types";
import { fillWidgetText } from "@ziffr/core/placeholders";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { TakeawayHostProvider, HIDDEN_TAKEAWAYS } from "@/views/takeaway-host";
import { WidgetScaleProvider, widgetScaleStyle, useMeasuredWidgetScale } from "@/views/widget-scale";

/** The parts of a widget its card draws. */
export type FrameWidget = Pick<Widget, "template" | "metric_ids" | "settings" | "title"> & { id?: number; w?: number; h?: number };

const ANALYSIS_TITLE: Record<string, (ms: Metric[]) => string> = {
  forecast: (ms) => `Forecast: ${ms[0]?.name}`,
  correlation: (ms) => `${ms[0]?.name} vs. ${ms[1]?.name}`,
  drivers: (ms) => `Drivers of ${ms[0]?.name}`,
  matrix: (ms) => `Correlation matrix (${ms.length} metrics)`,
};

/** The title on a widget's card: its own, else the metric's name or what the analysis compares. Findings and free
 * layouts carry their own headline, so their header stays quiet; a note's title is its heading. A title's Placeholders ({latest}, {change yoy}) are filled in
 * from the data this viewer has for the widget (as of its Snapshot's day), so a hidden Metric's are empty. */
export function frameTitle(widget: FrameWidget, ms: Metric[], data: CanvasData): string {
  // A note's heading is the person's own words, shown as written: it has no Metric to fill anything in from.
  if (widget.template === "note") return widget.title ?? "";
  if (widget.title) return fillWidgetText(widget.title, widget, widget.settings.asOf ? dataAsOf(data, widget.settings.asOf) : data) ?? "";
  const kind = templateOf(widget).kind;
  if (kind === "story" || kind === "layout") return "";
  // A Workspace's analysis design is titled by its name and what it compares.
  if (kind === "analysis") return ANALYSIS_TITLE[widget.template]?.(ms) ?? `${templateOf(widget).label}: ${ms.map((m) => m.name).join(" vs. ")}`;
  return ms[0]?.name ?? "";
}

/** A note's heading wraps: it is a sentence the person wrote, not a name to cut short. */
export const NOTE_HEADING = "block whitespace-normal [overflow-wrap:anywhere] line-clamp-3 max-sm:line-clamp-3";

/** A widget's card without menus, as View Links and Previews show it. */
export function ReadOnlyFrame({ widget, data, className, wordsUnder = false }: { widget: FrameWidget; data: CanvasData; className?: string; /** Keep the Takeaway words under the chart: the Playground has no menu to open them from. */ wordsUnder?: boolean }) {
  const ms = widgetMetrics(widget, data);
  const m = ms[0];
  const kind = templateOf(widget).kind;
  const title = frameTitle(widget, ms, data);
  const note = widget.template === "note";
  // Its words, rows and axes grow with the card, as on a dashboard (#763).
  const card = useRef<HTMLDivElement>(null);
  const scale = useMeasuredWidgetScale(card);
  return (
    <div ref={card} style={widgetScaleStyle(scale)} className={cn("stock flex h-full flex-col overflow-hidden rounded-[var(--radius-card)]", noteCardClass(widget), className)}>
      <WidgetScaleProvider value={scale}>
      {/* A View Link, a Preview and a Snapshot show the chart and its footer line; the Takeaway words are for the signed-in card's ⋯ menu. */}
      <TakeawayHostProvider value={wordsUnder ? null : HIDDEN_TAKEAWAYS}>
      {/* A note without a heading starts with its words. */}
      {(title || !note) && <div className="px-4 pt-3 pb-1"><span className={cn("widget-text-sm truncate font-semibold max-sm:line-clamp-2 max-sm:whitespace-normal", note && NOTE_HEADING)}>{title}</span></div>}
      <div className={cn("flex min-h-0 flex-1 flex-col gap-1.5 px-4 pb-3", note && !title && "pt-3")}>
        <div className="@container min-h-0 flex-1"><WidgetBody widget={widget} data={data} /></div>
        {m && kind === "metric" && <CompareStrip metric={m} data={data} keys={widget.settings.compare ?? DEFAULT_COMPARE} full={widget.settings.fullPeriods} />}
      </div>
      </TakeawayHostProvider>
      </WidgetScaleProvider>
    </div>
  );
}
