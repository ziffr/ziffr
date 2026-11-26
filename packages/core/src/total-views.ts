// What of a Total goes into a Snapshot and a View Link, and who gets it from one (GLOSSARY: Total, Snapshot, View
// Link; spec 0058, "The same rule everywhere"). A copy keeps, with each period of a number that rests on a Total, which
// Metrics were counted in it; whoever reads it is given that period only if the Total is open now, or they see every one
// of those now. So closing a Total also hides it in older copies, and a period nothing is known about is not given. Pure.
import { formulaInputs } from "./formula";
import { shiftPeriod } from "./periods";
import { NOT_SHOWN } from "./total-rules";
import { countedParts, restsOnTotal, type TotalPart } from "./totals";
import type { CanvasData, Metric } from "./types";

/** For each Metric whose numbers rest on a Total, by its id, and each of its periods: which Totals, and the Metrics
 * counted in each. Part ids of Metrics the reader of a copy may not see: it never leaves the server. */
export type Rests = Record<number, Record<string, { total: number; parts: number[] }[]>>;

/** What a copy keeps: the canvas as it stood, and what its Totals rested on. */
export type KeptData = CanvasData & { rests?: Rests };

/** Whether a reader is given a Metric's period. */
export type Allowed = (metricId: number, period: string) => boolean;

type Numbers = Pick<CanvasData, "metrics" | "series" | "targets" | "pending">;

/** What each period shown of the data rests on, from the parts of each Total as they count now. A formula reaches back
 * one period (prev, change), so for a formula that reads a Total both periods are kept. */
export function restsFor(data: Numbers, all: readonly Metric[], parts: Record<number, readonly TotalPart[]>): Rests {
  const totals = new Map(all.filter((m) => m.total).map((m) => [m.slug, m]));
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const out: Rests = {};
  for (const m of data.metrics.filter(restsOnTotal)) {
    const own = bySlug.get(m.slug);
    // A Metric that is none of the Workspace's any more rests on nothing known, so nothing of it will be given.
    const read = !own ? [] : own.total ? [own] : formulaInputs(own.formula!).flatMap((s) => totals.get(s) ?? []);
    const periods = new Set([...(data.series[m.slug] ?? []), ...(data.targets[m.id] ?? [])].map((p) => p.period));
    out[m.id] = Object.fromEntries([...periods].map((period) => {
      const days = own?.total ? [period] : [period, shiftPeriod(period, m.period, -1)];
      return [period, read.map((t) => ({ total: t.id, parts: [...new Set(days.flatMap((d) => countedParts(parts[t.id] ?? [], d)))] }))];
    }));
  }
  return out;
}

/** Who is given what of a copy: a period whose every Total is open now, or of whose counted Metrics the reader sees
 * every one. A period the copy kept nothing about, or in which nothing was counted, is not given. */
export function allowedBy(rests: Rests | undefined, open: ReadonlySet<number>, sees: (metricId: number) => boolean): Allowed {
  return (metricId, period) => {
    const on = rests?.[metricId]?.[period];
    return Boolean(on?.length) && on!.every((r) => r.parts.length > 0 && (open.has(r.total) || r.parts.every(sees)));
  };
}

/** The numbers of the data that rest on a Total, cut to the periods `allowed` gives; left out, none of them goes out. A
 * Total's own target is its own and stays; the added-up targets of its Metrics follow their numbers. A Total that is
 * then empty says so. */
export function gateTotals(data: Numbers, allowed?: Allowed): Numbers {
  const held = data.metrics.filter(restsOnTotal);
  if (!held.length) return data;
  const series = { ...data.series };
  const targets = { ...data.targets };
  const pending = { ...data.pending };
  const empty = new Set<number>();
  for (const m of held) {
    const given = (period: string) => Boolean(allowed?.(m.id, period));
    if (series[m.slug]) series[m.slug] = series[m.slug].filter((p) => given(p.period));
    if (targets[m.id] && m.total?.targets !== "own") targets[m.id] = targets[m.id].filter((p) => given(p.period));
    if (pending[m.id]) pending[m.id] = pending[m.id].filter(given);
    if (!series[m.slug]?.length) empty.add(m.id);
  }
  const metrics = data.metrics.map((m) => (m.total && empty.has(m.id) ? { ...m, total: { ...m.total, note: NOT_SHOWN } } : m));
  return { metrics, series, targets, pending };
}
