"use client";
// The line at the foot of a slide that says where its numbers come from (spec 0061; GLOSSARY: Slide, Snapshot): on a
// slide that keeps numbers, whose they are and as of when; on a slide of a deck made from a Snapshot before decks
// kept numbers, that they are live. Drawn on screen, when presenting and in the picture a PDF is made of.
import { useEditor, useValue, type Editor, type TLShape, type TLShapeId } from "tldraw";
import { useDeckData, WIDGET_SHAPE, widgetFromShape, type WidgetShape } from "../widget-shape";
import { keptSlideLines, liveLine, type Kept } from "./kept-drawing";
import { keptOf, useKept } from "./kept-store";
import type { CanvasData } from "@ziffr/core/types";

/** The shapes standing on a slide, however deep in groups. */
function shapesOn(editor: Editor, id: TLShapeId): TLShape[] {
  return editor.getSortedChildIdsForParent(id).flatMap((child) => {
    const shape = editor.getShape(child);
    return shape ? [shape, ...shapesOn(editor, shape.id)] : [];
  });
}

/** For a slide of a deck made from a Snapshot before decks kept numbers: the latest day its live Widgets are drawn up
 * to, or null for any other slide. */
export function liveUpTo(editor: Editor, slide: TLShapeId): string | null {
  const kept = keptOf(editor);
  const days = shapesOn(editor, slide).flatMap((s) => {
    if (s.type !== WIDGET_SHAPE || kept.has(s.id)) return [];
    const day = widgetFromShape(s as WidgetShape).settings.asOf;
    return day ? [day] : [];
  });
  return days.sort().at(-1) ?? null;
}

/** What a slide says under its own numbers; the same lines the exports write. */
export function slideLines(editor: Editor, slide: TLShapeId, kept: Kept | null, data: Pick<CanvasData, "themes">): string[] {
  const own = [...keptOf(editor).values()].filter((s) => s.slideId === slide);
  const day = liveUpTo(editor, slide);
  return [...keptSlideLines(own, kept, data), ...(day ? [liveLine(day)] : [])];
}

/** A slide's lines, centred at its foot, clear of the Theme's footer and number. */
export function SlideLines({ slide, w, h, colour }: { slide: TLShapeId; w: number; h: number; colour?: string }) {
  const editor = useEditor();
  const kept = useKept();
  const data = useDeckData();
  const words = useValue("slide lines", () => (data ? slideLines(editor, slide, kept, data).join(" | ") : ""), [editor, slide, kept, data]);
  if (!words) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: h - 22, width: w, height: 18, fontSize: 12, lineHeight: "18px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: colour ?? "var(--color-muted)", fontFamily: "var(--font-deck)", pointerEvents: "none" }}>
      {words}
    </div>
  );
}
