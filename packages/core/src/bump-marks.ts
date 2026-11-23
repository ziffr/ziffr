// The bump mark of a View Design (GLOSSARY: View Design, Breakdown): how the order of a Breakdown's rows changes from
// period to period, worked out once so the widget, a Snapshot, a View Link and a deck's picture show the same ranks.
// The view only turns it into shapes. Pure: it reads the rows it is given and nothing else.
//
// Honest rules, said on the chart (`rule`) and in its text alternative (`alt`):
// - The size is the RANK (1 is the highest value of that period), not the value; a negative value ranks like any other.
// - Rows with the same value share the better rank (1, 1, 3), so a tie never invents an order.
// - A row a period does not have gets no rank there: the line has a gap, the chart says so, and it is never put last.
// - At most BUMP_ROWS rows are drawn (the best average rank, ties by the latest value); the chart says how many were not.
// - A period without a Breakdown is not drawn, and the chart says how many were left out.
// - One row, the one that gained the most places from the first to the last period drawn, is named in words ("up 3
//   places"); colour never says it alone.
import { shiftPeriod, type Span } from "./periods";
import type { BreakdownRow } from "./types";
import { windowProblem } from "./polar-marks";

/** How many rows are drawn; the rest are counted in the caption. */
export const BUMP_ROWS = 8;

/** One row's line: its rank and value in each drawn period (null where it has no row), and the words at its right end. */
export type BumpRow = {
  label: string;
  /** Rank per drawn period, oldest first; null where the row is missing. */
  ranks: (number | null)[];
  values: (number | null)[];
  /** Where the label sits: the row's last rank, its value written, and the period it was last seen in when that is not the newest. */
  end: { rank: number; value: string; seen: string | null };
  /** Places gained from the first to the last period drawn when it is the biggest gain (at least 1), else null. */
  up: number | null;
};

/** What a bump chart draws: the periods, the rows, the lowest rank on the axis, or why it draws nothing. */
export type BumpModel =
  | { ok: true; periods: { period: string; label: string }[]; rows: BumpRow[]; lowest: number; leftOut: number; rowsLeftOut: number; rule: string; alt: string }
  | { ok: false; reason: string };

/** What the model is given: the Metric's Breakdown per period, and how to write a period and a value. */
export type BumpInput = {
  name: string;
  by: Span;
  /** The newest period the chart may end on and how many periods it looks back (this one included). */
  to: string;
  window: number;
  byPeriod: Record<string, BreakdownRow[]>;
  /** Periods the Metric has a value in, so a period with a value and no Breakdown is counted as left out. */
  periods: string[];
  label: (period: string) => string;
  write: (value: number) => string;
};

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** Rows by label, a label that appears twice added up, a value that is not a number left out. */
function merged(rows: BreakdownRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (Number.isFinite(r.value)) out.set(r.label, (out.get(r.label) ?? 0) + r.value);
  return out;
}

/** The rank of every row of one period: 1 for the highest value, rows with the same value sharing the better rank. */
function ranksOf(values: Map<string, number>): Map<string, number> {
  const all = [...values.values()];
  return new Map([...values].map(([label, v]) => [label, 1 + all.filter((o) => o > v).length]));
}

/** "up 3 places": the words that name the row that gained the most, so colour never says it alone. */
export function upWords(places: number): string {
  return `up ${count(places, "place")}`;
}

