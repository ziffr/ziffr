"use client";
// The scoreboard mark of a View Design (GLOSSARY: View Design, Comparison, Target Range): one table for several
// Metrics, a row each, in the order of the Slot. Every value, change and status is written by the core's functions
// (shownSeries, formatValue in the Number Style, compare, targetStatus through the target chip); this file only lays
// them out. Colour keeps its one meaning (on or off target, in the chip): a change is an arrow and a sign.
// It reaches no Metric outside the widget's own, as the person may see them.
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { compare, resolverFrom } from "@ziffr/core/compare";
import { dayAfter, heldText, isPartial, pointName, shownSeries, type DisplayPoint } from "@ziffr/core/display-periods";
import { compactValue, formatChange, formatValue, MINUS } from "@ziffr/core/format";
import { periodLabel } from "@ziffr/core/periods";
import type { Metric, Point } from "@ziffr/core/types";
import { SCOREBOARD } from "@ziffr/core/view-design";
import { TargetChip } from "@/components/target-chip";
import { Sparkline } from "./sparkline";
import type { DesignValues } from "./design-view";

/** A row's change against the previous period, written: the arrow's direction and the text after it. */
type Change = { dir: "up" | "down" | "flat"; text: string; title: string };

/** What one row says about its Metric, all of it from the core. */
type Row = { m: Metric; last: DisplayPoint | undefined; trend: Point[]; by: ReturnType<typeof shownSeries>["by"]; change: Change | null; why: string | null };

function rowOf(m: Metric, v: DesignValues): Row {
  const { data, settings } = v;
  const shown = shownSeries(m, data, undefined, { today: settings.asOf ? dayAfter(settings.asOf) : undefined });
  const last = shown.points[shown.points.length - 1];
  const trend = shown.points.slice(-v.win).map((p) => ({ period: p.period, value: p.value }));
  if (!last) return { m, last, trend, by: shown.by, change: null, why: null };
  // The comparison the strip under a number Widget calls "vs prev.": the same engine, so the two never disagree.
  const c = compare(m, resolverFrom(data.metrics, data.series), { keys: ["prev"], yearStart: data.yearStart })[0];
  const ns = data.numberStyle;
  if (!c?.available) return { m, last, trend, by: shown.by, change: null, why: c?.reason ?? null };
  const delta = c.pct ?? c.abs ?? 0;
  const text = c.pct === null || c.pct === undefined ? `${c.abs! > 0 ? "+" : c.abs! < 0 ? MINUS : "±"}${compactValue(m, Math.abs(c.abs!), ns)}` : formatChange(c.pct, ns);
  return {
    m, last, trend, by: shown.by, why: null,
    change: { dir: delta > 0 ? "up" : delta < 0 ? "down" : "flat", text, title: `${c.currentSpan}: ${formatValue(m, c.current, ns)} against ${c.previousSpan}: ${formatValue(m, c.previous, ns)}` },
  };
}

/** One table of several Metrics: name, latest value, change, target status and a small trend. */
export function ScoreboardMark({ v }: { v: DesignValues }) {
  const { metrics, data } = v;
  const ns = data.numberStyle;
  if (metrics.length < SCOREBOARD.min || metrics.length > SCOREBOARD.max)
    return <Words>{metrics.length < SCOREBOARD.min ? `A scoreboard needs ${SCOREBOARD.min} to ${SCOREBOARD.max} Metrics and this has ${metrics.length}. Number Widgets show so few better.` : `A scoreboard shows ${SCOREBOARD.min} to ${SCOREBOARD.max} Metrics and this has ${metrics.length}. More cannot be taken in at a glance: pick fewer.`}</Words>;
  const rows = metrics.map((m) => rowOf(m, v));
  // Metrics whose latest period is not the newest one say which they are, so rows never read as one moment by accident.
  const newest = rows.reduce((a, r) => (r.last && r.last.period > a ? r.last.period : a), "");
  return (
    <div className={v.roomy ? "flex min-h-0 flex-1 flex-col justify-center overflow-auto" : "min-h-0 flex-1 overflow-auto"}>
      <table className="widget-text-sm w-full">
        <caption className="sr-only">{`Scoreboard of ${rows.length} Metrics: latest value, change against the previous period, target status and trend.`}</caption>
        <thead className="widget-text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-1 text-left font-normal">Metric</th>
            <th scope="col" className="pb-1 text-right font-normal">Latest</th>
            <th scope="col" className="pb-1 text-right font-normal">Change</th>
            <th scope="col" className="pb-1 pl-2 text-left font-normal">Target</th>
            <th scope="col" className="pb-1 pl-2 text-left font-normal">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, last, trend, by, change, why }, i) => {
            if (!last)
              return (
                <tr key={`${m.id}-${i}`} className="border-t border-border">
                  <th scope="row" className="py-[0.43em] pr-2 text-left font-medium">{m.name}</th>
                  <td colSpan={4} className="py-[0.43em] text-muted-foreground">No values yet</td>
                </tr>
              );
            const when = last.toDate || isPartial(last) ? `${periodLabel(last.period, by, data.yearStart, true)}, ${heldText(last, m.period)}` : last.period !== newest ? pointName(last, by, m.period, data.yearStart) : null;
            return (
              <tr key={`${m.id}-${i}`} className="border-t border-border align-middle">
                <th scope="row" className="max-w-[10em] py-[0.43em] pr-2 text-left font-medium">
                  <span className="block truncate" title={m.name}>{m.name}</span>
                  {when && <span className="widget-text-xs block truncate font-normal text-muted-foreground" title={pointName(last, by, m.period, data.yearStart)}>{when}</span>}
                </th>
                <td className="fig py-[0.43em] text-right whitespace-nowrap">{formatValue(m, last.value, ns)}</td>
                <td className="py-[0.43em] text-right whitespace-nowrap">
                  {change ? (
                    // Direction is an arrow and a sign in the text colour; colour is kept for the target (see target-chip).
                    <span className="inline-flex items-center gap-0.5 text-[var(--color-ink-2)]" title={change.title}>
                      {change.dir === "up" ? <ArrowUpRight aria-hidden className="size-[1em]" /> : change.dir === "down" ? <ArrowDownRight aria-hidden className="size-[1em]" /> : <ArrowRight aria-hidden className="size-[1em]" />}
                      <span className="fig">{change.text}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground" title={why ?? undefined}>–</span>
                  )}
                </td>
                <td className="py-[0.43em] pl-2"><TargetChip metric={m} value={last.value} numberStyle={ns} /></td>
                <td className="w-[28%] min-w-12 py-[0.43em] pl-2">
                  {trend.length > 1 ? (
                    <span role="img" aria-label={`${m.name}: ${formatValue(m, trend[0].value, ns)} to ${formatValue(m, last.value, ns)} over ${trend.length} periods`} className="block">
                      <Sparkline points={trend} height="1.6em" />
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Words({ children }: { children: string }) {
  return <p className="widget-text-xs mt-0.5 p-4 text-center text-muted-foreground">{children}</p>;
}
