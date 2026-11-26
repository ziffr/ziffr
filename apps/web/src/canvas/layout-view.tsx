"use client";
// A free-layout widget on a dashboard: the tldraw document read-only, live numbers inside its widgets.
import "tldraw/tldraw.css";
import { useState } from "react";
import { type TLEditorSnapshot } from "tldraw";
import { TriangleAlert } from "lucide-react";
import { DeckData, WidgetShapeUtil } from "@/decks/widget-shape";
import { SlideCanvas } from "@/decks/slide-canvas";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { artboard } from "./artboard";

const shapeUtils = [WidgetShapeUtil];

export default function LayoutView({ settings, data }: { settings: WidgetSettings; data: CanvasData }) {
  const [snapshot] = useState(() => (settings.canvas?.document ? ({ document: settings.canvas.document } as unknown as TLEditorSnapshot) : undefined));
  if (!snapshot) return <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">Right-click and choose “Edit layout…” to place widgets, text and arrows.</div>;
  // Free arrows do not follow the data: say so when a metric has a newer period than when this was drawn.
  const moved = Object.entries(settings.canvas?.stamp ?? {}).some(([id, period]) => {
    const m = data.metrics.find((x) => x.id === Number(id));
    return m && (data.series[m.slug] ?? []).at(-1)?.period !== period;
  });
  return (
    <DeckData.Provider value={data}>
      <div className="layout-view relative h-full w-full overflow-hidden rounded-[var(--radius-input)]" style={{ pointerEvents: "none" }}>
        <SlideCanvas
          shapeUtils={shapeUtils}
          snapshot={snapshot}
          hideUi
          onMount={(editor) => {
            editor.updateInstanceState({ isReadonly: true });
            const frame = artboard(editor);
            const fit = () => { const b = frame ? editor.getShapePageBounds(frame) : editor.getCurrentPageBounds(); if (b) editor.zoomToBounds(b, { inset: 0 }); };
            fit();
            const ro = new ResizeObserver(fit);
            ro.observe(editor.getContainer());
            return () => ro.disconnect();
          }}
        />
        {moved && (
          <span className="absolute right-1 bottom-1 flex items-center gap-1 rounded-[var(--radius-input)] bg-[var(--color-cotton)] px-1.5 py-0.5 text-xs text-muted-foreground shadow-[var(--edge-stock)]" title="Free text and arrows stay where they were drawn; check they still point at the right thing.">
            <TriangleAlert aria-hidden className="size-3" /> Data changed since this layout was drawn
          </span>
        )}
      </div>
    </DeckData.Provider>
  );
}
