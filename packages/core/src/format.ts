// Formatting values and dates the way Ziffr shows them everywhere (GLOSSARY: Metric, Metric Description, Number
// Style, Submission Rule). Periods are named in periods.ts.
//
// A value is written from three things only (spec 0022): the Workspace's Number Style for the digits, and the
// Metric's unit, the side it stands on and its decimals. `format` adds nothing of its own. Every writer takes the
// style as a required argument, so a caller that forgets it does not compile.
import { format as fmtDate, parseISO } from "date-fns";
import { NUMBER_STYLE_MARKS, type NumberStyle } from "./number-style";
import type { Metric, MetricDescription, Polarity, SourceId, SubmissionRule } from "./types";

/** What writing a value needs from its Metric: the unit, which side it stands on and the decimals. */
export type ValueUnit = Pick<MetricDescription, "decimals" | "unit" | "unit_position">;

// The space a "1 234,5" style groups with: a no-break space, so a value never breaks across lines.
const STYLE_SPACE = " ";

// Digits only: grouped in the style unless `group` is false, rounded to `decimals`, without a sign.
function digits(abs: number, decimals: number, style: NumberStyle, group = true): string {
  const marks = NUMBER_STYLE_MARKS[style];
  const g = marks.group === " " ? STYLE_SPACE : marks.group;
  const en = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: group }).format(abs);
  return en.replace(/[,.]/g, (c) => (c === "," ? g : marks.decimal));
}

// The digits and whether a minus goes in front: a value that rounds to zero has none, so −0.4 is written 0.
function signed(v: number, decimals: number, style: NumberStyle, group = true): { minus: boolean; body: string } {
  const body = digits(Math.abs(v), decimals, style, group);
  return { minus: v < 0 && /[1-9]/.test(body), body };
}

// The unit on its side: before without a space ("$1,200"; "CHF " keeps the space it ends with), after with one.
// A Metric kept before units had a side (in an old Snapshot) has none, and its unit stands after, as it did.
function withUnit(m: Pick<ValueUnit, "unit" | "unit_position">, minus: boolean, body: string): string {
  const sign = minus ? "-" : "";
  if (!m.unit) return sign + body;
  return m.unit_position === "before" ? `${sign}${m.unit}${body}` : `${sign}${body} ${m.unit}`;
}

/** A number in the Number Style with `decimals` places and no unit, e.g. "1.234,5"; `group: false` leaves out the
 * group marks, for files a spreadsheet reads. A dash for a value that is not a finite number. */
export function formatNumber(v: number | null | undefined, decimals: number, style: NumberStyle, opts: { group?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const { minus, body } = signed(v, decimals, style, opts.group ?? true);
  return (minus ? "-" : "") + body;
}

/** A value in the Number Style with its Metric's unit, side and decimals, e.g. "1.200 €" or "$1,200"; a dash when
 * there is none or it is not finite. */
export function formatValue(m: ValueUnit, v: number | null | undefined, style: NumberStyle): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const { minus, body } = signed(v, m.decimals, style);
  return withUnit(m, minus, body);
}

/** A value shortened for tight spaces such as chart labels: from 10,000 on as k or M, with one decimal below 100
 * ("12.3k", "126k €", "$1.2M"), never "1000k"; below 10,000 as `formatValue` writes it. */
export function compactValue(m: ValueUnit, v: number, style: NumberStyle): string {
  if (!Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  if (abs < 10_000) return formatValue(m, v, style);
  const short = (x: number) => (x < 100 ? Math.round(x * 10) / 10 : Math.round(x));
  let n = short(abs / 1000);
  let suffix = "k";
  // 999,950 would round to "1000k": that is a million.
  if (n >= 1000) {
    n = short(abs / 1_000_000);
    suffix = "M";
  }
  return withUnit(m, v < 0, digits(n, Number.isInteger(n) ? 0 : 1, style) + suffix);
}

/** A percentage change, the one way Ziffr writes them: one decimal, a space and "%", signed "+", "−" or "±"
 * ("+12.0 %", "−3.5 %"); `signed: false` writes the size only, for "up 12.0 %". A dash for none. */
export function formatChange(pct: number | null | undefined, style: NumberStyle, opts: { signed?: boolean } = {}): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "–";
  const body = digits(Math.abs(pct), 1, style);
  const sign = opts.signed === false ? "" : !/[1-9]/.test(body) ? "±" : pct > 0 ? "+" : "−";
  return `${sign}${body} %`;
}

/** A share in percent, such as Attainment or a breakdown row's part of its total, e.g. "96.4 %". */
export function formatPercent(v: number | null | undefined, style: NumberStyle, decimals = 1): string {
  return formatValue({ unit: "%", unit_position: "after", decimals }, v, style);
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
  // A value that is not a number (NaN, ∞) is on no side of a target: neutral, never "good".
  if (v === null || v === undefined || !Number.isFinite(v)) return "neutral" as const;
  if (m.target_min === null && m.target_max === null) return "neutral" as const;
  if (m.target_min !== null && v < Number(m.target_min)) return "bad" as const;
  if (m.target_max !== null && v > Number(m.target_max)) return "bad" as const;
  return "good" as const;
}

/** Where a value sits against its metric's Target Range: below, on or above it; null without a target or value. */
export function targetStatus(m: Pick<Metric, "target_min" | "target_max">, v: number | null | undefined): "below" | "on" | "above" | null {
  if (v === null || v === undefined || !Number.isFinite(v) || (m.target_min === null && m.target_max === null)) return null;
  if (m.target_min !== null && v < Number(m.target_min)) return "below";
  if (m.target_max !== null && v > Number(m.target_max)) return "above";
  return "on";
}

/** A metric's target as words, e.g. "at least 100 €". */
export function targetText(m: Pick<Metric, "target_min" | "target_max"> & ValueUnit, style: NumberStyle) {
  const lo = m.target_min !== null ? formatValue(m, Number(m.target_min), style) : null;
  const hi = m.target_max !== null ? formatValue(m, Number(m.target_max), style) : null;
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `≥ ${lo}`;
  if (hi) return `≤ ${hi}`;
  return "No target";
}
