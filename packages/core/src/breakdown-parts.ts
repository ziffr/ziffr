// The parts of a Breakdown row (GLOSSARY: Breakdown; spec 0041, ticket 12): a row may be a part of another row of the same
// Breakdown, which makes the Breakdown a tree. Pure. A Breakdown is read as its TOP-LEVEL rows, each holding its own
// parts, so everything that reads a Breakdown as one flat list (ranked bars, a Pareto, stacked bars, a bridge) sees
// exactly the rows that add up to the whole and never a row twice, whether or not the Breakdown has parents; only the
// tree mark goes down into `parts`. Visibility is the Metric's: whoever may see a Metric's Breakdown sees all of its
// rows, parts included, and nothing here is read from more than the Breakdown of the Metric asked for.
import type { BreakdownRow } from "./types";

/** A Breakdown row as the database holds it, opened: its id and the id of its parent row, if any. */
export type StoredRow = { id: number; parent_id: number | null; label: string; value: number };

/**
 * The rows of one Breakdown nested: the top-level ones in their order, each with its `parts` (in their order) when it
 * has any. A row whose parent is not among the rows (one that could not be read) is left out with everything under it:
 * it cannot be placed, and putting it at the top would count it twice in a flat list.
 */
export function nestRows(rows: readonly StoredRow[]): BreakdownRow[] {
  const nodes = new Map<number, BreakdownRow>();
  for (const r of rows) nodes.set(r.id, { label: r.label, value: r.value });
  const top: BreakdownRow[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parent_id === null) top.push(node);
    else {
      const above = nodes.get(r.parent_id);
      if (above) (above.parts ??= []).push(node);
    }
  }
  return top;
}

/** A row as a program sends and reads it: its label, its value and, for a part, the label of its parent. */
export type ListedRow = { label: string; value: number; parent?: string };

/** The rows of a nested Breakdown as one list, each row followed by its parts (the order of a tree read from the top), a part naming its parent's label. */
export function listRows(rows: readonly BreakdownRow[], parent?: string): ListedRow[] {
  return rows.flatMap((r) => [{ label: r.label, value: r.value, ...(parent === undefined ? {} : { parent }) }, ...listRows(r.parts ?? [], r.label)]);
}
