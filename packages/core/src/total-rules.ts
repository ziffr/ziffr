// What may be added up into a Total, and what is said where one shows no number (GLOSSARY: Total; spec 0058, "Team
// totals"). Pure, so the form can leave out what the core would refuse and a view can say why it is empty.
import type { Metric } from "./types";

/** The most Metrics one Total adds up. */
export const TOTAL_MAX_PARTS = 50;

/** What stands for a period a person is not given. */
export const NOT_SHOWN = "Not shown: you do not see every Metric it adds up.";

/** What stands for a period in which a part has no value yet, for someone who may not see every part. */
export const NOT_ALL_IN = "Not all in yet.";

/** Why a Total shows nobody a number. */
export const OWNER_CANNOT_SHARE = "Its owner can no longer share one of the Metrics it adds up, so it shows no values.";

/** What a formula that reads a Total says where it has no value. */
export const READS_UNSHOWN_TOTAL = "No values to show: it reads a Total that has none for you.";

type Part = Pick<Metric, "name" | "formula" | "period" | "unit" | "format" | "aggregation">;

/** Why these Metrics cannot be added up into one Total, in words for people, or null. */
export function partsProblem(parts: readonly Part[]): string | null {
  if (!parts.length) return "Pick at least one Metric to add up.";
  if (parts.length > TOTAL_MAX_PARTS) return `A Total adds up at most ${TOTAL_MAX_PARTS} Metrics.`;
  const calculated = parts.find((p) => p.formula);
  if (calculated) return `${calculated.name} is calculated: a Total adds up Metrics that take values.`;
  const never = parts.find((p) => p.aggregation === "none");
  if (never) return `${never.name} has Aggregation none (a rate or a ratio), which cannot be added up.`;
  const first = parts[0];
  const unlike = (what: string, of: (p: Part) => string) => {
    const other = parts.find((p) => of(p) !== of(first));
    return other ? `${other.name} and ${first.name} differ in ${what}. A Total adds up Metrics that share it.` : null;
  };
  return unlike("period", (p) => p.period) ?? unlike("unit", (p) => p.unit) ?? unlike("number format", (p) => p.format) ?? unlike("Aggregation", (p) => p.aggregation);
}

/** What a view says where a Metric has no value to show: for a Total, and a formula that reads one, why. */
export function noValuesWords(metric: Pick<Metric, "total" | "reads_total">): string {
  if (metric.total) return metric.total.note ?? NOT_ALL_IN;
  return metric.reads_total ? READS_UNSHOWN_TOTAL : "No values yet";
}
