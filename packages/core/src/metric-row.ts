// Metric rows as the database returns them (GLOSSARY: Metric): numeric columns arrive as strings.
import { isAttainmentMethod } from "./attainment-method";
import type { Metric } from "./types";

/** A Metric with its target bounds as numbers (or null), and its Attainment method one of the two or null. */
export function normalizeMetric(m: Metric): Metric {
  return {
    ...m, target_min: m.target_min === null ? null : Number(m.target_min), target_max: m.target_max === null ? null : Number(m.target_max),
    attainment_method: isAttainmentMethod(m.attainment_method) ? m.attainment_method : null,
  };
}
