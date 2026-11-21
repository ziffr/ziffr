// A new or renamed Metric's name against the Metrics the person sees (GLOSSARY: Metric). A warning, never a refusal:
// two Metrics may share a name. Security: only Metrics the person may see are compared, so a name they may not see
// is not revealed by the answer; only the slug, the name and the owner's first name leave.
import type { Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { nameKey } from "./metric-names";
import { peopleIn } from "./submissions";
import { getMetrics } from "./workspace-data";

/** A Metric the person sees that already has the name. */
export type SameNamed = { slug: string; name: string; owner: string; mine: boolean };

/** The Metrics the person sees that have this name (not counting `exceptMetricId`, the one being renamed). */
export async function sameNamedMetrics(actor: Actor, name: string, exceptMetricId?: number): Promise<SameNamed[]> {
  const key = nameKey(String(name ?? "").slice(0, 120));
  if (!key) return [];
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const same = metrics.filter((m) => m.id !== exceptMetricId && !m.archived_at && nameKey(m.name) === key);
  if (!same.length) return [];
  const [visible, people] = await Promise.all([visibleMetricIds(ws, actor.personId, metrics), peopleIn(ws)]);
  return same.filter((m) => visible.has(m.id)).slice(0, 5).map((m) => ({ slug: m.slug, name: m.name, owner: people.find((p) => p.id === m.owner_id)?.name.split(" ")[0] ?? "someone", mine: m.owner_id === actor.personId }));
}
