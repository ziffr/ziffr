// Shared by the layout editor and the read-only view: one artboard frame sized to the widget.
import type { Editor } from "tldraw";

export const ARTBOARD_UNIT = { w: 80, h: 44 }; // pixels per grid column and row

export function artboard(editor: Editor) {
  return editor.getCurrentPageShapes().find((s) => s.type === "frame");
}

/** The latest period of each metric on the layout: if it moves, free arrows may point at the wrong thing. */
export function stampOf(editor: Editor, latest: (metricId: number) => string | undefined) {
  const ids = new Set<number>();
  for (const s of editor.getCurrentPageShapes()) if (s.type === "ziffr-widget") for (const id of (s.props as { metricIds: number[] }).metricIds) ids.add(id);
  return Object.fromEntries([...ids].map((id) => [String(id), latest(id) ?? ""]));
}
