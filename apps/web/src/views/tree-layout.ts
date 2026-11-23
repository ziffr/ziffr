// Where each box of a formula tree goes (GLOSSARY: Formula Tree; spec 0041, ticket 11): the geometry of the `tree` mark, apart from what
// the numbers are (the core's formula-tree.ts gives those, exactly). Pure, so it is tested without a browser: the parts of a sum share the
// width of the box above them exactly in proportion to their shares, so a rectangle's area is its share of the size of the parts, and the
// factors of a product share it equally. Nothing here changes a number.
import type { TreeBox } from "@ziffr/core/formula-tree";

/** The width of the drawing, in its own units (it scales to the widget). */
export const TREE_WIDTH = 320;
/** The height of one row of boxes and the space between rows. */
export const ROW = { h: 38, gap: 4 } as const;
/** The space between the factors of a product, where their operator is written. */
export const OPERATOR_WIDTH = 12;
/** How much of its parent's width a box with no value takes, at most each; together at most half. */
export const GAP_SHARE = 0.08;

/** A box's rectangle: left edge, top edge, width and height. */
export type Placed = { id: number; x: number; y: number; w: number; h: number };

/** The rectangles of every box, in the boxes' order, for a drawing `width` wide: each box lies under its parent, and a sum's parts fill the parent's width exactly. */
export function layoutTree(boxes: TreeBox[], width: number = TREE_WIDTH): Placed[] {
  const out: Placed[] = [];
  const kidsOf = (id: number) => boxes.filter((b) => b.parent === id);
  const place = (box: TreeBox, x: number, w: number) => {
    out[box.id] = { id: box.id, x, y: box.level * (ROW.h + ROW.gap), w, h: ROW.h };
    const kids = kidsOf(box.id);
    if (kids.length === 0) return;
    if (box.op === "product") {
      // Equal, with the operator between: a product is not the sum of its factors, so width says nothing about size here.
      const each = (w - (kids.length - 1) * OPERATOR_WIDTH) / kids.length;
      kids.forEach((k, i) => place(k, x + i * (each + OPERATOR_WIDTH), each));
      return;
    }
    const gaps = kids.filter((k) => k.value === null).length;
    const valued = kids.length - gaps;
    // A box with no value keeps a small place of its own; the others share what is left by their shares (equally when all are 0).
    const gap = valued === 0 ? w / gaps : w * Math.min(GAP_SHARE, 0.5 / (gaps || 1));
    const rest = valued === 0 ? 0 : w - gaps * gap;
    let at = x;
    for (const k of kids) {
      const own = k.value === null ? gap : rest * (k.share ?? 1 / valued);
      place(k, at, own);
      at += own;
    }
  };
  place(boxes[0], 0, width);
  // A result smaller than its parts (revenue less cost) is drawn at its own size on the scale of its parts, left-aligned over them, so it does not look as big as what it is made of.
  const kids = kidsOf(0);
  const sizes = kids.map((k) => (k.value === null ? null : Math.abs(k.value)));
  if (boxes[0].op === "sum" && boxes[0].value !== null && kids.some((k) => k.taken) && sizes.every((z) => z !== null)) {
    const total = sizes.reduce<number>((a, z) => a + (z as number), 0);
    if (total > 0) out[0] = { ...out[0], w: (width * Math.abs(boxes[0].value)) / total };
  }
  return out;
}

/** The height of the drawing for these boxes. */
export const treeHeight = (boxes: TreeBox[]): number => (Math.max(...boxes.map((b) => b.level)) + 1) * (ROW.h + ROW.gap) - ROW.gap;
