// @ts-nocheck
// Metric names (GLOSSARY: Metric): two Metrics of a Workspace may have the same name, so the places that list
// Metrics tell them apart by their owner, then their period and unit. Pure: callers load the Metrics and the names.

/** What tells Metrics apart besides their name. */
export type NamedMetric = { id: number; name: string; owner_id: string; period: string; unit: string };

/** A name as compared: no case, no extra spaces. */
export const nameKey = (name: string): string => name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** For each Metric whose name another one in the list shares, a short note that tells them apart: the owner's first
 * name, with the period and the unit added only where the owner is not enough. Metrics with a name of their own get
 * no note. `ownerName` is the owner's first name. */
export function tellApart(metrics: readonly NamedMetric[], ownerName: (personId: string) => string): Map<number, string> {
  const groups = new Map<string, NamedMetric[]>();
  for (const m of metrics) groups.set(nameKey(m.name), [...(groups.get(nameKey(m.name)) ?? []), m]);
  const notes = new Map<number, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const levels: ((m: NamedMetric) => string)[] = [
      (m) => ownerName(m.owner_id),
      (m) => [ownerName(m.owner_id), m.period].filter(Boolean).join(", "),
      (m) => [ownerName(m.owner_id), m.period, m.unit].filter(Boolean).join(", "),
    ];
    const level = levels.find((f) => new Set(group.map(f)).size === group.length) ?? levels[2];
    for (const m of group) notes.set(m.id, level(m));
  }
  return notes;
}
