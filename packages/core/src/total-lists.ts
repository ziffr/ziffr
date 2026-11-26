// What a gap table of a Total is drawn from (GLOSSARY: Total, Slide Element; spec 0058 "Team totals", one row for each
// Metric a Total adds up): for a Total the viewer sees, the Metrics of its list that they see, with the periods each
// counts in, and where it counts one they do not see. Pure.
// Visibility: of a Metric someone does not see nothing leaves here but that there is one, and in which of the periods
// they have numbers for: no id, name, value or number of them. A list is cut again, never widened, for a View Link.
import { countedParts, type TotalPart } from "./totals";

/** A Total's list as one reader gets it: the Metrics they see, the periods among theirs in which it also counts one
 * they do not see, and whether it adds up any they do not see at all. */
export type SeenList = { parts: TotalPart[]; others: string[]; hidden: boolean };

/** A list cut to the Metrics `sees` allows. `periodsOf` says which periods the reader has numbers of a Metric for. A list
 * cut before stays cut: what it already said is not shown is not shown. */
export function seenList(list: { parts: readonly TotalPart[]; others?: readonly string[]; hidden?: boolean }, sees: (metricId: number) => boolean, periodsOf: (metricId: number) => readonly string[]): SeenList {
  const parts = list.parts.filter((p) => sees(p.part));
  const periods = [...new Set(parts.flatMap((p) => periodsOf(p.part)))].sort();
  const others = periods.filter((period) => list.others?.includes(period) || countedParts(list.parts, period).some((id) => !sees(id)));
  return { parts: parts.map((p) => ({ part: p.part, first: p.first, last: p.last })), others, hidden: Boolean(list.hidden) || parts.length < list.parts.length };
}
