// The dashboard grid's measures and the little geometry around it (GLOSSARY: Dashboard, Widget, Pool): where the empty
// "Add widget" card stands, and how a dashboard is drawn smaller while the Add widget panel stands beside it. Pure.
import { verticalCompactor, type Layout } from "react-grid-layout";
import { COLUMNS, firstFreePlace } from "@ziffr/core/free-place";

/** The grid's row height, the gap between widgets and the space around them, in pixels. */
export const GRID = { rowHeight: 36, margin: 16, padding: 16 } as const;

/** Below this width a dashboard is one column in reading order. */
export const ONE_COLUMN_BELOW = 640;

/** Below this many widgets a dashboard that may be changed shows the empty "Add widget" card. */
export const FEW_WIDGETS = 4;

/** The narrowest a grid is laid out beside the Add widget panel: about the room a dashboard has on a 1,100 px screen,
 * so its widgets keep their shape and words instead of being squeezed. */
export const BESIDE_PANEL = 840;

/** The width the grid is laid out at, and how much it is scaled to fit. Beside the Add widget panel (`beside`) a
 * narrower dashboard is laid out at `BESIDE_PANEL` and drawn smaller: it keeps its columns and its look, and a card can
 * be dragged to a place on it. */
export function fitGrid(width: number, beside: boolean): { gridWidth: number; scale: number } {
  return beside && width > 0 && width < BESIDE_PANEL ? { gridWidth: BESIDE_PANEL, scale: width / BESIDE_PANEL } : { gridWidth: width, scale: 1 };
}

/** What to add to a pointer's place so that the grid, drawn at `scale`, reads it in its own pixels: the grid library
 * measures a drop in screen pixels, which are not the grid's own when it is drawn smaller. */
export function dropOffset(clientX: number, clientY: number, grid: { left: number; top: number }, scale: number) {
  return { dragOffsetX: (clientX - grid.left) * (1 / scale - 1), dragOffsetY: (clientY - grid.top) * (1 / scale - 1) };
}

/** Where the empty card stands, in the grid's pixels: the first free place for a widget of `size`, or below the last
 * one where the dashboard is one column. */
export function addCardBox(layout: Layout, width: number, oneColumn: boolean, size: { w: number; h: number }) {
  const cols = oneColumn ? 1 : COLUMNS;
  const shown = verticalCompactor.compact(layout, cols);
  const w = oneColumn ? 1 : size.w;
  const place = oneColumn ? { x: 0, y: Math.max(0, ...shown.map((i) => i.y + i.h)) } : firstFreePlace([...shown], w, size.h);
  const column = (width - 2 * GRID.padding - (cols - 1) * GRID.margin) / cols;
  const row = GRID.rowHeight + GRID.margin;
  return {
    left: GRID.padding + place.x * (column + GRID.margin),
    top: GRID.padding + place.y * row,
    width: w * column + (w - 1) * GRID.margin,
    height: size.h * row - GRID.margin,
  };
}
