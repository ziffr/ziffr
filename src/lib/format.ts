import { format as fmtDate, parseISO, startOfISOWeek, startOfMonth } from "date-fns";
import type { Metric, MetricDescription, Period, Polarity, SourceId, SubmissionRule } from "./types";

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

export function compactValue(m: Pick<MetricDescription, "format" | "decimals" | "unit">, v: number) {
  if (m.format === "currency" && Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k €`;
  return formatValue(m, v);
}

export function periodStart(date: Date, period: Period): string {
  const d = period === "month" ? startOfMonth(date) : period === "week" ? startOfISOWeek(date) : date;
  return fmtDate(d, "yyyy-MM-dd");
}

export function periodLabel(p: string, period: Period, short = false) {
  const d = parseISO(p);
  if (period === "month") return fmtDate(d, short ? "MMM yy" : "MMMM yyyy");
  if (period === "week") return `Week of ${fmtDate(d, "d MMM yyyy")}`;
  return fmtDate(d, short ? "d MMM" : "EEE d MMM yyyy");
}

export const PERIOD_LABEL: Record<Period, string> = { day: "Daily", week: "Weekly", month: "Monthly" };

export const RULE_LABEL: Record<SubmissionRule, string> = {
  reject: "Reject a second value",
  overwrite: "Overwrite with the newer value",
  add: "Add up all values",
  keep_both: "Keep every value",
};

export const POLARITY_LABEL: Record<Polarity, string> = {
  higher: "Higher is better",
  lower: "Lower is better",
  target: "Closer to target is better",
};

export const SOURCE_LABEL: Record<SourceId, string> = { slack: "Slack", mail: "Mail", web_form: "Web form" };

/** good | bad | neutral for a value, given the metric's target range. */
export function health(m: Pick<Metric, "target_min" | "target_max">, v: number | null | undefined) {
  if (v === null || v === undefined) return "neutral" as const;
  if (m.target_min === null && m.target_max === null) return "neutral" as const;
  if (m.target_min !== null && v < Number(m.target_min)) return "bad" as const;
  if (m.target_max !== null && v > Number(m.target_max)) return "bad" as const;
  return "good" as const;
}

export function targetText(m: Pick<Metric, "target_min" | "target_max" | "format" | "decimals" | "unit">) {
  const lo = m.target_min !== null ? formatValue(m, Number(m.target_min)) : null;
  const hi = m.target_max !== null ? formatValue(m, Number(m.target_max)) : null;
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `≥ ${lo}`;
  if (hi) return `≤ ${hi}`;
  return "No target";
}
