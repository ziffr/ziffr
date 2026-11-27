"use client";
// Adding a widget to a dashboard (GLOSSARY: Dashboard, Widget, Pool, Slot; #1338): opening and closing the Add widget
// panel, placing what it offers, the empty "Add widget" card that stands in the next free place, and the stage that draws
// the grid smaller while the panel stands beside it. Everything is placed by the same placeWidget as before: this code
// only says what and where.
import { useEffect, useRef, useState } from "react";
import { setTransform, type Layout } from "react-grid-layout";
import { Plus } from "lucide-react";
import { inUse } from "@ziffr/core/metric-row";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import type { CanvasData, Widget } from "@ziffr/core/types";
import type { DropSource } from "@/app/canvas-actions";
import { addCardBox, dropOffset, GRID } from "@/lib/dashboard-grid";
import { getDrag, setDrag } from "@/lib/drag";
import { useMedia } from "@/lib/use-media";
import { useBoxSize } from "@/views/use-box-size";
import { TEMPLATES, DEFAULT_TEMPLATE } from "@/views/templates";
import { cn } from "@/lib/utils";
import { AddWidget } from "./add-widget";
import { useSlideOver } from "./slide-over-host";

type Place = { x: number; y: number };

type Options = {
  dashboardId: number | undefined;
  /** The person may change this dashboard and is looking at its grid. */
  mayChange: boolean;
  widgets: Widget[];
  /** Fills in what a thing still asks for (the Slot window); null when the person gave up. */
  complete: (source: DropSource, startWith?: number[]) => Promise<DropSource | null>;
  /** Puts it on the dashboard: at `at`, else in the next free place. */
  put: (dashboardId: number, source: DropSource, at?: Place) => void;
};

/** The first Metric by name that no widget here draws, for the panel to start with: "Show another number". */
function notShown(data: CanvasData, widgets: Widget[]): number | null {
  const drawn = new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)));
  return inUse(data.metrics).sort((a, b) => a.name.localeCompare(b.name)).find((m) => !drawn.has(m.id))?.id ?? null;
}

