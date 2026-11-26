// Placeholders (GLOSSARY: Placeholder): words in a story's text that fill themselves in from the data,
// so a headline written once stays true next month and works for any metric a template is used with.
// Pure: no server or React code.
import { compare, resolverFrom, targetFor } from "./compare";
import { compactValue, formatChange } from "./format";
import type { CanvasData, Metric, Widget, WidgetSettings } from "./types";
import { periodLabel } from "./periods";

/** The Placeholders a story's words can use, with what each one becomes. */
export const PLACEHOLDERS = [
  { key: "metric", hint: "the metric's name" },
  { key: "metrics", hint: "all the story's metrics, as a list" },
  { key: "period", hint: "the latest period" },
  { key: "latest", hint: "the latest value" },
  { key: "change yoy", hint: "change on the year before, in %" },
  { key: "change prev", hint: "change on the period before, in %" },
  { key: "top row", hint: "the largest row of the latest breakdown" },
  { key: "target", hint: "the target for the latest period" },
  { key: "calculation note", hint: "how the metric is calculated" },
] as const;

const PATTERN = /\{(metrics|metric|period|latest|change yoy|change prev|top row|target|calculation note)(?:\s+(\d+))?\}/gi;

/** The widget's metrics in slot order: its own metrics first, then each panel's. {metric 2} is the second. */
export function metricsInOrder(widget: Pick<Widget, "metric_ids" | "settings">, metrics: Pick<Metric, "id">[]) {
  const ids = [...widget.metric_ids, ...(widget.settings.panels ?? []).flatMap((p) => p.metricIds)];
  return [...new Set(ids)].map((id) => metrics.find((m) => m.id === id)).filter(Boolean) as Metric[];
}

function value(key: string, m: Metric, data: CanvasData): string | undefined {
  const pts = data.series[m.slug] ?? [];
  const last = pts[pts.length - 1];
  switch (key) {
    case "metric": return m.name;
    // Nothing written reads as unfilled, so the author sees it; one withheld from what goes out ("", view-links.ts)
    // reads as nothing, so an outsider is shown neither the words nor the braces.
    case "calculation note": return m.calculation_note ?? undefined;
    case "period": return last ? periodLabel(last.period, m.period, data.yearStart) : undefined;
    case "latest": return last ? compactValue(m, last.value, data.numberStyle) : undefined;
    case "change yoy":
    case "change prev": {
      const c = compare(m, resolverFrom(data.metrics, data.series, data), { yearStart: data.yearStart, keys: [key === "change yoy" ? "yoy" : "prev"] })[0];
      if (!c?.available || c.pct === null || c.pct === undefined) return undefined;
      return `${c.pct > 0 ? "up" : c.pct < 0 ? "down" : "flat at"} ${formatChange(c.pct, data.numberStyle, { signed: false })}`;
    }
    case "top row": {
      const byPeriod = data.breakdowns[m.id] ?? {};
      const p = Object.keys(byPeriod).sort().at(-1);
      return p ? [...byPeriod[p]].sort((a, b) => b.value - a.value)[0]?.label : undefined;
    }
    case "target": {
      if (!last) return undefined;
      const t = targetFor(m, last.period, data.targets[m.id]);
      return t.value === null || t.value === undefined ? undefined : compactValue(m, t.value, data.numberStyle);
    }
  }
}

/** "Revenue, Orders and Cost" */
export const listOf = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** One text filled in from the widget's Metric slots. A slot that is `null` is a Metric the viewer may not see: its Placeholders
 * become empty words, never its name and never the next Metric's value (rule 3). Any other Placeholder one cannot fill stays
 * visible, so the author sees what is missing. */
function fill(text: string, slots: (Metric | null)[], data: CanvasData): string {
  return text.replace(PATTERN, (all, key: string, n?: string) => {
    const seen = slots.filter((m): m is Metric => !!m);
    if (key.toLowerCase() === "metrics") return seen.length ? listOf(seen.map((m) => m.name)) : all;
    const i = (n ? Number(n) : 1) - 1;
    if (i >= 0 && i < slots.length && !slots[i]) return "";
    const m = slots[i];
    return (m && value(key.toLowerCase(), m, data)) ?? all;
  });
}

/** A widget's title (or any text of its own) filled in from the data this viewer gets for it: {metric 2} is the widget's second
 * Metric even when the first is one the viewer may not see, which is then empty, so a shared surface says nothing about it. */
export function fillWidgetText(text: string | undefined, widget: Pick<Widget, "metric_ids" | "settings">, data: CanvasData): string | undefined {
  if (!text || !text.includes("{")) return text;
  const ids = [...new Set([...widget.metric_ids, ...(widget.settings.panels ?? []).flatMap((p) => p.metricIds)])];
  return fill(text, ids.map((id) => data.metrics.find((m) => m.id === id) ?? null), data);
}

/** The widget with all its words filled in, ready to draw. */
export function fillSettings(widget: Pick<Widget, "metric_ids" | "settings">, data: CanvasData): WidgetSettings {
  const s = widget.settings;
  const f = (t: string | undefined) => fillWidgetText(t, widget, data);
  return {
    ...s,
    kicker: f(s.kicker), headline: f(s.headline), subline: f(s.subline), footnote: f(s.footnote), source: f(s.source),
    callouts: s.callouts?.map((c) => ({ ...c, text: f(c.text) ?? "" })),
    panels: s.panels?.map((p) => ({ ...p, title: f(p.title), annotations: p.annotations?.map((a) => ({ ...a, text: f(a.text) })) })),
  };
}
