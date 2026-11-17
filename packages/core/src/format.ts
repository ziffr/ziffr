// Formatting values and dates the way Ziffr shows them everywhere (GLOSSARY: Metric, Submission Rule). Periods are
// named in periods.ts.
import { format as fmtDate, parseISO } from "date-fns";
import type { Metric, MetricDescription, Polarity, SourceId, SubmissionRule } from "./types";

/** A value in its metric's format, unit and decimals; a dash when there is none. */
export function formatValue(m: Pick<MetricDescription, "format" | "decimals" | "unit">, v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const n = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: m.decimals,
    maximumFractionDigits: m.decimals,
  }).format(v);
  if (m.format === "currency") return `${n} €`;
  if (m.format === "percent") return `${n} %`;
  return m.unit ? `${n} ${m.unit}` : n;
}

/** A value shortened for tight spaces such as chart labels (126k €). */
export function compactValue(m: Pick<MetricDescription, "format" | "decimals" | "unit">, v: number) {
  if (m.format === "currency" && Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k €`;
  return formatValue(m, v);
}

/** A calendar day the one way Ziffr writes it, e.g. "4 Nov 2026", from yyyy-mm-dd, a timestamp or a Date. */
export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? (/^\d{4}-\d{2}-\d{2}$/.test(d) ? parseISO(d) : new Date(d)) : d;
  return Number.isNaN(date.getTime()) ? "–" : fmtDate(date, "d MMM yyyy");
}

/** How each Submission Rule is described. */
export const RULE_LABEL: Record<SubmissionRule, string> = {
  reject: "Reject a second value",
  overwrite: "Overwrite with the newer value",
  add: "Add up all values",
  keep_both: "Keep every value",
};

/** How each polarity is described. */
export const POLARITY_LABEL: Record<Polarity, string> = {
  higher: "Higher is better",
  lower: "Lower is better",
  target: "Closer to target is better",
};

/** How each Source is named. */
export const SOURCE_LABEL: Record<SourceId, string> = { slack: "Slack", mail: "Mail", web_form: "Web form", api: "API", telegram: "Telegram" };

/** good | bad | neutral for a value, given the metric's target range. */
export function health(m: Pick<Metric, "target_min" | "target_max">, v: number | null | undefined) {
  if (v === null || v === undefined) return "neutral" as const;
  if (m.target_min === null && m.target_max === null) return "neutral" as const;
  if (m.target_min !== null && v < Number(m.target_min)) return "bad" as const;
  if (m.target_max !== null && v > Number(m.target_max)) return "bad" as const;
  return "good" as const;
}

/** Where a value sits against its metric's Target Range: below, on or above it; null without a target or value. */
export function targetStatus(m: Pick<Metric, "target_min" | "target_max">, v: number | null | undefined): "below" | "on" | "above" | null {
  if (v === null || v === undefined || (m.target_min === null && m.target_max === null)) return null;
  if (m.target_min !== null && v < Number(m.target_min)) return "below";
  if (m.target_max !== null && v > Number(m.target_max)) return "above";
  return "on";
}

/** A metric's target as words, e.g. "at least 100 €". */
export function targetText(m: Pick<Metric, "target_min" | "target_max" | "format" | "decimals" | "unit">) {
  const lo = m.target_min !== null ? formatValue(m, Number(m.target_min)) : null;
  const hi = m.target_max !== null ? formatValue(m, Number(m.target_max)) : null;
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `≥ ${lo}`;
  if (hi) return `≤ ${hi}`;
  return "No target";
}
