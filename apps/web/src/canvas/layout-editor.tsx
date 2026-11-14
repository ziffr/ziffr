"use client";
// "Edit layout…": the deck's slide canvas at the size of one widget. Drag widgets in from the Pool,
// add text, arrows and shapes; saving stores the document and the data it was drawn against.
import "tldraw/tldraw.css";
import { keepContentLocal, LOCAL_ONLY_OVERRIDES } from "./keep-local";
import { useState } from "react";
import { createShapeId, DefaultDashStyle, DefaultFontStyle, getSnapshot, Tldraw, type Editor, type TLEditorSnapshot } from "tldraw";
import { Pool } from "@/components/pool";
import { Button } from "@/components/ui/button";
import { DeckData, WIDGET_SHAPE, WidgetShapeUtil, type WidgetShape } from "@/decks/widget-shape";
import { getDrag, setDrag } from "@/lib/drag";
import { dropSpec } from "@/lib/drop-spec";
import { useSlotFill } from "@/components/slot-dialog";
import type { DropSource } from "@/app/canvas-actions";
import type { CanvasData, Widget, WidgetSettings } from "@ziffr/core/types";
import { ARTBOARD_UNIT, artboard, stampOf } from "./artboard";

const shapeUtils = [WidgetShapeUtil];

export default function LayoutEditor({ widget, data, saved, onSave, onCancel }: { widget: Pick<Widget, "w" | "h" | "settings">; data: CanvasData; saved: Widget[]; onSave: (settings: WidgetSettings, metricIds: number[]) => void; onCancel: () => void }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [snapshot] = useState(() => (widget.settings.canvas?.document ? ({ document: widget.settings.canvas.document } as unknown as TLEditorSnapshot) : undefined));
  const W = widget.w * ARTBOARD_UNIT.w;
  const H = widget.h * ARTBOARD_UNIT.h;

  const slotFill = useSlotFill(data);
  const place = async (s0: DropSource | null, page?: { x: number; y: number }) => {
    const s = s0 && (await slotFill.complete(s0));
    if (!editor || !s) return;
    const frame = artboard(editor);
    const spec = dropSpec(s, data, saved, "line");
    if (!spec) return;
    const w = Math.min(W * 0.6, 520), h = Math.min(H * 0.6, 320);
    const fb = frame ? editor.getShapePageBounds(frame)! : { x: 0, y: 0 };
    const at = page ? { x: page.x - fb.x - w / 2, y: page.y - fb.y - h / 2 } : { x: 24, y: 24 };
    editor.createShape<WidgetShape>({ id: createShapeId(), type: WIDGET_SHAPE, parentId: frame?.id, x: Math.max(0, at.x), y: Math.max(0, at.y), props: { w, h, template: spec.template, metricIds: spec.metricIds, settings: JSON.stringify(spec.settings), title: spec.title } });
  };

  return (
    <DeckData.Provider value={data}>
      <div className="grid h-full gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <Pool data={data} saved={saved} onAdd={(s) => place(s)} hint="Drag widgets onto the artboard; use the toolbar for text, arrows and shapes." />
        {slotFill.dialog}
        <div className="flex min-h-0 flex-col gap-3">
          <div
            className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-card)] border border-border"
            onDragOverCapture={(e) => { if (getDrag()) { e.preventDefault(); e.stopPropagation(); } }}
            onDropCapture={(e) => { const s = getDrag(); if (!s || !editor) return; e.preventDefault(); e.stopPropagation(); setDrag(null); place(s, editor.screenToPage({ x: e.clientX, y: e.clientY })); }}
          >
            <Tldraw
              shapeUtils={shapeUtils}
              snapshot={snapshot}
              overrides={LOCAL_ONLY_OVERRIDES}
              onMount={(ed) => {
                setEditor(ed);
                keepContentLocal(ed);
                ed.user.updateUserPreferences({ colorScheme: "light", locale: "en" }); // the app is English, whatever the browser says
                ed.setStyleForNextShapes(DefaultFontStyle, "sans");
                ed.setStyleForNextShapes(DefaultDashStyle, "solid");
                if (!artboard(ed)) {
                  // First time: an artboard at the widget's size, with the widget it started from on it.
                  const frameId = createShapeId();
                  ed.createShape({ id: frameId, type: "frame", x: 0, y: 0, props: { w: W, h: H, name: "Layout" } });
                  const seed = widget.settings.canvasSeed;
                  if (seed && seed.metric_ids.length) {
                    ed.createShape<WidgetShape>({ type: WIDGET_SHAPE, parentId: frameId, x: 16, y: 16, props: { w: W * 0.62, h: H - 32, template: seed.template === "canvas" ? "line" : seed.template, metricIds: seed.metric_ids, settings: JSON.stringify(seed.settings ?? {}), title: "" } });
                  }
                }
                ed.zoomToBounds(ed.getShapePageBounds(artboard(ed)!)!, { inset: 32 });
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              disabled={!editor}
              onClick={() => {
                if (!editor) return;
                const latest = (id: number) => { const m = data.metrics.find((x) => x.id === id); return m ? (data.series[m.slug] ?? []).at(-1)?.period : undefined; };
                const stamp = stampOf(editor, latest);
                // Plain JSON only: tldraw records can hold class instances that server actions cannot carry.
                onSave({ ...widget.settings, canvasSeed: null, canvas: { document: JSON.parse(JSON.stringify(getSnapshot(editor.store).document)), stamp } }, Object.keys(stamp).map(Number));
              }}
            >
              Save layout
            </Button>
          </div>
        </div>
      </div>
    </DeckData.Provider>
  );
}
