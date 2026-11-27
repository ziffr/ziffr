// The headlines of the gap table, bridge, mosaic and driver tree (spec 0069; GLOSSARY: Slide Type): one sentence from
// the figures, never a cause. A small seam: the headline rules of spec 0069 (ticket #1363) take its place. Pure.

/** A gap table's: how many of its rows are below what they are held against. */
export function gapHeadline(name: string, against: string, gaps: readonly (number | null)[]): string {
  const known = gaps.filter((g) => g !== null);
  if (!known.length) return `${name} against ${against}`;
  const below = known.filter((g) => g < 0).length;
  if (!below) return `${name}: no row is below ${against}`;
  return `${name}: ${below} of ${known.length} ${known.length === 1 ? "row" : "rows"} ${below === 1 ? "is" : "are"} below ${against}`;
}

/** A bridge's: which way the number went, from what to what. */
export function bridgeHeadline(name: string, change: number, from: string, to: string): string {
  if (change === 0) return `${name} stayed at ${to}`;
  return `${name} ${change > 0 ? "rose" : "fell"} from ${from} to ${to}`;
}

/** A mosaic's: the widest column and its share. */
export const mosaicHeadline = (name: string, widest: string, share: string) => `${widest} holds ${share} of the rows of ${name}`;

/** A driver tree's: the number at its root. */
export const treeHeadline = (name: string, value: string, period: string) => `${name} was ${value} in ${period}`;

/** What stands over a slide whose data cannot carry it. */
export const cannotHeadline = (what: string, name: string) => `The ${what} of ${name} cannot be shown`;
