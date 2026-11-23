// @ts-nocheck
// Whose inputs a Derived Metric may use (GLOSSARY: Derived Metric, Share; ticket #619). A Derived Metric made through
// createDerivedMetric shows its inputs' values to whoever it is shared with, so its owner must be someone who may share
// each input: its owner or an Editor. This module finds the Derived Metrics whose owner no longer is, so they show no
// values until they are again; it reads the Shares only where an input has another owner than the Derived Metric.
import { formulaInputs } from "./formula";
import type { Metric } from "./types";

/** The ids of the Metrics each of `people` edits through a Share, directly or by Group (the stronger role counts). */
export async function editedBy(ws: string, people: Iterable<string>): Promise<Map<string, Set<number>>> {
  const wanted = new Set(people);
  const out = new Map<string, Set<number>>([...wanted].map((p) => [p, new Set<number>()]));
  if (!wanted.size) return out;
  // A function-level import: access.ts reads the Metrics through workspace-data.ts, which calls this module.
  const { getShares } = await import("./access");
  for (const s of await getShares(ws)) if (s.object_type === "metric" && s.role === "editor" && wanted.has(s.user_id)) out.get(s.user_id)!.add(s.object_id);
  return out;
}

/** Of these Metric rows, the ids of Derived Metrics (made through createDerivedMetric) whose owner neither owns nor edits
 * every input they name. An input that is gone is not counted here: the formula's own checks say so. */
export async function withheldDerived(ws: string, rows: readonly Pick<Metric, "id" | "slug" | "owner_id" | "formula" | "inputs_checked">[]): Promise<Set<number>> {
  const bySlug = new Map(rows.map((m) => [m.slug, m]));
  const foreign = rows.filter((d) => d.formula && d.inputs_checked && formulaInputs(d.formula).some((s) => {
    const i = bySlug.get(s);
    return i !== undefined && i.owner_id !== d.owner_id;
  }));
  if (!foreign.length) return new Set();
  const edited = await editedBy(ws, foreign.map((d) => d.owner_id));
  return new Set(foreign.filter((d) => formulaInputs(d.formula!).some((s) => {
    const i = bySlug.get(s);
    return i !== undefined && i.owner_id !== d.owner_id && !edited.get(d.owner_id)!.has(i.id);
  })).map((d) => d.id));
}
