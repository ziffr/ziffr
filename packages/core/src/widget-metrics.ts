// Every Metric a widget draws, wherever it sits (GLOSSARY: Widget, Free Layout). Pure. The checks that keep hidden
// Metrics out of dashboards, decks, templates and View Links rely on this finding all of them.
import type { WidgetSettings } from "./types";

/** Stands for a Metric list that is not a list: no visibility check can pass it, so such a widget is refused. */
const MALFORMED = Number.NaN;
/** How deep free layouts may nest inside each other before the widget is refused. */
const MAX_DEPTH = 5;

/** Settings stored as an object or, inside free-layout shapes, as a JSON string. */
function settingsOf(v: unknown): WidgetSettings | undefined {
  if (typeof v === "string") {
    try { return JSON.parse(v) as WidgetSettings; } catch { return { panels: [{ metricIds: MALFORMED as unknown as number[] }] } as WidgetSettings; }
  }
  return v && typeof v === "object" ? (v as WidgetSettings) : undefined;
}

/** The ids of a Metric list, or the malformed marker when it is not a list. */
function listOf(v: unknown): number[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v.map(Number) : [MALFORMED];
}

/** Every Metric a widget draws: its own, its story panels', its free-layout seed, and those of widgets inside a free
 * layout, nested ones included. A Metric list that is not a list yields an id no check accepts. */
export function widgetMetricIds(ids: number[], settings?: WidgetSettings, depth = 0): number[] {
  if (depth > MAX_DEPTH) return [MALFORMED];
  const s = settings as (WidgetSettings & Record<string, unknown>) | undefined;
  const panels = Array.isArray(s?.panels) ? s!.panels.flatMap((p) => listOf((p as { metricIds?: unknown })?.metricIds)) : s?.panels === undefined ? [] : [MALFORMED];
  const seed = s?.canvasSeed ? widgetMetricIds(listOf(s.canvasSeed.metric_ids), settingsOf(s.canvasSeed.settings), depth + 1) : [];
  const store = (s?.canvas?.document as { store?: Record<string, { type?: string; props?: { metricIds?: unknown; settings?: unknown } }> } | undefined)?.store ?? {};
  const inLayout = Object.values(store).flatMap((r) => (r?.type === "ziffr-widget" ? widgetMetricIds(listOf(r.props?.metricIds), settingsOf(r.props?.settings), depth + 1) : []));
  const all = [...listOf(ids), ...panels, ...seed, ...inLayout];
  return [...new Set(all.map(Number))];
}
