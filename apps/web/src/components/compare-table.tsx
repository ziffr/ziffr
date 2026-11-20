// Every comparison for a metric, with spans, values and changes (GLOSSARY: Comparison, Attainment).
import { formatChange, formatValue } from "@ziffr/core/format";
import { attainmentShown, attainmentText, comparisonsFor, gapText, summary, type Resolver } from "@ziffr/core/compare";
import type { NumberStyle } from "@ziffr/core/number-style";
import { attainmentMethodNote, type AttainmentMethod } from "@ziffr/core/attainment-method";
import type { Metric, Point } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { periodLabel, type YearStart } from "@ziffr/core/periods";

/** A metric's latest value, its target and attainment, and every comparison that fits its period. */
export function CompareTable({ metric, resolve, targets, full, compact, yearStart, numberStyle: style, attainmentMethod }: { metric: Metric; resolve: Resolver; targets?: Point[]; full?: boolean; compact?: boolean; yearStart: YearStart; numberStyle: NumberStyle; attainmentMethod: AttainmentMethod }) {
  const s = summary(metric, resolve, targets, { keys: comparisonsFor(metric.period), full, yearStart, attainmentMethod });
  if (s.value === undefined) return <p className="text-sm text-muted-foreground">No values yet.</p>;
  // Changes carry a sign, not a colour: colour is kept for on or off target (see target-chip).
  const sign = (n: number) => (n > 0 ? "+" : "");
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <dl className="mb-3 grid grid-cols-3 gap-3">
        <div><dt className="text-xs text-muted-foreground">Value, {periodLabel(s.period!, metric.period, yearStart, true)}</dt><dd className="fig font-medium">{formatValue(metric, s.value, style)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Target{s.target?.fromSeries ? " (series)" : ""}</dt><dd className="fig">{s.target?.value !== null && s.target?.value !== undefined ? formatValue(metric, s.target.value, style) : "–"}</dd></div>
        <div title={attainmentMethodNote(s.method)}><dt className="text-xs text-muted-foreground">Attainment</dt><dd className={cn("fig font-medium", s.onTarget !== null && (s.onTarget ? "text-[var(--color-success)]" : "text-destructive"))}>{attainmentShown(s.attainment) ? attainmentText(s.attainment, style, 1) : s.gap !== null ? gapText(metric, s.gap, style) : "–"}</dd></div>
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
                {c.available ? <>{c.currentSpan} <span className="fig whitespace-nowrap text-foreground">{formatValue(metric, c.current, style)}</span><br />vs {c.previousSpan} <span className="fig whitespace-nowrap text-foreground">{formatValue(metric, c.previous, style)}</span></> : c.reason}
              </td>
              <td className="fig whitespace-nowrap py-1.5 pl-2 text-right">{c.available ? `${sign(c.abs!)}${formatValue(metric, c.abs, style)}` : "–"}</td>
              <td className="fig whitespace-nowrap py-1.5 pl-2 text-right">{c.available ? formatChange(c.pct, style) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">{full ? "Full periods: the last complete span against the one before." : "To date: the current span so far against the same span before. YoY compares the same period a year earlier."}</p>
    </div>
  );
}
