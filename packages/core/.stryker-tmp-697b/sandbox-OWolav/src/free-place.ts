// @ts-nocheck
// Where a new widget lands on a dashboard (GLOSSARY: Dashboard, Widget) when nobody says where: the first place in
// reading order, top to bottom and left to right on the 12-column grid, where it fits without covering another.
// Programs never send positions (spec 0014), so this is what keeps what they add readable. Pure.

/** A widget's box on the grid. */
export type Box = { x: number; y: number; w: number; h: number };

/** Columns of the dashboard grid. */
export const COLUMNS = 12;

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The first free place for a box of this size: in the gaps when one is large enough, else below everything. */
export function firstFreePlace(existing: Box[], w: number, h: number): { x: number; y: number } {
  const width = Math.max(1, Math.min(COLUMNS, Math.round(w)));
  const height = Math.max(1, Math.round(h));
  const bottom = Math.max(0, ...existing.map((e) => e.y + e.h));
  // Only rows where something starts or ends can begin a gap, so trying those is enough.
  const rows = [...new Set([0, ...existing.flatMap((e) => [e.y, e.y + e.h])])].filter((y) => y <= bottom).sort((a, b) => a - b);
  for (const y of rows) {
    for (let x = 0; x + width <= COLUMNS; x++) {
      const box = { x, y, w: width, h: height };
      if (!existing.some((e) => overlaps(box, e))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}
