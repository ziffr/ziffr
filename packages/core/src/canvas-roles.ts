// Which Metric of the Analysis Canvas is the one to explain (GLOSSARY: Analysis Canvas; ticket #988). The analyses that explain one
// Metric (Drivers, What moves B?, What does B need?, What if A changes?, Did it work?) are about it; the order of the Metrics on the
// canvas does not decide that, a mark of its own does. Pure rules, shared by the core, the screen and the tests.

/** The Metric to explain: the marked one if it is on the canvas, otherwise the first (so a canvas of one explains that one); null when the canvas is empty. */
export function explainedOf(ids: readonly number[], marked: number | null | undefined): number | null {
  return marked != null && ids.includes(marked) ? marked : (ids[0] ?? null);
}

/** The canvas with the Metric to explain first and the others after it in their own order: the order every analysis reads its Metrics in. */
export function explainedFirst(ids: readonly number[], marked: number | null | undefined): number[] {
  const e = explainedOf(ids, marked);
  return e === null ? [] : [e, ...ids.filter((i) => i !== e)];
}

/** Where the mark goes when a Metric leaves the canvas: unchanged unless it was the marked one, then the Metric after it, or the one before when it was last; null when none is left. */
export function markAfterRemoval(ids: readonly number[], marked: number | null | undefined, removed: number): number | null {
  const left = ids.filter((i) => i !== removed);
  const was = explainedOf(ids, marked);
  if (was !== removed) return was;
  const at = ids.indexOf(removed);
  return left[at] ?? left[at - 1] ?? null;
}
