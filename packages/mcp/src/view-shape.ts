/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeNumber, writePeriod } from "@ziffr/figures";
// What the inline views of `get_metric`, `get_dashboard` and `period_status` (ticket #539; GLOSSARY: Metric, Dashboard,
// Period Timeline) draw, shaped from the tool's own structured answer and nothing else. These functions are plain JS
// without outside references on purpose: the page embeds their source (`.toString()`), so what the tests check is what
// runs in the chat. They read only fields the tool already returned for this key (Rule 3): no fetching, no new rights.
// Numbers and periods are written by @ziffr/figures, the same code the app and the emails use: the page embeds its two
// functions beside these, and the tool's answer carries the Workspace's Number Style and Fiscal Year start for them.
// The parameters are loose on purpose: they read the tool's JSON and check every field before use.
// Words from the workspace stay data: they are cut to a length and the page draws them with textContent.

/** A Metric and its values as a card: latest value, change to the one before, Target Range, sparkline and last periods. */
export function shapeMetric(data: any) {
  const m = data && data.metric, all = data && data.values;
  if (!m || typeof m.name !== "string" || !Array.isArray(all)) return null;
  const values = all.filter((v: any) => v && typeof v.value === "number" && typeof v.period === "string").sort((a: any, b: any) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  const last = values.length ? values[values.length - 1] : null, before = values.length > 1 ? values[values.length - 2] : null;
  const min = typeof m.target_min === "number" ? m.target_min : null, max = typeof m.target_max === "number" ? m.target_max : null;
  let status: string | null = null;
  if (last && (min !== null || max !== null)) status = min !== null && last.value < min ? "below" : max !== null && last.value > max ? "above" : "within";
  const change = last && before && before.value !== 0 ? (last.value - before.value) / Math.abs(before.value) : null;
  const style = typeof data.number_style === "string" ? data.number_style : "1,234.5", yearStart = Number(data.year_start_month);
  // A value as the app writes it: the Workspace's Number Style, the Metric's unit on its side, the minus sign.
  const decimals = Math.min(Math.max(Number.isInteger(m.decimals) ? m.decimals : 0, 0), 6), unit = typeof m.unit === "string" ? m.unit.slice(0, 12) : "";
  const formatValue = (n: number) => writeNumber(n, decimals, style, { unit, side: m.unit_position });
  // A period named from its first day by the Metric's period ("Q3 26" for a quarter of a Fiscal Year that starts in January),
  // or, for a Condensed Value, by its whole span.
  const span = (v: any) => {
    const name = (day: string, kind: string) => writePeriod(day, kind, yearStart, true).slice(0, 40);
    return v.condensed_from && /^\d{4}-\d{2}/.test(String(v.period_end)) ? name(v.period, "month") + "\u2013" + name(v.period_end, "month") : name(v.period, v.condensed_from ? "month" : m.period);
  };
  return {
    name: m.name.slice(0, 200),
    description: typeof m.description === "string" ? m.description.slice(0, 300) : "",
    latest: last ? { period: span(last), text: formatValue(last.value), state: last.state } : null,
    change: change === null ? null : { text: writeNumber(change * 100, 1, style, { unit: "%", side: "after", change: true }), better: m.polarity === "lower" ? change < 0 : m.polarity === "higher" ? change > 0 : null },
    target: min === null && max === null ? null : { text: min !== null && max !== null ? formatValue(min) + " to " + formatValue(max) : min !== null ? "at least " + formatValue(min) : "at most " + formatValue(max), status },
    points: values.slice(-24).map((v: any) => v.value),
    rows: values.slice(-6).reverse().map((v: any) => ({ period: span(v), text: formatValue(v.value), state: v.state })),
  };
}

/** A dashboard as a name, its introduction and one tile per widget (its title, view and the Metrics it draws). */
export function shapeDashboard(data: any) {
  const d = data && data.dashboard;
  if (!d || typeof d.name !== "string" || !Array.isArray(d.widgets)) return null;
  const tiles = d.widgets.slice(0, 24).map((w: any) => ({
    title: String((w && (w.title || (w.words && w.words.headline) || (w.metrics && w.metrics[0]) || w.view)) || "Widget").slice(0, 120),
    view: String((w && w.view) || "").slice(0, 40),
    metrics: Array.isArray(w && w.metrics) ? w.metrics.slice(0, 3).map((s: any) => String(s).slice(0, 60)) : [],
  }));
  return { name: d.name.slice(0, 200), intro: typeof d.intro === "string" ? d.intro.slice(0, 400) : "", tiles, more: Math.max(0, d.widgets.length - tiles.length), link: typeof d.url === "string" ? d.url : null };
}

/** A Workflow's period as the count of values in, a bar and the events in order. Null for the answer that only lists Workflows. */
export function shapePeriodStatus(data: any) {
  if (!data || !data.workflow || !data.period || !Array.isArray(data.events) || typeof data.of !== "number") return null;
  return {
    title: String(data.workflow.name).slice(0, 200) + ", " + String(data.period.name).slice(0, 80),
    count: data.in + " of " + data.of + " in",
    share: data.of > 0 ? Math.min(1, Math.max(0, data.in / data.of)) : 0,
    facts: data.published + " published, " + data.locked + " locked",
    events: data.events.slice(0, 40).map((e: any) => ({ when: String(e.day) + " " + String(e.time), text: String(e.text).slice(0, 200), items: Array.isArray(e.items) ? e.items.slice(0, 6).map((i: any) => String(i).slice(0, 100)) : [] })),
  };
}
