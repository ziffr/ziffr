// @ts-nocheck
// Metric rows as the database returns them (GLOSSARY: Metric, Archived Metric): numeric columns arrive as strings.
// Pure, so browser code uses it too.
import { isAttainmentMethod } from "./attainment-method";
import type { Metric } from "./types";

/** A Metric with its target bounds as numbers (or null), and its Attainment method one of the two or null. */
export function normalizeMetric(m: Metric): Metric {
  // A Retention and the confirmation waiting to start are not part of the Metric that browsers, View Links and Snapshots
  // are given: they say who confirmed what and when. The Metric page reads them through `retentionFor`.
  const rest: Metric = { ...m };
  delete rest.retention;
  delete rest.retention_pending;
  // The cap holds the confirmation's id and counts; it is the job's alone.
  delete (rest as Record<string, unknown>).retention_cap;
  delete rest.inputs_checked;
  return {
    ...rest, target_min: m.target_min === null ? null : Number(m.target_min), target_max: m.target_max === null ? null : Number(m.target_max),
    attainment_method: isAttainmentMethod(m.attainment_method) ? m.attainment_method : null,
  };
}

/** Whether a Metric is archived (GLOSSARY: Archived Metric). */
export const isArchived = (m: { archived_at?: string | null }): boolean => Boolean(m.archived_at);

/** The Metrics in use, without the archived ones: what the Pool, pickers and lists offer. */
export function inUse<T extends { archived_at?: string | null }>(metrics: readonly T[]): T[] {
  return metrics.filter((m) => !isArchived(m));
}
