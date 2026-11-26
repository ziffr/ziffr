"use client";
// What one slide of a deck says about its page (GLOSSARY: Slide, Slide Element; spec 0057): its number, and which of the
// Theme's logo, footer and number it draws. A cover draws none of them and is not counted; a slide with a logo place, a
// page number or a footer line of its own does not get the Theme's second copy of it.
import { useMemo } from "react";
import { useEditor, useValue, type Editor, type TLShapeId } from "tldraw";
import type { SlideDesign } from "@ziffr/core/types";
import type { SlideElement } from "@ziffr/core/slide-element";

const frames = (editor: Editor) => editor.getCurrentPageShapes().filter((s) => s.type === "frame").sort((a, b) => a.y - b.y || a.x - b.x);

/** The page number of the slide `id`: its place among the slides, covers not counted. */
export function slideNumber(editor: Editor, id: TLShapeId): number {
  const all = frames(editor);
  const at = all.findIndex((s) => s.id === id);
  return all.slice(0, at + 1).filter((s) => !s.meta?.cover).length;
}

/** The slide a shape stands on, however deep in groups, or undefined for one beside the slides. */
export function slideOf(editor: Editor, id: TLShapeId): TLShapeId | undefined {
  return editor.getShapeAncestors(id).find((s) => s.type === "frame")?.id;
}

/** A shape's Slide Element, when it is one. */
export function elementOf(props: unknown): SlideElement | undefined {
  const p = props as { template?: unknown; settings?: unknown };
  if (p?.template !== "slide" || typeof p.settings !== "string") return undefined;
  try { return (JSON.parse(p.settings) as { element?: SlideElement }).element; } catch { return undefined; }
}

/** Which of the Theme's parts ("footer", "logo", "number") a slide's own elements stand in for, as one string. */
export function standIns(editor: Editor, slide: TLShapeId): string {
  if (editor.getShape(slide)?.meta?.cover) return "logo number footer";
  const found = editor.getSortedChildIdsForParent(slide).flatMap((child) => {
    const e = elementOf(editor.getShape(child)?.props);
    if (!e) return [];
    if (e.kind === "logo") return ["logo"];
    if (e.kind !== "words") return [];
    return [...(e.foot ? ["footer"] : []), ...(e.text.some((t) => t.includes("{slide}")) ? ["number"] : [])];
  });
  return [...new Set(found)].sort().join(" ");
}

/** What the Theme draws on this slide: the master without the parts the slide stands in for. */
export function useSlideMaster(master: SlideDesign | null, slide: TLShapeId): SlideDesign | null {
  const editor = useEditor();
  const hidden = useValue("slide stand-ins", () => standIns(editor, slide), [editor, slide]);
  return useMemo(() => {
    if (!master || !hidden) return master;
    return { ...master, ...(hidden.includes("logo") ? { logo: null } : {}), ...(hidden.includes("footer") ? { footer: "" } : {}), ...(hidden.includes("number") ? { show_slide_number: false } : {}) };
  }, [master, hidden]);
}
