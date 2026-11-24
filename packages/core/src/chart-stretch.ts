// Points that stretch a chart (GLOSSARY: Metric; ticket #988): when a few points lie far from the rest, the axis is stretched to hold them and
// most dots bunch at one side. The points are always kept; this only finds how many there are so the page can say so in words under
// the chart. A point is far when it lies more than three times the spread of the middle half beyond that half, on either axis.
// Pure, decided on the numbers as given.

const MOST_FAR = (n: number) => Math.max(3, Math.floor(n / 5));
const MIN_POINTS = 8;

function quartiles(sorted: number[]): [number, number] {
  const at = (q: number) => { const i = (sorted.length - 1) * q; const lo = Math.floor(i); return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo); };
  return [at(0.25), at(0.75)];
}

/** How many of the points are far from the rest on either axis, or 0 where nothing stands out (fewer than 8 points, no spread in the middle, or so many far points that they are the pattern). */
export function stretchingPoints(points: readonly { x: number; y: number }[]): number {
  if (points.length < MIN_POINTS) return 0;
  const far = new Set<number>();
  for (const axis of ["x", "y"] as const) {
    const sorted = points.map((p) => p[axis]).sort((a, b) => a - b);
    const [q1, q3] = quartiles(sorted);
    const spread = q3 - q1;
    if (!(spread > 0)) continue;
    points.forEach((p, i) => { if (p[axis] > q3 + 3 * spread || p[axis] < q1 - 3 * spread) far.add(i); });
  }
  return far.size >= 1 && far.size <= MOST_FAR(points.length) ? far.size : 0;
}

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** The sentence under a chart for `count` far points counted in `period` ("month"), or null for none: "Two months are far from the rest and stretch this chart." */
export function stretchNote(count: number, period: string): string | null {
  if (count < 1) return null;
  const n = count < WORDS.length ? WORDS[count] : String(count);
  return count === 1 ? `${n} ${period} is far from the rest and stretches this chart.` : `${n} ${period}s are far from the rest and stretch this chart.`;
}
