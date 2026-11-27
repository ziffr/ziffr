"use client";
// GLOSSARY: Preview, Sample Data. A Widget Template, saved widget or metric drawn small before it is placed: the
// same read-only frame a View Link shows (no menus, nothing that calls the server), scaled down, inert to pointer
// and keyboard. A template's Preview draws Sample Data only, never the metrics it was made with: that is why a
// Preview needs no Share check and sends nothing to the browser that the page did not have (spec 0011).
import { useMemo } from "react";
import { sampleCanvasData, sampleDashboard, sampleTeamWidget, sampleWidget, type SampleWidget } from "@ziffr/core/sample-data";
import type { packSample } from "@ziffr/core/pack-sample";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { CanvasData, DashboardTemplate, TemplateId, WidgetTemplate } from "@ziffr/core/types";
import { TEMPLATES } from "@/views/templates";
import { cn } from "@/lib/utils";
import { ReadOnlyFrame, type FrameWidget } from "./read-only-frame";

// One dashboard grid cell at a usual desktop width (12 columns, rows of 36 px, 16 px between), so a Preview keeps
// the proportions and the text sizes the widget has once placed.
const COL = 84;
const ROW = 36;
const GAP = 16;
// A Preview laid out narrower than on a desktop: the room added for footer lines that wrap, and the width a view
// that is a table needs before its last column is cut off (an inert Preview cannot be scrolled).
const REFLOW_ROOM = 40;
const REFLOW_MIN_WIDTH: Partial<Record<TemplateId, number>> = { scoreboard: 420 };

/** The size in pixels a widget of `w` × `h` grid cells has on a dashboard. */
function cellsToPixels(size: { w: number; h: number }) {
  return { width: size.w * COL + (size.w - 1) * GAP, height: size.h * ROW + (size.h - 1) * GAP };
}

type Props = {
  widget: FrameWidget;
  data: CanvasData;
  /** Grid cells, as on a dashboard. */
  size: { w: number; h: number };
  /** Width the Preview takes, in pixels; it is never drawn larger than the widget itself. */
  width?: number;
  /** Says "Sample data" on it. */
  sample?: boolean;
  className?: string;
  /** Lay the widget out at the width given, with its words at their usual size, instead of scaling it down: how a
   * phone's dashboard shows it. */
  reflow?: boolean;
  /** The most height it takes: a taller widget is drawn smaller, so cards in a grid keep one height. Not when reflowed. */
  maxHeight?: number;
};

/** A widget drawn small and inert at its own proportions. */
export function Preview({ widget, data, size, width = 280, sample, className, reflow = false, maxHeight }: Props) {
  const cells = cellsToPixels(size);
  const narrow = Math.max(width, REFLOW_MIN_WIDTH[widget.template] ?? 0);
  const natural = reflow && cells.width > narrow ? { width: narrow, height: cells.height + REFLOW_ROOM } : cells;
  const scale = Math.min(1, width / natural.width, maxHeight && !reflow ? maxHeight / natural.height : 1);
  const free = TEMPLATES[widget.template]?.kind === "layout" && !widget.settings.canvas?.document;
  const badge = (place: string) => <span className={cn("rounded-[var(--radius-input)] bg-[var(--color-cotton)] px-1.5 py-0.5 text-xs text-muted-foreground shadow-[var(--edge-stock)]", place)}>Sample data</span>;
  const frame = (
    <div
      aria-hidden
      inert
      data-preview={widget.template}
      className={cn("relative shrink-0 overflow-hidden rounded-[var(--radius-card)] select-none", className)}
      style={{ width: natural.width * scale, height: natural.height * scale }}
    >
      <div className="pointer-events-none origin-top-left" style={{ width: natural.width, height: natural.height, transform: `scale(${scale})` }}>
        {/* A free layout's Preview is a sketch of one: drawing a real one loads tldraw, too heavy for a list. */}
        {free ? <LayoutSketch /> : <ReadOnlyFrame widget={widget} data={data} />}
      </div>
      {sample && !reflow && badge("absolute top-1.5 right-1.5")}
    </div>
  );
  // Laid out narrow, a widget's words reach its corners: the badge stands above it instead of over them.
  return sample && reflow ? <div className="flex flex-col items-end gap-1">{badge("mr-1.5")}{frame}</div> : frame;
}

