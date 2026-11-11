import type { Metric, Point } from "@/lib/types";

export function pearson(a: Point[], b: Point[]) {
  const mb = new Map(b.map((p) => [p.period, p.value]));
  const pairs = a.filter((p) => mb.has(p.period)).map((p) => ({ period: p.period, x: p.value, y: mb.get(p.period)! }));
  const n = pairs.length;
  if (n < 6) return null;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
  const my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  return { r, n, pairs };
}

export function strength(r: number) {
  const a = Math.abs(r);
  const s = a > 0.7 ? "strong" : a > 0.4 ? "moderate" : a > 0.2 ? "weak" : "no clear";
  return `${s} ${r >= 0 ? "positive" : "negative"}`.replace("no clear positive", "no clear").replace("no clear negative", "no clear");
}

/** Every other metric with the same period, ranked by |r|. Excludes derived metrics built from this one. */
export function rankCorrelations(metric: Metric, metrics: Metric[], series: Record<string, Point[]>) {
  return metrics
    .filter((m) => m.id !== metric.id && m.period === metric.period)
    .filter((m) => !m.formula?.includes(`{${metric.slug}}`) && !metric.formula?.includes(`{${m.slug}}`))
    .map((m) => ({ metric: m, result: pearson(series[metric.slug] ?? [], series[m.slug] ?? []) }))
    .filter((x): x is { metric: Metric; result: NonNullable<ReturnType<typeof pearson>> } => x.result !== null && Number.isFinite(x.result.r))
    .sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r));
}
