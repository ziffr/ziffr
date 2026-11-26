"use client";
// Text boxes with live values on a slide (GLOSSARY: Placeholder, Slide, Deck; ticket #1172): text, a box or note with
// words and an arrow's label are drawn with their Placeholders filled, on screen, when presenting, on View Links and in
// the pictures an export makes. The stored words are never touched: a box shows them as written only while the person
// works on it.
// Visibility: values come only from the data this viewer was sent, or on a slide that keeps numbers only from what the
// core answered them of the Snapshot. Anything missing is left empty, never taken from elsewhere.
import { ArrowShapeUtil, atom, GeoShapeUtil, getDisplayValues, NoteShapeUtil, renderHtmlFromRichTextForMeasurement, TextShapeUtil, type Atom, type Editor, type SvgExportContext, type TLShape, type TLShapeId, type TLTextShape } from "tldraw";
import { filledRichText, richRuns, textList, textMetricIds } from "@ziffr/core/slide-text";
import type { CanvasData } from "@ziffr/core/types";
import { useSeriesReady } from "@/canvas/series-store";
import { slideNumber, slideOf } from "../elements/slide-page";
import { onSlide, type Kept } from "../kept/kept-drawing";
import { keptOf } from "../kept/kept-store";

/** What the text boxes of an editor are filled from: the viewer's live data and what they get of Snapshots. */
export type TextFill = { data: CanvasData; kept: Kept | null };

// Held per editor as a signal, so a box is drawn and measured again when it changes, in exports too.
const fills = new WeakMap<Editor, Atom<TextFill | null>>();
function fillOf(editor: Editor): Atom<TextFill | null> {
  let found = fills.get(editor);
  if (!found) fills.set(editor, (found = atom<TextFill | null>("text box values", null)));
  return found;
}

/** Hands an editor what to fill its text boxes from. Until then their Placeholders are drawn empty. */
export const setTextFill = (editor: Editor, fill: TextFill) => fillOf(editor).set(fill);

const NOTHING = { metrics: [], series: {} } as unknown as CanvasData;

/** What one box is filled from: the live data, on a slide that keeps numbers the Snapshot's, else nothing. */
function dataFor(editor: Editor, id: TLShapeId): CanvasData {
  const fill = fillOf(editor).get();
  if (!fill) return NOTHING;
  const on = onSlide(keptOf(editor).get(id), fill.kept, fill.data, {});
  return "words" in on ? NOTHING : on.data;
}

/** A shape's rich text as this viewer reads it, or undefined for one whose words stay as written. */
export function filledWords(editor: Editor, shape: TLShape): unknown {
  if (textList(shape) === undefined) return undefined;
  const paged = richRuns((shape.props as { richText?: unknown }).richText).some((t) => /\{slide\}/i.test(t));
  const slide = paged ? slideOf(editor, shape.id) : undefined;
  return filledRichText(shape, dataFor(editor, shape.id), slide ? slideNumber(editor, slide) : undefined);
}

/** The shape with other words, for drawing only: it is never written back. */
const withWords = <S extends TLShape>(shape: S, richText: unknown): S => ({ ...shape, props: { ...shape.props, richText } });

/** Whether the person works on this box: selected alone, being edited, or about to be. tldraw mounts its text editor
 * only then, so it must be given the words as written and nothing filled in could be saved. */
function atWork(editor: Editor, id: TLShapeId): boolean {
  const editing = editor.getEditingShapeId();
  return editor.getOnlySelectedShapeId() === id || editing === id || (editing !== null && editor.getHoveredShapeId() === id);
}

// The copies made for the screen: a text box measures them as they are.
const onScreen = new WeakSet<object>();

/** The shape as the canvas draws it now. */
function useDrawn<S extends TLShape>(editor: Editor, shape: S): S {
  const fill = fillOf(editor).get();
  // A Metric just named may still lack its series; a slide that keeps numbers asks for none.
  useSeriesReady(fill && !keptOf(editor).get(shape.id) ? textMetricIds(shape) : [], fill?.data ?? NOTHING);
  const filled = filledWords(editor, shape);
  if (filled === undefined) return shape;
  const drawn = withWords(shape, atWork(editor, shape.id) ? (shape.props as { richText?: unknown }).richText : filled);
  onScreen.add(drawn);
  return drawn;
}

/** The shape as a picture or file shows it: always filled. */
export function exported<S extends TLShape>(editor: Editor, shape: S): S {
  const filled = filledWords(editor, shape);
  return filled === undefined ? shape : withWords(shape, filled);
}

/** The size of a text box's words, as tldraw measures a text shape. */
function sizeOf(util: TextShapeUtil, shape: TLTextShape) {
  const dv = getDisplayValues(util, shape);
  const fixed = shape.props.autoSize ? null : Math.max(16, Math.floor(shape.props.w));
  const size = util.editor.textMeasure.measureHtml(renderHtmlFromRichTextForMeasurement(util.editor, shape.props.richText), {
    lineHeight: dv.lineHeight, fontWeight: dv.fontWeight, fontStyle: dv.fontStyle, padding: "0px", fontFamily: dv.fontFamily, fontSize: dv.fontSize, maxWidth: fixed,
  });
  return { width: fixed ?? Math.max(16, size.w + 1), height: Math.max(dv.fontSize, size.h) };
}

/** Words typed with the toolbar. */
class LiveTextShapeUtil extends TextShapeUtil {
  override getMinDimensions(shape: TLTextShape) {
    if (onScreen.has(shape)) return sizeOf(this, shape);
    // The box is as large as what it reads, except while its words are being typed.
    const filled = this.editor.getEditingShapeId() === shape.id ? undefined : filledWords(this.editor, shape);
    if (filled === undefined) return super.getMinDimensions(shape);
    this.editor.fonts.trackFontsForShape(shape);
    return sizeOf(this, withWords(shape, filled));
  }

  override component(shape: TLTextShape) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- tldraw calls component() as a React render function
    return super.component(useDrawn(this.editor, shape));
  }

  override toSvg(shape: TLTextShape, ctx: SvgExportContext) {
    return super.toSvg(exported(this.editor, shape), ctx);
  }
}

class LiveGeoShapeUtil extends GeoShapeUtil {
  override component(shape: Parameters<GeoShapeUtil["component"]>[0]) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- tldraw calls component() as a React render function
    return super.component(useDrawn(this.editor, shape));
  }

  override toSvg(shape: Parameters<GeoShapeUtil["toSvg"]>[0], ctx: SvgExportContext) {
    return super.toSvg(exported(this.editor, shape), ctx);
  }
}

class LiveNoteShapeUtil extends NoteShapeUtil {
  override component(shape: Parameters<NoteShapeUtil["component"]>[0]) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- tldraw calls component() as a React render function
    return super.component(useDrawn(this.editor, shape));
  }

  override toSvg(shape: Parameters<NoteShapeUtil["toSvg"]>[0], ctx: SvgExportContext) {
    return super.toSvg(exported(this.editor, shape), ctx);
  }
}

class LiveArrowShapeUtil extends ArrowShapeUtil {
  override component(shape: Parameters<ArrowShapeUtil["component"]>[0]) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- tldraw calls component() as a React render function
    return super.component(useDrawn(this.editor, shape));
  }

  override toSvg(shape: Parameters<ArrowShapeUtil["toSvg"]>[0], ctx: SvgExportContext) {
    return super.toSvg(exported(this.editor, shape), ctx);
  }
}

/** The shapes that hold words, as every deck canvas draws them. */
export const textShapeUtils = [LiveTextShapeUtil, LiveGeoShapeUtil, LiveNoteShapeUtil, LiveArrowShapeUtil];
