/* eslint-disable @typescript-eslint/no-explicit-any */
// What the inline views of `get_metric`, `get_dashboard` and `period_status` (ticket #539; GLOSSARY: Metric, Dashboard,
// Period Timeline) draw, shaped from the tool's own structured answer and nothing else. These functions are plain JS
// without outside references on purpose: the page embeds their source (`.toString()`), so what the tests check is what
// runs in the chat. They read only fields the tool already returned for this key (Rule 3): no fetching, no new rights.
// The parameters are loose on purpose: they read the tool's JSON and check every field before use.
// Words from the workspace stay data: they are cut to a length and the page draws them with textContent.

/** A number written the way Ziffr's default Number Style does ("1,234.5", the minus "−"), whatever the viewer's locale, so one
 * value never mixes two locales; the Metric's unit stands on its side as in the app (before without a space, after with one).
 * The tool's answer does not carry the Workspace's Number Style, so the default is the one rule that is the same everywhere. */
export function formatValue(value: any, metric: any): string {
  if (typeof value !== "number" || !isFinite(value)) return "";
  const decimals = Math.min(Math.max(Number.isInteger(metric.decimals) ? metric.decimals : 0, 0), 6);
  const body = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const sign = value < 0 && /[1-9]/.test(body) ? "\u2212" : "";
  const unit = typeof metric.unit === "string" ? metric.unit.slice(0, 12) : "";
  if (!unit) return sign + body;
  return metric.unit_position === "before" ? sign + unit + body : sign + body + "\u00a0" + unit;
}

/** A period named from its first day by the Metric's period, in words that hold for any fiscal year start: "Oct 26", "Wk of 16 Nov",
 * "Apr\u2013Jun 26" for a quarter. A Condensed Value names its whole span. */
export function periodName(start: string, kind: any, end?: string): string {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(start));
  if (!parts) return String(start).slice(0, 40);
  const y = Number(parts[1]), mo = Number(parts[2]) - 1, d = Number(parts[3]);
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  const month = (m: number, yr: number) => M[((m % 12) + 12) % 12] + " " + yy(yr + Math.floor(m / 12));
  if (end) { const e = /^(\d{4})-(\d{2})/.exec(String(end)); return e ? month(mo, y) + "\u2013" + month(Number(e[2]) - 1, Number(e[1])) : month(mo, y); }
  if (kind === "day") return d + " " + M[mo % 12];
  if (kind === "week") return "Wk of " + d + " " + M[mo % 12];
  if (kind === "quarter" || kind === "year") {
    const n = kind === "quarter" ? 3 : 12;
    if (kind === "year" && mo === 0) return String(y);
    const last = month(mo + n - 1, y);
    return kind === "quarter" ? M[mo % 12] + "\u2013" + last : month(mo, y) + "\u2013" + last;
  }
  return month(mo, y);
}

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
  const span = (v: any) => periodName(v.period, m.period, v.condensed_from && v.period_end ? v.period_end : undefined);
  return {
    name: m.name.slice(0, 200),
    description: typeof m.description === "string" ? m.description.slice(0, 300) : "",
    latest: last ? { period: span(last), text: formatValue(last.value, m), state: last.state } : null,
    change: change === null ? null : { text: (change >= 0 ? "+" : "\u2212") + Math.abs(change * 100).toFixed(1) + " %", better: m.polarity === "lower" ? change < 0 : m.polarity === "higher" ? change > 0 : null },
    target: min === null && max === null ? null : { text: min !== null && max !== null ? formatValue(min, m) + " to " + formatValue(max, m) : min !== null ? "at least " + formatValue(min, m) : "at most " + formatValue(max, m), status },
    points: values.slice(-24).map((v: any) => v.value),
    rows: values.slice(-6).reverse().map((v: any) => ({ period: span(v), text: formatValue(v.value, m), state: v.state })),
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
