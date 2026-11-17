// Every comparison for a metric, with spans, values and changes (GLOSSARY: Comparison, Attainment).
import { formatValue } from "@ziffr/core/format";
import { comparisonsFor, summary, type Resolver } from "@ziffr/core/compare";
import type { Metric, Point } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { JANUARY, periodLabel } from "@ziffr/core/periods";

/** A metric's latest value, its target and attainment, and every comparison that fits its period. */
export function CompareTable({ metric, resolve, targets, full, compact }: { metric: Metric; resolve: Resolver; targets?: Point[]; full?: boolean; compact?: boolean }) {
  const s = summary(metric, resolve, targets, { keys: comparisonsFor(metric.period), full, yearStart: JANUARY });
  if (s.value === undefined) return <p className="text-sm text-muted-foreground">No values yet.</p>;
  // Changes carry a sign, not a colour: colour is kept for on or off target (see target-chip).
  const sign = (n: number) => (n > 0 ? "+" : "");
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <dl className="mb-3 grid grid-cols-3 gap-3">
        <div><dt className="text-xs text-muted-foreground">Value, {periodLabel(s.period!, metric.period, JANUARY, true)}</dt><dd className="fig font-medium">{formatValue(metric, s.value)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Target{s.target?.fromSeries ? " (series)" : ""}</dt><dd className="fig">{s.target?.value !== null && s.target?.value !== undefined ? formatValue(metric, s.target.value) : "–"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Attainment</dt><dd className={cn("fig font-medium", s.attainment !== null && (s.attainment >= 100 ? "text-[var(--color-success)]" : "text-destructive"))}>{s.attainment === null ? "–" : `${s.attainment.toFixed(1)}%`}</dd></div>
      </dl>
      <table className="w-full">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="pb-1.5 font-normal">Comparison</th><th className="pb-1.5 font-normal">Spans</th><th className="pb-1.5 text-right font-normal">Change</th><th className="pb-1.5 text-right font-normal">%</th></tr>
        </thead>
        <tbody>
          {s.comparisons.map((c) => (
            <tr key={c.key} className="border-t border-border align-top">
              <td className="py-1.5 font-medium">{c.label}</td>
              <td className="py-1.5 text-muted-foreground">
                {c.available ? <>{c.currentSpan} <span className="fig text-foreground">{formatValue(metric, c.current)}</span><br />vs {c.previousSpan} <span className="fig text-foreground">{formatValue(metric, c.previous)}</span></> : c.reason}
              </td>
              <td className="fig py-1.5 text-right">{c.available ? `${sign(c.abs!)}${formatValue(metric, c.abs)}` : "–"}</td>
              <td className="fig py-1.5 text-right">{c.available && c.pct !== null && c.pct !== undefined ? `${sign(c.pct)}${c.pct.toFixed(1)}%` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">{full ? "Full periods: the last complete span against the one before." : "To date: the current span so far against the same span before. YoY compares the same period a year earlier."}</p>
    </div>
  );
}
