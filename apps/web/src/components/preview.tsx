"use client";
// GLOSSARY: Preview, Sample Data. A Widget Template, saved widget or metric drawn small before it is placed: the
// same read-only frame a View Link shows (no menus, nothing that calls the server), scaled down, inert to pointer
// and keyboard. A template's Preview draws Sample Data only, never the metrics it was made with: that is why a
// Preview needs no Share check and sends nothing to the browser that the page did not have (spec 0011).
import { useMemo } from "react";
import { sampleCanvasData, sampleDashboard, sampleTeamWidget, sampleWidget, type SampleWidget } from "@ziffr/core/sample-data";
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
};

/** A widget drawn small and inert at its own proportions. */
export function Preview({ widget, data, size, width = 280, sample, className }: Props) {
  const natural = cellsToPixels(size);
  const scale = Math.min(1, width / natural.width);
  const free = TEMPLATES[widget.template]?.kind === "layout" && !widget.settings.canvas?.document;
  return (
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
      {sample && (
        <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-input)] bg-[var(--color-cotton)] px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-[var(--edge-stock)]">Sample data</span>
      )}
    </div>
  );
}

/** A built-in or team Widget Template's Preview, drawn with Sample Data. */
export function TemplatePreview({ template, viewer, numberStyle, width, className }: { template: TemplateId | Pick<WidgetTemplate, "view" | "body" | "slots" | "w" | "h">; viewer: string; numberStyle: NumberStyle; width?: number; className?: string }) {
  const data = useMemo(() => sampleCanvasData(viewer, numberStyle), [viewer, numberStyle]);
  const { widget, size } = useMemo((): { widget: SampleWidget; size: { w: number; h: number } } => {
    if (typeof template === "string") return { widget: sampleWidget(template), size: TEMPLATES[template].size };
    return { widget: sampleTeamWidget(template), size: { w: template.w, h: template.h } };
  }, [template]);
  return <Preview widget={widget} data={data} size={size} width={width} sample className={className} />;
}

/** A Dashboard Template's Preview (spec 0014, #191): its widgets where they sit on the 12-column grid, drawn with
 * Sample Data and scaled to `width`. Like a template's Preview, it shows none of the workspace's numbers. */
export function DashboardTemplatePreview({ template, viewer, numberStyle, width = 520, className }: { template: { slots: DashboardTemplate["slots"]; body: DashboardTemplate["body"] }; viewer: string; numberStyle: NumberStyle; width?: number; className?: string }) {
  const data = useMemo(() => sampleCanvasData(viewer, numberStyle), [viewer, numberStyle]);
  const widgets = useMemo(() => sampleDashboard(template), [template]);
  const natural = { width: cellsToPixels({ w: 12, h: 1 }).width, height: Math.max(1, ...widgets.map((w) => w.y + w.h)) * (ROW + GAP) - GAP };
  const scale = Math.min(1, width / natural.width);
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
      <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-input)] bg-[var(--color-cotton)] px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-[var(--edge-stock)]">Sample data</span>
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
