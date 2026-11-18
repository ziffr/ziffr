// The numbers the deck and CSV exports write (spec 0022, ticket #114; GLOSSARY: Comparison, Number Style): the same change
// the app shows under a widget, taken from compare(), and chart values rounded to the Metric's decimals. Pure, so it
// is tested without PowerPoint.
import { COMPARE_LABEL, compare, resolverFrom, type CompareKey } from "./compare";
import { scaled } from "./exact";
import { formatChange, formatNumber } from "./format";
import type { NumberStyle } from "./number-style";
import type { CanvasData, Metric, WidgetSettings } from "./types";

// The comparison strip's default and its short label for "prev", so the slide reads like the widget.
const DEFAULT_KEYS: CompareKey[] = ["prev", "yoy"];
const SHORT: Record<CompareKey, string> = { ...COMPARE_LABEL, prev: "vs prev." };

/** The first comparison the widget shows, as the app computes it: "vs prev. +4.2 %". Empty when the widget shows
 * none, or the app would say "n/a" (a gap, no earlier value, or an earlier value of 0). */
export function exportedChange(m: Metric, data: CanvasData, settings: Pick<WidgetSettings, "compare" | "fullPeriods">): string {
  const key = (settings.compare ?? DEFAULT_KEYS)[0];
  if (!key) return "";
  const c = compare(m, resolverFrom(data.metrics, data.series), { keys: [key], full: settings.fullPeriods, yearStart: data.yearStart })[0];
  // compare() gives one Comparison per key asked for, and only an available one with an earlier value other than 0
  // has a number as its change: that one test covers a gap, no earlier value and an earlier 0.
  if (typeof c.pct !== "number") return "";
  return `${SHORT[key]} ${formatChange(c.pct, data.numberStyle)}`;
}

/** A value for a PowerPoint chart: rounded to the Metric's decimals, as the app writes it. */
export function chartValue(m: Pick<Metric, "decimals">, v: number): number {
  // Rounded as the display rounds (half away from zero, on the value's text), not by Math.round on v × 10^d: that
  // made 1.005 at two decimals 1 and −0.125 −0.12, where the app shows 1.01 and −0.13 (#126).
  if (!Number.isFinite(v)) return 0;
  return Number(formatNumber(v, Math.min(6, Math.max(0, m.decimals)), "1,234.5", { group: false }));
}

/** A value for a CSV file in a Number Style: its decimal mark, no group marks, and every decimal it was stored with
 * (at most 6, as the display allows), so a spreadsheet reads it as the number it is. Empty for no number. */
export function csvNumber(v: number, style: NumberStyle): string {
  if (!Number.isFinite(v)) return "";
  // The decimals of its exact text: 1.5e-7 has eight (written 0.000000), not the one "1.5e-7" seems to have (#126).
  return formatNumber(v, Math.min(6, scaled(v).places), style, { group: false });
}

/** The number format PowerPoint labels a chart's values with: the Metric's decimals and its unit on its side, such
 * as `#,##0.0" d"` or `"$"#,##0`. PowerPoint writes the marks the way the computer opening it does. */
export function chartFormatCode(m: Pick<Metric, "decimals" | "unit" | "unit_position">): string {
  const digits = m.decimals > 0 ? `#,##0.${"0".repeat(Math.min(6, m.decimals))}` : "#,##0";
  if (!m.unit) return digits;
  // A unit is free text: quoted, with its own quotes doubled, so PowerPoint reads none of it as a format.
  const unit = m.unit.replace(/"/g, '""');
  return m.unit_position === "before" ? `"${unit}"${digits}` : `${digits}" ${unit}"`;
}
