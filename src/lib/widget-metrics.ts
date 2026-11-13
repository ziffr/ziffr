// Every metric a widget draws, wherever it sits. Pure.
import type { WidgetSettings } from "./types";

/** Every metric a widget draws: its own, its story panels', and those of widgets inside a free layout. */
export function widgetMetricIds(ids: number[], settings?: WidgetSettings): number[] {
  const store = (settings?.canvas?.document as { store?: Record<string, { type?: string; props?: { metricIds?: unknown } }> } | undefined)?.store ?? {};
  const inLayout = Object.values(store).flatMap((r) => (r?.type === "ziffr-widget" && Array.isArray(r.props?.metricIds) ? (r.props!.metricIds as unknown[]) : []));
  const all = [...ids, ...(settings?.panels ?? []).flatMap((p) => p.metricIds ?? []), ...(settings?.canvasSeed?.metric_ids ?? []), ...inLayout];
  return [...new Set(all.map(Number))];
}
