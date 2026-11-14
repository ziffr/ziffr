// What a program reads and does through the API with an Access Key (spec 0002, GLOSSARY: Access Key). Each function
// takes a KeyActor (or a person's Actor, for tests and tools), checks its scope, and returns only what the key's
// creator sees, in plain shapes made for programs: no contact details, no internal rows.
import { assertScope, type Actor, type KeyActor } from "./actor";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import type { Metric } from "./types";

/** At most this many items in one page of a list. */
export const MAX_PAGE = 100;

/** One page of a list: the items, and the id to continue after (null on the last page). */
export type Page<T> = { items: T[]; next: number | null };

/** A Metric as a program sees it in a list or on its own. */
export type ApiMetric = Pick<Metric, "slug" | "name" | "description" | "period" | "format" | "unit" | "decimals" | "polarity" | "aggregation" | "target_min" | "target_max"> & { derived: boolean };

const toApi = (m: Metric): ApiMetric => ({
  slug: m.slug, name: m.name, description: m.description, period: m.period, format: m.format, unit: m.unit,
  decimals: m.decimals, polarity: m.polarity, aggregation: m.aggregation, target_min: m.target_min, target_max: m.target_max,
  derived: Boolean(m.formula),
});

/** The Metrics the key's creator sees, in a stable order (by id), one page after `after` (scope metrics:read). */
export async function listMetrics(actor: Actor | KeyActor, page: { after?: number | null; limit: number }): Promise<Page<ApiMetric>> {
  assertScope(actor, "metrics:read");
  const limit = Math.min(Math.max(Math.trunc(page.limit) || 1, 1), MAX_PAGE);
  const after = Number.isInteger(page.after) ? (page.after as number) : 0;
  const metrics = await getMetrics(actor.workspaceId);
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const rest = metrics.filter((m) => visible.has(m.id) && m.id > after).sort((a, b) => a.id - b.id);
  const items = rest.slice(0, limit);
  return { items: items.map(toApi), next: rest.length > limit ? items[items.length - 1].id : null };
}
