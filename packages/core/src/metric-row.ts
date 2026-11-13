// Metric rows as the database returns them (GLOSSARY: Metric): numeric columns arrive as strings.
import type { Metric } from "./types";

/** A Metric with its target bounds as numbers (or null). */
export function normalizeMetric(m: Metric): Metric {
  return { ...m, target_min: m.target_min === null ? null : Number(m.target_min), target_max: m.target_max === null ? null : Number(m.target_max) };
}
