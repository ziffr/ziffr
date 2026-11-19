// Room for a chart's direct labels (GLOSSARY: Panel): on a narrow chart, such as a Story's small multiples on a phone,
// labels over neighbouring bars and month names under them would run into each other (#10). These pure rules pick
// the labels that fit; the drawing measures the words and draws only those.

/** Which labels to draw so none overlaps another. `centers` and `widths` are in pixels, one per label; `order` lists
 * the indexes most wanted first (the highlighted bar before the rest). A label is kept when it keeps `gap` pixels
 * from every label kept before it. */
export function labelsThatFit(centers: number[], widths: number[], order: number[], gap = 4): Set<number> {
  const kept: number[] = [];
  for (const i of order) {
    if (!(i in centers)) continue;
    if (kept.every((j) => Math.abs(centers[i] - centers[j]) >= (widths[i] + widths[j]) / 2 + gap)) kept.push(i);
  }
  return new Set(kept);
}

/** Every how many'th tick to name on a band axis of `count` bands `step` pixels apart, so names `widest` pixels wide
 * keep `gap` pixels between them; the last band is always named. Answers the indexes to name. */
export function ticksThatFit(count: number, step: number, widest: number, gap = 6): number[] {
  if (count <= 0) return [];
  const every = step > 0 ? Math.max(1, Math.ceil((widest + gap) / step)) : count;
  return Array.from({ length: count }, (_, i) => i).filter((i) => (count - 1 - i) % every === 0);
}
