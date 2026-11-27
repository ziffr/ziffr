"use client";
// GLOSSARY: Preview, Sample Data, Deck Template, Pack. A Deck Template's first slides drawn small, read-only and with
// Sample Data, without the slide editor: its words, boxes and widgets where they stand on a 1280 by 720 slide. Like
// every Preview it shows none of the Workspace's numbers, calls nothing and takes no pointer or keyboard.
import { useMemo } from "react";
import type { packSample } from "@ziffr/core/pack-sample";
import type { NumberStyle } from "@ziffr/core/number-style";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { filledRichText, richRuns } from "@ziffr/core/slide-text";
import { fromDeckTemplate } from "@ziffr/core/team-templates";
import type { CanvasData, DeckTemplate, SlideShape, TemplateId, WidgetSettings } from "@ziffr/core/types";
import { useBoxSize } from "@/views/use-box-size";
import { withPackSample } from "./preview";
import { ReadOnlyFrame } from "./read-only-frame";

const SLIDE = { w: 1280, h: 720 };
// The text sizes of the slide editor, in slide pixels before a box's own scale.
const SIZE: Record<string, number> = { s: 18, m: 24, l: 36, xl: 44 };
const ALIGN: Record<string, "left" | "center" | "right"> = { start: "left", middle: "center", end: "right" };

const num = (v: unknown, otherwise = 0) => (typeof v === "number" && Number.isFinite(v) ? v : otherwise);

/** One shape where it stands: words, a box, or a widget's card. What the editor alone can draw is left as room. */
function Shape({ shape, data }: { shape: SlideShape; data: CanvasData }) {
  const p = shape.props;
  const at = { left: shape.x, top: shape.y, width: num(p.w, 200), height: p.h === undefined ? undefined : num(p.h) };
  if (shape.type === "ziffr-widget") {
    // A Slide Element is drawn by the slide editor only.
    if (p.template === "slide") return null;
    let settings: WidgetSettings = {};
    try { settings = JSON.parse(String(p.settings || "{}")) as WidgetSettings; } catch { /* written by the core */ }
    const widget = { template: p.template as TemplateId, metric_ids: (p.metricIds as number[]) ?? [], settings, title: String(p.title ?? "") || null };
    return <div className="absolute" style={at}><ReadOnlyFrame widget={widget} data={data} /></div>;
  }
  if (shape.type !== "text" && shape.type !== "geo") return null;
  const words = p.richText === undefined ? [] : richRuns(filledRichText(shape, data) ?? p.richText);
  const box = shape.type === "geo";
  return (
    <div
      className={box ? "absolute flex flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-border bg-muted p-4" : "absolute"}
      style={{ ...at, fontSize: (SIZE[String(p.size)] ?? SIZE.m) * num(p.scale, 1), lineHeight: 1.25, textAlign: box ? "center" : ALIGN[String(p.textAlign)] ?? "left" }}
    >
      {words.map((line, i) => <p key={i} className="break-words">{line}</p>)}
    </div>
  );
}

/** The first `most` slides of a Deck Template, one below the other, at the width they are given. */
export function SlidesPreview({ deck, pack, viewer, numberStyle, most = 3 }: { deck: Pick<DeckTemplate, "slots" | "body">; pack: ReturnType<typeof packSample>; viewer: string; numberStyle: NumberStyle; most?: number }) {
  const [box, { w }] = useBoxSize<HTMLDivElement>();
  const data = useMemo(() => withPackSample(sampleCanvasData(viewer, numberStyle), pack), [viewer, numberStyle, pack]);
  const slides = useMemo(() => fromDeckTemplate(deck.body, pack.fills(deck.slots)).slice(0, most), [deck, pack, most]);
  const scale = Math.min(1, (w || 640) / SLIDE.w);
  return (
    <div ref={box} className="space-y-2">
      {slides.map((shapes, i) => (
        <div key={i} aria-hidden inert data-preview="slide" className="stock relative overflow-hidden rounded-[var(--radius-card)] select-none" style={{ width: SLIDE.w * scale, height: SLIDE.h * scale }}>
          <div className="pointer-events-none relative origin-top-left text-card-foreground" style={{ width: SLIDE.w, height: SLIDE.h, transform: `scale(${scale})` }}>
            {shapes.map((shape, k) => <Shape key={k} shape={shape} data={data} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