/** The widget just added is scrolled into view once the page has it, as it may land below the fold. Call what is returned before adding. */
function useShowAdded(widgets: Widget[]) {
  const wanted = useRef(false);
  const known = useRef(new Set(widgets.map((w) => w.id)));
  useEffect(() => {
    const fresh = widgets.find((w) => !known.current.has(w.id));
    known.current = new Set(widgets.map((w) => w.id));
    if (!fresh || !wanted.current) return;
    wanted.current = false;
    // After the grid has moved it to its place.
    const t = setTimeout(() => document.querySelector(`[data-widget="${fresh.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 300);
    return () => clearTimeout(t);
  }, [widgets]);
  return () => { wanted.current = true; };
}

/** The state of adding widgets to a dashboard: the panel, what is being dragged, and how things get placed. */
export function useAddWidget({ dashboardId, mayChange, widgets, complete, put }: Options) {
  // From this width the panel stands beside the dashboard; below it, it is the Slide-over.
  const docked = useMedia("(min-width: 1024px)", true);
  const slideOver = useSlideOver();
  const [adding, setAdding] = useState(false);
  // What is being dragged: a card from the panel or a widget on the grid.
  const [carrying, setCarrying] = useState<"card" | "widget" | null>(null);
  useEffect(() => setAdding(false), [dashboardId]);
  const open = mayChange && adding;
  const opener = useRef<HTMLElement | null>(null);
  const picked = useRef<number | null>(null);
  // The Metrics the Slots of a dragged card start from.
  const startWith = useRef<number[]>([]);
  const showAdded = useShowAdded(widgets);

  /** Views of several Metrics and templates ask for their Slots first (starting from `from`), then land like anything else. */
  const place = async (source: DropSource, at?: Place, from?: number[]) => {
    if (dashboardId === undefined) return;
    const filled = await complete(source, from);
    if (!filled) return;
    showAdded();
    put(dashboardId, filled, at);
  };
  const openAdd = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAdding(true);
  };
  const close = () => {
    setAdding(false);
    setCarrying(null);
    // The Slide-over gives the focus back itself.
    if (docked) opener.current?.focus();
  };
  const addFromPanel = (source: DropSource, from: number[]) => {
    if (docked) return void place(source, undefined, from);
    // The Slide-over covers the dashboard: it closes first, and the Slot window, if one is needed, opens once it has gone.
    slideOver.close();
    setAdding(false);
    setTimeout(() => void place(source, undefined, from), 250);
  };
  // The Slide-over keeps what it was opened with, so it calls through to the handler of the moment.
  const adder = useRef(addFromPanel);
  adder.current = addFromPanel;

  return {
    open,
    beside: open && docked,
    openAdd,
    close,
    carrying,
    setCarrying,
    /** Something was dropped on the grid at `at`. */
    drop: (event: Event, at: Place) => {
      let source = getDrag();
      try {
        source = JSON.parse((event as DragEvent).dataTransfer?.getData("text/plain") ?? "") as DropSource;
      } catch {}
      setDrag(null);
      setCarrying(null);
      if (source) void place(source, at, startWith.current);
    },
    /** The panel, while it is open. */
    panel: (data: CanvasData, saved: Widget[]) => open && (
      <AddWidget
        docked={docked}
        onClose={close}
        data={data}
        saved={saved}
        metricId={picked.current ?? notShown(data, widgets)}
        onPick={(id) => { picked.current = id; }}
        onAdd={(source, from) => adder.current(source, from)}
        onDrag={docked ? (from) => { startWith.current = from ?? []; setCarrying(from ? "card" : null); } : undefined}
      />
    ),
  };
}

/** What the grid library needs to work on a grid drawn at `scale`. It moves and resizes widgets in the grid's own pixels
 * when told the scale; a card dragged in it measures in screen pixels, which `onDragOver` makes up for. */
export function scaledGrid(scale: number, carryingCard: boolean, size: () => { w: number; h: number }) {
  return {
    positionStrategy: scale === 1 || carryingCard ? undefined : { type: "transform" as const, scale, calcStyle: setTransform },
    onDragOver: (e: DragEvent) => {
      const grid = (e.target as Element).closest?.(".react-grid-layout");
      return scale === 1 || !grid ? size() : { ...size(), ...dropOffset(e.clientX, e.clientY, grid.getBoundingClientRect(), scale) };
    },
  };
}

type Card = {
  layout: Layout;
  oneColumn: boolean;
  /** The dashboard has no widget yet. */
  first: boolean;
  /** While something is being dragged the card steps aside, so the drop reaches the grid. */
  hidden: boolean;
  onOpen: () => void;
};

/** Holds the grid at `width` and draws it at `scale`, taking only the room it then fills (at scale 1 it changes nothing),
 * with the empty "Add widget" card in the next free place when there is a `card`. */
export function GridStage({ width, scale, card, children }: { width: number; scale: number; card: Card | null; children: React.ReactNode }) {
  const [inner, { h }] = useBoxSize<HTMLDivElement>();
  const box = card && addCardBox(card.layout, width, card.oneColumn, TEMPLATES[DEFAULT_TEMPLATE].size);
  const minHeight = box ? box.top + box.height + GRID.padding : undefined;
  return (
    <div style={scale < 1 ? { height: h * scale } : undefined}>
      <div ref={inner} className="relative" style={scale < 1 ? { width, minHeight, transform: `scale(${scale})`, transformOrigin: "top left" } : { minHeight }}>
        {children}
        {card && box && (
          <button
            type="button"
            data-add-card
            onClick={card.onOpen}
            style={box}
            className={cn("absolute flex flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-rule-2)] p-2 text-center text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", card.hidden && "pointer-events-none invisible")}
          >
            <span className="flex items-center gap-1.5 font-medium"><Plus aria-hidden className="size-4" /> Add widget</span>
            <span className="text-xs text-muted-foreground">{card.first ? "Show your first number" : "Show another number"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
