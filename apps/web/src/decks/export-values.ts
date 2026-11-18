// The numbers a deck export writes (spec 0022, ticket #114; GLOSSARY: Comparison, Number Style): the same change
// the app shows under a widget, taken from compare(), and chart values rounded to the Metric's decimals. Pure, so it
// is tested without PowerPoint.
import { COMPARE_LABEL, compare, resolverFrom, type CompareKey } from "@ziffr/core/compare";
import { formatChange } from "@ziffr/core/format";
import type { CanvasData, Metric, WidgetSettings } from "@ziffr/core/types";

// The comparison strip's default and its short label for "prev", so the slide reads like the widget.
const DEFAULT_KEYS: CompareKey[] = ["prev", "yoy"];
const SHORT: Record<CompareKey, string> = { ...COMPARE_LABEL, prev: "vs prev." };

/** The first comparison the widget shows, as the app computes it: "vs prev. +4.2 %". Empty when the widget shows
 * none, or the app would say "n/a" (a gap, no earlier value, or an earlier value of 0). */
export function exportedChange(m: Metric, data: CanvasData, settings: Pick<WidgetSettings, "compare" | "fullPeriods">): string {
  const key = (settings.compare ?? DEFAULT_KEYS)[0];
  if (!key) return "";
  const c = compare(m, resolverFrom(data.metrics, data.series), { keys: [key], full: settings.fullPeriods, yearStart: data.yearStart })[0];
  if (!c?.available || c.pct === null || c.pct === undefined) return "";
  return `${SHORT[key]} ${formatChange(c.pct, data.numberStyle)}`;
}

/** A value for a PowerPoint chart: rounded to the Metric's decimals, as the app writes it. */
export function chartValue(m: Pick<Metric, "decimals">, v: number): number {
  const f = 10 ** Math.min(6, Math.max(0, m.decimals));
  return Math.round(v * f) / f || 0;
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
