"use client";
// GLOSSARY: Widget Template, Preview, Sample Data. The card that draws a built-in view with one of the person's Metrics: the
// Gallery and a dashboard's Add widget panel both use it, so the two cannot drift. It draws only Metrics in the page's data;
// series it lacks come through the core (canvas/series-store), so nothing arrives the person may not see.
import { useEffect, useMemo, useRef, useState } from "react";
import { inUse } from "@ziffr/core/metric-row";
import type { CanvasData, Metric, TemplateId, WidgetTemplate } from "@ziffr/core/types";
import { partnersOf, viewWith, type ViewWith } from "@/app/gallery/widget-with";
import { cn } from "@/lib/utils";
import { TEMPLATES } from "@/views/templates";
import { Preview, TemplatePreview } from "./preview";

const NOTHING: ViewWith = { widget: null, why: null };

/** The built-in views drawn with `metric`: asks for its series and those of the Metrics a comparison could use, and says,
 * once they are there, what each view shows. Before that, and without a Metric, a view is empty (Sample Data). */
export function useViewsWith(data: CanvasData, ensure: (ids: number[]) => Promise<void>, metric: Metric | null) {
  // The picked Metric stands for the first Metric of a view. A view that compares gets the other Metrics of the person that
  // share most months with it: their series are asked for here, and the best are chosen once they are in the page's data.
  const candidates = useMemo(() => (metric ? inUse(data.metrics).sort((a, b) => a.name.localeCompare(b.name)).filter((m) => m.id !== metric.id && !m.formula).slice(0, 8).map((m) => m.id) : []), [metric, data.metrics]);
  const asked = useMemo(() => (metric ? [metric.id, ...candidates] : []), [metric, candidates]);
  useEffect(() => { if (asked.length) void ensure(asked); }, [asked.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const loaded = (id: number) => { const m = data.metrics.find((x) => x.id === id); return !m || m.slug in data.series; };
  const ready = asked.length > 0 && asked.every(loaded);
  const partners = useMemo(() => (metric && ready ? partnersOf(metric, candidates, data) : []), [metric, ready, candidates, data]);
  const viewOf = (id: TemplateId): ViewWith => (metric && ready ? viewWith(id, metric, partners, data) : NOTHING);
  return { ready, viewOf };
}

/** Draws what it is given at the width the card has: the Preview scales to it and is centred, never wider than the card. */
export function Fitted({ children }: { children: (width: number) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const watch = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return <div ref={box} className="flex w-full justify-center">{width > 0 && children(width)}</div>;
}

type PictureProps = {
  /** The view or team template drawn with Sample Data where `view` has no widget. */
  template: TemplateId | WidgetTemplate;
  /** The view as made with the person's Metric, if there is one. */
  view?: ViewWith;
  /** The Metric's series are on their way. */
  drawing?: boolean;
  data: CanvasData;
  /** Laid out at the card's width, as on a phone's dashboard, instead of scaled down. */
  reflow?: boolean;
  /** The most height the picture takes, where cards stand in a grid. */
  maxHeight?: number;
};

/** A card's picture: the view with the person's Metric, else with Sample Data. */
export function ViewPicture({ template, view = NOTHING, drawing = false, data, reflow, maxHeight }: PictureProps) {
  return (
    <Fitted>{(w) => view.widget && typeof template === "string" ? <Preview widget={view.widget} data={data} size={TEMPLATES[template].size} width={w} maxHeight={maxHeight} reflow={reflow} />
      : drawing && !view.why ? <p className="py-10 text-sm text-muted-foreground">Drawing…</p>
      : <TemplatePreview template={template} viewer={data.viewer} numberStyle={data.numberStyle} width={w} maxHeight={maxHeight} reflow={reflow} />}</Fitted>
  );
}

type CardProps = Omit<React.LiHTMLAttributes<HTMLLIElement>, "children"> & {
  name: string;
  blurb?: string;
  /** Why the picture shows Sample Data, if it does for a reason. */
  why?: string | null;
  picture: React.ReactNode;
  /** The card's button or buttons. */
  action: React.ReactNode;
  /** Two to a row in a narrow panel: from 640 px up the line under the name is for screen readers (and the tooltip) only. */
  compact?: boolean;
};

/** One view as a card: its picture, its name and what it is, and what can be done with it. */
export function ViewCard({ name, blurb, why, picture, action, compact = false, className, ...rest }: CardProps) {
  const quiet = compact && "sm:sr-only";
  const pad = "max-sm:px-2";
  return (
    <li {...rest} className={cn("stock relative flex h-full min-w-0 flex-col gap-3 rounded-[var(--radius-card)] p-4 max-sm:p-2", compact && "gap-2 p-2", className)}>
      <div className="flex flex-1 flex-col justify-center gap-2">
        {picture}
        {why && <p className={cn("text-xs text-muted-foreground", pad, quiet)}>{why}</p>}
      </div>
      <div className={cn("flex items-end justify-between gap-3 max-sm:pb-2", pad, compact ? "gap-2" : "max-sm:flex-col max-sm:items-stretch")}>
        <div className="min-w-0">
          <p className={cn("font-medium", compact && "text-sm break-words")}>{name}</p>
          {blurb && <p className={cn("text-sm text-muted-foreground", quiet)}>{blurb}</p>}
        </div>
        {action}
      </div>
    </li>
  );
}