/** A built-in or team Widget Template's Preview, drawn with Sample Data. */
export function TemplatePreview({ template, viewer, numberStyle, width, className, reflow, maxHeight }: { template: TemplateId | Pick<WidgetTemplate, "view" | "body" | "slots" | "w" | "h">; viewer: string; numberStyle: NumberStyle; width?: number; className?: string; reflow?: boolean; maxHeight?: number }) {
  const data = useMemo(() => sampleCanvasData(viewer, numberStyle), [viewer, numberStyle]);
  const { widget, size } = useMemo((): { widget: SampleWidget; size: { w: number; h: number } } => {
    if (typeof template === "string") return { widget: sampleWidget(template), size: TEMPLATES[template].size };
    return { widget: sampleTeamWidget(template), size: { w: template.w, h: template.h } };
  }, [template]);
  return <Preview widget={widget} data={data} size={size} width={width} sample className={className} reflow={reflow} maxHeight={maxHeight} />;
}

/** A Dashboard Template's Preview (spec 0014, #191): its widgets where they sit on the 12-column grid, drawn with
 * Sample Data and scaled to `width`. A Pack's template is drawn with `pack`, Sample Data under the Pack's own Metric
 * names. Like a template's Preview, it shows none of the workspace's numbers. */
export function DashboardTemplatePreview({ template, viewer, numberStyle, width = 520, className, pack, stacked }: { template: { slots: DashboardTemplate["slots"]; body: DashboardTemplate["body"] }; viewer: string; numberStyle: NumberStyle; width?: number; className?: string; pack?: ReturnType<typeof packSample>;
  /** On a narrow screen: only this many of its first widgets, one below the other, with their words at the usual size. */
  stacked?: number }) {
  const data = useMemo(() => {
    const sample = sampleCanvasData(viewer, numberStyle);
    return pack ? { ...sample, metrics: [...pack.data.metrics, ...sample.metrics], series: { ...sample.series, ...pack.data.series }, targets: { ...sample.targets, ...pack.data.targets } } : sample;
  }, [viewer, numberStyle, pack]);
  const widgets = useMemo(() => sampleDashboard(template, "month", pack?.fills(template.slots)), [template, pack]);
  const natural = { width: cellsToPixels({ w: 12, h: 1 }).width, height: Math.max(1, ...widgets.map((w) => w.y + w.h)) * (ROW + GAP) - GAP };
  const scale = Math.min(1, width / natural.width);
  if (stacked) {
    const more = widgets.length - stacked;
    return (
      <div data-preview="dashboard" className={cn("flex flex-col items-center gap-2", className)}>
        {[...widgets].sort((a, b) => a.y - b.y || a.x - b.x).slice(0, stacked).map((w, i) => <Preview key={i} widget={w} data={data} size={w} width={width} reflow sample={i === 0} />)}
        {more > 0 && <p className="text-xs text-muted-foreground">And {more} more widget{more === 1 ? "" : "s"} on this dashboard.</p>}
      </div>
    );
  }
  return (
    <div
      aria-hidden
      inert
      data-preview="dashboard"
      className={cn("relative shrink-0 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-paper-2)] select-none", className)}
      style={{ width: natural.width * scale, height: natural.height * scale }}
    >
      <div className="pointer-events-none relative origin-top-left" style={{ width: natural.width, height: natural.height, transform: `scale(${scale})` }}>
        {widgets.map((w, i) => {
          const size = cellsToPixels(w);
          return (
            <div key={i} className="absolute" style={{ left: w.x * (COL + GAP), top: w.y * (ROW + GAP), width: size.width, height: size.height }}>
              {TEMPLATES[w.template]?.kind === "layout" ? <LayoutSketch /> : <ReadOnlyFrame widget={w} data={data} />}
            </div>
          );
        })}
      </div>
      <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-input)] bg-[var(--color-cotton)] px-1.5 py-0.5 text-xs text-muted-foreground shadow-[var(--edge-stock)]">Sample data</span>
    </div>
  );
}

function LayoutSketch() {
  return (
    <div className="stock flex h-full items-center justify-center rounded-[var(--radius-card)] p-6">
      <svg viewBox="0 0 160 100" className="h-full w-full text-muted-foreground">
        <rect x="2" y="2" width="156" height="96" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="4 3" />
        <rect x="12" y="12" width="60" height="38" rx="3" fill="currentColor" fillOpacity="0.12" />
        <polyline points="18,42 30,32 42,36 54,22 66,26" fill="none" stroke="var(--color-primary, currentColor)" strokeWidth="2" />
        <rect x="88" y="14" width="56" height="5" rx="2" fill="currentColor" fillOpacity="0.45" />
        <rect x="88" y="25" width="40" height="4" rx="2" fill="currentColor" fillOpacity="0.25" />
        <rect x="12" y="62" width="40" height="26" rx="3" fill="currentColor" fillOpacity="0.12" />
        <rect x="62" y="62" width="40" height="26" rx="3" fill="currentColor" fillOpacity="0.12" />
        <path d="M118 40 C 126 52, 120 62, 108 70" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M108 70 l 7 -1 M108 70 l 2 -6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
