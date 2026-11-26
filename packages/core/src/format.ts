// Formatting values and dates the way Ziffr shows them everywhere (GLOSSARY: Metric, Metric Description, Number
// Style, Submission Rule). Periods are named in periods.ts.
//
// A value is written from three things only (spec 0022): the Workspace's Number Style for the digits, and the
// Metric's unit, the side it stands on and its decimals. `format` adds nothing of its own. Every writer takes the
// style as a required argument, so a caller that forgets it does not compile.
import { format as fmtDate, parseISO } from "date-fns";
import { writeNumber } from "@ziffr/figures";
import type { NumberStyle } from "./number-style";
import type { Metric, MetricDescription, Polarity, SourceId, SubmissionRule } from "./types";

/** What writing a value needs from its Metric: the unit, which side it stands on and the decimals. */
export type ValueUnit = Pick<MetricDescription, "decimals" | "unit" | "unit_position">;

/** The minus sign every number shown to people is written with: values, absolute and percentage changes alike
 * ("−1.200 €", "−3,5 %"). Files and programs read numbers, so CSV, chart data and anything parsed back keep the
 * ASCII "-" (`formatNumber` with `group: false`), and the number readers accept both (ticket #184). */
export const MINUS = "−";

// Whether there is a number to write. Number.isFinite is false for null and undefined as well as for NaN and ±∞; as a
// guard it also tells TypeScript that what passes is a number.
function isNumber(v: number | null | undefined): v is number {
  return Number.isFinite(v);
}

/** A number in the Number Style with `decimals` places and no unit, e.g. "1.234,5" or "−5"; `group: false` writes
 * it for files a spreadsheet or program reads: no group marks and the ASCII "-" as its minus. A dash for a value that
 * is not a finite number. */
export function formatNumber(v: number | null | undefined, decimals: number, style: NumberStyle, opts: { group?: boolean } = {}): string {
  return writeNumber(v, decimals, style, opts.group === false ? { group: false, minus: "-" } : {});
}

/** A value in the Number Style with its Metric's unit, side and decimals, e.g. "1.200 €" or "$1,200"; a dash when
 * there is none or it is not finite. The unit stands on its side as in a Metric Description; a Metric kept before units
 * had a side has none, and its unit stands after, as it did. */
export function formatValue(m: ValueUnit, v: number | null | undefined, style: NumberStyle): string {
  return writeNumber(v, m.decimals, style, { unit: m.unit, side: m.unit_position });
}

/** A value shortened for tight spaces such as chart labels: from 10,000 on as k or M, with one decimal below 100
 * ("12.3k", "126k €", "$1.2M"), never "1000k"; below 10,000 as `formatValue` writes it. */
export function compactValue(m: ValueUnit, v: number, style: NumberStyle): string {
  if (!Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  if (abs < 10_000) return formatValue(m, v, style);
  // Stryker disable next-line EqualityOperator: at exactly 100 both sides give 100, so x <= 100 writes the same.
  const short = (x: number) => (x < 100 ? Math.round(x * 10) / 10 : Math.round(x));
  let n = short(abs / 1000);
  let suffix = "k";
  // 999,950 would round to "1000k": that is a million.
  if (n >= 1000) {
    n = short(abs / 1_000_000);
    suffix = "M";
  }
  return writeNumber(v < 0 ? -n : n, Number.isInteger(n) ? 0 : 1, style, { unit: m.unit, side: m.unit_position, suffix });
}

/** A value axis from `lo` to `hi`: about `count` ticks a nice step apart (1, 2, 2.5 or 5 times a power of ten), and
 * the domain from the first to the last. A single value (lo = hi) gets an axis around it, from 0 when it is positive.
 * Ticket #184: a chart of one value drew steps such as 92.35, 3,592.35, 7,092.35.
 * Where no such steps can be counted (values near the limits of a double, a step below their precision), the axis is
 * the padded domain the charts used before, with no ticks of its own: the chart then picks its own. */
export function niceAxis(lo: number, hi: number, count = 5): { domain: [number, number]; ticks: number[]; step: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { domain: [0, 1], ticks: [0, 1], step: 1 };
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (hi === 0) hi = 1;
    else if (hi > 0) lo = 0;
    else hi = 0;
  }
  const padded = (): { domain: [number, number]; ticks: number[]; step: number } => {
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.08 || 1;
    const domain: [number, number] = [lo - pad, hi + pad];
    return { domain: domain.every(Number.isFinite) ? domain : [lo, hi], ticks: [], step: 0 };
  };
  const raw = (hi - lo) / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  // Ten times the power is always at least `raw`; only a power that is not finite finds none.
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= raw);
  if (step === undefined || !Number.isFinite(step) || step <= 0) return padded();
  // Rounded to the step's own decimals, so 0.1 + 0.2 does not become 0.30000000000000004; toFixed takes 0 to 100.
  const places = Math.min(20, Math.max(0, -Math.floor(Math.log10(step)) + 1));
  const round = (x: number) => Number(x.toFixed(places));
  const first = round(Math.floor(lo / step) * step);
  const last = round(Math.ceil(hi / step) * step);
  // The ticks are counted, never stepped to: with a step below a value's precision, first + step is first again.
  const n = Math.round((last - first) / step);
  if (!Number.isFinite(first) || !Number.isFinite(last) || !Number.isFinite(n) || n < 1 || n > MAX_AXIS_TICKS) return padded();
  const ticks = Array.from({ length: n + 1 }, (_, i) => round(first + i * step));
  // Steps lost to rounding (two ticks the same) mean the values are beyond what the axis can tell apart.
  if (new Set(ticks).size !== ticks.length) return padded();
  return { domain: [first, last], ticks, step };
}

