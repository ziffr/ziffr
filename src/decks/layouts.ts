// Slide layouts: a 16:9 frame plus placeholder text, the way a deck tool starts a slide.
import { createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;
export const MARGIN = 64;

export type LayoutId = "title" | "title-content" | "two-up" | "section" | "blank";

export const LAYOUTS: { id: LayoutId; label: string; blurb: string }[] = [
  { id: "title", label: "Title slide", blurb: "A title and a subtitle" },
  { id: "title-content", label: "Title and content", blurb: "A title over one large area for a widget" },
  { id: "two-up", label: "Two widgets", blurb: "A title over two side-by-side areas" },
  { id: "section", label: "Section header", blurb: "One large line that opens a section" },
  { id: "blank", label: "Blank", blurb: "Nothing but the slide" },
];

function slides(editor: Editor) {
  return editor
    .getCurrentPageShapes()
    .filter((s) => s.type === "frame")
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function orderedSlides(editor: Editor) {
  return slides(editor);
}

/** Adds a slide below the last one and returns its id. */
export function addSlide(editor: Editor, layout: LayoutId): TLShapeId {
  const existing = slides(editor);
  const last = existing[existing.length - 1];
  const x = last ? last.x : 0;
  const y = last ? last.y + SLIDE_H + 120 : 0;
  const id = createShapeId();
  editor.run(() => {
    editor.createShape({ id, type: "frame", x, y, props: { w: SLIDE_W, h: SLIDE_H, name: `Slide ${existing.length + 1}` } });
    const text = (t: string, px: number, py: number, w: number, size: "s" | "m" | "l" | "xl", scale = 1) =>
      editor.createShape({ type: "text", parentId: id, x: px, y: py, props: { richText: toRichText(t), size, w, autoSize: false, scale, color: "black", font: "sans" } });
    if (layout === "title") {
      text("Title", MARGIN, 250, SLIDE_W - MARGIN * 2, "xl", 1.6);
      text("Subtitle, date or presenter", MARGIN, 380, SLIDE_W - MARGIN * 2, "m");
    } else if (layout === "title-content") {
      text("Slide title", MARGIN, 48, SLIDE_W - MARGIN * 2, "xl");
    } else if (layout === "two-up") {
      text("Slide title", MARGIN, 48, SLIDE_W - MARGIN * 2, "xl");
    } else if (layout === "section") {
      text("Section", MARGIN, 300, SLIDE_W - MARGIN * 2, "xl", 1.8);
    }
  });
  return id;
}

/** Content areas for a layout, in frame coordinates, used to place a dropped widget sensibly. */
export function contentAreas(): { x: number; y: number; w: number; h: number }[] {
  return [{ x: MARGIN, y: 150, w: SLIDE_W - MARGIN * 2, h: SLIDE_H - 150 - MARGIN }];
}
