"use client";
// What a Theme draws behind every slide of a deck (GLOSSARY: Theme): logo, footer, number, background.
// MasterArt uses inline styles only, so it renders the same in the editor, inside tldraw's SVG
// export (foreignObject, where class-based CSS does not travel) and in the Masters editor.
import { createContext, useContext } from "react";
import { FrameShapeUtil, HTMLContainer, useEditor, useValue, type SvgExportContext, type TLFrameShape } from "tldraw";
import type { SlideDesign } from "@ziffr/core/types";

export const MARGIN_X = 48;
export const MARGIN_Y = 36;
const FOOTER_PX = 15;

export const DeckMaster = createContext<SlideDesign | null>(null);
let exportMaster: SlideDesign | null = null;
export const setDeckExportMaster = (m: SlideDesign | null) => (exportMaster = m);

/** Where the master's parts sit, in slide pixels (w × h). Shared with the PowerPoint export. */
export function masterGeometry(m: SlideDesign, w: number, h: number) {
  const lw = m.logo_width;
  const lh = lw / (Number(m.logo_ratio) || 3);
  const left = m.logo_position.endsWith("left");
  const top = m.logo_position.startsWith("top");
  return {
    logo: { x: left ? MARGIN_X : w - MARGIN_X - lw, y: top ? MARGIN_Y : h - MARGIN_Y - lh, w: lw, h: lh },
    footer: { x: MARGIN_X, y: h - MARGIN_Y - FOOTER_PX * 1.4, w: w / 2, h: FOOTER_PX * 1.4, size: FOOTER_PX },
    number: { x: w - MARGIN_X - 80, y: h - MARGIN_Y - FOOTER_PX * 1.4, w: 80, h: FOOTER_PX * 1.4, size: FOOTER_PX },
  };
}

export function MasterArt({ master, w, h, index, sample }: { master: SlideDesign; w: number; h: number; index?: number; sample?: boolean }) {
  const g = masterGeometry(master, w, h);
  const logoAtBottomLeft = master.logo && master.logo_position === "bottom-left";
  const logoAtBottomRight = master.logo && master.logo_position === "bottom-right";
  const muted = `color-mix(in oklab, ${master.text_color} 62%, transparent)`;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: w,
        height: h,
        backgroundColor: master.background_color,
        backgroundImage: master.background_image ? `url(${master.background_image})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        pointerEvents: "none",
        overflow: "hidden",
        fontFamily: "var(--font-deck)",
      }}
    >
      {master.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={master.logo} alt="" style={{ position: "absolute", left: g.logo.x, top: g.logo.y, width: g.logo.w, height: g.logo.h, objectFit: "contain" }} />
      )}
      {master.footer && !logoAtBottomLeft && (
        <div style={{ position: "absolute", left: g.footer.x, top: g.footer.y, width: g.footer.w, fontSize: g.footer.size, lineHeight: 1.4, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {master.footer}
        </div>
      )}
      {master.show_slide_number && !logoAtBottomRight && (
        <div style={{ position: "absolute", left: g.number.x, top: g.number.y, width: g.number.w, fontSize: g.number.size, lineHeight: 1.4, color: muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {index ?? 1}
        </div>
      )}
      {sample && (
        <>
          <div style={{ position: "absolute", left: 64, top: 48, fontSize: master.title_size, fontWeight: 700, color: master.text_color, lineHeight: 1.1 }}>Slide title</div>
          <div style={{ position: "absolute", left: 64, top: 48 + master.title_size * 1.4, fontSize: master.body_size, color: master.text_color, lineHeight: 1.4 }}>Body text sits here at the theme’s size.</div>
        </>
      )}
    </div>
  );
}

function useMaster() {
  return useContext(DeckMaster) ?? exportMaster;
}

function useSlideIndex(id: TLFrameShape["id"]) {
  const editor = useEditor();
  return useValue(
    "slide index",
    () =>
      editor
        .getCurrentPageShapes()
        .filter((s) => s.type === "frame")
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .findIndex((s) => s.id === id) + 1,
    [editor, id],
  );
}

function MasterLayer({ shape }: { shape: TLFrameShape }) {
  const master = useMaster();
  const index = useSlideIndex(shape.id);
  if (!master || shape.meta?.hideMaster) return null;
  return (
    <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: "none", overflow: "hidden" }}>
      <MasterArt master={master} w={shape.props.w} h={shape.props.h} index={index} />
    </HTMLContainer>
  );
}

function MasterSvg({ shape }: { shape: TLFrameShape }) {
  const master = useMaster();
  const index = useSlideIndex(shape.id);
  if (!master || shape.meta?.hideMaster) return null;
  return (
    <foreignObject x={0} y={0} width={shape.props.w} height={shape.props.h}>
      <div style={{ position: "relative", width: shape.props.w, height: shape.props.h }}>
        <MasterArt master={master} w={shape.props.w} h={shape.props.h} index={index} />
      </div>
    </foreignObject>
  );
}

/** A slide is a tldraw frame with the deck's master drawn behind its content. */
export class SlideFrameUtil extends FrameShapeUtil {
  override component(shape: TLFrameShape) {
    return (
      <>
        {super.component(shape)}
        <MasterLayer shape={shape} />
      </>
    );
  }

  override toSvg(shape: TLFrameShape, ctx: SvgExportContext) {
    return (
      <>
        {super.toSvg(shape, ctx)}
        <MasterSvg shape={shape} />
      </>
    );
  }
}
