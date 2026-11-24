// The example question of an empty Analysis Canvas (GLOSSARY: Analysis Canvas, Method): one question a person can click to see how
// the page works. Nothing here is written out by hand: the Metrics are the ones the Pool already shows this person (so only Metrics they
// may see), and the question is the first entry of the picker's own list, which the core fitted to those Metrics, that explains one
// Metric by others. When the Workspace has too few Metrics for any entry to fit, there is no example and none is shown.
import type { CanvasData } from "@ziffr/core/types";
import type { EntryView, PickerList } from "@ziffr/core/analysis-picker";

/** How many Metrics the example puts on the canvas at the most: one to explain and a few that might move it. */
export const EXAMPLE_METRICS = 4;

/** What clicking the example does: the Metrics to put on the canvas, the one to explain, and the question to open. */
export type Example = { entry: EntryView["id"]; title: string; ids: number[]; explains: number };

/** The Metrics to try the example on: those with the most values, at most `EXAMPLE_METRICS`, in the order the Pool shows them where equal. */
export function exampleCandidates(data: Pick<CanvasData, "metrics" | "series">): number[] {
  return data.metrics
    .filter((m) => !m.archived_at)
    .map((m, i) => ({ id: m.id, n: data.series[m.slug]?.length ?? 0, i }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, EXAMPLE_METRICS)
    .map((c) => c.id);
}

// An entry that explains one Metric by others (a Slot for the one, a Slot that takes several): "What moves B?" is the plainest.
const explainsByOthers = (e: EntryView) => e.slots.some((s) => s.id === "metric") && e.slots.some((s) => s.many);
const filled = (e: EntryView) => Object.values(e.defaults).flat().length;

/** The example out of the list the core gave for the candidates, or null when no entry that uses more than one Metric fits them. */
export function pickExample(list: PickerList): Example | null {
  const fitting = list.groups.flatMap((g) => g.entries).filter((e) => e.fit.ok && filled(e) >= 2);
  const e = fitting.find(explainsByOthers) ?? fitting[0];
  if (!e) return null;
  const ids = [...new Set(Object.values(e.defaults).flat())];
  const explains = e.defaults.metric?.[0] ?? ids[0];
  return { entry: e.id, title: e.name, ids, explains };
}
