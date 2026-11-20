// The Deck Template file format, ziffr.deck-template/1 (GLOSSARY: Deck Template, Slot): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module adds how a checked file becomes what a Deck Template stores.
import type { DeckTemplateFile } from "@ziffr/pack/deck-template-file";
import type { ViewDesign } from "@ziffr/pack/view-design";
import { templateWidgetSettings } from "./dashboard-template-file";
import type { DeckTemplateBody, SlideShape } from "./types";

export * from "@ziffr/pack/deck-template-file";

/** Rich text as the deck editor keeps it, from paragraphs of plain words. */
const richText = (paragraphsIn: string[]) => ({ type: "doc", content: paragraphsIn.map((p) => (p ? { type: "paragraph", content: [{ type: "text", text: p }] } : { type: "paragraph" })) });

/** A checked Deck Template file as the body a Deck Template stores: shapes as the deck editor makes them, a widget's
 * View Design from `designs` when the file names one by key, and the Theme as `themeId`. Every prop the editor needs
 * and the file leaves out takes the editor's default. */
export function deckTemplateFromFile(t: DeckTemplateFile, designs: ReadonlyMap<string, ViewDesign> = new Map(), themeId: number | null = null): DeckTemplateBody {
  const base = (x: number, y: number) => ({ x, y, rotation: 0, opacity: 1 });
  return {
    themeId,
    slides: t.slides.map((s) => ({
      shapes: s.shapes.flatMap((sh): SlideShape[] => {
        if (sh.shape === "text") return [{ type: "text", ...base(sh.x, sh.y), props: { richText: richText(sh.text), w: sh.w, autoSize: false, size: sh.size ?? "m", scale: sh.scale ?? 1, textAlign: sh.align ?? "start", color: sh.color ?? "black", font: "sans" } }];
        if (sh.shape === "box") return [{ type: "geo", ...base(sh.x, sh.y), props: { geo: sh.geo ?? "rectangle", w: sh.w, h: sh.h, fill: sh.fill ?? "none", color: sh.color ?? "black", dash: "solid", font: "sans", ...(sh.text ? { richText: richText(sh.text) } : {}) } }];
        const settings = templateWidgetSettings(sh.settings, designs);
        // A widget whose View Design is not among `designs` is left out, never drawn with another.
        return settings ? [{ type: "ziffr-widget", ...base(sh.x, sh.y), props: { w: sh.w, h: sh.h, template: sh.view }, widget: { metricSlots: sh.slots, title: sh.title ?? null, settings } }] : [];
      }),
    })),
  };
}
