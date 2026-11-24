// A chart's Metric as the existing chart components read it (GLOSSARY: Metric Description; ticket #1076): the name, the unit and how its numbers are
// written, the period it is drawn by and, where the question is about a Target, its ends. The other fields of a Metric Description are not read
// by a chart and carry no value of the person's. Pure.
import type { ChartUnit } from "@ziffr/core/result-chart";
import type { Period } from "@ziffr/core/types";
import type { MetricDescription } from "@ziffr/core/types";

/** The Metric Description a chart component takes, from what a result's chart holds of it. */
export function described(unit: ChartUnit, span: string, target: { min: number | null; max: number | null } | null = null): MetricDescription {
  return {
    name: unit.name, unit: unit.unit, unit_position: unit.unit_position, decimals: unit.decimals, period: span as Period, target_min: target?.min ?? null, target_max: target?.max ?? null,
    aggregation: "none", description: "", format: "number", submission_rule: "reject", polarity: "higher", sources: [], attainment_method: null,
  };
}