/** The bump chart of a Metric's Breakdowns over the last `window` periods ending at `to`, or why there is none. */
export function bumpModel(input: BumpInput): BumpModel {
  const problem = windowProblem(input.window);
  if (problem) return { ok: false, reason: problem };
  const from = shiftPeriod(input.to, input.by, 1 - input.window);
  const inWindow = (p: string) => p >= from && p <= input.to;
  const drawn = Object.keys(input.byPeriod).filter((p) => inWindow(p) && merged(input.byPeriod[p]).size > 0).sort();
  if (drawn.length === 0) return { ok: false, reason: "No period shown has a breakdown to draw." };
  if (drawn.length < 2) return { ok: false, reason: "A bump chart needs a breakdown in at least 2 periods; only 1 period shown has one." };
  const perPeriod = drawn.map((p) => merged(input.byPeriod[p]));
  const ranked = perPeriod.map(ranksOf);
  const labels = [...new Set(perPeriod.flatMap((m) => [...m.keys()]))];
  if (labels.length < 2) return { ok: false, reason: "A bump chart needs at least 2 rows." };

  const last = drawn.length - 1;
  const lastIndexOf = (l: string) => perPeriod.map((m) => m.has(l)).lastIndexOf(true);
  const average = (l: string) => {
    const r = ranked.map((m) => m.get(l)).filter((x): x is number => x !== undefined);
    return r.reduce((a, b) => a + b, 0) / r.length;
  };
  // Best average rank over the periods the row has; ties by the latest value, then by label so the order never depends on arrival.
  const chosen = labels
    .map((label) => ({ label, avg: average(label), latest: perPeriod[lastIndexOf(label)].get(label)! }))
    .sort((a, b) => a.avg - b.avg || b.latest - a.latest || a.label.localeCompare(b.label))
    .slice(0, BUMP_ROWS);
  const rowsLeftOut = labels.length - chosen.length;

  // The biggest gain from the first to the last drawn period, among rows that have a rank in both; ties go to the better last rank.
  const gains = chosen
    .filter((c) => ranked[0].has(c.label) && ranked[last].has(c.label))
    .map((c) => ({ label: c.label, gain: ranked[0].get(c.label)! - ranked[last].get(c.label)!, end: ranked[last].get(c.label)! }))
    .filter((g) => g.gain >= 1)
    .sort((a, b) => b.gain - a.gain || a.end - b.end || a.label.localeCompare(b.label));
  const mover = gains[0];

  const rows: BumpRow[] = chosen.map(({ label }) => {
    const ranks = ranked.map((m) => m.get(label) ?? null);
    const values = perPeriod.map((m) => m.get(label) ?? null);
    const at = lastIndexOf(label);
    return {
      label,
      ranks,
      values,
      end: { rank: ranks[at]!, value: input.write(values[at]!), seen: at === last ? null : input.label(drawn[at]) },
      up: mover && mover.label === label ? mover.gain : null,
    };
  });
  const lowest = Math.max(...rows.flatMap((r) => r.ranks.filter((x): x is number => x !== null)));

  const candidates = new Set([...input.periods.filter(inWindow), ...Object.keys(input.byPeriod).filter(inWindow)]);
  const leftOut = [...candidates].filter((p) => !drawn.includes(p)).length;
  const missing = rows.filter((r) => r.ranks.includes(null));
  const periods = drawn.map((period) => ({ period, label: input.label(period) }));

  const rule = [
    "Rank 1 is the highest value of the period; rows with the same value share the better rank.",
    ...(missing.length > 0 ? [`${missing.map((r) => r.label).join(", ")} ${missing.length === 1 ? "was" : "were"} missing in some periods and has no dot there, never a last place.`] : []),
    ...(rowsLeftOut > 0 ? [`${count(rowsLeftOut, "row")} with a worse average rank ${rowsLeftOut === 1 ? "is" : "are"} not drawn.`] : []),
    ...(leftOut > 0 ? [`${count(leftOut, "period")} without a breakdown ${leftOut === 1 ? "was" : "were"} left out.`] : []),
    ...(mover ? [] : ["No drawn row gained places from the first period to the last."]),
  ].join(" ");

  const alt = [
    `Bump chart of ${input.name}: the rank of each row from ${periods[0].label} to ${periods[last].label}, 1 being the highest value.`,
    ...rows.map((r) => `${r.label}: ${r.ranks.map((k, i) => `${periods[i].label} ${k === null ? "missing" : k}`).join(", ")}${r.up === null ? "" : `; ${upWords(r.up)}`}.`),
    rule,
  ].join(" ");

  return { ok: true, periods, rows, lowest, leftOut, rowsLeftOut, rule, alt };
}