/** The most ticks `niceAxis` draws; more means the values defeat its steps, and the chart picks its own. */
export const MAX_AXIS_TICKS = 50;

/** The labels of an axis's ticks in one notation: all shortened (k or M, as `compactValue`) when the largest reaches
 * 10,000, otherwise all written in full, with as many decimals as the step needs and never more than the Metric's. */
export function axisLabels(m: ValueUnit, ticks: number[], step: number, style: NumberStyle): string[] {
  const top = Math.max(0, ...ticks.map(Math.abs));
  // The decimals a step is written with: 2.5 needs one, 0.25 two, 500 none.
  const placesFor = (s: number) => Math.min(6, (String(Number(s.toPrecision(6))).split(".")[1] ?? "").length);
  if (top < 10_000) {
    const decimals = Math.min(m.decimals, placesFor(step));
    return ticks.map((t) => formatValue({ ...m, decimals }, t, style));
  }
  const [div, suffix] = top >= 1_000_000 ? [1_000_000, "M"] : [1000, "k"];
  const decimals = placesFor(step / div);
  return ticks.map((t) => writeNumber(t / div, decimals, style, { unit: m.unit, side: m.unit_position, suffix }));
}

/** A percentage change, the one way Ziffr writes them: one decimal, a space and "%", signed "+", `MINUS` or "±"
 * ("+12.0 %", "−3.5 %"); `signed: false` writes the size only, for "up 12.0 %". A dash for none. */
export function formatChange(pct: number | null | undefined, style: NumberStyle, opts: { signed?: boolean } = {}): string {
  if (!isNumber(pct)) return "–";
  return writeNumber(opts.signed === false ? Math.abs(pct) : pct, 1, style, { unit: "%", side: "after", change: opts.signed !== false });
}

/** A share in percent, such as Attainment or a breakdown row's part of its total, e.g. "96.4 %". */
export function formatPercent(v: number | null | undefined, style: NumberStyle, decimals = 1): string {
  // Stryker disable next-line StringLiteral: every side but "before" stands after (withUnit), so "" writes the same.
  return formatValue({ unit: "%", unit_position: "after", decimals }, v, style);
}

/** A calendar day the one way Ziffr writes it, e.g. "4 Nov 2026", from yyyy-mm-dd, a timestamp or a Date. */
export function formatDate(d: string | Date) {
  // A yyyy-mm-dd day is read as that calendar day, not as midnight UTC, which is the day before west of UTC. A Date's
  // own text never looks like one, so a Date goes to new Date(), which copies it.
  const text = String(d);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? parseISO(text) : new Date(d);
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
  if (!isNumber(v)) return "neutral" as const;
  if (m.target_min === null && m.target_max === null) return "neutral" as const;
  if (m.target_min !== null && v < Number(m.target_min)) return "bad" as const;
  if (m.target_max !== null && v > Number(m.target_max)) return "bad" as const;
  return "good" as const;
}

/** Where a value sits against its metric's Target Range: below, on or above it; null without a target or value. */
export function targetStatus(m: Pick<Metric, "target_min" | "target_max">, v: number | null | undefined): "below" | "on" | "above" | null {
  if (!isNumber(v) || (m.target_min === null && m.target_max === null)) return null;
  if (m.target_min !== null && v < Number(m.target_min)) return "below";
  if (m.target_max !== null && v > Number(m.target_max)) return "above";
  return "on";
}

/** The words on a target chip (ticket #15): what is wrong rather than where the value sits, where the Metric's
 * polarity says which side is bad: "Too high" when lower is better, "Too low" when higher is better. A range with no
 * better side keeps "Above target" and "Below target". */
export function targetLabel(polarity: Metric["polarity"], status: "below" | "on" | "above"): string {
  if (status === "on") return "On target";
  if (status === "above") return polarity === "lower" ? "Too high" : "Above target";
  return polarity === "higher" ? "Too low" : "Below target";
}

/** A metric's target as words, e.g. "at least 100 €". */
export function targetText(m: Pick<Metric, "target_min" | "target_max" | "total"> & ValueUnit, style: NumberStyle) {
  // A Total may take no range of its own: its target is worked out per period (spec 0058).
  if (m.total?.targets === "parts") return "Its Metrics’ targets added up";
  const lo = m.target_min !== null ? formatValue(m, Number(m.target_min), style) : null;
  const hi = m.target_max !== null ? formatValue(m, Number(m.target_max), style) : null;
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `≥ ${lo}`;
  if (hi) return `≤ ${hi}`;
  return "No target";
}
