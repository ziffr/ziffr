// The pareto mark of a View Design (GLOSSARY: Breakdown, View Design): a Breakdown's rows from largest to smallest
// with the running share of the total, worked out once so a widget, a Snapshot, a View Link and a deck's picture say
// the same. Pure: it reads the rows it is given and nothing else. The view only turns this into shapes.
//
// Rules, said in the caption and the text alternative:
// - Only positive rows count; a row of 0 is left out, and a Breakdown with a negative row is refused (a share of a
//   total that part of it takes away from is not a share).
// - At most 10 rows are drawn; the rest are one "Other" bar at the end. Other is not sorted among the rows (it can be
//   larger than the last of them) and the line reaches 100 % there.
// - The 80 % reference: the caption counts the fewest rows, largest first, that make up 80 % of the whole, counted
//   over all rows, not only the ones drawn.
import type { BreakdownRow } from "./types";

/** The most rows drawn as their own bar. */
export const PARETO_ROWS = 10;
/** The share the reference line marks, as a part of 1. */
export const PARETO_REFERENCE = 0.8;

/** One bar: its row (or the rest), its value written, its share of the total and the running share through it, both 0 to 1. */
export type ParetoBar = { label: string; value: number; text: string; share: number; cumulative: number; other: boolean };

/** What a Pareto draws, or why it draws nothing. `reaches` is the index of the bar where the line first reaches 80 %. */
export type ParetoModel =
  | { ok: true; bars: ParetoBar[]; reaches: number; needed: number; rows: number; caption: string; alt: string }
  | { ok: false; reason: string };

const pct = (x: number) => `${Math.round(x * 100)} %`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The Pareto of a Breakdown's rows: sorted, grouped past ten, with their running share and where 80 % is reached. */
export function paretoModel(input: { name: string; rows: BreakdownRow[]; write: (value: number) => string }): ParetoModel {
  const { rows, write } = input;
  if (rows.some((r) => r.value < 0)) return { ok: false, reason: "Pareto needs positive rows." };
  const kept = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (kept.length === 0) return { ok: false, reason: "There are no rows above 0 to draw." };
  const total = kept.reduce((a, r) => a + r.value, 0);
  // The fewest rows, largest first, that make up 80 % (a small slack keeps 80 of 100 at exactly 80).
  let running = 0;
  let needed = kept.length;
  for (let i = 0; i < kept.length; i++) {
    running += kept[i].value;
    if (running >= PARETO_REFERENCE * total - 1e-9 * total) { needed = i + 1; break; }
  }
  const shown = kept.slice(0, PARETO_ROWS);
  const rest = kept.slice(PARETO_ROWS);
  const entries = rest.length ? [...shown, { label: "Other", value: rest.reduce((a, r) => a + r.value, 0) }] : shown;
  let sum = 0;
  const bars: ParetoBar[] = entries.map((r, i) => {
    const other = rest.length > 0 && i === entries.length - 1;
    sum += r.value;
    // The last bar is exactly 100 %, whatever the rounding of the sums on the way.
    return { label: r.label, value: r.value, text: write(r.value), share: r.value / total, cumulative: i === entries.length - 1 ? 1 : sum / total, other };
  });
  const reaches = Math.min(needed, entries.length) - 1;
  const caption = `${needed} of ${plural(kept.length, "row")} ${needed === 1 ? "makes" : "make"} up ${pct(PARETO_REFERENCE)}.`;
  const said = bars.map((b) => `${b.label} ${b.text}, ${pct(b.cumulative)} so far`).join("; ");
  const grouped = rest.length ? ` The ${rest.length === 1 ? "smallest row is" : `${rest.length} smallest rows are`} grouped as Other.` : "";
  const alt = `Pareto of ${input.name}: ${plural(kept.length, "row")} from largest to smallest with the running share of the total. ${caption} ${said}.${grouped}`;
  return { ok: true, bars, reaches, needed, rows: kept.length, caption, alt };
}
