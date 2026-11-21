"use client";
// Series a canvas fetches as it needs them (ticket #125; GLOSSARY: Widget, Metric). A page sends only the series of
// what it draws; when someone places or picks another Metric, its series come from /api/canvas/series, which asks
// the core, so only Metrics the person sees arrive. Asks made in the same moment go out as one request, and a Metric
// is asked for once per page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CanvasSeries } from "@ziffr/core/access";
import type { CanvasData } from "@ziffr/core/types";

/** Asks for the series of some Metrics, by id; resolves once they arrived (or the ask failed). */
type Ensure = (ids: number[]) => Promise<void>;

const EnsureContext = createContext<Ensure | null>(null);
const EMPTY: CanvasSeries = { series: {}, breakdowns: {}, targets: {}, projections: {}, condensed: {} };

/** The page's data with the series fetched since, and `ensure` to fetch more. What the server sends wins over what
 * was fetched before: it is the newer. */
export function useCanvasSeries(data: CanvasData): { data: CanvasData; ensure: Ensure } {
  const [extra, setExtra] = useState<CanvasSeries>(EMPTY);
  const merged = useMemo<CanvasData>(() => ({
    ...data,
    series: { ...extra.series, ...data.series },
    breakdowns: { ...extra.breakdowns, ...data.breakdowns },
    targets: { ...extra.targets, ...data.targets },
    projections: { ...extra.projections, ...data.projections },
    condensed: { ...extra.condensed, ...data.condensed },
  }), [data, extra]);
  const latest = useRef(merged);
  latest.current = merged;
  const asked = useRef(new Set<number>());
  const queue = useRef<{ ids: Set<number>; done: (() => void)[] } | null>(null);

  const flush = useCallback(async () => {
    const batch = queue.current;
    queue.current = null;
    if (!batch) return;
    const ids = [...batch.ids];
    try {
      // At most 200 per request, as the route allows; a page rarely asks for more than a handful at once.
      for (let i = 0; i < ids.length; i += 200) {
        const res = await fetch(`/api/canvas/series?ids=${ids.slice(i, i + 200).join(",")}`, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        const got = (await res.json()) as CanvasSeries;
        setExtra((e) => ({
          series: { ...e.series, ...got.series },
          breakdowns: { ...e.breakdowns, ...got.breakdowns },
          targets: { ...e.targets, ...got.targets },
          projections: { ...e.projections, ...got.projections },
          condensed: { ...e.condensed, ...got.condensed },
        }));
      }
    } catch {
      // Asked again next time it is needed.
      for (const id of ids) asked.current.delete(id);
    }
    for (const d of batch.done) d();
  }, []);

  const ensure = useCallback<Ensure>((ids) => {
    const { metrics, series } = latest.current;
    const missing = ids.filter((id) => {
      const m = metrics.find((x) => x.id === id);
      // A Metric the person does not see is not in `metrics`: nothing to ask for.
      return m && !(m.slug in series) && !asked.current.has(id);
    });
    if (!missing.length) return Promise.resolve();
    for (const id of missing) asked.current.add(id);
    return new Promise<void>((resolve) => {
      if (!queue.current) {
        queue.current = { ids: new Set(), done: [] };
        setTimeout(flush, 0);
      }
      for (const id of missing) queue.current.ids.add(id);
      queue.current.done.push(resolve);
    });
  }, [flush]);

  return { data: merged, ensure };
}

/** Lets the widgets and editors below fetch the series they need. */
export function SeriesProvider({ ensure, children }: { ensure: Ensure; children: ReactNode }) {
  return <EnsureContext.Provider value={ensure}>{children}</EnsureContext.Provider>;
}

/** Fetching more series, where a page allows it; null on pages that send all they draw (presenting, View Links). */
export function useEnsure(): Ensure | null {
  return useContext(EnsureContext);
}

/** Asks for these Metrics' series if `data` lacks them. Returns whether they are all there, so a widget can show a
 * placeholder instead of "no values" for the moment they take to arrive. */
export function useSeriesReady(ids: number[], data: CanvasData): boolean {
  const ensure = useEnsure();
  const key = ids.join(",");
  const ready = ids.every((id) => {
    const m = data.metrics.find((x) => x.id === id);
    return !m || m.slug in data.series;
  });
  useEffect(() => {
    if (ensure && !ready) void ensure(key ? key.split(",").map(Number) : []);
  }, [ensure, ready, key]);
  // Without a loader there is nothing to wait for: the page sent everything it draws.
  return ready || !ensure;
}
