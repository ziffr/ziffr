// The headline of a slide (spec 0069; GLOSSARY: Slide Type): the first proposal of the headline rules
// (deck-headlines.ts) for what the slide shows. The gap table keeps a sentence of its own, as its figures come written
// and the rules need them as numbers. Visibility: the rules are handed the slide's own cut of the data. Pure.
import { deckHeadlines, type HeadlineSubject } from "../../deck-headlines";
import type { CanvasData, Metric } from "../../types";

/** What a slide of these Metrics is about, the first leading. */
export const subjectOf = (metrics: Metric[]): HeadlineSubject => (metrics.length === 1 ? { show: "metric", metric: metrics[0]! } : { show: "metrics", metrics });

/** Ziffr's headline for a slide that shows this, on this day. */
export const headlineOf = (subject: HeadlineSubject, data: CanvasData, today: string): string => deckHeadlines(subject, { ...data, today })[0]?.text ?? "";

/** A gap table's: how many of its rows are below what they are held against. */
export function gapHeadline(name: string, against: string, gaps: readonly (number | null)[]): string {
  const known = gaps.filter((g) => g !== null);
  if (!known.length) return `${name} against ${against}`;
  const below = known.filter((g) => g < 0).length;
  if (!below) return `${name}: no row is below ${against}`;
  return `${name}: ${below} of ${known.length} ${known.length === 1 ? "row" : "rows"} ${below === 1 ? "is" : "are"} below ${against}`;
}

/** What stands over a slide whose data cannot carry it. */
export const cannotHeadline = (what: string, name: string) => `The ${what} of ${name} cannot be shown`;
