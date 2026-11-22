"use client";
// The comparison strip under a widget (GLOSSARY: Comparison, Attainment): one engine, one look everywhere.
import { compactValue, formatChange, formatValue, MINUS } from "@ziffr/core/format";
import { attainmentShown, attainmentText, COMPARE_LABEL, gapText, resolverFrom, summary, type CompareKey } from "@ziffr/core/compare";
import type { CanvasData, Metric } from "@ziffr/core/types";
import { attainmentMethodNote } from "@ziffr/core/attainment-method";
import { cn } from "@/lib/utils";
import { COLOUR_LEGEND } from "./target-chip";

export const DEFAULT_COMPARE: CompareKey[] = ["prev", "yoy"];

const SHORT: Record<CompareKey, string> = { ...COMPARE_LABEL, prev: "vs prev." };
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? MINUS : "±");
const arrow = (n: number) => (n > 0 ? "↗ " : n < 0 ? "↘ " : "→ ");

/** The attainment and comparisons under a widget's value. */
export function CompareStrip({ metric, data, keys = DEFAULT_COMPARE, full }: { metric: Metric; data: CanvasData; keys?: CompareKey[]; full?: boolean }) {
  if (!keys.length) return null;
  const s = summary(metric, resolverFrom(data.metrics, data.series), data.targets[metric.id], { keys, full, yearStart: data.yearStart, attainmentMethod: data.attainmentMethod });
  if (s.value === undefined) return null;
  const style = data.numberStyle;
  return (
    <div className="widget-text-xs flex flex-wrap items-baseline gap-x-[1em] gap-y-0.5 border-t border-border pt-[0.5em] leading-snug text-muted-foreground">
      {attainmentShown(s.attainment) ? (
        // The tooltip names the method, so the same number is never read two ways (spec 0022, #130).
        <span title={`Target ${formatValue(metric, s.target?.value ?? null, style)}${s.target?.fromSeries ? " from the target series" : ""}. ${attainmentMethodNote(s.method)}`}>
          <span className={cn("fig font-medium", s.onTarget ? "text-[var(--color-success)]" : "text-destructive")}>{attainmentText(s.attainment, style)}</span> of target
        </span>
      ) : s.gap !== null && (
        // Where the method has no percentage (a target of 0; by ratio also below 0), or it would be below 0 % and say
        // nothing a reader can use (#15), the difference to the target instead: "6.5 pts below target".
        <span title={`Target ${formatValue(metric, s.target?.value ?? null, style)}${s.target?.fromSeries ? " from the target series" : ""}`}>
          <span className={cn("fig font-medium", s.onTarget ? "text-[var(--color-success)]" : "text-destructive")}>{gapText(metric, s.gap, style)}</span>
        </span>
      )}
      {s.comparisons.map((c) =>
        c.available ? (
          // Direction is an arrow and a sign in the text colour; colour is kept for the target (see target-chip).
          <span key={c.key} title={`${c.currentSpan}: ${formatValue(metric, c.current, style)} vs ${c.previousSpan}: ${formatValue(metric, c.previous, style)}. ${COLOUR_LEGEND}`}>
            {SHORT[c.key]}{" "}
            <span className="fig font-medium text-[var(--color-ink-2)]">
              {arrow(c.pct ?? c.abs ?? 0)}{c.pct === null || c.pct === undefined ? `${sign(c.abs!)}${compactValue(metric, Math.abs(c.abs!), style)}` : formatChange(c.pct, style)}
            </span>
          </span>
        ) : (
          <span key={c.key} title={c.reason}>{SHORT[c.key]} <span className="fig">n/a</span></span>
        ),
      )}
    </div>
  );
}
