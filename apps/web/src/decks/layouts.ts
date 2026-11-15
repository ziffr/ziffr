// Slide layouts: a 16:9 frame plus placeholder text, the way a deck tool starts a slide.
import { createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw";
import type { SlideDesign } from "@ziffr/core/types";

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

/** Adds a slide below the last one and returns its id. `words` replace the placeholder title and subtitle. */
export function addSlide(editor: Editor, layout: LayoutId, master?: SlideDesign | null, words: { title?: string; subtitle?: string } = {}): TLShapeId {
  // Type sizes come from the master: tldraw text sizes are xl = 44px and m = 24px at scale 1.
  const title = (master?.title_size ?? 44) / 44;
  const body = (master?.body_size ?? 24) / 24;
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
      text(words.title || "Title", MARGIN, 250, SLIDE_W - MARGIN * 2, "xl", title * 1.4);
      text(words.subtitle || "Subtitle, date or presenter", MARGIN, 380, SLIDE_W - MARGIN * 2, "m", body);
    } else if (layout === "title-content" || layout === "two-up") {
      text(words.title || "Slide title", MARGIN, 56, SLIDE_W - MARGIN * 2 - 200, "xl", title);
    } else if (layout === "section") {
      text("Section", MARGIN, 300, SLIDE_W - MARGIN * 2, "xl", title * 1.6);
    }
  });
  return id;
}

/** Content areas for a layout, in frame coordinates, used to place a dropped widget sensibly. */
export function contentAreas(): { x: number; y: number; w: number; h: number }[] {
  return [{ x: MARGIN, y: 150, w: SLIDE_W - MARGIN * 2, h: SLIDE_H - 150 - MARGIN }];
}

/** What a deck made from a dashboard or a story starts with (spec 0010): its name, a story's introduction, and its
 * widgets in reading order. */
export type DeckSeed = { name: string; intro: string; kind: "dashboard" | "story"; widgets: { template: string; metric_ids: number[]; settings: unknown; title: string | null }[] };

/** Lays out a new deck from a seed: a title slide, then one "title and content" slide per widget, the widget filling
 * the content area. `titleOf` names a widget's slide (its own title, else its Metric). */
export function seedSlides(editor: Editor, master: SlideDesign | null, seed: DeckSeed, widgetType: "ziffr-widget", titleOf: (w: DeckSeed["widgets"][number]) => string): TLShapeId {
  const first = addSlide(editor, "title", master, { title: seed.name, subtitle: seed.intro || (seed.kind === "dashboard" ? "Made from the dashboard of the same name" : "") });
  const [area] = contentAreas();
  for (const w of seed.widgets) {
    const slide = addSlide(editor, "title-content", master, { title: titleOf(w) });
    editor.createShape({ type: widgetType, parentId: slide, x: area.x, y: area.y, props: { w: area.w, h: area.h, template: w.template, metricIds: w.metric_ids, settings: JSON.stringify(w.settings ?? {}), title: "" } });
  }
  return first;
}
