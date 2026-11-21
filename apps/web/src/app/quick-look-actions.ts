"use server";
// A Metric's quick look (GLOSSARY: Quick look): what the slide-over shows, read with the same loaders as the Metrics
// list and only for a Metric the person sees. Nothing but what the panel draws goes to the browser.
import { getAllSeries, getNumberStyle, getProfileMap, getYearStart } from "@/lib/data";
import { visibleMetricIds } from "@/lib/access";
import { viewerId } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { Metric, Point } from "@ziffr/core/types";

/** The Metric fields the panel draws, no more (not its description, formula, owner id or settings). */
export type QuickLookMetric = Pick<Metric, "name" | "slug" | "period" | "sources" | "decimals" | "unit" | "unit_position" | "polarity" | "target_min" | "target_max"> & { derived: boolean };

/** What the quick look draws. */
export type QuickLook = { metric: QuickLookMetric; points: Point[]; ownerName: string | null; yearStart: Awaited<ReturnType<typeof getYearStart>>; numberStyle: NumberStyle };

/** The quick look of the Metric with this slug, or a refusal in words when the person may not see it. */
export async function metricQuickLook(slug: string) {
  return attempt(async (): Promise<QuickLook> => {
    const [{ metrics, series }, people, viewer, yearStart, numberStyle] = await Promise.all([getAllSeries({ points: 30 }), getProfileMap(), viewerId(), getYearStart(), getNumberStyle()]);
    const metric = metrics.find((m) => m.slug === String(slug ?? ""));
    // The same answer, in the same work, for a Metric that does not exist and one that is not shared: nothing says which.
    const visible = await visibleMetricIds(viewer, metrics);
    if (!metric || !visible.has(metric.id)) throw new Error("This Metric is not shared with you.");
    const { name, period, sources, decimals, unit, unit_position, polarity, target_min, target_max } = metric;
    return { metric: { name, slug: metric.slug, period, sources, decimals, unit, unit_position, polarity, target_min, target_max, derived: Boolean(metric.formula) }, points: series[metric.slug] ?? [], ownerName: people[metric.owner_id]?.name ?? null, yearStart, numberStyle };
  });
}
